'use strict';
/**
 * server.js —— browser-desk MCP Server（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。AI 工具面以 desk_ 前缀与内置
 * polaris-browser 的 browser_* 工具并存避让（共存期零歧义）。
 *
 * 通道：stdio → 本文件 → HTTP 127.0.0.1:<servicePort>/dispatch → engine
 * 服务端口自发现（与 ai-scheduler kvclient 同款三级策略）：
 *   1. env BROWSER_DESK_SERVICE_PORT（显式注入）
 *   2. cap.kv 读 browser-desk/service-port（service 启动时写入）
 *   3. 端口扫描 9700-9719 探测 /__health
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SERVER_NAME = 'browser-desk';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
// argsTemplate: [{{polarisPort}}, {{polarisToken}}, {{appConfigDir}}] → argv[2..4]
const POLARIS_PORT = parseInt(process.argv[2], 10) || 0;
const POLARIS_TOKEN = process.argv[3] || '';
const APP_CONFIG_DIR = process.argv[4] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── 服务端点自发现 ─────────────────────────────────────────────────────────
function md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex'); }

function configCandidates(appConfigDir) {
  const cands = [];
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris-dev', 'anchor.json') : '',
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) cands.push(path.join(a.dataRoot, 'config.json'));
    } catch (_) { /* skip */ }
  }
  if (appConfigDir) cands.push(path.join(appConfigDir, 'config.json'));
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  return cands;
}

/** 经宿主 router-dispatch 读 cap.kv（cap.kv 落盘是 SQLite kv.db，文件直读不可行） */
function kvGetViaHost(key) {
  return new Promise((resolve) => {
    // 端点：宿主注入的 polarisPort 优先，否则读 config 候选
    let ep = null;
    if (POLARIS_PORT > 0) {
      ep = { host: '127.0.0.1', port: POLARIS_PORT, token: POLARIS_TOKEN };
    } else {
      for (const p of configCandidates(APP_CONFIG_DIR)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
          const web = cfg.web || {};
          if (typeof web.port === 'number' && web.port > 0) {
            ep = { host: web.host || '127.0.0.1', port: web.port, token: web.token || '' };
            break;
          }
        } catch (_) { /* skip */ }
      }
    }
    if (!ep) { resolve(null); return; }
    const data = JSON.stringify({ req: { target: 'cap.kv', payload: { action: 'get', key } } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (ep.token) headers.Authorization = `Bearer ${md5(ep.token)}`;
    const req = http.request({
      hostname: ep.host, port: ep.port, path: '/api/router-dispatch',
      method: 'POST', headers, timeout: 5000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const value = parsed?.result?.value;
          const port = Number(value);
          resolve(Number.isFinite(port) && port > 0 ? port : null);
        } catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(data);
    req.end();
  });
}

function healthOnce(port) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/__health', timeout: 800 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function resolveServicePort(appConfigDir) {
  const envPort = parseInt(process.env.BROWSER_DESK_SERVICE_PORT || '', 10);
  if (Number.isFinite(envPort) && envPort > 0 && await healthOnce(envPort)) return envPort;
  const kvPort = await kvGetViaHost('browser-desk/service-port');
  if (kvPort && await healthOnce(kvPort)) return kvPort;
  for (let p = 9700; p <= 9719; p += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await healthOnce(p)) return p;
  }
  return null;
}

let servicePort = null;
let portPromise = null;
function getServicePort() {
  if (servicePort) return Promise.resolve(servicePort);
  if (!portPromise) {
    portPromise = resolveServicePort(APP_CONFIG_DIR).then((p) => {
      if (!p) throw new Error('browser-desk service 未找到（服务未启动或端口扫描失败）');
      servicePort = p;
      log('info', `service endpoint: 127.0.0.1:${p}`);
      return p;
    }).catch((e) => {
      // 失败不缓存：service 可能稍后启动（冷启动竞态），下次调用重试发现
      portPromise = null;
      throw e;
    });
  }
  return portPromise;
}

