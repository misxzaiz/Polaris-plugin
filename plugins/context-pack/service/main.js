#!/usr/bin/env node
'use strict';
/**
 * main.js —— 上下文打包台后台服务（零依赖，node >= 18）
 *
 * 职责：
 *   - 命令消费（先删后做）：cpk.cmd.scan / pack / cleanup → 立即回 ack（cpk.result.<nonce>），
 *     任务异步执行，进度/结果写 cpk.scan.<id> / cpk.pack.<id>（面板轮询索引键，不依赖长超时）
 *   - 扫描：shared/core.scanDirectory（流式 + 护栏），树以紧凑行分块镜像 cpk.scan.<id>.t.<n>
 *   - 打包：shared/core.packBundle → bundle 文件落 <dataRoot>/polaris-context/bundles/，
 *     内容分块镜像 cpk.pack.<id>.c.<n>（256KB × ≤16 = 4MB 封顶；文件永远完整）
 *   - cpk.idx：cpk.pack.* 键的纯投影（服务重建，最近 10 条；面板只读此单键，不做 kv list）
 *   - 保留窗口：scan 8 个 / pack 10 个，过期键与 bundle 文件自动清理（cleanup 命令亦可手动触发）
 *   - /__health 恒 200；bridge 不可达时 meta.degraded=true（任务文件产物不受影响）
 *
 * 生命周期由宿主 PluginServiceManager 管理。启动参数：node main.js <port> <appConfigDir>
 * 单写者纪律：cpk.scan.* / cpk.pack.* / cpk.meta / cpk.idx 仅本进程写；
 * cpk.settings / cpk.sel 由面板写（键不相交）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const core = require('../shared/core');
const { createKvClient } = require('../shared/kvclient');

const VERSION = core.VERSION;
const TICK_MS = 2000;
const SETTINGS_REREAD_MS = 3 * 1000;
const META_BEAT_MS = 60 * 1000;
const CLEANUP_MS = 5 * 60 * 1000;
const TREE_CHUNK_BYTES = 192 * 1024;   // 树行分块（文本）
const PACK_CHUNK_BYTES = 256 * 1024;   // 包内容分块
const PACK_MAX_CHUNKS = 16;            // 4MB 封顶
const KEEP_SCANS = 8;
const KEEP_PACKS = 10;

const K = {
  settings: 'cpk.settings',
  meta: 'cpk.meta',
  idx: 'cpk.idx',
};
const SCAN_PREFIX = 'cpk.scan.';
const TREE_CHUNK_PREFIX = '.t.';
const PACK_PREFIX = 'cpk.pack.';
const PACK_CHUNK_INFIX = '.c.';
const CMD_PREFIX = 'cpk.cmd.';
const RESULT_PREFIX = 'cpk.result.';

// ── 文件日志（宿主不收集插件服务 stdout；自行落盘 + 512KB 轮转）──────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'context-pack.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
function log(level, msg) {
  // 纪律：日志不落文件内容；相对路径可落，绝对路径仅记最后两段
  const line = `${new Date().toISOString()} [${level}] ${msg}`;
  if (level === 'debug' && process.env.CPK_DEBUG !== '1') return;
  if (logFile) { try { fs.appendFileSync(logFile, line + '\n'); } catch (_) {} }
}

// ── dataRoot 解析（appConfigDir 就近优先，anchor 兜底；与 kvclient 同序）─────
function resolveDataRoot(appConfigDir) {
  const cands = [];
  if (appConfigDir) cands.push(appConfigDir); // dev=Polaris-dev（其自身即数据根）；prod=数据根本身
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) cands.push(a.dataRoot);
    } catch (_) { /* 跳过 */ }
  }
  return cands[0] || null;
}

function bundlesDir(appConfigDir) {
  const root = resolveDataRoot(appConfigDir);
  const base = root || appConfigDir || os.tmpdir();
  const dir = path.join(base, 'polaris-context', 'bundles');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* 写失败时 pack 报错呈现 */ }
  return dir;
}

