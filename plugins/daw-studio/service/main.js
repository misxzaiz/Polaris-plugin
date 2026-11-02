'use strict';
/**
 * main.js —— AI 乐谱工作台后台服务（node ≥18，零外部依赖；零出网）
 *
 * 职责：曲谱 CRUD + validator + 谱面分析 + kv 投影。
 *   不碰音频设备、不渲染音频（演奏/WAV 全在面板 Web Audio，v0.2 再议 service 渲染）。
 *
 * 架构（dep-probe/stream-desk 同范式）：
 *   面板 ──(127.0.0.1 直连 + Bearer token)──▶ 本服务
 *   MCP  ──(kv 读 dawstudio.meta 拿 port/token → 127.0.0.1 直连)──▶ 本服务
 *   本服务 ──(kvclient → 宿主 /api/router-dispatch → cap.kv)──▶ 宿主
 *
 * kv 键空间（全部 dawstudio. 前缀）：
 *   dawstudio.meta     {port,token,pid,version,startedAt,live} 心跳 60s
 *   dawstudio.scores   曲谱索引投影（cap 200 条，条目 ~120B）
 *   dawstudio.settings {lastScoreId}
 *
 * 持久化：全文落 appConfigDir/daw-studio/scores/<id>.json（原子写 tmp+rename），
 * kv 只存索引——prompt-matrix「全文落盘 + kv 瘦身投影」同款分层。
 *
 * 安全模型：
 *   - 仅监听 127.0.0.1；除 /__health 外全部要求 Authorization: Bearer <token>（timingSafe）
 *   - 零出网；只读写 scores 目录（根边界校验）；不执行系统命令
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { createKvClient } = require('./kvclient');
const core = require('../shared/core');

const VERSION = '0.1.2';
const PORT = parseInt(process.argv[2] || '0', 10) || 0;
const appConfigDir = process.argv[3] || '';
const STARTED_AT = Date.now();
const META_BEAT_MS = 60_000;

const BODY_CAP = 256 * 1024;
const SCORES_CAP = core.LIMITS.SCORES_CAP;
const SCORES_DIR = appConfigDir ? path.join(appConfigDir, 'daw-studio', 'scores') : '';

// ── 日志（stderr）────────────────────────────────────────────────────────────
function log(level, msg) {
  try { process.stderr.write(`[daw-studio-svc][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

const kv = createKvClient({ appConfigDir, log });

let token = crypto.randomBytes(32).toString('hex');
let degraded = false;
let index = []; // 曲谱索引投影 [{id,title,key,bpm,bars,dur,tracks,updatedAt}]

// ── 存储（scores 目录，根边界校验）──────────────────────────────────────────

function scorePath(id) {
  if (!SCORES_DIR) return null;
  if (!/^[\w-]{1,64}$/.test(String(id))) return null; // id 白名单：字母数字下划线连字符
  const p = path.join(SCORES_DIR, `${id}.json`);
  // 根边界校验（weibian 先例）：resolve 后必须在 scores 目录内
  if (path.resolve(p).startsWith(path.resolve(SCORES_DIR) + path.sep) === false) return null;
  return p;
}

function newId() {
  return `sc${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function atomicWrite(file, data) {
  const tmp = `${file}.tmp${process.pid}`;
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, file);
}

function loadIndexFromDisk() {
  if (!SCORES_DIR) return [];
  try { fs.mkdirSync(SCORES_DIR, { recursive: true }); } catch (_) { /* 忽略 */ }
  let files = [];
  try { files = fs.readdirSync(SCORES_DIR).filter((f) => /^sc[\w-]{0,60}\.json$/.test(f)); } catch (_) { return []; }
  const idx = [];
  for (const f of files) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(SCORES_DIR, f), 'utf8'));
      if (!s || !s.meta || !s.meta.title) continue;
      idx.push(core.projectIndex(s, f.replace(/\.json$/, ''), s.updatedAt || 0));
    } catch (_) { /* 坏文件跳过，不中断启动 */ }
  }
  idx.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return idx;
}

function saveScoreFile(score, id) {
  const p = scorePath(id);
  if (!p) throw new Error('非法谱 id 或存储目录不可用');
  atomicWrite(p, JSON.stringify({ ...score, id, updatedAt: Date.now() }));
}

async function syncIndex() {
  if (degraded) return;
  try { await kv.kvSet('dawstudio.scores', index); } catch (e) {
    log('warn', `索引同步 kv 失败（继续用内存索引）：${e.message}`);
  }
}

