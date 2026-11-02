'use strict';
/**
 * main.js —— 依赖体检台后台服务（node ≥18，零外部依赖；数据不出本机）
 *
 * 职责：把「选中的路径」变成一份依赖漏洞体检报告。
 *   发现（递归 lockfile）→ 解析（shared/core 五解析器）→ OSV.dev querybatch（分块 100）
 *   → 漏洞详情并发补全（磁盘缓存 7 天）→ 归并/忽略/修复方案 → cap.kv 投影（三端可看）。
 *
 * 架构（三方共享 cap.kv 同一事实库，stream-desk/webhook-station 同范式）：
 *   面板 ──(127.0.0.1 直连 + Bearer token，轮询进度)──▶ 本服务
 *   MCP  ──(kv 读 depprobe.meta 拿 port/token → 127.0.0.1 直连)──▶ 本服务
 *   本服务 ──(kvclient → 宿主 /api/router-dispatch → cap.kv)──▶ 宿主
 *
 * kv 键空间（全部 depprobe. 前缀，勿与他插件撞）：
 *   depprobe.meta            {port,token,pid,version,startedAt,live} 心跳 60s
 *   depprobe.settings        {ignores[], recentPaths[]}
 *   depprobe.runs            扫描历史索引（cap 20）
 *   depprobe.latest          最近 runId
 *   depprobe.report.<runId>  完整报告投影（findings cap 800，逐条截断）
 *
 * 安全模型：
 *   - 仅监听 127.0.0.1；除 /__health 外全部要求 Authorization: Bearer <token>（timingSafe 比对）
 *   - 网络只出站到 api.osv.dev（固定主机；env DEPPROBE_OSV_BASE 仅供测试注入），
 *     不接受任何用户/工具传入的 URL
 *   - 文件只读；唯一写盘 = 漏洞详情缓存（appConfigDir/dep-probe/cache，TTL 7 天）
 *   - 不执行任何系统命令
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { createKvClient } = require('./kvclient');
const core = require('../shared/core');

const VERSION = '0.1.0';
const PORT = parseInt(process.argv[2] || '0', 10) || 0;
const appConfigDir = process.argv[3] || '';
const STARTED_AT = Date.now();
const META_BEAT_MS = 60_000;
const OSV_BASE = (process.env.DEPPROBE_OSV_BASE || core.OSV_BASE_DEFAULT).replace(/\/$/, '');

const MAX_LOCKFILES = 300;
const MAX_PACKAGES = 8000;
const MAX_FINDINGS = 800;
const MAX_RUNS = 20;
const FILE_SIZE_CAP = 20 * 1024 * 1024;
const WALK_DEPTH = 4;
const DETAIL_CONCURRENCY = 5;
const DETAIL_TIMEOUT_MS = 20_000;
const OSV_TIMEOUT_MS = 25_000;
const SCAN_DEADLINE_MS = 10 * 60_000;
const CACHE_TTL_MS = 7 * 24 * 3600_000;
const REPORT_TEXT_CAP = 200;
const CACHE_DIR = appConfigDir ? path.join(appConfigDir, 'dep-probe', 'cache') : '';

// ── 日志（stderr；stdout 不承载业务）────────────────────────────────────────
function log(level, msg) {
  try { process.stderr.write(`[dep-probe-svc][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

const kv = createKvClient({ appConfigDir, log });

// ── 状态 ────────────────────────────────────────────────────────────────────
let token = crypto.randomBytes(32).toString('hex');
let degraded = false;
let settings = { ignores: [], recentPaths: [] };
let currentRun = null;   // 进行中的扫描状态
let lastReport = null;   // 最近一次完整报告（内存权威）

function clampSettings(s) {
  const out = { ignores: [], recentPaths: [] };
  if (s && Array.isArray(s.ignores)) {
    out.ignores = s.ignores.filter((ig) => ig && typeof ig === 'object' && (ig.pkg || ig.vulnId))
      .slice(0, 200).map((ig) => ({
        pkg: typeof ig.pkg === 'string' ? ig.pkg.slice(0, 200) : '',
        vulnId: typeof ig.vulnId === 'string' ? ig.vulnId.slice(0, 80) : '',
        reason: typeof ig.reason === 'string' ? ig.reason.slice(0, 200) : '',
        at: Number(ig.at) || Date.now(),
      }));
  }
  if (s && Array.isArray(s.recentPaths)) {
    out.recentPaths = [...new Set(s.recentPaths.filter((p) => typeof p === 'string' && p).map((p) => p.slice(0, 500)))].slice(0, 8);
  }
  return out;
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
      if (size > (cap || 1024 * 1024)) { reject(new Error('请求体超限')); req.destroy(); return; }
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
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return false;
  return timingSafeEq(m[1], token);
}

// ── OSV 客户端（仅固定主机）────────────────────────────────────────────────
function osvFetch(urlPath, method, bodyObj) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OSV_TIMEOUT_MS);
  const url = `${OSV_BASE}${urlPath}`;
  return fetch(url, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: bodyObj != null ? JSON.stringify(bodyObj) : undefined,
    signal: ctrl.signal,
  }).finally(() => clearTimeout(timer));
}

async function osvPostRetry(urlPath, bodyObj, retries) {
  let lastErr = null;
  for (let n = 0; n <= (retries == null ? 2 : retries); n++) {
    try {
      const res = await osvFetch(urlPath, 'POST', bodyObj);
      if (res.status === 429 || res.status >= 500) throw new Error(`OSV HTTP ${res.status}`);
      if (!res.ok) throw new Error(`OSV HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (String(e.message || '').includes('HTTP 4') && !String(e.message || '').includes('429')) break; // 4xx 除 429 不重试
      if (n < (retries == null ? 2 : retries)) await sleep(500 * Math.pow(2, n));
    }
  }
  throw lastErr || new Error('OSV 请求失败');
}

async function osvGetVuln(id) {
  // 详情读走磁盘缓存；缓存命中即回，未命中并发拉取后落盘
  const cacheFile = CACHE_DIR ? path.join(CACHE_DIR, `${String(id).replace(/[^\w.-]/g, '_')}.json`) : '';
  if (cacheFile) {
    try {
      const st = fs.statSync(cacheFile);
      if (Date.now() - st.mtimeMs < CACHE_TTL_MS) {
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      }
    } catch (_) { /* 无缓存 */ }
  }
  let detail = null;
  let lastErr = null;
  for (let n = 0; n < 2; n++) {
    try {
      const res = await osvFetch(`/v1/vulns/${encodeURIComponent(String(id))}`, 'GET', null);
      if (res.status === 404) return null; // 已撤销的公告，如实当缺失
      if (!res.ok) throw new Error(`OSV HTTP ${res.status}`);
      detail = await res.json();
      break;
    } catch (e) { lastErr = e; if (n === 0) await sleep(600); }
  }
  if (!detail) throw lastErr || new Error('详情获取失败');
  if (cacheFile) {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(detail));
    } catch (_) { /* 缓存失败不致命 */ }
  }
  return detail;
}

