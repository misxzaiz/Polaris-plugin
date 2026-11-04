import { createRequire } from 'node:module';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const steps = require('../service/steps.js');
const engine = require('../shared/engine.js');

// ── 工具：临时 HTTP 服务器 ───────────────────────────────────────────────────
const servers = [];
async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  servers.push(server);
  return server;
}
test.afterEach(() => {
  while (servers.length) servers.pop().close();
});

function mkEx(overrides = {}) {
  return {
    signal: undefined,
    allowLocal: true,
    kv: fakeKv(),
    providers: [],
    getSetting: () => undefined,
    appConfigDir: fs.mkdtempSync(path.join(os.tmpdir(), 'flowpipe-test-')),
    log: () => {},
    ...overrides,
  };
}

function fakeKv() {
  const m = new Map();
  return {
    async kvGet(k) { return m.has(k) ? m.get(k) : null; },
    async kvSet(k, v) { m.set(k, v); return true; },
    async kvDel(k) { m.delete(k); return true; },
    async dispatchOk(target, payload) {
      if (target === 'cap.mcp') return payload.__mockResult ?? { content: [{ type: 'text', text: 'mock-ok' }] };
      throw new Error(`unexpected dispatch ${target}`);
    },
    _map: m,
  };
}

const ctxBase = () => ({ vars: {}, steps: {}, params: {}, env: { today: '2026-11-03', now: 'x', runId: 'r1', plId: 'p1', plName: 'P' } });

// ── http 步骤：SSRF 围栏 ─────────────────────────────────────────────────────
test('http: 私网目标默认拒绝，开 allowLocal 放行', async () => {
  const server = await listen((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":1}'); });
  const url = `http://127.0.0.1:${server.address().port}/x`;
  const ctx = ctxBase();
  const deny = await steps.runStep({ type: 'http', method: 'GET', url }, ctx, mkEx({ allowLocal: false }));
  assert.equal(deny.ok, false);
  assert.match(deny.error, /私网|环回|allowLocal/);
  const allow = await steps.runStep({ type: 'http', method: 'GET', url }, ctx, mkEx({ allowLocal: true }));
  assert.equal(allow.ok, true, allow.error);
  assert.equal(allow.output.status, 200);
  assert.deepEqual(allow.output.json, { ok: 1 });
});

test('http: 元数据地址 allowLocal 也永不放行', async () => {
  const r = await steps.runStep({ type: 'http', method: 'GET', url: 'http://169.254.169.254/latest/meta-data/' }, ctxBase(), mkEx({ allowLocal: true }));
  assert.equal(r.ok, false);
  assert.match(r.error, /永不放行/);
});

test('http: POST 带体 + 自定义头', async () => {
  let seen = null;
  const server = await listen((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => { seen = { auth: req.headers.authorization, body: b }; res.end('{"saved":true}'); });
  });
  const r = await steps.runStep({
    type: 'http', method: 'POST',
    url: `http://127.0.0.1:${server.address().port}/post`,
    headers: { Authorization: 'Bearer tok123' },
    body: { name: '{{vars.item}}' },
  }, { ...ctxBase(), vars: { item: 'abc' } }, mkEx());
  assert.equal(r.ok, true, r.error);
  assert.equal(seen.auth, 'Bearer tok123');
  assert.deepEqual(JSON.parse(seen.body), { name: 'abc' });
});

test('http: 跨源重定向剥鉴权头', async () => {
  const target = await listen((req, res) => {
    res.end(JSON.stringify({ sawAuth: Boolean(req.headers.authorization) }));
  });
  const src = await listen((req, res) => {
    res.writeHead(302, { Location: `http://localhost:${target.address().port}/final` });
    res.end();
  });
  const r = await steps.runStep({
    type: 'http', method: 'GET',
    url: `http://127.0.0.1:${src.address().port}/jump`,
    headers: { Authorization: 'Bearer secret' },
  }, ctxBase(), mkEx());
  assert.equal(r.ok, true, r.error);
  assert.equal(r.output.json.sawAuth, false, '跨源重定向后不应携带 Authorization');
});

test('http: 超时报错', async () => {
  const server = await listen((req, res) => { setTimeout(() => { res.end('late'); }, 3000); });
  const r = await steps.runStep({
    type: 'http', method: 'GET', url: `http://127.0.0.1:${server.address().port}/slow`, timeoutSec: 2,
  }, ctxBase(), mkEx());
  assert.equal(r.ok, false);
  assert.ok(/超时|abort/i.test(r.error));
});

// ── notify ───────────────────────────────────────────────────────────────────
test('notify: POST JSON 到 webhook', async () => {
  let seen = null;
  const server = await listen((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => { seen = JSON.parse(b); res.end('{"errcode":0}'); });
  });
  const r = await steps.runStep({
    type: 'notify',
    url: `http://127.0.0.1:${server.address().port}/hook`,
    payload: { msgtype: 'text', text: { content: '巡检失败 {{vars.code}}' } },
  }, { ...ctxBase(), vars: { code: 'HTTP 503' } }, mkEx());
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(seen, { msgtype: 'text', text: { content: '巡检失败 HTTP 503' } });
});

// ── mcp ──────────────────────────────────────────────────────────────────────
test('mcp: cap.mcp 直调 + 文本聚合', async () => {
  const ex = mkEx();
  ex.kv.dispatchOk = async (target, payload) => {
    assert.equal(target, 'cap.mcp');
    assert.equal(payload.action, 'call');
    assert.equal(payload.mcpServerId, 'domain-probe');
    assert.equal(payload.tool, 'probe');
    assert.deepEqual(payload.arguments, { host: 'example.com' });
    return { content: [{ type: 'text', text: 'part1' }, { type: 'text', text: 'part2' }] };
  };
  const r = await steps.runStep({
    type: 'mcp', serverId: 'domain-probe', tool: 'probe',
    arguments: { host: '{{vars.host}}' },
  }, { ...ctxBase(), vars: { host: 'example.com' } }, ex);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.output.text, 'part1\npart2');
  assert.match(r.excerpt, /domain-probe\.probe → part1/);
});

