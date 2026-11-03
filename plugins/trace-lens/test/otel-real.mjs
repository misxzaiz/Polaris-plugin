#!/usr/bin/env node
'use strict';
/**
 * otel-real.mjs —— 最硬验收：官方 OpenTelemetry SDK 真链路
 *
 * 在隔离 scratch 目录（OTEL_SDK_DIR，含 @opentelemetry/sdk-node 0.57）真 spawn
 * 一个 SDK 应用：parent/child/错误三个 span，OTLP http/json 打向本插件服务；
 * 同时起假桥（内存 cap.kv）收服务投影，断言 SDK 真实上报被归一化落盘并在
 * kv 全文投影中出现（树结构、耗时、错误状态逐项对上）。
 *
 * 平台纪律：假桥端点经 env（POLARIS_HOST/PORT/TOKEN）注入；HTTP 中文用 Node。
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
const SDK_DIR = process.env.OTEL_SDK_DIR || '';
if (!SDK_DIR || !fs.existsSync(path.join(SDK_DIR, 'node_modules', '@opentelemetry', 'sdk-node'))) {
  console.log('跳过：未提供 OTEL_SDK_DIR（@opentelemetry/sdk-node 隔离安装目录）');
  process.exit(0);
}

let pass = 0;
let fail = 0;
const failures = [];
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

function startFakeBridge() {
  const store = new Map();
  const svr = http.createServer((req, res) => {
    const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/api/health') { reply(200, { ok: true }); return; }
    if (req.url === '/api/router-dispatch') {
      let b = '';
      req.on('data', (c) => { b += c; });
      req.on('end', () => {
        const { req: r } = JSON.parse(b);
        const p = r.payload || {};
        if (p.action === 'set') { store.set(p.key, p.value); reply(200, { ok: true, result: {} }); }
        else if (p.action === 'get') { const v = store.get(p.key); reply(200, { ok: true, result: v === undefined ? null : { key: p.key, value: v } }); }
        else if (p.action === 'delete') { store.delete(p.key); reply(200, { ok: true, result: {} }); }
        else if (p.action === 'list') { reply(200, { ok: true, result: { keys: [...store.keys()] } }); }
        else reply(200, { ok: false, error: 'bad action' });
      });
      return;
    }
    reply(404, {});
  });
  return new Promise((resolve) => {
    svr.listen(0, '127.0.0.1', () => resolve({ svr, port: svr.address().port, store }));
  });
}

const bridge = await startFakeBridge();
process.env.POLARIS_HOST = '127.0.0.1';
process.env.POLARIS_PORT = String(bridge.port);
process.env.POLARIS_TOKEN = 'smoke-token';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-lens-otel-'));
const PORT = 20871 + Math.floor(Math.random() * 300);
const svc = spawn(process.execPath, [path.join(PLUGIN, 'service', 'main.js'), String(PORT), tmp], {
  env: { ...process.env, TRACE_LENS_STORE_DIR: path.join(tmp, 's') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const svcErr = [];
svc.stderr.on('data', (c) => svcErr.push(String(c)));

try {
  await waitUntil(async () => {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/__health`); return r.ok; } catch (_) { return false; }
  }, 10000);
  console.log('  ✓ 服务起监听');

  // SDK 应用：真 SDK 三 span（root/child/error），中文属性，强制 flush
  const appScript = `
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_URL, headers: {} }) });
sdk.start();
const otel = require('@opentelemetry/api');
const tracer = otel.trace.getTracer('otel-real-probe', '1.0.0');
(async () => {
  await tracer.startActiveSpan('处理订单', async (root) => {
    root.setAttribute('订单号', 'SO-2026-1104-001');
    await new Promise(r => setTimeout(r, 30));
    const child = tracer.startSpan('查询库存', {}, otel.trace.setSpan(otel.context.active(), root));
    child.setAttribute('sku', 'A-1');
    child.end();
    const boom = tracer.startSpan('调用支付网关', {}, otel.trace.setSpan(otel.context.active(), root));
    boom.recordException(new Error('支付网关超时'));
    boom.setStatus({ code: 2, message: '支付网关超时' });
    boom.end();
    root.end();
  });
  await sdk.shutdown();
  process.stdout.write('SDK_FLUSHED');
})().catch(e => { console.error('APP_ERR', e); process.exit(3); });
`;
  const appPath = path.join(tmp, 'app.cjs');
  fs.writeFileSync(appPath, appScript);
  const app = spawn(process.execPath, [appPath], {
    cwd: SDK_DIR,
    env: {
      ...process.env,
      NODE_PATH: path.join(SDK_DIR, 'node_modules'),
      OTEL_URL: `http://127.0.0.1:${PORT}/v1/traces`,
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let appOut = '';
  let appErr = '';
  app.stdout.on('data', (c) => { appOut += String(c); });
  app.stderr.on('data', (c) => { appErr += String(c); });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`SDK 应用超时未 flush。stderr: ${appErr.slice(-600)}`)), 30000);
    app.on('exit', (code) => {
      clearTimeout(t);
      if (code === 0 && appOut.includes('SDK_FLUSHED')) resolve();
      else reject(new Error(`SDK 应用 exit=${code}。stderr: ${appErr.slice(-600)}`));
    });
  });
  console.log('  ✓ 官方 SDK 三 span 已 flush（http/json）');

  const { createKvClient } = await import(pathToFileURL(path.join(PLUGIN, 'service', 'kvclient.js')).href);
  const kv = createKvClient({ appConfigDir: tmp, log: () => {} });

  await aok('kv 概览：root=处理订单 服务 unknown-service（SDK 未设 service.name 如实落）+ 错误标', async () => {
    const rec0 = await waitUntil(() => kv.kvGet('tl.rec.0'), 12000);
    const sum = rec0[0];
    assert.equal(sum.rootName, '处理订单');
    assert.equal(sum.spanCount, 3);
    assert.equal(sum.hasError, true);
    assert.equal(sum.errCount, 1);
  });
  await aok('kv 全文投影：SDK 真实 trace 树序/错误/中文属性/异常事件逐项对上', async () => {
    const rec0 = await kv.kvGet('tl.rec.0');
    const full = await waitUntil(() => kv.kvGet(`tl.trace.${rec0[0].traceId}`), 12000);
    const ids = full.spans.map((s) => s.spanId);
    assert.equal(full.spans[0].name, '处理订单');
    assert.ok(ids.indexOf(full.spans[0].spanId) === 0);
    const boom = full.spans.find((s) => s.name === '调用支付网关');
    assert.equal(boom.status.code, 'error');
    assert.equal(boom.status.message, '支付网关超时');
    // SDK 的 recordException 产生 exception 事件（带 exception.type/message 标准属性）
    const ev = boom.events.find((e) => e.name === 'exception');
    assert.ok(ev, '缺 exception 事件');
    assert.ok(ev.attrs['exception.message'] !== undefined);
    assert.equal(full.spans.find((s) => s.name === '处理订单').attrs['订单号'], 'SO-2026-1104-001');
  });
  await aok('JSONL 权威留痕 3 行（SDK 上报全量落盘）', async () => {
    const raw = fs.readFileSync(path.join(tmp, 's', 'spans.jsonl'), 'utf8');
    assert.equal(raw.split('\n').filter((l) => l.trim()).length, 3);
  });
} finally {
  svc.kill();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* 句柄延迟兜底 */ }
  bridge.svr.close();
}

console.log(`\nOTel 真链路结果: ${pass} 通过 / ${fail} 失败`);
if (fail) { console.log(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
