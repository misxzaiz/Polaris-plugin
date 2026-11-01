'use strict';
/**
 * main.js —— 文字识别台后台服务（node >= 18；依赖随包 node_modules：tesseract.js）
 *
 * 单写者权威：ocr-bench.meta / ocr-bench.latest / ocr-bench.runs /
 * ocr-bench.report.* / ocr-bench.history / ocr-bench.settings 全部只由本服务写。
 * 面板走直连 HTTP（127.0.0.1 + token）发起/停止/实时进度；MCP 经 ocr-bench.cmd
 * 单槽信箱投递意图，服务消费后写 ocr-bench.res 回执（nonce 对齐）。
 * 面板与 AI 共用同一引擎与同一报告库。
 *
 * 安全不变量：
 *   - 服务只监听 127.0.0.1；/api/* 校验 X-OcrBench-Token（token 持久化在
 *     ocr-bench.meta，服务重启不换）；
 *   - 唯一外网流量 = 语言包模型文件下载（jsdelivr tessdata_fast，显式发起）；
 *     图像与文本数据永不外发（架构级保证：引擎无上传路径）；
 *   - 输出目录必须落在输入文件目录或 appConfigDir 之内（根边界校验，weibian 先例）；
 *   - 护栏：单任务 ≤200 文件、PDF ≤500 页、单图 ≤50MB、长边 ≤5000px、
 *     同一时刻只跑一个任务、可中止；无定时任务、无自动重跑。
 *
 * kv 报告瘦身策略：全文（≤4MB/文件）只在服务内存与导出的 txt；落 kv 的报告每文件
 * 只带 16KB 头部 + 总预算 256KB（超出从长文件截起），AI 需要全文用 ocr_result 的
 * full 参数按文件取（内存/导出文件二选一来源）。
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
const core = require('../shared/core');
const { createEngine } = require('./ocr-engine');

const VERSION = core.VERSION;
const PLUGIN_ID = core.PLUGIN_ID;
const PREFIX = core.PREFIX;
const TICK_MS = 1000;
const META_BEAT_IDLE_MS = 15 * 1000;
const META_BEAT_RUNNING_MS = 1000;

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

// ── 日志（自落盘 + 512KB 轮转；路径一律脱敏）────────────────────────────────
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
  settings: { langs: ['chi_sim', 'eng'], psm: 3, outDir: '' },
  running: null,   // { runId, items, total, done, current, results, state, aborted, startedAt, source, nonce, langs, psm, outDir, scheduler, signal }
  lastReport: null,
  engine: null,
};

// ── 设置 ────────────────────────────────────────────────────────────────────
function normalizeSettings(s) {
  const src = s && typeof s === 'object' ? s : {};
  const langsR = core.normalizeLangs(src.langs, state.engine ? state.engine.installedLangs() : null);
  return {
    langs: langsR.ok ? langsR.langs : ['chi_sim', 'eng'],
    psm: core.normalizePsm(src.psm),
    outDir: typeof src.outDir === 'string' ? src.outDir.slice(0, 500) : '',
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
  await kvSet(K.history, h.slice(0, core.LIMITS.historyMax));
}

// ── kv 报告瘦身 ─────────────────────────────────────────────────────────────
/** 全量结果 → 落 kv 的瘦身报告（每文件 16KB 头 + 总预算 256KB，超出从长文件截起） */
function slimReport(run, results) {
  const files = results.map((r) => ({
    path: r.path,
    type: r.type,
    ok: r.ok,
    error: r.error,
    pages: r.pages,
    chars: (r.text || '').length,
    durationMs: r.durationMs,
    outFile: r.outFile || null,
    truncatedFile: false,
    textHead: '',
  }));
  // 每文件 16KB 头；总预算超出 → 从文本最长的文件开始削减到 0（保长度信息）
  const order = files.map((f, i) => ({ i, len: (results[i].text || '').length }))
    .sort((a, b) => b.len - a.len);
  let budget = core.LIMITS.reportTextBudget;
  for (const { i, len } of order) {
    const take = Math.min(core.LIMITS.textHeadBytes, len, budget);
    files[i].textHead = take > 0 ? results[i].text.slice(0, take) : '';
    if (take < len) files[i].truncatedFile = true;
    budget -= take;
  }
  const summary = core.summarizeJob({ results, aborted: run.aborted, durationMs: Date.now() - run.startedAt });
  return {
    runId: run.runId,
    at: new Date().toISOString(),
    version: VERSION,
    langs: run.langs,
    psm: run.psm,
    outDir: run.outDir || null,
    source: run.source,
    aborted: run.aborted,
    summary,
    files,
  };
}

