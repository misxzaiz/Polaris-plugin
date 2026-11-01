/**
 * MCP stdio 协议测试（假桥 + service 子进程 + MCP 子进程）：node test/mcp-tests.mjs
 * 覆盖：initialize/tools-list 握手、api_bench_run 全链路（跑真实压测）、
 *       api_bench_history / report / compare / status、非法工具名报错。
 * 退出码 0=全绿。
 */
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';

const PLUGIN_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 假桥（与 service-tests 同款）────────────────────────────────────────────
function startFakeBridge() {
  const store = new Map();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const payload = (JSON.parse(body || '{}').req || {}).payload || {};
        const act = payload.action;
        let result = null;
        if (act === 'get') result = { ok: true, result: { value: store.has(payload.key) ? store.get(payload.key) : null } };
        else if (act === 'set') { store.set(payload.key, payload.value === undefined ? null : payload.value); result = { ok: true, result: { ok: true } }; }
        else if (act === 'delete') { store.delete(payload.key); result = { ok: true, result: { ok: true } }; }
        else result = { ok: true, result: { keys: [...store.keys()] } };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })); }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, store })));
}

// ── 压测目标 ────────────────────────────────────────────────────────────────
function startTargetServer() {
  const server = http.createServer((req, res) => {
    setTimeout(() => { res.writeHead(200); res.end('{"ok":true}'); }, 30);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

// ── MCP 子进程骨架 ──────────────────────────────────────────────────────────
function startMcp(bridgePort) {
  const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), ''], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgePort), POLARIS_TOKEN: 't' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  const pending = new Map();
  let idCounter = 0;
  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch (_) { return; }
    if (msg && msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const call = (method, params) => new Promise((resolve) => {
    const id = ++idCounter;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  return { child, call, stderrText: () => stderr };
}

const bridge = await startFakeBridge();
const target = await startTargetServer();
const mcp = startMcp(bridge.port);

// ── service 子进程（信箱消费者；没有它 MCP 命令会在 90s 等待中超时）──────────
const svcPort = 47500 + Math.floor(Math.random() * 500);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-bench-mcp-'));
const svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'main.js'), String(svcPort), tmpDir], {
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridge.port), POLARIS_TOKEN: 't' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
svc.stderr.resume();
async function waitSvcHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${svcPort}/__health`);
      if (r.ok) return;
    } catch (_) { /* 未就绪 */ }
    await sleep(300);
  }
  throw new Error('service 15s 未就绪');
}
await waitSvcHealth();

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

try {
  await t('initialize 握手', async () => {
    const r = await mcp.call('initialize', {});
    assert.strictEqual(r.result.serverInfo.name, 'api-bench');
    assert.ok(r.result.protocolVersion);
  });
  await t('tools/list 返回 6 个工具', async () => {
    const r = await mcp.call('tools/list', {});
    const names = r.result.tools.map((x) => x.name);
    assert.deepStrictEqual(names, ['api_bench_run', 'api_bench_status', 'api_bench_stop', 'api_bench_history', 'api_bench_report', 'api_bench_compare']);
  });
  await t('未知工具返回 -32602', async () => {
    const r = await mcp.call('tools/call', { name: 'nope', arguments: {} });
    assert.strictEqual(r.error.code, -32602);
  });

  await t('api_bench_run：真实压测返回吞吐/分位/结论', async () => {
    const r = await mcp.call('tools/call', { name: 'api_bench_run', arguments: { url: `http://127.0.0.1:${target.port}/x`, connections: 3, durationS: 2, headers: { authorization: 'Bearer abcd9999' } } });
    const text = r.result.content[0].text;
    assert.strictEqual(r.result.isError, false, text);
    assert.ok(text.includes('压测完成'), text);
    assert.ok(/平均 \d+(\.\d+)?\/s/.test(text), text);
    assert.ok(text.includes('p97.5'), text);
    assert.ok(!text.includes('abcd9999'), 'headers 不落明文');
    // 历史应已落库
    const h = bridge.store.get('api-bench.history');
    assert.ok(Array.isArray(h) && h.length >= 1);
  });

  await t('api_bench_status：空闲时返回最近报告', async () => {
    const r = await mcp.call('tools/call', { name: 'api_bench_status', arguments: {} });
    const text = r.result.content[0].text;
    assert.ok(text.includes('空闲') && text.includes('runId='), text);
  });

  await t('api_bench_history：列出记录', async () => {
    const r = await mcp.call('tools/call', { name: 'api_bench_history', arguments: {} });
    const text = r.result.content[0].text;
    assert.ok(text.includes('runId='), text);
  });

  let runB = null;
  await t('api_bench_run：第二次压测（供对比）', async () => {
    const r = await mcp.call('tools/call', { name: 'api_bench_run', arguments: { url: `http://127.0.0.1:${target.port}/x`, connections: 6, durationS: 2 } });
    const text = r.result.content[0].text;
    runB = /runId=([\w-]+)/.exec(text);
    assert.ok(runB, text);
  });

  await t('api_bench_report：读取指定报告', async () => {
    const r = await mcp.call('tools/call', { name: 'api_bench_report', arguments: { runId: runB[1] } });
    const text = r.result.content[0].text;
    assert.ok(text.includes('压测报告'), text);
  });

  await t('api_bench_compare：两次对比输出 Δ 与胜负', async () => {
    const h = bridge.store.get('api-bench.history');
    const a = h[h.length - 1].runId; // 最早一次
    const r = await mcp.call('tools/call', { name: 'api_bench_compare', arguments: { a, b: runB[1] } });
    const text = r.result.content[0].text;
    assert.ok(text.includes('A/B 对比'), text);
    assert.ok(text.includes('结论'), text);
  });

  await t('api_bench_compare：缺参数时给历史提示', async () => {
    const r = await mcp.call('tools/call', { name: 'api_bench_compare', arguments: {} });
    const text = r.result.content[0].text;
    assert.ok(text.includes('runId'), text);
  });
} catch (e) {
  results.push({ name: '（测试编排）', pass: false, detail: e.message });
}

mcp.child.kill('SIGKILL');
svc.kill('SIGKILL');
bridge.server.close();
target.server.close();
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* Windows 句柄延迟 */ }

let pass = 0;
for (const r of results) {
  if (r.pass) pass++;
  console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`);
}
console.log(`\n${pass}/${results.length} 通过`);
if (pass !== results.length) console.log('---- mcp stderr ----\n' + mcp.stderrText().split('\n').slice(-20).join('\n'));
process.exit(pass === results.length ? 0 : 1);
