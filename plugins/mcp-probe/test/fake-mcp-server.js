'use strict';
/**
 * fake-mcp-server.js —— 测试用 stdio MCP 服务器（换行 JSON-RPC）
 *
 * 工具：
 *   echo {text}            → 文本回显
 *   add {a, b}             → 数字相加
 *   no_desc {x}            → 故意缺 description（体检 warn 用）
 *   slow {}                → 8s 后返回（超时用）
 * 启动后主动发一条通知（客户端应忽略而非崩溃）。
 */
const TOOL_RESULT = (text) => ({ content: [{ type: 'text', text }], isError: false });

const TOOLS = [
  {
    name: 'echo',
    description: '回显输入文本。适用：测试往返链路。',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: '要回显的文本' } }, required: ['text'] },
  },
  {
    name: 'add',
    description: '两数相加。适用：验证数值参数。',
    inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] },
  },
  {
    name: 'no_desc',
    inputSchema: { type: 'object', properties: { x: { type: 'string' } } },
  },
  {
    name: 'slow',
    description: '故意 8 秒后返回。适用：超时行为验证。',
    inputSchema: { type: 'object', properties: {} },
  },
];

let buffered = '';
process.stdin.setEncoding('utf8');
// 启动通知：合法客户端应静默忽略
setTimeout(() => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', data: 'fake server up' } })}\n`);
}, 30);

function send(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

process.stdin.on('data', (chunk) => {
  buffered += chunk;
  let idx;
  // eslint-disable-next-line no-cond-assign
  while ((idx = buffered.indexOf('\n')) >= 0) {
    const line = buffered.slice(0, idx).trim();
    buffered = buffered.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handle(msg);
  }
});

function handle(msg) {
  if (!msg || msg.id === undefined || msg.id === null) return;
  const { id, method, params } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'fake-stdio-mcp', version: '1.0.0' },
      },
    });
    return;
  }
  if (method === 'ping') { send({ jsonrpc: '2.0', id, result: {} }); return; }
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }
  if (method === 'resources/list') { send({ jsonrpc: '2.0', id, result: { resources: [] } }); return; }
  if (method === 'prompts/list') { send({ jsonrpc: '2.0', id, result: { prompts: [] } }); return; }
  if (method === 'tools/call') {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    if (name === 'echo') { send({ jsonrpc: '2.0', id, result: TOOL_RESULT(`echo: ${args.text}`) }); return; }
    if (name === 'add') { send({ jsonrpc: '2.0', id, result: TOOL_RESULT(`sum: ${Number(args.a) + Number(args.b)}`) }); return; }
    if (name === 'no_desc') { send({ jsonrpc: '2.0', id, result: TOOL_RESULT(`x=${args.x}`) }); return; }
    if (name === 'slow') {
      setTimeout(() => send({ jsonrpc: '2.0', id, result: TOOL_RESULT('finally done') }), 8000);
      return;
    }
    send({ jsonrpc: '2.0', id, error: { code: -32602, message: `未知工具 ${name}` } });
    return;
  }
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法 ${method}` } });
}

process.stderr.write('[fake-stdio-mcp] ready\n');
