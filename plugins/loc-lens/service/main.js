'use strict';
/**
 * main.js —— 行数透视台后台服务（node ≥18，零外部依赖；数据不出本机）
 *
 * 职责：给定一个项目根目录，递归统计各模块代码行数，并准实时保持更新。
 *   全量扫描（Buffer 计行，无需解码）→ fs.watch 递归监听 → 防抖增量重算
 *   → HTTP 供面板轮询 → cap.kv 投影 meta（面板/外部发现本服务）。
 *
 * 架构（repo-lens 三方共享 cap.kv 同一事实库范式）：
 *   面板 ──(127.0.0.1 直连 + Bearer token，2s 轮询 /api/stats)──▶ 本服务
 *   本服务 ──(kvclient → 宿主 /api/router-dispatch → cap.kv)──▶ 宿主
 *
 * kv 键空间（loclens. 前缀，勿与他插件撞）：
 *   loclens.meta     {port,token,pid,version,startedAt,live} 心跳 60s（服务单写者）
 *   loclens.settings {manualRoot, recentPaths[]}（面板写、服务只读参考）
 *
 * 安全模型：
 *   - 仅监听 127.0.0.1；除 /__health 外全部要求 Authorization: Bearer <token>（timingSafe 比对）
 *   - 只读文件系统：仅 readdir/readFile/stat/watch，不写任何用户文件
 *   - 扫描根必须存在且为目录，拒绝越出根的符号链接逃逸（realpath 前缀校验）
 *   - 零网络出站（唯一 HTTP 是回环服务本身与宿主 kv 桥）；唯一写盘 = 经宿主的 kv 投影
 */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const { createKvClient } = require('./kvclient');
const core = require('../shared/core');

const VERSION = core.VERSION;
const PORT = parseInt(process.argv[2] || '0', 10) || 0;
const appConfigDir = process.argv[3] || '';
const STARTED_AT = Date.now();
const META_BEAT_MS = 60_000;

// 扫描上限（防失控；超出即截断并在结果中明示，不静默）
const MAX_FILES = 30_000;          // 最多统计的文本文件数
const MAX_TOTAL_BYTES = 256 * 1024 * 1024; // 读入内容总上限
const MAX_ERRORS = 20;
const WATCH_DEBOUNCE_MS = 800;     // fs.watch 防抖
const ROOT_TTL_MS = 10 * 60_000;   // 无轮询访问的根保留时长（之后停 watch 省 IO）