/** 报告中单文件全文的读取：优先内存（最近任务）→ 导出 txt → 失败给出可操作指引 */
function readFullText(runId, fileIndex) {
  const rep = state.lastReport && state.lastReport.runId === runId ? state.lastReport : null;
  if (rep && state.running === null) {
    const f = rep.files[fileIndex];
    if (!f) return { ok: false, error: `文件序号越界：${fileIndex}（报告共 ${rep.files.length} 个文件）` };
    const item = state.lastResults && state.lastResults[fileIndex];
    if (item && typeof item.text === 'string') return { ok: true, path: f.path, text: item.text, truncatedFile: false, from: 'memory' };
    if (f.outFile) {
      try {
        return { ok: true, path: f.path, text: fs.readFileSync(f.outFile, 'utf8'), truncatedFile: false, from: 'file' };
      } catch (_) { /* 导出文件被移走 */ }
    }
    return {
      ok: false,
      error: '该文件全文已不在内存（服务重启或已跑新任务）且导出文件不可读。重新识别一次，或在识别时导出 txt。',
    };
  }
  if (rep) return { ok: false, error: '任务进行中，等任务完成后再取全文（textHead 已含前 16KB）' };
  return { ok: false, error: `报告不在服务内存：${runId}。用 ocr_result 不带 full 看 16KB 头部，或重新识别。` };
}

// ── 任务执行 ────────────────────────────────────────────────────────────────
function newRunId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function liveSnapshot() {
  const r = state.running;
  if (!r) return null;
  const done = r.done;
  return {
    runId: r.runId,
    source: r.source,
    elapsedS: Math.round((Date.now() - r.startedAt) / 100) / 10,
    total: r.total,
    done,
    current: r.current ? core.maskPath(r.current) : null,
    state: r.state,
    langs: r.langs,
    filesOk: r.results.filter((x) => x.ok).length,
    filesFail: r.results.filter((x) => !x.ok).length,
    charsSoFar: r.results.reduce((a, x) => a + (x.text || '').length, 0),
  };
}

async function metaPayload() {
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
    await kvSet(K.meta, await metaPayload());
    state.degraded = false;
    state.lastBridgeErr = null;
  } catch (e) {
    state.degraded = true;
    state.lastBridgeErr = String((e && e.message) || e);
    log('warn', `meta 心跳失败（降级）：${state.lastBridgeErr}`);
  }
}

/** 发起任务。成功 {ok:true,runId}；失败 {ok:false,error}（busy 语义同 api-bench） */
function startJob(cfg, source, nonce) {
  if (state.running) {
    return { ok: false, busy: true, error: `已有识别任务在运行（已完成 ${state.running.done}/${state.running.total}）。先停止或等它完成。` };
  }
  const installed = state.engine.installedLangs();
  const langsR = core.normalizeLangs(cfg.langs !== undefined ? cfg.langs : state.settings.langs, installed);
  if (!langsR.ok) return { ok: false, error: langsR.error };
  const psm = core.normalizePsm(cfg.psm !== undefined ? cfg.psm : state.settings.psm);
  const disc = core.discoverInputs(cfg.paths, fs);
  if (!disc.ok) return { ok: false, error: disc.error };
  const items = disc.items.slice(0, core.LIMITS.maxFilesPerJob.max);
  // 输出目录：必须落在输入目录或 appConfigDir 内
  let outDir = typeof cfg.outDir === 'string' ? cfg.outDir.trim() : (cfg.outDir === null ? '' : state.settings.outDir);
  if (outDir) {
    const roots = new Set(items.map((it) => path.dirname(path.resolve(it.path))));
    if (state.appConfigDir) roots.add(path.resolve(state.appConfigDir));
    const inside = [...roots].some((root) => core.isPathInside(outDir, root));
    if (!inside) {
      return { ok: false, error: `输出目录必须在输入文件所在目录或应用数据目录之内：${core.maskPath(outDir)}（防止误写系统目录）` };
    }
    try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) {
      return { ok: false, error: `输出目录无法创建：${(e && e.message) || e}` };
    }
  }

  const runId = newRunId();
  const run = {
    runId,
    items,
    total: items.length,
    done: 0,
    current: null,
    results: [],
    state: 'running',
    aborted: false,
    startedAt: Date.now(),
    source: source === 'mcp' ? 'mcp' : 'panel',
    nonce: nonce || null,
    langs: langsR.langs,
    psm,
    outDir: outDir || null,
    scheduler: null,
    signal: { aborted: false },
  };
  state.running = run;
  log('info', `任务启动 [${run.source}] ${items.length} 个文件 langs=${run.langs.join('+')} psm=${psm}${outDir ? ' 导出=' + core.maskPath(outDir) : ''}`);

  // 异步执行（不阻塞 HTTP）
  executeJob(run).catch((e) => {
    log('warn', `任务执行异常收尾：${(e && e.stack) || e}`);
    run.state = 'failed';
    finishJob(run).catch(() => {});
  });
  return { ok: true, runId };
}

