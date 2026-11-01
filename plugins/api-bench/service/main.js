'use strict';
/**
 * main.js —— 接口压测台后台服务（node >= 18，依赖仅 vendored autocannon）
 *
 * 单写者权威：api-bench.meta / api-bench.latest / api-bench.runs /
 * api-bench.report.* / api-bench.history / api-bench.settings 全部只由本服务写。
 * 面板走直连 HTTP（127.0.0.1 + token，低延迟实时进度）；MCP 经 api-bench.cmd
 * 单槽信箱表达意图（{nonce, action, payload}），服务轮询 get→delete 消费，
 * 回执写 api-bench.res（nonce 对齐）。面板与 AI 共用同一引擎与同一报告库。
 *
 * 安全不变量：
 *   - 服务只监听 127.0.0.1；/api/* 与 /api/live 校验 X-ApiBench-Token
 *     （token 持久化在 api-bench.meta，服务重启不换）；
 *   - 含敏感头的完整目标配置只存在服务内存与本地文件
 *     （{{appConfigDir}}/api-bench/targets.json，与宿主 config 同信任域）；
 *     落 kv 的 headers 一律掩码（****last4）；
 *   - 护栏：连接数 ≤1000、时长 ≤300s、body ≤1MB；同一时刻只跑一个压测，可中止；
 *   - 无定时压测、无自动重压：所有压测都由用户/AI 显式发起。
 *
 * 内置试金石（本服务自身端点，鉴权豁免、零敏感数据）：
 *   GET /demo/ok            200 立即返回
 *   GET /demo/slow?ms=200   200 延迟 ms（≤2000）后返回
 *   GET /demo/flaky?p=0.2   以概率 p（≤0.5）返回 500
 *   POST /demo/echo         200 回显 {len}
 * 用途：首次使用零配置验证工具本身；也给 AI 一个安全的默认演示目标。
 *
 * 生命周期：宿主 type=http + /__health（恒 200，桥降级也保活）；
 * 桥不可达 → degraded 心跳，60s 重试自发现，绝不自饿死。
 *
 * 启动参数：node main.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { createKvClient } = require('./kvclient');
const core = require('../shared/bench-core');
const autocannon = require('./vendor/autocannon.cjs');

const VERSION = core.VERSION;
const PLUGIN_ID = 'api-bench';
const PREFIX = 'api-bench.';
const TICK_MS = 1000;
const META_BEAT_IDLE_MS = 15 * 1000;
const META_BEAT_RUNNING_MS = 1000;
const HISTORY_MAX = 50;
const KEEP_REPORTS = 20;
const LIVE_WINDOW_MS = 5000;   // 实时分位的滚动窗口
const MCP_RUN_WAIT_DEFAULT_MS = 90 * 1000;

const K = {
  meta: `${PREFIX}meta`,
  latest: `${PREFIX}latest`,
  runs: `${PREFIX}runs`,
  report: (id) => `${PREFIX}report.${id}`,
  reportPrefix: `${PREFIX}report.`,
  history: `${PREFIX}history`,
  settings: `${PREFIX}settings`,
  cmd: `${PREFIX}cmd`,
  res: `${PREFIX}res`,
};

// ── 日志（自落盘 + 512KB 轮转；绝不落 header 原文）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = path.join(appConfigDir || os.tmpdir(), PLUGIN_ID);
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'service.log');
  } catch (_) { logFile = null; }
}
function log(level, msg) {
  const line = `[${PLUGIN_ID}:${level}] ${new Date().toISOString()} ${msg}`;
  process.stderr.write(line + '\n');
  if (logFile) {
    try {
      let st = { size: 0 };
      try { st = fs.statSync(logFile); } catch (_) { /* 首次 */ }
      if (st.size > 512 * 1024) fs.writeFileSync(logFile, '');
      fs.appendFileSync(logFile, line + '\n');
    } catch (_) { /* 日志失败不影响业务 */ }
  }
}

// ── 状态 ────────────────────────────────────────────────────────────────────
const state = {
  appConfigDir: '',
  kv: null,
  port: 0,
  degraded: false,
  lastBridgeErr: null,
  lastCmdNonce: '',
  token: '',
  settings: { connections: 10, durationS: 10, timeoutS: 10 },
  running: null,   // { runId, instance, startedAt, config(masked 内含), aborted, samples, latRing, statusCounts, errs, source:'panel'|'mcp', nonce }
  lastReport: null,
};

