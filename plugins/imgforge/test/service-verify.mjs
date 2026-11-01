/**
 * service 全链路验证（node test/service-verify.mjs）
 * 内存 mock 桥（/api/health + /api/router-dispatch cap.kv）+ spawn 真服务：
 *   健康检查 → meta token 生成 → ping/scan/process/job 轮询 HTTP 闭环 →
 *   产物落盘断言 → 永不覆盖 → 401 无 token 拒绝 → 设置热读生效。
 * 这一层补齐面板字节面（127.0.0.1 自家服务）的真实传输契约。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = require('sharp');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'imgforge-svc-'));
const FIX = path.join(TMP, 'fix');
const CFG = path.join(TMP, 'cfg');
fs.mkdirSync(FIX, { recursive: true });
fs.mkdirSync(CFG, { recursive: true });

const BRIDGE_PORT = 49180 + Math.floor(Math.random() * 300);
const SVC_PORT = 49680 + Math.floor(Math.random() * 300);
const BRIDGE_TOKEN = 'svc-verify-token';

// fixture 图：2 张真图 + 1 张假扩展名
async function makePhoto(name, { w = 900, h = 600 } = {}) {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 6151) & 0xff;
  const bytes = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
  fs.writeFileSync(path.join(FIX, name), bytes);
}
await makePhoto('服务甲.jpg');
await makePhoto('服务乙.jpg', { w: 1100, h: 700 });
fs.writeFileSync(path.join(FIX, '假丙.jpg'), Buffer.from('not an image'));

// config.json 指向 mock 桥（kvclient 的发现入口）
fs.writeFileSync(path.join(CFG, 'config.json'), JSON.stringify({ web: { port: BRIDGE_PORT, token: BRIDGE_TOKEN } }));

// ── mock 桥（cap.kv in-memory）──────────────────────────────────────────────

const kvStore = new Map();
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');
const bridge = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'GET' && url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === 'POST' && url === '/api/router-dispatch') {
    if (String(req.headers.authorization || '') !== `Bearer ${md5(BRIDGE_TOKEN)}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const { req: r } = JSON.parse(body);
        const p = r.payload || {};
        let result = {};
        if (r.target !== 'cap.kv') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'mock 桥只实现了 cap.kv' }));
          return;
        }
        if (p.action === 'get') result = { value: kvStore.get(p.key) ?? null };
        else if (p.action === 'set') { kvStore.set(p.key, p.value); result = {}; }
        else if (p.action === 'delete') { kvStore.delete(p.key); result = {}; }
        else if (p.action === 'list') result = { keys: [...kvStore.keys()] };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e && e.message) }));
      }
    });
    return;
  }
  res.writeHead(404).end();
});
await new Promise((r) => bridge.listen(BRIDGE_PORT, '127.0.0.1', r));

// ── spawn 真服务 ────────────────────────────────────────────────────────────

const child = spawn('node', [path.join(APP_ROOT, 'service', 'main.js'), String(SVC_PORT), CFG], {
  stdio: ['ignore', 'pipe', 'pipe'],
  // env 是 kvclient 的最高优先级通道：保证测试密封（否则端口扫描可能命中真宿主桥）
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(BRIDGE_PORT), POLARIS_TOKEN: BRIDGE_TOKEN },
});
child.stderr.on('data', () => { /* 服务日志走 stderr，不参与断言 */ });

let passed = 0;
let failed = 0;
const fails = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ✔ ' + name);
  } catch (e) {
    failed++;
    fails.push(name + ': ' + (e && e.message));
    console.log('  ✖ ' + name + ' — ' + (e && e.message));
  }
}

function httpReq(method, api, { token = '', body = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {};
    if (token) headers['X-Imgforge-Token'] = token;
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request({ host: '127.0.0.1', port: SVC_PORT, path: api, method, headers, timeout: 60000 }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(out) }); } catch (_) { resolve({ status: res.statusCode, json: null }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('HTTP 超时')); });
    if (data) req.write(data);
    req.end();
  });
}

async function waitForHealth(timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await httpReq('GET', '/__health');
      if (r.status === 200 && r.json && r.json.ok) return r.json;
    } catch (_) { /* 服务还没起 */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('服务健康检查超时');
}

async function waitForMeta(timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const meta = kvStore.get('imgforge.meta');
    if (meta && meta.token && meta.port === SVC_PORT) return meta;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('meta 心跳未出现');
}

// ── 用例 ────────────────────────────────────────────────────────────────────

await check('健康检查 + meta 心跳（token 生成/port 注入）', async () => {
  const h = await waitForHealth();
  assert.equal(h.plugin, 'imgforge');
  const meta = await waitForMeta();
  assert.ok(meta.token.length >= 16, 'token 已生成');
  assert.equal(meta.port, SVC_PORT);
  assert.equal(meta.bridge, 'ok', '桥状态 ok');
});

