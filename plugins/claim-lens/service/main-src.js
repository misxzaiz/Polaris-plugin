'use strict';
/**
 * main-src.js —— AI 声明核验台（claim-lens）后台服务（esbuild bundle → service/main.js）
 *
 * 职责：
 *   - 面板字节面：/api/verify（text+root → 提取+核验全链路）、/api/verify_batch（显式声明批量核验）、
 *     /api/selftest（试金石）、/api/settings（仓库根历史，读写 cap.kv）。
 *   - MCP 与本服务共用 shared/claim-core + server/verify-prims（MCP 不经 HTTP，直接 require）。
 *   - kv：claim-lens.meta（token/port，面板读取）、claim-lens.settings（根历史等）。
 *
 * 安全底线：
 *   - 只绑 127.0.0.1；除 /__health 外全部要求 x-claim-lens-token。
 *   - exec 只在 server/verify-prims.js 一处，白名单 + token 正则 + shell:false + 8s 超时。
 *   - fs 全部只读；日志只记声明类型/数量与裁决统计，不记文本内容与路径全文（路径截断）。
 *
 * 启动参数：node main.js {{port}} {{appConfigDir}}（宿主注入）
 * 健康检查：GET /__health 恒 200。
 */
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const core = require('../shared/claim-core.js');
const prims = require('../server/verify-prims.js');
const { runSelftest } = require('../server/selftest.js');
const { createKvClient } = require('./kvclient.js');

const PLUGIN_ID = 'claim-lens';
const VERSION = '0.1.0';
const LOG_MAX = 512 * 1024;
const BODY_LIMIT = 4 * 1024 * 1024;

