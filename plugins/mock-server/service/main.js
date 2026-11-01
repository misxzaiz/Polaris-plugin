#!/usr/bin/env node
'use strict';
/**
 * main.js —— Mock 接口台后台服务（零依赖，node >= 18）
 *
 * 职责：
 *   - 数据面（127.0.0.1:<port>）：mock 路由匹配 → {{模板}}渲染 → 延迟/错误注入 → 应答；
 *     未匹配走 fallback 或 404 诊断体；/__health 恒 200。
 *   - 控制面（cap.kv mck.*）：settings 热更(3s) / 单槽命令信箱(先删后做) /
 *     历史分块镜像 / meta 心跳(60s)。服务无管理 HTTP API（无新增鉴权面）。
 *   - 自检（试金石）：临时路由打真请求逐项断言，报告落 mck.selftest。
 *
 * 生命周期由宿主 PluginServiceManager 管理。启动参数：node main.js <port> <appConfigDir>
 * 安全边界：只监听 127.0.0.1；历史/设置只落本机 kv；服务不外发任何请求
 *（自检与试一发只打 127.0.0.1 自己）。
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const core = require('../shared/core');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 3000;
const META_BEAT_MS = 60 * 1000;

const K = {
  settings: 'mck.settings',
  meta: 'mck.meta',
  idx: 'mck.idx',
  cmd: 'mck.cmd',       // 单槽命令信箱（先删后做）
  result: 'mck.result', // 命令回执（同 nonce）
  selftest: 'mck.selftest', // 最近一次自检报告
};

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘 + 512KB 轮转）─────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'mock-server.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.MCK_DEBUG === '1';
function log(level, msg) {
  const line = `[mock-server:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
const PORT_ARG = process.argv[2] || '';
const PORT = parseInt(PORT_ARG, 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

if (!PORT_ARG) {
  process.stderr.write('[mock-server:fatal] 缺少端口参数（宿主应注入 {{port}}）\n');
  process.exit(1);
}
if (!PORT) {
  log('info', '端口 0：随机端口模式（仅测试用；生产由宿主注入固定端口）');
}
initLog(APP_CONFIG_DIR);

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

let settings = core.bootstrapSettings(null); // 内存立即有 demo 路由；kv 确认后覆盖
let settingsLoaded = false;
let ring = [];            // 历史环形缓冲（新在前），内存权威，kv 为跨端投影
let ringDirty = false;
let prevChunkCount = 0;
let histTotal = 0;
let lastReqAt = 0;
let degraded = false;
let settingsReadAt = 0;
let lastMetaAt = 0;
let stRunning = false;    // 自检单飞互斥
let lastCmdNonce = '';    // 单槽信箱防重放
const startedAt = Date.now();
let actualPort = PORT; // listen(0) 后由 server.address() 回填（weibian 同款坑：listen 前无真实端口）

// ── settings（面板/MCP 写；服务仅键缺失时引导写示例路由）────────────────────
let lastRouteSig = '';
async function ensureSettings() {
  // 双读防竞态：读取瞬断时绝不引导写（否则可能覆盖用户既有路由）
  let raw = await kv.kvGet(K.settings).catch(() => null);
  if (!raw) raw = await kv.kvGet(K.settings).catch(() => null);
  if (raw && typeof raw === 'object' && Array.isArray(raw.routes)) {
    const next = core.normalizeSettings(raw);
    // 变更检测用 id+updatedAt 签名（路由集变化才 log，便于诊断热更时序）
    const sig = next.routes.map((r) => `${r.id}@${r.updatedAt}`).join(',');
    if (sig !== lastRouteSig) {
      log('info', `settings 已生效: ${next.routes.length} 条路由（${next.routes.filter((r) => r.enabled).length} 条启用）`);
      lastRouteSig = sig;
    }
    settings = next;
    settingsLoaded = true;
    return;
  }
  if (raw === null && !settingsLoaded) {
    // 首次引导：写入示例路由（仅当键确实缺失时执行一次）
    try {
      await kv.kvSet(K.settings, settings);
      lastRouteSig = settings.routes.map((r) => `${r.id}@${r.updatedAt}`).join(',');
      log('info', `首次运行：已写入 ${settings.routes.length} 条示例路由`);
    } catch (e) {
      log('warn', `初始 settings 写入失败: ${e.message}`);
    }
  }
  settingsLoaded = true;
}

async function writeSettings(next) {
  settings = next;
  try { await kv.kvSet(K.settings, next); } catch (e) { log('warn', `settings 写回失败: ${e.message}`); }
}

// ── 请求处理（数据面）───────────────────────────────────────────────────────
function sendJson(res, code, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...(extraHeaders || {}) });
  res.end(body);
}
function clientIp(req) {
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
function queryObj(url) {
  const out = {};
  for (const [k, v] of url.searchParams) {
    if (out[k] === undefined) out[k] = v;
    else if (Array.isArray(out[k])) out[k].push(v);
    else out[k] = [out[k], v];
  }
  return out;
}

/** 记历史（所有 mock 面 + 404；/__health 不记） */
function record(base) {
  const rec = core.makeHistRec(base);
  ring = core.applyHist(ring, rec);
  ringDirty = true;
  histTotal += 1;
  lastReqAt = rec.at;
}

