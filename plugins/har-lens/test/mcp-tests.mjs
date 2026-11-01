/**
 * MCP 全链路测试（stdio JSON-RPC + 假桥 + 真服务同跑）：node test/mcp-tests.mjs
 *
 * 链路：spawn service/main.js + mcp/server.js（env 指向同一内存假桥）→
 *   1. initialize / tools/list（8 工具）
 *   2. har_open（fixture 真实文件）→ 概览摘要返回
 *   3. har_overview（读投影）/ har_requests 各 filter / har_entry（详情掩码）
 *   4. har_audit / har_sanitize（预检+confirm 落盘）/ har_compare / har_selftest
 *   5. 未知工具报错 / 无活动 HAR 提示（tools/call 在 open 前查 overview）
 * 退出码 0=全绿；临时进程自清理。
 */
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = (await import('../shared/core.js')).default ?? (await import('../shared/core.js'));

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startFakeBridge() {
  const store = new Map();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const payload = (parsed.req && parsed.req.payload) || {};
        const act = payload.action;
        let result = null;
        if (act === 'get') result = { ok: true, result: { value: store.has(payload.key) ? store.get(payload.key) : null } };
        else if (act === 'set') { store.set(payload.key, payload.value === undefined ? null : payload.value); result = { ok: true, result: { ok: true } }; }
        else if (act === 'delete') { store.delete(payload.key); result = { ok: true, result: { ok: true } }; }
        else if (act === 'list') result = { ok: true, result: { keys: [...store.keys()] } };
        else result = { ok: false, error: `fake bridge: unknown action ${act}` };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, store, port: server.address().port }));
  });
}

const bridge = await startFakeBridge();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'har-lens-mcp-'));
const fixture = core.makeFixtureHar();
const fixturePath = path.join(tmpDir, 'trace.har');
fs.writeFileSync(fixturePath, JSON.stringify(fixture));

let svc = null;
let mcp = null;
let mcpBuf = '';
let mcpWaiters = [];

function startMcp() {
  mcp = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), tmpDir], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridge.port), POLARIS_TOKEN: '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let errTail = '';
  mcp.stderr.on('data', (c) => { errTail = (errTail + c).slice(-2000); });
  mcp.stdout.on('data', (c) => {
    mcpBuf += c;
    let idx;
    while ((idx = mcpBuf.indexOf('\n')) >= 0) {
      const line = mcpBuf.slice(0, idx).trim();
      mcpBuf = mcpBuf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const w = mcpWaiters.find((x) => x.id === msg.id);
        if (w) { mcpWaiters = mcpWaiters.filter((x) => x !== w); w.resolve(msg); }
      } catch (_) { /* ignore */ }
    }
  });
  mcp.errTail = () => errTail;
}

let rpcId = 0;
async function rpc(method, params, timeoutMs = 70000) {
  const id = ++rpcId;
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  const reply = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`RPC 超时 ${method}\n${mcp.errTail()}`)), timeoutMs);
    mcpWaiters.push({ id, resolve: (msg) => { clearTimeout(timer); resolve(msg); } });
  });
  if (reply.error) throw new Error(`RPC 错误 ${method}: ${JSON.stringify(reply.error)}`);
  return reply.result;
}
async function callTool(name, args = {}) {
  const r = await rpc('tools/call', { name, arguments: args });
  const text = r.content && r.content[0] && r.content[0].text || '';
  return { text, isError: !!r.isError };
}

