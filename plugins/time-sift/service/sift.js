#!/usr/bin/env node
'use strict';
/**
 * sift.js —— 会话记忆后台服务（会话索引/检索的唯一权威）
 *
 * 职责与边界：
 *  - 唯一读源：四路数据源（polaris dialogs / session-v2 / claude 原生 / zcode）只由本进程读取
 *  - 唯一写者：cap.kv sift.* 键空间里 catalog/stats/meta/result 全部只由本进程写
 *  - 面板/MCP 经命令信箱（sift.cmd.<op>.<nonce>，先删后做）触发 search/open/reindex/timeline
 *  - 零外网请求；索引缓存落 <appConfigDir>/time-sift/
 *
 * 事件循环纪律：全量重建可能耗时数分钟，扫描器必须在文件循环里周期性让出
 * （setImmediate），否则健康检查饿死 → 宿主判死重启 → 重建死循环。
 *
 * 启动参数（宿主注入）：node sift.js {{port}} {{appConfigDir}}
 * 冒烟钩子：env SIFT_DATA_ROOT_OVERRIDE=<dir> 把全部源定位限制到指定目录（仅测试用，见 README）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const core = require('../shared/sift-core.js');
const sources = require('./sources.js');
const { createKvClient, resolveDataRoot } = require('../shared/kvclient.js');

const VERSION = '0.1.0';
const PREFIX = 'sift';
const TICK_MS = 2000;
const JSONL_SCAN_MS = 30000; // JSONL 源 stat 增量周期
const SETTINGS_MS = 30000; // settings 热读周期
const META_MS = 60000; // meta 心跳周期
const SQLITE_STAGGER_MS = 30000; // v2 与 zcode 拉取错峰
const POSTINGS_MIN_INTERVAL_MS = 90000; // postings.json 落盘最小间隔
const KV_COMMIT_MIN_INTERVAL_MS = 5000; // kv 目录/统计落盘最小间隔
const SEARCH_SCAN_CAP = 150; // 逐 blob 验证的候选上限
const RESULT_TTL_MS = 3600000; // result/cmd 孤儿回收
const OPEN_TOTAL_BUDGET = 200000; // open 返回总字节预算（防 kv 256KB 超限）
const YIELD_EVERY = 20; // 扫描循环每 N 个文件让出事件循环
const TIMELINE_MAX_DAYS = 21; // timeline 返回天窗上限
const TIMELINE_MAX_PER_DAY = 20;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const yieldLoop = () => new Promise((r) => setImmediate(r));

// ── 基础设施：日志（自落盘 + 轮转）──────────────────────────────────────────

const appConfigDir = process.argv[3] || '';
const logFile = appConfigDir ? path.join(appConfigDir, 'time-sift.log') : '';
function log(level, msg) {
  const line = `[time-sift:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug') return; // debug 高频诊断不落盘
  console.error(line);
  if (!logFile) return;
  try {
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, logFile + '.old');
    } catch (_) { /* 首次不存在 */ }
    fs.appendFileSync(logFile, line + '\n');
  } catch (_) { /* 日志失败不影响主流程 */ }
}

// ── 缓存目录 ────────────────────────────────────────────────────────────────

const cacheDir = appConfigDir ? path.join(appConfigDir, 'time-sift') : path.join(os.tmpdir(), 'time-sift');
const blobsDir = path.join(cacheDir, 'blobs');
for (const d of [cacheDir, blobsDir]) {
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch (_) { /* 已存在 */ }
}

function atomicWriteJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

// ── 源定位（SIFT_DATA_ROOT_OVERRIDE 仅冒烟用：全部源限定在临时目录内）──────

const SMOKE_ROOT = process.env.SIFT_DATA_ROOT_OVERRIDE || '';
const dataRoot = SMOKE_ROOT || resolveDataRoot(appConfigDir);
const claudeDir = SMOKE_ROOT ? path.join(SMOKE_ROOT, 'claude-projects') : path.join(os.homedir(), '.claude', 'projects');
const v2Root = SMOKE_ROOT || dataRoot; // readV2All 内部拼 session-v2 子目录
const zcodeDb = SMOKE_ROOT ? path.join(SMOKE_ROOT, 'zcode-db.sqlite') : '';

// ── 内存态 ──────────────────────────────────────────────────────────────────

