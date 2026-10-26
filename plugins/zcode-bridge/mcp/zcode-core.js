// zcode-bridge 核心库 —— 桥接已安装 ZCode 桌面版
//
// 传输：spawn `zcode.cjs app-server --stdio --surface desktop`，
//       stdout = ZCode Protocol NDJSON 帧（官方协议，无握手，首帧即 request）。
//
// 会话可见性契约（实测打通，见 memory zcode-installed-session-access）：
//   - spawn 用 --cwd <workspacePath>
//   - session/create 不传 workspaceIdentity → 落盘时 workspace_id=null
//   - send 触发真实模型轮 → 落盘 db.sqlite（directory=workspacePath）
//   - 桌面 Host 下次订阅 sessions-index 冷启动时以 db.sqlite 为种子收编 → 桌面可见
//   本插件无需写 tasks-index。
//
// 服务型使用：createSession 会保持子进程存活（后台常驻），供后续 send/resume 复用；
// 会话结束后调用 dispose() 关闭子进程。
//
// 对话扩展（2026-10-26 实测）：
//   - 继续对话 = session/resume（激活历史会话）→ session/subscribe →
//     session/send。冷启动后历史会话不在活跃表，直接 subscribe/send 得
//     "Session is not active"，必须 resume 先行。
//   - 流式事件经 notification `session/event` 推送（deliveryKind 对应订阅参数），
//     payload 按字段区分：`delta`（文本增量，assistantMessageId+done）、
//     `content`+`stopReason`（回合完成）、`turnNumber`+`input`（turn 开始）等。
//     本类归一化为 { seq, kind, payload } 顺序缓冲，供面板轮询消费。
'use strict';

const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');
const os = require('node:os');

// ── 默认路径（可被 env 覆盖，便于测试/多版本）──────────────────────────────
const DEFAULT_ZCODE_CJS = process.env.ZCODE_CJS || 'D:/app/ZCode/resources/glm/zcode.cjs';
const DEFAULT_PROVIDER_CONFIG_GLOB =
  process.env.ZCODE_PROVIDER_CONFIG ||
  path.join(os.homedir(), '.zcode', 'v2', 'runtime', 'provider', 'windows-x86_64', '3.16.3', 'endpoint-*', 'zcode-builtin.json');

// ── 最小运行时偏好应答（server 反向 request，15s 内不回则 create 失败）──────
function defaultRuntimePreferences() {
  return {
    additionalDirectories: [],
    nativeSearchEnhancementsEnabled: false,
    askUserQuestionAutoResolutionEnabled: false,
    memoryEnabled: false,
    toolSearchMode: 'off',
  };
}

/**
 * 查找最新的 provider 配置（zcode-builtin.json）。
 * glob 支持单段通配（endpoint-*）。找不到返回 null。
 */
function resolveProviderConfig(globPattern = DEFAULT_PROVIDER_CONFIG_GLOB) {
  const fs = require('node:fs');
  const dirGlob = globPattern.replace(/\\/g, '/');
  const segments = dirGlob.split('/');
  const endpointIdx = segments.findIndex((s) => s === 'endpoint-*');
  if (endpointIdx === -1) return null;
  const baseDir = segments.slice(0, endpointIdx).join('/');
  const suffix = segments.slice(endpointIdx + 1).join('/');
  const dirs = fs.existsSync(baseDir) ? fs.readdirSync(baseDir) : [];
  const endpoint = dirs
    .filter((d) => d.startsWith('endpoint-'))
    .sort()
    .reverse()[0];
  if (!endpoint) return null;
  const full = path.join(baseDir, endpoint, suffix);
  return fs.existsSync(full) ? full : null;
}

