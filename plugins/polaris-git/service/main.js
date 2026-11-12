#!/usr/bin/env node
/**
 * main.js —— polaris-git 插件 HTTP 服务（零依赖，Node >= 18）
 *
 * 架构方案 C：宿主删除 Rust git2 后端后，cap.git 由本插件自带 Node 服务承接。
 * 本文件只做 HTTP 接线，Git 引擎在 engine.js，动作清单在 actions.js。
 *
 * 启动参数：node main.js {{port}} {{appConfigDir}}
 *   - port = 0 时由系统自动分配，实际端口写入
 *     <appConfigDir>/polaris-git-service.port（供 MCP / 宿主发现）。
 *
 * 契约：
 *   - GET  /__health           恒 200，返回 { ok:true, service, version, port, uptimeSec }
 *   - POST /dispatch           收 { action, params }，回 { ok:true, data } | { ok:false, error }
 *   - 写类动作（WRITE_ACTIONS）全局 FIFO 串行：同一时刻最多执行一个写操作；
 *     读类动作并发直接执行，不阻塞。危险写动作执行前自动记录撤销快照，
 *     所有写动作统一记录操作流水（state.js，落 <appConfigDir>/polaris-git/）。
 *   - 文件日志 <appConfigDir>/polaris-git-service.log，累计超 512KB 轮转为 .old。
 *   - 优雅关闭：SIGTERM / SIGINT 时停止收新连接、等在途请求与写队列排空、
 *     删除 .port 文件后再退出。
 *
 * 本插件 package.json 为 "type": "module"，故使用 ESM。
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dispatch } from './engine.js';
import { WRITE_ACTIONS, ALIASES, SNAPSHOT_ACTIONS, ACTION_LABELS } from './actions.js';
import { configureState, createUndoSnapshot, recordOperation } from './state.js';

const VERSION = '1.0.0';
const SERVICE_NAME = 'polaris-git';
const LOG_MAX_BYTES = 512 * 1024;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const PORT_FILE_NAME = 'polaris-git-service.port';
const LOG_FILE_NAME = 'polaris-git-service.log';

const PORT = parseInt(process.argv[2], 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';
const startedAt = Date.now();

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘 + 512KB 轮转）─────────────
let logFile = null;
let logBytes = 0;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, LOG_FILE_NAME);
    // 启动时若已有超大日志，先轮转一次；并读取当前字节数作为累计基数。
    try {
      const st = fs.statSync(logFile);
      if (st.size > LOG_MAX_BYTES) fs.renameSync(logFile, `${logFile}.old`);
      const st2 = fs.existsSync(logFile) ? fs.statSync(logFile) : null;
      logBytes = st2 ? st2.size : 0;
    } catch (_) { logBytes = 0; /* 首轮无文件 */ }
  } catch (_) { logFile = null; }
}
function rotateLog() {
  if (!logFile) return;
  try {
    if (fs.existsSync(`${logFile}.old`)) fs.unlinkSync(`${logFile}.old`);
    fs.renameSync(logFile, `${logFile}.old`);
  } catch (_) { /* 轮转失败不打断主流程 */ }
  logBytes = 0;
}
function log(level, msg) {
  const line = `[${SERVICE_NAME}:${level}] ${new Date().toISOString()} ${msg}`;
  process.stderr.write(line + '\n');
  if (!logFile) return;
  try {
    const cost = Buffer.byteLength(line, 'utf8') + 1;
    if (logBytes + cost > LOG_MAX_BYTES) rotateLog();
    fs.appendFileSync(logFile, line + '\n');
    logBytes += cost;
  } catch (_) { /* 磁盘问题不打断主流程 */ }
}

initLog(APP_CONFIG_DIR);
// R1：把真实 appConfigDir 注入状态模块（undo 快照 / 操作流水落盘位置）。
configureState({ appConfigDir: APP_CONFIG_DIR });

// ── 写操作全局 FIFO 串行队列 ──────────────────────────────────────────────
// 写动作经 writeTail 串成一条 Promise 链，严格 FIFO、同一时刻仅一个在跑；
// 读动作不入链，直接并发。链上错误被吞掉，保证后续写不会被一次失败卡死。
// 每个写动作在队列内依次：记录撤销快照 → 执行 dispatch → 记录操作流水。
let writeTail = Promise.resolve();
function normalizeAction(action) {
  return ALIASES[action] || action;
}
function isWriteAction(action) {
  return WRITE_ACTIONS.has(normalizeAction(action));
}

/** 危险写动作执行前是否需要撤销快照（reset 仅 hard 触发，对齐主仓 SNAPSHOT_ACTIONS）。 */
function needsUndoSnapshot(action, params) {
  const a = normalizeAction(action);
  if (!SNAPSHOT_ACTIONS.has(a)) return false;
  if (a === 'reset') return String((params && params.mode) || '').toLowerCase() === 'hard';
  return true;
}