const catalog = new Map(); // sid → entry
const postings = new Map(); // term → sid[]
const commonTerms = new Set(); // 超过倒排上限的 term（查询时放弃约束）
const stateBySource = {
  polaris: readJson(path.join(cacheDir, 'state.polaris.json'), {}),
  claude: readJson(path.join(cacheDir, 'state.claude.json'), {}),
}; // sourceKey → { mtimeMs, size, sid }
const sqliteFingerprint = {
  v2: readJson(path.join(cacheDir, 'state.v2.json'), {}),
  zcode: readJson(path.join(cacheDir, 'state.zcode.json'), {}),
}; // source → stableKey → { updatedAt, msgCount, proseChars, sid }

let settings = core.sanitizeSettings(null);
let kv = null;
let bridge = '';
let degraded = true; // 桥未验证前按降级处理
let catRev = 0;
let catDirty = false;
let statsDirty = true;
let postingsDirty = false;
let lastPostingsWrite = 0;
let lastKvCommit = 0;
let lastSettingsRead = 0;
let lastJsonlScan = 0;
let lastMetaWrite = 0;
let lastV2Pull = 0;
let lastZcodePull = 0;
let kvScanAt = 0;
let initialScanDone = false;
let scanning = false; // 任一扫描进行中（防止 tick 重入）
const indexing = { phase: 'idle', done: 0, total: 0, startedAt: 0, error: '' };
const sourceStats = {
  polaris: { files: 0, ok: 0, err: 0, lastScanAt: 0 },
  claude: { files: 0, ok: 0, err: 0, lastScanAt: 0 },
  v2: { files: 0, ok: 0, err: 0, lastScanAt: 0 },
  zcode: { files: 0, ok: 0, err: 0, lastScanAt: 0 },
};

// ── 索引应用（内存 + blob 磁盘；kv/catalog 由统一 commit 刷写）──────────────

function blobPath(sid) {
  return path.join(blobsDir, sid + '.txt');
}

function termsOf(entry, blob) {
  return core.tokenize(`${entry.title}\n${blob}`);
}

/** 应用一次会话变更：旧 blob 出倒排 → 写新 blob → 新 terms 入倒排 → 目录更新 */
function applySession(draft, maxMsgChars) {
  const sid = core.makeSid(draft.source, draft.stableKey);
  const { entry, blob, terms } = core.assembleSession({
    sid,
    source: draft.source,
    title: draft.title,
    engineId: draft.engineId,
    workspace: draft.workspace,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    messages: draft.messages,
    tokens: draft.tokens,
    costUsd: draft.costUsd,
    maxMsgChars,
  });
  const prev = catalog.get(sid);
  if (
    prev &&
    prev.updatedAt === entry.updatedAt &&
    prev.msgCount === entry.msgCount &&
    prev.proseChars === entry.proseChars &&
    prev.title === entry.title &&
    fs.existsSync(blobPath(sid))
  ) {
    return sid; // 无实质变化（blob 在盘才叫无变化）
  }
  if (prev) {
    try {
      const oldBlob = fs.readFileSync(blobPath(sid), 'utf8');
      core.unindexSessionTerms(postings, commonTerms, sid, termsOf(prev, oldBlob));
    } catch (_) { /* 旧 blob 缺失：跳过出倒排，重建兜底 */ }
  }
  const tmp = blobPath(sid) + '.tmp';
  fs.writeFileSync(tmp, blob);
  fs.renameSync(tmp, blobPath(sid));
  core.indexSessionTerms(postings, commonTerms, sid, terms);
  catalog.set(sid, entry);
  postingsDirty = true;
  catDirty = true;
  statsDirty = true;
  return sid;
}

/** 摘除一个会话（源里消失/被排除时） */
function removeSession(sid) {
  const prev = catalog.get(sid);
  if (!prev) return;
  try {
    const oldBlob = fs.readFileSync(blobPath(sid), 'utf8');
    core.unindexSessionTerms(postings, commonTerms, sid, termsOf(prev, oldBlob));
  } catch (_) { /* blob 已缺失 */ }
  try {
    fs.unlinkSync(blobPath(sid));
  } catch (_) { /* 已删 */ }
  catalog.delete(sid);
  postingsDirty = true;
  catDirty = true;
  statsDirty = true;
}

// ── 扫描器（async：文件循环里周期让出事件循环）─────────────────────────────

