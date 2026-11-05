#!/usr/bin/env node
'use strict';
/**
 * main-src.js —— 多语言键同步台后台服务（源码；经 esbuild 打成 service/main.js，
 * js-yaml 与 kvclient 一并 bundle 进去，zip 内零 node_modules 依赖）。
 *
 * 职责：
 *   - 面板的扫描/应用引擎入口：面板 POST http://127.0.0.1:<port>/api/*。
 *   - 业务逻辑全部在 shared/（core/scan-engine/apply-engine），MCP 同源同结论。
 *   - undo 快照写 <appConfigDir>/i18n-sync-undo/，索引写 cap.kv i18n.undo.index。
 *   - 安全底线：只绑 127.0.0.1 + token 鉴权（token 持久化于 cap.kv i18n.meta，
 *     与面板共享）；应用只写「扫描发现的 locale 文件」；写前快照可撤销。
 *
 * 启动参数：node main.js {{port}} {{appConfigDir}}（宿主注入占位符）
 * 健康检查：GET /__health 恒 200（宿主 30s 周期，连续 3 次失败判死）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');
const core = require('../shared/i18n-core');
const engine = require('../shared/scan-engine');
const { applyTranslations, KEY_UNDO_INDEX } = require('../shared/apply-engine');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const PREFIX = 'i18n.';
const KEY_META = PREFIX + 'meta';
const KEY_SETTINGS = PREFIX + 'settings';

const PORT = parseInt(process.argv[2] || '', 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

// ── 日志：宿主不收集 stdout/stderr，自落盘 + 512KB 轮转 ──
const LOG_FILE = APP_CONFIG_DIR ? path.join(APP_CONFIG_DIR, 'i18n-sync.log') : '';
function log(level, msg) {
  if (level === 'debug' || !LOG_FILE) return;
  try {
    try {
      const st = fs.statSync(LOG_FILE);
      if (st.size > 512 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    } catch (_) { /* 首次无文件 */ }
    fs.appendFileSync(LOG_FILE, `[i18n-sync:${level}] ${new Date().toISOString()} ${msg}\n`, 'utf8');
  } catch (_) { /* 日志失败不影响业务 */ }
}

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR });

// ── token：重启不换（面板从 cap.kv i18n.meta 读取） ──
let tokenCache = '';
async function ensureToken() {
  if (tokenCache) return tokenCache;
  try {
    const meta = await kv.kvGet(KEY_META);
    if (meta && typeof meta.token === 'string' && meta.token) { tokenCache = meta.token; return tokenCache; }
  } catch (_) { /* 桥不可达走降级 */ }
  tokenCache = crypto.randomBytes(16).toString('hex');
  return tokenCache;
}

async function writeMeta() {
  try {
    const prev = await kv.kvGet(KEY_META);
    await kv.kvSet(KEY_META, {
      token: await ensureToken(),
      port: PORT,
      version: VERSION,
      pid: process.pid,
      startedAt: prev && prev.startedAt ? prev.startedAt : new Date().toISOString(),
      lastTickAt: new Date().toISOString(),
      appConfigDir: APP_CONFIG_DIR,
    });
  } catch (e) { log('warn', 'meta 心跳写失败（桥降级）: ' + e.message); }
}

async function loadSettings() {
  try {
    const s = await kv.kvGet(KEY_SETTINGS);
    return s && typeof s === 'object' ? s : {};
  } catch (_) { return {}; }
}

// ── HTTP 基建 ──
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

function checkAuth(req) {
  if (!tokenCache) return false;
  return String(req.headers['x-i18n-sync-token'] || '') === tokenCache;
}

function readBody(req, maxBytes = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error(`请求体超限（>${maxBytes} 字节）`)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('请求体不是合法 JSON：' + e.message)); }
    });
    req.on('error', reject);
  });
}

// ── 业务 ──
async function doScan(args) {
  const p = String(args.dir || '').trim();
  if (!p) throw new Error('缺少 dir（locale 根目录绝对路径）');
  const dir = path.resolve(p);
  if (!fs.existsSync(dir)) throw new Error(`目录不存在：${dir}`);
  const settings = await loadSettings();
  const baseLocale = args.baseLocale || settings.baseLocale || undefined;
  const t0 = Date.now();
  const scan = engine.scanDir(dir, { baseLocale, yaml });
  log('info', `scan ${dir} → ${scan.totals.files} 文件 布局=${scan.layout} 基准=${scan.baseLocale} 缺失=${scan.totals.missing} (${Date.now() - t0}ms)`);
  // 面板只需要摘要矩阵；entries（含完整 parse 数据）留在服务端
  delete scan.entries;
  return scan;
}

const doApply = (args) => applyTranslations({
  dir: args.dir,
  locale: args.locale,
  translations: args.translations,
  ns: args.ns,
  mode: args.mode,
  stripComments: args.stripComments,
  force: args.force,
  baseLocale: args.baseLocale,
  yaml,
  appConfigDir: APP_CONFIG_DIR,
  kv,
  log,
});

// ── HTTP 路由 ──
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/__health') {
    return sendJson(res, 200, { ok: true, version: VERSION });
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-i18n-sync-token',
    });
    return res.end();
  }
  if (!checkAuth(req)) {
    return sendJson(res, 401, { ok: false, error: '缺少或错误的 token（面板应从 cap.kv i18n.meta 读取）' });
  }
  try {
    if (req.method === 'POST' && url.pathname === '/api/scan') {
      const body = await readBody(req);
      return sendJson(res, 200, { ok: true, scan: await doScan(body) });
    }
    if (req.method === 'POST' && url.pathname === '/api/apply') {
      const body = await readBody(req);
      const r = await doApply(body);
      return sendJson(res, 200, r);
    }
    if (req.method === 'POST' && url.pathname === '/api/undo') {
      const body = await readBody(req);
      if (!body.batchId) return sendJson(res, 400, { ok: false, error: '缺少 batchId（从 /api/undo-list 或应用结果取）' });
      const r = engine.restoreSnapshot(APP_CONFIG_DIR, body.batchId);
      log('info', `undo batch=${body.batchId} 成功=${r.results.filter((x) => x.ok).length}/${r.results.length}`);
      return sendJson(res, 200, { ok: true, ...r });
    }
    if (req.method === 'POST' && url.pathname === '/api/undo-list') {
      const idx = await kv.kvGet(KEY_UNDO_INDEX);
      return sendJson(res, 200, { ok: true, index: Array.isArray(idx) ? idx : [] });
    }
    return sendJson(res, 404, { ok: false, error: `未知路由 ${req.method} ${url.pathname}` });
  } catch (e) {
    log('error', `${req.method} ${url.pathname} 失败: ${e.message}`);
    return sendJson(res, 400, { ok: false, error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  log('info', `i18n-sync service listening on 127.0.0.1:${PORT} (v${VERSION})`);
  writeMeta();
  setInterval(writeMeta, 30 * 1000).unref?.();
});
process.on('uncaughtException', (e) => log('error', 'uncaughtException: ' + (e && e.stack || e)));
process.on('unhandledRejection', (e) => log('error', 'unhandledRejection: ' + (e && e.stack || e)));