// ── 扫描编排 ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeInputPath(p) {
  let s = String(p || '').trim();
  s = s.replace(/^["']|["']$/g, '').trim(); // 拖拽路径常带引号
  if (!s) return '';
  if (s.startsWith('file:///')) {
    try {
      s = decodeURIComponent(new URL(s).pathname);
      if (/^\/[A-Za-z]:\//.test(s)) s = s.slice(1); // Windows 盘符：file:///D:/x → /D:/x → D:/x
    } catch (_) { /* 保留原样 */ }
  }
  return s;
}

function isLockfileHit(name) { return !!core.isLockfileName(name); }

async function discoverLockfiles(paths, warnings, onProgress) {
  const files = [];
  const queue = [];
  for (const p of paths) {
    let st = null;
    try { st = await fs.promises.stat(p); } catch (_) { warnings.push(`路径不存在或不可读：${p}`); continue; }
    if (st.isFile()) {
      if (isLockfileHit(path.basename(p))) files.push(p);
      else warnings.push(`不是受支持的 lockfile 文件：${p}`);
      continue;
    }
    if (!st.isDirectory()) { warnings.push(`既非文件也非目录：${p}`); continue; }
    queue.push({ dir: p, depth: 0 });
  }
  const SKIP = core.SKIP_DIRS;
  while (queue.length && files.length < MAX_LOCKFILES) {
    const { dir, depth } = queue.shift();
    let entries;
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { warnings.push(`目录读取失败 ${dir}: ${e.message}`); continue; }
    for (const ent of entries) {
      if (files.length >= MAX_LOCKFILES) break;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP.has(ent.name) || ent.name.startsWith('.')) continue;
        if (depth < WALK_DEPTH) queue.push({ dir: full, depth: depth + 1 });
        continue;
      }
      if (ent.isFile() && isLockfileHit(ent.name)) files.push(full);
    }
    onProgress && onProgress(files.length);
  }
  return files;
}