/** 摘除某源的全会话（源开关关闭时；JSONL 源同时清 state 保证重开时全量重扫） */
function removeSourceSessions(source) {
  for (const [sid, entry] of [...catalog]) {
    if (entry.source === source) removeSession(sid);
  }
  if (source === 'polaris' || source === 'claude') {
    for (const k of Object.keys(stateBySource[source])) delete stateBySource[source][k];
  } else {
    for (const k of Object.keys(sqliteFingerprint[source])) delete sqliteFingerprint[source][k];
  }
}

async function scanJsonlSource(source) {
  if (!settings.sources[source]) return;
  const t0 = Date.now();
  const files = source === 'polaris' ? sources.listPolarisFiles(dataRoot) : sources.listClaudeFiles(claudeDir);
  const state = stateBySource[source];
  const seen = new Set();
  const reader = source === 'polaris' ? sources.readPolarisFile : sources.readClaudeFile;
  let ok = 0;
  let err = 0;
  let processed = 0;
  for (const f of files) {
    seen.add(f.key);
    const prev = state[f.key];
    if (prev && prev.mtimeMs === f.mtimeMs && prev.size === f.size) continue;
    let draft = null;
    try {
      draft = reader(f.path);
    } catch (_) { /* 单文件失败不拖垮全局 */ }
    if (draft && draft.messages.length > 0) {
      const sid = applySession(draft, settings.maxMsgChars);
      state[f.key] = { mtimeMs: f.mtimeMs, size: f.size, sid };
      ok++;
    } else {
      if (prev && prev.sid) removeSession(prev.sid);
      delete state[f.key];
      err++;
    }
    if (++processed % YIELD_EVERY === 0) await yieldLoop();
  }
  for (const key of Object.keys(state)) {
    if (!seen.has(key)) {
      if (state[key].sid) removeSession(state[key].sid);
      delete state[key];
    }
  }
  sourceStats[source] = { files: files.length, ok, err, lastScanAt: Date.now() };
  if (indexing.phase !== 'idle') indexing.done++;
  if (ok > 0) log('info', `${source} 扫描：${ok} 变更 / ${files.length} 文件（${Date.now() - t0}ms）`);
}

async function scanSqliteSource(source) {
  if (!settings.sources[source]) return;
  if (!sources.sqliteAvailable()) {
    sourceStats[source].err = -1; // -1 = node:sqlite 运行时不可用（降级）
    return;
  }
  const t0 = Date.now();
  const fp = sqliteFingerprint[source];
  const result = source === 'v2' ? sources.readV2All(v2Root) : sources.readZcodeAll(zcodeDb);
  if (result.error) {
    sourceStats[source].err = -2; // -2 = 拉取报错
    indexing.error = result.error;
    log('warn', `${source} 拉取失败：${result.error}`);
    return;
  }
  const seen = new Set();
  let ok = 0;
  let processed = 0;
  for (const draft of result.drafts) {
    const sid = core.makeSid(draft.source, draft.stableKey);
    seen.add(sid);
    const prevFp = fp[draft.stableKey];
    const proseChars = draft.messages.reduce((n, m) => n + m.text.length, 0);
    if (prevFp && prevFp.sid === sid && prevFp.updatedAt === draft.updatedAt && prevFp.msgCount === draft.messages.length && prevFp.proseChars === proseChars) {
      continue; // 指纹未变
    }
    applySession(draft, settings.maxMsgChars);
    fp[draft.stableKey] = { sid, updatedAt: draft.updatedAt, msgCount: draft.messages.length, proseChars };
    ok++;
    if (++processed % YIELD_EVERY === 0) await yieldLoop();
  }
  for (const key of Object.keys(fp)) {
    if (!seen.has(fp[key].sid)) {
      removeSession(fp[key].sid);
      delete fp[key];
    }
  }
  sourceStats[source] = { files: result.drafts.length, ok, err: 0, lastScanAt: Date.now() };
  if (indexing.phase !== 'idle') indexing.done++;
  if (ok > 0) log('info', `${source} 拉取：${ok} 变更 / ${result.drafts.length} 会话（${Date.now() - t0}ms）`);
}

