#!/usr/bin/env node
'use strict';
/**
 * main.js —— 执行计划透视台本地服务（type=http；仅绑 127.0.0.1；除用户显式配置的数据库连接外零外网）
 *
 * 职责：连接配置/EXPLAIN 执行/计划解析/历史 的**单一路径权威**。
 * 面板（经宿主 cap.http 转发）与 MCP（本机直连）都是本服务的客户端。
 * 纯逻辑全部在 core.js（可离线单测），本文件只做编排与 I/O。
 *
 * 安全边界：
 *   - 仅绑 127.0.0.1，不带 CORS 头；Bearer token 鉴权（token 经 cap.kv `qpl.service` 分发，
 *     与 db-workbench `dbl.service` 同一模式；kv 不可用时降级为无鉴权并告警）；
 *   - 写语句永久拒绝（core.assertReadOnlySelect，字符串/注释感知）；
 *   - EXPLAIN ANALYZE（真实执行）仅在只读护栏通过时放行（PG）；
 *   - 请求体上限 2MB；原始计划入库上限 core.MAX_RAW_PLAN_BYTES；
 *   - 密码只在服务侧内存/文件，接口层永不返回（conns.list 返回 hasPassword 布尔）；
 *   - 日志走 stderr；协议数据走 HTTP 响应。
 *
 * 启动参数：node main.js <port> <appConfigDir>
 */
const http = require('http');
const crypto = require('crypto');
const core = require('./core');
const db = require('./db');
const { ConnStore } = require('./store');
const { createKvClient } = require('./kvclient');

const PORT = parseInt(process.argv[2], 10) || 9866;
const APP_CONFIG_DIR = process.argv[3] || '';
const VERSION = '0.1.0';
const KV_META_KEY = 'qpl.service';
const KV_HISTORY_KEY = 'qpl.history';
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const slog = (msg) => { process.stderr.write(`[query-plan-lens:service] ${msg}\n`); };
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });
const store = new ConnStore(APP_CONFIG_DIR);

// ── token 自举：沿用 kv 已有 token（面板缓存不失效），端口每次刷新 ──────────
// QPL_NO_KV=1：hermetic 测试模式——不碰真实宿主 kv，token 取 QPL_TOKEN（可空=无鉴权）
let AUTH_TOKEN = '';
let kvReady = false;

async function bootstrapMeta() {
  if (process.env.QPL_NO_KV === '1') {
    AUTH_TOKEN = process.env.QPL_TOKEN || '';
    kvReady = false;
    slog('测试模式（QPL_NO_KV）：跳过 kv 元数据，token 来自环境变量');
    return;
  }
  try {
    const existing = await kv.kvGet(KV_META_KEY);
    AUTH_TOKEN = existing && existing.token ? existing.token : crypto.randomBytes(16).toString('hex');
    await kv.kvSet(KV_META_KEY, {
      port: PORT, token: AUTH_TOKEN, version: VERSION, pid: process.pid, startedAt: Date.now(),
    });
    kvReady = true;
    slog(`meta 已写入 kv（port=${PORT}，token=${AUTH_TOKEN ? '沿用/新生成' : '空'}）`);
  } catch (err) {
    AUTH_TOKEN = '';
    slog(`kv 不可用（${err && err.message}），降级为无鉴权模式——仅 127.0.0.1 绑定保护`);
  }
}

// ── 历史（kv 单写者=本服务；QPL_NO_KV 测试模式走内存，不碰真实宿主） ────────
const memoryHistory = [];
const NO_KV = process.env.QPL_NO_KV === '1';

async function historyLoad() {
  if (NO_KV) return memoryHistory;
  const arr = await kv.kvGet(KV_HISTORY_KEY);
  return Array.isArray(arr) ? arr : [];
}

async function historySave(entry) {
  if (NO_KV) {
    memoryHistory.unshift(entry);
    while (memoryHistory.length > core.HISTORY_LIMIT) memoryHistory.pop();
    return;
  }
  const arr = await historyLoad();
  arr.unshift(entry);
  while (arr.length > core.HISTORY_LIMIT) arr.pop();
  await kv.kvSet(KV_HISTORY_KEY, arr);
}

// ── 业务动作 ────────────────────────────────────────────────────────────────

async function handleConnsList() {
  return { ok: true, connections: store.list() };
}

async function handleConnsSave(body) {
  const r = store.save(body || {});
  slog(`连接已保存：${r.id}`);
  return { ok: true, ...r };
}

async function handleConnsDelete(body) {
  const ok = store.delete(String((body || {}).id || ''));
  return { ok: true, deleted: ok };
}

