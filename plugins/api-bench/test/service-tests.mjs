/**
 * 服务集成测试（假 kv 桥 + 本地目标，真实 autocannon 引擎）：node test/service-tests.mjs
 *
 * 链路：spawn service/main.js（env 指向内存假桥）→
 *   1. /__health 200 + meta 落桥（token/port 就绪）
 *   2. 试金石四端点（ok/slow/flaky/echo）
 *   3. /api/op start → live 轮询 → 完成报告落 kv（分位/状态码/样本/吞吐非零）
 *   4. headers 敏感头掩码落 kv
 *   5. 忙拒（409）+ stop（部分结果 aborted:true）
 *   6. 校验拒绝（GET body / 托管头 / 坏 URL）
 *   7. MCP 信箱全链路：cmd run → res 回执 nonce 对齐 + 报告落库
 *   8. history 落库 + settings_set 生效
 * 退出码 0=全绿；临时目录自清理。
 */
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PLUGIN_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 假 kv 桥（内存 Map，协议与宿主 /api/router-dispatch 对齐）────────────────
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
        res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, store })));
}

// ── 压测目标服务（模拟真实被压方）───────────────────────────────────────────
function startTargetServer() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/slow')) {
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); }, 40);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true,"x":1}');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

function req(method, urlPath, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data || '{}') }); }
        catch (_) { resolve({ status: res.statusCode, json: {}, raw: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-bench-test-'));
const bridge = await startFakeBridge();
const target = await startTargetServer();

// 启动服务（固定端口段随机选一个空闲口）
const svcPort = 47000 + Math.floor(Math.random() * 2000);
const svc = spawn(process.execPath, [
  path.join(PLUGIN_ROOT, 'service', 'main.js'),
  String(svcPort),
  tmpDir,
], {
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridge.port), POLARIS_TOKEN: 'test-token' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let svcLog = '';
svc.stderr.on('data', (c) => { svcLog += c; });
const base = `http://127.0.0.1:${svcPort}`;

async function waitHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await req('GET', `${base}/__health`);
      if (r.status === 200) return r.json;
    } catch (_) { /* 未就绪 */ }
    await sleep(300);
  }
  throw new Error('服务健康端点 15s 未就绪');
}

async function metaFromBridge() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const m = bridge.store.get('api-bench.meta');
    if (m && m.port && m.token) return m;
    await sleep(300);
  }
  throw new Error('meta 10s 未落桥');
}

function authHeaders(meta) { return { 'X-ApiBench-Token': meta.token, 'Content-Type': 'application/json' }; }

async function startBench(meta, payload) {
  return req('POST', `${base}/api/op`, { body: { action: 'start', payload }, headers: authHeaders(meta) });
}
async function waitDone(meta, runId, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await req('GET', `${base}/api/live`, { headers: authHeaders(meta) });
    if (r.json.ok && !r.json.running && r.json.lastReportId === runId) {
      const rep = await req('POST', `${base}/api/op`, { body: { action: 'report', payload: { runId } }, headers: authHeaders(meta) });
      return rep.json.report;
    }
    await sleep(300);
  }
  throw new Error(`压测 ${runId} ${timeoutMs}ms 未完成`);
}