/** 全量重建（reindex 命令）：清内存态与缓存后按源跑一遍 */
async function rebuildAll() {
  catalog.clear();
  postings.clear();
  commonTerms.clear();
  for (const k of Object.keys(stateBySource.polaris)) delete stateBySource.polaris[k];
  for (const k of Object.keys(stateBySource.claude)) delete stateBySource.claude[k];
  for (const k of Object.keys(sqliteFingerprint.v2)) delete sqliteFingerprint.v2[k];
  for (const k of Object.keys(sqliteFingerprint.zcode)) delete sqliteFingerprint.zcode[k];
  try {
    for (const f of fs.readdirSync(blobsDir)) fs.unlinkSync(path.join(blobsDir, f));
  } catch (_) { /* 目录空 */ }
  indexing.phase = 'polaris';
  indexing.done = 0;
  indexing.total = 4;
  indexing.startedAt = Date.now();
  indexing.error = '';
  try {
    await scanJsonlSource('polaris');
    indexing.phase = 'claude';
    await scanJsonlSource('claude');
    indexing.phase = 'v2';
    await scanSqliteSource('v2');
    indexing.phase = 'zcode';
    await scanSqliteSource('zcode');
    indexing.phase = 'idle';
    initialScanDone = true;
    statsDirty = true;
    await persistAll(true);
    log('info', `全量重建完成：${catalog.size} 会话（${Date.now() - indexing.startedAt}ms）`);
  } catch (e) {
    indexing.phase = 'error';
    indexing.error = String((e && e.message) || e);
    log('error', `重建失败：${indexing.error}`);
  }
}

/** 首启：热启动 catalog/postings 后做一次增量扫描（补漏 + 找新） */
async function initialScan() {
  if (scanning) return;
  scanning = true;
  indexing.phase = 'polaris';
  indexing.done = 0;
  indexing.total = 4;
  indexing.startedAt = Date.now();
  try {
    await scanJsonlSource('polaris');
    indexing.phase = 'claude';
    await scanJsonlSource('claude');
    indexing.phase = 'v2';
    await scanSqliteSource('v2');
    indexing.phase = 'zcode';
    await scanSqliteSource('zcode');
    indexing.phase = 'idle';
    initialScanDone = true;
    statsDirty = true;
    await persistAll(true);
    log('info', `首启扫描完成：${catalog.size} 会话`);
  } catch (e) {
    indexing.phase = 'error';
    indexing.error = String((e && e.message) || e);
    log('error', `首启扫描失败：${indexing.error}`);
  } finally {
    scanning = false;
  }
}

// ── 持久化（磁盘 postings/state/catalog 先行，kv 提交随后自愈）──────────────

function persistPostings(force) {
  if (!postingsDirty) return;
  const now = Date.now();
  if (!force && now - lastPostingsWrite < POSTINGS_MIN_INTERVAL_MS) return;
  try {
    const t0 = Date.now();
    const obj = { t: [...postings.entries()], c: [...commonTerms] };
    atomicWriteJson(path.join(cacheDir, 'postings.json'), obj);
    postingsDirty = false;
    lastPostingsWrite = now;
    log('info', `postings 落盘：${postings.size} terms / common ${commonTerms.size}（${Date.now() - t0}ms）`);
  } catch (e) {
    log('warn', `postings 落盘失败：${e.message}`);
  }
}

function persistState() {
  try {
    atomicWriteJson(path.join(cacheDir, 'state.polaris.json'), stateBySource.polaris);
    atomicWriteJson(path.join(cacheDir, 'state.claude.json'), stateBySource.claude);
    atomicWriteJson(path.join(cacheDir, 'state.v2.json'), sqliteFingerprint.v2);
    atomicWriteJson(path.join(cacheDir, 'state.zcode.json'), sqliteFingerprint.zcode);
  } catch (e) {
    log('warn', `state 落盘失败：${e.message}`);
  }
}

function persistCatalog() {
  try {
    atomicWriteJson(path.join(cacheDir, 'catalog.json'), [...catalog.values()]);
  } catch (e) {
    log('warn', `catalog 落盘失败：${e.message}`);
  }
}

function visibleEntries() {
  const entries = [...catalog.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!settings.excludeKeywords.length) return entries;
  return entries.filter((e) => !core.isExcluded(e, settings.excludeKeywords));
}

