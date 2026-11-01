'use strict';
/**
 * main.js —— 站点体检台后台服务（node >= 18，零外部依赖）
 *
 * 单写者权威：site-audit.meta / site-audit.latest / site-audit.runs /
 * site-audit.report.* / site-audit.history / site-audit.settings 全部只由本服务写。
 * 面板走直连 HTTP（127.0.0.1 + token，低延迟实时进度）；MCP 经 site-audit.cmd
 * 单槽信箱表达意图（{nonce, action, payload}），服务轮询消费，回执写
 * site-audit.res（nonce 对齐）。面板与 AI 共用同一引擎与同一报告库。
 *
 * 安全不变量：
 *   - 服务只监听 127.0.0.1；/api/* 校验 X-SiteAudit-Token（token 持久化在
 *     site-audit.meta，服务重启不换）；
 *   - 爬取围栏（crawler.js）：云元数据端点永远拒绝；公网种子场景下跨 host
 *     核查解析到私网地址一律拦截；域外链接只验存活不深爬；
 *   - 护栏：页数 ≤5000、总时长 ≤30min、并发 ≤12、单页超时 ≤30s、单页体积 ≤2MB；
 *     同一时刻只跑一次体检，可中止；无定时体检、无自动重爬。
 *
 * 内置试金石站（本服务自身端点，鉴权豁免、零外网依赖）：
 *   GET /demo/            体检入口页（链向下面所有演示页）
 *   GET /demo/ok          健康页（含指向 robots 排除页的链接）
 *   GET /demo/missing-404 404（→ broken_page）
 *   GET /demo/redirect-1  302→redirect-2→301→ok（两跳链 → redirect_chain）
 *   GET /demo/slow?ms=    延迟响应（默认 2200ms → slow_page）
 *   GET /demo/no-title    无标题/无描述/两张图缺 alt + 一张 404 图
 *   GET /demo/noindex     meta robots noindex
 *   GET /demo/dup-1|dup-2 同标题两页（→ duplicate_title）
 *   GET /demo/private     robots.txt Disallow（→ robots_blocked）
 *   GET /robots.txt       试金石 robots（含 Sitemap 声明）
 *   GET /sitemap.xml      试金石 sitemap（含孤岛页 /demo/orphan）
 *   试金石外链指向 https://demo.invalid/（RFC 2606 保留 TLD，离线确定失败）
 * 用途：首次使用零配置验证工具链；也是集成测试夹具。
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
const core = require('../shared/audit-core');
const { Crawler } = require('./crawler');

const PLUGIN_ID = 'site-audit';
const PREFIX = 'site-audit.';
const TICK_MS = 1000;
const META_BEAT_IDLE_MS = 15 * 1000;
const META_BEAT_RUNNING_MS = 1000;
const HISTORY_MAX = 30;
const KEEP_REPORTS = 20;
const PROGRESS_THROTTLE_MS = 300;
const MCP_RUN_WAIT_DEFAULT_MS = 150 * 1000;

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

// ── 日志（自落盘 + 512KB 轮转）──────────────────────────────────────────────
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
  settings: defaultSettings(),
  running: null, // {auditId, crawler, cfg, source, startedAt, lastProgressAt, snapshot}
  lastReport: null,
};

function defaultSettings() {
  return {
    maxPages: core.LIMITS.maxPages.default,
    delayMs: core.LIMITS.delayMs.default,
    timeoutS: core.LIMITS.timeoutS.default,
    concurrency: core.LIMITS.concurrency.default,
    slowMs: core.LIMITS.slowMs.default,
    auditTimeoutS: core.LIMITS.auditTimeoutS.default,
    externalCap: core.LIMITS.externalCap.default,
    respectRobots: true,
    checkExternal: true,
    checkAssets: true,
  };
}

function normalizeSettings(s) {
  const src = s && typeof s === 'object' ? s : {};
  const d = core.LIMITS;
  const out = defaultSettings();
  out.maxPages = core.clamp(src.maxPages, d.maxPages, out.maxPages);
  out.delayMs = core.clamp(src.delayMs, d.delayMs, out.delayMs);
  out.timeoutS = core.clamp(src.timeoutS, d.timeoutS, out.timeoutS);
  out.concurrency = core.clamp(src.concurrency, d.concurrency, out.concurrency);
  out.slowMs = core.clamp(src.slowMs, d.slowMs, out.slowMs);
  out.auditTimeoutS = core.clamp(src.auditTimeoutS, d.auditTimeoutS, out.auditTimeoutS);
  out.externalCap = core.clamp(src.externalCap, d.externalCap, out.externalCap);
  out.respectRobots = src.respectRobots !== false;
  out.checkExternal = src.checkExternal !== false;
  out.checkAssets = src.checkAssets !== false;
  return out;
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

// ── kv 持久化 ───────────────────────────────────────────────────────────────
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

async function kvSet(key, value) { await state.kv.kvSet(key, value); }

function newAuditId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

// ── 体检生命周期 ────────────────────────────────────────────────────────────
function startAudit(cfg, source, nonce) {
  if (state.running) {
    return { ok: false, busy: true, error: `已有体检在运行（${state.running.cfg.seedUrl}）。先停止或等它完成。` };
  }
  const auditId = newAuditId();
  const crawler = new Crawler(cfg.options, {
    onProgress: () => { /* 快照在 liveSnapshot() 现取，无需缓存 */ },
    onEvent: () => { /* 事件由 crawler.events 保存 */ },
  });
  const run = { auditId, crawler, cfg, source: source === 'mcp' ? 'mcp' : 'panel', startedAt: Date.now(), nonce: nonce || null };
  state.running = run;
  log('info', `体检启动 [${run.source}] ${cfg.seedUrl} maxPages=${cfg.options.maxPages} delay=${cfg.options.delayMs}ms robots=${cfg.options.respectRobots}`);

  (async () => {
    let report = null;
    let fatal = null;
    try {
      const result = await crawler.run(cfg.seedUrl);
      report = core.buildReport({
        auditId,
        seed: cfg.seedUrl,
        scopeHosts: result.scopeHosts,
        options: cfg.options,
        pages: result.pages,
        assets: result.assets,
        externals: result.externals,
        robots: result.robots,
        sitemap: result.sitemap,
        aborted: result.aborted,
        durationMs: result.durationMs,
        externalSkipped: result.externalSkipped,
      });
    } catch (e) {
      fatal = String((e && e.message) || e);
      log('warn', `体检异常终止：${fatal}`);
      // 失败也要落一份可解释的报告（让面板/AI 看到 dead seed 的原因）
      report = core.buildReport({
        auditId,
        seed: cfg.seedUrl,
        scopeHosts: crawler.scopeHosts || [],
        options: cfg.options,
        pages: crawler.pages || [],
        assets: crawler.assets || [],
        externals: [...(crawler.externalMap ? crawler.externalMap.values() : [])],
        robots: crawler.robotsInfo || null,
        sitemap: crawler.sitemap || null,
        aborted: true,
        durationMs: Date.now() - run.startedAt,
        externalSkipped: crawler.externalSkipped || 0,
      });
      report.fatal = fatal;
    }
    // 空闲语义 ⟺ 报告已落库：running 清空放在持久化之后（面板轮询 live 变空闲即可立刻读到报告）
    await finishAudit(run, report, fatal).catch((e) => log('warn', `报告落库失败（内存中仍可读）：${(e && e.message) || e}`));
    if (state.running === run) state.running = null;
  })();

  return { ok: true, auditId };
}

