'use strict';
/**
 * main.js —— 包体积透视台后台服务（node ≥18，零外部依赖；数据不出本机）
 *
 * 职责：把「一个构建产物目录」变成字节级透视报告并投影到 cap.kv（三端同看）。
 *   校验路径 → core.analyzeDist（sourcemap 字节归因/包分组/重复检测/建议）
 *   → 与上一次同目录扫描自动 diff → 内存权威 + cap.kv 投影。
 *
 * 架构（repo-lens / dep-probe / stream-desk 共享范式）：
 *   面板 ──(127.0.0.1 直连 + Bearer token，轮询进度)──▶ 本服务
 *   MCP  ──(kv 读 bundlelens.meta 拿 port/token → 127.0.0.1 直连)──▶ 本服务
 *   本服务 ──(kvclient → 宿主 /api/router-dispatch → cap.kv)──▶ 宿主
 *
 * kv 键空间（全部 bundlelens. 前缀，勿与他插件撞；不使用 kv list——宿主 kv list
 * 已实测会楔死 dispatch 通道，本服务绝不调用）：
 *   bundlelens.meta            {port,token,pid,version,startedAt,live} 心跳 60s
 *   bundlelens.settings        {recentPaths[]}
 *   bundlelens.runs            扫描历史索引（cap 20）
 *   bundlelens.latest          最近 runId
 *   bundlelens.report.<runId>  裁剪报告（core.trimReport）
 *
 * 安全模型：
 *   - 仅监听 127.0.0.1；除 /__health 外全部要求 Authorization: Bearer <token>（timingSafe 比对）
 *   - 不带 CORS 头（同源宿主代理/面板直连，不放行任意 origin）
 *   - 只读目标目录（walk + read），零网络出站（唯一 HTTP 是回环服务本身与宿主 kv 桥）
 *   - 不写目标目录任何文件；selftest 只写 os.tmpdir() 且 finally 清理
 */
const http = require('http');
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
const REPORTS_KEPT = 10;
const BODY_LIMIT = 1024 * 1024;

