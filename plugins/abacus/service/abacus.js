#!/usr/bin/env node
'use strict';
/**
 * abacus.js —— AI 用量账后台服务（AI 花销账房的唯一聚合权威）
 *
 * 职责与边界：
 *  - 唯一读源：三路数据源（zcode db.sqlite / ~/.claude JSONL / <dataRoot> dialogs）只由本进程读取
 *  - 唯一写者：cap.kv abacus.* 里聚合面（summary/daily/models/projects/quality/sessions/meta）只由本进程写；
 *    prices / settings 只读（面板与 MCP 显式工具是它们的写者），热加载生效
 *  - 增量策略：zcode 按 started_at 游标（回拨 1h 防乱序），claude 按 mtime+size 缓存，
 *    polaris 每轮全量首行扫描（391 文件×首行 64KB 上限，轻）
 *  - 台账条目持久化 <appConfigDir>/abacus/cache/entries.jsonl（去重键 k，聚合全量重算）
 *  - 默认零外网；唯一外网点 = 信箱 sync_prices（LiteLLM 价目，https+公网守卫）
 *
 * 事件循环纪律：claude 全量解析可达数十秒，扫描器必须周期性让出（sleep 0），
 * 否则健康检查饿死 → 宿主判死重启 → 重扫死循环。
 *
 * 启动参数（宿主注入）：node abacus.js {{port}} {{appConfigDir}}
 * 冒烟钩子：env ABACUS_SMOKE_ROOT=<dir> 把全部源定位限制到指定目录（仅测试用）：
 *   <dir>/zcode/db.sqlite、<dir>/claude/、<dir>/dialogs/
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const core = require('../shared/abacus-core.js');
const sources = require('./sources.js');
const { createKvClient, resolveDataRoot } = require('../shared/kvclient.js');

const VERSION = '0.1.0';
const TICK_MS = 2000;
const META_MS = 60000; // meta 心跳
const SETTINGS_MS = 30000; // settings/prices 热读
const ENTRY_FLUSH_MIN_MS = 5000; // entries.jsonl 落盘最小间隔
const ZCODE_CURSOR_OVERLAP_MS = 3600000; // 游标回拨 1h，防乱序行
const RESULT_TTL_MS = 3600000; // result 孤儿回收

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 基础设施：日志（自落盘 + 轮转）──────────────────────────────────────────

const appConfigDir = process.argv[3] || '';
const logFile = appConfigDir ? path.join(appConfigDir, 'abacus.log') : '';
function log(level, msg) {
  const line = `[abacus:${level}] ${new Date().toISOString()} ${msg}`;
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

const SMOKE_ROOT = process.env.ABACUS_SMOKE_ROOT || '';
const cacheDir = appConfigDir
  ? path.join(appConfigDir, 'abacus')
  : path.join(os.tmpdir(), 'abacus');
for (const d of [cacheDir]) {
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch (_) { /* 已存在 */ }
}
const entriesFile = path.join(cacheDir, 'entries.jsonl');
const claudeCacheFile = path.join(cacheDir, 'claude-files.json');

function atomicWriteJson(file, obj) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

// ── 源定位（真实 / 冒烟）────────────────────────────────────────────────────

const dataRoot = SMOKE_ROOT || resolveDataRoot(appConfigDir);
const ZCODE_DB = SMOKE_ROOT ? path.join(SMOKE_ROOT, 'zcode', 'db.sqlite') : '';
const CLAUDE_ROOT = SMOKE_ROOT ? path.join(SMOKE_ROOT, 'claude') : '';
const POLARIS_ROOT = SMOKE_ROOT || dataRoot;

// ── 桥客户端 ────────────────────────────────────────────────────────────────

const kv = createKvClient({ appConfigDir, log });

// ── 状态 ────────────────────────────────────────────────────────────────────

const state = {
  entries: new Map(), // k → entry
  claudeCache: {},
  zcodeCursor: 0,
  prices: { ...core.DEFAULT_PRICES },
  settings: { ...core.DEFAULT_SETTINGS },
  aggregates: null,
  lastScanAt: 0,
  lastFullScanAt: 0,
  lastError: '',
  scanning: false,
  startedAt: Date.now(),
  srcStatus: {
    zcode: { ok: null, rows: 0, sqlite: sources.sqliteAvailable() },
    claude: { ok: null, files: 0, scanned: 0 },
    polaris: { ok: null, files: 0, withTU: 0 },
  },
};

// ── 台账持久化 ──────────────────────────────────────────────────────────────