async function handleConnsTest(body) {
  const conn = body && body.id ? store.get(String(body.id)) : body;
  if (!conn || !conn.host) return { ok: false, error: '连接不存在或 host 为空' };
  const t0 = Date.now();
  const engine = conn.engine === 'pg' ? 'pg' : 'mysql';
  const r = await db.runExplain({ ...conn, engine }, 'SELECT 1', false);
  return { ok: true, serverVersion: r.serverVersion, latencyMs: Date.now() - t0 };
}

/** 统一：执行 EXPLAIN → 解析 → 诊断 → 自动存历史 */
async function handlePlanExplain(body) {
  const connId = String((body || {}).connId || '');
  const sql = String((body || {}).sql || '');
  const wantAnalyze = !!(body && body.analyze);
  const guard = core.assertReadOnlySelect(sql);
  if (!guard.ok) return { ok: false, error: guard.reason };
  const conn = store.get(connId);
  if (!conn) return { ok: false, error: '连接不存在，请先在「连接」里配置' };

  const engine = conn.engine === 'pg' ? 'pg' : 'mysql';
  let note = '';
  let analyzeUsed = false;
  if (engine === 'mysql' && wantAnalyze) {
    note = 'MySQL 实际执行计划（EXPLAIN ANALYZE）暂不支持，已返回优化器估算计划（FORMAT=JSON）。';
  }
  analyzeUsed = engine === 'pg' && wantAnalyze;

  const t0 = Date.now();
  const { rows, serverVersion } = await db.runExplain(conn, sql, analyzeUsed);
  const durationMs = Date.now() - t0;
  const payload = db.extractPlanPayload(engine, rows);
  if (payload === null) return { ok: false, error: '数据库未返回计划内容' };

  const parsed = engine === 'pg' ? core.parsePgExplainJson(payload) : core.parseMysqlExplainJson(payload);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const findings = core.analyzePlan(parsed.plan);
  const raw = JSON.stringify(payload).slice(0, core.MAX_RAW_PLAN_BYTES);

  const entry = {
    id: `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(), engine,
    connName: conn.name || `${conn.host}:${conn.port}`,
    sql: core.sqlSnippet(sql),
    analyzeUsed,
    findingsCount: findings.length,
    plan: JSON.stringify(parsed.plan).slice(0, core.MAX_RAW_PLAN_BYTES),
  };
  try { await historySave(entry); } catch (err) { slog(`历史写入失败（不影响结果）：${err && err.message}`); }

  return {
    ok: true, plan: parsed.plan, findings, raw,
    meta: { durationMs, serverVersion, analyzeUsed, note, historyId: entry.id },
  };
}

/** 离线解析：粘贴 PG 文本 / 任一引擎 JSON；不碰数据库 */
async function handlePlanParse(body) {
  const text = String((body || {}).text || '');
  const engine = (body && body.engine) === 'mysql' ? 'mysql' : (body && body.engine) === 'pg' ? 'pg' : 'auto';
  if (!text.trim()) return { ok: false, error: '粘贴内容为空' };
  if (text.length > core.MAX_RAW_PLAN_BYTES * 2) return { ok: false, error: '粘贴内容过大' };

  if (engine === 'mysql') {
    const r = core.parseMysqlExplainJson(text);
    if (!r.ok) return { ok: false, error: `${r.error}（MySQL 请贴 EXPLAIN FORMAT=JSON 的 JSON 输出）` };
    const findings = core.analyzePlan(r.plan);
    return { ok: true, plan: r.plan, findings, meta: { source: 'paste', engine: 'mysql' } };
  }
  if (engine === 'pg') {
    // PG：先试 JSON 再退文本
    const asJson = tryParseJson(text);
    const r = asJson !== null ? core.parsePgExplainJson(asJson) : core.parsePgExplainText(text);
    if (!r.ok) return { ok: false, error: `${r.error}` };
    const findings = core.analyzePlan(r.plan);
    return { ok: true, plan: r.plan, findings, meta: { source: asJson !== null ? 'paste-json' : 'paste-text', engine: 'pg' } };
  }
  // auto：JSON → 按形状判引擎；非 JSON → PG 文本
  const asJson = tryParseJson(text);
  if (asJson !== null) {
    if (looksMysql(asJson)) {
      const r = core.parseMysqlExplainJson(asJson);
      if (r.ok) return { ok: true, plan: r.plan, findings: core.analyzePlan(r.plan), meta: { source: 'paste-json', engine: 'mysql' } };
      return { ok: false, error: r.error };
    }
    const r = core.parsePgExplainJson(asJson);
    if (r.ok) return { ok: true, plan: r.plan, findings: core.analyzePlan(r.plan), meta: { source: 'paste-json', engine: 'pg' } };
    return { ok: false, error: r.error };
  }
  const r = core.parsePgExplainText(text);
  if (!r.ok) {
    return { ok: false, error: `${r.error}（若是 MySQL 输出，请选择引擎 MySQL 并贴 FORMAT=JSON 的 JSON）` };
  }
  return { ok: true, plan: r.plan, findings: core.analyzePlan(r.plan), meta: { source: 'paste-text', engine: 'pg' } };
}

function tryParseJson(text) {
  const t = text.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return null;
  try { return JSON.parse(t); } catch (_) { return null; }
}

function looksMysql(obj) {
  if (Array.isArray(obj)) obj = obj[0];
  if (!obj || typeof obj !== 'object') return false;
  const qp = obj['Query Plan'] || obj;
  if (qp.query_block) return true;
  return !!(obj.query_block);
}

async function handleHistoryList(body) {
  const arr = await historyLoad();
  const limit = Math.min(Number((body || {}).limit) || core.HISTORY_LIMIT, core.HISTORY_LIMIT);
  return {
    ok: true,
    items: arr.slice(0, limit).map((e) => ({
      id: e.id, ts: e.ts, engine: e.engine, connName: e.connName,
      sql: e.sql, analyzeUsed: e.analyzeUsed, findingsCount: e.findingsCount,
    })),
  };
}

async function handleHistoryGet(body) {
  const id = String((body || {}).id || '');
  const arr = await historyLoad();
  const e = arr.find((x) => x.id === id);
  if (!e) return { ok: false, error: '历史条目不存在（可能已被新条目挤出）' };
  let plan = null;
  try { plan = JSON.parse(e.plan); } catch (_) { return { ok: false, error: '历史计划数据损坏' }; }
  return { ok: true, plan, findings: core.analyzePlan(plan), meta: { source: 'history', engine: plan.engine } };
}

async function handleHistoryClear() {
  await kv.kvSet(KV_HISTORY_KEY, []);
  return { ok: true };
}

async function handleMeta() {
  return {
    ok: true, version: VERSION, kvReady,
    connsFile: APP_CONFIG_DIR ? '(appConfigDir)/qpl-connections.json' : '(tmp)',
    pid: process.pid, uptimeSec: Math.round(process.uptime()),
  };
}

const ROUTES = {
  'conns.list': handleConnsList,
  'conns.save': handleConnsSave,
  'conns.delete': handleConnsDelete,
  'conns.test': handleConnsTest,
  'plan.explain': handlePlanExplain,
  'plan.parse': handlePlanParse,
  'history.list': handleHistoryList,
  'history.get': handleHistoryGet,
  'history.clear': handleHistoryClear,
  meta: handleMeta,
};

// ── HTTP 骨架 ───────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体超过 2MB 上限'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function checkAuth(req) {
  if (!AUTH_TOKEN) return true; // kv 不可用时的降级（已告警）
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Bearer ')) return false;
  const got = h.slice(7);
  if (got.length !== AUTH_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(AUTH_TOKEN));
}

const server = http.createServer(async (req, res) => {
  // 无 CORS 头：浏览器页面跨源读不到响应（house 惯例，对齐 data-query）
  if (req.method === 'GET' && req.url === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: VERSION, kvReady }));
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: '仅接受 POST' }));
    return;
  }
  if (!checkAuth(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: '鉴权失败：token 与 kv qpl.service 不匹配' }));
    return;
  }
  const route = String(req.url || '/').replace(/^\//, '');
  const handler = ROUTES[route];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: `未知端点 /${route}` }));
    return;
  }
  try {
    const bodyText = await readBody(req);
    let body = {};
    if (bodyText.trim()) {
      try { body = JSON.parse(bodyText); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: '请求体不是合法 JSON' }));
        return;
      }
    }
    const out = await handler(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  } catch (err) {
    slog(`/${route} 失败：${err && err.stack ? err.stack.split('\n')[0] : err}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: (err && err.message) || String(err) }));
  }
});

server.on('error', (err) => {
  // 端口被占（其他插件服务/残留进程）：必须退出让宿主 healthCheck 失败可见，
  // 绝不能吞掉后变成「活着但不监听」的僵尸进程
  slog(`server error：${err && err.message}——进程退出（端口 ${PORT} 不可用）`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  slog(`listening on 127.0.0.1:${PORT} (v${VERSION})`);
  bootstrapMeta().catch((e) => slog(`bootstrapMeta 异常：${e && e.message}`)).finally(() => {
    process.send && process.send({ type: 'ready', port: PORT });
  });
});

process.on('SIGTERM', () => {
  slog('SIGTERM，正在退出');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
});
process.on('uncaughtException', (err) => {
  slog(`uncaughtException：${err && err.stack ? err.stack.split('\n').slice(0, 2).join(' | ') : err}`);
});
