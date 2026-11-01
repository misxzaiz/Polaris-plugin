#!/usr/bin/env node
'use strict';
/**
 * main.js —— 表格提取台（pdf-tables）后台服务（node >= 18）
 *
 * 职责：
 *   - 面板的表格提取引擎入口：面板把用户拖入的 PDF 字节（base64）POST 到
 *     http://127.0.0.1:<port>/api/op，本服务经 table-engine 检测/提取后把
 *     输出落盘（输出目录=设置 outDir，缺省探测桌面），全程只绑回环 + token 鉴权。
 *   - MCP/面板共用的任务历史（cap.kv pdf-tables.history.*）与设置热读
 *     （pdf-tables.settings 仅面板写）、命令键消费（pdf-tables.cmd 先删后做）。
 *   - 安全底线：零外网请求；输入永不修改/删除；输出永不覆盖（-2/-3 递增）。
 *
 * 启动参数：node main.js {{port}} {{appConfigDir}}（宿主注入占位符）
 * 健康检查：GET /__health 恒 200（宿主 30s 周期，连续 3 次失败判死）。
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const core = require('../shared/core.js');
const engine = require('./table-engine.js');
const { createKvClient } = require('./kvclient.js');

const PLUGIN_ID = 'pdf-tables';
const VERSION = '0.1.0';
const LOG_MAX = 512 * 1024;

const PORT = parseInt(process.argv[2] || '', 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

// ── 日志（宿主不收集 stdout/stderr，自落盘 + 512KB 轮转）───────────────────
const logFile = APP_CONFIG_DIR ? path.join(APP_CONFIG_DIR, PLUGIN_ID + '.log') : '';
function log(level, msg) {
  const line = `[${PLUGIN_ID}:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug') return; // debug 不落盘
  process.stderr.write(line + '\n');
  if (!logFile) return;
  try {
    try {
      const st = fs.statSync(logFile);
      if (st.size > LOG_MAX) fs.renameSync(logFile, logFile + '.old');
    } catch (_) { /* 首次无文件 */ }
    fs.appendFileSync(logFile, line + '\n');
  } catch (_) { /* 日志失败不影响业务 */ }
}

// ── 自发现桥（降级不致命：核心表格操作不依赖 kv）──────────────────────────
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
let bridgeDegraded = true;

const PREFIX = PLUGIN_ID + '.';
const KEY_SETTINGS = PREFIX + 'settings';
const KEY_META = PREFIX + 'meta';
const KEY_CMD = PREFIX + 'cmd';
const KEY_HISTORY = PREFIX + 'history.';

let settingsCache = core.normalizeSettings(null);
let settingsReadAt = 0;

async function readSettings(force) {
  if (!force && Date.now() - settingsReadAt < 5000) return settingsCache;
  try {
    const raw = await kv.kvGet(KEY_SETTINGS);
    settingsCache = core.normalizeSettings(raw);
    settingsReadAt = Date.now();
  } catch (e) {
    if (!bridgeDegraded) log('warn', 'settings 读取失败（用默认值/缓存）: ' + e.message);
  }
  return settingsCache;
}

/** 桌面目录候选链（OneDrive 重定向兼容），返回存在的第一个，否则 home */
function desktopCandidates() {
  const home = os.homedir();
  return [
    path.join(home, 'Desktop'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, 'OneDrive', '桌面'),
    path.join(home, '桌面'),
    home,
  ];
}

function resolveOutputDir(inputDir) {
  const st = settingsCache;
  const candidates = [];
  if (st.outDir) candidates.push(st.outDir);
  if (inputDir) candidates.push(inputDir);
  for (const c of desktopCandidates()) candidates.push(c);
  for (const c of candidates) {
    try {
      if (c && path.isAbsolute(c) && fs.statSync(c).isDirectory()) return c;
    } catch (_) { /* 候选不可用，下一个 */ }
  }
  return null;
}

// ── 历史（环形 cap）与命令键 ────────────────────────────────────────────────