function loadCache() {
  try {
    const raw = fs.readFileSync(entriesFile, 'utf8');
    for (const line of raw.split('\n')) {
      const l = line.trim();
      if (!l) continue;
      try {
        const e = JSON.parse(l);
        if (e && e.k) state.entries.set(e.k, e);
      } catch (_) { /* 坏行跳过 */ }
    }
  } catch (_) { /* 首次无缓存 */ }
  try {
    state.claudeCache = JSON.parse(fs.readFileSync(claudeCacheFile, 'utf8')) || {};
  } catch (_) {
    state.claudeCache = {};
  }
  log('info', `缓存载入：${state.entries.size} 条台账，claude 文件缓存 ${Object.keys(state.claudeCache).length} 个`);
}

let dirty = false;
let lastFlushAt = 0;
function markDirty() {
  dirty = true;
}
function flushEntries(force) {
  if (!dirty) return;
  const now = Date.now();
  if (!force && now - lastFlushAt < ENTRY_FLUSH_MIN_MS) return;
  try {
    const tmp = `${entriesFile}.tmp`;
    const lines = [];
    for (const e of state.entries.values()) lines.push(JSON.stringify(e));
    fs.writeFileSync(tmp, lines.join('\n') + (lines.length ? '\n' : ''));
    fs.renameSync(tmp, entriesFile);
    dirty = false;
    lastFlushAt = now;
  } catch (e) {
    log('warn', `entries 落盘失败: ${e.message}`);
  }
}

/** 丢弃 claude 某文件的旧条目（文件变更时） */
function dropPrefix(prefix) {
  let n = 0;
  for (const k of state.entries.keys()) {
    if (k.startsWith(prefix)) {
      state.entries.delete(k);
      n += 1;
    }
  }
  return n;
}

/** 台账裁剪：只留最近 ~120 天有活动的条目（entries.jsonl 防无限膨胀） */
function pruneEntries(nowMs) {
  const cutoff = core.dayKeyOf(nowMs - 130 * core.DAY_MS);
  let n = 0;
  for (const [k, e] of state.entries.entries()) {
    if (e.day && e.day < cutoff) {
      state.entries.delete(k);
      n += 1;
    }
  }
  if (n > 0) {
    markDirty();
    log('info', `台账裁剪：丢弃 ${n} 条早于 ${cutoff} 的条目`);
  }
}

// ── 扫描 ────────────────────────────────────────────────────────────────────

async function runScan(full) {
  if (state.scanning) return;
  state.scanning = true;
  try {
    const s = state.settings;
    let changed = false;

    if (s.sources.zcode !== false) {
      const since = full ? 0 : Math.max(0, state.zcodeCursor - ZCODE_CURSOR_OVERLAP_MS);
      const r = sources.scanZcode(ZCODE_DB || undefined, since);
      state.srcStatus.zcode = { ok: !r.error, sqlite: sources.sqliteAvailable() };
      if (r.error) {
        state.lastError = `zcode: ${r.error}`;
        log('warn', state.lastError);
      } else {
        for (const e of r.entries) state.entries.set(e.k, e);
        if (r.maxTs > state.zcodeCursor) state.zcodeCursor = r.maxTs;
        state.lastTools = r.tools;
        if (r.entries.length) changed = true;
      }
    }

    if (s.sources.claude !== false) {
      const r = await sources.scanClaude(CLAUDE_ROOT || undefined, state.claudeCache);
      if (r.error) {
        state.lastError = `claude: ${r.error}`;
        log('warn', state.lastError);
      } else {
        // 先丢变更文件的旧条目（文件被压缩/清理后不能留幽灵账），再并入新解析
        for (const hint of r.changedHints) dropPrefix(`c:${hint}:`);
        for (const e of r.entries) state.entries.set(e.k, e);
        state.claudeCache = r.cache;
        state.srcStatus.claude = { ok: true, files: Object.keys(r.cache).length, scanned: r.filesScanned };
        if (r.entries.length) changed = true;
        // 文件缓存持久化（mtime 表，体积小）
        try {
          atomicWriteJson(claudeCacheFile, r.cache);
        } catch (_) { /* 失败下轮重扫 */ }
      }
    }

    if (s.sources.polaris !== false) {
      const r = sources.scanPolaris(POLARIS_ROOT);
      state.srcStatus.polaris = { ok: !r.error, files: r.files, withTU: r.withTU };
      if (r.error) {
        state.lastError = `polaris: ${r.error}`;
        log('warn', state.lastError);
      } else {
        for (const e of r.entries) state.entries.set(e.k, e);
        if (r.entries.length) changed = true;
      }
    }

    if (changed) {
      markDirty();
      pruneEntries(Date.now());
    }
    state.lastScanAt = Date.now();
    if (full) state.lastFullScanAt = state.lastScanAt;
    flushEntries(false);
    computeAndPublish();
  } catch (e) {
    state.lastError = e.message;
    log('error', `扫描异常: ${e.stack || e.message}`);
  } finally {
    state.scanning = false;
  }
}