/** 参数摘要：仅保留关键标量字段，避免把大内容 / 二进制写进流水。 */
function paramsDigest(params) {
  const keep = new Set([
    'message', 'filePath', 'filePaths', 'paths', 'branch', 'name', 'newName',
    'mode', 'baseCommitish', 'commitSha', 'snapshotRef', 'side', 'headBranch',
    'baseBranch', 'tagName', 'remoteName', 'url', 'prNumber', 'autosquash',
  ]);
  const out = {};
  for (const k of Object.keys(params || {})) {
    if (!keep.has(k)) continue;
    const v = params[k];
    if (v == null) continue;
    if (typeof v === 'string') out[k] = v.length > 160 ? v.slice(0, 160) + '…' : v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return JSON.stringify(out);
}

/**
 * 单个写动作的完整生命周期（在写队列内执行，保证快照反映动作前状态）：
 *   1) 危险动作先创建撤销快照（安全网，失败只告警、不阻塞原动作）；
 *   2) 执行 engine.dispatch；
 *   3) 无论成败都追加一条 GitOperationEntry 到 operations.jsonl；
 *   4) 失败时在信封附带 undoSnapshot 引用，供 undo_restore 一键回滚。
 */
async function runWrite(action, params) {
  const start = Date.now();
  const wsPath = (params && typeof params.workspacePath === 'string') ? params.workspacePath : '';
  const a = normalizeAction(action);
  let snapshot = null;
  if (wsPath && needsUndoSnapshot(action, params)) {
    try { snapshot = await createUndoSnapshot(wsPath, a, params); }
    catch (e) { log('warn', `撤销快照创建失败(${a}): ${e.message}`); }
  }
  let result;
  try { result = await dispatch(action, params); }
  catch (e) { result = { ok: false, error: (e && e.message) ? e.message : String(e) }; }
  recordOperation({
    workspacePath: wsPath,
    action: a,
    label: ACTION_LABELS[a] || a,
    ok: !!result.ok,
    durationMs: Date.now() - start,
    paramsDigest: paramsDigest(params),
    gitTaskId: snapshot ? snapshot.name : null,
  });
  if (!result.ok && snapshot && snapshot.name) {
    result.undoSnapshot = snapshot.name;
    result.undoHint = '写动作失败，可用 undo_restore 携带此 undoSnapshot 回滚到执行前状态';
  }
  return result;
}

function enqueueWrite(action, params) {
  const result = writeTail.then(() => runWrite(action, params));
  writeTail = result.catch(() => {});
  return result;
}

// 在途请求集合，供优雅关闭等待排空。
const inFlight = new Set();

// ── HTTP 工具 ─────────────────────────────────────────────────────────────
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload, 'utf8'),
  });
  res.end(payload);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', (e) => reject(e));
  });
}

async function handleDispatch(body) {
  let parsed;
  try { parsed = JSON.parse(body || '{}'); } catch (_) {
    return { ok: false, error: '请求体不是合法 JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: '请求体必须是 JSON 对象 { action, params }' };
  }
  const { action } = parsed;
  if (typeof action !== 'string' || action === '') {
    return { ok: false, error: 'Missing required field: action' };
  }
  const params = (parsed.params && typeof parsed.params === 'object' && !Array.isArray(parsed.params))
    ? parsed.params : {};
  try {
    return isWriteAction(action)
      ? await enqueueWrite(action, params)
      : await dispatch(action, params);
  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : String(e) };
  }
}

let shuttingDown = false;
const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];

  // 健康检查：恒 200，与引擎/git 是否可用无关。
  if (req.method === 'GET' && (url === '/__health' || url === '/__health/')) {
    sendJson(res, 200, {
      ok: true,
      service: SERVICE_NAME,
      version: VERSION,
      port: server.address() ? server.address().port : PORT,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    });
    return;
  }

  if (req.method === 'POST' && (url === '/dispatch' || url === '/dispatch/')) {
    const task = (async () => {
      let body;
      try { body = await readBody(req); } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message });
        return;
      }
      const result = await handleDispatch(body);
      sendJson(res, 200, result);
    })().catch((e) => {
      log('error', `dispatch 处理异常: ${e.message}`);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: '内部错误' });
    });
    inFlight.add(task);
    task.finally(() => inFlight.delete(task));
    return;
  }

  sendJson(res, 404, { ok: false, error: 'not found' });
});

// ── 端口文件（供 MCP / 宿主发现实际监听端口）──────────────────────────────
function writePortFile(port) {
  if (!APP_CONFIG_DIR) return;
  try {
    fs.mkdirSync(APP_CONFIG_DIR, { recursive: true });
    fs.writeFileSync(path.join(APP_CONFIG_DIR, PORT_FILE_NAME), String(port));
  } catch (e) { log('warn', `写入端口文件失败: ${e.message}`); }
}
function removePortFile() {
  if (!APP_CONFIG_DIR) return;
  try { fs.unlinkSync(path.join(APP_CONFIG_DIR, PORT_FILE_NAME)); } catch (_) { /* 已不存在 */ }
}

// ── 启动 / 优雅关闭 ──────────────────────────────────────────────────────
server.listen(PORT, '127.0.0.1', () => {
  const actual = server.address().port;
  writePortFile(actual);
  log('info', `${SERVICE_NAME} service v${VERSION} 已启动: 127.0.0.1:${actual} (appConfigDir=${APP_CONFIG_DIR || '(none)'})`);
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', `收到 ${signal}，开始优雅关闭`);
  await new Promise((resolve) => {
    server.close(resolve);
    // 主动断开空闲 keep-alive 连接，避免 close 回调一直不触发（Node >= 18.2）。
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  // 等在途请求与写队列排空。
  await Promise.allSettled([...inFlight]);
  await writeTail.catch(() => {});
  removePortFile();
  log('info', '已关闭');
  process.exit(0);
}
process.on('SIGTERM', () => { shutdown('SIGTERM').catch((e) => log('error', `shutdown: ${e.message}`)); });
process.on('SIGINT', () => { shutdown('SIGINT').catch((e) => log('error', `shutdown: ${e.message}`)); });

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.message ? e.message : e}`));