function handleMock(req, res, url, bodyChunks, bodyLen, bodyAborted) {
  const pathname = url.pathname;
  const method = (req.method || 'GET').toUpperCase();
  const t0 = Date.now();

  // 请求体元数据（预览用；接收阶段已限长）
  const contentType = req.headers['content-type'] || '';
  const bodyBuf = Buffer.concat(bodyChunks || []);
  const cls = core.classifyBodyPreview(contentType, bodyBuf, core.KV_PREVIEW_CAP);
  const bodyMeta = {
    reqBodyKind: cls.kind,
    reqBodySize: cls.size,
    reqBodyPreview: cls.bodyPreview,
    reqBodyTruncated: cls.truncated,
  };

  const respond = (status, respBody, wireHeaders, info) => {
    const cors = core.corsHeaders(settings.cors.mode, req.headers, { preflight: method === 'OPTIONS' });
    const allHeaders = { ...cors, ...(wireHeaders || {}) };
    if (status === 204 || status === 304 || method === 'HEAD') {
      res.writeHead(status, allHeaders);
      res.end();
    } else {
      res.writeHead(status, allHeaders);
      res.end(respBody);
    }
    record({
      at: t0,
      method,
      path: pathname,
      query: url.search ? url.search.slice(1) : '',
      sourceIp: clientIp(req),
      matchedRouteId: info.routeId || '',
      matchedRouteName: info.routeName || '',
      status,
      delayMs: info.delayMs || 0,
      durMs: Date.now() - t0,
      reqHeaders: req.headers,
      ...bodyMeta,
      respBytes: respBody ? respBody.length : 0,
    });
  };

  const hit = core.findMatch(settings.routes, method, pathname);
  const doRespond = () => {
    if (!hit) {
      if (method === 'OPTIONS') {
        // 无路由的 OPTIONS：按 CORS 预检应答（204 + Allow-Headers），不打 404
        respond(204, Buffer.alloc(0), {}, { matched: false });
        return;
      }
      // fallback 或 404 诊断（带 CORS：浏览器里也能看到诊断信息）
      const fb = settings.fallback;
      if (fb.enabled) {
        const rendered = core.renderTemplate(fb.body, reqCtx({}, url, parseBodyObj(contentType, bodyBuf), req.headers));
        const buf = fb.bodyType === 'empty' ? Buffer.alloc(0) : Buffer.from(rendered.text, 'utf8');
        respond(fb.status, buf, { 'Content-Type': fb.bodyType === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8' }, { matched: false, routeName: 'fallback' });
        return;
      }
      const body = JSON.stringify(core.notFoundBody(settings.routes, method, pathname));
      respond(404, Buffer.from(body, 'utf8'), { 'Content-Type': 'application/json; charset=utf-8' }, { matched: false });
      return;
    }
    const r = hit.route;
    // 错误注入
    if (r.errorRate > 0 && Math.random() * 100 < r.errorRate) {
      const body = JSON.stringify({ ok: false, error: 'mock 故障注入', route: r.id, rate: r.errorRate });
      respond(r.errorStatus, Buffer.from(body, 'utf8'), { 'Content-Type': 'application/json; charset=utf-8' },
        { matched: true, routeId: r.id, routeName: r.name, delayMs: 0 });
      return;
    }
    const ctx = reqCtx(hit.params, url, parseBodyObj(contentType, bodyBuf), req.headers);
    const rendered = core.renderTemplate(r.body, ctx);
    const buf = r.bodyType === 'empty' ? Buffer.alloc(0) : Buffer.from(rendered.text, 'utf8');
    const wireHeaders = {
      ...(r.bodyType === 'json' ? { 'Content-Type': 'application/json; charset=utf-8' }
        : r.bodyType === 'text' ? { 'Content-Type': 'text/plain; charset=utf-8' } : {}),
      ...r.headers,
    };
    respond(r.status, buf, wireHeaders, { matched: true, routeId: r.id, routeName: r.name, delayMs: r.delayMs });
  };

  // 延迟注入（夹取在 normalizeRoute 已保证 ≤60s）
  const delay = hit ? hit.route.delayMs : 0;
  if (delay > 0) setTimeout(doRespond, delay);
  else doRespond();
}

function reqCtx(params, url, bodyObj, headers) {
  return {
    rng: Math.random,
    counter: { n: 0 },
    now: Date.now(),
    req: { path: params || {}, query: queryObj(url), headers: headers || null, body: bodyObj || null },
  };
}
/** 请求体 JSON 解析（content-type json 或首字符 {/[ 时尝试；失败回 null） */
function parseBodyObj(contentType, buf) {
  if (!buf || !buf.length) return null;
  const ct = String(contentType || '');
  if (ct && !/json/i.test(ct)) return null;
  const head = buf.slice(0, 1).toString('utf8');
  if (head !== '{' && head !== '[') return null;
  try { return JSON.parse(buf.toString('utf8')); } catch (_) { return null; }
}

// ── 命令消费（单槽信箱：mck.cmd 先删后做；回执 mck.result 同 nonce）─────────
async function sendResult(nonce, obj) {
  try { await kv.kvSet(K.result, { nonce, ...obj, at: Date.now() }); } catch (e) { log('warn', `回执写失败: ${e.message}`); }
}

async function consumeCommand() {
  const cmd = await kv.kvGet(K.cmd).catch(() => null);
  if (!cmd || typeof cmd !== 'object' || !cmd.nonce) return;
  if (cmd.nonce === lastCmdNonce) { // 已执行过：清掉残留，防重复执行
    await kv.kvDel(K.cmd).catch(() => {});
    return;
  }
  const delOk = await kv.kvDel(K.cmd).then(() => true).catch(() => false);
  if (!delOk) return; // 别人抢到了
  lastCmdNonce = cmd.nonce;
  log('info', `消费命令 ${cmd.op} nonce=${cmd.nonce}`);
  try {
    if (cmd.op === 'selftest') await cmdSelftest(cmd);
    else if (cmd.op === 'test_route') await cmdTestRoute(cmd);
    else if (cmd.op === 'clear_history') await cmdClearHistory(cmd);
    else await sendResult(cmd.nonce, { ok: false, error: `未知命令 op=${cmd.op}` });
  } catch (e) {
    log('warn', `命令 ${cmd.op} 执行失败: ${e.message}`);
    await sendResult(cmd.nonce, { ok: false, error: e.message });
  }
}

/** 用示例值实例化路由路径里的参数（:id → test-id；*rest → a/b） */
function samplePath(pattern) {
  return String(pattern || '/').replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n) => `test-${n}`)
    .replace(/\*([a-zA-Z_][a-zA-Z0-9_]*)?$/, (m) => (m === '*' ? 'a/b' : 'a/b'));
}

