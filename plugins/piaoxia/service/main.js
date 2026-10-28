#!/usr/bin/env node
'use strict';
/**
 * main.js —— 票匣（piaoxia）后台服务（node >= 18）
 *
 * 职责：
 *   - 面板的收票引擎入口：面板把拖入的文件字节（base64）POST 到
 *     http://127.0.0.1:<port>/api/collect，或给目录路径由本服务扫描，
 *     经 engine 解析 + vault 归档原件后返回结构化结果（面板统一写 cap.kv）。
 *   - 心跳 piaoxia.meta（port/token/version/lastTickAt）发布到 cap.kv，
 *     面板据此直连本服务（zhifang 同款通道）。
 *   - 安全底线：只绑 127.0.0.1 + token；零外网请求；输入文件只读不改；
 *     归档为复制非移动、永不覆盖。
 *
 * 启动参数：node main.js {{port}} {{appConfigDir}}（宿主注入占位符）
 * 健康检查：GET /__health 恒 200（宿主周期检查）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const core = require('../shared/core.js');
const engine = require('./engine.js');
const vault = require('./vault.js');
const { createKvClient } = require('./kvclient.js');

const PLUGIN_ID = 'piaoxia';
const VERSION = '0.1.0';
const LOG_MAX = 512 * 1024;
const MAX_BODY = 96 * 1024 * 1024; // 批量 base64 上传上限（含 20MB/文件 × 若干）
const META_INTERVAL_MS = 30 * 1000;

const PORT = parseInt(process.argv[2] || '', 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';
const TOKEN = crypto.randomBytes(16).toString('hex');

// ── 日志（自落盘 + 512KB 轮转；不含票据明细）────────────────────────────────
const logFile = APP_CONFIG_DIR ? path.join(APP_CONFIG_DIR, PLUGIN_ID + '.log') : '';
function log(level, msg) {
  const line = `[${PLUGIN_ID}:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug') return;
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

// ── 桥（meta 心跳用；降级不致命：解析与归档不依赖 kv）──────────────────────
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

const DATA_ROOT = vault.resolveDataRoot(APP_CONFIG_DIR);
if (!DATA_ROOT) log('warn', '未定位到 dataRoot：原件归档降级为不可用（解析与台账不受影响）');
else log('info', 'dataRoot: ' + DATA_ROOT);

// ── 单文件收票流程（解析 → 归一化 → 归档），面板与批量扫描共用 ──────────────

async function collectOne(item) {
  const name = String(item.name || path.basename(item.path || 'invoice.pdf'));
  const out = { name, ok: false, invoice: null, warnings: [], error: '', sha256: '', archivedPath: '' };
  try {
    const bytes = item.bytes ? item.bytes : vault.readInvoiceFile(item.path);
    if (!bytes) {
      out.error = item.path ? '文件不可读（不存在/空/超 20MB）：' + item.path : '空文件';
      return out;
    }
    out.sha256 = vault.sha256FileBytes(bytes);
    const r = await engine.parseAuto({ name, bytes });
    out.warnings = r.warnings || [];
    if (!r.ok) {
      out.error = r.error || '解析失败';
      return out;
    }
    const inv = core.normalizeInvoice(Object.assign({}, r.draft, {
      source: 'collect',
      fileName: name,
      srcPath: item.path ? String(item.path) : '',
      fileSha256: out.sha256,
    }), null);
    if (DATA_ROOT) {
      out.archivedPath = vault.archiveOriginal(DATA_ROOT, inv, bytes, name);
      if (out.archivedPath) inv.archivedPath = out.archivedPath;
      else out.warnings.push('原件归档失败（数据根不可写），仅记录来源路径');
    } else {
      out.warnings.push('未找到数据根，原件未归档，仅记录来源路径');
    }
    out.invoice = inv;
    out.ok = true;
    return out;
  } catch (e) {
    out.error = String((e && e.message) || e);
    return out;
  }
}

// ── HTTP 服务 ───────────────────────────────────────────────────────────────

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体超限'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0];
  try {
    if (req.method === 'GET' && url === '/__health') {
      sendJson(res, 200, { status: 'ok', plugin: PLUGIN_ID, version: VERSION });
      return;
    }

    // token 鉴权（meta 经 cap.kv 分发，面板持有同一 token）
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ') || !timingSafeEq(auth.slice(7), TOKEN)) {
      sendJson(res, 401, { ok: false, error: '未授权' });
      return;
    }

    if (req.method === 'GET' && url === '/api/probe') {
      sendJson(res, 200, { ok: true, version: VERSION, dataRoot: DATA_ROOT || '', archiveDir: DATA_ROOT ? path.join(DATA_ROOT, 'piaoxia') : '' });
      return;
    }

    if (req.method === 'POST' && url === '/api/collect') {
      const raw = await readBody(req, MAX_BODY);
      let body;
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch (_) {
        sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' });
        return;
      }
      const results = [];
      // 模式一：面板拖拽上传的文件字节
      const files = Array.isArray(body.files) ? body.files.slice(0, vault.MAX_SCAN_FILES) : [];
      for (const f of files) {
        const bytes = typeof f.b64 === 'string' ? Buffer.from(f.b64, 'base64') : null;
        // eslint-disable-next-line no-await-in-loop
        results.push(await collectOne({ name: f.name, bytes }));
      }
      // 模式二：目录扫描（AI/MCP 之外的桌面路径入口）
      if (body.dir) {
        const scan = vault.scanInvoices(String(body.dir), { recursive: body.recursive !== false });
        if (scan.error) {
          results.push({ name: String(body.dir), ok: false, error: scan.error, warnings: [], sha256: '', archivedPath: '', invoice: null });
        } else {
          for (const f of scan.files) {
            // eslint-disable-next-line no-await-in-loop
            results.push(await collectOne({ name: f.name, path: f.path }));
          }
        }
      }
      if (!files.length && !body.dir) {
        sendJson(res, 400, { ok: false, error: '没有可收的内容（需要 files 或 dir）' });
        return;
      }
      const added = results.filter((r) => r.ok).length;
      log('info', `collect: ${added}/${results.length} parsed`);
      sendJson(res, 200, { ok: true, results });
      return;
    }

    sendJson(res, 404, { ok: false, error: '未知端点' });
  } catch (e) {
    log('error', 'request failed: ' + e.message);
    sendJson(res, 500, { ok: false, error: String((e && e.message) || e) });
  }
});

server.on('error', (e) => {
  log('error', 'server error: ' + e.message);
  process.exitCode = 1;
});

// ── meta 心跳（面板读它拿 port/token；桥不通时面板只显示服务离线）──────────

async function publishMeta() {
  try {
    await kv.kvSet(core.K.META, {
      port: PORT,
      token: TOKEN,
      version: VERSION,
      archiveDir: DATA_ROOT ? path.join(DATA_ROOT, 'piaoxia') : '',
      lastTickAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    });
    return true;
  } catch (e) {
    log('warn', 'meta 发布失败: ' + e.message);
    return false;
  }
}

server.listen(PORT, '127.0.0.1', () => {
  log('info', `piaoxia service listening on 127.0.0.1:${PORT} (token auth, zero external requests)`);
  publishMeta();
  setInterval(publishMeta, META_INTERVAL_MS).unref();
});