function stopJob() {
  const r = state.running;
  if (!r) return { ok: false, error: '当前没有运行中的识别任务' };
  r.aborted = true;
  r.signal.aborted = true;
  return { ok: true, runId: r.runId };
}

/** 导出单个文件的 txt（文件名冲突自动追加序号） */
function exportTxt(outDir, filePath, text) {
  const base = path.basename(filePath).replace(/\.[^.]+$/, '');
  let name = `${base}.txt`;
  let i = 2;
  for (;;) {
    const full = path.join(outDir, name);
    try {
      fs.accessSync(full);
      name = `${base}-${i}.txt`;
      i += 1;
      continue;
    } catch (_) { /* 可用 */ }
    fs.writeFileSync(full, text, 'utf8');
    return full;
  }
}

/** 任务主循环：2 个并发文件流共享 scheduler；页间检查中止。 */
async function executeJob(run) {
  const installed = state.engine.installedLangs();
  if (!run.langs.every((l) => installed.has(l))) {
    run.state = 'failed';
    run.results = run.items.map((it) => ({ path: it.path, type: it.type, ok: false, pages: [], text: '', error: `语言包缺失：${run.langs.join('+')}`, durationMs: 0 }));
    await finishJob(run);
    return;
  }
  run.scheduler = await state.engine.spawnScheduler(run.langs, run.psm);
  try {
    let next = 0;
    const nWorkers = Math.max(1, Math.min(core.LIMITS.workerCount, run.items.length));
    const workers = Array.from({ length: nWorkers }, async () => {
      for (;;) {
        if (run.signal.aborted) return;
        const i = next;
        next += 1;
        if (i >= run.items.length) return;
        run.current = run.items[i].path;
        const r = await state.engine.recognizeFile(run.items[i], { signal: run.signal, scheduler: run.scheduler });
        if (r.aborted) run.aborted = true;
        if (run.outDir && r.ok && typeof r.text === 'string' && r.text.trim()) {
          try { r.outFile = exportTxt(run.outDir, r.path, r.text); } catch (e) {
            log('warn', `txt 导出失败（结果仍在报告内）：${(e && e.message) || e}`);
          }
        }
        run.results.push(r);
        run.done += 1;
        run.current = null;
      }
    });
    await Promise.all(workers);
    run.state = run.aborted ? 'stopped' : 'done';
  } finally {
    if (run.scheduler) await state.engine.killScheduler(run.scheduler);
    run.scheduler = null;
  }
  await finishJob(run);
}

