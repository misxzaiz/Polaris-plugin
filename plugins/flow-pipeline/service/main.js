#!/usr/bin/env node
'use strict';
/**
 * main.js —— 自动化流水线后台服务（零依赖，node ≥ 18）
 *
 * 职责（骨架语义对齐 repo-lens / task-runner service 主题）：
 *   - HTTP 服务 127.0.0.1:{{port}}，除 /__health 外全 Bearer token（timingSafe）
 *   - tick 1s：interval/daily 触发到点入队；启动补跑一次（missed，不回放积压）
 *   - POST /hook/:plId：webhook 触发（管道级 token，12 次/分钟限流）
 *   - 运行执行全部委托 runner（队列并发=1）；本文件只做存储/调度/REST
 *   - meta 心跳 60s 投影 cap.kv（面板/MCP 发现入口）；桥不可达降级 meta.degraded
 *
 * kv 键空间（flowpipe. 前缀，勿与他插件撞）：
 *   flowpipe.meta         {port,token,pid,version,startedAt,live,degraded} 心跳 60s
 *   flowpipe.index        [plId] 管道 id 有序列表
 *   flowpipe.pl.<id>      管道完整定义（含 webhook token / vars）
 *   flowpipe.runs.<plId>  最近 30 条运行记录（掩码后）
 *   flowpipe.runIndex     最近 100 条跨管道运行索引（runId 反查用）
 *   flowpipe.settings     {providers, aiTimeoutSec, webhookEnabled}
 *   flowpipe.sched        {<plId>:{lastAutoRun,lastDaily}} 调度水位
 *
 * 生命周期由宿主 PluginServiceManager 管理。启动参数：node main.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const engine = require('../shared/engine');
const { createKvClient } = require('./kvclient');
const { createRunner } = require('./runner');
const steps = require('./steps');
const { findHostConfigFile, mapHostProfiles } = require('./host-import');

const VERSION = '0.1.0';
const TICK_MS = 1000;
const META_BEAT_MS = 60 * 1000;
const RUN_INDEX_CAP = 100;
const WEBHOOK_RATE = { max: 12, windowMs: 60 * 1000 };

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘 + 512KB 轮转）─────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'flow-pipeline.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.writeFileSync(logFile, '');
    } catch (_) { /* 首次无文件 */ }
  } catch (_) {
    logFile = null;
  }
}

function log(level, msg) {
  const line = `[${new Date().toISOString()}][flow-pipeline][${level}] ${msg}`;
  if (level === 'error') {
    try { process.stderr.write(line + '\n'); } catch (_) { /* 忽略 */ }
  }
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 忽略 */ }
  }
}

// ── 启动参数与鉴权 ───────────────────────────────────────────────────────────
const PORT = Number(process.argv[2]) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';
if (!PORT) {
  process.stderr.write('[flow-pipeline] 用法：node main.js <port> <appConfigDir>\n');
  process.exit(2);
}
initLog(APP_CONFIG_DIR);

const token = crypto.randomBytes(32).toString('hex');
function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ── kv 桥与存储 ──────────────────────────────────────────────────────────────
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
let degraded = false; // 宿主 kv 桥不可达 = 服务仍可用但配置不投影

const K = {
  meta: 'flowpipe.meta',
  index: 'flowpipe.index',
  pl: (id) => `flowpipe.pl.${id}`,
  runs: (plId) => `flowpipe.runs.${plId}`,
  runIndex: 'flowpipe.runIndex',
  settings: 'flowpipe.settings',
  sched: 'flowpipe.sched',
};

// 缓存：本服务是这些键的唯一写者；桥断时面板/MCP 仍可读缓存（降级只读）
const pipelines = new Map(); // id → def
let settings = { providers: [], aiTimeoutSec: 120, webhookEnabled: true };
let sched = {}; // plId → {lastAutoRun, lastDaily}

async function kvSetSafe(key, value) {
  await kv.kvSet(key, value);
  degraded = false;
}

