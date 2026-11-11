#!/usr/bin/env node
'use strict';
/**
 * main.js —— AI 定时任务后台服务（零依赖，node ≥ 18；node:sqlite 迁移需 ≥ 22.5）
 *
 * 职责（金标 = 主仓 scheduler_daemon.rs + task-runner 服务骨架）：
 *   - tick（默认 5s，可设）：读设置(30s 热更) → 租约(多实例防双跑)
 *     → 消费手动执行命令信箱(先删后做) → 到期任务扫描 → 串行执行
 *   - chat 任务：buildPrompt 三态(协议/模板/简单) → cap.ai.chat dispatch 启动会话
 *     → 置 Running → WS session_end/error 终态回收；30min Running 自愈兜底
 *   - command/http 任务：内联 await 直接写终态（主仓同款串行语义）
 *   - plugin 型任务：v1 不支持，跳过 + 历史记录
 *   - /__health 恒 200（bridge 不可达也活着，降级写 meta.degraded）
 *   - 心跳 aisched.meta 60s；日志自落盘 <appConfigDir>/ai-scheduler.log 512KB 轮转
 *
 * 生命周期由宿主 PluginServiceManager（Supervisor）管理。
 * 启动参数：node main.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createStore, normalizeSettings, isDue } = require('./store');
const { executeTask } = require('./executors');
const { createKvClient } = require('./kvclient');
const { createWsClient } = require('./wsclient');
const { migrateFromHostDb } = require('./migrate');
const protocol = require('../shared/protocol');

const VERSION = '1.0.0';
const META_BEAT_MS = 60 * 1000;
const SETTINGS_REREAD_MS = 30 * 1000;
const TASKS_REREAD_MS = 30 * 1000; // 任务表对账周期（触发期内存为准）

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘 + 512KB 轮转）─────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'ai-scheduler.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.AISCHED_DEBUG === '1';
function log(level, msg) {
  const line = `[ai-scheduler:${level}] ${new Date().toISOString()} ${msg}`;
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

let settings = normalizeSettings(null);
let settingsReadAt = 0;
let degraded = false;
const startedAt = Date.now();
let lastMetaAt = 0;

let tasksCache = null; // 服务对任务表只读；30s 与 kv 对账一次（合并视图=定义+运行态）
let tasksReadAt = 0;
let executing = false; // 并发=1：同一时刻只推进一个执行链
const runQueue = []; // { task, missed, viaCommand }

let holder = `svc_${process.pid}_${startedAt.toString(36)}`;
let isLeaseholder = false;
let leaseCheckAt = 0;

// ── WS 终态回收（金标 schedulerStore.runTask 订阅语义）──────────────────────
async function onSchedulerEvent(ev) {
  try {
    const task = await store.getTask(ev.taskId);
    if (!task) { log('warn', `ws 终态: 任务不存在 ${ev.taskId}`); return; }
    if (ev.kind === 'session_end') {
      const reason = ev.payload && ev.payload.reason ? String(ev.payload.reason) : '';
      const status = reason.toLowerCase() === 'error' ? 'failed' : 'success';
      log('info', `会话结束: ${task.name} (${ev.taskId}) → ${status} (reason=${reason || 'normal'})`);
      await store.markStatus(ev.taskId, status, { sessionId: ev.payload.sessionId || null });
      await store.appendHist({
        id: store.genId('hist'), taskId: task.id, taskName: task.name, trigger: 'chat-end',
        status, summary: `AI 会话结束（reason=${reason || 'normal'}）`,
        startedAt: Math.floor(Date.now() / 1000), durationMs: 0,
      });
    } else if (ev.kind === 'error') {
      const msg = ev.payload && ev.payload.message ? String(ev.payload.message) : 'AI 会话错误';
      log('warn', `会话错误: ${task.name} (${ev.taskId}): ${msg}`);
      await store.markStatus(ev.taskId, 'failed', { error: msg, sessionId: ev.payload.sessionId || null });
      await store.appendHist({
        id: store.genId('hist'), taskId: task.id, taskName: task.name, trigger: 'chat-error',
        status: 'failed', summary: msg.slice(0, 300),
        startedAt: Math.floor(Date.now() / 1000), durationMs: 0,
      });
    }
  } catch (e) {
    log('error', `终态回收失败: ${e.message}`);
  }
}

const wsc = createWsClient({ kv, log, onSchedulerEvent });

// ── 任务表访问（服务只读任务定义；运行态经 markRunning/markStatus 写）───────
async function loadTasks() {
  if (tasksCache && Date.now() - tasksReadAt < TASKS_REREAD_MS) return tasksCache;
  // 合并视图（定义+state）：isDue 判定需要 nextRunAt/lastRunStatus/lastRunAt——
  // listTasks 只有定义，纯定义会让 isDue 永假（真桥冒烟实锤的坑）
  tasksCache = await store.listTaskViews();
  tasksReadAt = Date.now();
  return tasksCache;
}

// ── 执行一条任务 ───────────────────────────────────────────────────────────
async function runOne(task, viaCommand) {
  const now = Math.floor(Date.now() / 1000);
  const triggerAt = now;

  // plugin 型 / 未知型：跳过（金标外行为，spec §3 数据迁移约定）
  const et = task.executorType || 'chat';
  if (!['chat', 'command', 'cli', 'http', 'webhook'].includes(et)) {
    log('warn', `跳过不支持的执行器类型 '${et}': ${task.name} (${task.id})`);
    await store.appendHist({
      id: store.genId('hist'), taskId: task.id, taskName: task.name,
      trigger: viaCommand ? 'manual' : 'due',
      status: 'failed', summary: `执行器类型 '${et}' 本插件 v1 不支持（主仓 PluginExecutor 随域出仓）`,
      startedAt: triggerAt, durationMs: 0,
    });
    return;
  }

  await store.markRunning(task.id);
  // 立即失效任务缓存：markRunning 已置 Running，但 30s 缓存窗口内旧视图会让
  // isDue 重复命中（真桥冒烟实锤：once 任务每 tick 重触发）
  tasksCache = null;
  tasksReadAt = 0;
  log('info', `任务触发${viaCommand ? '(手动)' : ''}: ${task.name} (${task.id}, executor=${et})`);

  const startedMs = Date.now();
  try {
    const r = await executeTask(kv, store, task, settings);
    if (r.kind === 'chat') {
      log('info', `AI 会话已启动: ${task.name} session=${r.sessionId} (via=${r.via})`);
      await store.appendHist({
        id: store.genId('hist'), taskId: task.id, taskName: task.name,
        trigger: viaCommand ? 'manual' : 'due',
        status: 'running', summary: `AI 会话已启动 (via=${r.via})`,
        startedAt: triggerAt, durationMs: 0, sessionId: r.sessionId,
      });
      // 终态由 WS 回收（onSchedulerEvent）；卡死由自愈兜底
      return;
    }
    if (r.kind === 'skip') return;
    // done：内联执行完成直接写终态
    const res = r.result || {};
    const status = res.success ? 'success' : 'failed';
    log(res.success ? 'info' : 'warn', `任务完成: ${task.name} → ${status}${res.error ? ` (${res.error})` : ''}`);
    await store.markStatus(task.id, status, { runAt: triggerAt, error: res.error || null });
    await store.appendHist({
      id: store.genId('hist'), taskId: task.id, taskName: task.name,
      trigger: viaCommand ? 'manual' : 'due',
      status,
      summary: res.error || (res.httpStatus ? `HTTP ${res.httpStatus}` : '执行完成'),
      excerpt: (res.stdout || '').slice(0, 500) || null,
      startedAt: triggerAt, durationMs: Date.now() - startedMs,
    });
  } catch (e) {
    log('error', `任务执行异常: ${task.name}: ${e.message}`);
    await store.markStatus(task.id, 'failed', { runAt: triggerAt, error: e.message });
    await store.appendHist({
      id: store.genId('hist'), taskId: task.id, taskName: task.name,
      trigger: viaCommand ? 'manual' : 'due',
      status: 'failed', summary: e.message.slice(0, 300),
      startedAt: triggerAt, durationMs: Date.now() - startedMs,
    });
  }
}

async function pumpQueue() {
  if (executing) return;
  executing = true;
  try {
    while (runQueue.length) {
      const item = runQueue.shift();
      // eslint-disable-next-line no-await-in-loop
      await runOne(item.task, item.viaCommand);
    }
  } finally {
    executing = false;
  }
}

// ── 协议文档命令信箱（面板 fs 语义统一下沉服务；op 枚举见 README 存储契约）──
async function handleProtoCommand(cmd) {
  const { op, workDir, taskPath, nonce } = cmd;
  const ok = (data) => store.putResult(nonce, { ok: true, data });
  const fail = (error) => store.putResult(nonce, { ok: false, error: String(error && error.message || error) });
  try {
    switch (op) {
      case 'readAll':
        return await ok({
          protocol: protocol.readProtocol(workDir, taskPath),
          supplement: protocol.readSupplement(workDir, taskPath),
          memoryIndex: protocol.readMemoryIndex(workDir, taskPath),
          memoryTasks: protocol.readMemoryTasks(workDir, taskPath),
        });
      case 'updateProtocol': return await ok(protocol.updateProtocol(workDir, taskPath, cmd.content));
      case 'updateSupplement': return await ok(protocol.updateSupplement(workDir, taskPath, cmd.content));
      case 'updateMemoryIndex': return await ok(protocol.updateMemoryIndex(workDir, taskPath, cmd.content));
      case 'updateMemoryTasks': return await ok(protocol.updateMemoryTasks(workDir, taskPath, cmd.content));
      case 'clearSupplement': return await ok(protocol.clearSupplement(workDir, taskPath));
      case 'backupSupplement': return await ok(protocol.backupSupplement(workDir, taskPath, cmd.content));
      case 'backupDocument': return await ok(protocol.backupDocument(workDir, taskPath, cmd.docName, cmd.content, cmd.summary || null));
      case 'extractUserContent': return await ok(protocol.extractUserContent(cmd.content));
      case 'hasSupplementContent': return await ok(protocol.hasSupplementContent(cmd.content));
      case 'needsBackup': return await ok(protocol.needsBackup(cmd.content));
      case 'createStructure':
        return await ok(protocol.createTaskStructure(workDir, cmd.taskId, cmd.mission || '', cmd.templateContent || null));
      default:
        return await fail(`未知协议命令 op: ${op}`);
    }
  } catch (e) {
    log('warn', `协议命令 ${op} 失败 (nonce=${nonce}): ${e.message}`);
    return await fail(e);
  }
}

// ── tick 主循环 ────────────────────────────────────────────────────────────
async function tick() {
  const now = Math.floor(Date.now() / 1000);

  // 设置热更
  if (Date.now() - settingsReadAt > SETTINGS_REREAD_MS) {
    settings = await store.getSettings();
    settingsReadAt = Date.now();
  }

  // 租约（多实例防双跑；TTL = 3 × tick）
  if (now - leaseCheckAt > Math.max(5, settings.tickSeconds)) {
    leaseCheckAt = now;
    isLeaseholder = await store.tryAcquireLease(holder, Math.max(10, settings.tickSeconds * 3));
  }
  if (!isLeaseholder) return;

  // 手动执行命令信箱（先删后做）
  const cmds = await store.consumeRunCommands();
  for (const cmd of cmds) {
    const task = await store.getTask(cmd.taskId);
    if (!task) {
      if (cmd.nonce) await store.putResult(cmd.nonce, { ok: false, error: `任务不存在: ${cmd.taskId}` }).catch(() => {});
      continue;
    }
    runQueue.push({ task, viaCommand: true, missed: false });
    if (cmd.nonce) await store.putResult(cmd.nonce, { ok: true, taskId: cmd.taskId }).catch(() => {});
  }

  // 协议文档命令信箱（先删后做）
  const protoCmds = await store.consumeProtoCommands();
  for (const pc of protoCmds) {
    // eslint-disable-next-line no-await-in-loop
    await handleProtoCommand(pc);
  }

  // 到期扫描（金标 daemon check_and_execute_due_tasks）
  const tasks = await loadTasks();
  for (const task of tasks) {
    const due = isDue(task, now);
    if (due === 'stale') {
      // Running 卡死自愈（金标 STALE_RUNNING_SECS / timeout_minutes）
      log('warn', `自愈: 任务 '${task.name}' (${task.id}) 卡死 Running 超时，重置为 Failed`);
      // eslint-disable-next-line no-await-in-loop
      await store.healStale(task, now);
      continue;
    }
    if (due === true) {
      runQueue.push({ task, viaCommand: false, missed: false });
    }
  }
  if (runQueue.length) pumpQueue().catch((e) => log('error', `pumpQueue: ${e.message}`));
}

// ── /__health（恒 200，降级写进 meta）──────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/__health' || req.url === '/__health/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: VERSION, degraded, uptimeSec: Math.floor((Date.now() - startedAt) / 1000), wsUp: wsc.isUp() }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});
if (PORT > 0) server.listen(PORT, '127.0.0.1', () => log('info', `health endpoint on 127.0.0.1:${PORT}/__health`));

// ── 启动 ───────────────────────────────────────────────────────────────────
async function main() {
  log('info', `ai-scheduler service v${VERSION} starting (appConfigDir=${APP_CONFIG_DIR || '(none)'})`);
  const mig = await migrateFromHostDb(APP_CONFIG_DIR, store, log).catch((e) => ({ status: 'error', detail: e.message }));
  log('info', `migrate: ${mig.status}${mig.count !== undefined ? ` (${mig.count} 条)` : ''}${mig.detail ? ` — ${mig.detail}` : ''}`);
  settings = await store.getSettings();
  settingsReadAt = Date.now();
  wsc.connect();

  const tickMs = Math.max(2, settings.tickSeconds) * 1000;
  setInterval(() => {
    tick().catch((e) => log('error', `tick: ${e.message}`));
  }, tickMs);

  setInterval(() => {
    const beat = async () => {
      await store.putMeta({ version: VERSION, holder, degraded, wsUp: wsc.isUp(), queueLen: runQueue.length, uptimeSec: Math.floor((Date.now() - startedAt) / 1000) }).catch(() => { degraded = true; });
      degraded = false;
    };
    beat();
  }, META_BEAT_MS);

  log('info', `ai-scheduler service started (tick=${tickMs}ms)`);
}

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.message ? e.message : e}`));

main().catch((e) => {
  log('error', `main 启动失败: ${e.message}`);
  process.exitCode = 1;
});
