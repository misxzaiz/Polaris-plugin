/**
 * MCP 协议全链路测试（stdio 子进程 + 内存假 kv 桥 + 真服务同跑）：node test/mcp-tests.mjs
 *
 * 链路：spawn service/main.js（端口 0）+ mcp/server.js（同一假桥）→
 *   initialize → tools/list（8 工具）→ mock_upsert 新建 → settings 落库 →
 *   mock_routes 列表 → mock_upsert partial 更新 → mock_overview → mock_test 真试发 →
 *   mock_import_openapi 预览+apply → mock_history → mock_selftest → mock_delete
 * 退出码 0=全绿；临时进程自清理。
 */
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

// ── 假 kv 桥（内存 Map）─────────────────────────────────────────────────────
function startFakeBridge() {
  const store = new Map();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      const payload = (parsed.req && parsed.req.payload) || {};
      const act = payload.action;
      let result = null;
      if (act === 'get') result = { ok: true, result: { value: store.has(payload.key) ? store.get(payload.key) : null } };
      else if (act === 'set') { store.set(payload.key, payload.value === undefined ? null : payload.value); result = { ok: true, result: { ok: true } }; }
      else if (act === 'delete') { store.delete(payload.key); result = { ok: true, result: { ok: true } }; }
      else result = { ok: false, error: 'unknown' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ store, port: server.address().port }));
  });
}

const bridge = await startFakeBridge();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mck-mcp-test-'));
let svc = null;
let mcp = null;
let mcpRl = null;
let seq = 0;
const pending = new Map();

function startService() {
  return new Promise(async (resolve, reject) => {
    svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'main.js'), '0', tmpDir], {
      env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridge.port), POLARIS_TOKEN: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const meta = bridge.store.get('mck.meta');
      if (meta && meta.port) { resolve(meta.port); return; }
      await sleep(300);
    }
    reject(new Error('服务未上线'));
  });
}

let initResp = null;
let mcpErrTail = '';

async function startMcp() {
  mcp = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), tmpDir], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridge.port), POLARIS_TOKEN: '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  mcp.stderr.on('data', (c) => { mcpErrTail = (mcpErrTail + c).slice(-2000); });
  mcpRl = readline.createInterface({ input: mcp.stdout });
  mcpRl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch (_) { return; }
    if (msg && msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {} })}\n`);
  initResp = await callRpc(0);
}

function callRpc(id, method, params) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC 超时 id=${id} ${method || ''}\nMCP stderr: ${mcpErrTail}`)); }, 60000);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

function toolText(msg) {
  assert.ok(msg && msg.result && Array.isArray(msg.result.content), `响应缺 content: ${JSON.stringify(msg).slice(0, 300)}`);
  return msg.result.content.map((c) => c.text || '').join('\n');
}

const OPENAPI_SPEC = {
  openapi: '3.0.0',
  info: { title: '宠物店', version: '1.0.0' },
  paths: {
    '/pets': {
      get: {
        summary: '宠物列表',
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { type: 'object', properties: { code: { type: 'integer' }, data: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } } } } } } },
          },
        },
      },
      post: { summary: '新建宠物', responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } } } },
    },
    '/pets/{id}': {
      get: {
        summary: '宠物详情',
        responses: {
          '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } } } } },
        },
      },
    },
  },
};

