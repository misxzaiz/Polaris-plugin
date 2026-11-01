#!/usr/bin/env node
'use strict';
/**
 * main.js —— 日志透视台本地服务（type=http；仅绑 127.0.0.1；全程只读）
 *
 * 职责：唯一的日志读取/解析/统计权威。面板（经 cap.http 宿主通道）与 MCP
 * （本机直连）都是本服务的客户端。
 *
 * 安全边界：
 *   - 只绑 127.0.0.1，不带任何 CORS 头（浏览器直连一律拒；面板走宿主 cap.http）；
 *   - 全代码无写文件调用（test/run-tests.mjs 断言守护）；
 *   - 响应行数/字节双上限；单请求扫描字节上限；
 *   - 零外部网络请求（唯一出站是到宿主 cap.kv 的心跳/设置桥，同机回环）。
 *
 * 启动参数：node main.js <port> <appConfigDir>
 * 端口发现（MCP/面板用）：cap.kv `lls.meta` { port, dataRoot, version }，
 * 回退 manifest 端口 9870。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const core = require('../shared/core');
const reader = require('./reader');
const analyze = require('./analyze');
const { createKvClient } = require('./kvclient');

const PORT = parseInt(process.argv[2], 10) || core.MANIFEST_PORT;
const APP_CONFIG_DIR = process.argv[3] || '';

const slog = (msg) => { process.stderr.write(`[log-lens:service] ${msg}\n`); };
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });

// ── 数据根与默认源 ──────────────────────────────────────────────────────────
/** 解析 Polaris 数据根（anchor.json → dataRoot；与 kvclient 同候选链） */
function resolveDataRoot() {
  const candidates = [];
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'Polaris', 'anchor.json'));
  candidates.push(path.join(require('os').homedir(), '.config', 'Polaris', 'anchor.json'));
  candidates.push(path.join(require('os').homedir(), '.polaris', 'anchor.json'));
  for (const p of candidates) {
    try {
      const a = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) return a.dataRoot;
    } catch (_) { /* 跳过 */ }
  }
  return '';
}

/** 收集目录下的日志文件（顶层 + logs/ 子目录一层，上限 500） */
function collectLogFiles(dir) {
  const out = [];
  const scan = (d, depth) => {
    if (out.length >= 500) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const ent of entries) {
      if (out.length >= 500) return;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (depth < 1) scan(full, depth + 1);
      } else if (ent.isFile() && core.LOG_FILE_RE.test(ent.name)) {
        try {
          const st = fs.statSync(full);
          if (st.isFile() && st.size > 0) out.push({ path: full, size: st.size, mtimeMs: st.mtimeMs });
        } catch (_) { /* 跳过不可 stat 的 */ }
      }
    }
  };
  try {
    const st = fs.statSync(dir);
    if (st.isFile()) {
      return [{ path: dir, size: st.size, mtimeMs: st.mtimeMs }];
    }
    if (st.isDirectory()) scan(dir, 0);
  } catch (_) { /* 目录不存在 */ }
  return out;
}

// ── 设置（内存为权威，kv 为持久化镜像；bridge 降级时源管理仍可用，仅重启不保）──
let settingsMemory = null;
let settingsLoaded = false;

async function readSettings() {
  if (!settingsLoaded) {
    settingsLoaded = true;
    try {
      settingsMemory = core.normalizeSettings(await kv.kvGet('lls.settings'));
    } catch (_) {
      settingsMemory = core.normalizeSettings(null);
    }
  }
  return settingsMemory;
}

async function writeSettings(settings) {
  settingsMemory = settings; // 内存权威即时生效（响应不等 kv）
  try {
    await kv.kvSet('lls.settings', settings);
  } catch (e) {
    slog(`设置 kv 持久化失败（降级为进程内存，重启后丢失自加源）: ${e.message}`);
  }
}

/** 汇总文件清单：默认源（数据根 logs/ + 数据根散落 *.log）+ 用户添加源 */
async function listSources() {
  const settings = await readSettings();
  const dataRoot = resolveDataRoot();
  const files = new Map(); // path → {path,size,mtimeMs,source}
  if (dataRoot) {
    for (const dir of [path.join(dataRoot, 'logs'), dataRoot]) {
      for (const f of collectLogFiles(dir)) {
        if (!files.has(f.path)) files.set(f.path, { ...f, source: 'dataRoot' });
      }
    }
  }
  for (const src of settings.sources) {
    for (const f of collectLogFiles(src.path)) {
      if (!files.has(f.path)) files.set(f.path, { ...f, source: 'user' });
      else files.get(f.path).source = 'user';
    }
  }
  const list = [...files.values()].sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { ok: true, dataRoot, files: list, settings };
}