// ── 设置 ────────────────────────────────────────────────────────────────────
function normalizeSettings(s) {
  const src = s && typeof s === 'object' ? s : {};
  const d = core.LIMITS;
  return {
    connections: Math.min(d.connections.max, Math.max(d.connections.min, Math.round(Number(src.connections)) || d.connections.default)),
    durationS: Math.min(d.durationS.max, Math.max(d.durationS.min, Math.round(Number(src.durationS)) || d.durationS.default)),
    timeoutS: Math.min(d.timeoutS.max, Math.max(d.timeoutS.min, Number(src.timeoutS) || d.timeoutS.default)),
  };
}

async function loadSettings() {
  try {
    const v = await state.kv.kvGet(K.settings);
    state.settings = normalizeSettings(v);
  } catch (_) { /* 默认 */ }
}

async function saveSettings(s) {
  state.settings = normalizeSettings(s);
  try { await state.kv.kvSet(K.settings, state.settings); } catch (_) { /* kv 失败不影响本次生效 */ }
  return state.settings;
}

// ── 收藏目标（完整 header 存本地文件，与宿主 config 同信任域）───────────────
function targetsFilePath() {
  return path.join(state.appConfigDir || os.tmpdir(), PLUGIN_ID, 'targets.json');
}

function loadTargets() {
  try {
    const raw = JSON.parse(fs.readFileSync(targetsFilePath(), 'utf8'));
    return Array.isArray(raw) ? raw.filter((t) => t && t.id && t.url) : [];
  } catch (_) { return []; }
}

function saveTargets(list) {
  const file = targetsFilePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    log('warn', `收藏目标保存失败（内存仍有效）：${e.message}`);
    return false;
  }
}

/** 收藏条目落 kv 前：headers 掩码 */
function targetPublic(t) {
  return {
    id: t.id,
    name: String(t.name || '').slice(0, 80),
    url: t.url,
    method: t.method || 'GET',
    headers: core.maskHeaders(t.headers || {}),
    hasBody: !!t.body,
    connections: t.connections,
    durationS: t.durationS,
    timeoutS: t.timeoutS,
    rate: t.rate || null,
    scope: t.scope || null,
    savedAt: t.savedAt || null,
  };
}

// ── kv 持久化 ───────────────────────────────────────────────────────────────
async function kvSet(key, value) { await state.kv.kvSet(key, value); }

async function loadHistory() {
  try {
    const v = await state.kv.kvGet(K.history);
    return Array.isArray(v) ? v : (v && Array.isArray(v.items) ? v.items : []);
  } catch (_) { return []; }
}

async function pushHistory(entry) {
  const h = await loadHistory();
  h.unshift(entry);
  await kvSet(K.history, h.slice(0, HISTORY_MAX));
}

// ── 引擎：一次压测的生命周期 ────────────────────────────────────────────────
function newRunId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

/** autocannon 启动参数（从归一目标映射；错误事件也在此接线） */
function buildOpts(cfg) {
  const opts = {
    url: cfg.url,
    method: cfg.method,
    headers: { ...cfg.headers },
    body: cfg.body || undefined,
    connections: cfg.connections,
    pipelining: cfg.pipelining,
    duration: cfg.durationS,
    timeout: cfg.timeoutS,
  };
  if (cfg.rate) opts.overallRate = cfg.rate;
  return opts;
}

function liveSnapshot() {
  const r = state.running;
  if (!r) return null;
  const elapsedS = (Date.now() - r.startedAt) / 1000;
  const win = core.windowPercentiles(r.latRing, LIVE_WINDOW_MS, Date.now());
  const last = r.samples.length ? r.samples[r.samples.length - 1] : { rps: 0, bytes: 0 };
  let sent = 0;
  let done = 0;
  try {
    sent = r.instance ? (r.instance.requests && r.instance.requests.sent) || 0 : 0;
    done = r.instance ? (r.instance.requests && r.instance.requests.total) || 0 : 0;
  } catch (_) { /* 实例已结束 */ }
  return {
    runId: r.runId,
    source: r.source,
    elapsedS: Math.round(elapsedS * 10) / 10,
    durationS: r.config.durationS,
    connections: r.config.connections,
    method: r.config.method,
    url: r.config.url,
    rate: r.config.rate,
    rps: last.rps,
    bytesPerSec: last.bytes,
    latMean: win ? core.fmtRound1(win.mean) : null,
    latP90: win ? core.fmtRound1(win.p90) : null,
    latP97_5: win ? core.fmtRound1(win.p97_5) : null,
    latCount: win ? win.count : 0,
    errs: r.errs,
    non2xx: Object.entries(r.statusCounts).reduce((acc, [c, n]) => (c.startsWith('2') ? acc : acc + n), 0),
    statusCounts: { ...r.statusCounts },
    sent,
    done,
  };
}