function selfCall(method, urlPath, bodyObj) {
  return new Promise((resolve) => {
    const data = bodyObj === undefined ? null : JSON.stringify(bodyObj);
    const req = http.request(
      {
        hostname: '127.0.0.1', port: actualPort, path: urlPath, method,
        headers: {
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
          Origin: 'http://localhost:5173',
        },
        timeout: 15000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; if (raw.length > 256 * 1024) res.destroy(); });
        res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: raw, latencyMs: 0 }));
      },
    );
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: '', error: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

/** 自检：临时路由 + 真请求逐项断言；单飞互斥；报告落 mck.selftest + result */
async function cmdSelftest(cmd) {
  if (stRunning) {
    await sendResult(cmd.nonce, { ok: false, error: '自检进行中（单飞互斥），稍后再试' });
    return;
  }
  stRunning = true;
  const t0 = Date.now();
  const checks = [];
  const savedRoutes = settings.routes;
  try {
    // 1. 挂临时路由（内存即时生效；写回 kv 让面板/外部一致）
    const stRoutes = core.selftestRoutes();
    await writeSettings({ ...settings, routes: [...savedRoutes, ...stRoutes], updatedAt: Date.now() });
    const t = (item, fn) => {
      const s = Date.now();
      return Promise.resolve().then(fn).then((detail) => checks.push({ item, pass: true, detail: detail || 'ok', ms: Date.now() - s }))
        .catch((e) => checks.push({ item, pass: false, detail: e.message, ms: Date.now() - s }));
    };
    // 2. 逐项打真请求
    await t('模板引擎：{{int}}/{{cname}}/{{email}}/{{bool}} 渲染', async () => {
      const r = await selfCall('GET', '/mst/tpl');
      if (r.status !== 200) throw new Error(`状态 ${r.status} ≠ 200`);
      const j = JSON.parse(r.body);
      if (!(Number.isInteger(j.n) && j.n >= 1 && j.n <= 9)) throw new Error(`{{int 1,9}} 渲染异常: ${JSON.stringify(j.n)}`);
      if (!/^[\u4e00-\u9fa5]{2,3}$/.test(j.name)) throw new Error(`{{cname}} 渲染异常: ${j.name}`);
      if (!/^[^@]+@[^@]+\.[^@]+$/.test(j.mail)) throw new Error(`{{email}} 渲染异常: ${j.mail}`);
      if (typeof j.flag !== 'boolean') throw new Error(`{{bool}} 渲染异常: ${j.flag}`);
      return `n=${j.n} name=${j.name}`;
    });
    await t('路径参数与 query 回显', async () => {
      const r = await selfCall('GET', '/mst/echo/42?tag=abc');
      if (r.status !== 200) throw new Error(`状态 ${r.status} ≠ 200`);
      const j = JSON.parse(r.body);
      if (j.id !== '42' || j.tag !== 'abc') throw new Error(`回显不符: ${r.body.slice(0, 120)}`);
      return 'id=42 tag=abc';
    });
    await t('延迟注入 600ms', async () => {
      const s = Date.now();
      const r = await selfCall('GET', '/mst/slow');
      const cost = Date.now() - s;
      if (r.status !== 200) throw new Error(`状态 ${r.status} ≠ 200`);
      if (cost < 450) throw new Error(`实测 ${cost}ms < 450ms（延迟未生效）`);
      return `${cost}ms`;
    });
    await t('错误注入 100%→500', async () => {
      const r = await selfCall('GET', '/mst/fail');
      if (r.status !== 500) throw new Error(`状态 ${r.status} ≠ 500`);
      const j = JSON.parse(r.body);
      if (j.ok !== false || j.error !== 'mock 故障注入') throw new Error(`错误体不符: ${r.body.slice(0, 120)}`);
      return '500 + 注入标记';
    });
    await t('POST 请求体 {{req.body.*}} 回显', async () => {
      const r = await selfCall('POST', '/mst/post', { message: 'hello-自检' });
      if (r.status !== 200) throw new Error(`状态 ${r.status} ≠ 200`);
      const j = JSON.parse(r.body);
      if (j.got !== 'hello-自检') throw new Error(`回显不符: ${r.body.slice(0, 120)}`);
      return '中文体原样回显';
    });
    await t('未匹配路径 → 404 诊断体', async () => {
      const r = await selfCall('GET', '/mst/nowhere-xyz');
      if (r.status !== 404) throw new Error(`状态 ${r.status} ≠ 404`);
      const j = JSON.parse(r.body);
      if (j.ok !== false || !j.error) throw new Error(`缺诊断字段: ${r.body.slice(0, 120)}`);
      return '404 + hint';
    });
    await t('CORS 预检（Origin 回显）', async () => {
      const r = await selfCall('OPTIONS', '/mst/tpl');
      if (r.status !== 204 && r.status !== 200) throw new Error(`状态 ${r.status}`);
      const acao = r.headers['access-control-allow-origin'];
      if (acao !== 'http://localhost:5173') throw new Error(`ACAO=${acao} ≠ Origin 回显`);
      return `ACAO=${acao}`;
    });
  } finally {
    // 3. 还原用户路由（临时路由用后即删）
    await writeSettings({ ...settings, routes: savedRoutes, updatedAt: Date.now() });
    stRunning = false;
  }
  const passed = checks.filter((c) => c.pass).length;
  const report = {
    version: VERSION,
    at: Date.now(),
    durationMs: Date.now() - t0,
    passed,
    total: checks.length,
    allGreen: passed === checks.length,
    checks,
  };
  try { await kv.kvSet(K.selftest, report); } catch (e) { log('warn', `自检报告写失败: ${e.message}`); }
  await sendResult(cmd.nonce, { ok: true, op: 'selftest', report });
  log('info', `自检完成 ${passed}/${checks.length}（${report.durationMs}ms）`);
}