/** kv 提交：目录分块 + head + stats（节流；只在 catalog/stats 脏时重写） */
async function commitKv(force) {
  if (!kv || degraded) return;
  const now = Date.now();
  if (!force && now - lastKvCommit < KV_COMMIT_MIN_INTERVAL_MS) return;
  if (!catDirty && !statsDirty) return;
  try {
    const entries = visibleEntries();
    const chunks = core.chunkCatalog(entries);
    for (let i = 0; i < chunks.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await kv.kvSet(`${PREFIX}.cat.${i}`, chunks[i]);
    }
    // 分块收缩时清理尾块
    const headPrev = await kv.kvGet(`${PREFIX}.cat.head`);
    if (headPrev && Number(headPrev.chunks) > chunks.length) {
      for (let i = chunks.length; i < Number(headPrev.chunks); i++) {
        // eslint-disable-next-line no-await-in-loop
        await kv.kvDel(`${PREFIX}.cat.${i}`).catch(() => {});
      }
    }
    await kv.kvSet(`${PREFIX}.cat.head`, { count: entries.length, chunks: chunks.length, rev: ++catRev, builtAt: now });
    await kv.kvSet(`${PREFIX}.stats.total`, core.buildTotals(entries));
    await kv.kvSet(`${PREFIX}.stats.daily`, core.buildDailyStats(entries));
    catDirty = false;
    statsDirty = false;
    lastKvCommit = now;
  } catch (e) {
    log('warn', `kv 提交失败：${e.message}`);
    degraded = true; // 下个 tick 重新验证桥
  }
}

async function writeMeta() {
  if (!kv) return;
  try {
    await kv.kvSet(`${PREFIX}.meta`, {
      version: VERSION,
      pid: process.pid,
      startedAt: Date.now() - process.uptime() * 1000,
      lastTickAt: Date.now(),
      bridge,
      degraded,
      dataRoot,
      smoke: !!SMOKE_ROOT,
      sqlite: sources.sqliteAvailable(),
      indexing: { ...indexing },
      catalog: { sessions: visibleEntries().length },
      sources: sourceStats,
      settings: { sources: settings.sources, excludeKeywords: settings.excludeKeywords.length },
    });
  } catch (e) {
    degraded = true;
    log('debug', `meta 写入失败：${e.message}`);
  }
}

async function persistAll(force) {
  persistPostings(force);
  persistState();
  persistCatalog();
  await commitKv(force);
}

// ── 检索执行 ────────────────────────────────────────────────────────────────

function loadBlob(sid) {
  try {
    return fs.readFileSync(blobPath(sid), 'utf8');
  } catch (_) {
    return '';
  }
}

function handleSearch(params) {
  const query = String(params.query || '').trim();
  if (!query) return { error: '请给出要检索的关键词' };
  const limit = Math.min(Math.max(Number(params.limit) || 12, 1), 30);
  const now = Date.now();
  const terms = core.tokenize(query);
  if (terms.length === 0) return { error: '关键词无法分词（全是单字符或符号），换个说法试试' };

  const qc = core.queryCandidates(postings, commonTerms, terms);
  const sids = qc.candidates ? [...qc.candidates] : [...catalog.keys()];

  const srcFilter = params.source && core.SOURCES.includes(params.source) ? params.source : '';
  const days = Number(params.days) > 0 ? Number(params.days) : 0;
  const minUpdated = days ? now - days * 86400000 : 0;
  const byId = new Map(sids.map((sid) => [sid, catalog.get(sid)]).filter(([, e]) => e));
  let candidates = core.rankCandidates(byId, sids, now);
  candidates = candidates.filter((sid) => {
    const e = catalog.get(sid);
    if (!e) return false;
    if (srcFilter && e.source !== srcFilter) return false;
    if (minUpdated && e.updatedAt < minUpdated) return false;
    if (settings.excludeKeywords.length && core.isExcluded(e, settings.excludeKeywords)) return false;
    return true;
  });
  candidates = candidates.slice(0, SEARCH_SCAN_CAP);

  const verifyTerms = qc.present.length ? qc.present : terms;
  const hits = [];
  for (const sid of candidates) {
    const entry = catalog.get(sid);
    const msgs = core.parseBlob(loadBlob(sid));
    if (msgs.length === 0) continue;
    let hitCount = 0;
    const hitTerms = new Set();
    let snippet = null;
    for (const m of msgs) {
      let inMsg = 0;
      for (const t of verifyTerms) {
        let idx = m.text.indexOf(t);
        let count = 0;
        while (idx >= 0 && count < 50) {
          count++;
          hitTerms.add(t);
          idx = m.text.indexOf(t, idx + t.length);
        }
        inMsg += count;
      }
      if (inMsg > 0) {
        hitCount += inMsg;
        if (!snippet) snippet = { msgIndex: m.i, role: m.role, ts: m.ts, ...core.makeSnippet(m.text, [...hitTerms]) };
      }
    }
    if (hitCount === 0) continue;
    hits.push({
      entry,
      hitCount,
      coverage: hitTerms.size,
      snippet,
      score: core.scoreHit(hitCount, hitTerms.size, verifyTerms.length, entry.updatedAt, now),
    });
    if (hits.length >= limit * 3) break; // 预排序候选已足够，排序后取 top
  }
  const top = hits.sort((a, b) => b.score - a.score).slice(0, limit);
  return {
    query,
    terms: verifyTerms,
    relaxed: qc.relaxed,
    scanned: candidates.length,
    total: hits.length,
    hits: top.map((h) => ({
      sid: h.entry.sid,
      source: h.entry.source,
      title: h.entry.title,
      engineId: h.entry.engineId,
      workspace: h.entry.workspace,
      updatedAt: h.entry.updatedAt,
      msgCount: h.entry.msgCount,
      hitCount: h.hitCount,
      snippet: h.snippet,
    })),
  };
}