// ── ai ───────────────────────────────────────────────────────────────────────
test('ai: openai 兼容协议', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ choices: [{ message: { content: '摘要内容' } }], model: 'glm-4' }), { status: 200 });
  };
  try {
    const ex = mkEx({ providers: [{ id: 'p1', name: '测试', baseUrl: 'https://api.test.example/v1', apiKey: 'sk-test', model: 'glm-4', wire: 'openai-chat-completions' }] });
    const r = await steps.runStep({ type: 'ai', providerId: 'p1', prompt: '总结：{{vars.text}}' }, { ...ctxBase(), vars: { text: '长文' } }, ex);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.output.text, '摘要内容');
    assert.equal(calls[0].url, 'https://api.test.example/v1/chat/completions');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.messages[0].role, 'user');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ai: 供应商缺失给可读错误', async () => {
  const r = await steps.runStep({ type: 'ai', providerId: 'nope', prompt: 'x' }, ctxBase(), mkEx());
  assert.equal(r.ok, false);
  assert.match(r.error, /找不到 AI 供应商/);
});

// ── extract / template / script ──────────────────────────────────────────────
test('extract: 从前置步骤输出提取', async () => {
  const ctx = ctxBase();
  ctx.steps.resp = { status: 200, json: { items: [{ id: 'a' }, { id: 'b' }] } };
  const r = await steps.runStep({ type: 'extract', from: 'resp', paths: { first: 'json.items.0.id', all: 'json.items[*].id', miss: 'json.nope' } }, ctx, mkEx());
  assert.equal(r.ok, true);
  assert.deepEqual(r.output, { first: 'a', all: ['a', 'b'], miss: null });
  assert.equal(r.warnings.length, 1);
});

test('script: 沙箱内无 process/require，return 可用', async () => {
  const r = await steps.runStep({ type: 'script', code: 'return { hasProcess: typeof process, hasRequire: typeof require, n: 1 + 2 }' }, ctxBase(), mkEx());
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.output, { hasProcess: 'undefined', hasRequire: 'undefined', n: 3 });
});

test('script: 死循环被超时打断', async () => {
  const r = await steps.runStep({ type: 'script', code: 'while (true) {}' }, ctxBase(), mkEx());
  assert.equal(r.ok, false);
  assert.match(r.error, /超时/);
});

test('script: 可读 vars/params/steps 快照', async () => {
  const ctx = ctxBase();
  ctx.vars.token = 't1';
  ctx.params.query = { q: 'x' };
  ctx.steps.resp = { json: { count: 5 } };
  const r = await steps.runStep({ type: 'script', code: 'return { t: vars.token, q: params.query.q, c: steps.resp.json.count }' }, ctx, mkEx());
  assert.deepEqual(r.output, { t: 't1', q: 'x', c: 5 });
});

// ── kv ───────────────────────────────────────────────────────────────────────
test('kv: set/get/del 走 cap.kv', async () => {
  const ex = mkEx();
  const ctx = ctxBase();
  const setR = await steps.runStep({ type: 'kv', action: 'set', key: 'flowpipe.demo', value: { a: 1 } }, ctx, ex);
  assert.equal(setR.ok, true, setR.error);
  assert.deepEqual(ex.kv._map.get('flowpipe.demo'), { a: 1 });
  const getR = await steps.runStep({ type: 'kv', action: 'get', key: 'flowpipe.demo' }, ctx, ex);
  assert.deepEqual(getR.output, { a: 1 });
  await steps.runStep({ type: 'kv', action: 'del', key: 'flowpipe.demo' }, ctx, ex);
  assert.equal(ex.kv._map.has('flowpipe.demo'), false);
});

// ── file ─────────────────────────────────────────────────────────────────────
test('file: 白名单内可写，目录外拒绝', async () => {
  const ex = mkEx();
  const ctx = ctxBase();
  const ok = await steps.runStep({ type: 'file', action: 'write', path: 'out-{{env.today}}.txt', content: 'hello {{vars.name}}' }, { ...ctx, vars: { name: 'world' } }, ex);
  assert.equal(ok.ok, true, ok.error);
  const written = path.join(ex.appConfigDir, 'flow-pipeline', 'outputs', 'out-2026-11-03.txt');
  assert.equal(fs.readFileSync(written, 'utf8'), 'hello world');

  const bad = await steps.runStep({ type: 'file', action: 'write', path: 'C:\\Windows\\System32\\evil.txt', content: 'x' }, ctx, ex);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /白名单/);
});

test('file: 相对路径默认落输出目录', () => {
  const dir = mkEx().appConfigDir;
  const r = steps.resolveWritablePath('a/b.txt', dir);
  assert.ok(r.abs.includes(path.join('flow-pipeline', 'outputs')));
  const r2 = steps.resolveWritablePath('a/b.txt', '');
  assert.ok(r2.abs.includes('Desktop'));
});

// ── 围栏自检 ─────────────────────────────────────────────────────────────────
test('selfTestFence: 判定用例全过', () => {
  const results = steps.selfTestFence();
  for (const c of results) assert.equal(c.ok, c.expectOk, `${c.host} allowLocal=${c.allowLocal}: ${c.reason}`);
});