// ── settings 归一化（与面板/文档三方一致）──────────────────────────────────
function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const extra = String(s.ignoreExtra || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).slice(0, 200);
  return {
    version: 1,
    ignoreExtra: extra.join('\n'),
    includeLockfiles: s.includeLockfiles === true,
    maxFileKb: clampInt(s.maxFileKb, 16, 4096, 512),
    format: s.format === 'md' ? 'md' : 'xml',
    headerText: String(s.headerText || '').slice(0, 2000),
    updatedAt: Date.now(),
  };
}
function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

// ── 任务管理 ──────────────────────────────────────────────────────────────
const jobs = new Map(); // id -> { kind:'scan'|'pack', state, startedAt, ... }
let lastScan = null;    // { path, entries } —— pack 复用树（内存单份，20k 行 ≈ 数 MB 内）

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function runScanJob(id, rootPath, settings) {
  const base = {
    id, path: rootPath, state: 'running', startedAt: Date.now(),
    fileCount: 0, dirCount: 0, totalTokens: 0, totalBytes: 0,
    treeChunks: 0, truncated: false, skipCount: 0, ignoreCount: 0,
  };
  jobs.set(id, { kind: 'scan', ...base });
  await safeKvSet(`${SCAN_PREFIX}${id}`, base);
  try {
    const { entries, stats } = await core.scanDirectory(
      rootPath,
      {
        includeLockfiles: settings.includeLockfiles,
        extraIgnores: settings.ignoreExtra,
        maxFileKb: settings.maxFileKb,
        maxFiles: 20000,
      },
      (p) => {
        const job = jobs.get(id);
        if (job) { job.fileCount = p.files; job.dirCount = p.dirs; job.totalBytes = p.bytes; }
      },
    );
    lastScan = { path: path.resolve(rootPath), entries, at: Date.now() };
    // 树分块存紧凑 JSONL 条目行（面板重建交互树/勾选/token 列的契约格式；
    // 渲染树文本由面板/打包侧按需从条目生成）
    const treeText = core.serializeEntries(entries);
    const treeChunks = core.chunkString(treeText, TREE_CHUNK_BYTES);
    const done = {
      ...base,
      state: 'done',
      finishedAt: Date.now(),
      fileCount: stats.fileCount,
      dirCount: stats.dirCount,
      totalTokens: stats.totalTokens,
      totalBytes: stats.totalBytes,
      treeChunks: treeChunks.length,
      truncated: stats.truncated,
      skipCount: stats.skipped,
      ignoreCount: stats.ignored,
    };
    jobs.set(id, { kind: 'scan', ...done });
    for (let i = 0; i < treeChunks.length; i++) {
      await safeKvSet(`${SCAN_PREFIX}${id}${TREE_CHUNK_PREFIX}${i}`, treeChunks[i]);
    }
    await safeKvSet(`${SCAN_PREFIX}${id}`, done);
    log('info', `scan done id=${id} files=${stats.fileCount} tokens=${stats.totalTokens} chunks=${treeChunks.length}`);
  } catch (e) {
    const err = { ...base, state: 'error', finishedAt: Date.now(), error: String(e && e.message || e) };
    jobs.set(id, { kind: 'scan', ...err });
    await safeKvSet(`${SCAN_PREFIX}${id}`, err);
    log('error', `scan failed id=${id}: ${err.error}`);
  }
}

/** 归一化 include 列表：posix 化、去重、剔除目录/越界（复用 core 纯函数） */
function normalizeInclude(list, rootAbs) {
  const { files } = core.filterExistingFiles(rootAbs, list);
  return files;
}