function handleOpen(params) {
  const sid = String(params.sid || '');
  const entry = catalog.get(sid);
  if (!entry) return { error: `会话不存在（sid=${sid}）` };
  const msgs = core.parseBlob(loadBlob(sid));
  if (msgs.length === 0) return { error: '会话正文缺失，试试重建索引' };
  const limit = Math.min(Math.max(Number(params.limit) || 30, 1), 60);
  const maxChars = Math.min(Math.max(Number(params.maxChars) || 2500, 200), 8000);
  const aroundRaw = params.around;
  const around = aroundRaw === null || aroundRaw === undefined || aroundRaw === '' ? null : Number(aroundRaw);
  let start = 0;
  if (around !== null && Number.isFinite(around)) {
    const idx = msgs.findIndex((m) => m.i === around);
    const at = idx >= 0 ? idx : 0;
    start = Math.max(0, at - Math.floor(limit / 2));
  } else {
    start = Math.max(Number(params.offset) || 0, 0);
  }
  const window = msgs.slice(start, start + limit);
  const out = [];
  let budget = OPEN_TOTAL_BUDGET;
  for (const m of window) {
    const text = m.text.length > maxChars ? m.text.slice(0, maxChars) + '…' : m.text;
    const cost = Buffer.byteLength(text) + 64;
    if (cost > budget) break;
    budget -= cost;
    out.push({ i: m.i, role: m.role, ts: m.ts, text });
  }
  return { entry, messages: out, total: msgs.length, truncated: out.length < window.length };
}

/** timeline 仅供 MCP（面板直接读 kv 目录分块）；输出瘦身防 kv 超限 */
function handleTimeline(params) {
  let entries = visibleEntries();
  if (params.source && core.SOURCES.includes(params.source)) entries = entries.filter((e) => e.source === params.source);
  if (params.date) {
    const at = Date.parse(String(params.date));
    if (!Number.isFinite(at)) return { error: `日期无法解析：${params.date}` };
    const dayKey = core.localDayKey(at);
    entries = entries.filter((e) => core.localDayKey(e.updatedAt) === dayKey);
  } else {
    const days = Number(params.days) > 0 ? Number(params.days) : 7;
    entries = entries.filter((e) => e.updatedAt >= Date.now() - days * 86400000);
  }
  const groups = core.groupTimeline(entries).slice(0, TIMELINE_MAX_DAYS);
  return {
    days: groups.map((g) => ({
      day: g.day,
      sessions: g.sessions.slice(0, TIMELINE_MAX_PER_DAY).map((e) => ({
        sid: e.sid,
        source: e.source,
        title: e.title,
        updatedAt: e.updatedAt,
        msgCount: e.msgCount,
      })),
    })),
  };
}

// ── 命令信箱（先删后做）────────────────────────────────────────────────────