function upsertIndex(score, id, updatedAt) {
  index = index.filter((x) => x.id !== id);
  index.unshift(core.projectIndex(score, id, updatedAt));
  if (index.length > SCORES_CAP) index = index.slice(0, SCORES_CAP);
}

// ── HTTP 基础件 ─────────────────────────────────────────────────────────────

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, cap) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > (cap || BODY_CAP)) { reject(new Error('请求体超限（256KB）')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); } catch (_) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function authOk(req) {
  const m = /^Bearer\s+(.+)$/.exec(req.headers.authorization || '');
  return !!m && timingSafeEq(m[1], token);
}

// ── 业务操作 ────────────────────────────────────────────────────────────────

/** 写谱（创建或全量覆盖）。@returns {{ok:true, id, score} | {ok:false, errors}} */
async function opWriteScore(body) {
  const v = core.validateScore(body.score != null ? body.score : body);
  if (!v.ok) return v;
  const id = typeof body.id === 'string' && body.id ? body.id : newId();
  if (!scorePath(id)) return { ok: false, errors: ['谱 id 非法（字母数字-下划线，≤64 字符）'] };
  const score = v.score;
  const updatedAt = Date.now();
  if (index.length >= SCORES_CAP && !index.some((x) => x.id === id)) {
    return { ok: false, errors: [`曲谱数已达上限 ${SCORES_CAP}，请先清理旧谱（score_delete）`] };
  }
  saveScoreFile(score, id);
  upsertIndex(score, id, updatedAt);
  await syncIndex();
  return { ok: true, id, score: { ...score, id, updatedAt } };
}

/** 骨架生成：引擎展开后落库 */
async function opCreateScore(body) {
  const g = core.generateScore(body.skeleton != null ? body.skeleton : body);
  if (!g.ok) return g;
  return opWriteScore({ score: g.score });
}

function findInIndex(idOrTitle) {
  return index.find((x) => x.id === idOrTitle)
    || index.find((x) => x.title === idOrTitle);
}

async function opReadScore(idOrTitle) {
  const hit = findInIndex(String(idOrTitle || ''));
  if (!hit) {
    if (index.length) return { ok: false, errors: [`谱 "${idOrTitle}" 不存在（score_list 可查现有 ${index.length} 份）`] };
    return { ok: false, errors: ['曲谱库为空：先用 score_create 生成或 score_write 写入'] };
  }
  const p = scorePath(hit.id);
  if (!p) return { ok: false, errors: ['存储目录不可用'] };
  let score;
  try { score = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {
    return { ok: false, errors: [`谱文件损坏（${hit.id}），可 score_delete 后重建`] };
  }
  return { ok: true, score };
}

async function opDeleteScore(idOrTitle) {
  const hit = findInIndex(String(idOrTitle || ''));
  if (!hit) return { ok: false, errors: [`谱 "${idOrTitle}" 不存在`] };
  const p = scorePath(hit.id);
  if (p) { try { fs.unlinkSync(p); } catch (_) { /* 索引照删 */ } }
  index = index.filter((x) => x.id !== hit.id);
  await syncIndex();
  return { ok: true, deleted: hit.id, title: hit.title };
}

// ── API 路由 ────────────────────────────────────────────────────────────────

async function handleApi(req, res, pathname) {
  if (pathname === '/api/meta' && req.method === 'GET') {
    sendJson(res, 200, { version: VERSION, port: PORT, uptime: Date.now() - STARTED_AT, degraded, scoreCount: index.length });
    return;
  }
  if (pathname === '/api/scores' && req.method === 'GET') {
    sendJson(res, 200, { scores: index, degraded, cap: SCORES_CAP });
    return;
  }
  if (pathname === '/api/scores' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.skeleton != null || (body.key && !body.score)) {
      const r = await opCreateScore(body);
      r.ok ? sendJson(res, 200, r) : sendJson(res, 400, { errors: r.errors });
      return;
    }
    const r = await opWriteScore(body);
    r.ok ? sendJson(res, 200, r) : sendJson(res, 400, { errors: r.errors });
    return;
  }
  const m = /^\/api\/scores\/([^/]+)$/.exec(pathname);
  if (m && req.method === 'GET') {
    const r = await opReadScore(decodeURIComponent(m[1]));
    r.ok ? sendJson(res, 200, r) : sendJson(res, 404, { errors: r.errors });
    return;
  }
  if (m && req.method === 'DELETE') {
    const r = await opDeleteScore(decodeURIComponent(m[1]));
    r.ok ? sendJson(res, 200, r) : sendJson(res, 404, { errors: r.errors });
    return;
  }
  if (pathname === '/api/analyze' && req.method === 'POST') {
    const body = await readBody(req);
    const r = await opReadScore(String(body.id || body.title || ''));
    if (!r.ok) { sendJson(res, 404, { errors: r.errors }); return; }
    sendJson(res, 200, { score: r.score, analysis: core.analyzeScore(r.score) });
    return;
  }
  if (pathname === '/api/validate' && req.method === 'POST') {
    // 纯校验（不落库）：AI 写谱前预检
    const body = await readBody(req);
    const v = core.validateScore(body.score != null ? body.score : body);
    v.ok ? sendJson(res, 200, { ok: true }) : sendJson(res, 200, { ok: false, errors: v.errors });
    return;
  }
  if (pathname === '/api/selftest' && req.method === 'POST') {
    sendJson(res, 200, selfTest());
    return;
  }
  sendJson(res, 404, { error: `未知 API：${req.method} ${pathname}` });
}

