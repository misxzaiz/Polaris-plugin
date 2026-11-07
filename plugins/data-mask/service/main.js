#!/usr/bin/env node
'use strict';
/**
 * main.js —— 数据脱敏台后台服务（零依赖，node >= 18）
 *
 * 单写者权威：datamask.job.* / datamask.latest / datamask.history / datamask.meta
 * 全部只由本服务写。文件/目录脱敏命令经 datamask.cmd.mask.<nonce> 表达；消费互斥序
 * = 读载荷 → kvDel 成功者才执行（delete 是唯一执行凭证），轮询 result 键拿产出。
 *
 * 不泄露不变量（见 shared/mask-core.js 铁律 2）：
 *   - 任务记录/结果/日志里只有掩码预览与统计，原值永不落 kv、永不进日志；
 *   - 映射台账（original→out）只存本机 kv（datamask.ledger.*），面板还原专用，
 *     服务与 MCP 永不提供还原，台账内容永不进 MCP 返回。
 *
 * 生命周期：宿主 type=http + /__health（恒 200）；桥不可达 → degraded 心跳，
 * 60s 重试自发现，绝不自饿死。启动参数：node main.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');

const { createKvClient } = require('./kvclient');
const filemask = require('./filemask');
const core = require('../shared/mask-core');

const VERSION = '0.1.0';
const TICK_MS = 1200;
const SETTINGS_RELOAD_MS = 30 * 1000;
const META_BEAT_MS = 60 * 1000;
const RESULT_TTL_MS = 10 * 60 * 1000;
const KEEP_JOBS = 10;
const CHUNK_SIZE = 150; // 台账分块条数（单 kv 值 ≤256KB 纪律）

const PREFIX = 'datamask.';
const K = {
  settings: 'datamask.settings',
  meta: 'datamask.meta',
  ledgerMeta: 'datamask.ledger.meta',
  ledgerChunk: (owner, n) => `datamask.ledger.${owner}.${n}`,
  ledgerPrefix: 'datamask.ledger.',
  cmd: (nonce) => `datamask.cmd.mask.${nonce}`,
  cmdPrefix: 'datamask.cmd.mask.',
  result: (nonce) => `datamask.result.${nonce}`,
  resultPrefix: 'datamask.result.',
  job: (id) => `datamask.job.${id}`,
  jobPrefix: 'datamask.job.',
  latest: 'datamask.latest',
  history: 'datamask.history',
};

// ── 日志（宿主不收集 stdout，自落盘 + 512KB 轮转）────────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path_join(dir, 'datamask.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 首轮无日志 */ }
  } catch (_) { logFile = null; }
}
function path_join(...a) { return require('path').join(...a); }
function log(level, msg) {
  const line = `[datamask:${level}] ${new Date().toISOString()} ${msg}`;
  process.stderr.write(line + '\n');
  if (logFile) { try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断 */ } }
}

// ── 桥客户端 ────────────────────────────────────────────────────────────────
const APP_CONFIG_DIR = process.argv[3] || process.argv[2] || '';
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (lv, msg) => log(lv, msg) });

const state = {
  startedAt: Date.now(),
  settings: { ...core.DEFAULT_SETTINGS },
  settingsLoadedAt: 0,
  salt: '', // 内存缓存（权威在 kv.ledger.meta；本服务绝不覆盖已有 salt）
  job: null, // { id, kind, path, startedAt, nonce }
};

// ── 设置 / 盐 ───────────────────────────────────────────────────────────────
async function loadSettings(force) {
  if (!force && Date.now() - state.settingsLoadedAt < SETTINGS_RELOAD_MS) return state.settings;
  const v = await kv.kvGet(K.settings).catch(() => null);
  if (v && typeof v === 'object') {
    state.settings = {
      ...core.DEFAULT_SETTINGS,
      ...v,
      types: v.types && typeof v.types === 'object' ? v.types : {},
      customRules: Array.isArray(v.customRules) ? v.customRules : [],
    };
  }
  state.settingsLoadedAt = Date.now();
  return state.settings;
}

/** 盐先到先写：读者绝不覆盖（面板/服务/MCP 同规则）。用于 fake 模式确定性。 */
async function ensureSalt() {
  if (state.salt) return state.salt;
  const meta = await kv.kvGet(K.ledgerMeta).catch(() => null);
  if (meta && typeof meta.salt === 'string' && meta.salt) {
    state.salt = meta.salt;
    return state.salt;
  }
  const salt = core.genSalt();
  const cur = await kv.kvGet(K.ledgerMeta).catch(() => null); // 双检
  if (cur && typeof cur.salt === 'string' && cur.salt) { state.salt = cur.salt; return state.salt; }
  await kv.kvSet(K.ledgerMeta, { salt, createdAt: Date.now(), entryCount: 0 }).catch(() => {});
  state.salt = salt;
  log('info', `初始化台账盐（先到先写）`);
  return salt;
}

