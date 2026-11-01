#!/usr/bin/env node
'use strict';
/**
 * main.js —— HAR 分析台后台服务（零依赖，node >= 18）
 *
 * 职责：
 *   - 重量级事实：读本地 .har 文件 → 解析校验 → 概览分析 → 行投影（脱敏）落 kv；
 *   - 命令消费（cap.kv 单槽信箱 har.cmd，先删后做 + nonce 防重放）：
 *       open（打开文件）/ entry（单条详情）/ sanitize（脱敏导出）/ compare（对比）/
 *       selftest（试金石：内存合成 HAR 全链路断言，零网络）；
 *   - 投影键（har.*）：meta 心跳 / report 概览 / rows 分块 / audit / diff / hist / settings。
 *
 * 安全边界：无 HTTP 管理 API（仅 /__health）；无任何出网请求；所有对外投影
 * 过 core.redactText/maskValue（kv 不落明文密钥）；文件护栏 150MB / 2 万条目。
 *
 * 启动参数：node main.js <port> <appConfigDir>；生命周期由宿主 PluginServiceManager 管理。
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const core = require('../shared/core');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 1000; // har-lens 命令要抢在 MCP 轮询前消费，tick 1s
const META_BEAT_MS = 60 * 1000;
const ROWS_PER_CHUNK = core.ROWS_PER_CHUNK;

const K = {
  meta: 'har.meta',
  report: 'har.report',
  rowsIdx: 'har.rows.idx',
  rows: (n) => `har.rows.${n}`,
  audit: 'har.audit',
  diff: 'har.diff',
  hist: 'har.hist',
  settings: 'har.settings',
  cmd: 'har.cmd',
  result: 'har.result',
  selftest: 'har.selftest',
};

// ── 文件日志（512KB 轮转；协议数据只走 stdout，日志走 stderr）────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'har-lens.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.HAR_DEBUG === '1';
function log(level, msg) {
  const line = `[har-lens:${level}] ${new Date().toISOString()} ${msg}`;
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
  process.stderr.write('[har-lens:fatal] 缺少端口参数（宿主应注入 {{port}}）\n');
  process.exit(1);
}
initLog(APP_CONFIG_DIR);

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

// 单槽活动分析（内存权威；同一时刻只持有一份解析结果，下次 open 释放替换）
let active = null; // {path, fileBytes, har, report, rows, t0, openedAt, truncated}
let activeState = 'idle'; // idle | parsing | ready | error
let activeError = '';
let lastCmdNonce = '';
let lastMetaAt = 0;
let degraded = false;
const startedAt = Date.now();
let actualPort = PORT;
let busyJob = false; // 重活单飞（open/compare/sanitize 串行化，防内存叠加）

// ── settings ───────────────────────────────────────────────────────────────
// 规范形统一在 core.normalizeSettings（服务/面板/MCP 三端同一口径）
let settings = core.normalizeSettings(null);

async function loadSettings() {
  const raw = await kv.kvGet(K.settings).catch(() => null);
  if (raw && typeof raw === 'object') settings = core.normalizeSettings(raw);
}

// ── 投影写出（行数变化才重写 rows.*；孤儿分块由 idx.chunkCount 描述）─────────
let prevRowsChunks = 0;
async function writeProjection() {
  if (!active || activeState !== 'ready') return;
  const rows = active.rows.slice(0, core.ROW_CAP);
  const chunks = core.chunkRows(rows, ROWS_PER_CHUNK);
  await kv.kvSet(K.report, { ...active.report, path: active.path, fileBytes: active.fileBytes, openedAt: active.openedAt, truncatedEntries: active.truncated, auditHigh: auditQuickHigh() }).catch((e) => { degraded = true; log('warn', `report 写入失败: ${e.message}`); });
  await kv.kvSet(K.rowsIdx, { count: rows.length, total: active.report.entryCount, chunkCount: chunks.length, truncated: active.report.entryCount > rows.length, updatedAt: Date.now() }).catch(() => {});
  for (let i = 0; i < chunks.length; i++) {
    await kv.kvSet(K.rows(i), chunks[i]).catch(() => {});
  }
  // 缩减后残留的旧分块要清掉
  for (let i = chunks.length; i < prevRowsChunks; i++) {
    await kv.kvDel(K.rows(i)).catch(() => {});
  }
  prevRowsChunks = chunks.length;
  // 审计报告（打开即算，面板/AI 免二次等待）
  try {
    const audit = core.auditHar(active.har);
    await kv.kvSet(K.audit, audit);
  } catch (e) {
    log('warn', `审计失败: ${e.message}`);
  }
  await kv.kvDel(K.diff).catch(() => {});
}

/** 快速高危计数（不落明细；明细在 har.audit） */
function auditQuickHigh() {
  try {
    const a = core.auditHar(active.har);
    return { total: a.total, high: a.highCount };
  } catch (_) { return { total: -1, high: -1 }; }
}

