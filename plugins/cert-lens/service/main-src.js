'use strict';
/**
 * main-src.js —— cert-lens 后台服务（esbuild bundle → service/main.js）
 *
 * 职责（全部只读探测；对目标主机只发 TLS ClientHello，不发应用数据）：
 *   POST /api/parse        证书/公钥解析 + 链审计 + 私钥配对（内存完成，即弃）
 *   POST /api/probe        真实 TLS 握手探测（双段策略）+ 链/主机复核 + 错误诊断
 *   POST /api/diagnose     错误码/文本 → 根因与修复建议（离线规则表）
 *   POST /api/watch/list   盯守端点清单 + 上次巡检状态（cap.kv）
 *   POST /api/watch/add    添加端点（去重，上限 64）
 *   POST /api/watch/remove 删除端点
 *   POST /api/watch/check  全量巡检（并发 4）+ 状态落 kv
 *   POST /api/selftest     试金石：fixture 断言 + 本地 hermetic TLS 服务器全链路
 *   GET  /__health
 *
 * 安全底线：
 *   - 只绑 127.0.0.1；除 /__health 外全部要求 x-cert-lens-token（meta 写 cap.kv 供面板取）。
 *   - 解析输入（含私钥）只在内存，绝不落日志、不落 kv；日志只记尺寸/耗时/错误类型。
 *   - 探测目标不设内网限制——本地桌面诊断工具对自身网络有完全权限，这正是相对
 *     在线检查工具（够不到内网）的核心差异；对目标只做一次只读握手，无写副作用。
 *
 * 启动参数：node main.js {{port}} {{appConfigDir}}（宿主注入）
 */
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const api = require('../shared/engine-api.js');
const certmodel = require('../shared/certmodel.js');
const audit = require('../shared/audit.js');
const logic = require('./logic.js');
const probe = require('./probe.js');
const { doSelftest } = require('./selftest.js');
const { createKvClient } = require('./kvclient.js');

const PLUGIN_ID = 'cert-lens';
const VERSION = '0.1.0';
const LOG_MAX = 512 * 1024;
const BODY_LIMIT = 4 * 1024 * 1024 + 1024 * 1024; // PEM 输入 2MB + JSON 包装余量

const PORT = parseInt(process.argv[2] || '', 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

// ── 日志（自落盘 + 512KB 轮转；绝不记录证书内容/私钥）──────────────────────
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

// ── 桥（降级不致命：解析/探测核心不依赖 kv，仅盯守清单需要）────────────────
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
const KEY_META = PLUGIN_ID + '.meta';
const KEY_ENDPOINTS = PLUGIN_ID + '.endpoints';
const KEY_STATE = PLUGIN_ID + '.watch.state';
const token = process.env.CERT_LENS_TEST_TOKEN || crypto.randomBytes(16).toString('hex');

// ── 盯守 ───────────────────────────────────────────────────────────────────
async function watchList() {
  const endpoints = (await kv.kvGet(KEY_ENDPOINTS)) || [];
  const state = (await kv.kvGet(KEY_STATE)) || null;
  return { endpoints: Array.isArray(endpoints) ? endpoints : [], state };
}

async function watchAdd(body) {
  const nt = api.normalizeTarget(body.target != null ? body.target : `${body.host || ''}:${body.port || 443}`);
  if (!nt.ok) throw logic.userErr(nt.error);
  const list = await watchList();
  const item = {
    host: nt.host,
    port: nt.port,
    serverName: typeof body.serverName === 'string' ? body.serverName : '',
    label: typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : `${nt.host}:${nt.port}`,
    addedAt: new Date().toISOString(),
  };
  const dup = list.endpoints.find((e) => e.host === item.host && e.port === item.port && (e.serverName || '') === (item.serverName || ''));
  if (dup) return { ...list, added: false, note: '端点已存在' };
  if (list.endpoints.length >= api.LIMITS.WATCH_MAX_ENDPOINTS) throw logic.userErr(`盯守端点已达上限 ${api.LIMITS.WATCH_MAX_ENDPOINTS}`);
  list.endpoints.push(item);
  await kv.kvSet(KEY_ENDPOINTS, list.endpoints);
  return { ...list, added: true };
}

async function watchRemove(body) {
  const nt = api.normalizeTarget(body.target != null ? body.target : `${body.host || ''}:${body.port || 443}`);
  if (!nt.ok) throw logic.userErr(nt.error);
  const list = await watchList();
  const before = list.endpoints.length;
  list.endpoints = list.endpoints.filter((e) => !(e.host === nt.host && e.port === nt.port));
  const removed = before - list.endpoints.length;
  if (removed) await kv.kvSet(KEY_ENDPOINTS, list.endpoints);
  return { ...list, removed };
}

/** 全量巡检：并发 4；每次结果整体落 kv（覆盖写单键，无并发交错问题） */
async function watchCheck(now) {
  const list = await watchList();
  const eps = list.endpoints;
  const results = new Array(eps.length);
  const CONCURRENCY = 4;
  let i = 0;
  async function worker() {
    while (i < eps.length) {
      const idx = i++;
      const ep = eps[idx];
      try {
        const r = await probe.tlsProbe({ host: ep.host, port: ep.port, serverName: ep.serverName || '', timeoutMs: api.clampTimeoutMs(ep.timeoutMs), now });
        const leaf = r.chain.length ? r.chain[r.chainAudit.leafIndex != null ? r.chainAudit.leafIndex : 0] : null;
        results[idx] = {
          host: ep.host,
          port: ep.port,
          label: ep.label,
          serverName: ep.serverName || '',
          ok: r.verified,
          connected: r.connected,
          daysLeft: leaf ? leaf.daysLeft : null,
          notAfter: leaf ? leaf.notAfter : null,
          cn: leaf ? leaf.cn : null,
          severity: leaf ? api.expirySeverity(leaf.daysLeft) : 'crit',
          errorCode: r.error ? r.error.code : null,
          checkedAt: new Date().toISOString(),
        };
      } catch (e) {
        results[idx] = { host: ep.host, port: ep.port, label: ep.label, ok: false, severity: 'crit', errorCode: 'INTERNAL', errorDetail: String((e && e.message) || e).slice(0, 200), checkedAt: new Date().toISOString() };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(CONCURRENCY, eps.length)) }, worker));
  const state = { checkedAt: new Date().toISOString(), results };
  await kv.kvSet(KEY_STATE, state);
  return { endpoints: eps, state };
}

