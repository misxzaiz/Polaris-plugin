/**
 * service-verify.mjs —— qr-desk HTTP 服务真桥验证（随机测试端口 + 测试 token 钩子）
 * 断言：health / 401 / generate 落盘+永不覆盖 / decode base64+路径 / 400 可读错误 /
 *       inspect / batch job 轮询闭环 / job 未知 400 / selftest / 超大请求体 400。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 39865; // 测试专用端口（插件正式端口 9865 之外）
const TOKEN = 'test-token-qr-desk';

const child = spawn('node', [path.join(here, '../service/main.js'), String(PORT), ''], {
  env: { ...process.env, QR_DESK_TEST_TOKEN: TOKEN },
  stdio: ['ignore', 'ignore', 'pipe'],
});
child.stderr.on('data', (c) => process.stderr.write(`[svc-stderr] ${c}`));

async function waitHealth(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/__health`);
      if (r.status === 200) return await r.json();
    } catch (_) { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('服务 5s 内未就绪');
}

async function api(pathname, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (!opts.noToken) headers['x-qr-desk-token'] = opts.badToken ? 'wrong' : TOKEN;
  const r = await fetch(`http://127.0.0.1:${PORT}${pathname}`, {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body || {}),
  });
  let json = null;
  try { json = await r.json(); } catch (_) { /* leave null */ }
  return { status: r.status, json };
}

const tmp = mkdtempSync(path.join(tmpdir(), 'qr-desk-svc-'));
let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.error(`✗ ${name} ${detail}`); }
}

