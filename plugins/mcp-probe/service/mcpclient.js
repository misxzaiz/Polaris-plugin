'use strict';
/**
 * mcpclient.js —— 零依赖 MCP 客户端（stdio 换行 JSON-RPC + streamable HTTP）
 *
 * 设计要点（与 spec 对齐）：
 * - 连接唯一所有者是服务进程；本模块无全局状态，一个实例 = 一条连接。
 * - stdio：MCP 规范的换行分隔 JSON-RPC；Buffer 累积按 \n 切（多字节 UTF-8 跨 chunk 安全）。
 * - http：streamable HTTP（POST JSON-RPC；响应可能是 application/json 或 text/event-stream，
 *   两者都要支持）；Mcp-Session-Id 回显；会话关闭 best-effort DELETE。
 * - 服务器→客户端的请求（ping / sampling / roots）：ping 回空结果，其余 -32601 拒绝——
 *   调试台是观察者，不冒充宿主提供能力。
 * - 调用超时后 stdio 连接状态不可信：杀子进程、标记 poisoned，要求重连（幂等边界：
 *   超时不产生双写，pending 全部拒绝）。
 * - spawn 走 probe-core.buildSpawnPlan（win32 .cmd shim 经 cmd.exe），direct ENOENT 降级重试一次。
 */
const { spawn } = require('child_process');
const { buildSpawnPlan } = require('../shared/probe-core');

const CLIENT_INFO = { name: 'polaris-mcp-probe', version: '0.1.0' };
const PROTOCOL_VERSION = '2025-06-18';

class McpRpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.mcpData = data;
  }
}

/** 生成一个从未用过的请求 id（单连接内自增即可） */
function makeIdAllocator() {
  let n = 0;
  return () => ++n;
}

/* ------------------------------------------------------------------ */
/* stdio 传输                                                          */
/* ------------------------------------------------------------------ */

class StdioTransport {
  /**
   * @param profile {{command:string,args?:string[],env?:Object,cwd?:string}}
   * @param hooks {{log:(level,msg)=>void, onServerRequest?:(msg)=>Object|undefined}}
   */
  constructor(profile, hooks) {
    this.profile = profile;
    this.log = hooks.log || (() => {});
    this.child = null;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map(); // id -> {resolve, reject, timer}
    this.allocId = makeIdAllocator();
    this.exitInfo = null; // {code, signal} 或 {error}
  }

  start() {
    const plan = buildSpawnPlan(this.profile.command, this.profile.args || [], process.platform);
    const env = { ...process.env, ...(this.profile.env || {}) };
    const spawnOpts = {
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    };
    if (this.profile.cwd) spawnOpts.cwd = this.profile.cwd;

    const startOnce = (p) => new Promise((resolve, reject) => {
      let child;
      try {
        child = p.mode === 'shell'
          ? spawn(p.commandline, { ...spawnOpts, shell: true })
          : spawn(p.file, p.args, spawnOpts);
      } catch (e) {
        reject(e);
        return;
      }
      // spawn 的 ENOENT 走 error 事件而不是同步 throw，等第一拍再判定
      let started = false;
      const onErr = (e) => {
        if (!started) { started = true; reject(e); }
      };
      child.once('error', onErr);
      setImmediate(() => {
        if (!started) { started = true; child.removeListener('error', onErr); resolve(child); }
      });
    });

    return startOnce(plan).catch((e) => {
      const enoent = e && (e.code === 'ENOENT' || /ENOENT/.test(String(e.message)));
      if (enoent && plan.mode === 'direct') {
        // 直启失败（PATH 里只有 .cmd shim 等）→ 降级经 cmd.exe 重试一次
        this.log('warn', `direct spawn 失败（${e.message}），降级 cmd.exe 重试`);
        return startOnce({ mode: 'shell', commandline: [this.profile.command, ...(this.profile.args || [])].join(' ') });
      }
      throw e;
    }).then((child) => {
      this.child = child;
      child.stdout.on('data', (chunk) => this.onData(chunk));
      child.stderr.on('data', (chunk) => {
        const s = chunk.toString('utf8');
        this.log('debug', `[server-stderr] ${s.trim().slice(0, 500)}`);
      });
      child.on('exit', (code, signal) => {
        this.exitInfo = { code, signal };
        this.failAllPending(new Error(`MCP 服务器进程退出（code=${code} signal=${signal}）`));
      });
      child.on('error', (e) => {
        this.exitInfo = { error: e.message };
        this.failAllPending(new Error(`MCP 服务器进程错误: ${e.message}`));
      });
      return child;
    });
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let idx;
    while ((idx = this.buffer.indexOf(0x0A)) >= 0) {
      const lineBuf = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      const line = lineBuf.toString('utf8').replace(/\r$/, '').trim();
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (e) {
        this.log('warn', `非 JSON 输出行（丢弃）: ${line.slice(0, 200)}`);
        continue;
      }
      this.handleMessage(msg);
    }
  }

  handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.id === undefined || msg.id === null) {
      // 通知：调试台不响应，记日志
      this.log('debug', `[notify] ${String(msg.method || '?')}`);
      return;
    }
    if (msg.method) {
      // 服务器→客户端请求：只答 ping，其余 -32601
      const id = msg.id;
      if (msg.method === 'ping') {
        this.rawSend({ jsonrpc: '2.0', id, result: {} }).catch(() => {});
      } else {
        this.rawSend({
          jsonrpc: '2.0', id,
          error: { code: -32601, message: `mcp-probe 不支持客户端能力 "${msg.method}"（观察者模式）` },
        }).catch(() => {});
      }
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) {
      this.log('warn', `收到未匹配 id=${msg.id} 的响应（丢弃）`);
      return;
    }
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new McpRpcError(msg.error.code, msg.error.message || 'MCP 错误', msg.error.data));
    else p.resolve(msg.result);
  }

  rawSend(obj) {
    if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
      return Promise.reject(new Error('stdio 未连接'));
    }
    return new Promise((resolve, reject) => {
      this.child.stdin.write(JSON.stringify(obj) + '\n', 'utf8', (e) => (e ? reject(e) : resolve()));
    });
  }

  request(method, params, timeoutMs) {
    if (!this.child) return Promise.reject(new Error('stdio 未启动'));
    const id = this.allocId();
    const msg = { jsonrpc: '2.0', id, method, params: params || {} };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时（${timeoutMs}ms）——连接状态不可信，请重连`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.rawSend(msg).catch((e) => {
        if (this.pending.has(id)) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(e);
        }
      });
    });
  }

  failAllPending(err) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  async close() {
    if (!this.child) return;
    const c = this.child;
    this.child = null;
    this.failAllPending(new Error('连接已关闭'));
    try { c.stdin.end(); } catch (_) { /* ignore */ }
    try { c.kill(); } catch (_) { /* ignore */ }
    if (process.platform === 'win32') {
      // cmd shim 场景 kill 只杀 cmd 不杀孙进程 → 兜底 taskkill /T
      setTimeout(() => {
        try {
          if (c.pid && c.exitCode === null && !c.killed) {
            spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { windowsHide: true });
          }
        } catch (_) { /* ignore */ }
      }, 1500).unref();
    }
  }
}

/* ------------------------------------------------------------------ */
/* streamable HTTP 传输                                                */
/* ------------------------------------------------------------------ */

class HttpTransport {
  /**
   * @param profile {{url:string, headers?:Object, timeoutMs?:number}}
   * @param hooks {{log:(level,msg)=>void}}
   */
  constructor(profile, hooks) {
    this.profile = profile;
    this.log = hooks.log || (() => {});
    this.sessionId = '';
    this.protocolVersion = PROTOCOL_VERSION;
    this.allocId = makeIdAllocator();
  }

  baseHeaders() {
    const h = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...(this.profile.headers || {}),
    };
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId;
    if (this.initialized) h['MCP-Protocol-Version'] = this.protocolVersion;
    return h;
  }

  /**
   * 发一个 JSON-RPC 请求并等待同 id 响应。
   * 响应三种形态：application/json 单响应 / text/event-stream 流 / 202 无体（通知）。
   */
  async post(body, timeoutMs, waitForId) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(this.profile.url, {
        method: 'POST',
        headers: this.baseHeaders(),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const sid = res.headers.get('mcp-session-id');
      if (sid) this.sessionId = sid;
      if (res.status === 202) return null;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300) || '(无响应体)'}`);
      }
      const ctype = String(res.headers.get('content-type') || '');
      if (ctype.includes('text/event-stream')) {
        return await this.readSse(res, waitForId, timeoutMs);
      }
      const text = await res.text();
      if (!text.trim()) return null;
      let msg;
      try { msg = JSON.parse(text); } catch (_) {
        throw new Error(`响应非 JSON（content-type=${ctype || 'none'}）: ${text.slice(0, 200)}`);
      }
      return this.takeResponse(msg, waitForId);
    } finally {
      clearTimeout(timer);
    }
  }

  /** 逐 chunk 解析 SSE，拿到匹配 id 的响应即返回（流内其余消息如实记日志） */
  async readSse(res, waitForId, timeoutMs) {
    const reader = res.body && res.body.getReader ? res.body.getReader() : null;
    if (!reader) return null;
    const decoder = new TextDecoder();
    const { parseSseMessages } = require('../shared/probe-core');
    let acc = '';
    const deadline = Date.now() + timeoutMs;
    try {
      for (;;) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`SSE 流等待响应超时（${timeoutMs}ms）`);
        const { done, value } = await Promise.race([
          reader.read(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('SSE 读取超时')), remaining)),
        ]);
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const msgs = parseSseMessages(acc);
        if (msgs.length) {
          acc = ''; // 已消费
          for (const m of msgs) {
            const r = this.takeResponse(m, waitForId);
            if (r !== undefined) return r;
          }
        }
      }
    } finally {
      try { reader.releaseLock(); } catch (_) { /* ignore */ }
    }
    return null;
  }

  /** 分类处理一条消息：响应（匹配→resolve）、服务器请求（拒绝）、通知（忽略） */
  takeResponse(msg, waitForId) {
    if (!msg || typeof msg !== 'object') return undefined;
    if (msg.raw !== undefined) {
      this.log('warn', `SSE 非协议载荷: ${String(msg.raw).slice(0, 200)}`);
      return undefined;
    }
    if (msg.id === undefined || msg.id === null) {
      this.log('debug', `[notify] ${String(msg.method || '?')}`);
      return undefined;
    }
    if (msg.method) {
      // 服务器请求随流而来：无法在本连接回包的以错误记录（streamable HTTP 需另发 POST 回应）
      this.log('warn', `服务器请求 "${msg.method}" 在流中到达（调试台不代答）`);
      return undefined;
    }
    if (Number(msg.id) !== Number(waitForId)) {
      this.log('warn', `收到未匹配 id=${msg.id} 的响应（丢弃）`);
      return undefined;
    }
    if (msg.error) throw new McpRpcError(msg.error.code, msg.error.message || 'MCP 错误', msg.error.data);
    return msg.result === undefined ? null : msg.result;
  }

  request(method, params, timeoutMs) {
    const id = this.allocId();
    return this.post({ jsonrpc: '2.0', id, method, params: params || {} }, timeoutMs, id)
      .then((r) => {
        if (r === null || r === undefined) throw new Error(`${method} 无响应（202/空流）`);
        return r;
      });
  }

  notify(method, params) {
    return this.post({ jsonrpc: '2.0', method, params: params || {} }, Math.min(this.profile.timeoutMs || 10000, 10000), null);
  }

  async close() {
    if (!this.sessionId) return;
    const sid = this.sessionId;
    this.sessionId = '';
    try {
      await fetch(this.profile.url, {
        method: 'DELETE',
        headers: { 'Mcp-Session-Id': sid, ...(this.profile.headers || {}) },
        signal: AbortSignal.timeout(3000),
      });
    } catch (_) { /* 会话清理 best-effort */ }
  }
}

