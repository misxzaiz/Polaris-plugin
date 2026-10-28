/**
 * 启幕真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中。真实 MCP server（anchor→config 自发现）执行：
 * guide → build（全版式 deck 落盘临时导出目录）→ 直读 kv 验证登记 →
 * recent → reveal（opt-in --reveal 才真弹窗）→ forget → 清理（删登记+删冒烟文件）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';


/** Windows 文件锁韧性删除：unlink 可能因瞬时句柄进入 pending-delete，重试至消失 */
async function rmWait(p, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try { fs.rmSync(p, { force: true }); } catch (_) { /* 忽略，靠存在性判断 */ }
    if (!fs.existsSync(p)) return true;
    await new Promise((r) => setTimeout(r, 700));
  }
  return !fs.existsSync(p);
}

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DO_REVEAL = process.argv.includes('--reveal');

function loadEndpoint() {
  const anchor = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json'), 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { port: cfg.web.port, token: cfg.web.token || '' };
}
const EP = loadEndpoint();
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

function bridgeDispatch(target, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;
    const req = http.request({ hostname: '127.0.0.1', port: EP.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: 30000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
async function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); return r.result?.keys ?? []; }
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); return r.result?.value ?? null; }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }

const probe = await bridgeDispatch('cap.kv', { action: 'get', key: '__smoke_probe__' });
if (!probe.ok) { console.error('✗ 真实桥不可达（Polaris 未运行？）'); process.exit(1); }
console.log(`[smoke] 真实桥 127.0.0.1:${EP.port} 可达`);

// 快照既有 qimu 登记（只新建键，结束后按 id 清理）
const snapshot = new Map();
for (const k of (await kvKeys()).filter((k) => k.startsWith('qimu.'))) {
  snapshot.set(k, await kvGet(k));
}
console.log(`[smoke] 既有 qimu.* ${snapshot.size} 键已快照`);

const mcp = spawn(process.execPath, ['mcp/server.js', path.join(process.env.APPDATA || '', 'Polaris')], {
  cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
});
const stderr = [];
mcp.stderr.on('data', (c) => stderr.push(String(c)));

let buf = '';
const pending = new Map();
let nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', (c) => {
  buf += c;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const t = setTimeout(() => reject(new Error('rpc 超时: ' + method)), 60000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = async (name, args) => {
  const r = await rpc('tools/call', { name, arguments: args });
  return { isError: !!r.result?.isError, text: String(r.result?.content?.[0]?.text ?? '') };
};

// 冒烟导出目录：系统临时目录下专用文件夹（不污染桌面）
const smokeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qimu-smoke-'));

// 把导出目录临时指到冒烟临时目录（不污染桌面）；结束恢复原 settings
const origSettings = (await bridgeDispatch('cap.kv', { action: 'get', key: 'qimu.settings' })).result?.value ?? null;
await bridgeDispatch('cap.kv', { action: 'set', key: 'qimu.settings', value: { ...(origSettings && typeof origSettings === 'object' ? origSettings : {}), schemaVersion: 1, exportDir: smokeDir } });

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${String(extra).slice(0, 300)}` : ''}`); }
};

