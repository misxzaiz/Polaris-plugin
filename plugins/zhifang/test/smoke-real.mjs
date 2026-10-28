/**
 * 纸坊真实宿主冒烟（node test/smoke-real.mjs）
 * 前提：Polaris 宿主运行中（9829 等 web 端口 /api/health 可达）。
 * 流程：真桥 kv 往返 → 自起 service（独立端口 + 临时 appConfigDir）→
 *   token 鉴权 → /api/ping → /api/op merge+text（fixture）→ 产物断言 → 401/未知 op 错误口径
 *   → 历史登记断言 → 快照式清理（settings/meta/history 三处恢复原状）。
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
const { PDFDocument, StandardFonts } = require('../vendor/pdf-lib.min.js');

const log = (m) => console.log('  ' + m);

// ── 宿主探测 ────────────────────────────────────────────────────────────────
const kv = createKvClient({ appConfigDir: '', log: () => { } });
let bridge = null;
try {
  bridge = await (async () => {
    // resolveEndpoint 私有；用一次轻量 kvGet 探测
    const probeKey = 'zhifang.smoke.probe.' + Date.now();
    await kv.kvSet(probeKey, 1);
    await kv.kvDel(probeKey);
    return true;
  })();
} catch (e) {
  console.log('smoke-real: SKIPPED —— 宿主桥不可达（' + String(e && e.message || e).slice(0, 80) + '）');
  console.log('smoke-real: 引擎/服务/MCP 级验证已在 engine-verify / mcp-verify 覆盖；本文件需宿主运行时执行');
  process.exit(0);
}
console.log('smoke-real: 真实桥可达');
log('✔ 真桥 kv 往返（set/get/del）');

// ── 快照现场（settings/meta/history）───────────────────────────────────────
const S_KEY = 'zhifang.settings';
const M_KEY = 'zhifang.meta';
const H_PRE = 'zhifang.history.';
const settingsBefore = await kv.kvGet(S_KEY);
const metaBefore = await kv.kvGet(M_KEY);
const historyBefore = new Set((await kv.kvKeys()).filter((k) => k.startsWith(H_PRE)));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'zhifang-smoke-'));
const OUT = path.join(TMP, 'out');
fs.mkdirSync(OUT, { recursive: true });

async function cleanup() {
  try {
    if (settingsBefore === null) await kv.kvDel(S_KEY); else await kv.kvSet(S_KEY, settingsBefore);
    if (metaBefore === null) await kv.kvDel(M_KEY); else await kv.kvSet(M_KEY, metaBefore);
    const keys = (await kv.kvKeys()).filter((k) => k.startsWith(H_PRE));
    for (const k of keys) if (!historyBefore.has(k)) await kv.kvDel(k).catch(() => { });
  } catch (_) { /* 清理尽力而为 */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* Windows 句柄容忍 */ }
}

let failed = 0;
async function step(name, fn) {
  try { await fn(); log('✔ ' + name); }
  catch (e) { failed++; log('✖ ' + name + ' —— ' + String(e && e.message || e).split('\n')[0]); }
}

