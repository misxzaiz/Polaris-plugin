#!/usr/bin/env node
'use strict';
/**
 * server.js —— 数据查询台本地服务（type=http；仅绑 127.0.0.1；零 npm 依赖）
 *
 * 职责：查询/导入/导出的**单一路径权威**。面板（经宿主 cap.http）与 MCP（本机直连）
 * 都是本服务的客户端。引擎装配/工作区在 engine.js，纯规则在 core.js。
 *
 * 安全边界（docs/data-query-plan.md §2.4）：
 *   - 只绑 127.0.0.1，不带任何 CORS 头（浏览器页面不可读响应；house 惯例同 log-lens）；
 *   - /query 只读护（SELECT/WITH + 关键词黑名单，字符串/注释感知）；
 *   - 导入上限（路径 512MB/上传 8MB）、导出路径护栏（绝对路径/扩展名/拒绝覆盖/护内部文件）；
 *   - 引擎下载 sha256 钉版强校验；
 *   - 日志走 stderr；协议数据走 HTTP 响应。
 *
 * 启动参数：node server.js <port> <appConfigDir>
 * 端口发现：cap.kv `dq.meta` { port, dataRoot, version }（服务写）→ 回退 manifest 9875。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('./core');
const { Engine } = require('./engine');
const { createKvClient } = require('./kvclient');

const PORT = parseInt(process.argv[2], 10) || core.MANIFEST_PORT;
const APP_CONFIG_DIR = process.argv[3] || '';

const slog = (msg) => { process.stderr.write(`[data-query:service] ${msg}\n`); };
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });

// ── 目录布局 ───────────────────────────────────────────────────────────────
// 引擎缓存 + 临时转码 → <appConfigDir>/data-query/engine
// 工作区（workspace.duckdb + registry.json）→ <dataRoot>/plugins/data-query/
//   dataRoot 是 Polaris 数据权威（anchor.json → dataRoot）；解析失败回退 appConfigDir。
function resolveDataRoot() {
  const candidates = [];
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'Polaris', 'anchor.json'));
  candidates.push(path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'));
  candidates.push(path.join(os.homedir(), '.polaris', 'anchor.json'));
  for (const p of candidates) {
    try {
      const a = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) return a.dataRoot;
    } catch (_) { /* 跳过不可读候选 */ }
  }
  return '';
}

const DATA_ROOT = resolveDataRoot();
const ENGINE_DIR = APP_CONFIG_DIR
  ? path.join(APP_CONFIG_DIR, 'data-query', 'engine')
  : path.join(os.tmpdir(), 'data-query-engine');
const WORKSPACE_DIR = DATA_ROOT
  ? path.join(DATA_ROOT, 'plugins', 'data-query')
  : (APP_CONFIG_DIR ? path.join(APP_CONFIG_DIR, 'data-query', 'workspace') : path.join(os.tmpdir(), 'data-query-workspace'));

const engine = new Engine({
  engineDir: ENGINE_DIR,
  workspaceDir: WORKSPACE_DIR,
  onStatus: () => { /* 状态由各路由实时取 */ },
});