/** 试一发：按路由配置真实请求一次（参数用示例值实例化），返回实际响应 */
async function cmdTestRoute(cmd) {
  await ensureSettingsFresh();
  const route = settings.routes.find((r) => r.id === cmd.routeId);
  if (!route) { await sendResult(cmd.nonce, { ok: false, error: `路由不存在: ${cmd.routeId}` }); return; }
  const p = samplePath(route.path);
  const q = cmd.query ? String(cmd.query).replace(/^\?/, '') : '';
  const method = cmd.method && cmd.method.toUpperCase() !== route.method && route.method !== 'ANY'
    ? route.method : (cmd.method ? String(cmd.method).toUpperCase() : route.method);
  const bodyObj = cmd.body !== undefined && cmd.body !== null && method !== 'GET' && method !== 'HEAD' ? cmd.body : undefined;
  const r = await selfCall(method, q ? `${p}?${q}` : p, bodyObj);
  await sendResult(cmd.nonce, {
    ok: true, op: 'test_route', routeId: route.id, request: `${method} ${p}${q ? `?${q}` : ''}`,
    status: r.status, latencyMs: r.error ? 0 : undefined, error: r.error, bodyPreview: r.body.slice(0, 2000),
  });
}

async function cmdClearHistory(cmd) {
  if (cmd.confirm !== true) { await sendResult(cmd.nonce, { ok: false, error: '清空历史不可恢复，必须传 confirm:true' }); return; }
  ring = [];
  ringDirty = true;
  histTotal = 0;
  await sendResult(cmd.nonce, { ok: true, op: 'clear_history' });
  log('info', '历史已清空');
}

