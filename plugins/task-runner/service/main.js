#!/usr/bin/env node
'use strict';
/**
 * main.js —— 定时任务台后台服务（零依赖，node ≥ 18）
 *
 * 职责（骨架语义对齐 plugin-forge service 主题）：
 *   - tick 2s：读设置(30s 热更) → 租约(多实例防双跑) → 消费命令键(先删后做)
 *     → 到期任务顺序执行(并发=1) → meta 心跳(60s)
 *   - 错过补跑：服务启动后首轮发现 overdue 任务 → 只补一次（missed:true）
 *     → 从当前时间重排，不回放积压（data-ark 同款语义）
 *   - /__health 恒 200：bridge 不可达也活着（降级语义见 meta.degraded）
 *   - 日志自落盘 <appConfigDir>/task-runner.log（宿主不收集 stdout）
 *
 * 生命周期由宿主 PluginServiceManager 管理。启动参数：node main.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const engine = require('../shared/engine');
const core = require('../shared/exec-core');
const { createStore, K } = require('./store');
const { executeJob } = require('./executors');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 2000;
const META_BEAT_MS = 60 * 1000;
const SETTINGS_REREAD_MS = 30 * 1000;

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘 + 512KB 轮转）─────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'task-runner.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.TASKRUN_DEBUG === '1';
function log(level, msg) {
  const line = `[task-runner:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.argv[2], 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

initLog(APP_CONFIG_DIR);

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
const store = createStore(kv);

let settings = core.normalizeSettings(null);
let settingsReadAt = 0;
let degraded = false;
let lastEndpointRefreshAt = 0;
const startedAt = Date.now();
let lastMetaAt = 0;

let jobsCache = null; // 服务是 jobs 唯一写者；内存为准，30s 与 kv 对账一次
let jobsReadAt = 0;
let catchUpDone = false; // 错过补跑只做一次
let isLeaseholder = false;
let leaseCheckAt = 0;
let executing = false; // 并发=1：同一 tick 只推进一个执行链
const runQueue = []; // { job, trigger, missed }

// ── 任务表访问（单写者：内存为准，写后落 kv）───────────────────────────────
async function loadJobs() {
  if (jobsCache && Date.now() - jobsReadAt < SETTINGS_REREAD_MS) return jobsCache;
  const raw = await store.getJobsRaw();
  jobsCache = raw.jobs.filter((j) => j && typeof j === 'object');
  jobsReadAt = Date.now();
  return jobsCache;
}

async function persistJobs(jobs) {
  jobsCache = jobs;
  jobsReadAt = Date.now();
  await store.saveJobs(jobs);
}

// ── 执行一条并落历史/推进调度 ───────────────────────────────────────────────
async function runOne(job, trigger, missed) {
  const providers = job.type === 'ai' ? await store.getProviders() : [];
  const startedAt = Date.now();
  const r = await executeJob(job, { settings, providers });
  const { run: rec } = await store.appendRun({
    id: store.genId('run'),
    jobId: job.id,
    jobName: job.name,
    type: job.type,
    trigger,
    missed: !!missed,
    status: r.status,
    summary: r.summary,
    excerpt: r.excerpt,
    startedAt,
    durationMs: Date.now() - startedAt,
  }, settings.retentionRuns);
  // 就地更新任务的运行时字段（不改 nextRunAt——推进由调用方负责）
  job.lastRunAt = startedAt;
  job.lastStatus = r.status;
  job.lastSummary = r.summary;
  return rec;
}

async function pumpQueue() {
  if (executing || runQueue.length === 0) return;
  executing = true;
  try {
    let dirty = false;
    for (;;) {
      const item = runQueue.shift();
      if (!item) break;
      const { job, trigger, missed } = item;
      try {
        const run = await runOne(job, trigger, missed);
        dirty = true;
        log('info', `任务 ${job.name}(${job.id}) ${trigger}${missed ? '/补跑' : ''} → ${run.status}: ${run.summary}`);
        if (trigger === 'manual') {
          await store.writeResult(item.nonce, { ok: true, runId: run.id, status: run.status, summary: run.summary });
        }
      } catch (e) {
        log('warn', `任务 ${job.id} 执行异常: ${e.message}`);
        if (trigger === 'manual') {
          await store.writeResult(item.nonce, { ok: false, error: core.strLimit(e.message, 200) });
        }
      }
    }
    // lastRunAt/lastStatus 已就地更新，统一落 kv（面板读得到）
    if (dirty) await persistJobs(jobsCache || []);
  } finally {
    executing = false;
  }
}

// ── 命令消费（先删后做 = 幂等核心）──────────────────────────────────────────
async function consumeCommands() {
  const keys = await kv.kvKeys();
  const cmdKeys = keys.filter((k) => k.startsWith(K.cmdPrefix));
  for (const k of cmdKeys) {
    const nonce = k.slice(K.cmdPrefix.length).split('.').pop();
    const cmd = await kv.kvGet(k).catch(() => null);
    const delOk = await kv.kvDel(k).then(() => true).catch(() => false);
    if (!delOk) continue; // 别人抢到了
    if (!cmd || typeof cmd !== 'object') continue;
    const op = cmd.op || k.slice(K.cmdPrefix.length).replace(/\.[^.]*$/, '');
    try {
      await handleCommand(op, cmd, nonce);
    } catch (e) {
      log('warn', `命令 ${op} 失败: ${e.message}`);
      await store.writeResult(nonce, { ok: false, error: core.strLimit(e.message, 300) });
    }
  }
}

async function handleCommand(op, cmd, nonce) {
  const jobs = await loadJobs();
  if (op === 'add') {
    if (jobs.length >= core.MAX_JOBS) throw new Error(`任务数已达上限（${core.MAX_JOBS}），请先删除不需要的任务`);
    const norm = core.normalizeJob(cmd.job, () => store.genId('job'));
    if (!norm.ok) throw new Error(norm.error);
    norm.job.nextRunAt = engine.nextRunAt(norm.job.schedule, Date.now());
    jobs.push(norm.job);
    await persistJobs(jobs);
    log('info', `新增任务 ${norm.job.name}(${norm.job.id}) 下次触发 ${new Date(norm.job.nextRunAt).toLocaleString()}`);
    await store.writeResult(nonce, { ok: true, jobId: norm.job.id, nextRunAt: norm.job.nextRunAt });
    return;
  }
  if (op === 'update') {
    const idx = jobs.findIndex((j) => j.id === cmd.id);
    if (idx === -1) throw new Error(`任务不存在：${cmd.id}`);
    const patch = cmd.patch && typeof cmd.patch === 'object' ? cmd.patch : {};
    const merged = core.normalizeJob({
      ...jobs[idx],
      ...patch,
      id: jobs[idx].id,
      createdAt: jobs[idx].createdAt,
      enabled: patch.enabled !== undefined ? patch.enabled : jobs[idx].enabled,
    }, () => jobs[idx].id);
    if (!merged.ok) throw new Error(merged.error);
    merged.job.nextRunAt = engine.nextRunAt(merged.job.schedule, Date.now());
    jobs[idx] = merged.job;
    await persistJobs(jobs);
    await store.writeResult(nonce, { ok: true, jobId: merged.job.id, nextRunAt: merged.job.nextRunAt });
    return;
  }
  if (op === 'remove') {
    const idx = jobs.findIndex((j) => j.id === cmd.id);
    if (idx === -1) throw new Error(`任务不存在：${cmd.id}`);
    const [gone] = jobs.splice(idx, 1);
    await persistJobs(jobs);
    log('info', `删除任务 ${gone.name}(${gone.id})`);
    await store.writeResult(nonce, { ok: true, jobId: gone.id });
    return;
  }
  if (op === 'setEnabled') {
    const idx = jobs.findIndex((j) => j.id === cmd.id);
    if (idx === -1) throw new Error(`任务不存在：${cmd.id}`);
    jobs[idx].enabled = cmd.enabled !== false;
    jobs[idx].updatedAt = Date.now();
    jobs[idx].nextRunAt = jobs[idx].enabled ? engine.nextRunAt(jobs[idx].schedule, Date.now()) : null;
    await persistJobs(jobs);
    await store.writeResult(nonce, { ok: true, jobId: jobs[idx].id, enabled: jobs[idx].enabled, nextRunAt: jobs[idx].nextRunAt });
    return;
  }
  if (op === 'runNow') {
    const job = jobs.find((j) => j.id === cmd.id);
    if (!job) throw new Error(`任务不存在：${cmd.id}`);
    runQueue.push({ job, trigger: 'manual', missed: false, nonce });
    await store.writeResult(nonce, { ok: true, queued: true, jobId: job.id });
    return;
  }
  throw new Error(`未知命令 ${op}`);
}

// ── 调度扫描（到期 → 入队 + 推进 nextRunAt）────────────────────────────────
async function scheduleSweep(nowMs) {
  const jobs = await loadJobs();
  const due = engine.dueJobs(jobs, nowMs);
  for (const job of due) {
    const slot = job.nextRunAt;
    // 先推进再执行：执行耗时不影响下一轮调度基准
    job.nextRunAt = engine.advanceAfterFire(job.schedule, slot, nowMs);
    runQueue.push({ job, trigger: 'auto', missed: false });
  }
  if (due.length) await persistJobs(jobs);
  return due.length;
}

/** 启动补跑：overdue 任务逐个补一次（missed:true），随后从当前重排 */
async function catchUpOnce(nowMs) {
  const jobs = await loadJobs();
  const overdue = (jobs || []).filter((j) => j.enabled && Number.isFinite(j.nextRunAt) && j.nextRunAt < nowMs);
  for (const job of overdue) {
    log('info', `补跑过期任务 ${job.name}(${job.id})（原定 ${new Date(job.nextRunAt).toLocaleString()}）`);
    job.nextRunAt = engine.advanceAfterFire(job.schedule, job.nextRunAt, nowMs);
    // interval 型 advance 用了 max(now, slot)，长期宕机不会连环补
    if (job.nextRunAt < nowMs) job.nextRunAt = engine.nextRunAt(job.schedule, nowMs);
    runQueue.push({ job, trigger: 'auto', missed: true });
  }
  if (overdue.length) await persistJobs(jobs);
  return overdue.length;
}

