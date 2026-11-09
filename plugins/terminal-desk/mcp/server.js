#!/usr/bin/env node
/**
 * terminal-desk stdio MCP server（零依赖，手写 JSON-RPC 2.0 over stdio；
 * 同 exec-sandbox 先例——日志走 stderr，stdout 仅协议数据）
 *
 * 定位：AI 可以在【用户可见的终端面板】里开新会话跑命令——会话出现在用户的
 * terminal-desk 面板里，用户可直接看到输出并接管交互（这是与 cap.bash 后台
 * 任务的本质区别：可见、可交互）。
 *
 * 通道：HTTP → 宿主 /api/router-dispatch（target=cap.terminal），
 * 鉴权 Bearer md5(token)（与宿主 web middleware 对齐）。
 *
 * 启动参数（manifest argsTemplate 注入）：
 *   argv[2] = {{polarisPort}}  argv[3] = {{polarisToken}}  argv[4] = {{workspacePath}}
 *
 * 工具：
 *   terminal_list                 列出活跃会话
 *   terminal_run_in_new_session   开新会话跑命令（cwd 默认当前工作区）
 *   terminal_write                向既有会话写入按键/文本
 */

'use strict';

const http = require('http');
const crypto = require('crypto');

const SERVER_NAME = 'terminal-desk';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2025-06-18';

const PORT = Number(process.argv[2] || '') || null;
const TOKEN = process.argv[3] || '';
const WORKSPACE = process.argv[4] || '';

function md5(s) {
  return crypto.createHash('md5').update(String(s)).digest('hex');
}

function log(level, msg) {
  // 日志走 stderr（AGENTS.md §六：stdout 仅协议数据）
  process.stderr.write(`[${SERVER_NAME}][${level}] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// cap.terminal HTTP 通道
// ---------------------------------------------------------------------------

function capDispatch(payload) {
  if (!PORT) return Promise.reject(new Error('缺少 polarisPort 启动参数（宿主版本过旧或未注入）'));
  const body = JSON.stringify({ target: 'cap.terminal', payload });
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/router-dispatch',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(TOKEN ? { Authorization: `Bearer ${md5(TOKEN)}` } : {}),
        },
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch (_) {
            reject(new Error(`宿主响应非 JSON（HTTP ${res.statusCode}）`));
            return;
          }
          if (parsed.ok) resolve(parsed.result || {});
          else reject(new Error(parsed.error || `cap.terminal 调用失败（HTTP ${res.statusCode}）`));
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('宿主请求超时')));
    req.on('error', reject);
    req.end(body);
  });
}

function encodeBase64(text) {
  return Buffer.from(String(text), 'utf8').toString('base64');
}

// ---------------------------------------------------------------------------
// 工具定义
// ---------------------------------------------------------------------------

const tools = [
  {
    name: 'terminal_list',
    description:
      '列出当前活跃的终端会话（terminal-desk 面板可见的 PTY 会话）。返回 id/name/cwd。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async call() {
      const res = await capDispatch({ action: 'list' });
      const sessions = res.sessions || [];
      if (sessions.length === 0) return text('当前无活跃终端会话。');
      const lines = sessions.map(
        (s) => `- id=${s.id} name="${s.name}"${s.cwd ? ` cwd=${s.cwd}` : ''}${s.scriptId ? ` script=${s.scriptId}` : ''}`,
      );
      return text(`活跃终端会话 ${sessions.length} 个：\n${lines.join('\n')}`);
    },
  },
  {
    name: 'terminal_run_in_new_session',
    description:
      '在【用户新开的终端会话】里运行命令：会话出现在用户的终端面板中，用户可直接看到输出并接管交互。适合启动 dev server、长时间任务等用户需要看见过程的场景。返回 sessionId。',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要运行的命令（会作为 shell 初始命令执行）' },
        cwd: { type: 'string', description: '可选，工作目录；缺省为当前工作区路径' },
        name: { type: 'string', description: '可选，会话显示名（如 "AI: dev server"）' },
      },
      required: ['command'],
      additionalProperties: false,
    },
    async call(args) {
      const command = String(args.command || '').trim();
      if (!command) return err('缺少 command');
      const res = await capDispatch({
        action: 'create',
        name: args.name ? `AI: ${args.name}` : `AI: ${command.slice(0, 40)}`,
        cwd: args.cwd || WORKSPACE || undefined,
        cols: 80,
        rows: 24,
        initialCommand: command,
        purpose: 'ai',
      });
      const id = res.session && res.session.id;
      if (!id) return err('宿主未返回 sessionId');
      return text(`已在新终端会话启动（sessionId=${id}）。输出在用户的终端面板可见。`);
    },
  },
  {
    name: 'terminal_write',
    description:
      '向既有终端会话写入文本（作为键盘输入）。默认追加回车执行；newline=false 只写不执行。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'terminal_list 返回的会话 ID' },
        text: { type: 'string', description: '要写入的文本' },
        newline: { type: 'boolean', description: '是否在末尾追加回车（默认 true）' },
      },
      required: ['sessionId', 'text'],
      additionalProperties: false,
    },
    async call(args) {
      const sessionId = String(args.sessionId || '');
      if (!sessionId) return err('缺少 sessionId');
      const input = String(args.text ?? '');
      const newline = args.newline !== false;
      await capDispatch({
        action: 'write',
        sessionId,
        data: encodeBase64(newline ? `${input}\r` : input),
      });
      return text('已写入。');
    },
  },
];

function text(content) {
  return { content: [{ type: 'text', text: content }], isError: false };
}

function err(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

// ---------------------------------------------------------------------------
// JSON-RPC over stdio（按行分帧；与 exec-sandbox 同构）
// ---------------------------------------------------------------------------

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (_) {
      continue;
    }
    handleMessage(msg).catch((e) => {
      log('error', `handleMessage: ${e.message}`);
      if (msg.id !== undefined) {
        send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });
      }
    });
  }
});

process.stdin.on('end', () => process.exit(0));

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      },
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const result = await tool.call(args);
      send({ jsonrpc: '2.0', id: msg.id, result });
    } catch (e) {
      log('error', `tool ${name}: ${e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`执行失败：${e.message}`) });
    }
    return;
  }
  if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
}

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
log(
  'info',
  `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready (port=${PORT || '(none)'}, workspace=${WORKSPACE || '(none)'})`,
);
