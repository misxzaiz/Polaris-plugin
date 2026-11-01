'use strict';
/**
 * fake-http-mcp.js —— 测试用 streamable HTTP MCP 服务器
 *
 * 行为：
 * - POST /mcp：initialize → 下发 Mcp-Session-Id；后续请求校验 session 头（缺失 → 400）
 * - tools/list → 1 个 hello 工具；tools/call hello → 文本
 * - 响应 application/json；DELETE /mcp → 202 并计数（断言客户端会话清理）
 * - GET /__stats → {deleted, sessions, requests}
 */
const http = require('http');

const port = parseInt(process.argv[2], 10) || 0;
const state = { deleted: 0, sessions: new Set(), requests: 0 };

const server = http.createServer((req, res) => {
  state.requests += 1;
  if (req.method === 'GET' && req.url === '/__stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ deleted: state.deleted, sessions: state.sessions.size, requests: state.requests }));
    return;
  }
  if (req.method === 'DELETE' && req.url === '/mcp') {
    state.deleted += 1;
    state.sessions.delete(req.headers['mcp-session-id'] || '');
    res.writeHead(202);
    res.end();
    return;
  }
  if (req.method !== 'POST' || req.url !== '/mcp') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let msg;
    try { msg = JSON.parse(body); } catch (_) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad json' }));
      return;
    }
    const reply = (result) => {
      const headers = { 'Content-Type': 'application/json' };
      if (state.currentSession) headers['Mcp-Session-Id'] = state.currentSession;
      res.writeHead(200, headers);
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
    };
    if (msg.method === 'initialize') {
      const sid = `sess-${state.sessions.size + 1}`;
      state.sessions.add(sid);
      state.currentSession = sid;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': sid });
      res.end(JSON.stringify({
        jsonrpc: '2.0', id: msg.id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'fake-http-mcp', version: '0.2.0' },
        },
      }));
      return;
    }
    if (state.sessions.size && !req.headers['mcp-session-id']) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing session' }));
      return;
    }
    if (msg.method === 'tools/list') {
      reply({
        tools: [{
          name: 'hello',
          description: 'HTTP 打招呼。适用：HTTP 链路验证。',
          inputSchema: { type: 'object', properties: { who: { type: 'string' } }, required: ['who'] },
        }],
      });
      return;
    }
    if (msg.method === 'tools/call' && msg.params && msg.params.name === 'hello') {
      reply({ content: [{ type: 'text', text: `hello, ${(msg.params.arguments || {}).who}` }], isError: false });
      return;
    }
    if (msg.method === 'ping') { reply({}); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `未知方法 ${msg.method}` } }));
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stderr.write(`[fake-http-mcp] listening ${server.address().port}\n`);
  process.stdout.write(`${JSON.stringify({ ready: true, port: server.address().port })}\n`);
});