async function finishJob(run) {
  if (state.running === run) state.running = null;
  run.durationMs = Date.now() - run.startedAt;
  // 结果按输入顺序对齐（多 worker 并发完成顺序不定；items 路径已去重可作键）
  const byPath = new Map(run.results.map((r) => [r.path, r]));
  run.results = run.items.map((it) => byPath.get(it.path)).filter(Boolean);
  // 中止时：未处理文件补占位（报告保持 results 与 items 对齐，AI 可读）
  for (const it of run.items.slice(run.results.length)) {
    run.results.push({ path: it.path, type: it.type, ok: false, pages: [], text: '', error: run.aborted ? '已中止（未处理）' : '未处理', durationMs: 0 });
  }
  const report = slimReport(run, run.results);
  report.summary = core.summarizeJob({ results: run.results, aborted: run.aborted, durationMs: run.durationMs });
  state.lastReport = report;
  state.lastResults = run.results;
  try {
    await kvSet(K.latest, report);
    const runs = await (async () => {
      try { const v = await state.kv.kvGet(K.runs); return Array.isArray(v) ? v : []; } catch (_) { return []; }
    })();
    runs.unshift(run.runId);
    const keep = runs.slice(0, core.LIMITS.keepReports);
    await kvSet(K.runs, keep);
    for (const old of runs.slice(core.LIMITS.keepReports)) await state.kv.kvDel(K.report(old)).catch(() => {});
    await kvSet(K.report(run.runId), report);
    await pushHistory({
      runId: run.runId,
      at: report.at,
      files: report.summary.files,
      okFiles: report.summary.okFiles,
      failFiles: report.summary.failFiles,
      totalChars: report.summary.totalChars,
      ocrPages: report.summary.ocrPages,
      nativePages: report.summary.nativePages,
      meanConfidence: report.summary.meanConfidence,
      durationMs: report.summary.durationMs,
      langs: run.langs,
      aborted: run.aborted,
      sample: core.maskPath(run.items[0] ? run.items[0].path : ''),
      oneLine: report.summary.oneLine,
    });
    log('info', `任务完成 ${run.runId}：${report.summary.oneLine}`);
  } catch (e) {
    log('warn', `报告持久化失败（内存中仍可读）：${(e && e.message) || e}`);
  }
  if (run.source === 'mcp' && run.nonce) {
    try {
      await kvSet(K.res, { nonce: run.nonce, action: 'scan', at: report.at, result: { ok: true, runId: run.runId, report } });
    } catch (e) {
      log('warn', `MCP 回执写入失败：${(e && e.message) || e}`);
    }
  }
}

async function getReportCached(runId) {
  if (state.lastReport && state.lastReport.runId === runId) return state.lastReport;
  try { return await state.kv.kvGet(K.report(runId)); } catch (_) { return null; }
}

// ── 信箱命令（MCP 来源；单槽 get→delete 消费）───────────────────────────────
const MAILBOX_ACTIONS = new Set(['scan', 'stop', 'report', 'result', 'state', 'history', 'langs', 'download_lang', 'settings_set']);

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
  const payload = cmd.payload || {};
  let reply;
  if (!MAILBOX_ACTIONS.has(action)) {
    reply = { ok: false, error: `未知 action：${action}（支持：${[...MAILBOX_ACTIONS].join('/')}）` };
  } else {
    reply = await handleAction(action, payload, 'mcp', cmd.nonce);
  }
  if (reply === undefined) return; // scan 已受理：回执由 finishJob 完成时写入（nonce 对齐）
  try {
    await kvSet(K.res, { nonce: cmd.nonce, action, at: new Date().toISOString(), result: reply });
  } catch (e) {
    log('warn', `回执写入失败：${(e && e.message) || e}`);
  }
}

/** HTTP 与信箱共用的动作分发（同一校验、同一护栏） */
async function handleAction(action, payload, source, nonce) {
  switch (action) {
    case 'scan': {
      const startR = startJob({
        paths: payload.paths,
        langs: payload.langs,
        psm: payload.psm,
        outDir: payload.outDir,
      }, source, nonce);
      if (!startR.ok) return startR;
      // 受理成功：信箱来源的回执由 finishJob 完成时写入；面板来源直接拿 runId
      return source === 'mcp' ? undefined : startR;
    }
    case 'stop':
      return stopJob();
    case 'report': {
      const rep = await getReportCached(String(payload.runId || ''));
      return rep ? { ok: true, report: rep } : { ok: false, error: `报告不存在或已被清理：${payload.runId || '?'}` };
    }
    case 'result': {
      const runId = String(payload.runId || '');
      const idx = Math.round(Number(payload.fileIndex));
      if (!Number.isFinite(idx) || idx < 0) return { ok: false, error: `fileIndex 非法：${payload.fileIndex}` };
      if (!state.lastReport || state.lastReport.runId !== runId) {
        const rep = await getReportCached(runId);
        if (!rep) return { ok: false, error: `报告不存在：${runId}` };
        if (payload.full) return { ok: false, error: '该报告不是最近一次任务，全文需重跑或导出 txt（textHead 已含前 16KB）' };
        const f = rep.files[idx];
        return f ? { ok: true, file: f } : { ok: false, error: `文件序号越界：${idx}（报告共 ${rep.files.length} 个文件）` };
      }
      if (payload.full) return readFullText(runId, idx);
      const f = state.lastReport.files[idx];
      return f ? { ok: true, file: f } : { ok: false, error: `文件序号越界：${idx}（报告共 ${state.lastReport.files.length} 个文件）` };
    }
    case 'state':
      return { ok: true, running: state.running ? liveSnapshot() : null, latest: state.lastReport ? { runId: state.lastReport.runId, at: state.lastReport.at, summary: state.lastReport.summary } : null, meta: { version: VERSION } };
    case 'history': {
      const h = await loadHistory();
      return { ok: true, items: h.slice(0, Math.min(Math.max(Number(payload.limit) || 20, 1), core.LIMITS.historyMax)) };
    }
    case 'langs': {
      const installed = state.engine.installedLangs();
      return {
        ok: true,
        builtin: core.LANGS.filter((l) => l.builtin).map((l) => ({ code: l.code, name: l.name, installed: installed.has(l.code) })),
        optional: core.LANGS.filter((l) => !l.builtin).map((l) => ({ code: l.code, name: l.name, installed: installed.has(l.code) })),
        cacheDir: state.engine ? path.join(state.appConfigDir || os.tmpdir(), PLUGIN_ID, 'cache') : null,
      };
    }
    case 'download_lang': {
      const codes = Array.isArray(payload.codes) ? payload.codes : (payload.code ? [payload.code] : []);
      if (!codes.length) return { ok: false, error: '未指定要下载的语言（codes 数组）' };
      const results = [];
      for (const c of codes.slice(0, 8)) {
        try {
          const r = await state.engine.downloadLang(String(c));
          results.push({ code: c, ok: true, cached: !!r.cached, bytes: r.bytes });
        } catch (e) {
          results.push({ code: c, ok: false, error: String((e && e.message) || e).slice(0, 200) });
        }
      }
      return { ok: true, results };
    }
    case 'settings_set':
      return { ok: true, settings: await saveSettings(payload) };
    default:
      return { ok: false, error: `未知 action：${action}` };
  }
}