/** 命令执行前强制重读 settings（MCP 刚 upsert 的路由立即生效） */
async function ensureSettingsFresh() {
  try { await ensureSettings(); } catch (_) { /* 读失败用内存现值 */ }
}

// ── HTTP 服务（数据面：/__health + mock 路由；无管理 API）──────────────────
const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  } catch (_) {
    sendJson(res, 400, { ok: false, error: 'bad request' });
    return;
  }
  if (url.pathname === '/__health') {
    sendJson(res, 200, {
      ok: true, version: VERSION, degraded,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      routes: settings.routes.length,
      enabled: settings.routes.filter((r) => r.enabled).length,
      history: ring.length, port: PORT,
    });
    return;
  }
  // 接收请求体（限长 2MB；超限 413）
  const chunks = [];
  let received = 0;
  let aborted = false;
  req.on('data', (c) => {
    if (aborted) return;
    received += c.length;
    if (received > core.REQ_BODY_CAP) {
      aborted = true;
      sendJson(res, 413, { ok: false, error: `请求体超过 ${Math.round(core.REQ_BODY_CAP / 1048576)}MB 上限` });
      setTimeout(() => req.destroy(), 300); // 留 300ms flush 413
    } else {
      chunks.push(c);
    }
  });
  req.on('error', () => { aborted = true; });
  req.on('end', () => {
    if (aborted) return;
    // 处理器异常必须应答 500，绝不静默挂死对端（自检曾因 undefined 路由炸 here）
    try {
      handleMock(req, res, url, chunks, received, aborted);
    } catch (e) {
      log('error', `处理请求异常 ${req.method} ${url.pathname}: ${e.stack || e.message}`);
      try { sendJson(res, 500, { ok: false, error: 'mock 服务内部错误', detail: String(e.message).slice(0, 200) }); } catch (_) { /* 已应答 */ }
    }
  });
});