// ── 租约（多实例防双跑）─────────────────────────────────────────────────────
async function leaseSweep(nowMs) {
  if (isLeaseholder) {
    if (nowMs - leaseCheckAt > 30 * 1000) {
      leaseCheckAt = nowMs;
      await store.renewLease();
    }
    return;
  }
  if (nowMs - leaseCheckAt < 10 * 1000) return;
  leaseCheckAt = nowMs;
  // 启动抖动（pid 派生 0-6s），双实例同秒启动时错峰抢租约
  if (!catchUpDone && startedAt + (process.pid % 7) * 1000 > nowMs) return;
  isLeaseholder = await store.tryAcquireLease();
  if (isLeaseholder) log('info', '已取得调度租约');
}

async function tick() {
  try {
    if (Date.now() - settingsReadAt > SETTINGS_REREAD_MS) {
      settings = await store.getSettings();
      settingsReadAt = Date.now();
    }

    await leaseSweep(Date.now());
    if (!isLeaseholder) return;

    await consumeCommands();

    if (!catchUpDone) {
      const n = await catchUpOnce(Date.now());
      catchUpDone = true;
      if (n) log('info', `补跑 ${n} 个过期任务（各补一次，不回放积压）`);
    }

    await scheduleSweep(Date.now());
    await pumpQueue();

    if (Date.now() - lastMetaAt > META_BEAT_MS) {
      lastMetaAt = Date.now();
      const jobs = await loadJobs();
      await kv.kvSet(K.meta, {
        version: VERSION,
        pid: process.pid,
        startedAt,
        lastTickAt: Date.now(),
        bridge: (() => { const ep = kv.endpoint(); return ep ? `${ep.host}:${ep.port}` : ''; })(),
        degraded,
        settings,
        leaseholder: store.holder,
        jobCount: jobs.length,
        enabledCount: jobs.filter((j) => j.enabled).length,
      }).catch(() => {});
    }

    if (degraded) {
      degraded = false;
      log('info', 'bridge 已恢复');
    }
  } catch (e) {
    const wasDown = degraded;
    degraded = true;
    log('warn', `tick 降级: ${e.message}`);
    if (!wasDown || Date.now() - lastEndpointRefreshAt > 60 * 1000) {
      if (!wasDown) log('info', 'bridge 不可达，进入降级（健康端点保持 200）');
      lastEndpointRefreshAt = Date.now();
      kv.refreshEndpoint(true).catch(() => {});
    }
  }
}

// ── 健康端点（宿主仅看 2xx；bridge 不可达也返回 200，降级见 meta）───────────
const server = http.createServer((req, res) => {
  if (req.url === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: VERSION, degraded, uptimeSec: Math.floor((Date.now() - startedAt) / 1000) }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

if (PORT > 0) {
  server.listen(PORT, '127.0.0.1', () => log('info', `health endpoint on 127.0.0.1:${PORT}`));
  server.on('error', (e) => log('error', `health endpoint: ${e.message}`));
}

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
process.on('SIGTERM', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });
process.on('SIGINT', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });

log('info', `task-runner service v${VERSION} start (pid=${process.pid})`);
setInterval(tick, TICK_MS);