const PORT = parseInt(process.argv[2] || '', 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

// ── 日志（自落盘 + 512KB 轮转；绝不记声明内容）──────────────────────────────
const logFile = APP_CONFIG_DIR ? path.join(APP_CONFIG_DIR, PLUGIN_ID + '.log') : '';
function log(level, msg) {
  const line = `[${PLUGIN_ID}:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug') return;
  process.stderr.write(line + '\n');
  if (!logFile) return;
  try {
    try {
      const st = require('fs').statSync(logFile);
      if (st.size > LOG_MAX) require('fs').renameSync(logFile, logFile + '.old');
    } catch (_) { /* 首次无文件 */ }
    require('fs').appendFileSync(logFile, line + '\n');
  } catch (_) { /* 日志失败不影响业务 */ }
}

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
const PREFIX = PLUGIN_ID + '.';
const KEY_META = PREFIX + 'meta';
const KEY_SETTINGS = PREFIX + 'settings';

// ── 测试钩子（yizhou 惯例）：仅冒烟注入；生产路径恒为随机 token ─────────────
const token = process.env.CLAIM_LENS_TEST_TOKEN || crypto.randomBytes(16).toString('hex');

function authed(req) {
  return String(req.headers['x-claim-lens-token'] || '') === token;
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function fail(res, code, msg) {
  json(res, code, { ok: false, error: msg });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) { reject(Object.assign(new Error('请求体超过 4MB'), { user: true })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleVerifyBatch(body) {
  const root = String(body.root || '').trim();
  if (!root) failUser('需要 root（仓库根绝对路径）');
  if (!prims.isDir(root)) failUser(`root 不是目录: ${root.slice(0, 120)}`);
  let claims;
  if (typeof body.text === 'string' && body.text.trim() && !Array.isArray(body.claims)) {
    claims = core.extractClaims(body.text).claims;
  } else {
    claims = core.normalizeClaims(body.claims);
  }
  const report = await prims.verifyClaims(root, claims);
  return report;
}

function failUser(msg) {
  const e = new Error(msg);
  e.user = true;
  throw e;
}

async function handleSettings(body) {
  const cur = (await kvGet(KEY_SETTINGS)) || { roots: [] };
  if (body && Array.isArray(body.roots)) {
    const next = {
      roots: body.roots.filter((r) => typeof r === 'string' && r.trim()).slice(0, 8),
      updatedAt: new Date().toISOString(),
    };
    const okWrite = await kvSet(KEY_SETTINGS, next);
    return { settings: next, saved: okWrite === true };
  }
  return { settings: cur, saved: false };
}

// kv 双重解包纪律（platform-constraints）：先判 ok，再 value in m ? m.value : m
async function kvGet(key) {
  try {
    const m = await kv.request({ action: 'get', key });
    if (m && m.ok === false) return null;
    const r = m && m.result ? m.result : m;
    if (r && typeof r === 'object' && 'value' in r) return r.value;
    return r && typeof r === 'object' && key in r ? r[key] : r;
  } catch (_) { return null; }
}

async function kvSet(key, value) {
  try {
    const m = await kv.request({ action: 'set', key, value });
    return !(m && m.ok === false);
  } catch (_) { return false; /* 降级不致命，但如实上报 */ }
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0];
  try {
    if (url === '/__health') { json(res, 200, { ok: true, plugin: PLUGIN_ID, version: VERSION }); return; }
    if (!authed(req)) { fail(res, 401, '缺少或错误的 token（面板应从 cap.kv claim-lens.meta 读取）'); return; }

    if (req.method === 'POST' && url === '/api/verify') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const report = await handleVerifyBatch(body);
      log('info', `verify root=${path.basename(String(body.root || ''))} claims=${report.summary.total} v/r/p/u=${report.summary.verified}/${report.summary.refuted}/${report.summary.partial}/${report.summary.unverifiable}`);
      json(res, 200, { ok: true, report });
      return;
    }
    if (req.method === 'POST' && url === '/api/verify_batch') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const report = await handleVerifyBatch(body);
      log('info', `verify_batch root=${path.basename(String(body.root || ''))} claims=${report.summary.total}`);
      json(res, 200, { ok: true, report });
      return;
    }
    if (req.method === 'POST' && url === '/api/extract') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const r = core.extractClaims(String(body.text || ''));
      log('info', `extract claims=${r.claims.length} blocks=${r.stats.codeBlocks}`);
      json(res, 200, { ok: true, ...r });
      return;
    }
    if (req.method === 'POST' && url === '/api/selftest') {
      const r = await runSelftest();
      log('info', `selftest ${r.pass}/${r.items.length}`);
      json(res, 200, { ok: r.fail === 0, ...r });
      return;
    }
    if (req.method === 'POST' && url === '/api/settings') {
      const body = JSON.parse((await readBody(req)) || '{}');
      json(res, 200, { ok: true, ...(await handleSettings(body)) });
      return;
    }
    fail(res, 404, `未知路由 ${req.method} ${url}`);
  } catch (e) {
    const userErr = e && e.user;
    log(userErr ? 'warn' : 'error', `req ${url}: ${String(e && e.message || e).slice(0, 200)}`);
    fail(res, userErr ? 400 : 500, String(e && e.message || e));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const port = server.address().port;
  log('info', `service listening on 127.0.0.1:${port} (version ${VERSION})`);
  // meta 写 cap.kv（面板取 token/port；桥降级时面板走重试）
  Promise.resolve()
    .then(() => kvSet(KEY_META, { token, port, version: VERSION, startedAt: new Date().toISOString() }))
    .then((okWrite) => log(okWrite ? 'info' : 'warn', okWrite ? 'meta 已写 cap.kv' : 'meta 写 kv 失败（桥降级，面板将无法连接直到桥恢复）'))
    .catch((e) => log('warn', `meta 写 kv 异常（降级）: ${String(e && e.message || e)}`));
});

process.on('SIGTERM', () => { try { server.close(() => process.exit(0)); } catch (_) { process.exit(0); } });
process.on('SIGINT', () => { try { server.close(() => process.exit(0)); } catch (_) { process.exit(0); } });