// 端口被占用：诚实失败退出（健康检查固定在声明端口，换端口会漂移导致重启循环）
server.on('error', (e) => {
  log('error', `服务端口 ${PORT} 监听失败: ${e.message}（被占用时请释放 ${PORT} 或在设置里停用服务）`);
  process.exit(1);
});

// ── tick 主循环 ────────────────────────────────────────────────────────────
async function mirrorRing() {
  if (!ringDirty) return;
  const plan = core.planChunkWrites(ring, prevChunkCount);
  for (const p of plan) {
    try {
      if (p.value === null) await kv.kvDel(p.key);
      else await kv.kvSet(p.key, p.value);
    } catch (e) {
      log('warn', `hist 镜像写失败（下轮重试）${p.key}: ${e.message}`);
      return; // 保持 dirty，下轮继续
    }
  }
  prevChunkCount = Math.min(Math.ceil(ring.length / core.CHUNK_SIZE), core.HIST_CHUNKS_KEEP);
  try {
    await kv.kvSet(K.idx, {
      count: ring.length,
      total: histTotal,
      chunkCount: prevChunkCount,
      oldestAt: ring.length ? ring[ring.length - 1].at : 0,
      updatedAt: Date.now(),
    });
  } catch (e) { log('warn', `idx 写失败（下轮重试）: ${e.message}`); return; }
  ringDirty = false;
}

async function tick() {
  try {
    // 每 tick 都重读 settings（本地 kvGet 便宜；避免 3s 边界抖动导致热更滞后一个窗口）
    await ensureSettings();
    settingsReadAt = Date.now();
    await consumeCommand();
    await mirrorRing();
    if (Date.now() - lastMetaAt > META_BEAT_MS) {
      lastMetaAt = Date.now();
      await kv.kvSet(K.meta, {
        version: VERSION,
        pid: process.pid,
        startedAt,
        lastTickAt: Date.now(),
        bridge: (() => { const ep = kv.endpoint(); return ep ? `${ep.host}:${ep.port}` : ''; })(),
        degraded,
        port: actualPort,
        routeCount: settings.routes.length,
        enabledCount: settings.routes.filter((r) => r.enabled).length,
        corsMode: settings.cors.mode,
        fallbackEnabled: !!settings.fallback.enabled,
        histTotal,
        lastReqAt,
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      }).catch((e) => log('warn', `meta 心跳失败: ${e.message}`));
    }
    if (degraded) {
      degraded = false;
      log('info', 'bridge 已恢复');
    }
  } catch (e) {
    degraded = true;
    log('warn', `tick 降级（mock 应答不受影响）: ${e.message}`);
  }
}

// ── 生命周期 ───────────────────────────────────────────────────────────────
process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.stack ? e.stack : e}`));
process.on('SIGTERM', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });
process.on('SIGINT', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });

server.listen(PORT, '127.0.0.1', () => {
  const addr = server.address();
  actualPort = (addr && typeof addr === 'object' && addr.port) ? addr.port : PORT;
  log('info', `Mock 接口台服务 v${VERSION} (pid=${process.pid}) 端口 ${actualPort}（仅本机 127.0.0.1）`);
  log('info', `把前端 baseURL 指向 http://127.0.0.1:${actualPort} 即可用；示例路由 GET /mockdemo/users`);
});
setInterval(tick, TICK_MS);
