'use strict';
/**
 * executors.js —— 任务执行器（零依赖）
 *
 * 金标 = 主仓 src-tauri/src/services/executor/mod.rs：
 *   - chat: 经 cap.ai.chat dispatch（action:start，与主仓手动路径 aiChatDispatch 同通道；
 *     顺带修复主仓自动路径裸 start_chat 断链）
 *   - command: CommandExecutor（cmd /C 或 sh -c、cwd=executorParams.cwd||workDir、
 *     timeout 默认 300s、exit 0 = 成功）
 *   - http: HttpExecutor（GET 默认、POST/PUT 带 JSON body、timeout 默认 60s、
 *     status<500 = 成功、响应体尽力 JSON 解析）
 *   - plugin: v1 不支持（主仓 PluginExecutor 依赖宿主插件执行器注册表，
 *     随 Scheduler 域出仓；存量任务标记 unsupportedExecutor，触发时跳过）
 *
 * 终态语义（金标 scheduler_daemon.rs）：
 *   - chat: dispatch 只负责启动会话（返回 sessionId）；Success/Failed 由 WS
 *     session_end/error 事件回收（wsclient.js）；30 分钟 Running 自愈兜底。
 *   - command/http: 内联 await 执行完直接写终态（主仓同款串行语义）。
 */
const { exec } = require('child_process');
const protocol = require('../shared/protocol');
const { applyTemplate } = require('../shared/engine');

const CONTEXT_PREFIX = 'scheduler-';
const DEFAULT_ENGINE = 'claude-code';

/** 手动执行命令信箱回执（面板 → 服务） */
function runCommandNonce() {
  return `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 三态 prompt 构建（金标 schedulerStore.handleTaskDue / SchedulerPanel.handleRun）：
 *   protocol → protocol.js buildProtocolPrompt（失败回退 mission||prompt）
 *   templateId → 内置/自定义模板 applyTemplate（失败回退原始 prompt）
 *   simple → 原始 prompt
 * @returns {Promise<{prompt: string, via: string, error?: string}>}
 */
async function buildPrompt(store, task) {
  if (task.mode === 'protocol') {
    if (task.workDir && task.taskPath) {
      try {
        const p = protocol.buildProtocolPrompt(task.workDir, task.taskPath);
        if (p && p.trim()) return { prompt: p, via: 'protocol' };
      } catch (e) {
        return { prompt: task.mission || task.prompt || '', via: 'protocol-fallback', error: `协议文档读取失败: ${e.message}` };
      }
    }
    return { prompt: task.mission || task.prompt || '', via: 'protocol-fallback' };
  }
  if (task.templateId) {
    try {
      const tmpl = await store.getTemplate(task.templateId);
      if (tmpl && tmpl.content) {
        const p = applyTemplate(tmpl.content, task.name, task.prompt);
        if (p.trim()) return { prompt: p, via: 'template' };
      }
    } catch (_) { /* 模板缺失回退 */ }
  }
  return { prompt: task.prompt || '', via: 'simple' };
}

/** chat 执行：启动会话，返回 sessionId；抛错 = 启动失败 */
async function executeChat(kv, task, prompt, settings) {
  if (!prompt || !prompt.trim()) throw new Error('提示词为空，无法执行任务');
  const payload = {
    action: 'start',
    message: prompt,
    options: {
      workDir: task.workDir || undefined,
      contextId: CONTEXT_PREFIX + task.id,
      engineId: task.engineId || DEFAULT_ENGINE,
      enableMcpTools: settings.enableMcpTools !== false,
    },
  };
  const sid = await kv.dispatchOk('cap.ai.chat', payload, { timeoutMs: 120000 });
  const sidStr = typeof sid === 'string' ? sid : String(sid);
  if (!sidStr.trim()) throw new Error('cap.ai.chat 启动返回空 sessionId');
  return sidStr;
}

/** command 执行（金标 CommandExecutor） */
function executeCommand(task) {
  const p = (task.executorParams && typeof task.executorParams === 'object') ? task.executorParams : {};
  const command = (typeof p.command === 'string' && p.command.trim()) || task.prompt;
  if (!command || !command.trim()) return Promise.resolve({ success: false, error: '命令不能为空' });
  const cwd = p.cwd || task.workDir || process.cwd();
  const timeout = (p.timeoutSecs || 300) * 1000;
  return new Promise((resolve) => {
    exec(command, { cwd, timeout, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && err.killed) {
        resolve({ success: false, error: '命令执行超时', stdout: String(stdout || ''), stderr: String(stderr || '') });
        return;
      }
      const code = err ? err.code : 0;
      resolve({
        success: code === 0,
        exitCode: code,
        error: code === 0 ? null : `命令退出码: ${code}`,
        stdout: String(stdout || '').slice(0, 4000),
        stderr: String(stderr || '').slice(0, 2000),
      });
    });
  });
}

/** http 执行（金标 HttpExecutor） */
async function executeHttp(task) {
  const p = (task.executorParams && typeof task.executorParams === 'object') ? task.executorParams : {};
  const url = typeof p.url === 'string' ? p.url.trim() : '';
  if (!url) return { success: false, error: 'URL 不能为空' };
  const method = String(p.method || 'GET').toUpperCase();
  const timeoutMs = (p.timeoutSecs || 60) * 1000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const init = { method, signal: ctrl.signal };
    if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && p.body !== undefined && p.body !== null) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(p.body);
    }
    const res = await fetch(url, init);
    let body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    return { success: res.status < 500, httpStatus: res.status, httpBody: body, error: null };
  } catch (e) {
    return { success: false, error: `HTTP 请求失败: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 执行入口（executor_type 分流，金标 daemon check_and_execute_due_tasks）。
 * 返回 { kind: 'chat'|'done'|'skip', sessionId?, result?, error? }
 *  - chat: 已启动会话，终态走 WS 回收
 *  - done: 内联执行完成，携带 success/error
 *  - skip: 不执行（plugin 型/未知型），调用方记日志不置终态
 */
async function executeTask(kv, store, task, settings) {
  let type = task.executorType || '';
  if (!type) type = 'chat'; // 金标：executor_type 空 = chat
  if (type === 'chat') {
    const { prompt, via, error: buildErr } = await buildPrompt(store, task);
    if (!prompt || !prompt.trim()) {
      return { kind: 'done', result: { success: false, error: '提示词为空，无法执行任务' }, via };
    }
    try {
      const sessionId = await executeChat(kv, task, prompt, settings);
      return { kind: 'chat', sessionId, via, buildError: buildErr || null };
    } catch (e) {
      return { kind: 'done', result: { success: false, error: `启动 AI 会话失败: ${e.message}` }, via };
    }
  }
  if (type === 'command' || type === 'cli') {
    return { kind: 'done', result: await executeCommand(task), via: 'command' };
  }
  if (type === 'http' || type === 'webhook') {
    return { kind: 'done', result: await executeHttp(task), via: 'http' };
  }
  // plugin:<pid>:<eid> 或未知类型：v1 不支持（金标 parse 未知型回退 chat 的行为
  // 不保留——避免把 plugin 任务误当 chat 触发，宁可显式跳过+日志）
  return { kind: 'skip', via: type };
}

module.exports = {
  executeTask, executeChat, executeCommand, executeHttp, buildPrompt,
  runCommandNonce, CONTEXT_PREFIX, DEFAULT_ENGINE,
};