try {
  // 先起服务（消费命令信箱），再起 MCP
  svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'main.js'), '0', tmpDir], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridge.port), POLARIS_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let svcErr = '';
  svc.stderr.on('data', (c) => { svcErr = (svcErr + c).slice(-2000); });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const meta = bridge.store.get('har.meta');
    if (meta && meta.port) break;
    await sleep(300);
  }
  startMcp();
  await sleep(500);

  // ── 1. 握手与工具清单 ──────────────────────────────────────────────────────
  await t('initialize 握手', async () => {
    const r = await rpc('initialize', { protocolVersion: '2024-11-05' });
    assert.strictEqual(r.serverInfo.name, 'har-lens');
    assert.ok(r.capabilities.tools);
  });
  await t('tools/list 返回 8 工具（含 har_open/har_audit/har_sanitize/har_compare）', async () => {
    const r = await rpc('tools/list', {});
    const names = r.tools.map((x) => x.name);
    for (const expect of ['har_open', 'har_overview', 'har_requests', 'har_entry', 'har_audit', 'har_sanitize', 'har_compare', 'har_selftest']) {
      assert.ok(names.includes(expect), `缺 ${expect}`);
    }
    assert.ok(r.tools.every((x) => x.inputSchema && x.description));
  });

  // ── 2. 未打开时的提示 ──────────────────────────────────────────────────────
  await t('har_overview 未打开时给出引导（不报协议错误）', async () => {
    const r = await callTool('har_overview');
    assert.ok(!r.isError || r.text.includes('尚未打开') || r.text.includes('未上线'), r.text.slice(0, 120));
  });

  // ── 3. har_open 全链路（MCP → kv 信箱 → 服务解析 → 概览回执）───────────────
  await t('har_open：真实文件解析 + 概览摘要 + 无明文密钥', async () => {
    const r = await callTool('har_open', { path: fixturePath });
    assert.ok(!r.isError, r.text.slice(0, 200));
    assert.ok(r.text.includes('6 条请求'), r.text.slice(0, 200));
    assert.ok(!r.text.includes('SECRET123'));
  });
  await t('har_open：坏文件报业务错误（isError=true）', async () => {
    const badPath = path.join(tmpDir, 'broken.har');
    fs.writeFileSync(badPath, '{"broken": true');
    const r = await callTool('har_open', { path: badPath });
    assert.ok(r.isError && r.text.includes('失败'), r.text.slice(0, 120));
  });

  // ── 4. 读类工具 ────────────────────────────────────────────────────────────
  await t('har_overview：状态分布/p95/审计速览齐全', async () => {
    const r = await callTool('har_overview');
    assert.ok(!r.isError, r.text.slice(0, 200));
    assert.ok(r.text.includes('p95') && r.text.includes('状态') && r.text.includes('敏感审计速览'), r.text.slice(0, 400));
    assert.ok(!r.text.includes('SECRET123'));
  });
  await t('har_requests filter=errors 命中 2 条', async () => {
    const r = await callTool('har_requests', { filter: 'errors' });
    assert.ok(r.text.includes('500'), r.text.slice(0, 300));
    assert.ok(r.text.includes('404'));
  });
  await t('har_requests filter=dup 输出重复组', async () => {
    const r = await callTool('har_requests', { filter: 'dup' });
    assert.ok(r.text.includes('×2'), r.text.slice(0, 300));
  });
  await t('har_requests q 过滤（orders）', async () => {
    const r = await callTool('har_requests', { q: 'orders' });
    assert.ok(r.text.includes('/v1/orders'), r.text.slice(0, 300));
  });
  await t('har_entry：七段时相 + 无明文密钥', async () => {
    const r = await callTool('har_entry', { index: 4 });
    assert.ok(!r.isError, r.text.slice(0, 200));
    assert.ok(r.text.includes('wait:1100'), r.text.slice(0, 400));
    assert.ok(!r.text.includes('sk-proj-') && !r.text.includes('s3cret'));
  });
  await t('har_entry：越界报错', async () => {
    const r = await callTool('har_entry', { index: 999 });
    assert.ok(r.isError);
  });

  // ── 5. har_audit / har_sanitize ────────────────────────────────────────────
  await t('har_audit：高危分类列出 + 样例已脱敏', async () => {
    const r = await callTool('har_audit');
    assert.ok(!r.isError, r.text.slice(0, 200));
    assert.ok(r.text.includes('高危') && r.text.includes('鉴权头'), r.text.slice(0, 400));
    assert.ok(!JSON.stringify(r).includes('SECRET123'));
  });
  await t('har_sanitize：先预检不写盘', async () => {
    const r = await callTool('har_sanitize', {});
    assert.ok(!r.isError, r.text.slice(0, 200));
    assert.ok(r.text.includes('未写盘') && r.text.includes('trace.sanitized.har'), r.text.slice(0, 300));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'trace.sanitized.har')));
  });
  await t('har_sanitize confirm：落盘 + sha256 + 复核', async () => {
    const r = await callTool('har_sanitize', { confirm: true });
    assert.ok(!r.isError, r.text.slice(0, 200));
    assert.ok(r.text.includes('sha256') && fs.existsSync(path.join(tmpDir, 'trace.sanitized.har')));
    assert.ok(r.text.includes('复核'));
  });

  // ── 6. har_compare / har_selftest ──────────────────────────────────────────
  await t('har_compare：变慢与翻转摘要返回', async () => {
    const f2 = JSON.parse(JSON.stringify(fixture));
    f2.log.entries[4].time = 2400;
    const cmpPath = path.join(tmpDir, 'after.har');
    fs.writeFileSync(cmpPath, JSON.stringify(f2));
    const r = await callTool('har_compare', { path: cmpPath });
    assert.ok(!r.isError, r.text.slice(0, 200));
    assert.ok(r.text.includes('变慢'), r.text.slice(0, 400));
  });
  await t('har_selftest：全绿', async () => {
    const r = await callTool('har_selftest');
    assert.ok(!r.isError, r.text.slice(0, 400));
    assert.ok(r.text.includes('全绿'), r.text.slice(0, 400));
  });

  // ── 7. 未知工具 ────────────────────────────────────────────────────────────
  await t('未知工具返回协议错误', async () => {
    const id = ++rpcId;
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'no_such_tool', arguments: {} } })}\n`);
    const reply = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('未知工具未回错误')), 8000);
      mcpWaiters.push({ id, resolve: (msg) => { clearTimeout(timer); resolve(msg); } });
    });
    assert.ok(reply.error && reply.error.code === -32602);
  });
} catch (e) {
  results.push({ name: '(MCP 夹具异常)', pass: false, detail: e.message });
} finally {
  try { if (mcp) mcp.kill(); } catch (_) { /* ignore */ }
  try { if (svc) svc.kill(); } catch (_) { /* ignore */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  bridge.server.close();
}

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`);
console.log(`\nMCP 全链路: ${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
