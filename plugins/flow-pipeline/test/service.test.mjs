import { createRequire } from 'node:module';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { md5 } = require('../service/kvclient.js');

// ── 假宿主桥：POST /api/router-dispatch（cap.kv get/set/delete/list）─────────
const kvStore = new Map();
const bridge = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') { res.end('{"ok":true}'); return; }
  if (req.method === 'POST' && req.url === '/api/router-dispatch') {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => {
      try {
        const { req: r } = JSON.parse(b);
        if (r.target !== 'cap.kv') { res.end(JSON.stringify({ ok: false, error: `mock bridge 仅支持 cap.kv，收到 ${r.target}` })); return; }
        const p = r.payload || {};
        if (p.action === 'get') res.end(JSON.stringify({ ok: true, result: { value: kvStore.has(p.key) ? kvStore.get(p.key) : null } }));
        else if (p.action === 'set') { kvStore.set(p.key, p.value); res.end(JSON.stringify({ ok: true, result: {} })); }
        else if (p.action === 'delete') { kvStore.delete(p.key); res.end(JSON.stringify({ ok: true, result: {} })); }
        else if (p.action === 'list') res.end(JSON.stringify({ ok: true, result: { keys: [...kvStore.keys()] } }));
        else res.end(JSON.stringify({ ok: false, error: `未知 kv action ${p.action}` }));
      } catch (e) {
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  res.writeHead(404); res.end();
});

const BRIDGE_PORT = 19820;
const SVC_PORT = 19881;
const TOKEN = 'bridge-token-123';
const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpipe-svc-'));
// 隔离宿主配置：APPDATA 指向临时目录，并在其中伪造 config.json（含 modelProfiles）
fs.writeFileSync(path.join(appDir, 'config.json'), JSON.stringify({
  web: { port: BRIDGE_PORT, token: TOKEN },
  modelProfiles: [
    { id: 'h1', name: '宿主档', baseUrl: 'https://host.example/v1', apiKey: 'sk-host-real-0001', model: 'host-model', wireApi: 'openai-chat-completions' },
    { id: 'h2', name: '掩码档', baseUrl: 'https://m.example', apiKey: '__POLARIS_MASKED_PLACEHOLDER', model: 'm2' },
  ],
}), 'utf8');
let child = null;

before(async () => {
  await new Promise((ok) => bridge.listen(BRIDGE_PORT, '127.0.0.1', ok));
  child = spawn(process.execPath, [path.join('service', 'main.js'), String(SVC_PORT), appDir], {
    cwd: path.join(import.meta.dirname, '..'),
    env: {
      ...process.env,
      APPDATA: appDir, // 隔离：防扫到本机真实 Polaris 配置
      POLARIS_HOST: '127.0.0.1',
      POLARIS_PORT: String(BRIDGE_PORT),
      POLARIS_TOKEN: TOKEN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', () => { /* 日志已落文件，测试不刷屏 */ });
  // 等 /__health 就绪
  const t0 = Date.now();
  for (;;) {
    const ok = await fetch(`http://127.0.0.1:${SVC_PORT}/__health`).then((r) => r.ok).catch(() => false);
    if (ok) return;
    if (Date.now() - t0 > 10_000) throw new Error('服务 10s 未就绪');
    await new Promise((ok2) => setTimeout(ok2, 200));
  }
  // 等待 meta 心跳发布（/__health 先于 beatMeta 就绪的竞态）
  const tm = Date.now();
  while (!kvStore.get('flowpipe.meta')) {
    if (Date.now() - tm > 10_000) throw new Error('flowpipe.meta 10s 未发布');
    await new Promise((ok2) => setTimeout(ok2, 150));
  }
});

after(() => {
  if (child) child.kill();
  bridge.close();
});

function svc(method, apiPath, body, { auth = 'good' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth === 'good') {
    // 生产同款：服务随机 token 发布在 kv 的 flowpipe.meta，从这里取
    const meta = kvStore.get('flowpipe.meta');
    if (!meta || !meta.token) throw new Error('flowpipe.meta 未发布（服务未完成心跳）');
    headers.Authorization = `Bearer ${meta.token}`;
  } else if (auth === 'bad') {
    headers.Authorization = 'Bearer wrong';
  }
  return fetch(`http://127.0.0.1:${SVC_PORT}${apiPath}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
}

async function waitRun(runId, timeoutMs = 5000) {
  const t0 = Date.now();
  for (;;) {
    const r = await svc('GET', `/api/runs/${runId}`);
    if (r.status === 200 && r.data.run && r.data.run.status !== 'queued' && r.data.run.status !== 'running') return r.data.run;
    if (Date.now() - t0 > timeoutMs) throw new Error(`运行 ${runId} 超时未完成`);
    await new Promise((ok) => setTimeout(ok, 150));
  }
}

// ── 鉴权 ─────────────────────────────────────────────────────────────────────
test('service: /__health 无需鉴权', async () => {
  const r = await fetch(`http://127.0.0.1:${SVC_PORT}/__health`);
  assert.equal(r.status, 200);
});
test('service: 无/错 token 一律 401', async () => {
  assert.equal((await svc('GET', '/api/pipelines', undefined, { auth: 'none' })).status, 401);
  assert.equal((await svc('GET', '/api/pipelines', undefined, { auth: 'bad' })).status, 401);
});

// ── CRUD ─────────────────────────────────────────────────────────────────────
test('service: 创建/校验/列表/详情', async () => {
  const bad = await svc('POST', '/api/pipelines', { pipeline: { name: '坏', steps: [{ type: 'wat' }] } });
  assert.equal(bad.status, 400);
  assert.ok(Array.isArray(bad.data.errors) && bad.data.errors.length > 0);

  const good = await svc('POST', '/api/pipelines', { pipeline: {
    name: '冒烟线',
    trigger: { type: 'webhook' },
    vars: { host: 'http://x.test', secret1: 'abcd1234wxyz' },
    secrets: ['secret1'],
    steps: [{ type: 'template', text: 'hit {{params.body.k}}', saveAs: 'out' }],
  } });
  assert.equal(good.status, 201);
  const def = good.data.pipeline;
  assert.ok(def.id.startsWith('pl_'));
  assert.ok(def.trigger.token && def.trigger.token.length >= 16);
  assert.equal(def.vars.secret1, '__FLOWPIPE_MASKED__', '敏感变量出口掩码');

  const list = await svc('GET', '/api/pipelines');
  assert.ok(list.data.pipelines.some((p) => p.id === def.id));
  return def;
});

test('service: PUT 掩码哨兵不覆盖真值', async () => {
  const created = await svc('POST', '/api/pipelines', { pipeline: {
    name: '哨兵线', vars: { k: 'real-secret-777' }, secrets: ['k'],
    steps: [{ type: 'template', text: '{{k}}', saveAs: 'o' }],
  } });
  const def = created.data.pipeline;
  assert.equal(def.vars.k, '__FLOWPIPE_MASKED__');
  // 用户编辑后原样传回掩码 → 服务端必须保留旧真值
  const upd = await svc('PUT', `/api/pipelines/${def.id}`, { pipeline: { ...def, name: '哨兵线2' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.pipeline.name, '哨兵线2');
  // 用运行验证真值仍在（掩码不会变成真值泄漏——运行摘要出口仍掩码）
  const runResp = await svc('POST', `/api/pipelines/${def.id}/run`, { params: {} });
  const run = await waitRun(runResp.data.runId);
  assert.equal(run.status, 'ok');
  assert.ok(!JSON.stringify(run).includes('real-secret-777'), '真值不得出现在运行记录');
  assert.match(run.steps[0].excerpt, /rea\*\*\*77|real\*\*\*77/);
});

// ── 运行 + webhook ───────────────────────────────────────────────────────────
test('service: 手动运行 + 运行详情 + 停止接口语义', async () => {
  const created = await svc('POST', '/api/pipelines', { pipeline: {
    name: '手动线',
    steps: [{ type: 'template', text: 'v={{params.q}}', saveAs: 'o' }],
  } });
  const id = created.data.pipeline.id;
  const resp = await svc('POST', `/api/pipelines/${id}/run`, { params: { q: 'hello' } });
  assert.equal(resp.status, 202);
  const run = await waitRun(resp.data.runId);
  assert.equal(run.status, 'ok');
  assert.match(run.steps[0].excerpt, /v=hello/);
  // 已结束的运行再 stop → 409
  const stop = await svc('POST', `/api/runs/${resp.data.runId}/stop`);
  assert.equal(stop.status, 409);
});

test('service: webhook 触发（token 校验/限流/参数注入）', async () => {
  const created = await svc('POST', '/api/pipelines', { pipeline: {
    name: '钩子线',
    trigger: { type: 'webhook' },
    steps: [{ type: 'template', text: 'q={{params.query.a}}', saveAs: 'o' }],
  } });
  const def = created.data.pipeline;
  const hook = (tok) => fetch(`http://127.0.0.1:${SVC_PORT}/hook/${def.id}?a=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-FlowPipe-Token': tok || def.trigger.token },
    body: JSON.stringify({ hello: 1 }),
  }).then(async (r) => ({ status: r.status, data: await r.json() }));

  const badTok = await hook('wrong-token');
  assert.equal(badTok.status, 401);
  const ok = await hook();
  assert.equal(ok.status, 202);
  const run = await waitRun(ok.data.runId);
  assert.match(run.steps[0].excerpt, /q=1/);
  // 限流：连续 12 次后第 13 次 429
  let got429 = false;
  for (let i = 0; i < 13; i++) {
    const r = await hook();
    if (r.status === 429) { got429 = true; break; }
  }
  assert.equal(got429, true, '第 13 次应触发限流');
});

// ── 设置与导入 ───────────────────────────────────────────────────────────────
test('service: 设置读写掩码 + 宿主导入（掩码档拒收）', async () => {
  // 宿主导入：h1 真键入库、h2 掩码占位拒收 → imported = 1
  const dry = await svc('POST', '/api/settings/import-host', { dryRun: true });
  assert.equal(dry.status, 200);
  assert.equal(dry.data.imported, 1, JSON.stringify(dry.data));
  assert.equal(dry.data.preview[0].name, '宿主档');
  const real = await svc('POST', '/api/settings/import-host', {});
  assert.equal(real.data.imported, 1);

  // 手填供应商 + 掩码回传改名：真值不被覆盖
  await svc('PUT', '/api/settings', { settings: {
    aiTimeoutSec: 60, webhookEnabled: true,
    providers: [
      ...real.data.settings.providers,
      { id: 'prov_x', name: '手填', baseUrl: 'https://api.t.example', apiKey: 'sk-manual-000', model: 'm1', wire: 'openai-chat-completions' },
    ],
  } });
  const got = await svc('GET', '/api/settings');
  assert.equal(got.data.settings.providers.length, 2);
  assert.ok(got.data.settings.providers.every((p) => p.apiKey === '__FLOWPIPE_MASKED__'), '全部出口掩码');
  const renamed = got.data.settings.providers.find((p) => p.name === '手填');
  await svc('PUT', '/api/settings', { settings: { ...got.data.settings, providers: got.data.settings.providers.map((p) => (p.id === renamed.id ? { ...p, name: '改名' } : p)) } });
  // 再读仍是 2 个（掩码哨兵没有把真值清掉导致供应商失效）
  const again = await svc('GET', '/api/settings');
  assert.equal(again.data.settings.providers.length, 2);
});

// ── 自检 + 删除 ──────────────────────────────────────────────────────────────
test('service: selftest 全过', async () => {
  const r = await svc('POST', '/api/selftest');
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true, JSON.stringify(r.data.checks));
  assert.equal(r.data.checks.bridgeOk, true);
});

test('service: 删除需确认词，删后 404', async () => {
  const created = await svc('POST', '/api/pipelines', { pipeline: { name: '将删线', steps: [{ type: 'template', text: 'x', saveAs: 'o' }] } });
  const id = created.data.pipeline.id;
  const bad = await svc('DELETE', `/api/pipelines/${id}?confirm=错的`);
  assert.equal(bad.status, 400);
  const ok = await svc('DELETE', `/api/pipelines/${id}?confirm=${encodeURIComponent('将删线')}`);
  assert.equal(ok.status, 200);
  const gone = await svc('GET', `/api/pipelines/${id}`);
  assert.equal(gone.status, 404);
});