/** 启动压测。成功返回 {ok:true, runId}；失败 {ok:false, error}。 */
function startBench(cfg, source, nonce) {
  if (state.running) {
    return { ok: false, busy: true, error: `已有压测在运行（${state.running.config.method} ${state.running.config.url}）。先停止或等它完成。` };
  }
  const runId = newRunId();
  let instance;
  try {
    instance = autocannon(buildOpts(cfg));
  } catch (e) {
    return { ok: false, error: `压测启动失败：${(e && e.message) || e}` };
  }
  const run = {
    runId,
    instance,
    startedAt: Date.now(),
    config: cfg,
    aborted: false,
    samples: [],
    latRing: [],
    statusCounts: {},
    errs: 0,
    source: source === 'mcp' ? 'mcp' : 'panel',
    nonce: nonce || null,
  };
  state.running = run;

  // 逐响应：状态码分布 + 实时延迟环（responseTime 为毫秒浮点，autocannon response 事件实测）
  instance.on('response', (_client, statusCode, _bytes, responseTime) => {
    const code = String(statusCode);
    run.statusCounts[code] = (run.statusCounts[code] || 0) + 1;
    if (run.latRing.length >= core.LIMITS.latRingMax) run.latRing.shift();
    run.latRing.push({ t: Date.now(), v: Number(responseTime) || 0 });
  });
  // socket 层错误（连接拒绝/断连等；5xx 不算错误，走 statusCounts）
  instance.on('reqError', () => { run.errs += 1; });
  instance.on('timeout', () => { run.errs += 1; });
  instance.on('error', (e) => {
    log('warn', `autocannon 实例错误：${(e && e.message) || e}`);
    run.errs += 1;
  });
  // 每秒采样：tick {counter, bytes}
  instance.on('tick', ({ counter, bytes }) => {
    const win = core.windowPercentiles(run.latRing, LIVE_WINDOW_MS, Date.now());
    run.samples.push({
      t: Math.round((Date.now() - run.startedAt) / 100) / 10,
      rps: Number(counter) || 0,
      bytes: Number(bytes) || 0,
      latMean: win ? core.fmtRound1(win.mean) : null,
      latP97_5: win ? core.fmtRound1(win.p97_5) : null,
      errs: run.errs,
    });
    if (run.samples.length > core.LIMITS.samplesMax) run.samples.shift();
  });

  instance.on('done', (result) => {
    if (state.running === run) state.running = null;
    finishBench(run, result).catch((e) => log('warn', `报告落库失败：${(e && e.message) || e}`));
  });
  log('info', `压测启动 [${run.source}] ${cfg.method} ${cfg.url} c=${cfg.connections} d=${cfg.durationS}s scope=${cfg.scope}`);
  return { ok: true, runId };
}

function stopBench() {
  const r = state.running;
  if (!r) return { ok: false, error: '当前没有运行中的压测' };
  r.aborted = true;
  try { r.instance.stop(); } catch (e) { log('warn', `stop 异常（忽略）：${(e && e.message) || e}`); }
  return { ok: true, runId: r.runId };
}