// ── HTTP 服务（/__health + /api/*）──────────────────────────────────────────
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
  return String(req.headers['x-ocrbench-token'] || '') === state.token;
}

async function handleApiOp(req, res) {
  if (!authed(req)) {
    sendJson(res, 401, { ok: false, error: '缺少或错误的 token（面板应从 cap.kv ocr-bench.meta 读取）' });
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
    case 'start': // 面板 API 命名；handleAction 内部用信箱名 scan（同一校验、同一护栏）
      reply = await handleAction('scan', payload, 'panel', null);
      break;
    case 'stop':
    case 'report':
    case 'result':
    case 'langs':
    case 'download_lang':
    case 'settings_set':
      reply = await handleAction(action, payload, 'panel', null);
      break;
    case 'state':
      reply = { ok: true, running: state.running ? liveSnapshot() : null, lastReport: state.lastReport, settings: state.settings };
      break;
    case 'settings_get':
      reply = { ok: true, settings: state.settings };
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
    lastReportId: state.lastReport ? state.lastReport.runId : null,
  });
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';

  if (pathname === '/__health') {
    sendJson(res, 200, { ok: true, plugin: PLUGIN_ID, version: VERSION, running: !!state.running, degraded: state.degraded });
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
  sendJson(res, 404, { ok: false, error: '未知路径（/api/op /api/live）' });
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
  const engineLog = (lv, msg) => log(lv, msg);
  state.engine = createEngine({
    langsDirBuiltin: path.join(__dirname, 'vendor', 'tessdata'),
    cacheDir: path.join(state.appConfigDir || os.tmpdir(), PLUGIN_ID, 'cache'),
    limits: core.LIMITS,
    log: engineLog,
  });
  state.engine.ensureBuiltinCached();

  // token 持久化：重启不换（面板/MCP 缓存的 meta 持续可用）
  try {
    const meta = await state.kv.kvGet(K.meta);
    state.token = (meta && typeof meta.token === 'string' && meta.token) || crypto.randomBytes(16).toString('hex');
  } catch (_) {
    state.token = crypto.randomBytes(16).toString('hex');
  }

  await loadSettings();
  const installed = state.engine.installedLangs();
  log('info', `服务启动 :${PORT}（内置语言 ${core.LANGS.filter((l) => l.builtin).length} 个，已装 ${installed.size} 个，token ${state.token ? '就绪' : '缺失'}）`);

  server.listen(PORT, '127.0.0.1', () => {
    log('info', `健康端点就绪 127.0.0.1:${server.address().port}/__health`);
  });

  setInterval(consumeCmd, TICK_MS).unref();
  let beatTimer = setInterval(beatMeta, META_BEAT_IDLE_MS);
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