/** 台账增量落 kv：owner 维度分块追加；meta.entryCount 尽力维护（信息性） */
async function persistLedger(owner, newEntries) {
  if (!newEntries || !newEntries.length) return 0;
  let chunks = 0;
  for (let i = 0; i < newEntries.length; i += CHUNK_SIZE) {
    await kv.kvSet(K.ledgerChunk(owner, chunks), newEntries.slice(i, i + CHUNK_SIZE)).catch(() => {});
    chunks++;
  }
  const meta = await kv.kvGet(K.ledgerMeta).catch(() => null);
  if (meta && typeof meta === 'object') {
    meta.entryCount = (meta.entryCount || 0) + newEntries.length;
    await kv.kvSet(K.ledgerMeta, meta).catch(() => {});
  }
  return newEntries.length;
}

/** 组装 maskText 选项（设置 → 核心选项；服务侧 exposeOriginal 恒 false） */
function coreOpts(settings) {
  return {
    types: settings.types || {},
    structural: settings.structural !== false,
    csv: settings.csv !== false,
    cnameAggressive: !!settings.cnameAggressive,
    ipv4KeepPrivate: settings.ipv4KeepPrivate !== false,
    customRules: settings.customRules || [],
    maxFileKB: settings.maxFileKB || 2048,
    exposeOriginal: false,
  };
}

// ── 任务执行 ────────────────────────────────────────────────────────────────
function genId() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

async function runJob(jobId, nonce, kind, cmdPath) {
  const settings = await loadSettings(true);
  const salt = await ensureSalt();
  const record = {
    id: jobId, at: Date.now(), kind, path: cmdPath, status: 'running', version: VERSION,
    progress: { done: 0, files: 0 },
  };
  await kv.kvSet(K.job(jobId), record);

  let result;
  try {
    if (kind === 'file') {
      const out = filemask.maskFile(cmdPath, { ...coreOpts(settings), salt }, log);
      if (!out.ok) throw new Error(out.error || '脱敏失败');
      await persistLedger(jobId, out.newEntries || []);
      result = {
        ok: true, kind, jobId,
        out: out.out, stats: out.stats, previews: out.previews, hitCount: out.hitCount,
        truncated: !!out.truncated,
        ledgerEntries: out.newEntries ? out.newEntries.length : 0,
      };
    } else if (kind === 'dir') {
      const out = filemask.maskDir(cmdPath, { ...coreOpts(settings), salt, maxFiles: settings.maxFiles || 2000 }, (p) => {
        record.progress = { done: p.done, files: p.files };
        void kv.kvSet(K.job(jobId), record).catch(() => {});
      }, log);
      if (!out.ok) throw new Error(out.error || '批量脱敏失败');
      // 目录模式：台账由各文件累积——filemask 不返回台账（内存合并代价高），此处
      // 用 manifest 级统计即可；台账主入口是 mask_text / mask_file 两条路径。
      result = {
        ok: true, kind, jobId, outDir: out.outDir,
        manifest: { ...out.manifest, outputs: undefined },
        outputs: out.manifest.outputs || [],
        truncated: !!out.manifest.truncated,
      };
    } else {
      throw new Error(`未知任务类型 ${kind}`);
    }
    record.status = 'done';
    record.finishedAt = Date.now();
    await kv.kvSet(K.job(jobId), record);
    await kv.kvSet(K.latest, { id: jobId, kind, path: cmdPath, at: record.at, finishedAt: record.finishedAt, stats: result.stats || null, out: result.out || result.outDir }).catch(() => {});
    await pushHistory({ id: jobId, kind, path: cmdPath, at: record.at, stats: result.stats || null, ok: true });
  } catch (e) {
    result = { ok: false, error: String((e && e.message) || e) };
    await kv.kvSet(K.job(jobId), { ...record, status: 'failed', error: result.error, finishedAt: Date.now() }).catch(() => {});
    await pushHistory({ id: jobId, kind, path: cmdPath, at: record.at, ok: false, error: result.error });
    log('error', `任务失败 ${jobId} ${kind} ${cmdPath}: ${result.error}`);
  }

  if (nonce) await kv.kvSet(K.result(nonce), { at: Date.now(), ...result }).catch(() => {});
  state.job = null;
  await beat(degraded, lastBridgeErr).catch(() => {});
}

