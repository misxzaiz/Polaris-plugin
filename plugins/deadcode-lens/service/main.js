'use strict';
/**
 * main.js —— 死代码透视台后台服务（node ≥18，零外部依赖；引擎离线，数据不出本机）
 *
 * 职责：把「选中的项目根」变成一份死代码/依赖图谱体检报告。
 *   walk（fs vfs，跳 node_modules/dist…）→ shared/core 扫描（自研状态机解析器
 *   + 别名解析 + 可达性 + 消费链 + Tarjan 环检测）→ 报告 → cap.kv 投影（三端可看）。
 *
 * 架构（三方共享 cap.kv 同一事实库，dep-probe/stream-desk 同范式）：
 *   面板 ──(127.0.0.1 直连 + Bearer token，轮询进度)──▶ 本服务
 *   MCP  ──(kv 读 deadlens.meta 拿 port/token → 127.0.0.1 直连)──▶ 本服务
 *   本服务 ──(kvclient → 宿主 /api/router-dispatch → cap.kv)──▶ 宿主
 *
 * kv 键空间（全部 deadlens. 前缀，勿与他插件撞）：
 *   deadlens.meta            {port,token,pid,version,startedAt,live} 心跳 60s
 *   deadlens.settings        {recentRoots[], ignorePrefixes[]}
 *   deadlens.runs            扫描历史索引（cap 20）
 *   deadlens.latest          最近 runId
 *   deadlens.report.<runId>  完整报告投影（各列表按 core.CAPS 截断）
 *
 * 安全模型：
 *   - 仅监听 127.0.0.1；除 /__health 外全部要求 Authorization: Bearer <token>（timingSafe 比对）
 *   - 引擎离线：零外部网络请求；文件只读；唯一写盘 = 无（除 kv 投影）
 *   - 不执行任何系统命令；扫描根必须在文件系统内真实存在
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { createKvClient } = require('./kvclient');
const core = require('../shared/core');

const VERSION = core.VERSION;
const PORT = parseInt(process.argv[2] || '0', 10) || 0;
const appConfigDir = process.argv[3] || '';
const STARTED_AT = Date.now();
const META_BEAT_MS = 60_000;
const MAX_RUNS = 20;
const MAX_BODY = 1024 * 1024;
const KV_PREFIX = 'deadlens.';

// ── 日志（stderr；stdout 不承载业务）────────────────────────────────────────
function log(level, msg) {
  try { process.stderr.write(`[deadcode-lens-svc][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

const kv = createKvClient({ appConfigDir, log });

// ── token ───────────────────────────────────────────────────────────────────
const TOKEN = crypto.randomBytes(24).toString('hex');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ── 运行状态 ────────────────────────────────────────────────────────────────
const runs = new Map(); // runId → {id, status, progress, report, error, startedAt, finishedAt}
let latestRunId = null;
let lastModel = null;   // /api/why 用（保留最近一次扫描的图模型）

function newRun(root) {
  const id = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const run = {
    id, root, status: 'running', progress: { phase: '准备', done: 0, total: 0 },
    report: null, error: null, startedAt: Date.now(), finishedAt: null,
  };
  runs.set(id, run);
  latestRunId = id;
  return run;
}

/** 运行上限：内存里只留最近 MAX_RUNS 个（kv 侧同样 cap） */
function pruneRuns() {
  const ids = [...runs.keys()];
  while (ids.length > MAX_RUNS) {
    const old = ids.shift();
    if (old !== latestRunId) runs.delete(old);
  }
}

function runSummary(run) {
  return {
    id: run.id, root: run.root, status: run.status, progress: run.progress,
    error: run.error, startedAt: run.startedAt, finishedAt: run.finishedAt,
    counts: run.report ? run.report.counts : null,
    durationMs: run.report ? run.report.meta.durationMs : null,
  };
}

// ── 扫描编排 ────────────────────────────────────────────────────────────────
async function executeScan(run, opts) {
  const { entries = [], ignorePrefixes = [] } = opts;
  try {
    const rootAbs = path.resolve(run.root);
    const st = fs.statSync(rootAbs);
    if (!st.isDirectory()) throw new Error(`扫描根不是目录：${run.root}`);
    run.progress = { phase: '走查文件', done: 0, total: 0 };
    const { vfs, warnings } = core.makeFsVfs(rootAbs);
    for (const w of warnings) log('warn', w);
    run.progress = { phase: '解析依赖图', done: 0, total: vfs.files.size };
    // buildModel+analyze 是同步 CPU 活；让出事件循环以先返回 runId 给轮询方
    await new Promise((r) => setImmediate(r));
    // 与 core.scanVfs 同序（两遍分析：先定死文件集合再出终报），但保留 model 供 /api/why 查证据
    const model = core.buildModel({ vfs, root: rootAbs, extraEntries: entries });
    core.analyze(model, { ignorePrefixes });
    const report = core.analyze(model, { ignorePrefixes });
    report.warnings = [...warnings, ...report.warnings];
    run.report = report;
    run.status = 'done';
    run.progress = { phase: '完成', done: report.counts.files, total: report.counts.files };
    run.finishedAt = Date.now();
    lastModel = model;
    await projectRun(run);
    log('info', `扫描完成 ${run.id}: ${JSON.stringify(report.counts)} (${report.meta.durationMs}ms)`);
  } catch (e) {
    run.status = 'error';
    run.error = String((e && e.message) || e);
    run.finishedAt = Date.now();
    await projectRun(run);
    log('error', `扫描失败 ${run.id}: ${run.error}`);
  }
}