function log(level, msg) {
  try { process.stderr.write(`[loc-lens-svc][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

const kv = createKvClient({ appConfigDir, log });

// ── 扫描状态 ───────────────────────────────────────────────────────────────
/** root → { stats, watcher, dirty:Set, timer, lastAccess, scanning } */
const scans = new Map();
// 可测性开关：LOC_LENS_TOKEN env 指定固定 token（仅测试/冒烟使用；生产不设置保持随机）
let token = process.env.LOC_LENS_TOKEN || crypto.randomBytes(32).toString('hex');
let degraded = false;

async function kvSafe(fn, what) {
  try { await fn(); if (degraded) { degraded = false; log('info', `宿主 kv 桥恢复（${what}）`); } }
  catch (e) {
    if (!degraded) { degraded = true; log('warn', `宿主 kv 桥不可达（${what}）：${e.message}，进入降级（服务照常，meta 不投影）`); }
  }
}

// ── 目录遍历与统计 ─────────────────────────────────────────────────────────

function shouldSkipDir(name) { return core.isSkipDirName(name); }

/** 校验扫描根：存在、是目录、解析真实路径（供符号链接逃逸校验） */
async function resolveRoot(rootInput) {
  const root = String(rootInput || '').trim();
  if (!root) throw Object.assign(new Error('缺少 root 参数'), { status: 400 });
  let st;
  try { st = await fsp.stat(root); } catch (_) {
    throw Object.assign(new Error(`目录不存在或不可访问：${root}`), { status: 400 });
  }
  if (!st.isDirectory()) throw Object.assign(new Error(`不是目录：${root}`), { status: 400 });
  let real;
  try { real = await fsp.realpath(root); } catch (_) { real = root; }
  return { root: root.replace(/[\\/]+$/, '') || root, real };
}

/** relPath 是否逃出扫描根（符号链接指向外部时拒绝） */
function escapesRoot(rootReal, absReal) {
  const rel = path.relative(rootReal, absReal);
  if (!rel) return false;
  return rel.startsWith('..') || path.isAbsolute(rel);
}

/**
 * 全量扫描一个根。返回 {stats, fileMap, fileMeta}。
 * fileMap: absPath → {mtimeMs, size}（增量脏检查基线）；
 * fileMeta: absPath → per-file 计数（增量扣除用）。
 */
async function scanRoot(rootInput) {
  const { root, real } = await resolveRoot(rootInput);
  const t0 = Date.now();
  const stats = core.newStats();
  stats.root = root;
  const fileMap = new Map();
  const fileMeta = new Map();
  const errors = [];
  let filesSeen = 0;
  let totalBytes = 0;
  let truncated = false;

  async function walk(dir, relDir) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (errors.length < MAX_ERRORS) errors.push(`${relDir || '.'}: ${e.message}`);
      return;
    }
    for (const ent of entries) {
      const name = ent.name;
      const abs = path.join(dir, name);
      const rel = relDir ? `${relDir}/${name}` : name;
      if (ent.isDirectory()) {
        if (shouldSkipDir(name)) continue;
        // 符号链接目录：解析后必须仍在根内
        if (ent.isSymbolicLink()) {
          try {
            const r = await fsp.realpath(abs);
            if (escapesRoot(real, r)) continue;
          } catch (_) { continue; }
        }
        await walk(abs, rel);
        continue;
      }
      if (!ent.isFile()) continue;
      filesSeen++;
      if (filesSeen > MAX_FILES) { truncated = true; continue; }
      const cls = core.classifyFile(rel, undefined);
      if (cls === 'skipName') { stats.skippedOther++; continue; }
      if (cls === 'binary') { stats.skippedBinary++; continue; }
      let st;
      try { st = await fsp.stat(abs); } catch (_) { continue; }
      if (!st.isFile()) continue;
      if (cls === 'large') { stats.skippedLarge++; fileMap.set(abs, { mtimeMs: st.mtimeMs, size: st.size }); continue; }
      if (totalBytes + st.size > MAX_TOTAL_BYTES) { truncated = true; continue; }
      let buf;
      try { buf = await fsp.readFile(abs); } catch (e) {
        if (errors.length < MAX_ERRORS) errors.push(`${rel}: ${e.message}`);
        continue;
      }
      if (core.looksBinary(buf)) { stats.skippedBinary++; continue; }
      totalBytes += buf.length;
      core.recordFile(stats, rel.split('\\').join('/'), buf);
      fileMap.set(abs, { mtimeMs: st.mtimeMs, size: st.size });
      fileMeta.set(abs, makeFileMeta(buf, rel));
    }
  }

  await walk(root, '');
  stats.scannedAt = Date.now();
  stats.durationMs = stats.scannedAt - t0;
  stats.truncated = truncated;
  stats.errors = errors;
  return { stats, fileMap, fileMeta };
}

// ── 根管理（扫描 + watch + 增量） ──────────────────────────────────────────

async function ensureScan(rootInput) {
  const { root, real } = await resolveRoot(rootInput);
  let entry = scans.get(root);
  if (!entry || entry.scanning) {
    const { stats, fileMap, fileMeta } = await scanRoot(root);
    entry = {
      root, real, stats, fileMap, fileMeta,
      watcher: null, dirty: new Set(), timer: null,
      lastAccess: Date.now(), scanning: false,
      lastError: null,
    };
    scans.set(root, entry);
    startWatch(entry);
  }
  entry.lastAccess = Date.now();
  return entry;
}

/** per-file 计数（增量扣除用） */
function makeFileMeta(buf, rel) {
  const lines = core.countLines(buf);
  let nonEmpty = 0;
  let start = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 0x0A) {
      if (i > start) nonEmpty++;
      start = i + 1;
    }
  }
  const relPosix = rel.split('\\').join('/');
  return {
    rel: relPosix,
    lines, nonEmpty, bytes: buf.length,
    lang: core.langOf(relPosix),
    bucket: core.bucketOf(relPosix, 1),
  };
}

/** 从 stats 中扣除一个文件的旧贡献 */
function subtractFile(stats, meta) {
  const m = stats.modules[meta.bucket];
  if (m) {
    m.files -= 1; m.lines -= meta.lines; m.nonEmptyLines -= meta.nonEmpty; m.bytes -= meta.bytes;
    if (m.files <= 0) delete stats.modules[meta.bucket];
  }
  const t = stats.totals;
  t.files -= 1; t.lines -= meta.lines; t.nonEmptyLines -= meta.nonEmpty; t.bytes -= meta.bytes;
  const lg = stats.languages[meta.lang];
  if (lg) {
    lg.files -= 1; lg.lines -= meta.lines;
    if (lg.files <= 0) delete stats.languages[meta.lang];
  }
}

/** fs.watch 递归监听（Windows 支持 recursive；失败则降级为仅手动刷新） */
function startWatch(entry) {
  try {
    entry.watcher = fs.watch(entry.root, { recursive: true, persistent: false }, (event, filename) => {
      if (!filename) return;
      const rel = String(filename).split('\\').join('/');
      const top = rel.split('/')[0];
      if (top && core.isSkipDirName(top)) return;
      if (core.isSkipFileName(rel)) return;
      entry.dirty.add(rel);
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => { entry.timer = null; void applyDirty(entry); }, WATCH_DEBOUNCE_MS);
    });
    entry.watcher.on('error', (e) => {
      log('warn', `watch 出错（${entry.root}）：${e.message}，停止监听（面板可手动刷新）`);
      try { entry.watcher.close(); } catch (_) { /* 忽略 */ }
      entry.watcher = null;
    });
  } catch (e) {
    log('warn', `无法监听 ${entry.root}：${e.message}（增量不可用，可手动刷新）`);
    entry.watcher = null;
  }
}

/** 处理脏文件：重读变更文件，扣除旧贡献、加新贡献（精确增量，不重扫整树） */
async function applyDirty(entry) {
  if (entry.scanning) return;
  const dirty = [...entry.dirty];
  entry.dirty.clear();
  if (!dirty.length) return;
  const t0 = Date.now();
  let changed = 0;
  for (const rel of dirty) {
    const abs = path.join(entry.root, rel);
    let st;
    try { st = await fsp.stat(abs); } catch (_) {
      // 文件被删除：扣除旧贡献
      const old = entry.fileMeta.get(abs);
      if (old) {
        subtractFile(entry.stats, old);
        entry.fileMeta.delete(abs);
        entry.fileMap.delete(abs);
        changed++;
      }
      continue;
    }
    if (!st.isFile()) continue;
    const cls = core.classifyFile(rel, st.size);
    const old = entry.fileMeta.get(abs);
    if (cls !== 'count') {
      // 变成二进制/跳过/超大：扣除旧文本贡献
      if (old) { subtractFile(entry.stats, old); entry.fileMeta.delete(abs); changed++; }
      entry.fileMap.set(abs, { mtimeMs: st.mtimeMs, size: st.size });
      continue;
    }
    const cached = entry.fileMap.get(abs);
    if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) continue; // 未真变
    let buf;
    try { buf = await fsp.readFile(abs); } catch (_) { continue; }
    if (core.looksBinary(buf)) {
      if (old) { subtractFile(entry.stats, old); entry.fileMeta.delete(abs); changed++; }
      entry.fileMap.set(abs, { mtimeMs: st.mtimeMs, size: st.size });
      continue;
    }
    const meta = makeFileMeta(buf, rel);
    if (old) subtractFile(entry.stats, old);
    core.addToBucket(entry.stats, meta.bucket, meta.lines, meta.nonEmpty, meta.bytes);
    core.addLanguage(entry.stats, meta.lang, meta.lines);
    entry.fileMeta.set(abs, meta);
    entry.fileMap.set(abs, { mtimeMs: st.mtimeMs, size: st.size });
    changed++;
  }
  if (changed > 0) {
    entry.stats.scannedAt = Date.now();
    log('info', `增量更新 ${entry.root}：${changed}/${dirty.length} 文件变更，耗时 ${Date.now() - t0}ms`);
  }
}

/** 手动强制重扫（面板「立即刷新」按钮） */
async function rescan(rootInput) {
  const { root } = await resolveRoot(rootInput);
  const old = scans.get(root);
  if (old) {
    try { if (old.watcher) old.watcher.close(); } catch (_) { /* 忽略 */ }
    if (old.timer) clearTimeout(old.timer);
    scans.delete(root);
  }
  const entry = await ensureScan(root);
  return entry.stats;
}

/** 周期清理：10 分钟无人问津的根停 watch 释放 IO（数据保留，再访问时重扫） */
setInterval(() => {
  const now = Date.now();
  for (const [root, entry] of scans) {
    if (now - entry.lastAccess > ROOT_TTL_MS && entry.watcher) {
      try { entry.watcher.close(); } catch (_) { /* 忽略 */ }
      entry.watcher = null;
      log('info', `闲置回收 watch：${root}`);
    }
  }
}, 60_000).unref();

// ── meta 心跳 ──────────────────────────────────────────────────────────────

async function beat() {
  await kvSafe(() => kv.kvSet('loclens.meta', {
    port: PORT, token, pid: process.pid, version: VERSION,
    startedAt: STARTED_AT, live: true, lastBeat: Date.now(),
  }), 'meta');
}

// ── HTTP 服务 ──────────────────────────────────────────────────────────────

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// CORS：面板运行在宿主页 origin（如 http://localhost:9827），跨源直连本服务
// 必须放行（repo-lens 同款 CORS 头）；仅 127.0.0.1 监听 + Bearer 鉴权兜底。
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...CORS_HEADERS,
  });
  res.end(body);
}

function statsPayload(entry) {
  return {
    ok: true,
    root: entry.root,
    stats: {
      scannedAt: entry.stats.scannedAt,
      durationMs: entry.stats.durationMs,
      totals: entry.stats.totals,
      modules: core.moduleRows(entry.stats),
      languages: core.languageRows(entry.stats, 12),
      skippedBinary: entry.stats.skippedBinary,
      skippedOther: entry.stats.skippedOther,
      skippedLarge: entry.stats.skippedLarge,
      truncated: entry.stats.truncated,
      errors: entry.stats.errors,
    },
    live: !!entry.watcher,
    pendingDirty: entry.dirty.size,
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS_HEADERS); res.end(); return; }

  if (p === '/__health') {
    return sendJson(res, 200, { ok: true, service: 'loc-lens', version: VERSION, uptime: Date.now() - STARTED_AT });
  }

  // 其余全部要 Bearer token
  const auth = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(auth);
  if (!m || !timingSafeEq(m[1], token)) {
    return sendJson(res, 401, { ok: false, error: '未授权' });
  }

  if (p === '/api/health') {
    return sendJson(res, 200, { ok: true, service: 'loc-lens', version: VERSION, degraded, roots: scans.size });
  }

  if (p === '/api/stats' && req.method === 'GET') {
    const root = url.searchParams.get('root') || '';
    resolveRoot(root).then(async ({ root: r }) => {
      const existing = scans.get(r);
      // 进行中的占位（scanning=true）与未缓存一样走全量扫描通道，避免 202 死锁
      if (existing && !existing.scanning) {
        existing.lastAccess = Date.now();
        return sendJson(res, 200, statsPayload(existing));
      }
      try {
        const full = await ensureScan(r);
        sendJson(res, 200, statsPayload(full));
      } catch (e) {
        scans.delete(r);
        sendJson(res, e.status || 500, { ok: false, error: e.message });
      }
    }).catch((e) => sendJson(res, e.status || 500, { ok: false, error: e.message }));
    return;
  }

  if (p === '/api/rescan' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 64 * 1024) req.destroy(); });
    req.on('end', () => {
      let root = '';
      try { root = (JSON.parse(body || '{}').root) || ''; } catch (_) { root = ''; }
      rescan(root).then(
        (stats) => {
          const entry = scans.get(stats.root);
          sendJson(res, 200, statsPayload(entry));
        },
        (e) => sendJson(res, e.status || 500, { ok: false, error: e.message }),
      );
    });
    return;
  }

  if (p === '/api/settings' && req.method === 'GET') {
    kv.kvGet('loclens.settings').then(
      (s) => sendJson(res, 200, { ok: true, settings: s || {} }),
      () => sendJson(res, 200, { ok: true, settings: {} }),
    );
    return;
  }

  sendJson(res, 404, { ok: false, error: `未知路径 ${p}` });
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = server.address();
  const boundPort = typeof addr === 'object' && addr ? addr.port : PORT;
  log('info', `loc-lens 服务已启动：127.0.0.1:${boundPort}（version ${VERSION}）`);
  void beat();
  setInterval(() => void beat(), META_BEAT_MS).unref();
});

server.on('error', (e) => {
  log('error', `服务监听失败：${e.message}`);
  process.exitCode = 1;
});

process.on('SIGINT', () => { try { server.close(); } catch (_) { /* 忽略 */ } process.exit(0); });
process.on('SIGTERM', () => { try { server.close(); } catch (_) { /* 忽略 */ } process.exit(0); });