let svcPort = 0;
try {
  svcPort = await startService();
  await startMcp();

  await t('initialize：serverInfo=mock-server', async () => {
    assert.ok(initResp && initResp.result, `initialize 无响应: ${JSON.stringify(initResp)}`);
    assert.strictEqual(initResp.result.serverInfo.name, 'mock-server');
    assert.ok(initResp.result.serverInfo.version);
  });

  await t('tools/list：8 个工具且 schema 完整', async () => {
    const r = await callRpc(2, 'tools/list', {});
    const names = r.result.tools.map((x) => x.name);
    assert.deepStrictEqual(names.sort(), ['mock_delete', 'mock_history', 'mock_import_openapi', 'mock_overview', 'mock_routes', 'mock_selftest', 'mock_test', 'mock_upsert']);
    for (const tool of r.result.tools) assert.ok(tool.description && tool.inputSchema, `${tool.name} 缺描述/schema`);
  });

  let newId = '';
  await t('mock_upsert 新建：回执含入口 URL，settings 落库', async () => {
    const r = await callRpc(3, 'tools/call', { name: 'mock_upsert', arguments: { route: { method: 'GET', path: '/api/orders/:id', status: 200, bodyType: 'json', body: '{"id":"{{req.path.id}}","no":"{{int 100,999}}"}', name: '订单详情' } } });
    const text = toolText(r);
    assert.match(text, /已新建路由/);
    assert.match(text, /127\.0\.0\.1:(\d+)\/api\/orders\/:id/);
    const m = /\[(.+?)\] 已新建|已新建路由 \[(.+?)\]/.exec(text);
    newId = (m && (m[1] || m[2])) || '';
    assert.ok(newId, `未取到 id: ${text}`);
    const s = bridge.store.get('mck.settings');
    assert.ok(s.routes.some((x) => x.id === newId && x.path === '/api/orders/:id'));
  });

  await t('mock_routes 列出新建路由', async () => {
    const r = await callRpc(4, 'tools/call', { name: 'mock_routes', arguments: {} });
    const text = toolText(r);
    assert.match(text, /\/api\/orders\/:id/);
    assert.match(text, /订单详情/);
  });

  await t('mock_upsert partial 更新（同 id 改状态码）', async () => {
    const r = await callRpc(5, 'tools/call', { name: 'mock_upsert', arguments: { route: { id: newId, method: 'GET', path: '/api/orders/:id', status: 404, bodyType: 'json', body: '{"err":"not found"}' } } });
    assert.match(toolText(r), /已更新路由/);
    const s = bridge.store.get('mck.settings');
    const rt = s.routes.find((x) => x.id === newId);
    assert.strictEqual(rt.status, 404);
    assert.strictEqual(s.routes.filter((x) => x.path === '/api/orders/:id').length, 1, 'partial 更新产生了重复路由');
  });

  await t('mock_overview：服务在线 + 路由摘要', async () => {
    const r = await callRpc(6, 'tools/call', { name: 'mock_overview', arguments: {} });
    const text = toolText(r);
    assert.match(text, /正常/);
    assert.match(text, new RegExp(`127\\.0\\.0\\.1:${svcPort}`));
    assert.match(text, /\/api\/orders\/:id/);
  });

  await t('mock_test：真试发（上一测试已把状态码改成 404，应忠实返回 404 体）', async () => {
    const r = await callRpc(7, 'tools/call', { name: 'mock_test', arguments: { routeId: newId, query: 'src=mcp' } });
    const text = toolText(r);
    assert.match(text, /状态: 404/, `应返回更新后的 404: ${text}`);
    assert.match(text, /"err":"not found"/);
    assert.match(text, /\/api\/orders\/test-id\?src=mcp/);
  });

  await t('mock_import_openapi 预览（apply:false）→ 3 条', async () => {
    const r = await callRpc(8, 'tools/call', { name: 'mock_import_openapi', arguments: { spec: OPENAPI_SPEC } });
    const text = toolText(r);
    assert.match(text, /可导入 3 条路由/);
    assert.match(text, /apply:true/);
    const s = bridge.store.get('mck.settings');
    assert.strictEqual(s.routes.filter((x) => x.path.startsWith('/pets')).length, 0, '预览不该写入');
  });

  await t('mock_import_openapi 写入（apply:true）→ schema 模板化', async () => {
    const r = await callRpc(9, 'tools/call', { name: 'mock_import_openapi', arguments: { spec: OPENAPI_SPEC, apply: true } });
    assert.match(toolText(r), /已导入 3 条/);
    const s = bridge.store.get('mck.settings');
    const pets = s.routes.filter((x) => x.path.startsWith('/pets'));
    assert.strictEqual(pets.length, 3);
    const detail = pets.find((x) => x.path === '/pets/{id}');
    assert.match(detail.body, /\{\{int 1,999\}\}/);
  });

  await t('mock_history：能看到 mock_test 的试发', async () => {
    await sleep(4500); // 等 hist 镜像
    const r = await callRpc(10, 'tools/call', { name: 'mock_history', arguments: { q: 'orders' } });
    const text = toolText(r);
    assert.match(text, /\/api\/orders\/test-id/);
  });

  await t('mock_selftest：7 项全绿', async () => {
    const r = await callRpc(11, 'tools/call', { name: 'mock_selftest', arguments: {} });
    const text = toolText(r);
    assert.match(text, /7\/7 ✅ 全绿/);
  });

  await t('mock_delete：删除后列表无', async () => {
    const r = await callRpc(12, 'tools/call', { name: 'mock_delete', arguments: { id: newId } });
    assert.match(toolText(r), /已删除路由/);
    const r2 = await callRpc(13, 'tools/call', { name: 'mock_delete', arguments: { id: newId } });
    assert.match(toolText(r2), /路由不存在/);
    const s = bridge.store.get('mck.settings');
    assert.ok(!s.routes.some((x) => x.id === newId));
  });

  await t('未知工具 → isError', async () => {
    const r = await callRpc(14, 'tools/call', { name: 'no_such_tool', arguments: {} });
    assert.strictEqual(r.result.isError, true);
  });
} finally {
  if (mcp) { try { mcp.kill('SIGTERM'); } catch (_) {} }
  if (svc) { try { svc.kill('SIGTERM'); } catch (_) {} }
  try { bridge.server.close(); } catch (_) {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
}

let fail = 0;
for (const r of results) {
  console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`);
  if (!r.pass) fail += 1;
}
console.log(`\nMCP 全链路测试: ${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);
