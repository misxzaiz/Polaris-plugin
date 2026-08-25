#!/usr/bin/env node
/**
 * polaris-scheduler MCP Server — 无状态透传层
 *
 * 不维护数据、不运行守护进程、不提供 HTTP 服务。
 * 所有 CRUD 操作透传到 Polaris IPC bridge。
 *
 * 调度器守护进程由 Polaris 核心内置的 SchedulerDaemon 管理，
 * 到期任务通过 ExecutorRegistry 直接执行，不依赖前端。
 *
 * 连接方式：
 *   1. 环境变量 POLARIS_HOST + POLARIS_PORT + POLARIS_TOKEN（推荐）
 *   2. 默认 localhost:3000（无认证）
 */

const http = require('http');

const SERVER_NAME = 'polaris-scheduler-mcp';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const POLARIS_HOST = process.env.POLARIS_HOST || '127.0.0.1';
const POLARIS_PORT = parseInt(process.env.POLARIS_PORT || '3000', 10);
const POLARIS_TOKEN = process.env.POLARIS_TOKEN || '';

// ── 调用 Polaris IPC Bridge ──────────────────────────────────────────────────

function polarisIpc(command, args = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(args);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (POLARIS_TOKEN) {
      const crypto = require('crypto');
      headers['Authorization'] = `Bearer ${crypto.createHash('md5').update(POLARIS_TOKEN).digest('hex')}`;
    }
    const options = {
      hostname: POLARIS_HOST, port: POLARIS_PORT,
      path: `/api/${command.replace(/_/g, '-')}`,
      method: 'POST', headers, timeout: 30000,
    };
    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => { try { resolve(JSON.parse(responseData)); } catch (e) { resolve(responseData); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Polaris IPC timeout')); });
    req.write(data); req.end();
  });
}

// ── MCP 工具处理 ──────────────────────────────────────────────────────────────

async function handleListTasks() {
  try {
    const result = await polarisIpc('scheduler_list_tasks', {});
    return { content: [{ type: 'text', text: JSON.stringify({ tasks: result || [] }) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
  }
}

async function handleGetTask(args) {
  try {
    const result = await polarisIpc('scheduler_get_task', { id: args.id });
    if (!result) return { content: [{ type: 'text', text: JSON.stringify({ error: '任务不存在' }) }], isError: true };
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
  }
}

async function handleCreateTask(args) {
  try {
    const result = await polarisIpc('scheduler_create_task', { params: {
      name: args.name, enabled: args.enabled !== false,
      triggerType: args.triggerType || 'interval', triggerValue: args.triggerValue,
      engineId: args.engineId, prompt: args.prompt,
      workDir: args.workDir || null, description: args.description || null,
      mode: args.mode || 'simple', category: args.category || 'development',
      mission: args.mission || null, group: args.group || null,
      maxRuns: args.maxRuns || null, maxRetries: args.maxRetries || null,
      timeoutMinutes: args.timeoutMinutes || null,
      notifyOnComplete: args.notifyOnComplete !== false,
      executorType: args.executorType || 'chat',
      executorParams: args.executorParams || null,
    }});
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
  }
}

async function handleUpdateTask(args) {
  try {
    const current = await polarisIpc('scheduler_get_task', { id: args.id });
    if (!current) return { content: [{ type: 'text', text: JSON.stringify({ error: '任务不存在' }) }], isError: true };
    const updated = { ...current, ...args };
    const result = await polarisIpc('scheduler_update_task', { task: updated });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
  }
}

async function handleDeleteTask(args) {
  try {
    const result = await polarisIpc('scheduler_delete_task', { id: args.id });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
  }
}

async function handleToggleTask(args) {
  try {
    const result = await polarisIpc('scheduler_toggle_task', { id: args.id, enabled: args.enabled });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
  }
}

async function handleGetStatus() {
  try {
    const [status, tasks] = await Promise.all([
      polarisIpc('scheduler_get_status', {}).catch(() => ({})),
      polarisIpc('scheduler_list_tasks', {}).catch(() => []),
    ]);
    const taskList = Array.isArray(tasks) ? tasks : [];
    return { content: [{ type: 'text', text: JSON.stringify({
      daemonRunning: status?.isRunning || false,
      taskCount: taskList.length,
      enabledCount: taskList.filter(t => t.enabled).length,
      polarisHost: POLARIS_HOST, polarisPort: POLARIS_PORT,
    }) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
  }
}

async function handleRunTask(args) {
  try {
    const task = await polarisIpc('scheduler_get_task', { id: args.id });
    if (!task) return { content: [{ type: 'text', text: JSON.stringify({ error: '任务不存在' }) }], isError: true };
    await polarisIpc('scheduler_run_task', { id: args.id });

    let finalPrompt = task.prompt;
    if (task.mode === 'protocol' && task.taskPath && task.workDir) {
      try { finalPrompt = await polarisIpc('scheduler_build_protocol_prompt', { taskPath: task.taskPath, workDir: task.workDir }); }
      catch (e) { finalPrompt = task.mission || task.prompt; }
    } else if (task.templateId) {
      try { finalPrompt = await polarisIpc('scheduler_build_prompt', { templateId: task.templateId, taskName: task.name, userPrompt: task.prompt }); }
      catch (e) { /* use original */ }
    }
    if (!finalPrompt || !finalPrompt.trim()) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: '提示词为空' }) }], isError: true };
    }

    // 通过 Polaris 通用执行器 API 执行
    const result = await polarisIpc('execute', {
      executorType: task.executorType || 'chat',
      prompt: finalPrompt,
      engineId: task.engineId || 'claude-code',
      workDir: task.workDir || undefined,
      contextId: `scheduler-${task.id}`,
    });
    return { content: [{ type: 'text', text: JSON.stringify({ sessionId: result?.sessionId, status: 'started' }) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
  }
}

// ── 工具定义 ──────────────────────────────────────────────────────────────────

const TOOLS = [
  { name: 'list_tasks', description: '列出所有定时任务。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_task', description: '获取单个定时任务详情。', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1 } }, additionalProperties: false } },
  { name: 'create_task', description: '创建定时任务。', inputSchema: { type: 'object', required: ['name', 'triggerType', 'triggerValue', 'engineId', 'prompt'], properties: {
    name: { type: 'string', minLength: 1 }, enabled: { type: 'boolean' },
    triggerType: { type: 'string', enum: ['once', 'cron', 'interval', 'after_completion'] },
    triggerValue: { type: 'string', minLength: 1 }, engineId: { type: 'string', minLength: 1 },
    prompt: { type: 'string', minLength: 1 }, workDir: { type: 'string' }, description: { type: 'string' },
    mode: { type: 'string' }, category: { type: 'string' }, mission: { type: 'string' }, group: { type: 'string' },
    maxRuns: { type: 'number' }, maxRetries: { type: 'number' }, timeoutMinutes: { type: 'number' },
    executorType: { type: 'string', enum: ['chat', 'command', 'http'] },
  }, additionalProperties: false } },
  { name: 'update_task', description: '更新定时任务。', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1 }, name: { type: 'string' }, enabled: { type: 'boolean' }, triggerType: { type: 'string' }, triggerValue: { type: 'string' }, engineId: { type: 'string' }, prompt: { type: 'string' }, workDir: { type: 'string' }, description: { type: 'string' }, mode: { type: 'string' }, mission: { type: 'string' }, group: { type: 'string' }, executorType: { type: 'string' } }, additionalProperties: false } },
  { name: 'delete_task', description: '删除定时任务。', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1 } }, additionalProperties: false } },
  { name: 'toggle_task', description: '切换任务启用状态。', inputSchema: { type: 'object', required: ['id', 'enabled'], properties: { id: { type: 'string', minLength: 1 }, enabled: { type: 'boolean' } }, additionalProperties: false } },
  { name: 'get_status', description: '获取调度器状态。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'run_task', description: '手动触发任务立即执行。', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1 } }, additionalProperties: false } },
];