/** ZCode Protocol NDJSON 客户端（一进程一实例）。 */
class ZCodeClient {
  /**
   * @param {object} opts
   * @param {string} opts.workspacePath  会话归属的工作区路径（--cwd 且 create 的 workspacePath）
   * @param {string} [opts.zcodeCjs]     zcode.cjs 绝对路径
   * @param {string} [opts.providerConfigFile] zcode-builtin.json 路径（缺省自动探测）
   * @param {boolean} [opts.autoSpawn]   构造时立即 spawn（默认 true）
   * @param {number} [opts.requestTimeoutMs] 单请求超时（默认 45s，模型轮可能慢）
   */
  constructor({ workspacePath, zcodeCjs, providerConfigFile, autoSpawn = true, requestTimeoutMs = 45000 }) {
    this.workspacePath = workspacePath;
    this.zcodeCjs = zcodeCjs || DEFAULT_ZCODE_CJS;
    this.providerConfigFile = providerConfigFile || resolveProviderConfig();
    this.requestTimeoutMs = requestTimeoutMs;
    this.child = null;
    this.rl = null;
    this._nextId = 1;
    this._pending = new Map();
    this._notifications = [];
    this._exited = false;
    // ── 对话支持（2026-10-26）──────────────
    this._eventSeq = 0;          // 事件序号（单调递增，跨轮收敛）
    this._eventBuffer = [];      // [{ seq, kind, payload, ts }]
    this._eventCallbacks = [];   // push 时通知（server.js 注册，用于即时落盘）
    this._subscribedSessionId = null; // 当前订阅的 sessionId
    if (autoSpawn) this.spawn();
  }