async function runPackJob(id, params, settings) {
  const rootPath = params.path;
  const format = params.format === 'md' ? 'md' : (params.format === 'xml' ? 'xml' : settings.format);
  const base = {
    id, path: rootPath, format, state: 'running', startedAt: Date.now(), origin: 'panel',
  };
  jobs.set(id, { kind: 'pack', ...base });
  await safeKvSet(`${PACK_PREFIX}${id}`, base);
  try {
    const rootAbs = path.resolve(rootPath);
    let include = normalizeInclude(params.include, rootAbs);
    let treeEntries = null;
    let treeText = '';
    if (!include.length) {
      // 未给 include：按忽略规则整目录打包（重新扫描拿文件清单 + 树）
      const { entries } = await core.scanDirectory(rootAbs, {
        includeLockfiles: settings.includeLockfiles,
        extraIgnores: settings.ignoreExtra,
        maxFileKb: settings.maxFileKb,
        maxFiles: 20000,
      }, null);
      treeEntries = entries;
      include = entries.filter((e) => !e[1] && !String(e[4]).includes('b') && !String(e[4]).includes('L')).map((e) => e[0]);
    } else if (lastScan && lastScan.path === rootAbs) {
      treeEntries = lastScan.entries; // 复用内存中的上次扫描树
    }
    treeText = treeEntries ? core.renderTree(treeEntries, { withTokens: true }) : include.join('\n');
    const header = params.header !== undefined
      ? String(params.header || '').slice(0, 2000) || undefined
      : (settings.headerText || undefined);
    const packed = core.packBundle(rootAbs, include, {
      format, header, treeText, maxFileKb: settings.maxFileKb,
    });
    // 落盘（永远完整）
    const dir = bundlesDir(appConfigDir);
    const ext = format === 'md' ? '.md' : '.txt';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `${stamp}-${id.slice(0, 8)}${ext}`;
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, packed.text, 'utf8');
    // 内容分块镜像（≤4MB；超出仅文件）
    const chunks = core.chunkString(packed.text, PACK_CHUNK_BYTES);
    const mirrored = Math.min(chunks.length, PACK_MAX_CHUNKS);
    for (let i = 0; i < mirrored; i++) {
      await safeKvSet(`${PACK_PREFIX}${id}${PACK_CHUNK_INFIX}${i}`, chunks[i]);
    }
    const done = {
      ...base,
      state: 'done',
      finishedAt: Date.now(),
      stats: {
        files: packed.stats.files,
        bytes: packed.stats.bytes,
        tokens: packed.stats.tokens,
        treeLines: packed.stats.treeLines,
      },
      file: filePath,
      fileBytes: Buffer.byteLength(packed.text, 'utf8'),
      chunks: mirrored,
      chunkTruncated: chunks.length > PACK_MAX_CHUNKS,
      truncatedFiles: packed.stats.truncatedFiles.slice(0, 50),
    };
    jobs.set(id, { kind: 'pack', ...done });
    await safeKvSet(`${PACK_PREFIX}${id}`, done);
    await rebuildIdx();
    log('info', `pack done id=${id} files=${done.stats.files} tokens=${done.stats.tokens} file=${fileName} chunks=${mirrored}/${chunks.length}`);
  } catch (e) {
    const err = { ...base, state: 'error', finishedAt: Date.now(), error: String(e && e.message || e) };
    jobs.set(id, { kind: 'pack', ...err });
    await safeKvSet(`${PACK_PREFIX}${id}`, err);
    log('error', `pack failed id=${id}: ${err.error}`);
  }
}

/** cpk.idx = cpk.pack.* 键投影（最近 KEEP_PACKS 条；含 error/mcp 来源，面板可辨） */
async function rebuildIdx() {
  try {
    const keys = await kv.kvKeys();
    const packKeys = keys.filter((k) => k.startsWith(PACK_PREFIX) && !k.includes(PACK_CHUNK_INFIX));
    const packs = [];
    for (const k of packKeys) {
      const v = await kv.kvGet(k);
      if (v && typeof v === 'object') {
        packs.push({
          id: v.id, path: v.path, format: v.format, state: v.state, origin: v.origin || 'panel',
          startedAt: v.startedAt, finishedAt: v.finishedAt,
          tokens: v.stats ? v.stats.tokens : undefined,
          files: v.stats ? v.stats.files : undefined,
          file: v.file, fileBytes: v.fileBytes,
        });
      }
    }
    packs.sort((a, b) => (b.finishedAt || b.startedAt || 0) - (a.finishedAt || a.startedAt || 0));
    await kv.kvSet(K.idx, { packs: packs.slice(0, KEEP_PACKS), updatedAt: Date.now() });
  } catch (e) {
    log('warn', `rebuildIdx 失败: ${e.message}`);
  }
}