// ── JSON-RPC ──────────────────────────────────────────────────────────────────

function handleInitialize() {
  return { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } };
}
function handleToolsList() { return { tools: TOOLS }; }
function sendResponse(id, result, error) {
  const msg = { jsonrpc: '2.0', id };
  if (error) msg.error = { code: -32000, message: error }; else msg.result = result;
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handleRequest(request) {
  if (request.jsonrpc !== '2.0') return sendResponse(request.id, null, 'Invalid Request');
  if (request.id === undefined || request.id === null) return;
  try {
    switch (request.method) {
      case 'initialize': return sendResponse(request.id, handleInitialize());
      case 'notifications/initialized': return sendResponse(request.id, {});
      case 'ping': return sendResponse(request.id, {});
      case 'tools/list': return sendResponse(request.id, handleToolsList());
      case 'tools/call': {
        const name = request.params.name, args = request.params.arguments || {};
        let result;
        switch (name) {
          case 'list_tasks': result = await handleListTasks(); break;
          case 'get_task': result = await handleGetTask(args); break;
          case 'create_task': result = await handleCreateTask(args); break;
          case 'update_task': result = await handleUpdateTask(args); break;
          case 'delete_task': result = await handleDeleteTask(args); break;
          case 'toggle_task': result = await handleToggleTask(args); break;
          case 'get_status': result = await handleGetStatus(); break;
          case 'run_task': result = await handleRunTask(args); break;
          default: result = { content: [{ type: 'text', text: JSON.stringify({ error: `未知工具: ${name}` }) }], isError: true };
        }
        return sendResponse(request.id, result);
      }
      default: return sendResponse(request.id, null, `Unsupported method: ${request.method}`);
    }
  } catch (e) { return sendResponse(request.id, null, e.message); }
}

// ── 启动 ──────────────────────────────────────────────────────────────────────

console.error(`[Scheduler] 无状态薄层已启动，Polaris: ${POLARIS_HOST}:${POLARIS_PORT}`);

const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => { const t = line.trim(); if (t) try { handleRequest(JSON.parse(t)); } catch (e) { /* ignore */ } });
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));