// ── 参数解析 ────────────────────────────────────────────────────────────────
function parseFilters(query) {
  const filters = {};
  // URLSearchParams 无直接属性访问，必须用 .get()（此前 .levels 直读恒 undefined，
  // 过滤静默失效——search 假阳性通过的教训）
  const q = query.get('q');
  const regex = query.get('regex');
  const levelsRaw = query.get('levels');
  if (q) filters.q = q;
  if (regex) filters.regex = regex; // makeFilter 内编译校验
  if (levelsRaw) {
    const arr = levelsRaw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const valid = arr.filter((l) => core.LEVELS.includes(l));
    if (valid.length) filters.levels = valid;
  }
  return filters;
}

function capEntries(entries, startBytes) {
  // 响应字节封顶：从头部累计，超限截断（保留可用前缀并标注）
  let bytes = startBytes || 0;
  const out = [];
  for (const e of entries) {
    const size = Buffer.byteLength(JSON.stringify(e), 'utf8');
    if (out.length && bytes + size > core.MAX_BYTES_PER_RESPONSE) break;
    out.push(e);
    bytes += size;
  }
  return { entries: out, truncatedByBytes: out.length < entries.length };
}

// ── HTTP 服务 ───────────────────────────────────────────────────────────────
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    // 安全边界：刻意不带任何 Access-Control-Allow-Origin —— 本服务只服务本机
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function handle(req, res, url) {
  const p = url.pathname;
  const q = url.searchParams;

  if (p === '/__health') {
    sendJson(res, 200, { ok: true, version: core.VERSION, ts: Date.now() });
    return;
  }

  try {
    if (p === '/api/sources' && req.method === 'GET') {
      sendJson(res, 200, await listSources());
      return;
    }
    if (p === '/api/sources/add' && req.method === 'POST') {
      const body = await readBody(req);
      const target = core.sanitizePath(body.path);
      const st = fs.statSync(target);
      const kind = st.isFile() ? 'file' : st.isDirectory() ? 'dir' : null;
      if (!kind) throw new Error('不是文件也不是目录');
      const settings = await readSettings();
      if (!settings.sources.some((s) => s.path === target)) {
        settings.sources.push({ path: target, kind, addedAt: Date.now() });
        if (settings.sources.length > 50) throw new Error('源数量已达上限 50');
        await writeSettings(settings);
      }
      sendJson(res, 200, { ...(await listSources()), added: target });
      return;
    }
    if (p === '/api/sources/remove' && req.method === 'POST') {
      const body = await readBody(req);
      const target = core.sanitizePath(body.path);
      const settings = await readSettings();
      settings.sources = settings.sources.filter((s) => s.path !== target);
      await writeSettings(settings);
      sendJson(res, 200, { ...(await listSources()), removed: target });
      return;
    }
    if (p === '/api/read' && req.method === 'GET') {
      const file = core.sanitizePath(q.get('file'));
      const r = reader.forwardRead(file, {
        offset: q.get('offset'), limit: q.get('limit'),
        scanCap: q.get('scanCap') ? parseInt(q.get('scanCap'), 10) : core.SCAN_CAP_DEFAULT,
        ...parseFilters(q),
      });
      const capped = capEntries(r.entries);
      sendJson(res, 200, { ok: true, ...r, entries: capped.entries, truncatedByBytes: capped.truncatedByBytes });
      return;
    }
    if (p === '/api/tail' && req.method === 'GET') {
      const file = core.sanitizePath(q.get('file'));
      const r = reader.tailRead(file, { maxLines: q.get('maxLines'), ...parseFilters(q) });
      const capped = capEntries(r.entries);
      sendJson(res, 200, { ok: true, ...r, entries: capped.entries, truncatedByBytes: capped.truncatedByBytes });
      return;
    }
    if (p === '/api/watch' && req.method === 'GET') {
      const file = core.sanitizePath(q.get('file'));
      const r = reader.watchIncrement(file, parseInt(q.get('offset'), 10) || 0);
      const capped = capEntries(r.entries);
      sendJson(res, 200, { ok: true, ...r, entries: capped.entries });
      return;
    }
    if (p === '/api/search' && req.method === 'GET') {
      const files = (q.get('files') || '').split('|').map((s) => core.sanitizePath(s)).filter(Boolean).slice(0, 50);
      if (!files.length) throw new Error('缺少 files 参数（| 分隔，最多 50 个）');
      const results = reader.searchFiles(files, {
        ...parseFilters(q),
        limitPerFile: q.get('limitPerFile') ? parseInt(q.get('limitPerFile'), 10) : 30,
      });
      let totalMatches = 0;
      for (const r of results) {
        const capped = capEntries(r.matches);
        r.matches = capped.entries;
        totalMatches += capped.entries.length;
      }
      sendJson(res, 200, { ok: true, totalMatches, results });
      return;
    }
    if (p === '/api/stats' && req.method === 'GET') {
      const file = core.sanitizePath(q.get('file'));
      const r = analyze.statsForFile(file, {});
      // 聚类样本也过响应字节闸
      const capped = capEntries(r.clusters);
      sendJson(res, 200, { ok: true, ...r, clusters: capped.entries });
      return;
    }
    if (p === '/api/context' && req.method === 'GET') {
      const file = core.sanitizePath(q.get('file'));
      const anchor = parseInt(q.get('offset'), 10);
      if (!Number.isFinite(anchor)) throw new Error('缺少 offset 参数（目标行字节偏移）');
      const before = Math.min(Math.max(parseInt(q.get('before'), 10) || 10, 0), 50);
      const after = Math.min(Math.max(parseInt(q.get('after'), 10) || 10, 0), 50);
      // anchor 是目标 entry 的行首字节偏移：正向读目标行本身 + after 条；
      // 反读 before 条（不含边界行）。before=0 时跳过反读（tailRead 行数下限为 1）
      const fwd = reader.forwardRead(file, { offset: anchor, limit: after + 1 });
      const back = before > 0
        ? reader.tailRead(file, { beforeOffset: anchor, maxLines: before })
        : { entries: [] };
      const entries = [...back.entries, ...fwd.entries];
      const capped = capEntries(entries);
      sendJson(res, 200, {
        ok: true, file, anchor, entries: capped.entries,
        encoding: fwd.encoding, format: fwd.format,
      });
      return;
    }
    sendJson(res, 404, { ok: false, error: `未知路径: ${p}` });
  } catch (e) {
    slog(`${req.method} ${p} 失败: ${e.message}`);
    sendJson(res, 200, { ok: false, error: e.message }); // 业务错误统一 200+ok:false（调用方按 ok 分支）
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 64 * 1024) { reject(new Error('请求体过大')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (_) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  // 仅本机回环访问（双保险：绑定已限定 127.0.0.1）
  const remote = req.socket.remoteAddress || '';
  if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote)) {
    sendJson(res, 403, { ok: false, error: '仅允许本机访问' });
    return;
  }
  handle(req, res, url).catch((e) => {
    slog(`handle 异常: ${e.stack || e.message}`);
    try { sendJson(res, 500, { ok: false, error: '内部错误' }); } catch (_) { /* 已发送 */ }
  });
});

// IP_STACK：显式 IPv4 回环，避免 IPv6/IPv4 双栈绑定面
server.listen(PORT, '127.0.0.1', () => {
  slog(`listening on 127.0.0.1:${PORT} (v${core.VERSION}, appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
});

// ── 心跳（cap.kv lls.meta）：面板/MCP 端口发现与在线状态 ────────────────────
let dataRootCache = '';
async function heartbeat() {
  try {
    if (!dataRootCache) dataRootCache = resolveDataRoot();
    await kv.kvSet('lls.meta', {
      version: core.VERSION, port: PORT, pid: process.pid,
      startedAt: Date.now(), lastTickAt: Date.now(), dataRoot: dataRootCache,
    });
  } catch (e) {
    slog(`心跳写入失败（bridge 降级，读取不受影响）: ${e.message}`);
  }
}
heartbeat();
const hbTimer = setInterval(() => { void heartbeat(); }, 20000);

function shutdown() {
  clearInterval(hbTimer);
  kv.kvDel('lls.meta').catch(() => {}).finally(() => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