  spawn() {
    if (this.child) return;
    const args = ['app-server', '--stdio', '--surface', 'desktop'];
    const env = { ...process.env };
    if (this.providerConfigFile) {
      env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE = this.providerConfigFile;
    }
    this.child = spawn('node', [this.zcodeCjs, ...args], {
      cwd: this.workspacePath,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this._exited = false;
    const rl = (this.rl = readline.createInterface({ input: this.child.stdout }));
    rl.on('line', (line) => {
      if (!line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }

      // server 反向 request（id+method，无 result/error）→ 必须响应
      if (msg.id != null && typeof msg.method === 'string') {
        this._handleReverseRequest(msg);
        return;
      }
      if (msg.id != null && (msg.result !== undefined || msg.error !== undefined)) {
        const cb = this._pending.get(String(msg.id));
        if (cb) { this._pending.delete(String(msg.id)); cb(msg); }
        return;
      }
      if (msg.method) {
        this._handleNotification(msg);
      }
    });
    this.child.stderr.on('data', (d) => {
      const s = d.toString().trim();
      if (s) this._notifications.push({ kind: 'stderr', text: s.slice(0, 500) });
    });
    this.child.on('exit', (code, signal) => {
      this._exited = true;
      const err = new Error(`zcode app-server 退出 code=${code} signal=${signal}`);
      for (const [id, cb] of this._pending) { cb({ id, error: { code: -32000, message: err.message } }); }
      this._pending.clear();
    });
  }

  _handleReverseRequest(req) {
    let reply;
    if (req.method === 'session/requestRuntimePreferences') {
      reply = { id: req.id, result: defaultRuntimePreferences() };
    } else {
      reply = { id: req.id, error: { code: -32601, message: `zcode-bridge 不支持 reverse 请求: ${req.method}` } };
    }
    this.child.stdin.write(JSON.stringify(reply) + '\n');
  }

  /**
   * 事件通知分流（对话支持）。
   * 核心：`session/event` 是订阅后的增量事件载体，payload 按字段区分种类。
   * 归一化后入 `_eventBuffer`（顺序、带 seq），供轮询/即刻消费。
   */
  _handleNotification(msg) {
    // session/event —— 订阅会话的事件流（流式增量 / turn 生命周期 / 完整回合）
    if (msg.method === 'session/event') {
      const pal = msg.params && msg.params.payload;
      if (!pal || typeof pal !== 'object') return;
      let kind = 'misc';
      if (typeof pal.delta === 'string') {
        kind = pal.done ? 'text-final' : 'text-delta';
      } else if (typeof pal.content === 'string' || pal.stopReason != null) {
        kind = 'turn-complete';
      } else if (pal.turnNumber != null && pal.input != null) {
        kind = 'turn-started';
      }
      const evt = { seq: ++this._eventSeq, kind, payload: pal, ts: Date.now() };
      this._eventBuffer.push(evt);
      // cap 缓冲防无限增长（保留最近 2000 条；正常一轮 <50 条）
      if (this._eventBuffer.length > 2000) this._eventBuffer.splice(0, this._eventBuffer.length - 2000);
      for (const cb of this._eventCallbacks) { try { cb(evt); } catch {} }
      return;
    }
    // 其它通知（telemetry/mcp/state 等）保持原样收集，不打扰对话流
    this._notifications.push(msg);
  }

  /** 发送请求帧，返回 {result} 或 {error}。 */
  request(method, params) {
    if (!this.child || this._exited) throw new Error('zcode app-server 未运行');
    const id = 'r' + this._nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`zcode request 超时: ${method}`));
      }, this.requestTimeoutMs);
      this._pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
      const frame = { id, method };
      if (params !== undefined) frame.params = params;
      this.child.stdin.write(JSON.stringify(frame) + '\n');
    });
  }

  // ── 对话方法（2026-10-26）──────────────────────────────────────────────

  /** 订阅会话事件流（此后 session/send 的增量经 _eventBuffer 顺序到达）。 */
  async subscribe(sessionId, { includeSnapshot = false, afterSeq } = {}) {
    const resp = await this.request('session/subscribe', {
      sessionId,
      deliveryKind: 'web-remote-replayable',
      ...(afterSeq != null ? { afterSeq } : {}),
      includeSnapshot,
    });
    if (resp.error) throw new Error(`订阅会话失败: ${resp.error.message || resp.error} (${resp.error.code})`);
    this._subscribedSessionId = sessionId;
    return resp.result;
  }

  /** 激活历史会话（继续对话必须先 resume，冷启动后才可 subscribe/send）。 */
  async resume(sessionId, workspacePath = this.workspacePath) {
    const resp = await this.request('session/resume', {
      sessionId,
      workspace: { workspacePath, workspaceKey: workspacePath },
    });
    if (resp.error) throw new Error(`续接会话失败: ${resp.error.message || resp.error} (${resp.error.code})`);
    return resp.result;
  }

  /** 发送消息（需先 subscribe 才能拿到增量事件）。返回 { accepted, sessionId, stateRevision }。 */
  async sendMessage(sessionId, content) {
    const resp = await this.request('session/send', { sessionId, content });
    if (resp.error) throw new Error(`发送失败: ${resp.error.message || resp.error} (${resp.error.code})`);
    return resp.result || {};
  }

  /** 读取事件缓冲中 seq > cursor 的增量（面板轮询用，cursor=-1 全量）。 */
  drainEvents(cursor = -1) {
    const out = this._eventBuffer.filter((e) => e.seq > cursor);
    return { cursor: this._eventSeq, events: out };
  }

  /** 注册事件回调（server.js 即时落盘/管道转发用）。返回取消函数。 */
  onEvent(cb) {
    this._eventCallbacks.push(cb);
    return () => {
      const i = this._eventCallbacks.indexOf(cb);
      if (i >= 0) this._eventCallbacks.splice(i, 1);
    };
  }

  /** 当前订阅的 sessionId。 */
  subscribedSession() { return this._subscribedSessionId; }

  /**
   * 最近一次会话事件的模型信息（S2 模型展示用）。
   * 来自 session/event 的 misc 帧（modelId/providerId），无则返回 null。
   */
  sessionModel() {
    if (!this._subscribedSessionId) return null
    for (let i = this._eventBuffer.length - 1; i >= 0; i--) {
      const e = this._eventBuffer[i]
      const pal = e.payload || {}
      if (pal.modelId) return { providerId: pal.providerId || '', modelId: pal.modelId }
    }
    return null
  }

  /** 已收到的 notification（含 stderr 行）快照。 */
  notifications() { return this._notifications.slice(); }

  /** 优雅关闭子进程。 */
  async dispose() {
    if (this.child && !this._exited) {
      this.child.stdin.end();
      await new Promise((r) => {
        const t = setTimeout(() => { this.child.kill(); r(); }, 1000);
        this.child.on('exit', () => { clearTimeout(t); r(); });
      });
    }
    this.child = null;
  }
}

/** 直接查询 ~/.zcode/cli/db/db.sqlite 会话表（只读）。 */
function queryDbSessions({ dbPath = path.join(os.homedir(), '.zcode', 'cli', 'db', 'db.sqlite'), limit = 20 } = {}) {  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db
      .prepare(
        `SELECT id, title, task_type, workspace_id, directory, time_created, time_updated
         FROM session ORDER BY time_updated DESC LIMIT ?`
      )
      .all(limit);
    db.close();
    return rows.map((r) => ({
      sessionId: r.id,
      title: r.title || '',
      taskType: r.task_type || '',
      workspaceId: r.workspace_id || '',
      directory: r.directory || '',
      timeCreated: r.time_created || '',
      timeUpdated: r.time_updated || '',
    }));
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

module.exports = { ZCodeClient, resolveProviderConfig, defaultRuntimePreferences, queryDbSessions };