function readTextFileCap(file, cap) {
  return new Promise((resolve, reject) => {
    fs.stat(file, (e, st) => {
      if (e) { reject(e); return; }
      if (st.size > cap) { reject(new Error(`文件超过 ${Math.round(cap / 1024 / 1024)}MB 上限`)); return; }
      fs.readFile(file, 'utf8', (e2, data) => (e2 ? reject(e2) : resolve(data)));
    });
  });
}

async function runScan(runId, paths) {
  const prog = currentRun.progress;
  const warnings = [];
  try {
    // 1) 发现
    prog.phase = 'discover';
    const files = await discoverLockfiles(paths, warnings, (n) => { prog.filesFound = n; });
    prog.filesFound = files.length;
    if (!files.length) throw new Error('未发现任何受支持的 lockfile（package-lock.json / pnpm-lock.yaml / Cargo.lock / requirements*.txt / go.mod）');

    // 2) 解析
    prog.phase = 'parse';
    const pkgs = [];
    const repoMap = new Map(); // repoDir → {files: Map<file, {ecosystem, count}>}
    for (const file of files) {
      let content;
      try { content = await readTextFileCap(file, FILE_SIZE_CAP); } catch (e) { warnings.push(`读取失败 ${file}: ${e.message}`); continue; }
      const kind = core.isLockfileName(path.basename(file));
      let parsed;
      try { parsed = core.parseLockfile(kind, path.basename(file), content); } catch (e) { warnings.push(e.message); continue; }
      const repoDir = path.dirname(file);
      if (!repoMap.has(repoDir)) repoMap.set(repoDir, { files: new Map(), packageCount: 0 });
      const repo = repoMap.get(repoDir);
      repo.files.set(file, { ecosystem: parsed.ecosystem, count: parsed.packages.length });
      for (const p of parsed.packages) {
        if (pkgs.length >= MAX_PACKAGES) { warnings.push(`包总量超过 ${MAX_PACKAGES}，截断（本次报告不完整）`); break; }
        pkgs.push({ ...p, ecosystem: parsed.ecosystem, file, repoDir });
        repo.packageCount += 1;
      }
      for (const w of parsed.warnings) warnings.push(w);
      prog.packages = pkgs.length;
    }
    if (!pkgs.length) throw new Error('所有 lockfile 均解析为空清单');

    // 3) OSV 批量查询
    prog.phase = 'query';
    const batches = core.buildQueryBatches(pkgs, core.OSV_BATCH_SIZE);
    prog.totalBatches = batches.length;
    const batchResults = new Array(pkgs.length).fill(null);
    let batchErr = 0;
    for (let b = 0; b < batches.length; b++) {
      if (Date.now() - currentRun.startedAt > SCAN_DEADLINE_MS) throw new Error('扫描超时（10 分钟上限），已中止');
      try {
        const resp = await osvPostRetry('/v1/querybatch', { queries: batches[b] });
        const results = resp && Array.isArray(resp.results) ? resp.results : [];
        for (let i = 0; i < results.length; i++) batchResults[b * core.OSV_BATCH_SIZE + i] = results[i];
      } catch (e) {
        batchErr += 1;
        warnings.push(`OSV 批次 ${b + 1}/${batches.length} 查询失败：${e.message}（该批按无漏洞计，报告不完整）`);
      }
      prog.queriedBatches = b + 1;
    }
    if (batchErr === batches.length) throw new Error(`OSV 查询全部失败（${OSV_BASE} 不可达或被拦截）——请检查网络`);

    // 4) 详情补全（并发 + 磁盘缓存）
    prog.phase = 'details';
    const idSet = new Set();
    for (const r of batchResults) {
      const vulns = r && Array.isArray(r.vulns) ? r.vulns : [];
      for (const v of vulns) if (v && v.id) idSet.add(String(v.id));
    }
    const ids = [...idSet];
    prog.totalDetails = ids.length;
    const detailMap = new Map();
    let detailErr = 0;
    let cursor = 0;
    async function worker() {
      for (;;) {
        const i = cursor++;
        if (i >= ids.length) return;
        const id = ids[i];
        try {
          const d = await osvGetVuln(id);
          if (d) detailMap.set(id, d);
        } catch (_) { detailErr += 1; }
        prog.detailsFetched += 1;
      }
    }
    await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, ids.length) }, worker));
    if (detailErr) warnings.push(`${detailErr} 条漏洞详情获取失败（已按无详情计入，重扫可恢复）`);

    // 5) 归并 / 忽略 / 修复方案
    const rawFindings = core.collectFindings(pkgs, batchResults, detailMap);
    const { findings, ignoredCount } = core.applyIgnores(rawFindings, settings.ignores);
    const truncated = findings.length > MAX_FINDINGS;
    const findingsProj = (truncated ? findings.slice(0, MAX_FINDINGS) : findings)
      .map((f) => core.projectFinding(f, REPORT_TEXT_CAP));
    const fixPlan = core.buildFixPlan(findings).slice(0, 200);
    const repos = [...repoMap.entries()].map(([dir, r]) => ({
      dir, packageCount: r.packageCount,
      files: [...r.files.entries()].map(([file, info]) => ({ file, ecosystem: info.ecosystem, count: info.count })),
    })).sort((a, b) => b.packageCount - a.packageCount);

    const report = {
      runId, startedAt: currentRun.startedAt, finishedAt: Date.now(),
      paths, repos, packageCount: pkgs.length, lockfileCount: files.length,
      counts: core.summarizeCounts(findings),
      findingCount: findings.length, ignoredCount, truncated,
      findings: findingsProj, fixPlan,
      warnings: warnings.slice(0, 100),
      version: VERSION,
    };
    lastReport = report;

    // 6) kv 投影（degraded 时跳过，内存仍可看）
    if (!degraded) {
      try {
        await kv.kvSet(`depprobe.report.${runId}`, report);
        const runs = (await kv.kvGet('depprobe.runs')) || [];
        const idx = [{
          runId, startedAt: report.startedAt, finishedAt: report.finishedAt,
          repos: repos.length, packageCount: pkgs.length, findingCount: report.findingCount,
          counts: report.counts, truncated,
        }, ...runs.filter((x) => x && x.runId !== runId)].slice(0, MAX_RUNS);
        await kv.kvSet('depprobe.runs', idx);
        await kv.kvSet('depprobe.latest', runId);
        // 孤儿报告 sweep：索引外的旧报告清理
        try {
          const keys = await kv.kvKeys();
          const orphans = keys.filter((k) => /^depprobe\.report\./.test(k))
            .filter((k) => !idx.some((x) => `depprobe.report.${x.runId}` === k));
          for (const k of orphans) await kv.kvDel(k);
        } catch (_) { /* sweep 失败不致命 */ }
      } catch (e) {
        degraded = true;
        log('warn', `kv 投影失败，转入降级：${e.message}`);
      }
    }

    prog.phase = 'done';
    currentRun.finishedAt = Date.now();
    log('info', `扫描完成 ${runId}: ${pkgs.length} 包 / ${files.length} lockfile / ${findings.length} 发现（ignored ${ignoredCount}）`);
  } catch (e) {
    prog.phase = 'error';
    prog.error = e.message;
    currentRun.finishedAt = Date.now();
    currentRun.error = e.message;
    log('error', `扫描失败 ${runId}: ${e.message}`);
    if (!degraded) {
      try {
        await kv.kvSet(`depprobe.report.${runId}`, {
          runId, startedAt: currentRun.startedAt, finishedAt: Date.now(),
          paths, error: e.message, version: VERSION,
          counts: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
          repos: [], findings: [], fixPlan: [], warnings: [e.message],
          findingCount: 0, ignoredCount: 0, truncated: false, packageCount: 0, lockfileCount: 0,
        });
        await kv.kvSet('depprobe.latest', runId);
      } catch (_) { /* 降级 */ }
    }
  } finally {
    setTimeout(() => { if (currentRun && currentRun.runId === runId && ['done', 'error'].includes(currentRun.progress.phase)) currentRun = null; }, 30_000);
  }
}

