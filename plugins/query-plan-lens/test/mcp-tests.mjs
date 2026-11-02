// MCP stdio 冒烟：起 hermetic service + mcp/server.js，走真 JSON-RPC stdin/stdout
// node --test test/mcp-tests.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFreePort } from './helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
let SVC_PORT = 9868;
const TOKEN = 'mcp-token-0123456789abcdef';

let svc = null;
let mcp = null;
let tmp = null;
let rpcId = 0;
const pending = new Map();
let mcpBuf = '';

function mcpRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++rpcId;
    pending.set(id, { resolve, reject });
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`MCP 响应超时：${method}`)); }
    }, 20000).unref();
  });
}

function mcpCall(name, args) {
  return mcpRequest('tools/call', { name, arguments: args || {} });
}

before(async () => {
  SVC_PORT = await getFreePort();
  tmp = mkdtempSync(join(tmpdir(), 'qpl-mcp-'));
  svc = spawn(process.execPath, [join(ROOT, 'service', 'main.js'), String(SVC_PORT), tmp], {
    env: { ...process.env, QPL_NO_KV: '1', QPL_TOKEN: TOKEN },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const t0 = Date.now();
  for (;;) {
    try { if ((await fetch(`http://127.0.0.1:${SVC_PORT}/__health`)).ok) break; } catch (_) { /* wait */ }
    if (Date.now() - t0 > 10000) throw new Error('service 10s 未就绪');
    await new Promise((r) => setTimeout(r, 120));
  }
  mcp = spawn(process.execPath, [join(ROOT, 'mcp', 'server.js'), tmp], {
    env: {
      ...process.env,
      QPL_SERVICE_PORT: String(SVC_PORT),
      QPL_SERVICE_TOKEN: TOKEN,
      QPL_NO_KV: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  mcp.stdout.setEncoding('utf8');
  mcp.stdout.on('data', (chunk) => {
    mcpBuf += chunk;
    for (;;) {
      const i = mcpBuf.indexOf('\n');
      if (i === -1) break;
      const line = mcpBuf.slice(0, i).trim();
      mcpBuf = mcpBuf.slice(i + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && pending.has(msg.id)) {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          p.resolve(msg);
        }
      } catch (_) { /* 非 JSON 行忽略 */ }
    }
  });
  mcp.stderr.on('data', () => { /* 静默 */ });
  await mcpRequest('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
});

after(() => {
  if (mcp) mcp.kill();
  if (svc) svc.kill();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

test('tools/list：五个工具且 schema 完整', async () => {
  const res = await mcpRequest('tools/list', {});
  const tools = res.result.tools;
  assert.equal(tools.length, 5);
  for (const t of tools) {
    assert.ok(t.name.startsWith('qpl_'), t.name);
    assert.ok(t.description.length > 20, `${t.name} 描述过短`);
  }
  const names = tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ['qpl_connections', 'qpl_explain', 'qpl_history', 'qpl_history_get', 'qpl_parse'].sort());
});

test('qpl_connections：空列表提示 / 保存后可见且无密码', async () => {
  const empty = await mcpCall('qpl_connections', {});
  assert.match(empty.result.content[0].text, /尚无已保存连接/);

  await fetch(`http://127.0.0.1:${SVC_PORT}/conns.save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ name: '冒烟库', engine: 'pg', host: '127.0.0.1', port: 54321, database: 'd', user: 'u', password: 'pw-123' }),
  });
  const one = await mcpCall('qpl_connections', {});
  assert.match(one.result.content[0].text, /冒烟库/);
  assert.doesNotMatch(one.result.content[0].text, /pw-123/, 'AI 通道不得出现明文密码');
});

test('qpl_explain：写语句拒绝 / 连不上的库友好报错', async () => {
  const bad = await mcpCall('qpl_explain', { connection: '冒烟库', sql: 'DROP TABLE x' });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /只读|只接受|DROP/);
  const dead = await mcpCall('qpl_explain', { connection: '冒烟库', sql: 'SELECT 1' });
  assert.equal(dead.result.isError, true);
  assert.match(dead.result.content[0].text, /连不上|超时/);
  const unknown = await mcpCall('qpl_explain', { connection: '不存在的库', sql: 'SELECT 1' });
  assert.match(unknown.result.content[0].text, /找不到连接/);
});

test('qpl_parse：PG 文本 → 计划树 + 发现（AI 可读摘要）', async () => {
  const r = await mcpCall('qpl_parse', {
    text: 'Sort  (cost=135.62..135.87 rows=100 width=8) (actual time=42.1..42.3 rows=2000 loops=1)\n  Sort Method: external merge  Disk: 4096kB\n  ->  Seq Scan on users u  (cost=0.00..120.00 rows=100 width=8) (actual time=0.03..30.0 rows=2000 loops=1)\n        Filter: (u.age > 21)\n        Rows Removed by Filter: 48000\nPlanning Time: 0.25 ms\nExecution Time: 45.00 ms',
  });
  assert.equal(r.result.isError, undefined);
  const text = r.result.content[0].text;
  assert.match(text, /PostgreSQL/);
  assert.match(text, /计划树/);
  assert.match(text, /外排磁盘/);
  assert.match(text, /全表扫描/);
  assert.ok(text.length <= 6600, 'AI 摘要应有界');
});

test('qpl_history / qpl_history_get', async () => {
  const h = await mcpCall('qpl_history', {});
  assert.match(h.result.content[0].text, /暂无分析历史/);
  const bad = await mcpCall('qpl_history_get', { id: 'nope' });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /不存在/);
});