async function appendHistory(entry) {
  try {
    const id = KEY_HISTORY + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
    await kv.kvSet(id, entry);
    const settings = await readSettings();
    const keys = (await kv.kvKeys()).filter((k) => k.startsWith(KEY_HISTORY)).sort();
    const over = keys.length - settings.historyCap;
    for (let i = 0; i < over; i++) await kv.kvDel(keys[i]).catch(() => { });
  } catch (e) {
    log('warn', '历史登记失败（不影响输出）: ' + e.message);
  }
}

async function consumeCmd() {
  try {
    const cmd = await kv.kvGet(KEY_CMD);
    if (!cmd || typeof cmd !== 'object') return;
    await kv.kvDel(KEY_CMD); // 先删后做（单写者纪律）
    if (cmd.action === 'clearHistory') {
      const keys = (await kv.kvKeys()).filter((k) => k.startsWith(KEY_HISTORY));
      for (const k of keys) await kv.kvDel(k).catch(() => { });
      log('info', '已清空任务历史 ' + keys.length + ' 条');
    }
  } catch (_) { /* 降级容忍 */ }
}

async function heartbeat() {
  try {
    const meta = await kv.kvGet(KEY_META);
    const token = (meta && typeof meta.token === 'string' && meta.token) || crypto.randomBytes(16).toString('hex');
    tokenCache = token; // 首次启动时即时生效，无需等待重启
    await kv.kvSet(KEY_META, {
      token,
      port: PORT,
      version: VERSION,
      pid: process.pid,
      startedAt: meta && meta.startedAt ? meta.startedAt : new Date().toISOString(),
      lastTickAt: new Date().toISOString(),
      bridge: bridgeDegraded ? 'degraded' : 'ok',
    });
    bridgeDegraded = false;
  } catch (e) {
    bridgeDegraded = true;
    log('warn', 'bridge 心跳失败（健康端点仍 200）: ' + e.message);
  }
}

// ── HTTP 层 ─────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-PdfTables-Token',
  'Access-Control-Max-Age': '86400',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS_HEADERS));
  res.end(body);
}

let tokenCache = '';

function authed(req) {
  if (!tokenCache) return false;
  return String(req.headers['x-pdftables-token'] || '') === tokenCache;
}

