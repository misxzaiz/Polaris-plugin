#!/usr/bin/env node
'use strict';
/**
 * main.js —— 进程透视台后台服务（零依赖，node >= 18，Windows 专用）
 *
 * 职责：
 *   - HTTP 数据面（127.0.0.1 动态端口）：端口归属 / 文件占用 / 进程全景 / 护栏 kill / 审计
 *   - 心跳（30s）写 kv `pdesk.meta`：面板与 MCP 据此发现服务端口
 *   - 审计环 `pdesk.audit`：单键、上限 120 条、服务是唯一写者；bridge 降级时内存兜底
 *
 * 安全边界：
 *   - 只绑 127.0.0.1；Host 头白名单（防 DNS rebinding）；强制 x-pdesk-client 头
 *     （浏览器跨源调用必触发 CORS 预检，天然防 drive-by 表单 POST）
 *   - kill 两阶段（arm 发令牌 → fire 持令牌），fire 前重新核对进程名（防 PID 复用）
 *   - 护栏决策唯一权威在 shared/core.js::evaluateKill，本文件不得绕过
 *
 * 生命周期由宿主 PluginServiceManager 管理。启动参数：node main.js <port> <appConfigDir>
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const core = require('../shared/core');
const ps = require('./ps');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const HEARTBEAT_MS = 30 * 1000;
const ANCESTOR_REFRESH_MS = 5 * 60 * 1000;
const ARM_TTL_MS = 120 * 1000;
const AUDIT_CAP = 120;
const BODY_LIMIT = 64 * 1024;

const K = { meta: 'pdesk.meta', audit: 'pdesk.audit' };

const PORT = Number.parseInt(process.argv[2] || '0', 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘 + 512KB 轮转）─────────────
let logFile = null;
function initLog() {
  const dir = APP_CONFIG_DIR || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'process-desk.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
function log(level, msg) {
  const line = `[process-desk:${level}] ${new Date().toISOString()} ${msg}`;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, `${line}\n`); } catch (_) { /* 日志失败不影响业务 */ }
  }
}

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => log(l, m) });

// ── 运行态 ──────────────────────────────────────────────────────────────────
const startedAt = Date.now();
let degraded = false;
let auditItems = [];              // 权威内存副本；kv 是镜像
let ancestorPids = [];            // 服务自身→宿主的祖先链（结构性保护）
let lastAncestorAt = 0;
let totalKills = 0;
/** token → { pid, name, path, cmd, at } */
const armedTokens = new Map();
let heartbeatTimer = null;

function metaPayload() {
  return {
    version: VERSION,
    pid: process.pid,
    port: serverAddress || 0,
    platform: process.platform,
    psOk: ps.isWindows(),
    startedAt,
    lastTickAt: Date.now(),
    totalKills,
  };
}

async function writeHeartbeat() {
  try {
    await kv.kvSet(K.meta, metaPayload());
    if (degraded) { degraded = false; log('info', 'bridge 已恢复'); }
  } catch (e) {
    degraded = true;
    log('warn', `心跳失败（降级，功能不受影响，仅 kv 投影停更）: ${e.message}`);
  }
}

async function mirrorAudit() {
  try { await kv.kvSet(K.audit, { items: auditItems }); } catch (_) { /* 降级时内存兜底 */ }
}

/** op 记审计（查询类不记，只记 arm/fire/refusal/clear 这类「动作」） */
function audit(op, detail, outcome) {
  auditItems = core.auditPush(auditItems, { at: Date.now(), op, detail, outcome }, AUDIT_CAP);
  void mirrorAudit();
}

// ── 祖先链（保护在跑的 Polaris）────────────────────────────────────────────
async function refreshAncestors() {
  if (Date.now() - lastAncestorAt < ANCESTOR_REFRESH_MS && ancestorPids.length) return;
  lastAncestorAt = Date.now();
  try {
    const all = await ps.listProcs(null, 30000);
    const byPid = new Map(all.map((p) => [p.pid, p]));
    const chain = [];
    let cur = process.pid;
    for (let hop = 0; hop < 12; hop++) {
      const p = byPid.get(cur);
      if (!p || !p.ppid || p.ppid <= 4) break;
      chain.push(p.ppid);
      cur = p.ppid;
    }
    ancestorPids = chain;
    log('info', `祖先链: [${chain.join(' < ')}]`);
  } catch (e) {
    log('warn', `祖先链计算失败（护栏仍保留 self 检查）: ${e.message}`);
  }
}