async function loadAll() {
  try {
    const idx = (await kv.kvGet(K.index)) || [];
    const defs = await Promise.all(idx.map((id) => kv.kvGet(K.pl(id))));
    pipelines.clear();
    for (const d of defs) {
      if (d && d.id) pipelines.set(d.id, d);
    }
    const s = await kv.kvGet(K.settings);
    if (s && typeof s === 'object') settings = { providers: [], aiTimeoutSec: 120, webhookEnabled: true, ...s };
    sched = (await kv.kvGet(K.sched)) || {};
    degraded = false;
    log('info', `已加载 ${pipelines.size} 条流水线（providers ${settings.providers.length}）`);
    return true;
  } catch (e) {
    degraded = true;
    log('warn', `kv 桥不可达，降级只读模式：${e.message}`);
    return false;
  }
}

async function savePipeline(def) {
  pipelines.set(def.id, def);
  const idx = [...pipelines.keys()];
  await kvSetSafe(K.index, idx);
  await kvSetSafe(K.pl(def.id), def);
}

async function persistSettings() {
  await kvSetSafe(K.settings, settings);
}

async function persistSched() {
  try {
    await kvSetSafe(K.sched, sched);
  } catch (e) {
    log('warn', `调度水位落盘失败：${e.message}`);
  }
}

// ── 运行器 ───────────────────────────────────────────────────────────────────
const runner = createRunner({
  kv,
  getSettings: () => settings,
  getProviders: () => settings.providers || [],
  appConfigDir: APP_CONFIG_DIR,
  log,
  onRunUpdate: (summary) => {
    // 跨管道运行索引（runId 反查）；尽力而为
    (async () => {
      const list = ((await kv.kvGet(K.runIndex)) || []).filter((r) => r && r.id !== summary.id);
      list.unshift(summary);
      await kv.kvSet(K.runIndex, list.slice(0, RUN_INDEX_CAP));
    })().catch((e) => log('warn', `runIndex 更新失败：${e.message}`));
  },
});

// ── 掩码/还原 ────────────────────────────────────────────────────────────────
function maskPipeline(def) {
  const clone = JSON.parse(JSON.stringify(def));
  for (const name of clone.secrets || []) {
    const v = clone.vars && clone.vars[name];
    if (typeof v === 'string' && v) clone.vars[name] = engine.MASK;
  }
  return clone;
}

function unmaskPipeline(incoming, existing) {
  const out = JSON.parse(JSON.stringify(incoming));
  if (existing) {
    for (const name of out.secrets || []) {
      if (out.vars && out.vars[name] === engine.MASK && existing.vars && existing.vars[name] !== undefined) {
        out.vars[name] = existing.vars[name];
      }
    }
    // webhook token 不经表单回传：请求未带则保留旧值
    if (out.trigger && out.trigger.type === 'webhook' && !out.trigger.token && existing.trigger && existing.trigger.token) {
      out.trigger.token = existing.trigger.token;
    }
    out.createdAt = existing.createdAt;
  }
  return out;
}

function maskSettings(s) {
  const clone = JSON.parse(JSON.stringify(s));
  clone.providers = (clone.providers || []).map((p) => ({ ...p, apiKey: p.apiKey ? engine.MASK : '' }));
  return clone;
}

function mergeSettings(incoming) {
  const old = settings;
  const next = {
    aiTimeoutSec: Math.max(5, Math.min(600, Number(incoming.aiTimeoutSec) || 120)),
    webhookEnabled: incoming.webhookEnabled !== false,
    providers: (Array.isArray(incoming.providers) ? incoming.providers : []).map((p) => {
      if (p && p.apiKey === engine.MASK) {
        const prev = (old.providers || []).find((x) => x.id === p.id);
        return prev ? { ...p, apiKey: prev.apiKey } : { ...p, apiKey: '' };
      }
      return p;
    }).filter((p) => p && p.id && p.name),
  };
  settings = next;
  return persistSettings();
}

