'use strict';
/**
 * main.js —— 仓库体检台后台服务（node ≥18，零外部依赖；数据不出本机）
 *
 * 职责：把「一个仓库路径」变成一份八维体检报告。
 *   校验路径 → 解析仓库根 → git log --numstat 流式采集 → churn/耦合/卫生/巴士因子
 *   → ls-files 读工作区 → 近似复杂度 + 重复检测 → 历史大对象 + 分支 → 健康分
 *   → cap.kv 投影（三端可看）。
 *
 * 架构（dep-probe / stream-desk 三方共享 cap.kv 同一事实库范式）：
 *   面板 ──(127.0.0.1 直连 + Bearer token，轮询进度)──▶ 本服务
 *   MCP  ──(kv 读 repolens.meta 拿 port/token → 127.0.0.1 直连)──▶ 本服务
 *   本服务 ──(kvclient → 宿主 /api/router-dispatch → cap.kv)──▶ 宿主
 *
 * kv 键空间（全部 repolens. 前缀，勿与他插件撞）：
 *   repolens.meta            {port,token,pid,version,startedAt,live} 心跳 60s
 *   repolens.settings        {recentPaths[], defaults{days,maxCommits}}
 *   repolens.runs            扫描历史索引（cap 20）
 *   repolens.latest          最近 runId
 *   repolens.report.<runId>  完整报告投影（热点 cap 300 等，core.projectReport 裁剪）
 *
 * 安全模型：
 *   - 仅监听 127.0.0.1；除 /__health 外全部要求 Authorization: Bearer <token>（timingSafe 比对）
 *   - git 子命令白名单且全只读（log/ls-files/rev-parse/rev-list/cat-file/for-each-ref/--version），
 *     不接受任何用户/工具传入的 git 参数；spawn 无 shell、windowsHide
 *   - 零网络出站（唯一 HTTP 是回环服务本身与宿主 kv 桥）；唯一写盘 = 经宿主的 kv 投影
 *   - 不写仓库任何文件
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const { createKvClient } = require('./kvclient');
const core = require('../shared/core');

const VERSION = core.VERSION;
const PORT = parseInt(process.argv[2] || '0', 10) || 0;
const appConfigDir = process.argv[3] || '';
const STARTED_AT = Date.now();
const META_BEAT_MS = 60_000;

// 扫描上限（防失控；超出即截断并在 warnings 明示，不静默）
const MAX_COMMITS_DEFAULT = 5000;
const MAX_COMMITS_HARD = 20_000;
const MAX_FILES_READ = 3000;
const MAX_FILE_BYTES = 1024 * 1024;       // 单文件参与复杂度/重复的上限
const MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 全部读取内容上限
const MAX_LOG_BYTES = 64 * 1024 * 1024;   // git log 输出上限
const GIT_TIMEOUT_MS = 120_000;
const BLOB_TIMEOUT_MS = 90_000;
const MAX_REV_OBJECTS = 400_000;
const MAX_RUNS = 20;
const REPORTS_KEPT = 10;

// ── 日志（stderr；stdout 不承载业务）────────────────────────────────────────
function log(level, msg) {
  try { process.stderr.write(`[repo-lens-svc][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

const kv = createKvClient({ appConfigDir, log });

// ── 状态 ────────────────────────────────────────────────────────────────────
let token = crypto.randomBytes(32).toString('hex');
let degraded = false; // 宿主 kv 桥不可达 = 面板/MCP 仍可用本服务，报告不投影
let settings = { recentPaths: [], defaults: { days: 365, maxCommits: MAX_COMMITS_DEFAULT } };
let currentRun = null;   // 进行中的扫描状态
let lastRunId = null;    // 最近一次成功扫描（kv latest / meta.lastRunId；失败不覆盖，面板打开不恢复失败 run）
const reports = new Map(); // runId → 完整报告（内存权威，cap REPORTS_KEPT）
const runs = [];           // 历史索引（cap MAX_RUNS）

function clampSettings(s) {
  const out = { recentPaths: [], defaults: { days: 365, maxCommits: MAX_COMMITS_DEFAULT } };
  if (s && Array.isArray(s.recentPaths)) {
    out.recentPaths = s.recentPaths.filter((p) => typeof p === 'string').slice(0, 10)
      .map((p) => p.slice(0, 500));
  }
  if (s && s.defaults && typeof s.defaults === 'object') {
    const d = s.defaults;
    out.defaults.days = Math.min(3650, Math.max(7, Number(d.days) || 365));
    out.defaults.maxCommits = Math.min(MAX_COMMITS_HARD, Math.max(100, Number(d.maxCommits) || MAX_COMMITS_DEFAULT));
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
  await kvSafe(() => kv.kvSet('repolens.settings', settings), 'settings');
}

async function loadSettings() {
  try {
    const s = await kv.kvGet('repolens.settings');
    if (s) settings = clampSettings(s);
  } catch (e) { log('warn', `读设置失败（保持默认）：${e.message}`); }
}

async function persistRunIndex() {
  await kvSafe(() => kv.kvSet('repolens.runs', runs.slice(0, MAX_RUNS)), 'runs');
  if (lastRunId) await kvSafe(() => kv.kvSet('repolens.latest', lastRunId), 'latest');
}

// ── git 只读子进程 ──────────────────────────────────────────────────────────

/** 固定白名单的 git 调用。args 仅由本文件常量+校验过的数字/路径组成。 */
function gitRun(repoTop, args, opts) {
  const timeoutMs = (opts && opts.timeoutMs) || GIT_TIMEOUT_MS;
  const maxBytes = (opts && opts.maxBytes) || 32 * 1024 * 1024;
  const stdinData = (opts && opts.input) || null;
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', 'core.quotepath=false', ...args], {
      cwd: repoTop, windowsHide: true, shell: false,
      stdio: stdinData != null ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });
    let out = []; let outLen = 0; let errText = ''; let truncated = false;
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; try { child.kill(); } catch (_) { /* 已退出 */ } reject(new Error(`git ${args[0]} 超时（${Math.round(timeoutMs / 1000)}s）`)); }
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      outLen += chunk.length;
      if (outLen > maxBytes) { truncated = true; try { child.kill(); } catch (_) { /* 已退出 */ } return; }
      out.push(chunk);
    });
    child.stderr.on('data', (c) => { if (errText.length < 8000) errText += c.toString('utf8'); });
    child.on('error', (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(`git 启动失败：${e.message}（本机需已安装 git 并在 PATH）`)); } });
    child.on('close', (code) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (truncated) resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: errText, truncated: true });
      else if (code === 0) resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: errText, truncated: false });
      else reject(new Error(`git ${args[0]} 退出码 ${code}：${errText.trim().split('\n')[0] || '无 stderr'}`));
    });
    if (stdinData != null) {
      child.stdin.on('error', () => { /* EPIPE 于子进程提前退出时发生，交由 close 处理 */ });
      child.stdin.end(stdinData);
    }
  });
}