/* ------------------------------------------------------------------ */
/* 统一连接门面                                                        */
/* ------------------------------------------------------------------ */

const DEFAULT_INIT_TIMEOUT = 15000;
const DEFAULT_CALL_TIMEOUT = 30000;

/**
 * 创建并托管一条 MCP 连接。
 * 生命周期：start()（spawn/探测）→ initialize()（握手+拉工具清单）→ callTool()/listTools() → close()
 */
class McpConnection {
  constructor(profile, hooks) {
    this.profile = profile || {};
    this.log = (hooks && hooks.log) || (() => {});
    this.status = 'idle'; // idle|connecting|ready|error|closed
    this.lastError = '';
    this.serverInfo = null;
    this.protocolVersion = '';
    this.capabilities = null;
    this.tools = [];
    this.resources = [];
    this.prompts = [];
    this.connectedAt = 0;
    this.lastUsedAt = 0;
    this.poisoned = false;
    this.transport = this.profile.transport === 'http'
      ? new HttpTransport(this.profile, { log: this.log })
      : new StdioTransport(this.profile, { log: this.log });
  }

  get isHttp() { return this.profile.transport === 'http'; }

  async start() {
    if (this.isHttp) {
      if (!/^https?:\/\//i.test(String(this.profile.url || ''))) {
        throw new Error(`http 档案需要合法 url: ${this.profile.url}`);
      }
      return null; // http 无子进程
    }
    if (!String(this.profile.command || '').trim()) {
      throw new Error('stdio 档案需要 command');
    }
    this.status = 'connecting';
    return this.transport.start();
  }