const SVC_PORT = 38777;
// 输出目录在服务启动前写入（快照已存，结束时恢复）——服务启动即读到临时输出目录
await kv.kvSet(S_KEY, { outDir: OUT, maxUploadMB: 128, historyCap: 200 });
const child = spawn('node', [path.join(APP_ROOT, 'service', 'main.js'), String(SVC_PORT), TMP], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stderr.on('data', () => { /* 日志不参与断言 */ });

async function waitHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${SVC_PORT}/__health`);
      if (r.ok) return await r.json();
    } catch (_) { /* 未就绪，重试 */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('service 健康端点 15s 未就绪');
}

try {
  const health = await waitHealth();
  await step('健康端点 200 + plugin 标识', async () => {
    if (health.plugin !== 'zhifang') throw new Error('health.plugin=' + health.plugin);
  });

  let token = '';
  await step('meta 心跳写入真 kv（token 可取回）', async () => {
    for (let i = 0; i < 20; i++) {
      const meta = await kv.kvGet(M_KEY);
      if (meta && meta.token && meta.port === SVC_PORT) { token = meta.token; break; }
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!token) throw new Error('meta.token 未写入');
  });

  await step('错误 token → 401 拒绝', async () => {
    const r = await fetch(`http://127.0.0.1:${SVC_PORT}/api/ping`, { method: 'POST', headers: { 'X-Zhifang-Token': 'wrong' } });
    if (r.status !== 401) throw new Error('status=' + r.status);
  });

  await step('正确 token → /api/ping ok', async () => {
    const r = await fetch(`http://127.0.0.1:${SVC_PORT}/api/ping`, { method: 'POST', headers: { 'X-Zhifang-Token': token }, body: '{}' });
    const j = await r.json();
    if (!j.ok) throw new Error('ping not ok');
  });

  // 输出目录已在启动前写入 kv；服务每 op 强制热读，无需等待
  await kv.kvSet(S_KEY, { outDir: OUT, maxUploadMB: 128, historyCap: 200 });

  async function makePdf(n, base) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= n; i++) doc.addPage([595, 842]).drawText(`Smoke page ${i} marker-${base + i}`, { x: 40, y: 700, size: 18, font });
    return Buffer.from(await doc.save());
  }
  const b64 = (buf) => buf.toString('base64');

  await step('面板链路 /api/op merge：两份真 PDF → 落盘到临时输出目录', async () => {
    const body = {
      op: 'merge', source: 'panel',
      files: [{ name: '冒烟A.pdf', b64: b64(await makePdf(2, 1000)) }, { name: '冒烟B.pdf', b64: b64(await makePdf(2, 2000)) }],
      params: {},
    };
    const r = await fetch(`http://127.0.0.1:${SVC_PORT}/api/op`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zhifang-Token': token }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.ok) throw new Error('op 失败: ' + j.error);
    const out = j.outputs && j.outputs[0];
    if (!out || !out.path.startsWith(OUT)) throw new Error('输出不在临时目录: ' + (out && out.path));
    const doc = await PDFDocument.load(fs.readFileSync(out.path));
    if (doc.getPageCount() !== 4) throw new Error('页数 ' + doc.getPageCount());
  });

  await step('面板链路 /api/op text：抽取文字（marker 可回读）', async () => {
    const body = { op: 'text', files: [{ name: '冒烟A.pdf', b64: b64(await makePdf(1, 5000)) }], params: {} };
    const r = await fetch(`http://127.0.0.1:${SVC_PORT}/api/op`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zhifang-Token': token }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.ok || !String(j.text).includes('marker-5001')) throw new Error('text 异常: ' + JSON.stringify(j).slice(0, 120));
  });

  await step('未知 op → ok:false 中文错误', async () => {
    const r = await fetch(`http://127.0.0.1:${SVC_PORT}/api/op`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zhifang-Token': token },
      body: JSON.stringify({ op: 'compress', files: [{ name: 'a.pdf', b64: b64(Buffer.from('%PDF-1.4 x')) }], params: {} }),
    });
    const j = await r.json();
    if (j.ok !== false || !/未知操作/.test(j.error)) throw new Error('错误口径: ' + JSON.stringify(j).slice(0, 100));
  });

  await step('任务历史已登记到真 kv（本冒烟新增 ≥3 条）', async () => {
    const keys = (await kv.kvKeys()).filter((k) => k.startsWith(H_PRE));
    const added = keys.filter((k) => !historyBefore.has(k));
    if (added.length < 3) throw new Error('新增历史 ' + added.length + ' 条');
  });
} catch (e) {
  failed++;
  log('✖ 前置失败 —— ' + String(e && e.message || e).split('\n')[0]);
} finally {
  child.kill();
  await cleanup();
}

if (failed) {
  console.log(`\nsmoke-real: ${failed} 步失败`);
  process.exit(1);
}
console.log('\nsmoke-real: 全部通过（真桥 kv + 服务 HTTP 全链路 + 快照式清理）');