/** 离线自检：validator 拦截 + 引擎可复现 + analyze 闭环 */
function selfTest() {
  const checks = [];
  const bad = core.validateScore({ meta: { title: 'x', bpm: 9999, key: 'C', bars: 1 }, tracks: [] });
  checks.push(bad.ok === false ? 'validator 拦截 bpm 越界 ✓' : 'FAIL: validator 未拦截 bpm 越界');
  const a = core.generateScore({ title: 'x', key: 'Am', bars: 2, style: 'arpeggio' });
  const b = core.generateScore({ title: 'x', key: 'Am', bars: 2, style: 'arpeggio' });
  checks.push(a.ok && b.ok && JSON.stringify(a.score) === JSON.stringify(b.score) ? '引擎确定性展开 ✓' : 'FAIL: 引擎不确定');
  const ana = core.analyzeScore(a.score);
  checks.push(ana && ana.summary ? 'analyze 闭环 ✓' : 'FAIL: analyze 异常');
  return { ok: checks.every((c) => !c.startsWith('FAIL')), checks };
}

// ── 服务启动 ────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }
  if (u.pathname === '/__health') {
    sendJson(res, 200, { status: 'ok', version: VERSION, degraded, scoreCount: index.length, uptime: Date.now() - STARTED_AT });
    return;
  }
  if (!authOk(req)) {
    sendJson(res, 401, { error: '未授权：需要 Bearer token（面板/MCP 经 dawstudio.meta 获取）' });
    return;
  }
  handleApi(req, res, u.pathname).catch((e) => {
    log('error', `API 处理异常 ${u.pathname}: ${e.message}`);
    if (!res.headersSent) sendJson(res, 500, { error: `服务内部错误：${e.message}` });
    else try { res.end(); } catch (_) { /* 忽略 */ }
  });
});

function writeMeta() {
  if (degraded) { log('warn', '降级模式，跳过 meta 心跳'); return; }
  const meta = { port: PORT, token, pid: process.pid, version: VERSION, startedAt: STARTED_AT, live: Date.now() };
  kv.kvSet('dawstudio.meta', meta).catch((e) => {
    degraded = true;
    log('warn', `meta 心跳失败，转入降级模式（内存/磁盘继续可用）：${e.message}`);
  });
}

server.listen(PORT, '127.0.0.1', () => {
  log('info', `AI 乐谱工作台服务 http://127.0.0.1:${PORT} (pid ${process.pid}, v${VERSION}, scores=${SCORES_DIR || '(无存储)'})`);
  (async () => {
    try {
      const meta = await kv.kvGet('dawstudio.meta');
      if (meta && typeof meta.token === 'string' && meta.token.length >= 32) {
        token = meta.token;
        log('info', 'token 自 kv meta 恢复');
      }
    } catch (e) {
      log('warn', `启动恢复失败（将以新 token 运行）：${e.message}`);
    }
    index = loadIndexFromDisk(); // 磁盘为权威，启动 sweep（索引由文件扫描重建，无孤儿）
    log('info', `谱库加载：${index.length} 份`);
    writeMeta();
  })();
  setInterval(writeMeta, META_BEAT_MS);
});

// ── 进程守卫（net-sentinel 纪律：异常只记不退）───────────────────────────────
process.on('uncaughtException', (e) => log('error', `uncaughtException: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.message ? e.message : String(e)}`));

function shutdown() {
  log('info', '收到退出信号，清理…');
  try { server.close(() => process.exit(0)); } catch (_) { process.exit(0); }
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
