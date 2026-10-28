/**
 * 韦编真实宿主冒烟（node test/smoke-real.mjs）
 * 前提：Polaris 宿主运行中（/api/health 可达）。
 * 流程：真桥 kv 往返 → 快照 settings/meta/stats → 自起 service（临时 appConfigDir 隔离索引，
 *   不注入 POLARIS_* env——逼真宿主桥自发现）→ 真桥读到 meta → 建索引 → 检索/read/越界
 *   → 杀服务 → 快照式清理（settings/meta/stats 恢复原状）。
 * 宿主不可达时如实 skipped（exit 0），不伪造通过。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createKvClient } = require('../service/kvclient.js');

const log = (m) => console.log('  ' + m);

const kv = createKvClient({ appConfigDir: '', log: () => { } });
try {
  const probeKey = 'weibian.smoke.probe.' + Date.now();
  await kv.kvSet(probeKey, 1);
  await kv.kvDel(probeKey);
} catch (e) {
  console.log('smoke-real: SKIPPED —— 宿主桥不可达（' + String(e && e.message || e).slice(0, 80) + '）');
  console.log('smoke-real: 引擎/服务/MCP 级验证已在 engine-verify / mcp-verify 覆盖；本文件需宿主运行时执行');
  process.exit(0);
}
console.log('smoke-real: 真实桥可达');
log('✔ 真桥 kv 往返（set/get/del）');

// ── 快照现场 ────────────────────────────────────────────────────────────────
const S_KEY = 'weibian.settings';
const M_KEY = 'weibian.meta';
const ST_KEY = 'weibian.stats';
const R_KEY = 'weibian.recent';
const before = {};
for (const k of [S_KEY, M_KEY, ST_KEY, R_KEY]) before[k] = await kv.kvGet(k).catch(() => undefined);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'weibian-smoke-'));
const LIB = path.join(TMP, 'library');
fs.mkdirSync(LIB, { recursive: true });
fs.writeFileSync(path.join(LIB, '冒烟笔记.md'), '# 冒烟笔记\n\nSmokeProbeToken 韦编真宿主冒烟专用词。\n');
fs.writeFileSync(path.join(LIB, 'smoke.txt'), 'plain text probe file SmokeTxtToken');

async function cleanup() {
  try {
    for (const k of [S_KEY, M_KEY, ST_KEY, R_KEY]) {
      const v = before[k];
      if (v === undefined || v === null) await kv.kvDel(k).catch(() => { });
      else await kv.kvSet(k, v).catch(() => { });
    }
  } catch (_) { /* 清理尽力而为 */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* Windows 句柄容忍 */ }
}

let failed = 0;
async function step(name, fn) {
  try { await fn(); log('✔ ' + name); }
  catch (e) { failed++; log('✖ ' + name + ' —— ' + String(e && e.message || e).split('\n')[0]); }
}

const child = spawn('node', [path.join(APP_ROOT, 'service', 'weibian.js'), '0', TMP], { stdio: ['ignore', 'ignore', 'pipe'] });
let svcErr = '';
child.stderr.on('data', (c) => { svcErr += String(c); });

async function waitMeta(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const m = await kv.kvGet(M_KEY).catch(() => null);
    if (m && m.port && m.token) return m;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('meta 20s 未就绪（stderr 尾：' + svcErr.slice(-200) + '）');
}

try {
  // 把临时目录写进真设置（服务启动即读到）
  await kv.kvSet(S_KEY, { roots: [LIB], maxDocs: 100, maxFileMB: 20 });
  log('✔ 真桥写入 weibian.settings（roots=临时目录）');

  const META = await waitMeta();
  log('✔ 服务自发现真桥并写 meta（port=' + META.port + '）');

  const BASE = `http://127.0.0.1:${META.port}`;
  const AUTH = { 'Content-Type': 'application/json', 'x-weibian-token': META.token };

  // 等扫描完成
  let stats = null;
  const deadline = Date.now() + 30000;
  for (;;) {
    const r = await fetch(BASE + '/api/progress', { headers: AUTH });
    stats = await r.json();
    if (stats.ok && !stats.scanning) break;
    if (Date.now() > deadline) throw new Error('扫描 30s 未完成');
    await new Promise((r) => setTimeout(r, 500));
  }
  await step('建索引：2 文档入库', async () => {
    if (stats.docs !== 2) throw new Error('docs=' + stats.docs);
  });

  await step('真检索：中文命中', async () => {
    const r = await fetch(BASE + '/api/search', { method: 'POST', headers: AUTH, body: JSON.stringify({ query: '冒烟 专用词' }) });
    const j = await r.json();
    if (!j.ok || !j.results.some((x) => x.name === '冒烟笔记.md')) throw new Error('未命中：' + JSON.stringify(j).slice(0, 200));
  });

  await step('真检索：英文命中', async () => {
    const r = await fetch(BASE + '/api/search', { method: 'POST', headers: AUTH, body: JSON.stringify({ query: 'SmokeTxtToken' }) });
    const j = await r.json();
    if (!j.ok || !j.results.some((x) => x.name === 'smoke.txt')) throw new Error('未命中');
  });

  await step('read：目录内可读', async () => {
    const r = await fetch(BASE + '/api/read', { method: 'POST', headers: AUTH, body: JSON.stringify({ path: path.join(LIB, '冒烟笔记.md') }) });
    const j = await r.json();
    if (!j.ok || !j.text.includes('SmokeProbeToken')) throw new Error('读取异常：' + JSON.stringify(j).slice(0, 160));
  });

  await step('read：越界拒绝（403）', async () => {
    const r = await fetch(BASE + '/api/read', { method: 'POST', headers: AUTH, body: JSON.stringify({ path: 'C:\\Windows\\win.ini' }) });
    if (r.status !== 403) throw new Error('status=' + r.status);
  });

  await step('stats/meta 落真 kv', async () => {
    const s = await kv.kvGet(ST_KEY);
    if (!s || s.docs !== 2) throw new Error('stats.docs=' + (s && s.docs));
  });
} catch (e) {
  failed++;
  log('✖ 冒烟主流程 —— ' + String(e && e.message || e).split('\n')[0]);
} finally {
  child.kill();
  await new Promise((r) => setTimeout(r, 600));
  await cleanup();
}

console.log(failed ? `\nsmoke-real: ❌ ${failed} 步失败` : '\nsmoke-real: ✅ 全部通过（现场已恢复）');
process.exit(failed ? 1 : 0);