async function gitVersion() {
  try { const r = await gitRun('.', ['--version'], { timeoutMs: 10_000 }); return r.stdout.trim().split('\n')[0] || ''; }
  catch (e) { throw new Error(`git 不可用：${e.message}`); }
}

/** 校验路径是目录且在 git 工作树内，返回 {top, branch, head} */
async function resolveRepo(inputPath) {
  const p = String(inputPath || '').trim().replace(/^"(.*)"$/, '$1');
  if (!p) throw new Error('路径为空');
  let st;
  try { st = fs.statSync(p); } catch (_) { throw new Error(`路径不存在或不可读：${p}`); }
  if (!st.isDirectory()) throw new Error(`不是目录：${p}`);
  let top = '';
  try {
    const rev = await gitRun(p, ['rev-parse', '--show-toplevel'], { timeoutMs: 15_000 });
    top = rev.stdout.trim().split('\n')[0] || '';
  } catch (_) {
    throw new Error(`目标目录不在 git 仓库内（rev-parse --show-toplevel 失败）：${p}`);
  }
  let branch = 'HEAD';
  try {
    const b = await gitRun(top, ['rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 15_000 });
    branch = b.stdout.trim().split('\n')[0] || 'HEAD';
  } catch (_) { /* 空仓库（无首个提交）：branch 保持 HEAD */ }
  let head = '';
  try { const h = await gitRun(top, ['rev-parse', 'HEAD'], { timeoutMs: 15_000 }); head = h.stdout.trim().slice(0, 12); } catch (_) { /* 空仓库 */ }
  return { top, branch, head, input: p };
}

// ── 采集与编排 ──────────────────────────────────────────────────────────────

function buildLogArgs(days, maxCommits) {
  // rename 检测走 git 默认（diff.renames=true）：numstat 输出 old => new，core 归因到新路径。
  // --pretty=format: 的 %x02/%x01 是控制字节分隔（subject 内几乎不会出现；解析器仍有兜底）。
  const args = [
    'log', '--numstat', '--date=unix', '--no-color',
    '--pretty=format:%x02%H%x01%an%x01%ae%x01%at%x01%s',
  ];
  if (Number.isFinite(days) && days > 0) args.push(`--since=@${Math.floor(Date.now() / 1000) - days * 86400}`);
  args.push('-n', String(Math.max(1, Math.min(MAX_COMMITS_HARD, maxCommits | 0))));
  return args;
}

async function collectCommits(top, days, maxCommits, warn) {
  const r = await gitRun(top, buildLogArgs(days, maxCommits), { maxBytes: MAX_LOG_BYTES, timeoutMs: GIT_TIMEOUT_MS });
  if (r.truncated) warn(`git log 输出超出 ${Math.round(MAX_LOG_BYTES / 1048576)}MB 上限被截断，历史统计不完整`);
  const { commits, warnings } = core.parseNumstatLog(r.stdout);
  for (const w of warnings.slice(0, 5)) warn(`numstat 解析：${w}`);
  return commits;
}

/** ls-files（只列 git 跟踪文件，天然排除 ignored） */
async function collectTracked(top, warn) {
  try {
    const r = await gitRun(top, ['ls-files', '-z'], { maxBytes: 24 * 1024 * 1024, timeoutMs: 60_000 });
    const list = r.stdout.split('\0').filter(Boolean);
    if (r.truncated) warn(`ls-files 输出被截断，部分工作区文件未纳入`);
    return list;
  } catch (e) {
    warn(`ls-files 失败（工作区复杂度/重复维度将缺失）：${e.message}`);
    return [];
  }
}

/** 读工作区文件（已过滤豁免路径），返回 [{path,content,lang}] 与语言聚合 */
async function readWorkingFiles(top, tracked, warn, onProgress) {
  const candidates = [];
  for (const t of tracked) {
    const norm = t.replace(/\\/g, '/');
    if (core.skipContent(norm)) continue;
    const d = core.detectLanguage(norm);
    if (d.kind !== 'code' && d.kind !== 'text') continue;
    candidates.push(norm);
    if (candidates.length >= MAX_FILES_READ * 2) break; // 预筛上限，读的时候再裁
  }
  const files = [];
  const langAgg = new Map();
  let totalBytes = 0;
  let binarySkipped = 0; let oversizeSkipped = 0;
  const CONC = 8;
  let idx = 0;
  async function worker() {
    while (idx < candidates.length) {
      const my = idx++;
      if (files.length >= MAX_FILES_READ || totalBytes >= MAX_TOTAL_BYTES) return;
      const p = candidates[my];
      const abs = path.join(top, ...p.split('/'));
      let buf;
      try { buf = await fs.promises.readFile(abs); } catch (_) { continue; } // 已删除/不可读：跳过
      if (buf.length > MAX_FILE_BYTES) { oversizeSkipped++; continue; }
      const head = buf.subarray(0, 8192);
      if (head.includes(0)) { binarySkipped++; continue; } // 内容级二进制探测
      totalBytes += buf.length;
      if (files.length >= MAX_FILES_READ || totalBytes >= MAX_TOTAL_BYTES) return;
      const content = buf.toString('utf8');
      const lang = core.detectLanguage(p).lang;
      files.push({ path: p, content, lang });
      let la = langAgg.get(lang);
      if (!la) { la = { lang, files: 0, codeLines: 0 }; langAgg.set(lang, la); }
      la.files++;
      if (onProgress && my % 50 === 0) onProgress(my / candidates.length);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  if (files.length >= MAX_FILES_READ) warn(`读取文件数达上限 ${MAX_FILES_READ}，复杂度/重复只覆盖部分工作区`);
  if (totalBytes >= MAX_TOTAL_BYTES) warn(`读取内容达 ${Math.round(MAX_TOTAL_BYTES / 1048576)}MB 上限，提前停止`);
  if (binarySkipped) warn(`跳过二进制内容文件 ${binarySkipped} 个（内容探测）`);
  if (oversizeSkipped) warn(`跳过超 ${Math.round(MAX_FILE_BYTES / 1024)}KB 大文件 ${oversizeSkipped} 个`);
  const langs = [...langAgg.values()].sort((a, b) => b.codeLines - a.codeLines);
  return { files, langs, totalBytes };
}

async function collectBlobs(top, warn) {
  try {
    const rev = await gitRun(top, ['rev-list', '--objects', '--all'], { maxBytes: 48 * 1024 * 1024, timeoutMs: BLOB_TIMEOUT_MS });
    const objects = core.parseRevObjects(rev.stdout).slice(0, MAX_REV_OBJECTS);
    if (rev.truncated || objects.length >= MAX_REV_OBJECTS) warn(`历史对象遍历达上限 ${MAX_REV_OBJECTS}，大对象统计不完整`);
    // cat-file --batch-check 批量喂 sha（stdin）
    const shas = objects.map((o) => o.sha).join('\n') + '\n';
    const bc = await gitRun(top, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize) %(rest)'], { input: shas, maxBytes: 48 * 1024 * 1024, timeoutMs: BLOB_TIMEOUT_MS });
    const checks = core.parseBatchCheck(bc.stdout);
    return core.aggregateBlobs(objects, checks, { topN: 30 });
  } catch (e) {
    warn(`历史大对象统计失败（已跳过，不影响其余维度）：${e.message}`);
    return [];
  }
}

async function collectBranches(top, warn) {
  try {
    const r = await gitRun(top, ['for-each-ref', 'refs/heads', '--sort=committerdate', '--format=%(committerdate:unix)%09%(refname:short)%09%(authorname)%09%(subject)'], { timeoutMs: 30_000 });
    return core.parseBranches(r.stdout);
  } catch (e) {
    warn(`分支枚举失败（已跳过）：${e.message}`);
    return [];
  }
}

/** 组装报告（纯编排，分析逻辑全部在 core） */
async function runScan(runId, inputPath, opts) {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const report = {
    runId, startedAt: Date.now(), status: 'running',
    repo: null, window: opts, totals: {}, languages: [], health: null,
    hotspots: [], couples: [], duplications: { pairs: [] }, dupSummary: {},
    blobs: [], branches: [], hygiene: null, busFactor: null, warnings: [],
  };
  const progress = (phase, frac, msg) => {
    currentRun = { ...(currentRun || {}), runId, phase, progress: frac, message: msg || phase };
  };
  try {
    progress('probe', 0.03, '校验 git 与仓库');
    const gitVer = await gitVersion();
    const repo = await resolveRepo(inputPath);
    report.repo = { top: repo.top, branch: repo.branch, commitHead: repo.head };
    log('info', `扫描开始 run=${runId} repo=${repo.top} branch=${repo.branch} git=${gitVer}`);

    progress('history', 0.10, '读取提交历史');
    const commits = await collectCommits(repo.top, opts.days, opts.maxCommits, warn);
    if (!commits.length) warn('时间窗内没有提交（放宽天数或检查分支）');
    report.__commits = commits; // 文件下钻用；不进 kv 投影与 /api/report 响应

    progress('analyze', 0.45, '归并 churn/耦合/卫生');
    const churn = core.buildChurn(commits);
    const hygiene = core.analyzeHygiene(commits);
    const busFactor = core.buildBusFactor(commits);

    progress('files', 0.55, '读取工作区文件');
    const tracked = await collectTracked(repo.top, warn);
    const { files, langs, totalBytes } = await readWorkingFiles(repo.top, tracked, warn, (f) => progress('files', 0.55 + f * 0.2, `读取工作区 ${Math.round(f * 100)}%`));
    const filesCx = new Map();
    const locMap = new Map();
    let totalCodeLines = 0;
    for (const f of files) {
      const cx = core.analyzeComplexity(f.path, f.content);
      filesCx.set(f.path, cx);
      locMap.set(f.path, cx.codeLines);
      totalCodeLines += cx.codeLines;
    }

    progress('duplicate', 0.78, '重复代码检测');
    const duplication = core.findDuplication(files, { maxPairs: 100 });

    progress('hotspots', 0.84, '热点合并');
    const hotspots = core.buildHotspots(churn, filesCx, locMap);

    progress('couples', 0.88, '时间耦合统计');
    const couples = core.buildCoChange(commits, churn, { minCo: 3, minRatio: 0.5, maxPairs: 100 });

    progress('blobs', 0.92, '历史大对象与分支');
    const blobs = await collectBlobs(repo.top, warn);
    const branches = await collectBranches(repo.top, warn);

    progress('assemble', 0.97, '汇总评分');
    const health = core.healthScore({
      hotspotRows: hotspots,
      totalCodeLines,
      totalDupLines: duplication.totalDupLines,
      conventionalRate: hygiene.conventionalRate,
      busFactor: busFactor.busFactor,
      blobs,
    });

    Object.assign(report, {
      finishedAt: Date.now(), status: 'ok',
      window: { days: opts.days, maxCommits: opts.maxCommits, sinceIso: opts.days > 0 ? new Date(Date.now() - opts.days * 86400_000).toISOString().slice(0, 10) : null },
      totals: {
        commits: commits.length,
        filesTracked: files.length,
        totalBytesRead: totalBytes,
        churnFiles: churn.size,
        codeLines: totalCodeLines,
        durationMs: Date.now() - report.startedAt,
      },
      languages: langs,
      health,
      hotspots,
      couples,
      duplications: { pairs: duplication.pairs },
      dupSummary: {
        totalDupLines: duplication.totalDupLines,
        ratio: totalCodeLines ? Math.round((duplication.totalDupLines / totalCodeLines) * 10000) / 10000 : 0,
        filesSkipped: duplication.truncated.filesSkipped,
        windowsCapped: duplication.truncated.windowsCapped,
      },
      blobs,
      branches,
      hygiene,
      busFactor,
      warnings,
      gitVersion: gitVer,
    });
    log('info', `扫描完成 run=${runId} commits=${commits.length} hotspots=${hotspots.length} dupPairs=${duplication.pairs.length} health=${health.total} ${report.totals.durationMs}ms`);
  } catch (e) {
    report.status = 'error';
    report.finishedAt = Date.now();
    report.error = String(e && e.message || e);
    report.warnings = warnings;
    log('error', `扫描失败 run=${runId}: ${report.error}`);
  }
  return report;
}

/** 单飞行扫描入口。返回 {runId} 或抛 409。 */
async function startScan(inputPath, optsIn) {
  if (currentRun && currentRun.status === 'running') {
    const err = new Error('已有扫描在进行中（单飞行）；请等待完成或稍后再试');
    err.status = 409;
    throw err;
  }
  const rawDays = Number(optsIn && optsIn.days);
  const rawMc = Number(optsIn && optsIn.maxCommits);
  const opts = {
    days: Number.isFinite(rawDays) && rawDays > 0 ? Math.min(3650, Math.round(rawDays)) : settings.defaults.days,
    maxCommits: Number.isFinite(rawMc) && rawMc > 0 ? Math.min(MAX_COMMITS_HARD, Math.round(rawMc)) : settings.defaults.maxCommits,
  };
  const runId = 'r' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  currentRun = { runId, path: inputPath, status: 'running', phase: 'queued', progress: 0, startedAt: Date.now(), message: '排队中' };
  // 异步执行；HTTP 立即返回 runId 供轮询
  (async () => {
    try {
      const report = await runScan(runId, inputPath, opts);
      reports.set(runId, report);
      while (reports.size > REPORTS_KEPT) {
        const oldest = [...reports.keys()][0];
        reports.delete(oldest);
      }
      const brief = {
        runId, path: inputPath, startedAt: report.startedAt, finishedAt: report.finishedAt,
        status: report.status, error: report.error ? report.error.slice(0, 300) : undefined,
        health: report.health ? report.health.total : null,
        commits: report.totals ? report.totals.commits : 0,
        topHotspot: report.hotspots && report.hotspots[0] ? report.hotspots[0].path : null,
        durationMs: report.totals ? report.totals.durationMs : null,
      };
      const i = runs.findIndex((r) => r.runId === runId);
      if (i >= 0) runs[i] = brief; else runs.unshift(brief);
      while (runs.length > MAX_RUNS) runs.pop();
      if (report.status === 'ok') {
        lastRunId = runId;
        const recents = settings.recentPaths.filter((p) => p !== inputPath);
        recents.unshift(inputPath);
        settings.recentPaths = recents.slice(0, 10);
        await persistSettings();
      }
      await kvSafe(() => kv.kvSet('repolens.report.' + runId, core.projectReport(report)), 'report');
      await persistRunIndex();
      if (currentRun && currentRun.runId === runId) {
        currentRun = { ...currentRun, status: report.status, progress: 1, finishedAt: report.finishedAt, message: report.status === 'ok' ? '完成' : report.error };
      }
    } catch (e) {
      log('error', `扫描编排异常 run=${runId}: ${e.message}`);
      if (currentRun && currentRun.runId === runId) {
        currentRun = { ...currentRun, status: 'error', progress: 1, message: e.message };
      }
      const i = runs.findIndex((r) => r.runId === runId);
      const brief = { runId, path: inputPath, startedAt: Date.now(), finishedAt: Date.now(), status: 'error', error: String(e.message).slice(0, 300) };
      if (i >= 0) runs[i] = brief; else runs.unshift(brief);
      await persistRunIndex();
    }
  })();
  return { runId };
}

// ── 文件下钻（从内存 commits/reports 重算，无 IO）──────────────────────────

function fileDetail(runId, filePath) {
  const report = reports.get(runId);
  if (!report || report.status !== 'ok') throw new Error(`报告不存在或未完成：${runId}`);
  const commits = report.__commits; // 内部保留（不进 kv 投影）
  if (!commits) throw new Error('详情数据不可用（服务重启后请重扫）');
  const mine = commits.filter((c) => c.files.some((f) => f.path === filePath));
  // 周粒度时间线（52 桶）
  const now = Date.now() / 1000;
  const buckets = Array.from({ length: 52 }, (_, i) => ({ week: Math.floor(now / 604800) - 51 + i, commits: 0, churn: 0 }));
  const idxOf = (date) => Math.min(51, Math.max(0, Math.floor(date / 604800) - (Math.floor(now / 604800) - 51)));
  for (const c of mine) {
    const b = buckets[idxOf(c.date)];
    if (!b) continue;
    b.commits++;
    for (const f of c.files) if (f.path === filePath && !f.binary) b.churn += f.adds + f.dels;
  }
  const h = report.hotspots.find((x) => x.path === filePath) || null;
  const partners = new Map();
  for (const c of mine) {
    for (const f of c.files) {
      if (f.path === filePath || f.binary) continue;
      partners.set(f.path, (partners.get(f.path) || 0) + 1);
    }
  }
  const coPartners = [...partners.entries()].map(([p, n]) => ({ path: p, coCommits: n }))
    .sort((a, b) => b.coCommits - a.coCommits).slice(0, 15);
  const authors = new Map();
  for (const c of mine) {
    const a = c.author || 'unknown';
    authors.set(a, (authors.get(a) || 0) + 1);
  }
  const authorList = [...authors.entries()].map(([name, n]) => ({ name, commits: n })).sort((a, b) => b.commits - a.commits).slice(0, 10);
  const dupPairs = (report.duplications.pairs || []).filter((p) => p.a === filePath || p.b === filePath);
  return {
    path: filePath,
    summary: h ? {
      score: h.score, commits: h.commits, addedLines: h.addedLines, deletedLines: h.deletedLines,
      loc: h.loc, cxScore: h.cxScore, cxRaw: h.cxRaw, lang: h.lang, authors: h.authors,
      topAuthor: h.topAuthor, topAuthorShare: Math.round(h.topAuthorShare * 100) / 100, lastTouch: h.lastTouch,
    } : null,
    timeline: buckets.map((b) => ({ weekStartIso: new Date(b.week * 604800 * 1000).toISOString().slice(0, 10), commits: b.commits, churn: b.churn })),
    authors: authorList,
    coPartners,
    duplications: dupPairs,
  };
}

// ── HTTP 服务 ───────────────────────────────────────────────────────────────

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS });
  res.end(body);
}

function readBody(req, cap) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > cap) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS_HEADERS); res.end(); return; }
  if (p === '/__health') { sendJson(res, 200, { ok: true, version: VERSION, uptime: Date.now() - STARTED_AT }); return; }
  // 其余全部鉴权
  const auth = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m || !timingSafeEq(m[1], token)) { sendJson(res, 401, { error: '未授权（Bearer token 不匹配）' }); return; }

  try {
    if (req.method === 'GET' && p === '/api/meta') {
      sendJson(res, 200, {
        version: VERSION, pid: process.pid, degraded, uptime: Date.now() - STARTED_AT,
        currentRun: currentRun ? { ...currentRun } : null,
        lastRunId, settings, reportsInMemory: reports.size,
      });
      return;
    }
    if (req.method === 'POST' && p === '/api/scan') {
      const body = JSON.parse((await readBody(req, 64 * 1024)) || '{}');
      const r = await startScan(String(body.path || ''), { days: body.days, maxCommits: body.maxCommits });
      sendJson(res, 200, r);
      return;
    }
    if (req.method === 'GET' && /^\/api\/scan\/[\w-]+$/.test(p)) {
      const runId = p.split('/').pop();
      // 透传 currentRun 的真实状态（不能硬编码 running：扫描完成后 currentRun 仍持有该 runId）
      if (currentRun && currentRun.runId === runId) {
        sendJson(res, 200, {
          runId,
          status: currentRun.status,
          phase: currentRun.phase,
          progress: currentRun.progress,
          message: currentRun.message,
          startedAt: currentRun.startedAt,
          finishedAt: currentRun.finishedAt,
        });
        return;
      }
      const brief = runs.find((r) => r.runId === runId);
      if (brief) { sendJson(res, 200, { ...brief, status: brief.status === 'running' ? 'ok' : brief.status }); return; }
      sendJson(res, 404, { error: `未知 runId：${runId}` });
      return;
    }
    if (req.method === 'GET' && p === '/api/runs') {
      sendJson(res, 200, { runs: runs.slice(0, MAX_RUNS), degraded, version: VERSION });
      return;
    }
    if (req.method === 'GET' && /^\/api\/report\/[\w-]+$/.test(p)) {
      const runId = p.split('/').pop();
      const report = reports.get(runId);
      if (!report) { sendJson(res, 404, { error: `报告不在内存（服务重启会丢失，请重扫或查 kv 投影）：${runId}` }); return; }
      const clone = { ...report };
      delete clone.__commits;
      sendJson(res, 200, { report: clone });
      return;
    }
    if (req.method === 'GET' && p === '/api/file') {
      const runId = url.searchParams.get('runId') || lastRunId;
      const fp = url.searchParams.get('path') || '';
      if (!fp) { sendJson(res, 400, { error: '缺少 path 参数' }); return; }
      sendJson(res, 200, fileDetail(runId, fp));
      return;
    }
    if (req.method === 'GET' && p === '/api/settings') {
      sendJson(res, 200, { settings, degraded, version: VERSION, uptime: Date.now() - STARTED_AT });
      return;
    }
    if (req.method === 'POST' && p === '/api/settings') {
      const body = JSON.parse((await readBody(req, 64 * 1024)) || '{}');
      if (body.defaults) settings.defaults = clampSettings({ defaults: body.defaults, recentPaths: settings.recentPaths }).defaults;
      if (Array.isArray(body.recentPaths)) settings.recentPaths = clampSettings({ recentPaths: body.recentPaths, defaults: settings.defaults }).recentPaths;
      await persistSettings();
      sendJson(res, 200, { settings });
      return;
    }
    if (req.method === 'POST' && p === '/api/selftest') {
      const st = core.selftest();
      let git = '';
      try { git = await gitVersion(); } catch (e) { git = `git 不可用：${e.message}`; }
      sendJson(res, 200, { ...st, git });
      return;
    }
    sendJson(res, 404, { error: `未知端点：${req.method} ${p}` });
  } catch (e) {
    const status = e && e.status ? e.status : 500;
    log('warn', `API ${p} 失败：${e.message}`);
    sendJson(res, status, { error: e.message });
  }
});

// ── 启动 ────────────────────────────────────────────────────────────────────

server.listen(PORT, '127.0.0.1', async () => {
  const addr = server.address();
  log('info', `repo-lens 服务已启动 127.0.0.1:${addr.port} (pid ${process.pid}, v${VERSION})`);
  await loadSettings();
  // meta 里的 port 用实际监听端口
  const metaPort = addr.port;
  const beat = async () => {
    await kvSafe(() => kv.kvSet('repolens.meta', {
      port: metaPort, token, pid: process.pid, version: VERSION,
      startedAt: STARTED_AT, live: Date.now(),
    }), 'meta');
  };
  await beat();
  setInterval(beat, META_BEAT_MS).unref();
});

process.on('uncaughtException', (e) => { log('error', `uncaughtException: ${e.stack || e.message}`); });
process.on('unhandledRejection', (e) => { log('error', `unhandledRejection: ${e && e.message ? e.message : e}`); });