function log(level, msg) {
  try { process.stderr.write(`[bundle-lens-svc][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

const kv = createKvClient({ appConfigDir, log });

// ── 状态 ────────────────────────────────────────────────────────────────────
let token = crypto.randomBytes(32).toString('hex');
let degraded = false; // 宿主 kv 桥不可达 = 面板/MCP 仍可用本服务，报告不投影
let settings = { recentPaths: [] };
let currentRun = null;
let lastRunId = null;
const reports = new Map(); // runId → 报告（内存权威）
const runs = [];

function clampSettings(s) {
  const out = { recentPaths: [] };
  if (s && Array.isArray(s.recentPaths)) {
    out.recentPaths = s.recentPaths.filter((p) => typeof p === 'string').slice(0, 10)
      .map((p) => p.slice(0, 500));
  }
  return out;
}

async function kvSafe(fn, what) {
  try { await fn(); if (degraded) { degraded = false; log('info', `宿主 kv 桥恢复（${what}）`); } }
  catch (e) {
    if (!degraded) { degraded = true; log('warn', `宿主 kv 桥不可达（${what}）：${e.message}，进入降级（服务照常，报告不投影）`); }
  }
}

async function persistSettings() {
  await kvSafe(() => kv.kvSet('bundlelens.settings', settings), 'settings');
}

async function loadSettings() {
  try {
    const s = await kv.kvGet('bundlelens.settings');
    if (s) settings = clampSettings(s);
  } catch (e) { log('warn', `读设置失败（保持默认）：${e.message}`); }
}

async function persistRunIndex() {
  await kvSafe(() => kv.kvSet('bundlelens.runs', runs.slice(0, MAX_RUNS)), 'runs');
  if (lastRunId) await kvSafe(() => kv.kvSet('bundlelens.latest', lastRunId), 'latest');
}

// ── 扫描状态机 ───────────────────────────────────────────────────────────────
function normDir(p) {
  const abs = path.resolve(String(p || '').trim());
  return process.platform === 'win32' ? abs.toLowerCase() : abs;
}

async function runScan(runId, target) {
  const run = runs.find((r) => r.runId === runId);
  const startedAt = Date.now();
  currentRun = { runId, status: 'running', phase: 'walk', progress: 0, message: '遍历目录…', startedAt };
  if (run) { run.status = 'running'; run.startedAt = startedAt; }
  try {
    const report = await core.analyzeDist(target.dir, {
      onProgress: (p) => {
        if (currentRun && currentRun.runId === runId) {
          currentRun.phase = p.phase;
          currentRun.progress = p.total > 0 ? Math.min(0.99, p.done / p.total) : 0.1;
          currentRun.message = p.message;
        }
      },
    });
    // 与上一次「同目录」成功 run 自动 diff
    const prev = runs.find((r) => r.status === 'ok' && r.runId !== runId && r.dirKey === target.dirKey);
    if (prev) {
      const prevReport = reports.get(prev.runId);
      if (prevReport) report.diff = core.diffReports(prevReport, report);
    }
    report.runId = runId;
    report.startedAt = startedAt;
    report.finishedAt = Date.now();
    const runItem = {
      runId, path: target.dir, dirKey: target.dirKey, startedAt,
      finishedAt: report.finishedAt, status: 'ok',
      totalBytes: report.totals.totalBytes,
      pkgCount: report.totals.pkgCount,
      chunks: report.totals.chunks,
      mapCoverage: report.totals.mapCoverage,
      durationMs: report.totals.durationMs,
      suggestions: report.suggestions.length,
      warnings: report.warnings.length,
    };
    // 持久化顺序：报告与索引先落 kv，最后才把 run 翻成 ok 终态——
    // 保证「面板/MCP 看到终态」时报告必然已可读（真桥实测过的时序）
    reports.set(runId, report);
    while (reports.size > REPORTS_KEPT) {
      const oldest = [...reports.keys()].find((k) => k !== runId);
      if (!oldest) break;
      reports.delete(oldest);
    }
    await kvSafe(() => kv.kvSet(`bundlelens.report.${runId}`, core.trimReport(report)), 'report');
    lastRunId = runId;
    if (run) Object.assign(run, runItem); else runs.unshift(runItem);
    currentRun = null;
    await persistRunIndex();
    log('info', `扫描完成 ${runId}：${target.dir}（${report.totals.chunks} chunks / ${report.totals.pkgCount} pkgs / ${report.totals.durationMs}ms）`);
  } catch (e) {
    currentRun = null;
    if (run) { run.status = 'error'; run.error = e.message; run.finishedAt = Date.now(); }
    else runs.unshift({ runId, path: target.dir, dirKey: target.dirKey, startedAt, finishedAt: Date.now(), status: 'error', error: e.message });
    await persistRunIndex();
    log('warn', `扫描失败 ${runId}：${e.message}`);
    throw e;
  }
}

function startScan(dirRaw) {
  if (currentRun) return { error: '已有扫描在进行中，请等待完成', code: 409 };
  const dir = path.resolve(String(dirRaw || '').trim());
  if (!dir || dir === path.parse(dir).root) return { error: '请填写构建产物目录路径（如 D:\\proj\\dist）', code: 400 };
  const runId = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  const dirKey = normDir(dir);
  runs.unshift({ runId, path: dir, dirKey, startedAt: Date.now(), status: 'running' });
  if (runs.length > MAX_RUNS) runs.length = MAX_RUNS;
  settings.recentPaths = [dir, ...settings.recentPaths.filter((p) => normDir(p) !== dirKey)].slice(0, 10);
  persistSettings();
  runScan(runId, { dir, dirKey }).catch(() => { /* 状态已入 runs */ });
  return { runId };
}

// ── HTTP 骨架 ────────────────────────────────────────────────────────────────
function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) { reject(new Error('请求体超过 1MB 上限')); req.destroy(); return; }
      parts.push(c);
    });
    req.on('end', () => {
      if (parts.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))); }
      catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, code, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

function runSummary(r) {
  return {
    runId: r.runId, path: r.path, startedAt: r.startedAt, finishedAt: r.finishedAt,
    status: r.status, error: r.error, totalBytes: r.totalBytes, pkgCount: r.pkgCount,
    chunks: r.chunks, mapCoverage: r.mapCoverage, durationMs: r.durationMs,
    suggestions: r.suggestions, warnings: r.warnings,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;
  try {
    if (p === '/__health') { sendJson(res, 200, { ok: true, version: VERSION }); return; }
    // 鉴权（/__health 之外全部要求 Bearer）
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ') || !timingSafeEq(auth.slice(7), token)) {
      sendJson(res, 401, { error: '未授权' });
      return;
    }
    if (p === '/api/meta' && req.method === 'GET') {
      sendJson(res, 200, {
        version: VERSION, pid: process.pid, degraded, uptime: Date.now() - STARTED_AT,
        currentRun, lastRunId, settings, reportsInMemory: reports.size,
      });
      return;
    }
    if (p === '/api/scan' && req.method === 'POST') {
      const body = await readBody(req);
      const r = startScan(body.path);
      if (r.error) { sendJson(res, r.code || 400, { error: r.error }); return; }
      sendJson(res, 200, { runId: r.runId });
      return;
    }
    const scanMatch = p.match(/^\/api\/scan\/([A-Za-z0-9]+)$/);
    if (scanMatch && req.method === 'GET') {
      const runId = scanMatch[1];
      if (currentRun && currentRun.runId === runId) { sendJson(res, 200, currentRun); return; }
      const run = runs.find((r) => r.runId === runId);
      if (!run) { sendJson(res, 404, { error: '未知 runId' }); return; }
      sendJson(res, 200, { runId, status: run.status, error: run.error, message: run.status === 'ok' ? '完成' : '', finishedAt: run.finishedAt });
      return;
    }
    if (p === '/api/runs' && req.method === 'GET') {
      sendJson(res, 200, { runs: runs.map(runSummary), degraded, version: VERSION, currentRun, lastRunId });
      return;
    }
    const reportMatch = p.match(/^\/api\/report\/([A-Za-z0-9]+)$/);
    if (reportMatch && req.method === 'GET') {
      const runId = reportMatch[1];
      const report = reports.get(runId);
      if (!report) {
        // 服务重启后内存丢失：尝试 kv 恢复（只读）
        try {
          const restored = await kv.kvGet(`bundlelens.report.${runId}`);
          if (restored) { reports.set(runId, restored); sendJson(res, 200, { report: restored }); return; }
        } catch (_) { /* kv 不可达，走 404 */ }
        sendJson(res, 404, { error: '报告不在内存（服务可能重启过）；请重新扫描' });
        return;
      }
      sendJson(res, 200, { report });
      return;
    }
    if (p === '/api/settings' && req.method === 'GET') {
      sendJson(res, 200, { settings, degraded, version: VERSION, uptime: Date.now() - STARTED_AT });
      return;
    }
    if (p === '/api/settings' && req.method === 'POST') {
      const body = await readBody(req);
      if (body && Array.isArray(body.recentPaths)) settings = clampSettings(body);
      else if (body && body.settings) settings = clampSettings(body.settings);
      await persistSettings();
      sendJson(res, 200, { settings });
      return;
    }
    if (p === '/api/selftest' && req.method === 'POST') {
      const r = await core.selfTest();
      sendJson(res, 200, r);
      return;
    }
    sendJson(res, 404, { error: '未知端点' });
  } catch (e) {
    log('warn', `${req.method} ${p} 失败：${e.message}`);
    sendJson(res, e.message.includes('JSON') || e.message.includes('上限') ? 400 : 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = server.address();
  log('info', `bundle-lens 服务已启动 v${VERSION} @ 127.0.0.1:${addr.port}（pid ${process.pid}）`);
  (async () => {
    await loadSettings();
    // 心跳注册（meta 携带 token——面板/MCP 经 kv 自发现）
    const beat = () => {
      const meta = {
        port: addr.port, token, pid: process.pid, version: VERSION,
        startedAt: STARTED_AT, live: Date.now(), lastRunId,
      };
      kvSafe(() => kv.kvSet('bundlelens.meta', meta), 'meta');
    };
    beat();
    setInterval(beat, META_BEAT_MS).unref();
    // 历史恢复（runs 索引；报告按需从 kv 拉）
    try {
      const prevRuns = await kv.kvGet('bundlelens.runs');
      if (Array.isArray(prevRuns)) {
        for (const r of prevRuns) if (r && r.runId && !runs.find((x) => x.runId === r.runId)) runs.push(r);
        const latest = await kv.kvGet('bundlelens.latest');
        if (latest) lastRunId = latest;
        log('info', `恢复历史 ${runs.length} 条（lastRunId=${lastRunId || '无'}）`);
      }
    } catch (e) { log('warn', `历史恢复失败：${e.message}`); }
  })().catch((e) => log('error', `启动初始化失败：${e.message}`));
});

server.on('error', (e) => {
  log('error', `服务监听失败：${e.message}`);
  process.exit(1);
});
process.on('uncaughtException', (e) => log('error', `uncaughtException: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.message}`));