try {
  const health = await waitHealth();
  check('health 200 + version', health.ok === true && typeof health.version === 'string');

  // 401
  const noAuth = await api('/api/inspect', { text: 'hi' }, { noToken: true });
  check('无 token → 401', noAuth.status === 401);
  const badAuth = await api('/api/inspect', { text: 'hi' }, { badToken: true });
  check('错 token → 401', badAuth.status === 401);

  // generate：落盘 + 永不覆盖
  const outDir = path.join(tmp, 'out');
  const g1 = await api('/api/generate', {
    template: { type: 'url', fields: { url: 'https://example.com/svc-verify' } },
    save: { outDir, fileName: 'svc' },
  });
  check('generate ok + savedTo', g1.status === 200 && g1.json.ok && g1.json.savedTo?.[0] === path.join(outDir, 'svc.png'), JSON.stringify(g1.json).slice(0, 200));
  const g2 = await api('/api/generate', {
    template: { type: 'url', fields: { url: 'https://example.com/svc-verify' } },
    save: { outDir, fileName: 'svc' },
  });
  check('同名落盘 -2 递增', g2.json.savedTo?.[0] === path.join(outDir, 'svc-2.png'), String(g2.json.savedTo));
  check('PNG 字节存在', (g1.json.pngBase64 || '').length > 100);

  // decode：base64 与 imagePath 双通道
  const d1 = await api('/api/decode', { imageBase64: g1.json.pngBase64 });
  check('decode base64 round-trip', d1.json.found === true && d1.json.payload === 'https://example.com/svc-verify', JSON.stringify(d1.json).slice(0, 200));
  check('decode 类型识别 url', d1.json.inspected?.type === 'url');
  const d2 = await api('/api/decode', { imagePath: path.join(outDir, 'svc.png') });
  check('decode imagePath 通道', d2.json.found === true && d2.json.payload === 'https://example.com/svc-verify');

  // decode 错误：非图像魔数
  const badImg = await api('/api/decode', { imageBase64: Buffer.from('GIF89a-not-really').toString('base64') });
  check('decode 非图像 → 400 可读', badImg.status === 400 && /PNG \/ JPEG/.test(badImg.json.error || ''), JSON.stringify(badImg.json));

  // decode：无码图
  const { PNG } = await import('pngjs');
  const blank = new PNG({ width: 64, height: 64 });
  const blankBuf = PNG.sync.write(blank);
  const noQr = await api('/api/decode', { imageBase64: blankBuf.toString('base64') });
  check('无码图 found:false + 引导信息', noQr.status === 200 && noQr.json.found === false && (noQr.json.message || '').includes('未找到'), JSON.stringify(noQr.json).slice(0, 120));

  // inspect：wifi + otpauth
  const w = await api('/api/inspect', { text: 'WIFI:T:WPA;S:a\\;b;P:p\\;w;;' });
  check('inspect wifi 转义还原', w.json.fields?.ssid === 'a;b' && w.json.fields?.password === 'p;w', JSON.stringify(w.json.fields));
  const o = await api('/api/inspect', { text: 'otpauth://totp/GH:me?secret=JBSWY3DPEHPK3PXP' });
  check('inspect otpauth 实时码', /^\d{6}$/.test(o.json.preview?.code || ''), JSON.stringify(o.json.preview));

  // batch：CSV → job 轮询 → 文件可解码回读
  const batchDir = path.join(tmp, 'batch');
  const csv = ['ssid,pass', 'net1,pw1', 'net2,pw2', 'net1,pw3'].join('\n');
  const b = await api('/api/batch', {
    csv,
    template: { type: 'wifi', fields: { ssid: '{ssid}', password: '{pass}', encryption: 'WPA' } },
    outDir: batchDir, fileBase: 'w', nameCol: 'ssid',
  });
  check('batch 返回 jobId + total', b.json.ok && b.json.total === 3, JSON.stringify(b.json).slice(0, 160));
  let job = null;
  for (let i = 0; i < 100; i++) {
    const jr = await fetch(`http://127.0.0.1:${PORT}/api/job?id=${encodeURIComponent(b.json.jobId)}`, { headers: { 'x-qr-desk-token': TOKEN } });
    job = (await jr.json()).job;
    if (job.status !== 'running') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  check('batch job done 3/3', job && job.status === 'done' && job.done === 3, JSON.stringify(job).slice(0, 200));
  const written = readdirSync(batchDir);
  check('batch 文件落盘 3 个（net1/net2/net1-2）', written.length === 3 && written.includes('w-net1.png') && written.includes('w-net1-2.png'), written.join(','));

  // job 未知 id → 400
  const j404 = await fetch(`http://127.0.0.1:${PORT}/api/job?id=nope`, { headers: { 'x-qr-desk-token': TOKEN } });
  check('job 未知 id → 400', j404.status === 400);

  // batch：outDir 相对路径 → 400
  const bRel = await api('/api/batch', { rows: [{ a: 1 }], template: { type: 'text', fields: { text: '{a}' } }, outDir: 'relative/dir' });
  check('batch 相对路径 → 400', bRel.status === 400 && /绝对路径/.test(bRel.json.error || ''));

  // selftest
  const st = await api('/api/selftest', {});
  check('selftest 12/12', st.json.pass === 12 && st.json.fail === 0, JSON.stringify(st.json.items?.filter((i) => !i.ok)));

  // 超大请求体 → 400（不挂连接）
  const big = JSON.stringify({ text: 'x'.repeat(17 * 1024 * 1024) });
  const huge = await api('/api/inspect', big);
  check('17MB 请求体 → 400 超限', huge.status === 400 && /超限/.test(huge.json.error || ''), JSON.stringify(huge.json));

  // 非法 JSON → 400
  const badJson = await api('/api/inspect', '{not json');
  check('非法 JSON → 400', badJson.status === 400 && /JSON/.test(badJson.json.error || ''));
} catch (e) {
  failures++;
  console.error('✗ 异常:', e);
} finally {
  child.kill();
  await new Promise((r) => setTimeout(r, 200));
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failures === 0 ? 'service-verify 全部通过' : `service-verify 失败 ${failures} 项`);
process.exit(failures === 0 ? 0 : 1);