// ── HTTP 骨架 ──────────────────────────────────────────────────────────────
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readJsonBody(req, res, maxBytes) {
  return new Promise((resolve, reject) => {
    const len = parseInt(req.headers['content-length'] || '0', 10);
    if (len > maxBytes) {
      reject(new Error(`请求体 ${len}B 超过上限 ${maxBytes}B`));
      req.resume();
      return;
    }
    const chunks = [];
    let got = 0;
    req.on('data', (c) => {
      got += c.length;
      if (got > maxBytes) {
        reject(new Error(`请求体超过上限 ${maxBytes}B`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error(`JSON 解析失败：${e.message}`)); }
    });
    req.on('error', reject);
  });
}

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const len = parseInt(req.headers['content-length'] || '0', 10);
    if (len > maxBytes) {
      reject(new Error(`上传 ${len}B 超过上限 ${maxBytes}B`));
      req.resume();
      return;
    }
    const chunks = [];
    let got = 0;
    req.on('data', (c) => {
      got += c.length;
      if (got > maxBytes) { reject(new Error(`上传超过上限 ${maxBytes}B`)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function userError(e) {
  return e && (e.userFacing === true || e.userFacing === false) ? e.message : (e && e.message ? e.message : String(e));
}

// ── 路由 ───────────────────────────────────────────────────────────────────
async function route(req, res, url) {
  const p = url.pathname;

  if (p === '/__health') {
    sendJson(res, 200, { ok: true, version: core.VERSION, engine: engine.state, tables: engine.registry.length });
    return;
  }

  if (p === '/status') {
    sendJson(res, 200, {
      ok: true, version: core.VERSION, port: PORT, dataRoot: DATA_ROOT,
      engineDir: ENGINE_DIR, workspaceDir: WORKSPACE_DIR,
      home: os.homedir(),
      engine: engine.status(),
      limits: core.LIMITS,
    });
    return;
  }

  if (p === '/tables' && req.method === 'GET') {
    const tables = await engine.tables();
    sendJson(res, 200, { ok: true, tables });
    return;
  }

  if (p === '/schema' && req.method === 'GET') {
    try {
      sendJson(res, 200, { ok: true, ...(await engine.schema(url.searchParams.get('table'))) });
    } catch (e) { sendJson(res, 400, { ok: false, error: userError(e) }); }
    return;
  }

  if (p === '/preview' && req.method === 'GET') {
    try {
      sendJson(res, 200, { ok: true, ...(await engine.preview(url.searchParams.get('table'), parseInt(url.searchParams.get('n') || '10', 10))) });
    } catch (e) { sendJson(res, 400, { ok: false, error: userError(e) }); }
    return;
  }

  if (p === '/import' && req.method === 'POST') {
    const body = await readJsonBody(req, res, 64 * 1024);
    try {
      const out = await engine.importPath(body.path, body.table);
      sendJson(res, 200, { ok: true, ...out });
    } catch (e) { sendJson(res, 400, { ok: false, error: userError(e) }); }
    return;
  }

  if (p === '/import/upload' && req.method === 'POST') {
    const name = url.searchParams.get('name') || 'upload.csv';
    try {
      const buf = await readRawBody(req, core.LIMITS.UPLOAD_BYTES);
      const out = await engine.importBytes(name, buf);
      sendJson(res, 200, { ok: true, ...out });
    } catch (e) { sendJson(res, 400, { ok: false, error: userError(e) }); }
    return;
  }

  if (p === '/query' && req.method === 'POST') {
    const body = await readJsonBody(req, res, core.LIMITS.SQL_TEXT_MAX + 4096);
    const guard = core.assertReadOnlySelect(body.sql);
    if (!guard.ok) { sendJson(res, 400, { ok: false, error: guard.error }); return; }
    try {
      const out = await engine.query(body.sql, parseInt(body.maxRows, 10) || core.LIMITS.QUERY_ROWS_DEFAULT);
      sendJson(res, 200, { ok: true, sql: String(body.sql).slice(0, 500), ...out });
    } catch (e) {
      // SQL 执行错误原文透传（不吞不译，AI/用户都靠它定位）
      sendJson(res, 400, { ok: false, error: userError(e) });
    }
    return;
  }

  if (p === '/export' && req.method === 'POST') {
    const body = await readJsonBody(req, res, core.LIMITS.SQL_TEXT_MAX + 64 * 1024);
    const guard = core.assertReadOnlySelect(body.sql);
    if (!guard.ok) { sendJson(res, 400, { ok: false, error: guard.error }); return; }
    try {
      const out = await engine.exportQuery({
        sql: body.sql,
        outPath: body.path,
        format: body.format,
        overwrite: body.overwrite === true,
      });
      sendJson(res, 200, { ok: true, ...out });
    } catch (e) { sendJson(res, 400, { ok: false, error: userError(e) }); }
    return;
  }

  if (p === '/drop' && req.method === 'POST') {
    const body = await readJsonBody(req, res, 4096);
    try {
      sendJson(res, 200, { ok: true, ...(await engine.drop(body.table)) });
    } catch (e) { sendJson(res, 400, { ok: false, error: userError(e) }); }
    return;
  }

  if (p === '/workspace/reset' && req.method === 'POST') {
    const body = await readJsonBody(req, res, 4096);
    try {
      sendJson(res, 200, { ok: true, ...(await engine.reset(body.confirm === true)) });
    } catch (e) { sendJson(res, 400, { ok: false, error: userError(e) }); }
    return;
  }

  sendJson(res, 404, { ok: false, error: `未知路由 ${p}` });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  // 仅本机回环（双保险：监听已限定 127.0.0.1）
  const ra = req.socket.remoteAddress || '';
  if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(ra)) {
    sendJson(res, 403, { ok: false, error: '仅允许本机回环访问' });
    return;
  }
  route(req, res, url).catch((e) => {
    slog(`route error ${url.pathname}: ${e && e.stack ? e.stack : e}`);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: userError(e) });
    else res.end();
  });
});

// 请求体读取错误（超限 destroy）也要给响应
server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(PORT, '127.0.0.1', () => {
  slog(`listening on 127.0.0.1:${PORT} (v${core.VERSION}, dataRoot=${DATA_ROOT || '未解析'}, engineDir=${ENGINE_DIR})`);
  // 端口发现元数据（MCP/面板回退链用）+ 后台预热引擎
  Promise.resolve()
    .then(async () => {
      await kv.kvSet(core.KV_META_KEY, { port: PORT, dataRoot: DATA_ROOT, version: core.VERSION, pid: process.pid });
      slog(`kv meta written: ${core.KV_META_KEY} = {port:${PORT}}`);
    })
    .catch((e) => slog(`kv meta write failed (回退 manifest 端口 ${core.MANIFEST_PORT}): ${e.message}`));
  engine.ensure().catch((e) => slog(`engine warmup failed: ${e.message}`));
});

process.on('unhandledRejection', (reason) => {
  slog(`unhandledRejection: ${reason && reason.stack ? reason.stack : reason}`);
});