// ── open ───────────────────────────────────────────────────────────────────
function normalizeInputPath(p) {
  const raw = String(p || '').trim().replace(/^"(.*)"$/, '$1').trim();
  if (!raw) return { ok: false, error: '路径为空' };
  if (/[<>|\u0000]/.test(raw)) return { ok: false, error: '路径含非法字符' };
  if (/[?*&]/.test(path.basename(raw))) return { ok: false, error: '文件名含通配/URL 字符（请给具体文件路径）' };
  const abs = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  const ext = path.extname(abs).toLowerCase();
  if (ext !== '.har' && ext !== '.json') return { ok: false, error: `只接受 .har/.json 文件（收到 ${ext || '无扩展名'}）` };
  return { ok: true, abs };
}

function sha256File(fp) {
  try {
    const buf = fs.readFileSync(fp);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch (_) { return ''; }
}

async function doOpen(cmd) {
  const np = normalizeInputPath(cmd.path);
  if (!np.ok) return { ok: false, error: np.error };
  let st;
  try { st = fs.statSync(np.abs); } catch (_) { return { ok: false, error: `文件不存在或不可读: ${np.abs}` }; }
  if (!st.isFile()) return { ok: false, error: `不是普通文件: ${np.abs}` };
  if (st.size > core.MAX_FILE_BYTES) {
    return { ok: false, error: `文件 ${(st.size / 1048576).toFixed(1)}MB 超过上限 ${core.MAX_FILE_BYTES / 1048576}MB（请在浏览器导出时过滤请求，或拆分 HAR）` };
  }
  const hadReady = !!(active && activeState === 'ready'); // 失败打开不清掉已就绪的旧分析
  activeState = 'parsing';
  await kv.kvSet(K.meta, buildMeta()).catch(() => {});
  let har;
  try {
    const text = fs.readFileSync(np.abs, 'utf8');
    har = JSON.parse(text); // 巨文件此步阻塞数秒，meta.parsing 已提前落库
  } catch (e) {
    activeError = e.name === 'SyntaxError' ? `不是合法 JSON: ${String(e.message).slice(0, 160)}` : `读取失败: ${e.message}`;
    activeState = hadReady ? 'ready' : 'error';
    await kv.kvSet(K.meta, buildMeta()).catch(() => {});
    return { ok: false, error: activeError };
  }
  const v = core.validateHar(har);
  if (!v.ok) {
    activeError = v.error;
    activeState = hadReady ? 'ready' : 'error';
    await kv.kvSet(K.meta, buildMeta()).catch(() => {});
    return { ok: false, error: v.error };
  }
  // 释放上一份引用再分析（控制内存峰值）
  active = null;
  const { report, rows, t0 } = core.analyzeHar(har);
  const truncated = (har.log.entries || []).length > core.MAX_ENTRIES;
  active = {
    path: np.abs,
    fileBytes: st.size,
    har: truncated ? { log: { ...har.log, entries: har.log.entries.slice(0, core.MAX_ENTRIES) } } : har,
    report, rows, t0,
    openedAt: Date.now(),
    truncated,
    warnings: v.warnings || [],
  };
  activeError = '';
  activeState = 'ready';
  await writeProjection();
  await kv.kvSet(K.meta, buildMeta()).catch(() => {}); // 立即刷新 meta（否则 ready 态要等 60s 心跳）
  await pushHist({ path: np.abs, fileBytes: st.size, entryCount: report.entryCount });
  log('info', `已打开 ${np.abs}（${(st.size / 1048576).toFixed(2)}MB，${report.entryCount} 条，高危 ${report ? '' : ''}）`);
  return {
    ok: true,
    path: np.abs,
    fileBytes: st.size,
    entryCount: report.entryCount,
    spanMs: report.spanMs,
    errorCount: report.errorCount,
    warnings: v.warnings || [],
    summary: summarizeReport(report),
  };
}

function summarizeReport(r) {
  return [
    `${r.entryCount} 条请求 · 时间跨度 ${(r.spanMs / 1000).toFixed(2)}s · 传输 ${(r.transferBytes / 1024).toFixed(0)}KB`,
    `状态: 2xx ${r.statusCounts['2xx']} / 3xx ${r.statusCounts['3xx']} / 4xx ${r.statusCounts['4xx']} / 5xx ${r.statusCounts['5xx']}`,
    `时延: p50 ${r.times.p50}ms · p95 ${r.times.p95}ms · max ${r.times.max}ms`,
    r.domains[0] ? `TOP 域: ${r.domains.slice(0, 3).map((d) => `${d.h}(${d.n})`).join(', ')}` : '',
  ].filter(Boolean).join('；');
}

async function pushHist(item) {
  const hists = (await kv.kvGet(K.hist).catch(() => null)) || [];
  await kv.kvSet(K.hist, core.makeHist(Array.isArray(hists) ? hists : [], item)).catch(() => {});
}

// ── entry 详情 ──────────────────────────────────────────────────────────────
async function doEntry(cmd) {
  if (!active || activeState !== 'ready') return { ok: false, error: '尚未打开 HAR（先 har_open）' };
  const i = Number(cmd.index);
  if (!Number.isInteger(i) || i < 0) return { ok: false, error: 'index 非法' };
  const entries = active.har.log.entries;
  if (i >= entries.length) return { ok: false, error: `index 越界（共 ${entries.length} 条）` };
  return { ok: true, entry: core.entryDetail(entries[i], i) };
}

// ── sanitize 导出 ───────────────────────────────────────────────────────────
function normalizeOutPath(input, srcPath) {
  if (input && String(input).trim()) {
    const raw = String(input).trim().replace(/^"(.*)"$/, '$1').trim();
    if (/[<>|\u0000?*]/.test(raw)) return { ok: false, error: '输出路径含非法字符' };
    const abs = path.isAbsolute(raw) ? raw : path.resolve(path.dirname(srcPath), raw);
    if (path.extname(abs).toLowerCase() !== '.har') return { ok: false, error: '输出文件扩展名须为 .har' };
    return { ok: true, abs };
  }
  // 默认：源文件同目录 <name>.sanitized.har
  const dir = path.dirname(srcPath);
  const base = path.basename(srcPath).replace(/\.(har|json)$/i, '');
  return { ok: true, abs: path.join(dir, `${base}.sanitized.har`) };
}

async function doSanitize(cmd) {
  if (!active || activeState !== 'ready') return { ok: false, error: '尚未打开 HAR（先 har_open）' };
  const confirm = cmd.confirm === true;
  const outN = normalizeOutPath(cmd.outputPath, active.path);
  if (!outN.ok) return { ok: false, error: outN.error };
  if (!confirm) {
    // 预检：报告将写到哪里 + 将做哪些脱敏（不改盘）
    const exists = fs.existsSync(outN.abs);
    return {
      ok: true, preview: true,
      outputPath: outN.abs, overwrite: exists,
      options: settings.sanitize,
      hint: exists ? '目标文件已存在；确认覆盖请带 confirm:true 重调（需在预览中明确说明覆盖）' : '确认导出请带 confirm:true 重调',
    };
  }
  if (fs.existsSync(outN.abs) && cmd.overwrite !== true) {
    return { ok: false, error: `目标已存在: ${outN.abs}（覆盖须带 overwrite:true）` };
  }
  const { har, stats } = core.sanitizeHar(active.har, settings.sanitize);
  const json = JSON.stringify(har);
  try { fs.writeFileSync(outN.abs, json, 'utf8'); } catch (e) {
    return { ok: false, error: `写出失败: ${e.message}` };
  }
  const sha = sha256File(outN.abs);
  // 脱敏后复核：结构合法 + 审计应显著下降（自查闸：复核不过则如实报告）
  const rv = core.validateHar(JSON.parse(json));
  const reAudit = core.auditHar(har);
  log('info', `已导出 ${outN.abs} sha256=${sha} 脱敏 ${Object.entries(stats).map(([k, n]) => `${k}:${n}`).join(',') || '无命中'} 复核审计 total=${reAudit.total}`);
  return {
    ok: true, outputPath: outN.abs, bytes: Buffer.byteLength(json), sha256: sha,
    stats, recheck: { valid: rv.ok, auditTotal: reAudit.total, auditHigh: reAudit.highCount },
  };
}

// ── compare ────────────────────────────────────────────────────────────────
async function doCompare(cmd) {
  if (!active || activeState !== 'ready') return { ok: false, error: '尚未打开基准 HAR（先 har_open）' };
  const np = normalizeInputPath(cmd.path);
  if (!np.ok) return { ok: false, error: np.error };
  let st;
  try { st = fs.statSync(np.abs); } catch (_) { return { ok: false, error: `对比文件不存在或不可读: ${np.abs}` }; }
  if (!st.isFile()) return { ok: false, error: `不是普通文件: ${np.abs}` };
  if (st.size > core.MAX_FILE_BYTES) return { ok: false, error: `对比文件超过 ${core.MAX_FILE_BYTES / 1048576}MB 上限` };
  let cand;
  try { cand = JSON.parse(fs.readFileSync(np.abs, 'utf8')); } catch (e) {
    return { ok: false, error: `对比文件不是合法 JSON: ${String(e.message).slice(0, 120)}` };
  }
  const v = core.validateHar(cand);
  if (!v.ok) return { ok: false, error: `对比文件 ${v.error}` };
  const diff = core.compareHars(active.har, cand);
  await kv.kvSet(K.diff, {
    ...diff,
    basePath: active.path,
    candPath: np.abs,
  }).catch((e) => { log('warn', `diff 写入失败: ${e.message}`); });
  return { ok: true, candPath: np.abs, summary: diff.summary };
}

// ── selftest（试金石：内存合成 fixture 全链路断言，零网络）────────────────────
async function cmdSelftest() {
  const t0 = Date.now();
  const checks = [];
  const ck = (name, pass, detail) => checks.push({ item: name, pass: !!pass, detail: String(detail || ''), ms: 0 });

  const fixture = core.makeFixtureHar();
  const v = core.validateHar(fixture);
  ck('fixture 结构校验', v.ok, v.error || `warnings=${(v.warnings || []).length}`);

  const { report, rows } = core.analyzeHar(fixture);
  ck('概览条目数=6', report.entryCount === 6, `实际 ${report.entryCount}`);
  ck('错误请求=2（500/404）', report.errorCount === 2, `实际 ${report.errorCount}`);
  ck('重复无缓存组=1（access_token 重复）', report.dupUncached.length === 1 && report.dupUncached[0].count === 2,
    JSON.stringify(report.dupUncached.map((g) => g.count)));
  ck('慢请求 TOP1=orders 1250ms', rows.length && [...rows].sort((a, b) => b.t - a.t)[0].t === 1250, '排序正确');
  const proj = rows[0];
  ck('投影 URL 已脱敏（access_token 掩码）', proj.u.includes('access_token=‹') && !proj.u.includes('SECRET123'), proj.u);
  ck('304 计入缓存', report.cachedCount === 1, `实际 ${report.cachedCount}`);

  const audit = core.auditHar(fixture);
  const catOf = (c) => audit.findings.find((f) => f.cat === c);
  ck('审计: auth-header 命中', !!catOf('auth-header'), catOf('auth-header') ? `${catOf('auth-header').count} 处` : '缺失');
  ck('审计: cookie/set-cookie/query-secret 命中', !!(catOf('cookie') && catOf('set-cookie') && catOf('query-secret')),
    ['cookie', 'set-cookie', 'query-secret'].map((c) => `${c}=${catOf(c) ? catOf(c).count : 0}`).join(' '));
  ck('审计: 体特征（sk- 密钥/JWT）命中', !!(catOf('api-key-pattern') && catOf('jwt')),
    `api-key=${catOf('api-key-pattern') ? catOf('api-key-pattern').count : 0} jwt=${catOf('jwt') ? catOf('jwt').count : 0}`);
  ck('审计样例无明文密钥', !JSON.stringify(audit).includes('SECRET123') && !JSON.stringify(audit).includes('hunter2'), '全样例掩码');

  const { har: san, stats } = core.sanitizeHar(fixture, core.DEFAULT_SANITIZE);
  const sanText = JSON.stringify(san);
  ck('脱敏: 无明文密钥残留', !sanText.includes('SECRET123') && !sanText.includes('hunter2') && !sanText.includes('sk-proj-') && !sanText.includes('abc.def.ghi'), Object.entries(stats).map(([k, n]) => `${k}:${n}`).join(','));
  const rv = core.validateHar(JSON.parse(sanText));
  ck('脱敏: 结构仍为合法 HAR（可往返解析）', rv.ok, rv.error || '往返 OK');
  const reAudit = core.auditHar(san);
  ck('脱敏: 复核审计归零', reAudit.total === 0, `复核 total=${reAudit.total}`);

  const diff = core.compareHars(fixture, (() => {
    const f2 = JSON.parse(JSON.stringify(fixture));
    f2.log.entries[4].time = 2400; // orders 变慢
    f2.log.entries[5].response.status = 503; // avatar 状态翻转
    f2.log.entries.push(JSON.parse(JSON.stringify(f2.log.entries[0]))); // 新增一条重复请求
    return f2;
  })());
  ck('对比: 变慢检出（orders +1150ms）', diff.slower.some((c) => c.dt >= 1100), `slower=${diff.slower.length}`);
  ck('对比: 状态翻转检出（200→503）', diff.flips.length >= 1, `flips=${diff.flips.length}`);
  ck('对比: 新增检出（重复条目不误报消失）', diff.added.length === 1 && diff.removed.length === 0, `added=${diff.added.length} removed=${diff.removed.length}`);

  const detail = core.entryDetail(fixture.log.entries[1], 1);
  ck('详情: 密码字段掩码', !JSON.stringify(detail).includes('hunter2'), 'reqBody 已掩码');
  ck('详情: set-cookie 掩码', detail.resHeaders.every(([n, v]) => (String(n).toLowerCase() === 'set-cookie' ? v.includes('‹') : true)), '响应头 OK');

  const allGreen = checks.every((c) => c.pass);
  const selftestReport = { passed: checks.filter((c) => c.pass).length, total: checks.length, allGreen, checks, durationMs: Date.now() - t0, at: Date.now(), version: VERSION };
  await kv.kvSet(K.selftest, selftestReport).catch(() => {});
  return { ok: allGreen, report: selftestReport };
}

// ── 命令消费（单槽信箱：har.cmd 先删后做；回执 har.result 同 nonce）──────────
async function sendResult(nonce, obj) {
  try { await kv.kvSet(K.result, { nonce, ...obj, at: Date.now() }); } catch (e) { log('warn', `回执写失败: ${e.message}`); }
}

async function consumeCommand() {
  const cmd = await kv.kvGet(K.cmd).catch(() => null);
  if (!cmd || typeof cmd !== 'object' || !cmd.nonce) return;
  if (cmd.nonce === lastCmdNonce) {
    await kv.kvDel(K.cmd).catch(() => {});
    return;
  }
  const delOk = await kv.kvDel(K.cmd).then(() => true).catch(() => false);
  if (!delOk) return; // 别人抢到了
  lastCmdNonce = cmd.nonce;
  log('info', `消费命令 ${cmd.op} nonce=${cmd.nonce}`);
  let result;
  try {
    if (busyJob) {
      result = { ok: false, error: '有重活进行中（open/compare/sanitize 串行执行），请稍候重试' };
    } else if (cmd.op === 'open') { busyJob = true; result = await doOpen(cmd).finally(() => { busyJob = false; }); }
    else if (cmd.op === 'entry') result = await doEntry(cmd);
    else if (cmd.op === 'sanitize') { busyJob = true; result = await doSanitize(cmd).finally(() => { busyJob = false; }); }
    else if (cmd.op === 'compare') { busyJob = true; result = await doCompare(cmd).finally(() => { busyJob = false; }); }
    else if (cmd.op === 'selftest') { busyJob = true; result = await cmdSelftest().finally(() => { busyJob = false; }); }
    else result = { ok: false, error: `未知命令 ${cmd.op}` };
  } catch (e) {
    log('error', `命令 ${cmd.op} 异常: ${e.message}`);
    result = { ok: false, error: `内部异常: ${e.message}` };
    activeState = activeState === 'parsing' ? 'error' : activeState;
  }
  await sendResult(cmd.nonce, result);
}

// ── meta 心跳与 HTTP 健康面 ─────────────────────────────────────────────────
function buildMeta() {
  return {
    version: VERSION,
    pid: process.pid,
    startedAt,
    lastTickAt: Date.now(),
    bridge: kv.endpoint() ? `${kv.endpoint().host}:${kv.endpoint().port}` : '',
    degraded,
    port: actualPort,
    state: activeState,
    error: activeError,
    activePath: active && activeState === 'ready' ? active.path : '',
    activeEntryCount: active && activeState === 'ready' ? active.report.entryCount : 0,
    busy: busyJob,
  };
}

async function tick() {
  await loadSettings();
  await consumeCommand();
  const now = Date.now();
  if (now - lastMetaAt >= META_BEAT_MS) {
    lastMetaAt = now;
    await kv.kvSet(K.meta, buildMeta()).catch((e) => { degraded = true; log('warn', `meta 心跳失败: ${e.message}`); });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, version: VERSION, degraded, state: activeState, busy: busyJob }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: 'har-lens 服务无数据面 API（控制面走 cap.kv har.cmd）' }));
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = server.address();
  actualPort = typeof addr === 'object' && addr ? addr.port : PORT;
  log('info', `har-lens 服务已启动 127.0.0.1:${actualPort}（无数据面 API；控制面 kv har.*）`);
});

let ticking = false;
const timer = setInterval(() => {
  if (ticking) return;
  ticking = true;
  tick().catch((e) => log('warn', `tick 异常: ${e.message}`)).finally(() => { ticking = false; });
}, TICK_MS);

function shutdown() {
  clearInterval(timer);
  try { server.close(); } catch (_) { /* ignore */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