/** 报告投影到 kv（runs 索引 + latest + report.<id>） */
async function projectRun(run) {
  try {
    const entry = { id: run.id, root: run.root, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt, error: run.error, counts: run.report ? run.report.counts : null };
    const runsList = (await kv.kvGet(`${KV_PREFIX}runs`)) || [];
    const next = [entry, ...runsList.filter((x) => x.id !== run.id)].slice(0, MAX_RUNS);
    await kv.kvSet(`${KV_PREFIX}runs`, next);
    if (run.status === 'done') await kv.kvSet(`${KV_PREFIX}latest`, run.id);
    if (run.report) {
      await kv.kvSet(`${KV_PREFIX}report.${run.id}`, run.report);
      // 清理超出上限的旧报告（runs 索引之外的不留）
      const keep = new Set(next.map((x) => x.id));
      for (const key of await kv.kvKeys()) {
        if (key.startsWith(`${KV_PREFIX}report.`) && !keep.has(key.slice(KV_PREFIX.length + 7))) {
          await kv.kvDel(key);
        }
      }
    }
  } catch (e) {
    log('warn', `kv 投影失败（不阻塞扫描）: ${e.message}`);
  }
}

// ── /api/why：单个文件的完整证据 ────────────────────────────────────────────
function whyFile(rel) {
  if (!lastModel) return { error: '暂无缓存的扫描模型，请先扫描一次' };
  const p = core.toPosix(rel);
  const rec = lastModel.parsed.get(p);
  if (!rec) {
    const exists = lastModel.srcFiles.includes(p);
    return { error: exists ? `${p} 在扫描范围内但未解析（json？）` : `${p} 不在本次扫描范围内（根：${lastModel.root}）` };
  }
  const inbound = [];
  for (const [target, list] of lastModel.edges) {
    for (const e of list) {
      if (target !== p) continue;
      inbound.push({
        from: e.from, spec: e.spec, kind: e.kind, reachable: lastModel.reachable.has(e.from),
        names: (e.names || []).slice(0, 12).map((n) => n.imported),
        namespace: e.namespace, side: e.side, dynamic: e.dynamic, def: e.def || undefined,
      });
    }
  }
  const outbound = [...(lastModel.outMap.get(p) || [])];
  const exportsUsed = [];
  const exportsUnused = [];
  if (lastModel.consumed) {
    for (const ex of rec.exports) {
      if (ex.type === 'direct') {
        (lastModel.consumed.has(`${p}::${ex.name}`) ? exportsUsed : exportsUnused).push(ex.name);
      } else if (ex.type === 'reexport') exportsUsed.push(`${ex.name} → ${ex.from}${ex.importName === null ? ' (namespace)' : `.${ex.importName}`}`);
      else if (ex.type === 'reexport-all') exportsUsed.push(`* → ${ex.from}`);
    }
  }
  return {
    path: p,
    isEntry: lastModel.entries.has(p) ? lastModel.entries.get(p) : false,
    reachable: lastModel.reachable.has(p),
    globCovered: lastModel.globCovered.has(p),
    bytes: Buffer.byteLength(lastModel.vfs.files.get(p) || '', 'utf8'),
    importers: inbound.slice(0, 50),
    importerCount: inbound.length,
    imports: outbound.slice(0, 60),
    importsCount: outbound.length,
    exportsUsed, exportsUnused,
    verdict: !lastModel.reachable.has(p) && !lastModel.entries.has(p)
      ? (inbound.length === 0 ? '死文件（零引用）' : '死文件（仅被死文件引用）')
      : '可达',
  };
}

// ── HTTP 基建 ───────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('请求体超过 1MB 上限')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error(`请求体非 JSON: ${e.message}`)); }
    });
    req.on('error', reject);
  });
}

function authed(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return !!(m && safeEqual(m[1], TOKEN));
}

