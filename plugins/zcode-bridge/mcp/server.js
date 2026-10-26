#!/usr/bin/env node
// zcode-bridge MCP Server —— 让 AI 在 Polaris 中桥接已安装 ZCode 会话
//
// 工具：
//   zcode_list_sessions   列出 db.sqlite 中最近会话（含桌面端可见性线索）
//   zcode_create_session  新建 ZCode 会话（app-server 官方协议）
//   zcode_send_message    向会话发消息（可续接已有会话，等价 --resume）
//
// 架构：本进程是 MCP stdio server（JSON-RPC 2.0，与宿主走自身 stdin/stdout）。
//   zcode app-server 作为子进程独立管道，两者不冲突。
//   create 返回后子进程常驻，供后续 send 复用；sessionId 变更即弃旧启新。
//
// 配置：
//   env ZCODE_CJS / ZCODE_PROVIDER_CONFIG 可覆盖默认路径
//   env ZCODE_WORKSPACE_PATH 覆盖默认工作区（缺省 {{workspacePath}} 由 args[0] 注入）
'use strict';

const path = require('node:path');
const { ZCodeClient, queryDbSessions } = require('./zcode-core');

const SERVER_NAME = 'zcode-bridge-mcp';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

// ── 配置 ────────────────────────────────────────────────────────────────────
const WORKSPACE_PATH = process.env.ZCODE_WORKSPACE_PATH || process.argv[2] || '';
const DEFAULT_WS = 'D:/space/base/Polaris';

let client = null;          // 当前常驻的 ZCodeClient
let clientSessionId = null; // client 对应的 sessionId

function currentWorkspace() {
  return WORKSPACE_PATH || DEFAULT_WS;
}

function workspaceRef(workspacePath) {
  // 关键：不传 workspaceIdentity → 落盘 workspace_id=null → 桌面端 reconcile 可匹配
  return { workspacePath, workspaceKey: workspacePath };
}

function ensureClient({ workspacePath } = {}) {
  const ws = workspacePath || currentWorkspace();
  if (client) return { client, ws, reuse: true };
  client = new ZCodeClient({ workspacePath: ws });
  clientSessionId = null;
  return { client, ws, reuse: false };
}

async function disposeClient() {
  if (client) await client.dispose();
  client = null;
  clientSessionId = null;
}

// ── 工具实现 ────────────────────────────────────────────────────────────────

async function listSessions(args) {
  const limit = Math.min(Math.max(parseInt(args.limit || '20', 10) || 20, 1), 50);
  const rows = queryDbSessions({ limit });
  if (rows.error) {
    return { content: [{ type: 'text', text: `无法读取 ZCode 会话库: ${rows.error}` }], isError: true };
  }
  if (!rows.length) {
    return { content: [{ type: 'text', text: 'ZCode 会话库为空（尚未有落盘会话）' }] };
  }
  const lines = rows.map((r, i) => {
    const ws = r.workspaceId || '(null)';
    const vis = r.directory ? `→ ${r.directory}` : '(无 directory，桌面端不可见)';
    return `${i + 1}. ${r.sessionId}  ${r.title || '(无标题)'}  [${r.taskType}]  ws=${ws}  ${vis}  更新 ${r.timeUpdated}`;
  });
  return { content: [{ type: 'text', text: `ZCode 最近会话（${rows.length} 条）:\n${lines.join('\n')}` }] };
}

async function createSession(args) {
  const ws = args.workspacePath || currentWorkspace();
  let sess;
  try {
    ({ client: sess } = ensureClient({ workspacePath: ws }));
    const resp = await sess.request('session/create', {
      workspace: workspaceRef(ws),
      mode: args.mode || 'auto',
    });
    if (resp.error) throw new Error(`${resp.error.message || 'create 失败'} (${resp.error.code})`);
    const sessionId = resp.result.sessionId || (resp.result.session && resp.result.session.sessionId);
    if (!sessionId) throw new Error('create 未返回 sessionId');
    clientSessionId = sessionId;
    return {
      content: [{
        type: 'text',
        text: `ZCode 会话已创建: ${sessionId}\n会话归属工作区: ${ws}\n发送消息用 zcode_send_message。`,
      }],
    };
  } catch (e) {
    if (client && !client.child) { await disposeClient(); }
    return { content: [{ type: 'text', text: `创建失败: ${e.message}` }], isError: true };
  }
}