/** nonce：base36 时间戳 + '-' + 随机段（'-' 不在 base36 字符集，purge 靠它取回时间戳） */
function nonce() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function consumeCommands(keys) {
  const cmdKeys = keys.filter((k) => k.startsWith(`${PREFIX}.cmd.`));
  for (const key of cmdKeys) {
    let cmd = null;
    try {
      cmd = await kv.kvGet(key);
    } catch (_) { /* 读失败下轮再看 */ }
    // 先删后做：删除成功才执行（kv delete 天然互斥，防双消费者双执行）
    let deleted = false;
    try {
      deleted = await kv.kvDel(key);
    } catch (_) { /* 删不掉就不执行 */ }
    if (!deleted || !cmd || typeof cmd !== 'object') continue;
    const op = String(cmd.op || '');
    const n = String(cmd.nonce || nonce());
    const resultKey = `${PREFIX}.result.${n}`;
    log('info', `消费命令 ${op} nonce=${n}`);
    let out;
    try {
      if (op === 'search') out = { ok: true, data: handleSearch(cmd) };
      else if (op === 'open') out = { ok: true, data: handleOpen(cmd) };
      else if (op === 'timeline') out = { ok: true, data: handleTimeline(cmd) };
      else if (op === 'reindex') {
        if (cmd.confirm !== true) out = { ok: false, error: 'reindex 是重活，需要 confirm:true' };
        else {
          await rebuildAll();
          out = { ok: true, data: { sessions: catalog.size } };
        }
      } else out = { ok: false, error: `未知命令 ${op}` };
    } catch (e) {
      out = { ok: false, error: String((e && e.message) || e) };
      log('error', `命令 ${op} 执行失败：${out.error}`);
    }
    out.at = Date.now();
    try {
      await kv.kvSet(resultKey, out);
    } catch (e) {
      log('warn', `结果写回失败 nonce=${n}: ${e.message}`);
    }
  }
}

/** 顺带回收 >1h 的孤儿 result/cmd 键（仅本前缀，nonce 首段是 base36 时间戳） */
async function purgeOrphans(keys) {
  const now = Date.now();
  const orphans = keys.filter((k) => {
    if (!k.startsWith(`${PREFIX}.result.`) && !k.startsWith(`${PREFIX}.cmd.`)) return false;
    const ts = parseInt(k.split('.').pop(), 36);
    return Number.isFinite(ts) && now - ts > RESULT_TTL_MS;
  });
  for (const k of orphans) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await kv.kvDel(k);
    } catch (_) { /* 下轮再收 */ }
  }
}

// ── 健康端点（恒 200：真实健康度看 sift.meta，防误杀重启循环）──────────────

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  if (url === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: VERSION, indexing: indexing.phase, sessions: catalog.size }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

const port = Number(process.argv[2]) || 0;
if (port > 0) {
  server.listen(port, '127.0.0.1', () => log('info', `health endpoint on 127.0.0.1:${port}`));
  server.on('error', (e) => log('error', `health endpoint 启动失败: ${e.message}`));
}

// ── 主循环 ──────────────────────────────────────────────────────────────────

async function verifyBridge() {
  if (!kv) kv = createKvClient({ appConfigDir, log });
  try {
    const ep = await kv.refreshEndpoint();
    bridge = `${ep.host}:${ep.port}`;
    await kv.kvSet(`${PREFIX}.bridge.probe`, { at: Date.now(), pid: process.pid });
    await kv.kvDel(`${PREFIX}.bridge.probe`);
    degraded = false;
  } catch (e) {
    if (!degraded) log('warn', `桥不可达，进入降级：${e.message}`);
    degraded = true;
  }
}

async function readSettings() {
  if (!kv) return;
  const raw = await kv.kvGet(`${PREFIX}.settings`);
  const next = core.sanitizeSettings(raw);
  const prevSources = JSON.stringify(settings.sources);
  const prevKeywords = JSON.stringify(settings.excludeKeywords);
  settings = next;
  if (JSON.stringify(next.sources) !== prevSources && initialScanDone) {
    // 源开关变化即时生效：被关掉的源整体摘除（含 state 清空，重开时全量重扫）
    for (const source of core.SOURCES) {
      if (!settings.sources[source]) removeSourceSessions(source);
    }
    persistAll(true).catch(() => {});
    log('info', '源开关变化，已即时生效');
  }
  if (JSON.stringify(next.excludeKeywords) !== prevKeywords) {
    statsDirty = true;
    catDirty = true; // 排除词影响 kv 里的可见目录
  }
}