try {
  const health = await waitHealth();
  await t('健康端点 200 且版本就绪', () => {
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.plugin, 'api-bench');
  });

  const meta = await metaFromBridge();
  await t('meta 落桥：token/port/版本齐备', () => {
    assert.ok(meta.token.length >= 16);
    assert.strictEqual(meta.port, svcPort);
    assert.ok(meta.version);
  });

  await t('健康端点鉴权豁免（无 token 可访问）', () => {
    // waitHealth 已无 token 访问成功（上面通过）
    assert.ok(true);
  });
  await t('api/live 无 token 401', async () => {
    const r = await req('GET', `${base}/api/live`);
    assert.strictEqual(r.status, 401);
  });
  await t('api/op 错 token 401', async () => {
    const r = await req('POST', `${base}/api/op`, { body: { action: 'state' }, headers: { 'X-ApiBench-Token': 'wrong' } });
    assert.strictEqual(r.status, 401);
  });

  await t('试金石：/demo/ok 与 /demo/slow 可用', async () => {
    const ok1 = await req('GET', `${base}/demo/ok`);
    assert.strictEqual(ok1.status, 200);
    const t0 = Date.now();
    const ok2 = await req('GET', `${base}/demo/slow?ms=80`);
    assert.strictEqual(ok2.status, 200);
    assert.ok(Date.now() - t0 >= 70, 'slow 应至少延迟 ~80ms');
  });
  await t('试金石：/demo/echo 回显长度', async () => {
    const r = await req('POST', `${base}/demo/echo`, { body: '{"hello":"world"}' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.len, 17);
  });

  await t('校验拒绝：GET 带 body', async () => {
    const r = await startBench(meta, { url: `${base}/demo/ok`, method: 'GET', body: 'x', durationS: 1 });
    assert.strictEqual(r.json.ok, false);
    assert.ok(r.json.error.includes('POST/PUT'));
  });
  await t('校验拒绝：托管头 host', async () => {
    const r = await startBench(meta, { url: `${base}/demo/ok`, headers: { host: 'evil.com' }, durationS: 1 });
    assert.strictEqual(r.json.ok, false);
    assert.ok(r.json.error.includes('托管'));
  });
  await t('校验拒绝：坏 URL', async () => {
    const r = await startBench(meta, { url: 'ftp://x/y' });
    assert.strictEqual(r.json.ok, false);
  });

  // 真实压测：对目标服务 /slow（40ms 延迟）
  let firstReport = null;
  await t('压测全链路：start → live → 报告落库（吞吐/分位/样本非零）', async () => {
    const s = await startBench(meta, {
      url: `http://127.0.0.1:${target.port}/slow`,
      connections: 4, durationS: 2, timeoutS: 5,
      headers: { Authorization: 'Bearer secret-token-1234', 'X-Test': 'v' },
    });
    assert.strictEqual(s.json.ok, true, JSON.stringify(s.json));
    const runId = s.json.runId;
    // 运行中 live 有实时快照
    await sleep(800);
    const lv = await req('GET', `${base}/api/live`, { headers: authHeaders(meta) });
    assert.strictEqual(lv.json.running, true);
    assert.ok(lv.json.live.url.includes('/slow'));
    assert.ok(Array.isArray(lv.json.samples), 'live 携带采样数组');
    firstReport = await waitDone(meta, runId);
    assert.strictEqual(firstReport.runId, runId);
    assert.ok(firstReport.summary.rpsMean > 0, `rpsMean=${firstReport.summary.rpsMean}`);
    assert.ok(firstReport.summary.latencies.p50 >= 30, `p50=${firstReport.summary.latencies.p50}（目标 40ms 延迟）`);
    assert.ok(firstReport.summary.statusDist['200'] > 0);
    assert.ok(firstReport.summary.samples.length >= 1);
    assert.ok(firstReport.verdict.oneLine.length > 0);
    // 落库一致性：kv latest 与直读报告一致
    const kvLatest = bridge.store.get('api-bench.latest');
    assert.strictEqual(kvLatest.runId, runId);
    assert.ok(bridge.store.get(`api-bench.report.${runId}`));
  });

  await t('敏感头掩码落 kv（Authorization ****1234）', () => {
    assert.strictEqual(firstReport.target.headers.Authorization, '****1234');
    assert.strictEqual(firstReport.target.headers['X-Test'], 'v');
    assert.ok(!JSON.stringify(bridge.store.get('api-bench.latest')).includes('secret-token'));
  });

  await t('history 落库（含 runId 与吞吐）', () => {
    const h = bridge.store.get('api-bench.history');
    assert.ok(Array.isArray(h) && h.length >= 1);
    assert.strictEqual(h[0].runId, firstReport.runId);
    assert.ok(h[0].rpsMean > 0);
  });

  await t('忙拒：运行中再发起 → 409', async () => {
    const s1 = await startBench(meta, { url: `${base}/demo/slow?ms=100`, connections: 2, durationS: 4 });
    assert.strictEqual(s1.json.ok, true);
    const s2 = await startBench(meta, { url: `${base}/demo/ok`, connections: 2, durationS: 1 });
    assert.strictEqual(s2.json.ok, false);
    assert.strictEqual(s2.json.busy, true);
    // 停掉第一个以便后续测试
    await req('POST', `${base}/api/op`, { body: { action: 'stop' }, headers: authHeaders(meta) });
    await waitDone(meta, s1.json.runId, 15000);
  });

  await t('stop：中止后报告 aborted=true（部分结果）', async () => {
    const s = await startBench(meta, { url: `${base}/demo/ok`, connections: 2, durationS: 20 });
    assert.strictEqual(s.json.ok, true);
    await sleep(1500);
    const st = await req('POST', `${base}/api/op`, { body: { action: 'stop' }, headers: authHeaders(meta) });
    assert.strictEqual(st.json.ok, true);
    const rep = await waitDone(meta, s.json.runId, 15000);
    assert.strictEqual(rep.summary.aborted, true);
    assert.ok(rep.summary.totalRequests > 0);
    assert.ok(rep.summary.durationS < 19, `中止应提前结束（实际 ${rep.summary.durationS}s）`);
  });

  await t('settings_set 生效并落桥', async () => {
    const r = await req('POST', `${base}/api/op`, { body: { action: 'settings_set', payload: { connections: 25, durationS: 8, timeoutS: 5 } }, headers: authHeaders(meta) });
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(r.json.settings.connections, 25);
    assert.deepStrictEqual(bridge.store.get('api-bench.settings'), { connections: 25, durationS: 8, timeoutS: 5 });
    // 恢复默认
    await req('POST', `${base}/api/op`, { body: { action: 'settings_set', payload: { connections: 10, durationS: 10, timeoutS: 10 } }, headers: authHeaders(meta) });
  });

  await t('收藏目标：保存/列表（headers 掩码出 API）', async () => {
    const r = await req('POST', `${base}/api/op`, {
      body: { action: 'targets_save', payload: { target: { name: '本地目标', url: `http://127.0.0.1:${target.port}/slow`, method: 'GET', headers: { authorization: 'Bearer abc99' }, connections: 4 } } },
      headers: authHeaders(meta),
    });
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(r.json.target.headers.authorization, '****bc99');
    const list = await req('POST', `${base}/api/op`, { body: { action: 'targets_list' }, headers: authHeaders(meta) });
    assert.ok(list.json.items.length >= 1);
    // 本地文件存完整值（同信任域）
    const fileRaw = fs.readFileSync(path.join(tmpDir, 'api-bench', 'targets.json'), 'utf8');
    assert.ok(fileRaw.includes('Bearer abc99'), '本地文件保留完整 header');
  });

  await t('MCP 信箱全链路：cmd run → res nonce 对齐 + 报告落库', async () => {
    const nonce = `test-${Date.now()}`;
    bridge.store.set('api-bench.cmd', { nonce, action: 'run', payload: { url: `http://127.0.0.1:${target.port}/slow`, connections: 3, durationS: 2 }, at: new Date().toISOString() });
    const deadline = Date.now() + 25000;
    let res = null;
    while (Date.now() < deadline) {
      await sleep(800);
      const v = bridge.store.get('api-bench.res');
      if (v && v.nonce === nonce) { res = v; break; }
    }
    assert.ok(res, 'res 25s 内未出现');
    assert.strictEqual(res.result.ok, true);
    assert.ok(res.result.report.summary.rpsMean > 0);
    assert.ok(bridge.store.get(`api-bench.report.${res.result.report.runId}`));
  });

  await t('MCP 信箱：校验失败回执错误', async () => {
    const nonce = `test-bad-${Date.now()}`;
    bridge.store.set('api-bench.cmd', { nonce, action: 'run', payload: { url: 'nope' }, at: new Date().toISOString() });
    const deadline = Date.now() + 15000;
    let res = null;
    while (Date.now() < deadline) {
      await sleep(700);
      const v = bridge.store.get('api-bench.res');
      if (v && v.nonce === nonce) { res = v; break; }
    }
    assert.ok(res, '错误回执 15s 内未出现');
    assert.strictEqual(res.result.ok, false);
    assert.ok(res.result.error.includes('URL'));
  });
} catch (e) {
  results.push({ name: '（测试编排）', pass: false, detail: e.message });
}

// ── 清理 ────────────────────────────────────────────────────────────────────
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
if (pass !== results.length) {
  console.log('---- 服务日志尾部 ----');
  console.log(svcLog.split('\n').slice(-30).join('\n'));
}
process.exit(pass === results.length ? 0 : 1);