async function sendMessage(args) {
  const sessionId = args.sessionId || clientSessionId;
  if (!sessionId) return { content: [{ type: 'text', text: '缺少 sessionId：请先 zcode_create_session，或传入已有会话 ID 续接' }], isError: true };
  const content = args.content;
  if (!content || !content.trim()) return { content: [{ type: 'text', text: '缺少 content' }], isError: true };

  // 目标会话与当前常驻子进程不同 → 弃旧启新（等价 --resume 换会话）
  if (client && clientSessionId && sessionId !== clientSessionId) {
    await disposeClient();
  }
  let sess;
  try {
    ({ client: sess } = ensureClient());
    const resp = await sess.request('session/send', {
      sessionId,
      content: content.trim(),
    });
    if (resp.error) {
      // 会话不存在等错误 → 不常驻，交还调用方重试
      if (client && !client.child) await disposeClient();
      return { content: [{ type: 'text', text: `发送失败: ${resp.error.message || 'session/send 错误'} (${resp.error.code})` }], isError: true };
    }
    clientSessionId = sessionId;
    // send 会发起后台模型轮，完成才落盘。这里主动等一版落盘以便 AI 判断可见性。
    const summary = summarizeSendResult(resp.result, sessionId);
    return { content: [{ type: 'text', text: summary }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `发送失败: ${e.message}` }], isError: true };
  }
}

function summarizeSendResult(result, sessionId) {
  const replyText = result && result.replyText != null ? result.replyText : '';
  const roleCount = result && Array.isArray(result.roleCount) ? result.roleCount.length : 0;
  const snippet = String(replyText || '').slice(0, 300);
  const parts = [
    `消息已发送至 ZCode 会话 ${sessionId}`,
    roleCount ? `（模型回合 ${roleCount} 个）` : '',
    snippet ? `\n回复: ${snippet}` : '\n（无文本回复，可能为工具轮/流式中）',
    '\n提示: 回复完整落盘后桌面 ZCode 列表可见。续接其它会话传入其 sessionId 即可。',
  ];
  return parts.join('');
}

// ── JSON-RPC 2.0 over stdio ────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'zcode_list_sessions',
    description: '列出 ZCode 最近会话（读取 ~/.zcode/cli/db/db.sqlite）。返回 sessionId/title/workspaceId/directory/更新时间，directory 非空表示桌面端可见。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '最多条数（1-50，默认 20）' },
      },
    },
  },
  {
    name: 'zcode_create_session',
    description: '新建一个 ZCode 会话（官方 app-server 协议）。返回新 sessionId；此后 zcode_send_message 无需再传 sessionId。',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: '会话归属工作区绝对路径（缺省当前 Polaris 工作区）' },
        mode: { type: 'string', enum: ['auto', 'code', 'chat'], description: '会话模式，默认 auto' },
      },
    },
  },
  {
    name: 'zcode_send_message',
    description: '向 ZCode 会话发送一条消息并等待模型回合。可传 sessionId 续接任意已有会话（等价 zcode --resume）。不传则使用 zcode_create_session 刚创建的会话。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '目标会话 ID；缺省用当前会话' },
        content: { type: 'string', description: '要发送的消息内容' },
      },
      required: ['content'],
    },
  },
];

function handleCall(toolName, args, requestId) {
  const reply = (result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, result }) + '\n');

  Promise.resolve()
    .then(() => {
      if (toolName === 'zcode_list_sessions') return listSessions(args || {});
      if (toolName === 'zcode_create_session') return createSession(args || {});
      if (toolName === 'zcode_send_message') return sendMessage(args || {});
      return { content: [{ type: 'text', text: `未知工具: ${toolName}` }], isError: true };
    })
    .then(reply)
    .catch((e) => reply({ content: [{ type: 'text', text: `内部错误: ${(e && e.message) || e}` }], isError: true }));
}

const rl = require('node:readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === 'initialize') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } },
    }) + '\n');
  } else if (msg.method === 'tools/list') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } }) + '\n');
  } else if (msg.method === 'tools/call') {
    handleCall(msg.params && msg.params.name, (msg.params && msg.params.arguments) || {}, msg.id);
  } else if (msg.method === 'notifications/initialized') {
    /* 静默 */
  }
});
process.stdin.on('end', () => { disposeClient().finally(() => process.exit(0)); });