/** 清理：保留最近 KEEP_SCANS / KEEP_PACKS，其余键与 bundle 文件删除 */
async function cleanupOld() {
  const removed = { scans: 0, packs: 0, files: 0 };
  try {
    const keys = await kv.kvKeys();
    const scanIds = new Map();
    const packIds = new Map();
    for (const k of keys) {
      if (k.startsWith(SCAN_PREFIX)) {
        const rest = k.slice(SCAN_PREFIX.length);
        if (rest.includes(TREE_CHUNK_PREFIX)) continue;
        scanIds.set(rest, k);
      } else if (k.startsWith(PACK_PREFIX)) {
        const rest = k.slice(PACK_PREFIX.length);
        if (rest.includes(PACK_CHUNK_INFIX)) continue;
        packIds.set(rest, k);
      }
    }
    const byFinish = async (idMap, prefix, chunkInfix, keep) => {
      const meta = [];
      for (const [id] of idMap) {
        const v = await kv.kvGet(prefix + id);
        meta.push({ id, at: (v && (v.finishedAt || v.startedAt)) || 0 });
      }
      meta.sort((a, b) => b.at - a.at);
      const doomed = meta.slice(keep).map((m) => m.id);
      for (const id of doomed) {
        for (const k of keys) {
          if (k === prefix + id || k.startsWith(prefix + id + chunkInfix) || (prefix === SCAN_PREFIX && k.startsWith(prefix + id + TREE_CHUNK_PREFIX))) {
            await kv.kvDel(k);
          }
        }
      }
      return doomed.length;
    };
    removed.scans = await byFinish(scanIds, SCAN_PREFIX, TREE_CHUNK_PREFIX, KEEP_SCANS);
    removed.packs = await byFinish(packIds, PACK_PREFIX, PACK_CHUNK_INFIX, KEEP_PACKS);
    // bundle 文件：保留仍被保留 pack 引用的，其余删除（>24h 一律清）
    const dir = bundlesDir(appConfigDir);
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch (_) { /* 目录可能不存在 */ }
    const liveFiles = new Set();
    for (const [id] of packIds) {
      const v = await kv.kvGet(PACK_PREFIX + id);
      if (v && v.file) liveFiles.add(path.basename(v.file));
    }
    const now = Date.now();
    for (const f of entries) {
      const full = path.join(dir, f);
      if (liveFiles.has(f)) continue;
      try {
        const st = fs.statSync(full);
        if (now - st.mtimeMs > 24 * 3600 * 1000 || removed.packs > 0 || removed.scans > 0) {
          fs.unlinkSync(full);
          removed.files++;
        }
      } catch (_) { /* 跳过 */ }
    }
    if (removed.scans || removed.packs || removed.files) {
      log('info', `cleanup: scans-${removed.scans} packs-${removed.packs} files-${removed.files}`);
    }
  } catch (e) {
    log('warn', `cleanup 失败: ${e.message}`);
  }
  return removed;
}

// ── 命令消费（先删后做）───────────────────────────────────────────────────
async function consumeCommands() {
  const keys = await kv.kvKeys();
  const cmdKeys = keys.filter((k) => k.startsWith(CMD_PREFIX));
  for (const key of cmdKeys) {
    let cmd = null;
    try { cmd = await kv.kvGet(key); } catch (_) { continue; }
    await kv.kvDel(key); // 先删后做：防重复消费
    if (!cmd || typeof cmd !== 'object') continue;
    const op = cmd.op;
    const nonce = String(cmd.nonce || key.slice(CMD_PREFIX.length).split('.').pop() || 'unknown');
    log('info', `cmd ${op} nonce=${nonce}`);
    try {
      if (op === 'scan') {
        const p = String(cmd.path || '').trim();
        if (!p) throw new Error('缺少 path 参数');
        if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) throw new Error(`目录不存在或不是目录: ${p}`);
        const id = String(cmd.id || newId());
        ack(nonce, { ok: true, id, ack: 'started' });
        void runScanJob(id, p, currentSettings); // 异步执行；进度写 cpk.scan.<id>
      } else if (op === 'pack') {
        const p = String(cmd.path || '').trim();
        if (!p) throw new Error('缺少 path 参数');
        if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) throw new Error(`目录不存在或不是目录: ${p}`);
        const id = String(cmd.id || newId());
        ack(nonce, { ok: true, id, ack: 'started' });
        void runPackJob(id, { path: p, include: cmd.include, format: cmd.format, header: cmd.header }, currentSettings);
      } else if (op === 'cleanup') {
        const removed = await cleanupOld();
        ack(nonce, { ok: true, removed });
      } else {
        ack(nonce, { ok: false, error: `未知命令 op=${op}` });
      }
    } catch (e) {
      ack(nonce, { ok: false, error: String(e && e.message || e) });
    }
  }
}

