/**
 * 真宿主桥冒烟（node test/smoke-real.mjs）—— 需要本机 Polaris 正在运行
 *
 * 与 service-verify 的差别：不注入 env、不造 mock 桥，kvclient 走真实发现链
 * （anchor.json → dataRoot/config.json → 端口扫描），meta/历史落在真实 cap.kv。
 * 跑完全量自清理（imgforge.* 键），不留宿主痕迹。宿主不在跑则明确跳过。
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

// ── 定位真实宿主（与 kvclient 同一候选链，只读）──────────────────────────────
function loadRealWebConfig() {
  const cands = [];
  if (process.env.APPDATA) {
    try {
      const a = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'Polaris', 'anchor.json'), 'utf8'));
      if (a.dataRoot) cands.push(path.join(a.dataRoot, 'config.json'));
    } catch (_) { /* 无锚 */ }
  }
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'));
  for (const p of cands) {
    try {
      const root = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (root.web && typeof root.web.port === 'number') return { port: root.web.port, token: root.web.token || '' };
    } catch (_) { /* 下一个 */ }
  }
  return null;
}

function dispatch(port, token, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target: 'cap.kv', payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (token) headers.Authorization = `Bearer ${crypto.createHash('md5').update(String(token)).digest('hex')}`;
    const r = http.request({ hostname: '127.0.0.1', port, path: '/api/router-dispatch', method: 'POST', headers, timeout: 8000 }, (res) => {
      let o = '';
      res.on('data', (c) => { o += c; });
      res.on('end', () => { try { resolve(JSON.parse(o)); } catch (e) { reject(e); } });
    });
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('dispatch 超时')));
    r.write(data);
    r.end();
  });
}

const cfg = loadRealWebConfig();
if (!cfg) {
  console.log('（跳过：未找到真实 Polaris 配置——真桥冒烟需要宿主在本机运行）');
  process.exit(0);
}

// 健康探测确认宿主活着
const alive = await new Promise((resolve) => {
  const req = http.get({ hostname: '127.0.0.1', port: cfg.port, path: '/api/health', timeout: 1500 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
  req.on('error', () => resolve(false));
  req.on('timeout', () => { req.destroy(); resolve(false); });
});
if (!alive) {
  console.log(`（跳过：宿主 ${cfg.port} 端口无响应——真桥冒烟需要 Polaris 正在运行）`);
  process.exit(0);
}

console.log(`真宿主桥：127.0.0.1:${cfg.port}${cfg.token ? '（authed）' : '（noauth）'}`);

// ── fixture + spawn 服务（不注入 env，走真实发现链）────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'imgforge-real-'));
const FIX = path.join(TMP, 'fix');
fs.mkdirSync(FIX, { recursive: true });
const raw = Buffer.alloc(900 * 600 * 3);
for (let i = 0; i < raw.length; i++) raw[i] = (i * 6151) & 0xff;
fs.writeFileSync(path.join(FIX, '真桥测试.jpg'), await sharp(raw, { raw: { width: 900, height: 600, channels: 3 } }).jpeg({ quality: 85 }).toBuffer());

const SVC_PORT = 49820 + Math.floor(Math.random() * 150);
const child = spawn('node', [path.join(APP_ROOT, 'service', 'main.js'), String(SVC_PORT), ''], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stderr.on('data', () => { /* 日志 */ });

try {
  // 等 meta 出现在真实 kv（服务经 kvclient 真实发现链写入）
  let meta = null;
  for (let i = 0; i < 60; i++) {
    const r = await dispatch(cfg.port, cfg.token, { action: 'get', key: 'imgforge.meta' }).catch(() => null);
    if (r && r.ok && r.result && r.result.value && r.result.value.token && r.result.value.port === SVC_PORT) {
      meta = r.result.value;
      break;
    }
    await new Promise((r2) => setTimeout(r2, 500));
  }
  assert.ok(meta, 'meta 未出现在真实 cap.kv（发现链或桥异常）');
  console.log(`  ✔ 服务经真实发现链上线 :${meta.port}（bridge=${meta.bridge}）`);

  // HTTP 闭环：scan → process → job
  const call = (method, api, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'X-Imgforge-Token': meta.token };
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request({ hostname: '127.0.0.1', port: SVC_PORT, path: api, method, headers, timeout: 60000 }, (res) => {
      let o = '';
      res.on('data', (c) => { o += c; });
      res.on('end', () => { try { resolve(JSON.parse(o)); } catch (e) { reject(e); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

  const scan = await call('POST', '/api/scan', { dir: FIX });
  assert.equal(scan.ok, true, scan.error);
  assert.equal(scan.summary.count, 1);
  console.log('  ✔ scan 经真桥服务正常（1 张，尺寸探测成功）');

  const start = await call('POST', '/api/process', { dir: FIX, pipeline: { format: 'webp', quality: 80 } });
  assert.equal(start.ok, true, start.error);
  let snap = null;
  for (let i = 0; i < 100; i++) {
    const r = await call('GET', `/api/job?id=${encodeURIComponent(start.id)}`);
    snap = r.job;
    if (snap && snap.state !== 'running') break;
    await new Promise((r2) => setTimeout(r2, 250));
  }
  assert.equal(snap.state, 'done', snap.error);
  assert.equal(snap.summary.ok, 1);
  const outs = fs.readdirSync(start.outDir).filter((f) => f.endsWith('.webp'));
  assert.equal(outs.length, 1);
  const m = await sharp(path.join(start.outDir, outs[0])).metadata();
  assert.equal(m.format, 'webp');
  console.log(`  ✔ process 闭环完成：${core0(snap.summary.inBytes)} → ${core0(snap.summary.outBytes)}，输出 ${outs[0]}`);

  console.log('✓ 真桥冒烟全绿');
} catch (e) {
  console.log('✗ 真桥冒烟失败：' + (e && e.message));
  process.exitCode = 1;
} finally {
  child.kill();
  // 自清理：真实 kv 里的 imgforge.* 键
  try {
    const list = await dispatch(cfg.port, cfg.token, { action: 'list' });
    const keys = ((list && list.ok && list.result && list.result.keys) || []).filter((k) => k.startsWith('imgforge.'));
    for (const k of keys) await dispatch(cfg.port, cfg.token, { action: 'delete', key: k });
    console.log(`已自清理真实 kv 的 imgforge.* 键 ${keys.length} 个`);
  } catch (e) {
    console.log('⚠ 清理失败（可手动删 imgforge.* 键）: ' + (e && e.message));
  }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* Windows 句柄延迟释放：容忍，系统临时目录会回收 */ }
}

function core0(n) {
  const v = Number(n);
  if (v < 1024) return v + ' B';
  if (v < 1048576) return (v / 1024).toFixed(1) + ' KB';
  return (v / 1048576).toFixed(1) + ' MB';
}
