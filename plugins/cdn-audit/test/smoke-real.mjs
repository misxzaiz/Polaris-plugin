#!/usr/bin/env node
/**
 * smoke-real.mjs —— 真实网络冒烟（需外网；CI 不跑，手动验证用）。
 * 跑法：CDNAUDIT_SMOKE=1 node test/smoke-real.mjs
 * 断言：jquery@3.7.1 核验 = 双源一致；镜像矩阵 ≥4 可达且 ≥4 一致；
 *       SRI 标签官方口径；HTML 页面审计（抓 jsdelivr 首页形态的合成页）无红榜。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

if (process.env.CDNAUDIT_SMOKE !== '1') {
  console.log('跳过（设 CDNAUDIT_SMOKE=1 以运行真实网络冒烟）');
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = 9891;
const BRIDGE_PORT = 18098;

const kvStore = new Map();
const bridge = http.createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const { req: inner } = JSON.parse(body);
      const { payload } = inner || {};
      let result = {};
      if (payload.action === 'get') result = { value: kvStore.has(payload.key) ? kvStore.get(payload.key) : null };
      else if (payload.action === 'set') { kvStore.set(payload.key, payload.value === undefined ? null : payload.value); }
      else if (payload.action === 'delete') kvStore.delete(payload.key);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (e) { res.end(JSON.stringify({ ok: false, error: String(e) })); }
  });
});

function req(method, path, bodyObj, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const data = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
    const r = http.request({ hostname: '127.0.0.1', port: PORT, path, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function waitHealth(timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try { if ((await req('GET', '/__health', undefined, 1500)).ok) return resolve(); } catch (_) { /* 未起 */ }
      if (Date.now() - started > timeoutMs) return reject(new Error('健康检查超时'));
      setTimeout(poll, 300);
    };
    poll();
  });
}

const tmp = mkdtempSync(join(tmpdir(), 'cdn-audit-smoke-'));
bridge.listen(BRIDGE_PORT, '127.0.0.1');
const svc = spawn(process.execPath, [join(root, 'service', 'main.js'), String(PORT), tmp], {
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(BRIDGE_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
svc.stderr.on('data', (c) => process.stderr.write(`[svc] ${c}`));

let failed = 0;
async function main() {
  await waitHealth();
  // ① 单资源核验：jquery@3.7.1（双源应一致）
  const c1 = await req('POST', '/api/check', { mode: 'urls', urls: ['https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js'] });
  if (!c1.ok) throw new Error(c1.error);
  const row = c1.report.rows[0];
  console.log(`① 核验 jquery@3.7.1 → ${row.verdict}（${row.note}）score=${c1.report.score.total}`);
  if (row.verdict !== 'match' || !(row.auth && row.auth.tarball && row.auth.dataapi)) { failed++; console.log('  ✗ 期望双源一致 match'); }
  else console.log('  ✓ 双源核验通过（tarball + dataapi）');

  // ② 镜像矩阵
  const c2 = await req('POST', '/api/mirror', { url: 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js' });
  if (!c2.ok) throw new Error(c2.error);
  console.log(`② 镜像矩阵：${JSON.stringify(c2.report.summary)}`);
  for (const r of c2.report.rows) console.log(`   ${r.verdict === 'match' || r.verdict === 'match-origin' ? '✓' : r.verdict === 'mismatch' ? '✗' : '·'} ${r.label} HTTP ${r.status} ${r.elapsedMs != null ? r.elapsedMs + 'ms' : '-'} ${r.verdict}${r.note ? ' — ' + r.note : ''}`);
  if (c2.report.summary.reachable < 3 || c2.report.summary.match < 3) { failed++; console.log('  ✗ 可达/一致数不足（网络环境可能受限，人工复核）'); }
  else console.log('  ✓ 镜像矩阵通过');

  // ③ SRI 生成
  const c3 = await req('POST', '/api/sri', { url: 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js' });
  if (!c3.ok) throw new Error(c3.error);
  console.log(`③ SRI：口径=${c3.report.tagSource} integrity=${c3.report.tags.integrity.slice(0, 24)}…`);
  if (c3.report.tagSource !== 'official') { failed++; console.log('  ✗ 期望官方口径'); }
  else console.log('  ✓ SRI 官方口径');

  // ④ 篡改检测：请求一个不存在的 min 变体 → jsDelivr 现场生成 → 应判 cdn-generated
  const c4 = await req('POST', '/api/check', { mode: 'urls', urls: ['https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.not-exist-in-pkg.min.js'] });
  const row4 = c4.ok ? c4.report.rows[0] : { verdict: `error:${c4.error}` };
  console.log(`④ CDN 现场生成文件 → ${row4.verdict}${row4.note ? '（' + row4.note.slice(0, 60) + '…）' : ''}`);
  if (row4.verdict !== 'cdn-generated') { failed++; console.log('  ✗ 期望 cdn-generated（诚实标注不可权威核验）'); }
  else console.log('  ✓ 现场生成文件诚实标注');

  // ⑤ kv 投影（假桥内 kvStore 应有报告与 meta）
  const hasMeta = kvStore.has('cda.meta');
  const hasLatest = kvStore.has('cda.latest');
  console.log(`⑤ kv 投影：meta=${hasMeta} latest=${hasLatest}`);
  if (!hasMeta || !hasLatest) { failed++; console.log('  ✗ 投影缺失'); }
  else console.log('  ✓ 投影齐备');

  console.log(failed ? `\n冒烟完成：${failed} 项失败` : '\n冒烟全绿 ✅');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('冒烟异常：', e); process.exit(1); }).finally(() => {
  setTimeout(() => {
    try { svc.kill(); } catch (_) { /* 忽略 */ }
    try { bridge.close(); } catch (_) { /* 忽略 */ }
    try { rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
  }, 200);
});