// ── 路由 ────────────────────────────────────────────────────────────────────
async function route(req, res, url) {
  const p = url.pathname;

  if (p === '/__health') { sendJson(res, 200, { ok: true, version: VERSION, live: true }); return; }
  if (!authed(req)) { sendJson(res, 401, { ok: false, error: '未授权' }); return; }

  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }

  // 设置
  if (p === '/api/settings' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, settings: (await kv.kvGet(`${KV_PREFIX}settings`)) || { recentRoots: [], ignorePrefixes: [] } });
    return;
  }
  if (p === '/api/settings' && req.method === 'POST') {
    const body = await readBody(req);
    const cur = (await kv.kvGet(`${KV_PREFIX}settings`)) || { recentRoots: [], ignorePrefixes: [] };
    if (typeof body.root === 'string' && body.root) {
      cur.recentRoots = [body.root, ...cur.recentRoots.filter((x) => x !== body.root)].slice(0, 8);
    }
    if (Array.isArray(body.ignorePrefixes)) {
      cur.ignorePrefixes = body.ignorePrefixes.filter((x) => typeof x === 'string' && x).slice(0, 50);
    }
    await kv.kvSet(`${KV_PREFIX}settings`, cur);
    sendJson(res, 200, { ok: true, settings: cur });
    return;
  }

  // 发起扫描
  if (p === '/api/scan' && req.method === 'POST') {
    const body = await readBody(req);
    const root = typeof body.root === 'string' ? body.root.trim() : '';
    if (!root) { sendJson(res, 400, { ok: false, error: '缺少 root（要扫描的项目根目录）' }); return; }
    if (runs.size >= MAX_RUNS * 2) {
      sendJson(res, 429, { ok: false, error: '运行过多，请稍后再试' });
      return;
    }
    const run = newRun(root);
    pruneRuns();
    const entries = Array.isArray(body.entries) ? body.entries.filter((x) => typeof x === 'string' && x).slice(0, 100) : [];
    const ignorePrefixes = Array.isArray(body.ignorePrefixes) ? body.ignorePrefixes.filter((x) => typeof x === 'string' && x).slice(0, 50) : [];
    executeScan(run, { entries, ignorePrefixes }).catch((e) => log('error', `executeScan 异常: ${e.message}`));
    sendJson(res, 202, { ok: true, runId: run.id });
    return;
  }

  // 进度
  const mRun = /^\/api\/run\/([\w-]+)$/.exec(p);
  if (mRun && req.method === 'GET') {
    const run = runs.get(mRun[1]);
    if (!run) { sendJson(res, 404, { ok: false, error: '运行不存在或服务已重启' }); return; }
    sendJson(res, 200, { ok: true, run: runSummary(run) });
    return;
  }

  // 报告
  const mReport = /^\/api\/report\/([\w-]+)$/.exec(p);
  if (mReport && req.method === 'GET') {
    const run = runs.get(mReport[1]);
    if (run && run.report) { sendJson(res, 200, { ok: true, report: run.report }); return; }
    const fromKv = await kv.kvGet(`${KV_PREFIX}report.${mReport[1]}`);
    if (fromKv) { sendJson(res, 200, { ok: true, report: fromKv }); return; }
    sendJson(res, 404, { ok: false, error: '报告不存在' });
    return;
  }

  if (p === '/api/latest' && req.method === 'GET') {
    const fromKv = await kv.kvGet(`${KV_PREFIX}latest`);
    sendJson(res, 200, { ok: true, runId: latestRunId || fromKv || null });
    return;
  }

  if (p === '/api/history' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, runs: (await kv.kvGet(`${KV_PREFIX}runs`)) || [], localRuns: [...runs.values()].map(runSummary) });
    return;
  }

  // 单文件证据
  if (p === '/api/why' && req.method === 'POST') {
    const body = await readBody(req);
    const rel = typeof body.path === 'string' ? body.path : '';
    if (!rel) { sendJson(res, 400, { ok: false, error: '缺少 path' }); return; }
    sendJson(res, 200, { ok: true, why: whyFile(rel) });
    return;
  }

  // 离线自检
  if (p === '/api/selftest' && req.method === 'POST') {
    sendJson(res, 200, { ok: true, selftest: core.selfTest() });
    return;
  }

  sendJson(res, 404, { ok: false, error: `未知路由 ${p}` });
}

// ── 服务器 ──────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  cors(res);
  let url;
  try { url = new URL(req.url, 'http://127.0.0.1'); } catch (_) { sendJson(res, 400, { ok: false, error: 'bad url' }); return; }
  route(req, res, url).catch((e) => {
    log('error', `路由异常 ${req.url}: ${e.message}`);
    try { sendJson(res, 500, { ok: false, error: e.message }); } catch (_) { /* 已响应 */ }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = server.address();
  log('info', `deadcode-lens service v${VERSION} listening on 127.0.0.1:${addr.port}`);
  kv.kvSet(`${KV_PREFIX}meta`, { port: addr.port, token: TOKEN, pid: process.pid, version: VERSION, startedAt: STARTED_AT, live: true })
    .then(() => log('info', 'meta 已写入 kv'))
    .catch((e) => log('warn', `meta 写入失败（离线模式？）: ${e.message}`));
});

const beat = setInterval(() => {
  const addr = server.address();
  if (!addr) return;
  kv.kvSet(`${KV_PREFIX}meta`, { port: addr.port, token: TOKEN, pid: process.pid, version: VERSION, startedAt: STARTED_AT, live: true })
    .catch((e) => log('warn', `meta 心跳失败: ${e.message}`));
}, META_BEAT_MS);
beat.unref();

process.on('SIGTERM', () => { try { server.close(); } catch (_) {} process.exit(0); });
process.on('SIGINT', () => { try { server.close(); } catch (_) {} process.exit(0); });