async function tick() {
  const now = Date.now();
  try {
    if (!kv || degraded) await verifyBridge();
    if (!kv || degraded) return;

    if (now - kvScanAt > TICK_MS) {
      kvScanAt = now;
      const keys = await kv.kvKeys();
      await consumeCommands(keys);
      await purgeOrphans(keys);
    }
    if (now - lastSettingsRead > SETTINGS_MS) {
      lastSettingsRead = now;
      await readSettings();
    }
    if (!initialScanDone || scanning) return; // 首扫/重建进行中，跳过周期工作
    if (now - lastJsonlScan > JSONL_SCAN_MS) {
      lastJsonlScan = now;
      scanning = true;
      try {
        await scanJsonlSource('polaris');
        await scanJsonlSource('claude');
      } finally {
        scanning = false;
      }
      if (postingsDirty) {
        persistPostings(false);
        persistState();
      }
    }
    if (settings.sources.v2 && now - lastV2Pull > settings.sqliteRefreshMin * 60000) {
      lastV2Pull = now + SQLITE_STAGGER_MS; // 与 zcode 错峰
      scanning = true;
      try {
        await scanSqliteSource('v2');
      } finally {
        scanning = false;
      }
      if (postingsDirty) {
        persistPostings(false);
        persistState();
      }
    }
    if (settings.sources.zcode && now - lastZcodePull > settings.sqliteRefreshMin * 60000) {
      lastZcodePull = now;
      scanning = true;
      try {
        await scanSqliteSource('zcode');
      } finally {
        scanning = false;
      }
      if (postingsDirty) {
        persistPostings(false);
        persistState();
      }
    }
    if ((catDirty || statsDirty) && !postingsDirty) await commitKv(false);
    if (now - lastMetaWrite > META_MS) {
      lastMetaWrite = now;
      await writeMeta();
      await commitKv(false);
    }
  } catch (e) {
    log('warn', `tick 异常：${e.message}`);
  }
}

// ── 启动序列 ────────────────────────────────────────────────────────────────

const postingsFile = path.join(cacheDir, 'postings.json');
const catalogFile = path.join(cacheDir, 'catalog.json');

(async () => {
  const t0 = Date.now();
  log('info', `time-sift service v${VERSION} 启动（dataRoot=${dataRoot || '未找到'} smoke=${!!SMOKE_ROOT} sqlite=${sources.sqliteAvailable()}）`);
  await verifyBridge();
  await readSettings();

  // 磁盘热启动：catalog / postings 先恢复，再增量找新
  const savedCatalog = readJson(catalogFile, []);
  if (Array.isArray(savedCatalog)) {
    for (const e of savedCatalog) catalog.set(e.sid, e);
  }
  const savedPostings = readJson(postingsFile, null);
  if (savedPostings && Array.isArray(savedPostings.t)) {
    for (const [term, list] of savedPostings.t) postings.set(term, list);
    for (const t of savedPostings.c || []) commonTerms.add(t);
    log('info', `postings 热启动：${postings.size} terms（${Date.now() - t0}ms）`);
  } else if (savedCatalog.length > 0) {
    // postings 丢失：由 blob 重建倒排（上次落盘中断的自愈路径）
    log('info', 'postings 缺失，从 blob 重建倒排…');
    let processed = 0;
    for (const [sid, e] of catalog) {
      core.indexSessionTerms(postings, commonTerms, sid, termsOf(e, loadBlob(sid)));
      if (++processed % YIELD_EVERY === 0) await yieldLoop();
    }
    postingsDirty = true;
    log('info', `倒排重建完成：${postings.size} terms（${Date.now() - t0}ms）`);
  }

  await initialScan();
  await commitKv(true);
  await writeMeta();
  setInterval(() => {
    tick().catch((e) => log('warn', `tick 未捕获：${e.message}`));
  }, TICK_MS);
  log('info', `启动完成：${catalog.size} 会话 / ${postings.size} terms（${Date.now() - t0}ms）`);
})();

// 优雅退出：能写多少写多少
process.on('SIGINT', () => {
  log('info', 'SIGINT：落盘后退出');
  try {
    persistPostings(true);
    persistState();
    persistCatalog();
  } catch (_) { /* 尽力而为 */ }
  process.exit(0);
});