// ── HTTP 骨架（house 标准形态）────────────────────────────────────────────
function sendJson(res, code, obj, extraHeaders) {
  const data = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
    ...(extraHeaders || {}),
  });
  res.end(data);
}
function fail(res, code, msg) { sendJson(res, code, { ok: false, error: msg }); }

function authed(req) {
  return String(req.headers['x-cert-lens-token'] || '') === token;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let exceeded = false;
    req.on('data', (c) => {
      if (exceeded) return;
      size += c.length;
      if (size > BODY_LIMIT) {
        exceeded = true;
        chunks.length = 0;
        req.removeAllListeners('data');
        req.resume();
        reject(logic.userErr('请求体超限（PEM 上限 2MB）'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (exceeded) return;
      if (!chunks.length) { resolve({}); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { reject(logic.userErr('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-cert-lens-token',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }
  try {
    if (url === '/__health') {
      sendJson(res, 200, { ok: true, version: VERSION, uptimeMs: Math.round(process.uptime() * 1000) });
      return;
    }
    if (!url.startsWith('/api/')) { fail(res, 404, '未知路径'); return; }
    if (!authed(req)) { fail(res, 401, '缺少或错误的 token（面板应从 cap.kv cert-lens.meta 读取）'); return; }

    const body = await readBody(req);
    switch (url) {
      case '/api/parse': {
        const r = logic.doParse(body, Date.now());
        log('info', `parse certs=${r.kind.certs} errors=${r.errors.length}${r.keyMatch ? ' keyMatch=' + r.keyMatch.matched : ''}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case '/api/probe': {
        const r = await logic.doProbe(body, Date.now());
        log('info', `probe ${r.target.host}:${r.target.port} ok=${r.ok} chain=${r.chain.length} ms=${r.ms}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case '/api/diagnose': {
        const r = logic.doDiagnose(body);
        log('info', `diagnose rule=${r.rule}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case '/api/watch/list': {
        sendJson(res, 200, { ok: true, ...(await watchList()) });
        return;
      }
      case '/api/watch/add': {
        sendJson(res, 200, { ok: true, ...(await watchAdd(body)) });
        return;
      }
      case '/api/watch/remove': {
        sendJson(res, 200, { ok: true, ...(await watchRemove(body)) });
        return;
      }
      case '/api/watch/check': {
        const r = await watchCheck(Date.now());
        log('info', `watch check n=${r.endpoints.length}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case '/api/selftest': {
        const r = await doSelftest();
        log('info', `selftest pass=${r.pass}/${r.total}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      default:
        fail(res, 404, `未知 API ${url}`);
    }
  } catch (err) {
    const isUser = err && err.user;
    log(isUser ? 'info' : 'error', `${url} ${isUser ? '拒绝' : '内部错误'}: ${err && err.message}`);
    fail(res, isUser ? 400 : 500, (err && err.message) || '内部错误');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : PORT;
  log('info', `service listening on 127.0.0.1:${port} (version ${VERSION})`);
  kv.kvSet(KEY_META, {
    token, port, version: VERSION,
    startedAt: new Date().toISOString(),
  }).then(() => log('info', 'meta 写入 cap.kv 成功'))
    .catch((e) => log('warn', `meta 写 cap.kv 失败（桥降级，面板将显示离线）: ${e && e.message}`));
});

process.on('uncaughtException', (e) => log('error', `uncaught: ${e && e.stack ? e.stack : e}`));
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.stack ? e.stack : e}`));
function shutdown() {
  log('info', '收到退出信号，关闭服务');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
