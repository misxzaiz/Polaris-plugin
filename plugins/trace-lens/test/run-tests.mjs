#!/usr/bin/env node
'use strict';
/**
 * run-tests.mjs —— 链路追踪台冒烟（零依赖，node --test 风格手写断言）
 *
 * 三段：
 *   A. core 单测：OTLP 归一化双方言 / BigInt 纳秒精度 / 组树孤儿挂根 / 瀑布布局 /
 *      搜索（中文）/ JSONL 与 kv 分块防御
 *   B. 服务端到端：假桥（内存 cap.kv HTTP 服务）+ 真 spawn service/main.js，
 *      POST /v1/traces 灌真实形状 OTLP JSON（跨 3 服务、中文属性、error span）→
 *      断言 JSONL 落盘、kv 投影（meta/idx/rec/trace 全文）、415 拒 protobuf、
 *      drop_trace / clear_all confirm 双闸
 *   C. MCP 全链路：真 spawn mcp/server.js（同一假桥），协议 + 五工具断言
 *
 * 平台纪律：HTTP 中文链路全用 Node fetch（勿 Git Bash curl）；MCP tools/call
 * 参数是 { name, arguments } 平铺，不包 params。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
// Windows 陷阱：ESM 动态 import 的盘符绝对路径必须转 file:// URL（'d:' 会被当协议）
const core = await import(pathToFileURL(path.join(PLUGIN, 'shared', 'core.js')).href);
const { createKvClient } = await import(pathToFileURL(path.join(PLUGIN, 'service', 'kvclient.js')).href);

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail += 1;
    failures.push(`${name}: ${e.message}`);
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}
async function aok(name, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail += 1;
    failures.push(`${name}: ${e.message}`);
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

// ── 假桥：内存 cap.kv（exec-sandbox 假桥法）────────────────────────────────
function startFakeBridge() {
  const store = new Map();
  const svr = http.createServer((req, res) => {
    const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/api/health') { reply(200, { ok: true }); return; }
    if (req.url === '/api/router-dispatch' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const { req: r } = JSON.parse(body);
          if (r.target !== 'cap.kv') { reply(200, { ok: false, error: `未知 target ${r.target}` }); return; }
          const p = r.payload || {};
          if (p.action === 'get') {
            const v = store.get(p.key);
            reply(200, { ok: true, result: v === undefined ? null : { key: p.key, value: v } });
          } else if (p.action === 'set') {
            store.set(p.key, p.value === undefined ? null : p.value);
            reply(200, { ok: true, result: { key: p.key } });
          } else if (p.action === 'delete') {
            store.delete(p.key);
            reply(200, { ok: true, result: {} });
          } else if (p.action === 'list') {
            reply(200, { ok: true, result: { keys: [...store.keys()] } });
          } else {
            reply(200, { ok: false, error: `未知 action ${p.action}` });
          }
        } catch (e) {
          reply(200, { ok: false, error: e.message });
        }
      });
      return;
    }
    reply(404, { ok: false, error: 'not found' });
  });
  return new Promise((resolve) => {
    svr.listen(0, '127.0.0.1', () => resolve({ svr, port: svr.address().port, store }));
  });
}

// ── OTLP fixture（OTel JS exporter http/json 真实形状）─────────────────────
const NANO_T0 = 1700000000123456789n;
function nano(offsetMs) { return String(NANO_T0 + BigInt(offsetMs) * 1000000n); }
const TRACE_A = '4bf92f3577b34da6a3ce929d0e0e4736'; // 经典示例 traceId（hex 32）
const TRACE_B = 'aabbccdd11223344'.repeat(2);

function spanOtlp(over) {
  return Object.assign({
    traceId: TRACE_A,
    spanId: '1122334455667788',
    parentSpanId: '',
    name: 'GET /api/pay',
    kind: 2, // SERVER
    startTimeUnixNano: nano(0),
    endTimeUnixNano: nano(850),
    attributes: [
      { key: 'http.method', value: { stringValue: 'POST' } },
      { key: 'http.status_code', value: { intValue: '200' } },
      { key: '订单号', value: { stringValue: '中文属性值' } },
      { key: 'flag', value: { boolValue: true } },
      { key: 'ratio', value: { doubleValue: 0.25 } },
      { key: 'tags', value: { arrayValue: { values: [{ stringValue: 'a' }, { intValue: '3' }] } } },
    ],
    status: { code: 1 },
    events: [
      { timeUnixNano: nano(10), name: '校验签名', attributes: [{ key: 'ok', value: { boolValue: true } }] },
    ],
  }, over);
}
function otlpRequest(spansPerService) {
  return {
    resourceSpans: spansPerService.map(({ service, spans }) => ({
      resource: { attributes: [{ key: 'service.name', value: { stringValue: service } }] },
      scopeSpans: [{ scope: { name: 'manual' }, spans }],
    })),
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function waitUntil(fn, timeoutMs, stepMs = 400) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`waitUntil 超时（${timeoutMs}ms）`);
    await sleep(stepMs);
  }
}
function post(port, urlPath, body, headers = {}) {
  return fetch(`http://127.0.0.1:${port}${urlPath}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// ═══ A. core 单测 ═══
function testCore() {
  console.log('A. core 单测');
  ok('nanoToMs BigInt 精确（不丢微秒）', () => {
    assert.equal(core.nanoToMs('1700000000123456789'), 1700000000123);
    assert.equal(core.nanoToMs(1700000000123456789n), 1700000000123);
    assert.equal(core.nanoToMs(''), null);
    assert.equal(core.nanoToMs('abc'), null);
  });
  ok('AnyValue 全型归一化', () => {
    const attrs = core.normalizeAttributes([
      { key: 's', value: { stringValue: '文本' } },
      { key: 'i', value: { intValue: '42' } },
      { key: 'd', value: { doubleValue: 1.5 } },
      { key: 'b', value: { boolValue: false } },
      { key: 'a', value: { arrayValue: { values: [{ stringValue: 'x' }] } } },
      { key: 'k', value: { kvlistValue: { values: [{ key: 'n', value: { stringValue: 'v' } }] } } },
      { key: 'bad' },
    ]);
    assert.deepEqual(attrs, { s: '文本', i: '42', d: '1.5', b: 'false', a: '[x]', k: '{n=v}', bad: '' });
  });
  ok('kind/status 双方言（数字与 OTLP 名）', () => {
    assert.equal(core.kindOf(2), 'server');
    assert.equal(core.kindOf('SPAN_KIND_CLIENT'), 'client');
    assert.equal(core.kindOf('weird'), 'unspecified');
    assert.deepEqual(core.statusOf({ code: 2, message: 'boom' }), { code: 'error', message: 'boom' });
    assert.equal(core.statusOf({ code: 'STATUS_CODE_OK' }).code, 'ok');
    assert.equal(core.statusOf(0).code, 'unset');
    assert.equal(core.statusOf(undefined).code, 'unset');
  });
  ok('OTLP 请求归一化：resource 并入 res.*、坏 span 丢弃计数', () => {
    const r = core.normalizeOtlpRequest(otlpRequest([
      { service: 'web', spans: [spanOtlp({}), spanOtlp({ spanId: 'deadbeef', startTimeUnixNano: 'x', endTimeUnixNano: 'y' })] },
    ]));
    assert.equal(r.error, '');
    assert.equal(r.spans.length, 1);
    assert.equal(r.dropped, 1);
    assert.equal(r.spans[0].service, 'web');
    assert.equal(r.spans[0].attrs['res.service.name'], 'web');
    assert.equal(r.spans[0].attrs['订单号'], '中文属性值');
    assert.equal(r.spans[0].status.code, 'ok');
  });
  ok('缺 traceId/时间/倒挂时间的 span 全部丢弃', () => {
    const r = core.normalizeOtlpRequest({ resourceSpans: [{ scopeSpans: [{ spans: [
      spanOtlp({ traceId: '' }),
      spanOtlp({ spanId: '' }),
      spanOtlp({ startTimeUnixNano: nano(100), endTimeUnixNano: nano(0) }),
    ] }] }] });
    assert.equal(r.spans.length, 0);
    assert.equal(r.dropped, 3);
  });
  ok('组树：DFS 序父先于子 + 孤儿当根（深度 0）不丢', () => {
    const mk = (spanId, parent, startMs) => ({ traceId: 't', spanId, parentSpanId: parent, startMs, endMs: startMs + 10, spanName: '' , name: `s-${spanId}`, service: 'x', durationMs: 10, kind: 'internal', status: { code: 'unset', message: '' }, attrs: {}, events: [] });
    const { ordered, depthBySpanId, orphanCount } = core.buildTrace([
      mk('c', 'missing-parent', 30),
      mk('b', 'a', 20),
      mk('a', '', 10),
    ]);
    assert.deepEqual(ordered.map((s) => s.spanId), ['a', 'b', 'c']);
    assert.deepEqual([depthBySpanId.a, depthBySpanId.b, depthBySpanId.c], [0, 1, 0]);
    assert.equal(orphanCount, 1);
  });
  ok('瀑布布局百分比（offset/width 有界）', () => {
    const spans = [spanOtlp({}), spanOtlp({ spanId: 'ff', parentSpanId: '1122334455667788', name: 'POST stripe', kind: 3, startTimeUnixNano: nano(5), endTimeUnixNano: nano(125) })].map((raw, i) => core.normalizeOtlpRequest({ resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: i === 0 ? 'web' : 'web' } }] }, scopeSpans: [{ spans: [raw] }] }] })).flatMap((r) => r.spans);
    const { ordered, depthBySpanId } = core.buildTrace(spans);
    const rows = core.waterfallLayout(ordered, depthBySpanId);
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.ok(r.offsetPct >= 0 && r.offsetPct <= 100);
      assert.ok(r.widthPct > 0 && r.widthPct <= 100);
    }
    assert.ok(Math.abs(rows[0].offsetPct) < 0.01); // root 从 0 开始
    assert.ok(rows[1].widthPct < rows[0].widthPct); // 子 span 短于全链
  });
  ok('matchTrace 中文关键词 + hasError/slowerThanMs', () => {
    const spans = core.normalizeOtlpRequest(otlpRequest([{ service: 'web', spans: [spanOtlp({ status: { code: 2, message: '支付失败' } })] }])).spans;
    assert.equal(core.matchTrace(spans, { q: '中文属性值' }), true);
    assert.equal(core.matchTrace(spans, { q: '支付失败' }), true);
    assert.equal(core.matchTrace(spans, { q: '不存在的词' }), false);
    assert.equal(core.matchTrace(spans, { hasError: true }), true);
    assert.equal(core.matchTrace(spans, { slowerThanMs: 10000 }), false);
  });
  ok('traceDetailText 瀑布文本：树缩进/错误块/中文', () => {
    const spans = core.normalizeOtlpRequest(otlpRequest([{ service: 'web', spans: [spanOtlp({ status: { code: 2, message: '网关超时' } })] }])).spans;
    const text = core.traceDetailText(TRACE_A, spans);
    assert.ok(text.includes('GET /api/pay'));
    assert.ok(text.includes('⨯ 网关超时'));
    assert.ok(text.includes('http.method=POST'));
    assert.ok(text.includes('事件 校验签名'));
  });
  ok('parseJsonlLine / planChunkWrites / readRing 防御', () => {
    assert.equal(core.parseJsonlLine(''), null);
    assert.equal(core.parseJsonlLine('{broken'), null);
    assert.equal(core.parseJsonlLine('{"a":1}').a, 1);
    const ring = Array.from({ length: 45 }, (_, i) => ({ traceId: `t${i}` }));
    const plan = core.planChunkWrites(ring, 4);
    assert.equal(plan.filter((p) => p.value === null).length, 1); // 第 4 块删除
    assert.equal(plan.filter((p) => p.value !== null).length, 3);
    assert.equal(core.readRing({ 'tl.rec.0': [{ traceId: 'new' }], 'tl.rec.1': [{ traceId: 'old' }] })[0].traceId, 'new');
  });
  ok('formatDuration 各量级', () => {
    assert.equal(core.formatDuration(0.4), '400μs');
    assert.equal(core.formatDuration(120), '120ms');
    assert.equal(core.formatDuration(1500), '1.50s');
    assert.equal(core.formatDuration(65000), '1m05s');
  });
}

// ═══ B. 服务端到端 + C. MCP（共用假桥）═══
async function testServiceAndMcp() {
  console.log('B. 服务端到端（假桥 + 真 spawn）');
  const bridge = await startFakeBridge();
  // 关键：测试进程自己的 kvclient 也要命中假桥——env 设在本进程（子进程继承同值），
  // 否则 kvclient 端点自发现会扫到真实 Polaris 宿主端口，断言全被真宿主数据污染
  process.env.POLARIS_HOST = '127.0.0.1';
  process.env.POLARIS_PORT = String(bridge.port);
  process.env.POLARIS_TOKEN = 'smoke-token';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-lens-smoke-'));
  const storeDir = path.join(tmp, 'store');
  const PORT = 19871 + Math.floor(Math.random() * 300);
  const env = {
    ...process.env,
    TRACE_LENS_STORE_DIR: storeDir,
    POLARIS_HOST: '127.0.0.1',
    POLARIS_PORT: String(bridge.port),
    POLARIS_TOKEN: 'smoke-token',
  };
  const svc = spawn(process.execPath, [path.join(PLUGIN, 'service', 'main.js'), String(PORT), tmp], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const svcErr = [];
  svc.stderr.on('data', (c) => svcErr.push(String(c)));
  const kv = createKvClient({ appConfigDir: tmp, log: () => {} });
  // env 端点直命假桥
  kv.refreshEndpoint(true);
  await kv.endpoint();

  try {
    await waitUntil(async () => {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/__health`); return r.ok; } catch (_) { return false; }
    }, 8000);
    pass += 1; console.log('  ✓ /__health 200');
  } catch (e) {
    fail += 1; failures.push(`health: ${e.message}\n${svcErr.join('')}`);
    console.log('  ✗ /__health 启动失败');
    svc.kill();
    return;
  }

  // OTLP ingest：trace A（3 服务跨进程 + error）+ trace B（单 span）
  const batch = otlpRequest([
    { service: 'web', spans: [
      spanOtlp({ status: { code: 2, message: '网关超时' } }),
      spanOtlp({ spanId: 'aabbccdd11223344', parentSpanId: '1122334455667788', name: 'POST stripe.com', kind: 3, startTimeUnixNano: nano(5), endTimeUnixNano: nano(305) }),
      spanOtlp({ spanId: 'ffff000011112222', parentSpanId: 'aabbccdd11223344', name: '重试排队', kind: 1, startTimeUnixNano: nano(310), endTimeUnixNano: nano(420) }),
    ] },
    { service: 'billing', spans: [
      spanOtlp({ spanId: '9999888877776666', parentSpanId: 'aabbccdd11223344', name: '记账落库', kind: 2, startTimeUnixNano: nano(310), endTimeUnixNano: nano(800) }),
    ] },
    { service: 'scheduler', spans: [
      spanOtlp({ traceId: TRACE_B, spanId: 'aaaabbbbccccdddd', name: '夜巡任务', kind: 1, startTimeUnixNano: nano(1000), endTimeUnixNano: nano(1500) }),
    ] },
  ]);
  await aok('POST /v1/traces 200 partialSuccess（中文属性原样）', async () => {
    const r = await post(PORT, '/v1/traces', batch);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(j, { partialSuccess: {} });
  });
  await aok('spans.jsonl 落盘 5 行（权威全量）', async () => {
    const raw = fs.readFileSync(path.join(storeDir, 'spans.jsonl'), 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim());
    assert.equal(lines.length, 5);
    const rec = JSON.parse(lines[0]);
    assert.equal(rec.attrs['订单号'], '中文属性值');
  });
  await aok('空 traceId 批 → 400；protobuf → 415 提示 http/json', async () => {
    const bad = await post(PORT, '/v1/traces', { resourceSpans: 'no' });
    assert.equal(bad.status, 400);
    const proto = await post(PORT, '/v1/traces', '\x0a\x05hello', { 'Content-Type': 'application/x-protobuf' });
    assert.equal(proto.status, 415);
    const j = await proto.json();
    assert.ok(j.error.includes('http/json'));
  });
  await aok('GET 非 OTLP 路径 404（无读 API 攻击面）', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/traces`);
    assert.equal(r.status, 404);
  });

  // kv 投影（等 tick）
  await aok('kv 投影：tl.meta 心跳 + tl.idx + tl.rec.0 概览', async () => {
    const meta = await waitUntil(() => kv.kvGet('tl.meta'), 10000);
    assert.equal(meta.port, PORT);
    assert.equal(meta.endpoint, `http://127.0.0.1:${PORT}/v1/traces`);
    assert.equal(meta.spansTotal, 5);
    assert.equal(meta.tracesTotal, 2);
    assert.ok(meta.filePath.endsWith('spans.jsonl'));
    const idx = await waitUntil(() => kv.kvGet('tl.idx'), 10000);
    assert.equal(idx.count, 2);
    const rec0 = await waitUntil(() => kv.kvGet('tl.rec.0'), 10000);
    assert.ok(Array.isArray(rec0) && rec0.length === 2);
    const sumA = rec0.find((s) => s.traceId === TRACE_A);
    assert.equal(sumA.spanCount, 4);
    assert.equal(sumA.hasError, true);
    assert.equal(sumA.rootName, 'GET /api/pay');
    assert.deepEqual(sumA.services.slice(0, 2), ['web', 'billing']);
  });
  const traceAId = TRACE_A;
  await aok('kv 全文投影 tl.trace.<id>：组树有序 + 根先于子', async () => {
    const full = await waitUntil(() => kv.kvGet(`tl.trace.${traceAId}`), 12000);
    assert.equal(full.traceId, traceAId);
    const ids = full.spans.map((s) => s.spanId);
    assert.equal(ids[0], '1122334455667788'); // root
    assert.ok(ids.indexOf('aabbccdd11223344') < ids.indexOf('ffff000011112222'));
    assert.equal(full.spans.length, 4);
    const err = full.spans.find((s) => s.status.code === 'error');
    assert.equal(err.status.message, '网关超时');
  });

  // 命令双闸
  await aok('clear_all 无 confirm 拒绝（结果键如实回错）', async () => {
    const nonce = `nc${Date.now().toString(36)}`;
    await kv.kvSet(`tl.cmd.clear_all.${nonce}`, { op: 'clear_all', nonce, at: Date.now() });
    const r = await waitUntil(() => kv.kvGet(`tl.result.${nonce}`), 12000);
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('confirm'));
  });
  await aok('drop_trace 命令：JSONL 删行 + 概览更新', async () => {
    const nonce = `nc${Date.now().toString(36)}`;
    await kv.kvSet(`tl.cmd.drop_trace.${nonce}`, { op: 'drop_trace', nonce, traceId: TRACE_B, at: Date.now() });
    const r = await waitUntil(() => kv.kvGet(`tl.result.${nonce}`), 12000);
    assert.equal(r.ok, true, `drop_trace 失败: ${r.error}`);
    assert.equal(r.kept, 4);
    const meta = await waitUntil(() => kv.kvGet('tl.meta'), 10000);
    assert.equal(meta.tracesTotal, 1);
  });

  // ── C. MCP 全链路（同一假桥 + 服务在跑）──
  console.log('C. MCP 全链路（真 spawn stdio JSON-RPC）');
  const mcp = spawn(process.execPath, [path.join(PLUGIN, 'mcp', 'server.js'), tmp], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const mcpOut = [];
  mcp.stdout.on('data', (c) => mcpOut.push(String(c)));
  const mcpErr = [];
  mcp.stderr.on('data', (c) => mcpErr.push(String(c)));
  let rpcId = 0;
  const pending = new Map();
  mcp.stdout.on('data', () => {
    for (const line of mcpOut.join('').split('\n')) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      } catch (_) { /* 半行 */ }
    }
    if (mcpOut.length > 500) mcpOut.length = 0; // 防长跑膨胀
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++rpcId;
    pending.set(id, resolve);
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`rpc 超时: ${method}`)); } }, 20000);
  });
  const callTool = async (name, args) => {
    const r = await rpc('tools/call', { name, arguments: args });
    return { text: r.result?.content?.[0]?.text || '', isError: r.result?.isError === true };
  };

  try {
    await aok('initialize → serverInfo trace-lens', async () => {
      const r = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
      assert.equal(r.result.serverInfo.name, 'trace-lens');
    });
    await aok('tools/list 五工具前缀 trace_lens_', async () => {
      const r = await rpc('tools/list', {});
      const names = r.result.tools.map((t) => t.name);
      assert.deepEqual(names.sort(), ['trace_lens_clear', 'trace_lens_get', 'trace_lens_overview', 'trace_lens_recent', 'trace_lens_search']);
    });
    await aok('overview：端点/统计/接入配置', async () => {
      const t = await callTool('trace_lens_overview', {});
      assert.equal(t.isError, false);
      assert.ok(t.text.includes('http/json'));
      assert.ok(t.text.includes(`127.0.0.1:${PORT}/v1/traces`));
      assert.ok(t.text.includes('1 traces'));
    });
    await aok('recent：概览行含根名/服务/错误标', async () => {
      const t = await callTool('trace_lens_recent', {});
      assert.ok(t.text.includes('GET /api/pay'));
      assert.ok(t.text.includes('⨯'));
    });
    await aok('get（8 位前缀）：瀑布树含中文错误与属性', async () => {
      const t = await callTool('trace_lens_get', { id: TRACE_A.slice(0, 8) });
      assert.equal(t.isError, false, t.text);
      assert.ok(t.text.includes('GET /api/pay'));
      assert.ok(t.text.includes('POST stripe.com'));
      assert.ok(t.text.includes('⨯ 网关超时'));
      assert.ok(t.text.includes('订单号=中文属性值'));
      assert.ok(t.text.includes('跨服务'));
    });
    await aok('get 未知 id → isError；歧义前缀 → 提示', async () => {
      const miss = await callTool('trace_lens_get', { id: 'ffffffffffffffffffffffffffffffff' });
      assert.equal(miss.isError, true);
    });
    await aok('search 中文关键词命中 + slowerThanMs 过滤', async () => {
      const hit = await callTool('trace_lens_search', { q: 'stripe' });
      assert.ok(hit.text.includes('GET /api/pay'));
      const cn = await callTool('trace_lens_search', { q: '网关超时' }); // 状态消息可搜（trace B 已被 drop_trace 删，用 trace A 的错误消息）
      assert.ok(cn.text.includes('GET /api/pay'));
      const slow = await callTool('trace_lens_search', { slowerThanMs: 100000 });
      assert.ok(slow.text.includes('没有匹配'));
      const errOnly = await callTool('trace_lens_search', { hasError: true, sort: 'slow' });
      assert.ok(errOnly.text.includes('GET /api/pay'));
    });
    await aok('clear 无 confirm → isError 双闸', async () => {
      const t = await callTool('trace_lens_clear', {});
      assert.equal(t.isError, true);
      assert.ok(t.text.includes('confirm'));
    });
    await aok('未知工具 isError；notifications/initialized 静默', async () => {
      const t = await callTool('no_such_tool', {});
      assert.equal(t.isError, true);
      assert.ok(t.text.includes('未知工具'));
      mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    });
  } finally {
    mcp.kill();
    svc.kill();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* Windows 句柄延迟，留给系统临时目录 */ }
    bridge.svr.close();
  }
}

testCore();
await testServiceAndMcp();

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
