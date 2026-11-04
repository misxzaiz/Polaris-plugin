import { createRequire } from 'node:module';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const require = createRequire(import.meta.url);
const { md5 } = require('../service/kvclient.js');

// 与 service.test.mjs 同款假桥
const kvStore = new Map();
const bridge = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') { res.end('{"ok":true}'); return; }
  if (req.method === 'POST' && req.url === '/api/router-dispatch') {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => {
      const { req: r } = JSON.parse(b);
      const p = r.payload || {};
      if (r.target === 'cap.kv') {
        if (p.action === 'get') return res.end(JSON.stringify({ ok: true, result: { value: kvStore.has(p.key) ? kvStore.get(p.key) : null } }));
        if (p.action === 'set') { kvStore.set(p.key, p.value); return res.end(JSON.stringify({ ok: true, result: {} })); }
        if (p.action === 'delete') { kvStore.delete(p.key); return res.end(JSON.stringify({ ok: true, result: {} })); }
        if (p.action === 'list') return res.end(JSON.stringify({ ok: true, result: { keys: [...kvStore.keys()] } }));
      }
      if (r.target === 'cap.mcp') return res.end(JSON.stringify({ ok: true, result: { content: [{ type: 'text', text: 'mcp-mock-text' }] } }));
      res.end(JSON.stringify({ ok: false, error: `mock 不支持 ${r.target}` }));
    });
    return;
  }
  res.writeHead(404); res.end();
});

const BRIDGE_PORT = 19840;
const SVC_PORT = 19882;
const TOKEN = 'mcp-test-token';
const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpipe-mcp-'));
let svc = null;
let mcp = null;
let rl = null;
const pending = new Map();
let rpcId = 0;

function rpc(method, params, timeoutMs = 40_000) {
  const id = ++rpcId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC 超时：${method}`)); }, timeoutMs);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

before(async () => {
  await new Promise((ok) => bridge.listen(BRIDGE_PORT, '127.0.0.1', ok));
  svc = spawn(process.execPath, [path.join('service', 'main.js'), String(SVC_PORT), appDir], {
    cwd: path.join(import.meta.dirname, '..'),
    env: { ...process.env, APPDATA: appDir, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(BRIDGE_PORT), POLARIS_TOKEN: TOKEN },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const t0 = Date.now();
  for (;;) {
    const ok = await fetch(`http://127.0.0.1:${SVC_PORT}/__health`).then((r) => r.ok).catch(() => false);
    if (ok) break;
    if (Date.now() - t0 > 10_000) throw new Error('服务未就绪');
    await new Promise((ok2) => setTimeout(ok2, 200));
  }
  const tm = Date.now();
  while (!kvStore.get('flowpipe.meta')) {
    if (Date.now() - tm > 10_000) throw new Error('flowpipe.meta 10s 未发布');
    await new Promise((ok2) => setTimeout(ok2, 150));
  }
  const meta = kvStore.get('flowpipe.meta');
  mcp = spawn(process.execPath, [path.join('mcp', 'server.js'), appDir], {
    cwd: path.join(import.meta.dirname, '..'),
    env: {
      ...process.env,
      FLOWPIPE_SERVICE_URL: `http://127.0.0.1:${SVC_PORT}`,
      FLOWPIPE_SERVICE_TOKEN: meta.token,
    },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  rl = readline.createInterface({ input: mcp.stdout });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { return; }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  });
  await new Promise((ok) => setTimeout(ok, 300));
});

after(() => {
  if (mcp) mcp.kill();
  if (svc) svc.kill();
  bridge.close();
});

test('mcp: initialize + tools/list 八工具', async () => {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05' });
  assert.equal(init.serverInfo.name, 'flow-pipeline');
  const list = await rpc('tools/list', {});
  const names = list.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ['flow_delete', 'flow_get', 'flow_list', 'flow_run', 'flow_save', 'flow_selftest', 'flow_status', 'flow_toggle']);
});

test('mcp: flow_save 创建（校验错误可读）', async () => {
  const err = await rpc('tools/call', { name: 'flow_save', arguments: { pipeline: { name: '坏线', steps: [{ type: 'http' }] } } }).then(() => null, (e) => e);
  assert.ok(err && /url/.test(err.message), `应报 url 缺失：${err && err.message}`);

  const ok = await rpc('tools/call', { name: 'flow_save', arguments: { pipeline: {
    name: 'AI建线',
    trigger: { type: 'interval', everyMinutes: 30 },
    steps: [
      { type: 'http', method: 'GET', url: 'https://httpbin.org/json', saveAs: 'resp' },
      { type: 'mcp', serverId: 'demo', tool: 'demo_tool', arguments: { x: 1 }, saveAs: 'mcpout' },
      { type: 'template', text: 'done {{resp.status}}', saveAs: 'out' },
    ],
  } } });
  assert.match(String(ok.content[0].text), /已创建流水线/);
});

test('mcp: flow_list / flow_toggle / flow_run / flow_status 全链路', async () => {
  const lst = await rpc('tools/call', { name: 'flow_list', arguments: {} });
  assert.match(String(lst.content[0].text), /AI建线/);

  const id = (String(lst.content[0].text).match(/id=(pl_[a-f0-9]+)/) || [])[1];
  assert.ok(id, 'flow_list 应给出 id');

  const off = await rpc('tools/call', { name: 'flow_toggle', arguments: { id, enabled: false } });
  assert.match(String(off.content[0].text), /停用/);
  const on = await rpc('tools/call', { name: 'flow_toggle', arguments: { id, enabled: true } });
  assert.match(String(on.content[0].text), /启用/);

  // httpbin.org 离线环境可能不通 → 该运行预期 error 步骤，但 flow_run 仍应返回结构化结果
  const run = await rpc('tools/call', { name: 'flow_run', arguments: { id, waitSec: 60 } }, 90_000);
  const text = String(run.content[0].text);
  assert.ok(/RUNNING|OK|ERROR|进行中/.test(text), text);
});

test('mcp: flow_status 反查', async () => {
  const lst = await rpc('tools/call', { name: 'flow_list', arguments: {} });
  const id = (String(lst.content[0].text).match(/id=(pl_[a-f0-9]+)/) || [])[1];
  const runResp = await rpc('tools/call', { name: 'flow_run', arguments: { id, waitSec: 60 } }, 90_000);
  const runId = (String(runResp.content[0].text).match(/runId=(run_[a-f0-9]+)/) || [])[1];
  if (!runId) return; // 已完结时直接返回了结果
  const st = await rpc('tools/call', { name: 'flow_status', arguments: { runId } });
  assert.match(String(st.content[0].text), /run_/);
});

test('mcp: flow_delete 双闸', async () => {
  const lst = await rpc('tools/call', { name: 'flow_list', arguments: {} });
  const m = /• (.+?)（id=(pl_[a-f0-9]+)）/.exec(String(lst.content[0].text));
  const name = m[1];
  const id = m[2];
  const bad = await rpc('tools/call', { name: 'flow_delete', arguments: { id, confirmName: '错名' } }).then(() => null, (e) => e);
  assert.ok(bad && /确认/.test(bad.message));
  const ok = await rpc('tools/call', { name: 'flow_delete', arguments: { id, confirmName: name } });
  assert.match(String(ok.content[0].text), /已删除/);
});

test('mcp: flow_selftest', async () => {
  const r = await rpc('tools/call', { name: 'flow_selftest', arguments: {} });
  const text = String(r.content[0].text);
  assert.match(text, /SSRF 围栏/);
  assert.match(text, /kv 桥：连通/);
});