async function finishAudit(run, report, fatal) {
  state.lastReport = report;
  try {
    await kvSet(K.latest, report);
    let runs = [];
    try { const v = await state.kv.kvGet(K.runs); runs = Array.isArray(v) ? v : []; } catch (_) { /* 首次 */ }
    runs.unshift(run.auditId);
    const keep = runs.slice(0, KEEP_REPORTS);
    await kvSet(K.runs, keep);
    for (const old of runs.slice(KEEP_REPORTS)) await state.kv.kvDel(K.report(old)).catch(() => {});
    await kvSet(K.report(run.auditId), report);
    await pushHistory({
      auditId: run.auditId,
      at: report.at,
      seed: report.seed.url,
      scopeHosts: report.seed.scopeHosts,
      pagesCrawled: report.stats.pagesCrawled,
      assetsChecked: report.stats.assetsChecked,
      externalChecked: report.stats.externalChecked,
      durationMs: report.stats.durationMs,
      score: report.score.value,
      errors: report.issues.filter((i) => i.severity === 'error').reduce((a, i) => a + i.count, 0),
      warns: report.issues.filter((i) => i.severity === 'warn').reduce((a, i) => a + i.count, 0),
      aborted: report.aborted,
      fatal: report.fatal || null,
      verdictOne: report.score.verdict.oneLine,
    });
    log('info', `体检完成 ${run.auditId}：${report.score.verdict.oneLine}${fatal ? `（fatal=${fatal}）` : ''}`);
  } catch (e) {
    log('warn', `报告持久化失败（内存中仍可读）：${(e && e.message) || e}`);
  }
  if (run.source === 'mcp' && run.nonce) {
    try {
      await kvSet(K.res, { nonce: run.nonce, action: 'run', at: report.at, result: { ok: true, auditId: run.auditId, fatal: fatal || null, report } });
    } catch (e) {
      log('warn', `MCP 回执写入失败：${(e && e.message) || e}`);
    }
  }
}

