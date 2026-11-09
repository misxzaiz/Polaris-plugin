/**
 * terminal-desk MCP stdio 协议冒烟（node --test test/mcp-tests.mjs）
 *
 * hermetic：起一个假宿主 HTTP 服务器（回应 cap.terminal 三个动作），
 * spawn mcp/server.js 子进程，按行交换 JSON-RPC，全链路验证：
 *  - initialize 握手（协议版本/服务名）
 *  - tools/list 三工具 schema
 *  - tools/call → 假宿主收到正确 target/payload/鉴权头 → 工具回包
 *  - 未知工具 / 未知 method 错误路径
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_JS = path.join(root, 'mcp', 'server.js');

/** 起假宿主：按 action 回应；记录请求供断言 */
async function startFakeHost() {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      seen.push({ headers: req.headers, body });
      const payload = body.payload || {};
      let result = {};
      if (payload.action === 'list') {
        result = { sessions: [{ id: 's1', name: 'Terminal 1', cwd: 'D:/w', closed: false }] };
      } else if (payload.action === 'create') {
        result = { session: { id: 'new-1', name: payload.name, closed: false } };
      } else if (payload.action === 'write') {
        result = {};
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: `unknown action ${payload.action}` }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return { server, port, seen };
}

/** spawn server.js 并按行交换 JSON-RPC */
function startServer(port) {
  const child = spawn(process.execPath, [SERVER_JS, String(port), 'testtoken', 'D:/workspace'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  const queue = [];
  const waiters = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      const waiter = waiters.shift();
      if (waiter) waiter(msg);
      else queue.push(msg);
    }
  });
  child.stderr.on('data', () => {}); // 日志走 stderr，冒烟忽略
  const next = () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => waiters.push(r)));
  const rpc = (method, params) => {
    const id = Math.random().toString(36).slice(2);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return next().then((msg) => {
      assert.equal(msg.id, id, `响应 id 错位: ${JSON.stringify(msg).slice(0, 200)}`);
      return msg;
    });
  };
  /** notification 无响应（MCP 语义），只写不等 */
  const notify = (method, params) => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  };
  return { child, rpc, notify };
}

test('MCP stdio 全链路：握手 → tools/list → tools/call 假宿主闭环', async () => {
  const host = await startFakeHost();
  const { child, rpc, notify } = startServer(host.port);
  try {
    // 1. initialize
    const init = await rpc('initialize', {});
    assert.equal(init.result.serverInfo.name, 'terminal-desk');
    assert.ok(init.result.capabilities.tools);

    notify('notifications/initialized', {});

    // 2. tools/list
    const list = await rpc('tools/list', {});
    const names = list.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['terminal_list', 'terminal_run_in_new_session', 'terminal_write']);

    // 3. tools/call: terminal_list → 假宿主收到 cap.terminal 分发 + md5 鉴权
    const call1 = await rpc('tools/call', { name: 'terminal_list', arguments: {} });
    assert.equal(call1.result.isError, false);
    assert.ok(call1.result.content[0].text.includes('s1'));
    assert.equal(host.seen.length, 1);
    assert.equal(host.seen[0].body.target, 'cap.terminal');
    assert.equal(host.seen[0].headers.authorization, `Bearer ${crypto.createHash('md5').update('testtoken').digest('hex')}`);

    // 4. tools/call: terminal_run_in_new_session（cwd 缺省回落 argv 工作区）
    const call2 = await rpc('tools/call', {
      name: 'terminal_run_in_new_session',
      arguments: { command: 'pnpm dev', name: 'dev' },
    });
    assert.equal(call2.result.isError, false);
    assert.ok(call2.result.content[0].text.includes('new-1'));
    const createPayload = host.seen[1].body.payload;
    assert.equal(createPayload.action, 'create');
    assert.equal(createPayload.initialCommand, 'pnpm dev');
    assert.equal(createPayload.cwd, 'D:/workspace');
    assert.ok(createPayload.name.startsWith('AI: '));

    // 5. tools/call: terminal_write（newline 默认 true → \r）
    const call3 = await rpc('tools/call', {
      name: 'terminal_write',
      arguments: { sessionId: 's1', text: 'ls' },
    });
    assert.equal(call3.result.isError, false);
    const writePayload = host.seen[2].body.payload;
    assert.equal(writePayload.action, 'write');
    assert.equal(Buffer.from(writePayload.data, 'base64').toString('utf8'), 'ls\r');
  } finally {
    child.kill();
    host.server.close();
  }
}, { timeout: 20000 });

test('MCP 错误路径：未知工具 → isError；缺参 → isError', async () => {
  const host = await startFakeHost();
  const { child, rpc } = startServer(host.port);
  try {
    await rpc('initialize', {});
    const bad = await rpc('tools/call', { name: 'nope', arguments: {} });
    assert.equal(bad.result.isError, true);
    assert.ok(bad.result.content[0].text.includes('未知工具'));

    const noCmd = await rpc('tools/call', {
      name: 'terminal_run_in_new_session',
      arguments: {},
    });
    assert.equal(noCmd.result.isError, true);
    assert.ok(noCmd.result.content[0].text.includes('缺少 command'));
  } finally {
    child.kill();
    host.server.close();
  }
}, { timeout: 20000 });