async function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const len = Number(req.headers['content-length'] || 0);
    if (len > maxBytes) {
      reject(new Error('请求体 ' + core.formatBytes(len) + ' 超过上限 ' + core.formatBytes(maxBytes) + '（可在面板设置调大）'));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('请求体超过上限 ' + core.formatBytes(maxBytes)));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleOp(body) {
  const started = Date.now();
  const op = body && body.op;
  const source = body && body.source === 'mcp' ? 'mcp' : 'panel';
  // 每个 op 强制热读：面板改完设置立即生效，不背缓存窗口
  const settings = await readSettings(true);
  const maxBytes = settings.maxUploadMB * 1024 * 1024;
  const files = Array.isArray(body && body.files) ? body.files : [];
  const checked = core.validateInputs(files.map((f) => ({ name: f.name, size: Math.ceil((String(f.b64 || '').length * 3) / 4) })), { maxBytes });
  const inputs = files.map((f) => ({ name: f.name, bytes: Buffer.from(String(f.b64 || ''), 'base64') }));
  for (const input of inputs) {
    if (!input.bytes.length) throw new Error('文件 ' + input.name + ' 内容为空');
    if (!core.isPdfBytes(input.bytes)) {
      throw new Error('文件 ' + input.name + ' 不是 PDF（文件头缺少 %PDF- 标识）');
    }
  }

  const result = await engine.runOp(op, inputs, body.params || {});

  // detect/read 只读不落盘；extract 落盘（永不覆盖）
  const outDir = resolveOutputDir(null);
  const outputs = [];
  if (op === 'extract') {
    if (!outDir) throw new Error('找不到可用的输出目录：请在面板设置里填写输出目录');
    const exists = (p) => { try { fs.statSync(p); return true; } catch (_) { return false; } };
    for (const o of result.outputs) {
      const ext = path.extname(o.name) || '.bin';
      const target = core.pickOutputName(outDir, core.sanitizeStem(o.name.replace(ext, '')), ext, exists);
      fs.writeFileSync(target, o.bytes);
      outputs.push({ name: path.basename(target), path: target, size: o.bytes.length });
    }
  }

  const record = {
    id: Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
    at: new Date().toISOString(),
    op,
    source,
    inputs: checked.map((c) => c.name),
    outputs,
    tables: result.totalTables !== undefined ? result.totalTables : (result.tablesExtracted || 0),
    rows: result.rowsTotal || 0,
    ms: Date.now() - started,
    ok: true,
  };
  await appendHistory(record);
  const payload = Object.assign({}, result);
  delete payload.outputs; // 字节不过桥；只回元数据
  return Object.assign(payload, {
    ok: true,
    outputs: op === 'extract' ? outputs : [],
    outDir: op === 'extract' ? outDir : undefined,
    ms: record.ms,
  });
}

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  if (req.method === 'GET' && url === '/__health') {
    sendJson(res, 200, { ok: true, plugin: PLUGIN_ID, version: VERSION, degraded: bridgeDegraded });
    return;
  }
  if (req.method === 'POST' && (url === '/api/op' || url === '/api/probe' || url === '/api/ping')) {
    if (!authed(req)) {
      sendJson(res, 401, { ok: false, error: '缺少或错误的 token（面板应从 cap.kv pdf-tables.meta 读取）' });
      return;
    }
    readBody(req, (settingsCache.maxUploadMB + 8) * 1024 * 1024).then((raw) => {
      let body = {};
      try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch (_) {
        sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' });
        return;
      }
      if (url === '/api/ping') {
        sendJson(res, 200, { ok: true, version: VERSION, outDir: settingsCache.outDir || desktopCandidates().find((c) => { try { fs.statSync(c); return true; } catch (_) { return false; } }) || '', degraded: bridgeDegraded });
        return;
      }
      if (url === '/api/probe') {
        const p = typeof body.path === 'string' ? body.path.trim() : '';
        const result = { desktop: desktopCandidates().filter((c) => { try { fs.statSync(c).isDirectory(); return true; } catch (_) { return false; } }), home: os.homedir() };
        if (p) {
          try {
            const st = fs.statSync(p);
            result.checked = { path: p, exists: true, isDir: st.isDirectory() };
          } catch (_) {
            result.checked = { path: p, exists: false, isDir: false };
          }
        }
        sendJson(res, 200, Object.assign({ ok: true }, result));
        return;
      }
      handleOp(body).then((r) => sendJson(res, 200, r)).catch((e) => {
        log('warn', 'op 失败: ' + (e && e.message));
        appendHistory({
          id: Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
          at: new Date().toISOString(),
          op: body.op || '?',
          source: 'panel',
          inputs: Array.isArray(body.files) ? body.files.map((f) => f && f.name) : [],
          outputs: [],
          tables: 0,
          rows: 0,
          ms: 0,
          ok: false,
          error: String((e && e.message) || e),
        }).catch(() => { });
        sendJson(res, 200, { ok: false, error: String((e && e.message) || e) });
      });
    }).catch((e) => sendJson(res, 413, { ok: false, error: String((e && e.message) || e) }));
    return;
  }
  sendJson(res, 404, { ok: false, error: 'not found' });
});

// token 需要先从桥读一次（服务重启不换 token；首次生成）
(async () => {
  try {
    const meta = await kv.kvGet(KEY_META);
    tokenCache = (meta && typeof meta.token === 'string' && meta.token) || '';
  } catch (_) { tokenCache = ''; }
  await readSettings(true);
  await heartbeat();
  server.listen(PORT, '127.0.0.1', () => {
    log('info', `pdf-tables service listening on 127.0.0.1:${PORT} (v${VERSION})`);
  });
})();

const TICK_MS = 30000;
setInterval(() => {
  consumeCmd();
  heartbeat();
  readSettings(true);
}, TICK_MS).unref();

process.on('uncaughtException', (e) => log('error', 'uncaughtException: ' + (e && e.stack || e)));
process.on('unhandledRejection', (e) => log('error', 'unhandledRejection: ' + (e && e.stack || e)));