function stopAudit() {
  const r = state.running;
  if (!r) return { ok: false, error: '当前没有运行中的体检' };
  r.crawler.stop();
  return { ok: true, auditId: r.auditId };
}

async function getReportCached(auditId) {
  if (state.lastReport && state.lastReport.auditId === auditId) return state.lastReport;
  try { return await state.kv.kvGet(K.report(auditId)); } catch (_) { return null; }
}

/** 信箱 issues 检索：{auditId?, type?, severity?, limit} */
async function collectIssues(payload) {
  const auditId = String(payload.auditId || '');
  const rep = auditId ? await getReportCached(auditId) : state.lastReport;
  if (!rep) return { ok: false, error: `报告不存在${auditId ? `：${auditId}` : '（尚无任何体检）'}` };
  const type = String(payload.type || '');
  const severity = String(payload.severity || '');
  const limit = Math.min(Math.max(Number(payload.limit) || 20, 1), 100);
  const rows = [];
  for (const g of rep.issues) {
    if (type && g.type !== type) continue;
    if (severity && g.severity !== severity) continue;
    for (const it of g.items) {
      rows.push({ type: g.type, severity: g.severity, label: g.label, url: it.url, detail: it.detail || '', source: it.source || null });
      if (rows.length >= limit) break;
    }
    if (rows.length >= limit) break;
  }
  return {
    ok: true,
    auditId: rep.auditId,
    total: rep.issues.reduce((a, g) => a + g.count, 0),
    items: rows,
  };
}

// ── meta 心跳（面板/移动端引导事实库；运行期 1s 携带实时进度）────────────────
function liveSnapshot() {
  const r = state.running;
  if (!r) return null;
  const snap = r.crawler.snapshot();
  return {
    auditId: r.auditId,
    source: r.source,
    seed: r.cfg.seedUrl,
    phase: snap.phase,
    pagesDone: snap.pagesDone,
    queueLen: snap.queueLen,
    assetsDone: snap.assetsDone,
    externalDone: snap.externalDone,
    externalTotal: snap.externalTotal,
    errors: snap.errors,
    current: snap.current,
    elapsedS: snap.elapsedS,
    scopeHosts: snap.scopeHosts,
    maxPages: r.cfg.options.maxPages,
    recentEvents: snap.recentEvents,
  };
}