// ── HTTP 基础设施 ───────────────────────────────────────────────────────────
let serverAddress = 0;
const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    log('error', `handle 异常: ${e.stack || e.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    try { res.end(JSON.stringify({ ok: false, error: '内部错误' })); } catch (_) { /* 已断开 */ }
  });
});

const CORS_ORIGIN_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
const TAURI_ORIGINS = new Set(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']);

function corsHeaders(req) {
  const origin = String(req.headers.origin || '');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-pdesk-client',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if ((origin && CORS_ORIGIN_RE.test(origin)) || TAURI_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function sendJson(req, res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(req),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new Error('body 过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** POST JSON body → 对象；非法则 null */
async function readJsonBody(req) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json')) return null;
  const raw = await readBody(req);
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch (_) {
    return null;
  }
}

function hostAllowed(req) {
  const h = String(req.headers.host || '');
  return h === `127.0.0.1:${serverAddress}` || h === `localhost:${serverAddress}` || h === `[::1]:${serverAddress}`;
}

// ── 业务实现 ────────────────────────────────────────────────────────────────

async function enrichByPids(pids) {
  const uniq = [...new Set(pids.filter((n) => Number.isInteger(n) && n > 0))];
  if (!uniq.length) return new Map();
  const rows = await ps.listProcs(uniq);
  return new Map(rows.map((p) => [p.pid, p]));
}

/** 端口归属：netstat → 本地端口过滤 → 进程富化 */
async function opPortQuery(args) {
  const port = core.validatePort(args && args.port);
  if (!port) return { ok: false, error: '端口号必须是 1-65535 的整数' };
  const text = await runNetstat();
  const rows = core.filterByPort(core.parseNetstat(text), port);
  const procs = await enrichByPids(rows.map((r) => r.pid));
  const entries = rows.map((r) => ({ row: r, proc: procs.get(r.pid) || null }));
  audit('port_query', { port }, `命中 ${entries.length} 条连接`);
  return { ok: true, port, entries, found: entries.length > 0 };
}

/** 监听全景：TCP LISTENING + 全部 UDP */
async function opListening() {
  const text = await runNetstat();
  const rows = core.parseNetstat(text).filter((r) => (r.proto === 'TCP' && r.state === 'LISTENING') || r.proto === 'UDP');
  const procs = await enrichByPids(rows.map((r) => r.pid));
  const entries = rows
    .map((r) => ({ row: r, proc: procs.get(r.pid) || null }))
    .sort((a, b) => a.row.local.port - b.row.local.port);
  return { ok: true, entries };
}

function runNetstat() {
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process');
    const netstat = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'netstat.exe');
    // 不带 -p：一次拿全 TCP+UDP（-p tcp 会漏 UDP 监听行）
    execFile(netstat, ['-ano'], { timeout: 15000, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) { reject(new Error(`netstat 执行失败: ${err.message}`)); return; }
      resolve(String(stdout || ''));
    });
  });
}

async function opProcList(args) {
  const all = await ps.listProcs(null, 40000);
  const filter = String((args && args.filter) || '').toLowerCase().trim();
  let rows = all;
  if (filter) {
    rows = all.filter((p) => p.name.toLowerCase().includes(filter)
      || (p.cmd || '').toLowerCase().includes(filter)
      || String(p.pid) === filter);
  }
  const sort = String((args && args.sort) || 'mem');
  const cmp = {
    mem: (a, b) => (b.ws || 0) - (a.ws || 0),
    cpu: (a, b) => (b.cpu || 0) - (a.cpu || 0),
    pid: (a, b) => a.pid - b.pid,
    name: (a, b) => a.name.localeCompare(b.name) || a.pid - b.pid,
  }[sort] || ((a, b) => (b.ws || 0) - (a.ws || 0));
  rows.sort(cmp);
  let top = Number((args && args.top) || 200);
  if (!Number.isInteger(top) || top < 1) top = 200;
  top = Math.min(top, 500);
  // 同名多实例计数（本插件的目标场景：僵尸/重复实例一眼可见）
  const nameCount = new Map();
  for (const p of rows) nameCount.set(p.name.toLowerCase(), (nameCount.get(p.name.toLowerCase()) || 0) + 1);
  const out = rows.slice(0, top).map((p) => ({
    ...p,
    instances: nameCount.get(p.name.toLowerCase()) || 1,
    polaris: core.isPolarisProc(p.name, p.path),
  }));
  return { ok: true, total: all.length, matched: rows.length, top, rows: out };
}

async function opProcDetail(args) {
  const pid = Number(args && args.pid);
  if (!Number.isInteger(pid) || pid <= 0) return { ok: false, error: 'pid 必须是正整数' };
  const rows = await ps.listProcs([pid]);
  if (!rows.length) return { ok: true, found: false, proc: null };
  const p = rows[0];
  return {
    ok: true,
    found: true,
    proc: { ...p, instances: rows.length, polaris: core.isPolarisProc(p.name, p.path) },
  };
}

async function opFileLock(args) {
  const p = args && typeof args.path === 'string' ? args.path.trim() : '';
  if (!core.looksAbsolutePath(p)) return { ok: false, error: '需要本机绝对路径（如 D:\\space\\x.zip 或 C:\\Users\\…）' };
  const r = await ps.findLockers(p);
  const procs = await enrichByPids(r.lockers.map((l) => l.pid));
  const lockers = r.lockers.map((l) => ({ ...l, proc: procs.get(l.pid) || null }));
  audit('file_lock', { path: p }, r.error ? `错误: ${r.error}` : (lockers.length ? `占用者 ${lockers.length} 个` : '未发现占用'));
  return {
    ok: true,
    path: p,
    locked: r.locked,
    lockers,
    error: r.error,
    hint: r.error ? 'Restart Manager 无法完整列出系统级占用（如驱动/杀软内核句柄），可尝试资源监视器核实' : null,
  };
}

/** arm：取 kill 令牌（护栏评估在这里做第一次；fire 会再做一次并核对 PID 复用） */
async function opKillArm(args) {
  const pid = Number(args && args.pid);
  if (!Number.isInteger(pid) || pid <= 0) return { ok: false, error: 'pid 必须是正整数' };
  await refreshAncestors();
  const rows = await ps.listProcs([pid]);
  if (!rows.length) return { ok: false, error: `进程 ${pid} 不存在（可能已退出）` };
  const proc = rows[0];
  const decision = core.evaluateKill({
    pid, name: proc.name, path: proc.path, cmd: proc.cmd,
    selfPid: process.pid, ancestorPids: ancestorPids, allowProtected: false,
  });
  if (!decision.allowed && decision.code !== 'polaris_confirm') {
    audit('kill_refused', { pid, name: proc.name }, decision.message);
    return { ok: false, error: decision.message, code: decision.code };
  }
  const token = crypto.randomBytes(16).toString('hex');
  armedTokens.set(token, { pid, name: proc.name, path: proc.path, cmd: proc.cmd, at: Date.now() });
  audit('kill_arm', { pid, name: proc.name }, decision.allowed ? '已发令牌' : '已发令牌（需 allowProtected 二次确认）');
  return {
    ok: true,
    token,
    expiresAt: Date.now() + ARM_TTL_MS,
    proc,
    needAllowProtected: decision.code === 'polaris_confirm',
    warnings: decision.warnings,
  };
}

/** fire：持令牌执行 kill（重新查进程核对名字，防 PID 复用误杀） */
async function opKillFire(args) {
  const pid = Number(args && args.pid);
  const token = String((args && args.token) || '');
  const treeKill = (args && args.treeKill) === true;
  const allowProtected = (args && args.allowProtected) === true;
  if (!Number.isInteger(pid) || pid <= 0 || !token) return { ok: false, error: '缺少 pid 或 token' };
  const armed = armedTokens.get(token);
  if (!armed || armed.pid !== pid) return { ok: false, error: '令牌无效或与 pid 不匹配（请重新发起）' };
  if (Date.now() - armed.at > ARM_TTL_MS) {
    armedTokens.delete(token);
    return { ok: false, error: '令牌已过期（120 秒有效），请重新发起' };
  }
  await refreshAncestors();
  // PID 复用防护：重新查询，进程必须还存在且名字与 arm 时一致
  const rows = await ps.listProcs([pid]);
  if (!rows.length) {
    armedTokens.delete(token);
    audit('kill_aborted', { pid, name: armed.name }, '进程已不存在（可能自然退出，无需杀）');
    return { ok: false, error: `进程 ${pid} 已不存在（可能刚好自己退出了）`, code: 'gone' };
  }
  const proc = rows[0];
  if (core.normalizeName(proc.name) !== core.normalizeName(armed.name)) {
    armedTokens.delete(token);
    audit('kill_refused', { pid, name: proc.name }, `PID 复用嫌疑：arm 时是 ${armed.name}，现在是 ${proc.name}`);
    return { ok: false, error: `PID ${pid} 的进程已变样（arm 时 ${armed.name}，现在 ${proc.name}），疑似 PID 被系统复用，拒绝执行`, code: 'pid_reused' };
  }
  const decision = core.evaluateKill({
    pid, name: proc.name, path: proc.path, cmd: proc.cmd,
    selfPid: process.pid, ancestorPids: ancestorPids, allowProtected,
  });
  if (!decision.allowed) {
    armedTokens.delete(token);
    audit('kill_refused', { pid, name: proc.name }, decision.message);
    return { ok: false, error: decision.message, code: decision.code, needAllowProtected: decision.code === 'polaris_confirm' };
  }
  const r = treeKill ? await ps.killTree(pid) : await ps.killPid(pid);
  armedTokens.delete(token);
  if (!r.ok) {
    audit('kill_failed', { pid, name: proc.name }, r.error || '未知失败');
    return { ok: false, error: `结束失败（可能需要管理员权限）: ${r.error || '未知原因'}`, code: 'kill_failed' };
  }
  totalKills += 1;
  audit('kill_ok', { pid, name: proc.name, treeKill }, `已结束 ${proc.name}(pid=${pid})${treeKill ? '（含子进程树）' : ''}`);
  return { ok: true, killed: { pid, name: proc.name }, treeKill };
}

async function opAuditList() {
  return { ok: true, items: auditItems, cap: AUDIT_CAP };
}

async function opAuditClear() {
  auditItems = [];
  await mirrorAudit();
  return { ok: true };
}

// ── 路由表 ──────────────────────────────────────────────────────────────────
const POST_ROUTES = {
  '/api/port': opPortQuery,
  '/api/listening': opListening,
  '/api/proc/list': opProcList,
  '/api/proc/detail': opProcDetail,
  '/api/filelock': opFileLock,
  '/api/kill/arm': opKillArm,
  '/api/kill/fire': opKillFire,
  '/api/audit': opAuditList,
  '/api/audit/clear': opAuditClear,
};

async function handle(req, res) {
  const u = new URL(req.url, 'http://x');
  const pathname = u.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }
  // 安全闸：Host 白名单 + 客户端头强制（防 drive-by 与 DNS rebinding）
  if (!hostAllowed(req)) {
    sendJson(req, res, 403, { ok: false, error: 'Host 不允许' });
    return;
  }
  if (req.headers['x-pdesk-client'] !== 'polaris') {
    sendJson(req, res, 403, { ok: false, error: '缺少客户端标识头' });
    return;
  }

  if (pathname === '/__health') {
    sendJson(req, res, 200, { ok: true, version: VERSION, platform: process.platform, pid: process.pid });
    return;
  }
  if (pathname === '/api/meta') {
    sendJson(req, res, 200, { ok: true, meta: metaPayload(), degraded });
    return;
  }

  if (process.platform !== 'win32') {
    sendJson(req, res, 400, { ok: false, error: '进程透视台仅支持 Windows（依赖 PowerShell 与 Restart Manager）', platform: process.platform });
    return;
  }

  if (req.method === 'POST' && POST_ROUTES[pathname]) {
    const body = await readJsonBody(req);
    if (body === null) {
      sendJson(req, res, 400, { ok: false, error: '请求体必须是 application/json 对象' });
      return;
    }
    const r = await POST_ROUTES[pathname](body);
    sendJson(req, res, r && r.ok ? 200 : 400, r);
    return;
  }
  sendJson(req, res, 404, { ok: false, error: '未知端点' });
}

// ── 生命周期 ────────────────────────────────────────────────────────────────
process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
process.on('SIGTERM', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });
process.on('SIGINT', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });

initLog();
server.listen(PORT, '127.0.0.1', () => {
  serverAddress = server.address() && server.address().port;
  log('info', `进程透视台服务 v${VERSION} (pid=${process.pid}) 端口 ${serverAddress}`);
  // 启动即写一次心跳，MCP 不用等 30s；审计环从 kv 恢复（服务重启不丢历史）
  (async () => {
    try {
      const saved = await kv.kvGet(K.audit);
      if (saved && Array.isArray(saved.items)) auditItems = saved.items.filter((e) => e && typeof e === 'object');
    } catch (_) { /* bridge 不可达：内存空环起步 */ }
    await refreshAncestors();
    await writeHeartbeat();
  })().catch((e) => log('warn', `启动初始化部分失败: ${e.message}`));
  heartbeatTimer = setInterval(() => {
    void writeHeartbeat();
    // 令牌过期清扫
    const now = Date.now();
    for (const [t, v] of armedTokens) if (now - v.at > ARM_TTL_MS) armedTokens.delete(t);
  }, HEARTBEAT_MS);
  if (heartbeatTimer.unref) heartbeatTimer.unref();
});