try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const guide = await call('ppt_guide', {});
  check('ppt_guide', !guide.isError && guide.text.includes('ppt_build'));

  // 超限拦截（触桥前）
  const bad = await call('ppt_build', { deck: { title: '超限', slides: [{ type: 'bullets', title: 't', bullets: Array.from({ length: 9 }, (_, i) => `点${i}`) }] } });
  check('容量护栏拦截', bad.isError && bad.text.includes('拆'), bad.text);

  // 完整构建（冒烟 deck 落盘 smokeDir：先经 ppt_forget/recent 无法改目录——直接构造 settings？不可。
  // ppt_build 无 dir 参数（安全边界：目录来自 settings/默认）。这里用环境变量 POLARIS_HOME
  // 不可行 → 冒烟后删除桌面产物文件本身。为避免污染，deck 标题用 __smoke 标记便于识别。
  const build = await call('ppt_build', {
    deck: {
      title: '__smoke启幕冒烟__',
      subtitle: '真桥端到端',
      author: 'smoke',
      theme: 'sky',
      slides: [
        { type: 'section', title: '部分一' },
        { type: 'bullets', title: '要点页', bullets: ['第一条', { h: '小标题', d: '说明文字' }] },
        { type: 'chart', title: '图表', chart: { kind: 'pie', labels: ['甲', '乙'], series: [{ name: '占比', values: [60, 40] }] } },
        { type: 'table', title: '表格', head: ['列A', '列B'], rows: [['1', '2']] },
        { type: 'two', title: '双栏', left: { h: '左', points: ['a'] }, right: { h: '右', points: ['b'] } },
        { type: 'quote', text: '冒烟引言', author: 'smoke' },
      ],
    },
  });
  check('ppt_build 落盘', !build.isError && build.text.includes('.pptx') && build.text.includes('页'), build.text);
  const filePath = (build.text.match(/^(✅ 已生成：)(.+\.pptx)$/m) || [])[2] || (build.text.match(/([A-Za-z]:\\[^\s]+\.pptx)/) || [])[1];
  check('返回文件路径', !!filePath && fs.existsSync(filePath), build.text);
  if (filePath && fs.existsSync(filePath)) {
    const size = fs.statSync(filePath).size;
    check('文件大小合理', size > 30000, `${size}B`);
  }

  const id1 = (build.text.match(/id=([a-z0-9]+)/) || [])[1];

  // 直读 kv 验证登记（面板/最近同源）
  if (id1) {
    const rec = await kvGet(`qimu.deck.${id1}`);
    check('cap.kv 登记存在', rec && rec.title === '__smoke启幕冒烟__' && rec.slideCount === 8, JSON.stringify(rec));
  }

  const recent = await call('ppt_recent', {});
  check('ppt_recent 含新作品', !recent.isError && recent.text.includes('__smoke启幕冒烟__'), recent.text);

  // reveal：默认只验证存在性路径分支（不弹窗）；--reveal 才真弹
  if (DO_REVEAL && filePath) {
    const rev = await call('ppt_reveal', { path: filePath });
    check('ppt_reveal', !rev.isError, rev.text);
  } else {
    const revMissing = await call('ppt_reveal', { path: path.join(os.tmpdir(), 'qimu-not-exist.pptx') });
    check('ppt_reveal 文件不存在 → isError', revMissing.isError, revMissing.text);
  }

  // forget
  if (id1) {
    const forget = await call('ppt_forget', { id: id1, confirm: true });
    check('ppt_forget', !forget.isError && forget.text.includes('未删除'), forget.text);
    check('登记已删', (await kvGet(`qimu.deck.${id1}`)) === null);
  }

  // 清理：冒烟文件 + 本次新建登记键（快照里有的不碰）
  if (filePath && fs.existsSync(filePath)) {
    const gone = await rmWait(filePath);
    if (!gone) console.error('  (警告：冒烟文件删除未生效)', filePath);
  }
  const keys = (await kvKeys()).filter((k) => k.startsWith('qimu.'));
  let cleaned = 0;
  for (const k of keys) {
    if (snapshot.has(k)) continue;
    const v = await kvGet(k);
    if (v && typeof v === 'object' && typeof v.title === 'string' && v.title.includes('__smoke')) {
      await kvDel(k);
      cleaned++;
    }
  }
  // 恢复原 settings 并清临时目录
  await bridgeDispatch('cap.kv', { action: 'set', key: 'qimu.settings', value: origSettings });
  fs.rmSync(smokeDir, { recursive: true, force: true });
  console.log(`[smoke] 清理 ${cleaned} 个冒烟登记 + 桌面冒烟文件（快照 ${snapshot.size} 键未触碰）`);
} catch (e) {
  failed++;
  console.error('✗ 冒烟异常：', e.message);
} finally {
  mcp.kill();
}

if (failed) {
  console.error(`\n✗ 冒烟 ${failed} 项失败\nMCP stderr:\n${stderr.join('')}`);
  process.exit(1);
}
console.log('\n✓ 真实环境冒烟全绿');