// ── 调度（interval / daily，错过补跑一次）────────────────────────────────────
function parseAtHM(at) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(at || ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localNowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function ensureSched(plId, trigger) {
  if (!sched[plId]) sched[plId] = {};
  const s = sched[plId];
  if (trigger.type === 'interval' && !s.lastAutoRun) {
    s.lastAutoRun = new Date().toISOString(); // 首装从现在起算，避免装完立刻风暴
  }
  return s;
}

/** 到期检查；bootMissed=true 时做启动补跑判定（错过只补一次） */
function duePipelines(now, { bootMissed } = {}) {
  const due = [];
  for (const pl of pipelines.values()) {
    if (!pl.enabled) continue;
    const tg = pl.trigger || { type: 'manual' };
    if (tg.type !== 'interval' && tg.type !== 'daily') continue;
    const s = ensureSched(pl.id, tg);
    if (tg.type === 'interval') {
      const everyMs = Math.max(5, Number(tg.everyMinutes) || 5) * 60 * 1000;
      const last = s.lastAutoRun ? Date.parse(s.lastAutoRun) : 0;
      if (bootMissed) {
        // 服务停摆期间错过的：只补一次（超出一个周期即视为错过）
        if (last && now - last > everyMs * 2 - 1000) due.push({ pl, missed: true });
        s.lastAutoRun = new Date(now).toISOString();
      } else if (!last || now - last >= everyMs) {
        due.push({ pl, missed: false });
        s.lastAutoRun = new Date(now).toISOString();
      }
    } else if (tg.type === 'daily') {
      const atMin = parseAtHM(tg.at);
      const today = localToday();
      if (atMin === null) continue;
      if (bootMissed) {
        if (s.lastDaily !== today && localNowMinutes() >= atMin) due.push({ pl, missed: true });
        s.lastDaily = today;
      } else if (s.lastDaily !== today && localNowMinutes() >= atMin) {
        due.push({ pl, missed: false });
        s.lastDaily = today;
      }
    }
  }
  return due;
}

function tick(bootMissed) {
  try {
    const due = duePipelines(Date.now(), { bootMissed });
    for (const { pl, missed } of due) {
      runner.enqueue(pl, 'schedule', {}, { missed });
    }
    if (due.length) persistSched();
  } catch (e) {
    log('warn', `tick 异常：${e.message}`);
  }
}

// ── REST 工具 ────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-FlowPipe-Token',
  'Access-Control-Max-Age': '86400',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(body);
}