await check('无 token → 401 拒绝', async () => {
  const r = await httpReq('POST', '/api/scan', { body: { dir: FIX } });
  assert.equal(r.status, 401);
});

await check('错误 token → 401 拒绝', async () => {
  const r = await httpReq('POST', '/api/scan', { token: 'wrong', body: { dir: FIX } });
  assert.equal(r.status, 401);
});

await check('ping：版本/桌面候选', async () => {
  const meta = kvStore.get('imgforge.meta');
  const r = await httpReq('POST', '/api/ping', { token: meta.token, body: {} });
  assert.equal(r.json.ok, true);
  assert.equal(r.json.version, '0.1.0');
  assert.ok(Array.isArray(r.json.desktop));
});

await check('scan：魔数预筛 + 概览统计', async () => {
  const meta = kvStore.get('imgforge.meta');
  const r = await httpReq('POST', '/api/scan', { token: meta.token, body: { dir: FIX } });
  assert.equal(r.json.ok, true, r.json && r.json.error);
  assert.equal(r.json.summary.count, 2, '假图片被预筛');
  assert.equal(r.json.summary.gpsCount, 0);
  assert.ok(r.json.files.every((f) => f.width > 0), '两张都探测到尺寸');
});

await check('scan：目录不存在 → ok:false 中文', async () => {
  const meta = kvStore.get('imgforge.meta');
  const r = await httpReq('POST', '/api/scan', { token: meta.token, body: { dir: path.join(TMP, 'nope') } });
  assert.equal(r.json.ok, false);
  assert.ok(r.json.error.includes('不存在'));
});

await check('process → job 轮询闭环：转 WebP + 假图片跳过 + 落盘 imgforge-out', async () => {
  const meta = kvStore.get('imgforge.meta');
  const start = await httpReq('POST', '/api/process', {
    token: meta.token,
    body: { dir: FIX, pipeline: { format: 'webp', quality: 80, stripMetadata: true } },
  });
  assert.equal(start.json.ok, true, start.json && start.json.error);
  assert.equal(start.json.total, 2);
  assert.ok(start.json.outDir.endsWith('imgforge-out'), '派生输出目录：' + start.json.outDir);

  // 轮询到完成
  let snap = null;
  for (let i = 0; i < 200; i++) {
    const r = await httpReq('GET', `/api/job?id=${encodeURIComponent(start.json.id)}`, { token: meta.token });
    assert.equal(r.json.ok, true, r.json && r.json.error);
    snap = r.json.job;
    if (snap.state === 'done' || snap.state === 'error') break;
    await new Promise((r2) => setTimeout(r2, 250));
  }
  assert.equal(snap.state, 'done', snap.error || '');
  assert.equal(snap.summary.ok, 2, '2 成功');
  assert.ok(snap.summary.savedBytes !== undefined, '统计带节省');
  const outs = fs.readdirSync(start.json.outDir).filter((f) => f.endsWith('.webp'));
  assert.equal(outs.length, 2, outs.join(','));
  const m = await sharp(path.join(start.json.outDir, outs[0])).metadata();
  assert.equal(m.format, 'webp');
});

await check('process：二次执行永不覆盖（-2）', async () => {
  const meta = kvStore.get('imgforge.meta');
  const start = await httpReq('POST', '/api/process', {
    token: meta.token,
    body: { paths: [path.join(FIX, '服务甲.jpg')], pipeline: { format: 'webp', quality: 80 } },
  });
  let snap = null;
  for (let i = 0; i < 200; i++) {
    const r = await httpReq('GET', `/api/job?id=${encodeURIComponent(start.json.id)}`, { token: meta.token });
    snap = r.json.job;
    if (snap.state !== 'running') break;
    await new Promise((r2) => setTimeout(r2, 250));
  }
  assert.equal(snap.state, 'done');
  assert.ok(snap.results[0].outName.includes('-2'), '重名 -2：' + snap.results[0].outName);
});

await check('历史入账（cap.kv imgforge.history.*）', async () => {
  const keys = [...kvStore.keys()].filter((k) => k.startsWith('imgforge.history.'));
  assert.ok(keys.length >= 2, '至少两条历史');
  const h = kvStore.get(keys[keys.length - 1]);
  assert.equal(h.okState, true);
  assert.equal(h.source, 'panel');
});

await check('job 不存在 → 404 中文', async () => {
  const meta = kvStore.get('imgforge.meta');
  const r = await httpReq('GET', '/api/job?id=no-such', { token: meta.token });
  assert.equal(r.json.ok, false);
  assert.ok(r.json.error.includes('不存在'));
});

// ── 清理与汇总 ──────────────────────────────────────────────────────────────

child.kill();
bridge.close();
console.log(`\nservice-verify: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log(fails.map((f) => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