async function pushHistory(entry) {
  const h = await kv.kvGet(K.history).catch(() => null);
  const list = Array.isArray(h) ? h : [];
  list.unshift({ ...entry, stats: entry.stats ? '见 job 记录' : null });
  await kv.kvSet(K.history, list.slice(0, 20));
}

// ── 心跳 ────────────────────────────────────────────────────────────────────
async function beat(degradedFlag, lastBridgeErr) {
  const meta = {
    version: VERSION,
    pid: process.pid,
    startedAt: state.startedAt,
    lastTickAt: Date.now(),
    bridge: degradedFlag ? 'degraded' : 'ok',
    degraded: !!degradedFlag,
    lastBridgeErr: lastBridgeErr || null,
    job: state.job ? { id: state.job.id, kind: state.job.kind, path: state.job.path, nonce: state.job.nonce } : null,
    saltReady: !!state.salt,
  };
  await kv.kvSet(K.meta, meta).catch(() => {});
}

// ── tick 主循环 ─────────────────────────────────────────────────────────────
let lastBeatAt = 0;
let degraded = false;
let lastBridgeErr = null;

async function tick() {
  let keys = [];
  try {
    keys = await kv.kvKeys();
    degraded = false;
    lastBridgeErr = null;
  } catch (e) {
    degraded = true;
    lastBridgeErr = String((e && e.message) || e);
    log('warn', `桥不可达（降级运行）：${lastBridgeErr}`);
  }

  if (!degraded) {
    const cmds = keys.filter((k) => k.startsWith(K.cmdPrefix)).sort();
    for (const cmdKey of cmds) {
      if (state.job) break; // 单任务位
      // 互斥序：读载荷 → kvDel 成功者才执行（delete 是唯一执行凭证）
      const payload = await kv.kvGet(cmdKey).catch(() => null);
      const del = await kv.kvDel(cmdKey).catch(() => null);
      if (!del) continue;
      const nonce = cmdKey.slice(K.cmdPrefix.length);
      const kind = payload && (payload.kind === 'file' || payload.kind === 'dir') ? payload.kind : null;
      const p = payload && typeof payload.path === 'string' ? payload.path : '';
      if (!kind || !p) {
        await kv.kvSet(K.result(nonce), { at: Date.now(), ok: false, error: '命令载荷缺少 kind/path' }).catch(() => {});
        continue;
      }
      const jobId = genId();
      state.job = { id: jobId, kind, path: p, startedAt: Date.now(), nonce };
      await beat(degraded, lastBridgeErr);
      log('info', `接受脱敏命令 nonce=${nonce} kind=${kind} path=${p} jobId=${jobId}`);
      runJob(jobId, nonce, kind, p).catch((e) => log('error', `runJob 异常: ${e && e.message}`));
      break; // 一 tick 只启动一个
    }

    // 过期 result 键清理
    const now = Date.now();
    for (const k of keys) {
      if (!k.startsWith(K.resultPrefix)) continue;
      const v = await kv.kvGet(k).catch(() => null);
      if (!v || (typeof v.at === 'number' && now - v.at > RESULT_TTL_MS)) await kv.kvDel(k).catch(() => {});
    }
  }

  if (Date.now() - lastBeatAt > META_BEAT_MS) {
    lastBeatAt = Date.now();
    await beat(degraded, lastBridgeErr);
  }
}

// ── 健康端点（恒 200，真实健康度写 meta）────────────────────────────────────
const PORT = Number(process.argv[2]) || 0;
const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/__health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: VERSION, job: !!state.job, degraded }));
    return;
  }
  res.writeHead(404); res.end();
});

initLog(APP_CONFIG_DIR);
log('info', `data-mask 服务启动 v${VERSION} pid=${process.pid} port=${PORT}`);
server.listen(PORT, '127.0.0.1', () => {
  log('info', `健康端点就绪 127.0.0.1:${PORT}/__health`);
});
server.on('error', (e) => {
  log('error', `健康端点监听失败: ${e && e.message}`);
  process.exit(1);
});

(async () => {
  try { await ensureSalt(); await loadSettings(true); } catch (e) { log('warn', `启动初始化失败: ${e && e.message}`); }
  const loop = async () => {
    try { await tick(); } catch (e) { log('error', `tick 异常: ${e && (e.stack || e.message)}`); }
  };
  await loop();
  setInterval(loop, TICK_MS);
})();