/** 压测完成：构建报告 → 持久化 → （信箱来源）写回执。 */
async function finishBench(run, result) {
  const summary = core.summarize(result, run.samples, run.config, run.aborted);
  const verdict = core.verdictOf(summary, run.config);
  const report = {
    runId: run.runId,
    at: new Date().toISOString(),
    version: VERSION,
    target: {
      url: run.config.url,
      method: run.config.method,
      headers: core.maskHeaders(run.config.headers),
      bodyBytes: run.config.bodyBytes || 0,
      connections: run.config.connections,
      pipelining: run.config.pipelining,
      durationS: run.config.durationS,
      rate: run.config.rate || null,
      timeoutS: run.config.timeoutS,
      scope: run.config.scope,
    },
    summary,
    verdict,
  };
  state.lastReport = report;
  try {
    await kvSet(K.latest, report);
    const runs = await (async () => {
      try { const v = await state.kv.kvGet(K.runs); return Array.isArray(v) ? v : []; } catch (_) { return []; }
    })();
    runs.unshift(run.runId);
    const keep = runs.slice(0, KEEP_REPORTS);
    await kvSet(K.runs, keep);
    for (const old of runs.slice(KEEP_REPORTS)) await state.kv.kvDel(K.report(old)).catch(() => {});
    await kvSet(K.report(run.runId), report);
    await pushHistory({
      runId: run.runId,
      at: report.at,
      url: run.config.url,
      method: run.config.method,
      connections: run.config.connections,
      durationS: summary.durationS,
      rpsMean: summary.rpsMean,
      p50: summary.latencies.p50,
      p97_5: summary.latencies.p97_5,
      p99: summary.latencies.p99,
      errors: summary.errors + summary.timeouts,
      non2xx: summary.non2xx,
      aborted: summary.aborted,
      verdictOne: verdict.oneLine,
    });
    log('info', `压测完成 ${run.runId}：${verdict.oneLine}`);
  } catch (e) {
    log('warn', `报告持久化失败（内存中仍可读）：${(e && e.message) || e}`);
  }
  // MCP 信箱回执（nonce 对齐；面板轮询 /api/live 的 lastReport 拿同一份）
  if (run.source === 'mcp' && run.nonce) {
    try {
      await kvSet(K.res, { nonce: run.nonce, action: 'run', at: report.at, result: { ok: true, runId: run.runId, report } });
    } catch (e) {
      log('warn', `MCP 回执写入失败：${(e && e.message) || e}`);
    }
  }
}

async function getReportCached(runId) {
  if (state.lastReport && state.lastReport.runId === runId) return state.lastReport;
  try { return await state.kv.kvGet(K.report(runId)); } catch (_) { return null; }
}

// ── meta 心跳（面板/移动端引导事实库；运行期 1s 携带实时进度）────────────────
function metaPayload() {
  return {
    ts: new Date().toISOString(),
    version: VERSION,
    port: state.port,
    token: state.token,
    degraded: state.degraded,
    lastBridgeErr: state.lastBridgeErr,
    running: state.running ? liveSnapshot() : null,
    lastReportId: state.lastReport ? state.lastReport.runId : null,
  };
}

async function beatMeta() {
  try {
    await kvSet(K.meta, metaPayload());
    state.degraded = false;
    state.lastBridgeErr = null;
  } catch (e) {
    state.degraded = true;
    state.lastBridgeErr = String((e && e.message) || e);
    log('warn', `meta 心跳失败（降级）：${state.lastBridgeErr}`);
  }
}

// ── 信箱命令（MCP 来源；单槽 get→delete 消费）───────────────────────────────
const MAILBOX_ACTIONS = new Set(['run', 'stop', 'report', 'state', 'settings_set', 'history', 'compare']);

async function consumeCmd() {
  let cmd = null;
  try {
    const v = await state.kv.kvGet(K.cmd);
    if (v && typeof v === 'object' && v.nonce && v.nonce !== state.lastCmdNonce) {
      cmd = v;
    }
  } catch (_) { return; }
  if (!cmd) return;
  state.lastCmdNonce = cmd.nonce;
  await state.kv.kvDel(K.cmd).catch(() => {});
  const action = String(cmd.action || '');
  let reply;
  if (!MAILBOX_ACTIONS.has(action)) {
    reply = { ok: false, error: `未知 action：${action}（支持：${[...MAILBOX_ACTIONS].join('/')}）` };
  } else if (action === 'run') {
    const cfgR = core.sanitizeTarget(cmd.payload, state.settings);
    if (!cfgR.ok) {
      reply = { ok: false, error: cfgR.error };
    } else {
      const startR = startBench(cfgR.value, 'mcp', cmd.nonce);
      if (!startR.ok) reply = startR;
      // else：回执由 finishBench 在完成时写入（MCP 侧轮询 nonce）
      else return;
    }
  } else if (action === 'stop') {
    reply = stopBench();
  } else if (action === 'report') {
    const rep = await getReportCached(String(cmd.payload.runId || ''));
    reply = rep ? { ok: true, report: rep } : { ok: false, error: `报告不存在或已被清理：${cmd.payload.runId || '?'}` };
  } else if (action === 'state') {
    reply = { ok: true, running: state.running ? liveSnapshot() : null, latest: state.lastReport, meta: { version: VERSION } };
  } else if (action === 'history') {
    const h = await loadHistory();
    reply = { ok: true, items: h.slice(0, Math.min(Math.max(Number(cmd.payload.limit) || 20, 1), HISTORY_MAX)) };
  } else if (action === 'settings_set') {
    const s = await saveSettings(cmd.payload);
    reply = { ok: true, settings: s };
  } else if (action === 'compare') {
    const a = await getReportCached(String(cmd.payload.a || ''));
    const b = await getReportCached(String(cmd.payload.b || ''));
    if (!a || !b) reply = { ok: false, error: `对比的报告不存在：${!a ? cmd.payload.a : cmd.payload.b}` };
    else reply = { ok: true, comparison: core.compareReports(a, b), a: { runId: a.runId, at: a.at, target: a.target }, b: { runId: b.runId, at: b.at, target: b.target } };
  }
  try {
    await kvSet(K.res, { nonce: cmd.nonce, action, at: new Date().toISOString(), result: reply });
  } catch (e) {
    log('warn', `回执写入失败：${(e && e.message) || e}`);
  }
}

