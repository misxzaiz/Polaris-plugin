/**
 * MCP stdio 协议测试：node test/mcp-tests.mjs
 * spawn 真服务（消费命令）+ 真 MCP server（stdio JSON-RPC，内存假桥共享）：
 *   1. initialize 握手（serverInfo=site-audit）
 *   2. tools/list 六工具齐全且 schema 完整
 *   3. tools/call site_audit_run → 报告文本（健康分/断链/重定向链/轮询指引）
 *   4. tools/call site_audit_status / history / issues（type 过滤）
 *   5. 未知工具 -32602；坏目标 isError
 * 退出码 0=全绿。
 */
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-audit-mcp-'));
let svc = null;
let mcp = null;
let svcPort = 0;
let mcpBuf = '';
const mcpWaiters = [];

function startProc(args, name) {
  const p = spawn(process.execPath, args, {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridge.port), POLARIS_TOKEN: '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  p.stderr.on('data', (c) => { /* 服务/MCP 日志走 stderr，测试不吞错误：留最后 2KB 便于诊断 */ p.__errTail = ((p.__errTail || '') + c).slice(-2000); });
  if (name === 'mcp') {
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (c) => {
      mcpBuf += c;
      let idx;
      while ((idx = mcpBuf.indexOf('\n')) >= 0) {
        const line = mcpBuf.slice(0, idx).trim();
        mcpBuf = mcpBuf.slice(idx + 1);
        if (!line) continue;
        let msg = null;
        try { msg = JSON.parse(line); } catch (_) { continue; }
        const w = mcpWaiters.shift();
        if (w) w(msg);
      }
    });
  }
  return p;
}

/** 发一条 JSON-RPC 并等对应 id 的响应 */
function rpc(method, params, timeoutMs = 150000) {
  const id = ++rpc.id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`RPC 超时：${method}；stderr：${(mcp && mcp.__errTail) || ''}`)), timeoutMs);
    mcpWaiters.push((msg) => {
      clearTimeout(timer);
      if (msg.id === id) resolve(msg);
      else reject(new Error(`响应 id 不匹配：期望 ${id} 收到 ${msg.id}`));
    });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
rpc.id = 0;

function rpcText(msg) {
  assert.ok(msg.result, `无 result：${JSON.stringify(msg).slice(0, 300)}`);
  assert.equal(msg.result.isError, false, `isError：${JSON.stringify(msg.result).slice(0, 300)}`);
  return msg.result.content.map((c) => c.text).join('\n');
}

try {
  // 服务先起（命令消费者 + 试金石站宿主）
  svc = startProc([path.join(PLUGIN_ROOT, 'service', 'main.js'), '0', tmpDir], 'svc');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const meta = bridge.store.get('site-audit.meta');
    if (meta && meta.port && meta.token) { svcPort = meta.port; break; }
    await sleep(200);
  }
  assert.ok(svcPort, `服务未落 meta：${(svc.__errTail || '').slice(-400)}`);

  await t('MCP server 启动 + initialize 握手', async () => {
    mcp = startProc([path.join(PLUGIN_ROOT, 'mcp', 'server.js'), tmpDir], 'mcp');
    const res = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } }, 20000);
    assert.equal(res.result.protocolVersion, '2024-11-05');
    assert.equal(res.result.serverInfo.name, 'site-audit');
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  });

  let tools = [];
  await t('tools/list：六工具齐全且 schema 完整', async () => {
    const res = await rpc('tools/list', {});
    tools = res.result.tools;
    assert.deepEqual(tools.map((x) => x.name).sort(), [
      'site_audit_history', 'site_audit_issues', 'site_audit_report', 'site_audit_run', 'site_audit_status', 'site_audit_stop',
    ]);
    for (const tl of tools) {
      assert.ok(tl.description && tl.description.length > 20, `${tl.name} 描述缺失`);
      assert.equal(tl.inputSchema.type, 'object');
    }
    const run = tools.find((x) => x.name === 'site_audit_run');
    assert.ok(run.inputSchema.properties.url);
    assert.ok(run.inputSchema.required.includes('url'));
  });

  let reportText = '';
  await t('tools/call site_audit_run：等待真实体检完成并返回报告文本', async () => {
    const res = await rpc('tools/call', {
      name: 'site_audit_run',
      arguments: { url: `http://127.0.0.1:${svcPort}/demo/`, maxPages: 50, delayMs: 0, waitMs: 120000 },
    });
    reportText = rpcText(res);
    assert.ok(reportText.includes('体检完成'), reportText.slice(0, 300));
    assert.ok(reportText.includes('健康分'));
    assert.ok(reportText.includes('站内页面打不开'), '报告应含断链区块');
    assert.ok(reportText.includes('demo.invalid'), '报告应含外链失效');
    assert.ok(reportText.includes('site_audit_issues'), '报告应指引 issues 工具');
  });

  await t('tools/call site_audit_status：空闲 + 最近报告摘要', async () => {
    const res = await rpc('tools/call', { name: 'site_audit_status', arguments: {} });
    const text = rpcText(res);
    assert.ok(text.includes('当前空闲'), text.slice(0, 200));
    assert.ok(text.includes('健康分'));
  });

  await t('tools/call site_audit_issues：type 过滤命中 404 明细', async () => {
    const res = await rpc('tools/call', { name: 'site_audit_issues', arguments: { type: 'broken_page', limit: 10 } });
    const text = rpcText(res);
    assert.ok(text.includes('missing-404'), text.slice(0, 400));
    assert.ok(text.includes('错误'));
  });

  await t('tools/call site_audit_issues：severity=error 只含错误级', async () => {
    const res = await rpc('tools/call', { name: 'site_audit_issues', arguments: { severity: 'error', limit: 50 } });
    const text = rpcText(res);
    assert.ok(!text.includes('[警告]'), '不应混入警告级');
    assert.ok(text.includes('[错误]'));
  });

  await t('tools/call site_audit_history：含本次体检', async () => {
    const res = await rpc('tools/call', { name: 'site_audit_history', arguments: { limit: 5 } });
    const text = rpcText(res);
    assert.ok(text.includes('/demo/'), text.slice(0, 300));
    assert.ok(text.includes('auditId='));
  });

  await t('tools/call site_audit_report：缺省=最近一次', async () => {
    const res = await rpc('tools/call', { name: 'site_audit_report', arguments: {} });
    const text = rpcText(res);
    assert.ok(text.includes('站点体检报告'));
    assert.ok(text.includes('auditId='));
  });

  await t('坏目标：isError=true 且给出原因', async () => {
    const res = await rpc('tools/call', { name: 'site_audit_run', arguments: { url: 'http://169.254.169.254/' } });
    assert.equal(res.result.isError, true);
    const text = res.result.content.map((c) => c.text).join('\n');
    assert.ok(text.includes('元数据'), text.slice(0, 200));
  });

  await t('未知工具：-32602', async () => {
    const res = await rpc('tools/call', { name: 'no_such_tool', arguments: {} });
    assert.equal(res.error.code, -32602);
  });
} finally {
  if (svc) { try { svc.kill(); } catch (_) { /* 忽略 */ } }
  if (mcp) { try { mcp.kill(); } catch (_) { /* 忽略 */ } }
  bridge.server.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
}

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '  ✔' : '  ✖'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`);
console.log(`\nMCP 协议：${results.length - failed.length}/${results.length} 通过`);
if (failed.length) process.exit(1);