function metaPayload() {
  return {
    ts: new Date().toISOString(),
    version: core.VERSION,
    port: state.port,
    token: state.token,
    degraded: state.degraded,
    lastBridgeErr: state.lastBridgeErr,
    running: state.running ? liveSnapshot() : null,
    lastReportId: state.lastReport ? state.lastReport.auditId : null,
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
const MAILBOX_ACTIONS = new Set(['run', 'stop', 'state', 'report', 'history', 'issues', 'settings_set']);

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
    const cfgR = core.sanitizeOptions({ ...state.settings, ...cmd.payload });
    if (!cfgR.ok) {
      reply = { ok: false, error: cfgR.error };
    } else {
      const startR = startAudit(cfgR.value, 'mcp', cmd.nonce);
      if (!startR.ok) reply = startR;
      // else：回执由 finishAudit 在完成时写入（MCP 侧轮询 nonce）
      else return;
    }
  } else if (action === 'stop') {
    reply = stopAudit();
  } else if (action === 'report') {
    const rep = await getReportCached(String(cmd.payload.auditId || cmd.payload.runId || ''));
    reply = rep ? { ok: true, report: rep } : { ok: false, error: `报告不存在或已被清理：${cmd.payload.auditId || '?'}` };
  } else if (action === 'state') {
    reply = { ok: true, running: state.running ? liveSnapshot() : null, latest: state.lastReport, meta: { version: core.VERSION } };
  } else if (action === 'history') {
    const h = await loadHistory();
    reply = { ok: true, items: h.slice(0, Math.min(Math.max(Number(cmd.payload.limit) || 20, 1), HISTORY_MAX)) };
  } else if (action === 'issues') {
    reply = await collectIssues(cmd.payload || {});
  } else if (action === 'settings_set') {
    const s = await saveSettings(cmd.payload);
    reply = { ok: true, settings: s };
  }
  try {
    await kvSet(K.res, { nonce: cmd.nonce, action, at: new Date().toISOString(), result: reply });
  } catch (e) {
    log('warn', `回执写入失败：${(e && e.message) || e}`);
  }
}

// ── HTTP 服务（/__health + /api/* + 内置试金石站）───────────────────────────
const PORT = parseInt(process.argv[2] || '0', 10) || 0;

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendHtml(res, code, html) {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
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
  return String(req.headers['x-siteaudit-token'] || '') === state.token;
}

async function handleApiOp(req, res) {
  if (!authed(req)) {
    sendJson(res, 401, { ok: false, error: '缺少或错误的 token（面板应从 cap.kv site-audit.meta 读取）' });
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
      const cfgR = core.sanitizeOptions({ ...state.settings, ...payload });
      if (!cfgR.ok) { reply = cfgR; break; }
      reply = startAudit(cfgR.value, 'panel', null);
      break;
    }
    case 'stop':
      reply = stopAudit();
      break;
    case 'report': {
      const rep = await getReportCached(String(payload.auditId || ''));
      reply = rep ? { ok: true, report: rep } : { ok: false, error: `报告不存在或已被清理：${payload.auditId || '?'}` };
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
    case 'history':
      reply = { ok: true, items: await loadHistory() };
      break;
    case 'issues':
      reply = await collectIssues(payload);
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
    lastReportId: state.lastReport ? state.lastReport.auditId : null,
  });
}

// ── 内置试金石站 ────────────────────────────────────────────────────────────
function demoPage(title, desc, body, opts = {}) {
  const meta = [];
  if (desc !== null) meta.push(`  <meta name="description" content="${desc}">`);
  if (opts.robots) meta.push(`  <meta name="robots" content="${opts.robots}">`);
  return [
    '<!doctype html>',
    `<html lang="${opts.lang || 'zh-CN'}">`,
    '<head>',
    '  <meta charset="utf-8">',
    ...(title !== null ? [`  <title>${title}</title>`] : []),
    ...meta,
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
  ].join('\n');
}

const DEMO_DESC = '站点体检台内置试金石页：用于零配置验证爬虫与检查项是否工作。';