// ── 收藏目标动作 ────────────────────────────────────────────────────────────
function actionTargetsSave(payload) {
  const cfgR = core.sanitizeTarget(payload.target || payload, state.settings);
  if (!cfgR.ok) return { ok: false, error: cfgR.error };
  const t = { ...cfgR.value, name: String((payload.target || payload).name || '').slice(0, 80) || cfgR.value.url, savedAt: new Date().toISOString() };
  const list = loadTargets();
  const id = String(payload.id || '').trim() || `t-${crypto.randomBytes(3).toString('hex')}`;
  const idx = list.findIndex((x) => x.id === id);
  t.id = id;
  if (idx >= 0) list[idx] = t; else list.unshift(t);
  const saved = saveTargets(list.slice(0, 50));
  return { ok: true, id, savedToFile: saved, target: targetPublic(t) };
}

function actionTargetsDelete(payload) {
  const id = String(payload.id || '');
  const list = loadTargets();
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) return { ok: false, error: `收藏目标不存在：${id}` };
  saveTargets(next);
  return { ok: true };
}

function actionTargetsList() {
  return { ok: true, items: loadTargets().map(targetPublic) };
}

// ── HTTP 服务（/__health + /api/* + 内置试金石）─────────────────────────────
const PORT = parseInt(process.argv[2] || '0', 10) || 0;

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error(`请求体过大（>${Math.round(maxBytes / 1024)}KB）`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authed(req) {
  if (!state.token) return false;
  return String(req.headers['x-apibench-token'] || '') === state.token;
}

async function handleApiOp(req, res) {
  if (!authed(req)) {
    sendJson(res, 401, { ok: false, error: '缺少或错误的 token（面板应从 cap.kv api-bench.meta 读取）' });
    return;
  }
  let body;
  try {
    body = JSON.parse(await readBody(req, 2 * 1024 * 1024));
  } catch (e) {
    sendJson(res, 400, { ok: false, error: `请求体非法：${(e && e.message) || e}` });
    return;
  }
  const action = String(body.action || '');
  const payload = body.payload || {};
  let reply;
  switch (action) {
    case 'start': {
      const cfgR = core.sanitizeTarget(payload, state.settings);
      if (!cfgR.ok) { reply = cfgR; break; }
      reply = startBench(cfgR.value, 'panel', null);
      break;
    }
    case 'stop':
      reply = stopBench();
      break;
    case 'report': {
      const rep = await getReportCached(String(payload.runId || ''));
      reply = rep ? { ok: true, report: rep } : { ok: false, error: `报告不存在或已被清理：${payload.runId || '?'}` };
      break;
    }
    case 'state':
      reply = { ok: true, running: state.running ? liveSnapshot() : null, lastReport: state.lastReport, settings: state.settings };
      break;
    case 'settings_get':
      reply = { ok: true, settings: state.settings };
      break;
    case 'settings_set':
      reply = { ok: true, settings: await saveSettings(payload) };
      break;
    case 'targets_list':
      reply = actionTargetsList();
      break;
    case 'targets_save':
      reply = actionTargetsSave(payload);
      break;
    case 'targets_delete':
      reply = actionTargetsDelete(payload);
      break;
    case 'clear_history':
      await kvSet(K.history, []).catch(() => {});
      reply = { ok: true };
      break;
    default:
      reply = { ok: false, error: `未知 action：${action}` };
  }
  sendJson(res, reply && reply.ok === false && reply.busy ? 409 : 200, reply);
}

function handleLive(req, res) {
  if (!authed(req)) {
    sendJson(res, 401, { ok: false, error: 'token 校验失败' });
    return;
  }
  sendJson(res, 200, {
    ok: true,
    running: !!state.running,
    live: state.running ? liveSnapshot() : null,
    // 图表数据源：最近 90 个每秒采样（面板 800ms 轮询，载荷有界）
    samples: state.running ? state.running.samples.slice(-90) : [],
    lastReportId: state.lastReport ? state.lastReport.runId : null,
  });
}

/** 内置试金石：本服务自身的演示端点（鉴权豁免、零敏感数据、参数上限护栏） */
function handleDemo(req, res, pathname, query) {
  if (pathname === '/demo/ok') {
    sendJson(res, 200, { ok: true, demo: 'ok', ts: Date.now() });
    return;
  }
  if (pathname === '/demo/slow') {
    const ms = Math.min(Math.max(parseInt(query.get('ms') || '0', 10) || 0, 0), 2000);
    setTimeout(() => sendJson(res, 200, { ok: true, demo: 'slow', ms }), ms);
    return;
  }
  if (pathname === '/demo/flaky') {
    const p = Math.min(Math.max(parseFloat(query.get('p') || '0') || 0, 0), 0.5);
    if (Math.random() < p) { sendJson(res, 500, { ok: false, demo: 'flaky' }); return; }
    sendJson(res, 200, { ok: true, demo: 'flaky' });
    return;
  }
  if (pathname === '/demo/echo' && req.method === 'POST') {
    readBody(req, 64 * 1024).then((body) => {
      sendJson(res, 200, { ok: true, demo: 'echo', len: Buffer.byteLength(body, 'utf8') });
    }).catch(() => sendJson(res, 413, { ok: false, error: 'body 过大' }));
    return;
  }
  sendJson(res, 404, { ok: false, error: '未知 demo 端点（/demo/ok /demo/slow?ms= /demo/flaky?p= /demo/echo）' });
}

const server = http.createServer((req, res) => {
  // WHATWG URL 解析（legacy url.parse 的 query 是对象而非 URLSearchParams）
  const parsed = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';

  if (pathname === '/__health') {
    sendJson(res, 200, { ok: true, plugin: PLUGIN_ID, version: VERSION, running: !!state.running, degraded: state.degraded });
    return;
  }
  if (pathname.startsWith('/demo/')) {
    handleDemo(req, res, pathname, parsed.searchParams);
    return;
  }
  if (pathname === '/api/live' && req.method === 'GET') {
    handleLive(req, res);
    return;
  }
  if (pathname === '/api/op' && req.method === 'POST') {
    handleApiOp(req, res).catch((e) => {
      log('warn', `api/op 异常：${(e && e.message) || e}`);
      try { sendJson(res, 500, { ok: false, error: `内部错误：${(e && e.message) || e}` }); } catch (_) { /* 已响应 */ }
    });
    return;
  }
  sendJson(res, 404, { ok: false, error: '未知路径（/api/op /api/live /demo/*）' });
});

// ── 入口 ────────────────────────────────────────────────────────────────────
async function main() {
  state.appConfigDir = process.argv[3] || '';
  state.port = PORT;
  initLog(state.appConfigDir);
  state.kv = createKvClient({
    appConfigDir: state.appConfigDir,
    log: (lv, msg) => log(lv, msg),
  });

  // token 持久化：重启不换（面板/MCP 缓存的 meta 持续可用）
  try {
    const meta = await state.kv.kvGet(K.meta);
    state.token = (meta && typeof meta.token === 'string' && meta.token) || crypto.randomBytes(16).toString('hex');
  } catch (_) {
    state.token = crypto.randomBytes(16).toString('hex');
  }

  await loadSettings();
  const targets = loadTargets();
  log('info', `服务启动 :${PORT}（目标收藏 ${targets.length} 条，token ${state.token ? '就绪' : '缺失'}）`);

  server.listen(PORT, '127.0.0.1', () => {
    log('info', `健康端点就绪 127.0.0.1:${server.address().port}/__health`);
  });

  setInterval(consumeCmd, TICK_MS).unref();
  let beatTimer = setInterval(beatMeta, META_BEAT_IDLE_MS);
  // 运行期 1s 心跳（携带实时进度）；空闲回到 15s
  setInterval(() => {
    const want = state.running ? META_BEAT_RUNNING_MS : META_BEAT_IDLE_MS;
    if (beatTimer._idleTimeout !== want) {
      clearInterval(beatTimer);
      beatTimer = setInterval(beatMeta, want);
    }
  }, 3000).unref();
  await beatMeta().catch(() => {});
}

main().catch((e) => {
  log('error', `启动失败：${(e && e.stack) || e}`);
  process.exit(1);
});