  async rpc(method, params, timeoutMs) {
    this.lastUsedAt = Date.now();
    return this.transport.request(method, params, timeoutMs);
  }

  /** 握手 + 拉取工具/资源/提示清单（资源与提示失败不致命，记录为空） */
  async initialize(initTimeoutMs) {
    this.status = 'connecting';
    const t0 = Date.now();
    let result;
    try {
      result = await this.rpc('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      }, initTimeoutMs || DEFAULT_INIT_TIMEOUT);
    } catch (e) {
      this.status = 'error';
      this.lastError = e.message;
      throw e;
    }
    this.initLatencyMs = Date.now() - t0;
    this.protocolVersion = (result && result.protocolVersion) || '';
    this.serverInfo = (result && result.serverInfo) || null;
    this.capabilities = (result && result.capabilities) || null;
    if (!this.isHttp) await this.transport.rawSend({ jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => {});
    else await this.transport.notify('notifications/initialized', {}).catch(() => {});
    this.initialized = true;

    const tools = await this.rpc('tools/list', {}, initTimeoutMs || DEFAULT_INIT_TIMEOUT).catch((e) => {
      this.log('warn', `tools/list 失败: ${e.message}`);
      return null;
    });
    this.tools = tools && Array.isArray(tools.tools) ? tools.tools : [];
    const resources = await this.rpc('resources/list', {}, 8000).catch(() => null);
    this.resources = resources && Array.isArray(resources.resources) ? resources.resources : [];
    const prompts = await this.rpc('prompts/list', {}, 8000).catch(() => null);
    this.prompts = prompts && Array.isArray(prompts.prompts) ? prompts.prompts : [];

    this.status = 'ready';
    this.connectedAt = Date.now();
    return {
      initLatencyMs: this.initLatencyMs,
      protocolVersion: this.protocolVersion,
      serverInfo: this.serverInfo,
      capabilities: this.capabilities,
      tools: this.tools,
      resources: this.resources,
      prompts: this.prompts,
    };
  }

  /** 一次完整连接：start + initialize */
  async connect(initTimeoutMs) {
    await this.start();
    return this.initialize(initTimeoutMs);
  }

  listTools(timeoutMs) {
    return this.rpc('tools/list', {}, timeoutMs || DEFAULT_CALL_TIMEOUT).then((r) => (r && Array.isArray(r.tools) ? r.tools : []));
  }

  async callTool(name, args, timeoutMs) {
    if (this.poisoned) throw new Error('连接已因超时被判定不可信，请重连后再调用');
    this.lastUsedAt = Date.now();
    try {
      const result = await this.rpc('tools/call', { name, arguments: args || {} }, timeoutMs || DEFAULT_CALL_TIMEOUT);
      return result;
    } catch (e) {
      const timeoutLike = /超时/.test(e.message);
      if (!this.isHttp && timeoutLike) {
        // stdio 超时：无法确认服务器是否已执行/还会输出什么——按幂等边界直接杀掉
        this.poisoned = true;
        this.status = 'error';
        this.lastError = e.message;
        await this.close().catch(() => {});
      }
      throw e;
    }
  }

  async close() {
    this.status = 'closed';
    await this.transport.close();
  }
}

module.exports = { McpConnection, McpRpcError, CLIENT_INFO, PROTOCOL_VERSION, StdioTransport, HttpTransport };