async function ack(nonce, payload) {
  await safeKvSet(`${RESULT_PREFIX}${nonce}`, { ...payload, at: Date.now() });
}

async function safeKvSet(key, value) {
  try {
    await kv.kvSet(key, value);
    meta.degraded = false;
  } catch (e) {
    meta.degraded = true;
    log('warn', `kvSet 失败（降级运行）key=${key.slice(0, 40)}: ${e.message}`);
  }
}

// ── 主循环 ────────────────────────────────────────────────────────────────
const appConfigDir = process.argv[3] || '';
initLog(appConfigDir);
const kv = createKvClient({ appConfigDir, log });
const meta = {
  version: VERSION,
  pid: process.pid,
  startedAt: Date.now(),
  lastTickAt: Date.now(),
  degraded: false,
  dataDir: null,
  packsTotal: 0,
};
let currentSettings = normalizeSettings(null);
let lastSettingsRead = 0;
let lastMetaBeat = 0;
let lastCleanupAt = 0;
let packCounterTotal = 0;

async function tick() {
  const now = Date.now();
  if (now - lastSettingsRead >= SETTINGS_REREAD_MS) {
    lastSettingsRead = now;
    try {
      const raw = await kv.kvGet(K.settings);
      currentSettings = normalizeSettings(raw);
    } catch (_) { /* 保持上次设置 */ }
  }
  try {
    await consumeCommands();
  } catch (e) {
    log('warn', `consumeCommands: ${e.message}`);
  }
  // 扫描进度热写（每 tick）
  for (const [id, job] of jobs) {
    if (job.kind === 'scan' && job.state === 'running') {
      try {
        await kv.kvSet(`${SCAN_PREFIX}${id}`, {
          id, path: job.path, state: 'running', startedAt: job.startedAt,
          fileCount: job.fileCount, dirCount: job.dirCount, totalBytes: job.totalBytes,
        });
        meta.degraded = false;
      } catch (_) { meta.degraded = true; }
    }
  }
  if (now - lastMetaBeat >= META_BEAT_MS) {
    lastMetaBeat = now;
    meta.lastTickAt = Date.now();
    meta.dataDir = bundlesDir(appConfigDir);
    try {
      const idx = await kv.kvGet(K.idx);
      meta.packsTotal = idx && Array.isArray(idx.packs) ? idx.packs.length : 0;
    } catch (_) { /* 忽略 */ }
    await safeKvSet(K.meta, meta);
  }
  if (now - lastCleanupAt >= CLEANUP_MS) {
    lastCleanupAt = now;
    await cleanupOld();
    // jobs 内存表同步剪枝（>1h 已完结任务出表）
    for (const [id, job] of jobs) {
      if (job.state !== 'running' && now - (job.finishedAt || job.startedAt) > 3600 * 1000) jobs.delete(id);
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: VERSION, uptime: process.uptime(), degraded: meta.degraded }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found（服务无业务 HTTP 面，交互走 cap.kv）' }));
});

// 端口被占等 listen 失败必须退出：否则进程残留为僵尸 tick，与占口实例双写 kv（实测教训）
server.on('error', (e) => {
  log('error', `server error: ${e && e.message} —— 进程退出，交由宿主 restartOnFailure 重建`);
  process.exit(1);
});

server.listen(parseInt(process.argv[2], 10) || 0, '127.0.0.1', () => {
  const addr = server.address();
  log('info', `context-pack service listening on 127.0.0.1:${addr.port} (pid ${process.pid})`);
  let tickTimer = setInterval(() => { void tick(); }, TICK_MS);
  tickTimer.unref?.();
  void tick(); // 首轮立即跑
  process.send?.({ type: 'ready', port: addr.port });
});

process.on('SIGTERM', () => {
  log('info', 'SIGTERM: 优雅关闭');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
});
process.on('uncaughtException', (e) => {
  log('error', `uncaughtException: ${e && e.stack || e}`);
});
process.on('unhandledRejection', (e) => {
  log('error', `unhandledRejection: ${e && e.message || e}`);
});