// ── 聚合与发布 ──────────────────────────────────────────────────────────────

function computeAndPublish() {
  const entries = [...state.entries.values()];
  const agg = core.aggregate(entries, state.prices, {
    nowMs: Date.now(),
    tools: state.lastTools || { total: 0, byName: [], destructive: 0 },
  });
  state.aggregates = agg;
  publish(agg).catch((e) => log('warn', `聚合发布失败: ${e.message}`));
}

async function publish(agg) {
  const { K } = core;
  await kv.kvSet(K.summary, agg.summary);
  await kv.kvSet(K.daily, agg.daily);
  await kv.kvSet(K.models, agg.models);
  await kv.kvSet(K.projects, agg.projects);
  await kv.kvSet(K.quality, agg.quality);
  await kv.kvSet(K.sessions, agg.sessions);
}

async function publishMeta() {
  const meta = {
    v: 3,
    version: VERSION,
    name: 'abacus',
    startedAt: state.startedAt,
    lastScanAt: state.lastScanAt,
    lastFullScanAt: state.lastFullScanAt,
    lastError: state.lastError,
    scanning: state.scanning,
    entries: state.entries.size,
    zcodeCursor: state.zcodeCursor,
    smoke: !!SMOKE_ROOT,
    sources: state.srcStatus,
    caliber: {
      zcode: 'input 含缓存读（全价输入 = input − cacheRead − cacheWrite）',
      claude: 'input 不含缓存（Anthropic 惯例）',
      polaris: 'input 不含缓存；costUsd 以宿主网关值为权威',
    },
  };
  await kv.kvSet(core.K.meta, meta).catch((e) => log('warn', `meta 发布失败: ${e.message}`));
}

// ── 价目同步（唯一外网点）──────────────────────────────────────────────────

function isFetchableUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return false;
    const h = url.hostname;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$)/i.test(h)) return false;
    if (/\.local$/i.test(h)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

/** litellm 键 → 规范化价目行（USD/Mtok） */
function litellmToPrice(row) {
  if (!row || typeof row !== 'object') return null;
  const inP = Number(row.input_cost_per_token);
  const outP = Number(row.output_cost_per_token);
  if (!Number.isFinite(inP) && !Number.isFinite(outP)) return null;
  return {
    in: (Number.isFinite(inP) ? inP : 0) * 1e6,
    out: (Number.isFinite(outP) ? outP : 0) * 1e6,
    cacheRead: (Number(row.cache_read_input_token_cost) || 0) * 1e6,
    cacheWrite: (Number(row.cache_creation_input_token_cost) || 0) * 1e6,
    preset: false,
    source: 'litellm',
  };
}

/** 在 litellm 键集中找与 model 匹配的键（精确 → 小写 → 去日期词干） */
function matchLitellmKey(model, keys) {
  if (!model || model === '(未记录)') return '';
  const lower = model.toLowerCase();
  if (keys.has(lower)) return lower;
  const stem = lower.replace(/[-_]\d{8}$/, '');
  if (keys.has(stem)) return stem;
  for (const k of keys) if (stem.startsWith(k) || k.startsWith(stem)) return k;
  return '';
}

async function syncPrices(nonce) {
  const url = state.settings.priceSyncUrl || core.LITELLM_PRICE_URL;
  const fail = (msg) => publishResult(nonce, { ok: false, error: msg });
  if (!isFetchableUrl(url)) return fail(`URL 不可抓取（须 https 且公网）: ${url}`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return fail(`上游 HTTP ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== 'object') return fail('上游价目格式异常');
    const keys = new Set(Object.keys(data).map((k) => k.toLowerCase()));
    const models = new Set([...state.entries.values()].map((e) => e.model).filter(Boolean));
    let updated = 0;
    const next = { ...state.prices };
    for (const m of models) {
      const lk = matchLitellmKey(m, keys);
      if (!lk) continue;
      const row = data[lk] || data[[...keys].find((k) => k === lk)] || null;
      const byKey = data[Object.keys(data).find((k) => k.toLowerCase() === lk)] || null;
      const p = litellmToPrice(byKey || row);
      if (p && p.in + p.out > 0) {
        next[m] = p;
        updated += 1;
      }
    }
    if (updated === 0) return fail('价目表里没有匹配到你台账中的任何模型');
    state.prices = next;
    await kv.kvSet(core.K.prices, state.prices);
    computeAndPublish();
    log('info', `LiteLLM 价目同步成功：更新 ${updated} 个模型`);
    return publishResult(nonce, { ok: true, updated });
  } catch (e) {
    return fail(`同步失败: ${e.message}`);
  }
}

// ── 命令信箱（先删后做）────────────────────────────────────────────────────

async function publishResult(nonce, payload) {
  if (!nonce) return;
  try {
    await kv.kvSet(core.K.resultPrefix + nonce, { ...payload, at: Date.now() });
  } catch (e) {
    log('warn', `result 发布失败: ${e.message}`);
  }
}

async function pollMailbox() {
  let keys = [];
  try {
    keys = await kv.kvKeys();
  } catch (_) {
    return; // 桥暂不可达，下轮再试
  }
  const cmdKeys = keys.filter((k) => typeof k === 'string' && k.startsWith(core.K.cmdPrefix));
  for (const key of cmdKeys) {
    let cmd = null;
    try {
      cmd = await kv.kvGet(key);
    } catch (_) { /* 读失败按空处理 */ }
    await kv.kvDel(key).catch(() => {}); // 先删后做：防重复消费
    const nonce = key.slice(core.K.cmdPrefix.length);
    if (!cmd || typeof cmd !== 'object') continue;
    log('info', `信箱命令: ${cmd.op}（nonce=${nonce}）`);
    if (cmd.op === 'rescan') {
      await runScan(true);
      await publishResult(nonce, { ok: true, entries: state.entries.size, lastScanAt: state.lastScanAt });
    } else if (cmd.op === 'sync_prices') {
      await syncPrices(nonce);
    } else {
      await publishResult(nonce, { ok: false, error: `未知命令: ${cmd.op}` });
    }
  }
  // result 孤儿回收（超 1h 且面板早就不等了）
  for (const key of keys) {
    if (typeof key === 'string' && key.startsWith(core.K.resultPrefix)) {
      try {
        const r = await kv.kvGet(key);
        if (r && r.at && Date.now() - r.at > RESULT_TTL_MS) await kv.kvDel(key);
      } catch (_) { /* 下轮再清 */ }
    }
  }
}

// ── 设置/价目热加载 ────────────────────────────────────────────────────────

async function hotReload() {
  try {
    const s = await kv.kvGet(core.K.settings);
    if (s && typeof s === 'object') {
      state.settings = { ...core.DEFAULT_SETTINGS, ...s, sources: { ...core.DEFAULT_SETTINGS.sources, ...(s.sources || {}) } };
    }
    const p = await kv.kvGet(core.K.prices);
    if (p && typeof p === 'object' && Object.keys(p).length > 0) {
      state.prices = p;
    }
  } catch (_) { /* 桥暂不可达，用当前值 */ }
}

// ── HTTP 健康 ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/__health')) {
    const body = JSON.stringify({
      ok: true,
      version: VERSION,
      entries: state.entries.size,
      lastScanAt: state.lastScanAt,
      lastFullScanAt: state.lastFullScanAt,
      scanning: state.scanning,
      smoke: !!SMOKE_ROOT,
      sources: state.srcStatus,
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

// ── 主循环 ──────────────────────────────────────────────────────────────────

async function main() {
  loadCache();
  await hotReload();
  log('info', `abacus service v${VERSION} 启动（dataRoot=${POLARIS_ROOT || '未找到'} smoke=${!!SMOKE_ROOT} sqlite=${sources.sqliteAvailable()}）`);

  server.listen(Number(process.argv[2]) || 0, '127.0.0.1', () => {
    const addr = server.address();
    log('info', `健康检查就绪: http://127.0.0.1:${addr && addr.port}/__health`);
  });

  // 首扫（全量）——在后台让出式执行，健康检查立即就绪
  setTimeout(() => { runScan(true).then(() => publishMeta()); }, 100);

  let lastMeta = 0;
  let lastSettings = 0;
  let lastAuto = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await sleep(TICK_MS);
    const now = Date.now();
    try {
      if (now - lastSettings >= SETTINGS_MS) {
        lastSettings = now;
        await hotReload();
      }
      if (now - lastMeta >= META_MS) {
        lastMeta = now;
        await publishMeta();
      }
      await pollMailbox();
      const autoMin = Number(state.settings.autoRescanMin) || 5;
      if (!state.scanning && now - lastAuto >= autoMin * 60000) {
        lastAuto = now;
        await runScan(false);
      }
    } catch (e) {
      log('warn', `主循环异常（继续）: ${e.message}`);
    }
  }
}

process.on('unhandledRejection', (e) => log('warn', `unhandledRejection: ${e && e.message}`));
main().catch((e) => {
  log('error', `启动失败: ${e.stack || e.message}`);
  process.exit(1);
});