function startScan(paths) {
  const runId = `r${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
  currentRun = { runId, startedAt: Date.now(), error: null, progress: { phase: 'discover', filesFound: 0, packages: 0, queriedBatches: 0, totalBatches: 0, detailsFetched: 0, totalDetails: 0 } };
  // 最近路径记忆（异步，不阻塞响应）
  settings.recentPaths = [...new Set([...paths, ...settings.recentPaths])].slice(0, 8);
  if (!degraded) kv.kvSet('depprobe.settings', settings).catch(() => {});
  runScan(runId, paths).catch((e) => log('error', `runScan 异常: ${e.stack || e.message}`));
  return runId;
}

// ── 单包即时检查（MCP dep_check_pkg 用）─────────────────────────────────────
const ECOSYSTEMS = ['npm', 'crates.io', 'PyPI', 'Go'];
async function checkPkg(ecosystem, pkg, version) {
  if (!ECOSYSTEMS.includes(ecosystem)) throw new Error(`生态必须是 ${ECOSYSTEMS.join(' / ')} 之一`);
  const name = ecosystem === 'PyPI' ? core.normalizePypiName(pkg) : String(pkg);
  const resp = await osvPostRetry('/v1/querybatch', { queries: [{ package: { ecosystem, name }, version }] }, 1);
  const vulns = resp && Array.isArray(resp.results) && Array.isArray(resp.results[0] && resp.results[0].vulns)
    ? resp.results[0].vulns : [];
  const pkgs = [{ name, version, ecosystem }];
  const detailMap = new Map();
  const ids = vulns.map((v) => String(v.id)).filter(Boolean).slice(0, 30);
  await Promise.all(ids.map(async (id) => {
    try { const d = await osvGetVuln(id); if (d) detailMap.set(id, d); } catch (_) { /* 无详情照常列 */ }
  }));
  const findings = core.collectFindings(pkgs, [{ vulns }], detailMap);
  return { ecosystem, pkg: name, version, findings, counts: core.summarizeCounts(findings) };
}

// ── API 路由 ────────────────────────────────────────────────────────────────
async function handleApi(req, res, pathname, query) {
  if (pathname === '/api/meta' && req.method === 'GET') {
    sendJson(res, 200, {
      version: VERSION, port: PORT, uptime: Date.now() - STARTED_AT,
      degraded, busy: !!currentRun,
      runId: currentRun ? currentRun.runId : null,
      kvEndpoint: kv.endpoint() ? `${kv.endpoint().host}:${kv.endpoint().port}` : null,
      osvBase: OSV_BASE,
    });
    return;
  }
  if (pathname === '/api/scan' && req.method === 'POST') {
    const body = await readBody(req);
    const paths = (Array.isArray(body.paths) ? body.paths : [body.paths])
      .map(normalizeInputPath).filter(Boolean);
    if (!paths.length) { sendJson(res, 400, { error: 'paths 不能为空' }); return; }
    if (paths.length > 10) { sendJson(res, 400, { error: '一次最多 10 个路径（可填父目录递归发现）' }); return; }
    if (currentRun && !['done', 'error'].includes(currentRun.progress.phase)) {
      sendJson(res, 409, { error: '已有扫描在进行中', runId: currentRun.runId });
      return;
    }
    const runId = startScan(paths);
    sendJson(res, 200, { runId });
    return;
  }
  let m = /^\/api\/scan\/([\w-]+)$/.exec(pathname);
  if (m && req.method === 'GET') {
    if (currentRun && currentRun.runId === m[1]) {
      const r = currentRun;
      const elapsed = Date.now() - r.startedAt;
      const base = { runId: r.runId, status: r.progress.phase === 'error' ? 'error' : (r.progress.phase === 'done' ? 'done' : 'running'), startedAt: r.startedAt, elapsedMs: elapsed, progress: r.progress };
      if (r.progress.phase === 'error') base.error = r.progress.error;
      if (r.progress.phase === 'done') base.report = lastReport && lastReport.runId === r.runId ? lastReport : null;
      sendJson(res, 200, base);
      return;
    }
    // 非当前：从 kv 读
    if (degraded) { sendJson(res, 404, { error: '服务处于降级模式（kv 不可达），仅当前扫描可查' }); return; }
    const rep = await kv.kvGet(`depprobe.report.${m[1]}`);
    if (!rep) { sendJson(res, 404, { error: `扫描 ${m[1]} 不存在` }); return; }
    sendJson(res, 200, { runId: m[1], status: rep.error ? 'error' : 'done', startedAt: rep.startedAt, elapsedMs: (rep.finishedAt || 0) - (rep.startedAt || 0), report: rep, progress: { phase: rep.error ? 'error' : 'done' } });
    return;
  }
  if (pathname === '/api/runs' && req.method === 'GET') {
    if (degraded) { sendJson(res, 200, { runs: lastReport ? [{ runId: lastReport.runId, startedAt: lastReport.startedAt, counts: lastReport.counts, findingCount: lastReport.findingCount, packageCount: lastReport.packageCount, repos: lastReport.repos.length }] : [], degraded }); return; }
    const runs = (await kv.kvGet('depprobe.runs')) || [];
    sendJson(res, 200, { runs, degraded });
    return;
  }
  m = /^\/api\/report\/(latest|[\w-]+)$/.exec(pathname);
  if (m && req.method === 'GET') {
    let rep = lastReport;
    if (!rep || (m[1] !== 'latest' && rep.runId !== m[1])) {
      const rid = m[1] === 'latest' ? await kv.kvGet('depprobe.latest') : m[1];
      if (rid && (!rep || rep.runId !== rid)) rep = degraded ? null : await kv.kvGet(`depprobe.report.${rid}`);
    }
    if (!rep) { sendJson(res, 404, { error: '暂无可用报告' }); return; }
    sendJson(res, 200, { report: rep });
    return;
  }
  if (pathname === '/api/check' && req.method === 'POST') {
    const body = await readBody(req);
    const ecosystem = String(body.ecosystem || '');
    const pkg = String(body.pkg || body.name || '').trim();
    const version = String(body.version || '').trim();
    if (!pkg || !version) { sendJson(res, 400, { error: '需要 pkg 与 version' }); return; }
    try {
      const r = await checkPkg(ecosystem, pkg, version);
      sendJson(res, 200, { ...r, findings: r.findings.map((f) => core.projectFinding(f, REPORT_TEXT_CAP)) });
    } catch (e) {
      sendJson(res, 502, { error: `OSV 查询失败：${e.message}` });
    }
    return;
  }
  if (pathname === '/api/settings' && req.method === 'GET') {
    sendJson(res, 200, { settings, degraded, version: VERSION, uptime: Date.now() - STARTED_AT });
    return;
  }
  if (pathname === '/api/settings' && req.method === 'POST') {
    const body = await readBody(req);
    settings = clampSettings({ ...settings, ...body });
    if (!degraded) { try { await kv.kvSet('depprobe.settings', settings); } catch (_) { /* 忽略 */ } }
    sendJson(res, 200, { settings });
    return;
  }
  if (pathname === '/api/selftest' && req.method === 'POST') {
    sendJson(res, 200, core.selfTest());
    return;
  }
  sendJson(res, 404, { error: `未知 API：${req.method} ${pathname}` });
}

// ── 服务启动 ────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = u.pathname;
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
  if (pathname === '/__health') {
    sendJson(res, 200, { status: 'ok', version: VERSION, degraded, busy: !!currentRun, uptime: Date.now() - STARTED_AT });
    return;
  }
  if (!authOk(req)) {
    sendJson(res, 401, { error: '未授权：需要 Bearer token（面板/MCP 经 depprobe.meta 获取）' });
    return;
  }
  handleApi(req, res, pathname, u.searchParams).catch((e) => {
    log('error', `API 处理异常 ${pathname}: ${e.message}`);
    if (!res.headersSent) sendJson(res, 500, { error: `服务内部错误：${e.message}` });
    else try { res.end(); } catch (_) { /* 忽略 */ }
  });
});

function writeMeta() {
  if (degraded) { log('warn', '降级模式，跳过 meta 心跳'); return; }
  const meta = { port: PORT, token, pid: process.pid, version: VERSION, startedAt: STARTED_AT, live: Date.now() };
  kv.kvSet('depprobe.meta', meta).catch((e) => {
    degraded = true;
    log('warn', `meta 心跳失败，转入降级模式（内存继续可用）：${e.message}`);
  });
}

server.listen(PORT, '127.0.0.1', () => {
  log('info', `依赖体检台服务 http://127.0.0.1:${PORT} (pid ${process.pid}, v${VERSION}, osv=${OSV_BASE})`);
  (async () => {
    try {
      const meta = await kv.kvGet('depprobe.meta');
      if (meta && typeof meta.token === 'string' && meta.token.length >= 32) {
        token = meta.token;
        log('info', 'token 自 kv meta 恢复');
      }
      const saved = await kv.kvGet('depprobe.settings');
      if (saved) settings = clampSettings(saved);
    } catch (e) {
      log('warn', `启动恢复失败（将以新 token 运行）：${e.message}`);
    }
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