function readJsonBody(req, capBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > (capBytes || 1024 * 1024)) {
        req.destroy();
        reject(new Error(`请求体超过 ${Math.round((capBytes || 1048576) / 1024)}KB 上限`));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function listPipelines() {
  const out = [];
  for (const def of pipelines.values()) {
    let lastRun = null;
    try {
      const runs = (await kv.kvGet(K.runs(def.id))) || [];
      const r = runs && runs[0];
      if (r) lastRun = { id: r.id, status: r.status, startedAt: r.startedAt, durationMs: r.durationMs, trigger: r.trigger };
    } catch (_) { /* 降级时无历史 */ }
    out.push({
      id: def.id,
      name: def.name,
      enabled: def.enabled,
      trigger: def.trigger,
      allowLocal: def.allowLocal,
      steps: (def.steps || []).length,
      hasWebhook: def.trigger && def.trigger.type === 'webhook',
      lastRun,
    });
  }
  return out;
}

async function runIndexLookup(runId) {
  const idx = (await kv.kvGet(K.runIndex)) || [];
  return idx.find((r) => r && r.id === runId) || null;
}

// ── webhook 触发 ─────────────────────────────────────────────────────────────
const webhookHits = new Map(); // plId → [ts]
function rateLimited(plId) {
  const nowTs = Date.now();
  const arr = (webhookHits.get(plId) || []).filter((t) => nowTs - t < WEBHOOK_RATE.windowMs);
  arr.push(nowTs);
  webhookHits.set(plId, arr);
  return arr.length > WEBHOOK_RATE.max;
}

async function handleHook(req, res, plId, urlObj) {
  const def = pipelines.get(plId);
  if (!def) return sendJson(res, 404, { ok: false, error: `流水线 ${plId} 不存在` });
  if (!settings.webhookEnabled) return sendJson(res, 409, { ok: false, error: 'webhook 触发已在设置中关闭' });
  const tg = def.trigger || {};
  if (tg.type !== 'webhook') return sendJson(res, 409, { ok: false, error: '该流水线的触发器不是 webhook' });
  const given = req.headers['x-flowpipe-token'] || urlObj.searchParams.get('token') || '';
  if (!given || !timingSafeEq(String(given), String(tg.token || ''))) {
    return sendJson(res, 401, { ok: false, error: 'webhook token 不匹配' });
  }
  if (rateLimited(plId)) {
    return sendJson(res, 429, { ok: false, error: `触发过于频繁（> ${WEBHOOK_RATE.max} 次/分钟）` });
  }
  const query = {};
  urlObj.searchParams.forEach((v, k) => { query[k] = v; });
  let body = null;
  const chunks = [];
  let size = 0;
  await new Promise((resolve) => {
    req.on('data', (c) => {
      size += c.length;
      if (size > 256 * 1024) { resolve(); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', resolve);
    req.on('error', resolve);
  });
  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch (_) {
      body = rawBody;
    }
  }
  if (!def.enabled) return sendJson(res, 409, { ok: false, error: '流水线已停用（enabled=false）' });
  const runId = runner.enqueue(def, 'webhook', { query, body });
  sendJson(res, 202, { ok: true, runId, status: 'queued' });
}

// ── 路由 ─────────────────────────────────────────────────────────────────────
async function route(req, res) {
  const urlObj = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = urlObj.pathname;

  if (p === '/__health') return sendJson(res, 200, { ok: true, version: VERSION, degraded, pipelines: pipelines.size });

  // OPTIONS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  // webhook 入口（自带管道级 token，不走 Bearer）——必须在 Bearer 鉴权之前
  if (req.method === 'POST' && /^\/hook\/[A-Za-z0-9_]+$/.test(p)) {
    return handleHook(req, res, p.slice('/hook/'.length), urlObj);
  }

  const auth = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m || !timingSafeEq(m[1], token)) {
    return sendJson(res, 401, { ok: false, error: '未授权（Bearer token 不匹配）' });
  }

  if (req.method === 'GET' && p === '/api/pipelines') {
    return sendJson(res, 200, { ok: true, pipelines: await listPipelines(), degraded });
  }

  if (req.method === 'POST' && p === '/api/pipelines') {
    const body = await readJsonBody(req);
    const v = engine.validatePipeline(body.pipeline || body);
    if (!v.ok) return sendJson(res, 400, { ok: false, error: '流水线定义校验失败', errors: v.errors });
    const def = engine.finalizePipeline(v.def);
    await savePipeline(def);
    log('info', `新建流水线 ${def.name}（${def.id}）`);
    return sendJson(res, 201, { ok: true, pipeline: maskPipeline(def) });
  }

  const plMatch = /^\/api\/pipelines\/([A-Za-z0-9_]+)$/.exec(p);
  if (plMatch) {
    const id = plMatch[1];
    const def = pipelines.get(id);
    if (req.method === 'GET') {
      if (!def) return sendJson(res, 404, { ok: false, error: `流水线 ${id} 不存在` });
      const runs = (await kv.kvGet(K.runs(id))) || [];
      return sendJson(res, 200, { ok: true, pipeline: maskPipeline(def), runs: runs.slice(0, 10) });
    }
    if (req.method === 'PUT') {
      if (!def) return sendJson(res, 404, { ok: false, error: `流水线 ${id} 不存在` });
      const body = await readJsonBody(req);
      const merged = unmaskPipeline(body.pipeline || body, def);
      const v = engine.validatePipeline(merged);
      if (!v.ok) return sendJson(res, 400, { ok: false, error: '流水线定义校验失败', errors: v.errors });
      const next = engine.finalizePipeline({ ...v.def, id, trigger: { ...v.def.trigger } });
      if (next.trigger.type === 'webhook' && def.trigger && def.trigger.type === 'webhook' && def.trigger.token) {
        next.trigger.token = def.trigger.token; // 编辑保留原 token
      }
      await savePipeline(next);
      return sendJson(res, 200, { ok: true, pipeline: maskPipeline(next) });
    }
    if (req.method === 'DELETE') {
      if (!def) return sendJson(res, 404, { ok: false, error: `流水线 ${id} 不存在` });
      const confirm = urlObj.searchParams.get('confirm') || '';
      if (confirm !== def.name) {
        return sendJson(res, 400, { ok: false, error: `删除需确认：confirm 参数须为流水线名称「${def.name}」` });
      }
      pipelines.delete(id);
      delete sched[id];
      await kvSetSafe(K.index, [...pipelines.keys()]);
      await kv.kvDel(K.pl(id));
      await kv.kvDel(K.runs(id)).catch(() => {});
      await persistSched();
      log('info', `删除流水线 ${def.name}（${id}）`);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && urlObj.pathname.endsWith('/run') === false) {
      // fallthrough（run 路由在下面单独匹配）
    }
  }

  const runMatch = /^\/api\/pipelines\/([A-Za-z0-9_]+)\/run$/.exec(p);
  if (req.method === 'POST' && runMatch) {
    const def = pipelines.get(runMatch[1]);
    if (!def) return sendJson(res, 404, { ok: false, error: `流水线 ${runMatch[1]} 不存在` });
    const body = await readJsonBody(req, 256 * 1024);
    const params = body && typeof body.params === 'object' && body.params !== null ? body.params : {};
    const runId = runner.enqueue(def, 'manual', params);
    return sendJson(res, 202, { ok: true, runId, status: 'queued' });
  }

  if (req.method === 'GET' && p === '/api/runs') {
    const plId = urlObj.searchParams.get('plId') || '';
    const limit = Math.max(1, Math.min(30, Number(urlObj.searchParams.get('limit')) || 10));
    if (plId) {
      const runs = (await kv.kvGet(K.runs(plId))) || [];
      return sendJson(res, 200, { ok: true, runs: runs.slice(0, limit) });
    }
    const idx = (await kv.kvGet(K.runIndex)) || [];
    return sendJson(res, 200, { ok: true, runs: idx.slice(0, limit) });
  }

  const runIdMatch = /^\/api\/runs\/([A-Za-z0-9_]+)$/.exec(p);
  if (req.method === 'GET' && runIdMatch) {
    const runId = runIdMatch[1];
    const entry = await runIndexLookup(runId);
    const plId = entry ? entry.plId : urlObj.searchParams.get('plId') || '';
    if (!plId) return sendJson(res, 404, { ok: false, error: `运行 ${runId} 不在索引中（可带 ?plId= 直查）` });
    const runs = (await kv.kvGet(K.runs(plId))) || [];
    const run = runs.find((r) => r.id === runId);
    if (!run) return sendJson(res, 404, { ok: false, error: `运行 ${runId} 不存在或已被滚动清理` });
    return sendJson(res, 200, { ok: true, run });
  }

  const stopMatch = /^\/api\/runs\/([A-Za-z0-9_]+)\/stop$/.exec(p);
  if (req.method === 'POST' && stopMatch) {
    const ok = runner.requestStop(stopMatch[1]);
    return sendJson(res, ok ? 200 : 409, ok ? { ok: true, stopped: stopMatch[1] } : { ok: false, error: '运行不在进行中（已结束或不属于本服务）' });
  }

  if (req.method === 'GET' && p === '/api/settings') {
    return sendJson(res, 200, { ok: true, settings: maskSettings(settings), degraded });
  }
  if (req.method === 'PUT' && p === '/api/settings') {
    const body = await readJsonBody(req);
    await mergeSettings(body.settings || body);
    return sendJson(res, 200, { ok: true, settings: maskSettings(settings) });
  }
  if (req.method === 'POST' && p === '/api/settings/import-host') {
    const body = await readJsonBody(req);
    const found = findHostConfigFile(APP_CONFIG_DIR);
    if (!found) return sendJson(res, 404, { ok: false, error: '找不到宿主配置文件（anchor.json → config.json 链路）' });
    const mapped = mapHostProfiles(found.root, settings.providers || []);
    if (body.dryRun) {
      return sendJson(res, 200, {
        ok: true,
        dryRun: true,
        imported: mapped.imported,
        preview: mapped.providers.map((x) => ({ id: x.id, name: x.name, hostId: x.hostId, model: x.model, baseUrl: x.baseUrl, wire: x.wire })),
      });
    }
    settings.providers = mapped.providers;
    await persistSettings();
    log('info', `从宿主导入 ${mapped.imported} 个 AI 供应商`);
    return sendJson(res, 200, { ok: true, imported: mapped.imported, settings: maskSettings(settings) });
  }

  if (req.method === 'POST' && p === '/api/selftest') {
    const fence = steps.selfTestFence();
    const fencePass = fence.every((c) => c.pass);
    // 引擎回归：插值/校验/表达式各跑一条
    const ctxT = { vars: { a: 'x' }, steps: { s: { v: 1 } }, params: {}, env: { today: 't' } };
    const engineOk =
      engine.resolveTemplate('{{a}}-{{s.v}}', ctxT).value === 'x-1' &&
      engine.validatePipeline({ name: 'st', steps: [{ type: 'template', text: 'a', saveAs: 'o' }] }).ok === true &&
      engine.evaluateExpr('{{s.v}} == 1', ctxT) === true;
    let bridgeOk = true;
    try {
      await kv.kvGet(K.settings);
    } catch (_) {
      bridgeOk = false;
    }
    const roots = steps.fileRoots(APP_CONFIG_DIR);
    const writable = roots.map((r) => {
      try {
        fs.mkdirSync(r, { recursive: true });
        const probe = path.join(r, `.flowpipe-probe-${process.pid}`);
        fs.writeFileSync(probe, 'x');
        fs.unlinkSync(probe);
        return { root: r, ok: true };
      } catch (e) {
        return { root: r, ok: false, error: e.message };
      }
    });
    const allOk = fencePass && engineOk && bridgeOk && writable.every((w) => w.ok);
    return sendJson(res, 200, {
      ok: allOk,
      version: VERSION,
      degraded,
      checks: { fence, fencePass, engineOk, bridgeOk, writable, runnerIdle: runner.isIdle() },
    });
  }

  sendJson(res, 404, { ok: false, error: `未知路由：${req.method} ${p}（cap.help 或 README 见 API 列表）` });
}

// ── HTTP 服务器 ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    log('error', `请求处理异常 ${req.method} ${req.url}：${e.message}`);
    try {
      sendJson(res, 500, { ok: false, error: `服务内部错误：${e.message}` });
    } catch (_) { /* 连接已断 */ }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  log('info', `自动化流水线服务就绪 127.0.0.1:${PORT}（版本 ${VERSION}）`);
});

// ── 心跳与主循环 ─────────────────────────────────────────────────────────────
async function beatMeta() {
  const meta = {
    port: PORT,
    token,
    pid: process.pid,
    version: VERSION,
    startedAt: new Date().toISOString(),
    live: true,
    degraded,
    pipelines: pipelines.size,
  };
  try {
    await kv.kvSet(K.meta, meta);
    if (degraded) await loadAll(); // 桥恢复时自动重载配置
  } catch (e) {
    degraded = true;
    log('warn', `meta 心跳失败（降级）：${e.message}`);
  }
}

(async () => {
  await loadAll();
  // 启动补跑判定：错过的 interval/daily 只补一次
  tick(true);
  await persistSched();
  await beatMeta();
  setInterval(() => tick(false), TICK_MS);
  setInterval(beatMeta, META_BEAT_MS);
})();

process.on('uncaughtException', (e) => log('error', `uncaughtException：${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log('error', `unhandledRejection：${(e && e.stack) || e}`));