function handleDemo(req, res, pathname, query, sendHtmlFn) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: '试金石只接受 GET' });
    return;
  }
  switch (pathname) {
    case '/demo/':
    case '/demo/index.html':
      sendHtmlFn(res, 200, demoPage('试金石体检入口', DEMO_DESC, [
        '  <h1>站点体检台试金石</h1>',
        '  <p>这一页链向所有演示分支：<a href="/demo/ok">健康页</a>、',
        '    <a href="/demo/missing-404">404 页</a>、<a href="/demo/redirect-1">重定向链</a>、',
        '    <a href="/demo/slow?ms=2200">慢页</a>、<a href="/demo/no-title">无标题页</a>、',
        '    <a href="/demo/noindex">noindex 页</a>、<a href="/demo/dup-1">重复标题A</a>、',
        '    <a href="/demo/dup-2">重复标题B</a>、<a href="/demo/private">robots 排除页</a>、',
        '    <a href="https://demo.invalid/">外部死链</a>。</p>',
      ].join('\n')));
      return;
    case '/demo/ok':
      sendHtmlFn(res, 200, demoPage('试金石健康页', DEMO_DESC, [
        '  <h1>健康页</h1>',
        `  <p>这页完全健康。顺带链向 <a href="/demo/private">robots 排除页</a>（robots.txt 不允许爬）。</p>`,
      ].join('\n')));
      return;
    case '/demo/missing-404':
      sendJson(res, 404, { ok: false, demo: 'missing' });
      return;
    case '/demo/redirect-1':
      res.writeHead(302, { Location: `http://127.0.0.1:${state.port}/demo/redirect-2` });
      res.end();
      return;
    case '/demo/redirect-2':
      res.writeHead(301, { Location: `http://127.0.0.1:${state.port}/demo/ok` });
      res.end();
      return;
    case '/demo/slow': {
      const ms = Math.min(Math.max(parseInt(query.get('ms') || '2200', 10) || 2200, 0), 3000);
      setTimeout(() => sendHtmlFn(res, 200, demoPage('试金石慢页', DEMO_DESC, '  <h1>慢页</h1>\n  <p>延迟响应。</p>')), ms);
      return;
    }
    case '/demo/no-title':
      sendHtmlFn(res, 200, demoPage(null, null, [
        '  <h1>无标题页</h1>',
        '  <img src="/demo/img-exists.svg">',
        '  <img src="/demo/img-exists.svg" alt="装饰图">',
        '  <img src="/demo/img-missing.png" alt="404 图">',
      ].join('\n')));
      return;
    case '/demo/noindex':
      sendHtmlFn(res, 200, demoPage('试金石 noindex 页', DEMO_DESC, '  <h1>noindex 页</h1>', { robots: 'noindex, follow' }));
      return;
    case '/demo/dup-1':
      sendHtmlFn(res, 200, demoPage('重复标题演示页（第一份）', DEMO_DESC, '  <h1>重复标题 A</h1>'));
      return;
    case '/demo/dup-2':
      sendHtmlFn(res, 200, demoPage('重复标题演示页（第一份）', DEMO_DESC, '  <h1>重复标题 B</h1>'));
      return;
    case '/demo/private':
      sendHtmlFn(res, 200, demoPage('robots 排除页', DEMO_DESC, '  <h1>不应被爬到的页</h1>'));
      return;
    case '/demo/img-exists.svg':
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>');
      return;
    case '/demo/img-missing.png':
      sendJson(res, 404, { ok: false, demo: 'img-missing' });
      return;
    case '/robots.txt':
      sendHtml(res, 200, [
        'User-agent: *',
        'Disallow: /demo/private',
        `Sitemap: http://127.0.0.1:${state.port}/sitemap.xml`,
        '',
      ].join('\n'));
      return;
    case '/sitemap.xml':
      sendHtml(res, 200, [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        `  <url><loc>http://127.0.0.1:${state.port}/demo/</loc></url>`,
        `  <url><loc>http://127.0.0.1:${state.port}/demo/ok</loc></url>`,
        `  <url><loc>http://127.0.0.1:${state.port}/demo/orphan</loc></url>`,
        '</urlset>',
        '',
      ].join('\n'));
      return;
    default:
      sendJson(res, 404, { ok: false, error: '未知试金石路径' });
  }
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  const sendHtmlFn = (r, code, html) => sendHtml(r, code, html);

  if (pathname === '/__health') {
    sendJson(res, 200, { ok: true, plugin: PLUGIN_ID, version: core.VERSION, running: !!state.running, degraded: state.degraded });
    return;
  }
  if (pathname === '/' && !authed(req)) {
    sendJson(res, 200, { ok: true, plugin: PLUGIN_ID, hint: '站点体检台服务。面板经 cap.kv site-audit.meta 引导；试金石站：/demo/' });
    return;
  }
  if ((pathname === '/demo' || pathname.startsWith('/demo/')) || pathname === '/robots.txt' || pathname === '/sitemap.xml') {
    handleDemo(req, res, pathname === '/demo' ? '/demo/' : pathname, parsed.searchParams, sendHtmlFn);
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
  log('info', `服务启动 :${PORT}（token ${state.token ? '就绪' : '缺失'}）`);

  // 先等端口落定再发首次心跳：meta.port 必须是真实端口（宿主传固定端口，测试传 0 随机）
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  state.port = server.address().port;
  log('info', `健康端点就绪 127.0.0.1:${state.port}/__health · 试金石站 /demo/`);

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