function dispatch(action, params = {}, timeoutMs = 60000) {
  return getServicePort().then((port) => new Promise((resolve, reject) => {
    const data = JSON.stringify({ action, ...params });
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/dispatch', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: timeoutMs,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.ok) resolve(parsed);
          else reject(new Error(parsed.error || 'service 返回失败'));
        } catch (e) {
          reject(new Error(`service 返回非 JSON: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`service 超时(${timeoutMs}ms)`)));
    req.on('error', reject);
    req.write(data);
    req.end();
  }));
}

// ── 工具面 ─────────────────────────────────────────────────────────────────
const TAB_REF = {
  type: 'object',
  properties: {
    tabId: { type: 'string', description: '目标标签 id（缺省=当前 agentKey 绑定标签或最近活跃标签）' },
    agentKey: { type: 'string', description: 'AI 会话标识（用于标签绑定路由）' },
  },
};

function tool(name, description, inputSchema, call) {
  return { name, description, inputSchema, call };
}

const tools = [
  tool('desk_status', '查询浏览器引擎状态与所有打开标签（id/标题/URL/绑定会话）。AI 操作前可先调用了解现状。',
    { type: 'object', properties: {} },
    async () => (await dispatch('status', {}, 10000)).result),

  tool('desk_acquire', '打开或获取一个浏览器标签并绑定到当前会话。mode: reuse=复用绑定标签(默认)/create=总是新建/require_new=新窗口。返回标签信息。',
    {
      type: 'object',
      properties: {
        url: { type: 'string', description: '初始 URL 或搜索词' },
        title: { type: 'string', description: '标签标题' },
        mode: { type: 'string', enum: ['reuse', 'create', 'require_new'], description: '获取模式' },
        newWindow: { type: 'boolean', description: 'true 时在独立窗口打开' },
        agentKey: { type: 'string', description: '会话标识（绑定用）' },
      },
    },
    async (a) => (await dispatch('acquire', a, 45000)).result),

  tool('desk_navigate', '导航当前/指定标签到 URL；若输入像搜索词则自动转为搜索。',
    { type: 'object', properties: { url: { type: 'string' }, query: { type: 'string' }, ...TAB_REF.properties } },
    async (a) => (await dispatch('navigate', a, 45000)).result),

  tool('desk_search', '执行网页搜索并返回结构化结果数组（title/url/snippet）。这是 AI 搜索闭环的核心工具。engine 可选 bing/baidu/duckduckgo/google。',
    {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: '搜索词' },
        engine: { type: 'string', enum: ['bing', 'baidu', 'duckduckgo', 'google'] },
        limit: { type: 'number', description: '返回条数上限（默认 8）' },
        ...TAB_REF.properties,
      },
    },
    async (a) => (await dispatch('search', a, 60000)).result),

  tool('desk_read', '抽取当前页或指定 URL 的正文文本（打分容器算法）。适合阅读文章/文档。',
    { type: 'object', properties: { url: { type: 'string' }, mode: { type: 'string', enum: ['article', 'text'] }, ...TAB_REF.properties } },
    async (a) => (await dispatch('read', a, 60000)).result),

  tool('desk_click', '点击页面元素。四种定位方式：label(可见文本)/index(候选序号)/text(同 label)/selector(CSS)。点击后等待网络空闲。',
    {
      type: 'object',
      properties: {
        label: { type: 'string' }, index: { type: 'number' }, text: { type: 'string' },
        selector: { type: 'string' }, ...TAB_REF.properties,
      },
    },
    async (a) => (await dispatch('click', a, 30000)).result),

  tool('desk_fill', '向表单元素填值（input/textarea/select），触发 input+change 事件。',
    { type: 'object', required: ['value'], properties: { label: { type: 'string' }, selector: { type: 'string' }, value: { type: 'string' }, ...TAB_REF.properties } },
    async (a) => (await dispatch('fill', a, 30000)).result),

  tool('desk_press_key', '向页面发送键盘按键，如 Enter、Escape、Control+a。',
    { type: 'object', required: ['keys'], properties: { keys: { type: 'string' }, ...TAB_REF.properties } },
    async (a) => (await dispatch('press_key', a, 15000)).result),

  tool('desk_scroll', '滚动页面。direction: down/up，amount 像素（默认 600）。',
    { type: 'object', properties: { amount: { type: 'number' }, direction: { type: 'string', enum: ['down', 'up'] }, ...TAB_REF.properties } },
    async (a) => (await dispatch('scroll', a, 15000)).result),

  tool('desk_find', '页内查找文本，返回命中计数与上下文片段。',
    { type: 'object', required: ['query'], properties: { query: { type: 'string' }, ...TAB_REF.properties } },
    async (a) => (await dispatch('find', a, 15000)).result),

  tool('desk_screenshot', '截图当前标签（JPEG base64，默认质量 60 最长边 1280 控制体积）。fullPage=true 时截全页。',
    { type: 'object', properties: { fullPage: { type: 'boolean' }, quality: { type: 'number' }, maxWidth: { type: 'number' }, ...TAB_REF.properties } },
    async (a) => (await dispatch('screenshot', a, 30000)).result),

  tool('desk_evaluate', '在页面执行任意 JS（逃生舱）。返回 JSON 化结果。谨慎使用。',
    { type: 'object', required: ['script'], properties: { script: { type: 'string' }, ...TAB_REF.properties } },
    async (a) => (await dispatch('evaluate', a, 30000)).result),

  tool('desk_history', '查看/操作浏览历史。action: list(默认)/back/forward。',
    { type: 'object', properties: { action: { type: 'string', enum: ['list', 'back', 'forward'] }, ...TAB_REF.properties } },
    async (a) => (await dispatch('history', a, 30000)).result),

  tool('desk_close', '关闭标签。tabId 缺省关当前标签；close="all" 关全部。',
    { type: 'object', properties: { tabId: { type: 'string' }, close: { type: 'string' } } },
    async (a) => (await dispatch('close', a, 15000)).result),

  tool('desk_watch', '拉取指定标签的增量页面事件（console/network/dialog/download/navigation/error）。长轮询：有新事件立即返回，无则挂起至多 25s。配合 sinceSeq 做增量流式感知。',
    {
      type: 'object',
      properties: {
        kinds: { type: 'array', items: { type: 'string', enum: ['console', 'network', 'dialog', 'download', 'navigation', 'error'] } },
        sinceSeq: { type: 'number', description: '上次读到的 seq（增量拉取）' },
        ...TAB_REF.properties,
      },
    },
    async (a) => (await dispatch('watch', a, 35000)).result),

  tool('desk_wait', '等待条件满足（服务端挂起，AI 一次调用即可）。四选一：selector(CSS 出现)/urlPattern(URL 正则)/downloadComplete(true)/dialog(true)。',
    {
      type: 'object',
      properties: {
        selector: { type: 'string' }, urlPattern: { type: 'string' },
        downloadComplete: { type: 'boolean' }, dialog: { type: 'boolean' },
        timeoutMs: { type: 'number', description: '默认 15000，上限 60000' },
        ...TAB_REF.properties,
      },
    },
    async (a) => (await dispatch('wait', a, 70000)).result),
];

// ── stdio JSON-RPC 接线（与 ai-scheduler 同款）────────────────────────────
function textResult(text, isError) {
  return { content: [{ type: 'text', text }], isError: !!isError };
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) },
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const t = tools.find((x) => x.name === name);
    if (!t) {
      send({ jsonrpc: '2.0', id: msg.id, result: textResult(`未知工具：${name}`, true) });
      return;
    }
    try {
      const result = await t.call(args);
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 0);
      // 截图等大 payload 用 structuredContent 避免双重转义
      send({
        jsonrpc: '2.0', id: msg.id,
        result: { content: [{ type: 'text', text }], structuredContent: typeof result === 'object' ? result : undefined, isError: false },
      });
    } catch (e) {
      log('error', `tool ${name}: ${e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: textResult(`执行失败：${e.message}`, true) });
    }
    return;
  }
  if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handleMessage(msg).catch((e) => {
      log('error', `handleMessage: ${e.message}`);
      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });
    });
  }
});
process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready`);
