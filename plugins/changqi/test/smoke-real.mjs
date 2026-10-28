/**
 * 常契真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中。真实 MCP server（无 env 注入，走 anchor→config
 * 自发现真实桥）执行：入册（今天扣费+试用+年付）→ 校验拒绝 → 列表 → 窗口 today
 * 标记 → 推进（kv 落库验证）→ 透视 → 取消（引导）→ 删除确认门 → 清理。
 * 清理为快照式：只删除本次冒烟新建的 changqi.* 键，不动既有数据。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';

const APP_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

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
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); return r.result?.value ?? null; }

// 先确认真实桥可用
const probe = await bridgeDispatch('cap.kv', { action: 'get', key: '__smoke_probe__' });
if (!probe.ok) { console.error('✗ 真实桥不可达（Polaris 未运行？）'); process.exit(1); }
console.log(`[smoke] 真实桥 127.0.0.1:${EP.port} 可达`);

// 快照既有 changqi.* 键（清理时跳过，不动用户数据）
const preKeys = new Set((await kvKeys()).filter((k) => k.startsWith('changqi.')));
console.log(`[smoke] 既有 changqi.* 键 ${preKeys.size} 个（不动）`);

const mcp = spawn(process.execPath, ['mcp/server.js', path.join(process.env.APPDATA || '', 'Polaris')], {
  cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
});
const stderrChunks = [];
mcp.stderr.on('data', (c) => stderrChunks.push(String(c)));

let buf = '';
const pending = new Map();
let nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', (c) => {
  buf += c;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const t = setTimeout(() => reject(new Error('mcp rpc 超时: ' + method)), 60000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const textOf = (m) => m.result.content[0].text;
const extractId = (text) => (text.match(/\[(sub_[0-9a-z]+)\]/) || [])[1] || null;
const dayFromNow = (n) => {
  const d = new Date(Date.now() + n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };
const created = [];

try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // 1. 校验拒绝（负金额）
  const bad = await rpc('tools/call', { name: 'changqi_add', arguments: { name: '坏数据', amount: -3 } });
  record('真实桥参数校验（负金额拒绝）', bad.result.isError && textOf(bad).includes('正数'), '');

  // 2. 入册：今天扣费的视频会员（微信月付）
  const a1 = await rpc('tools/call', { name: 'changqi_add', arguments: { name: '冒烟·视频会员', amount: 25, cycle: 'monthly', anchorDate: 'today', channel: 'wechat', category: '影视音乐' } });
  record('真实桥入册（月付 25，今天扣费）', !a1.result.isError && textOf(a1).includes('月均支出 ¥25.00'), textOf(a1).split('\n')[0]);
  const id1 = extractId(textOf(a1));
  created.push(id1);

  // 3. 入册：试用期 AI 服务（3 天后转正）
  const a2 = await rpc('tools/call', { name: 'changqi_add', arguments: { name: '冒烟·AI 试用', amount: 20, cycle: 'monthly', channel: 'card', category: 'AI 订阅', trialEndsAt: dayFromNow(3) } });
  record('入册试用期（转正预警）', !a2.result.isError && textOf(a2).includes('试用期至'), '');
  const id2 = extractId(textOf(a2));
  created.push(id2);

  // 4. 真实 kv 落库验证（与面板读同一份）
  const s1 = await kvGet(`changqi.sub.${id1}`);
  record('cap.kv 一条一键落库（面板可读同一份）', s1 && s1.name === '冒烟·视频会员' && s1.amount === 25, '');

  // 5. 窗口：今天标记
  const up = await rpc('tools/call', { name: 'changqi_upcoming', arguments: {} });
  record('7 天窗口带【今天】标记', textOf(up).includes('【今天】冒烟·视频会员'), '');

  // 6. 推进：确认已扣 → kv 里 lastConfirmedDate 落库，窗口红条消退
  const adv = await rpc('tools/call', { name: 'changqi_advance', arguments: { id: id1 } });
  record('推进（确认已扣）', !adv.result.isError && textOf(adv).includes('已确认'), '');
  const s1b = await kvGet(`changqi.sub.${id1}`);
  record('lastConfirmedDate 落库（红条消退语义）', s1b && s1b.lastConfirmedDate, String(s1b?.lastConfirmedDate || ''));
  const up2 = await rpc('tools/call', { name: 'changqi_upcoming', arguments: {} });
  record('推进后今天不再报警', !textOf(up2).includes('【今天】冒烟·视频会员'), '');

  // 7. 透视
  const st = await rpc('tools/call', { name: 'changqi_summary', arguments: {} });
  record('透视（月均 45 = 25+20，含试用预警）',
    textOf(st).includes('月均支出 ¥45.00') && textOf(st).includes('试用临近转正'), '');

  // 8. 取消（id2 渠道=card，附银行卡代扣取消路径引导）+ 软取消落库
  const c1 = await rpc('tools/call', { name: 'changqi_cancel', arguments: { id: id2 } });
  record('取消附渠道引导（card→代扣）', !c1.result.isError && textOf(c1).includes('关闭自动续费路径') && textOf(c1).includes('代扣'), '');
  const s2b = await kvGet(`changqi.sub.${id2}`);
  record('软取消落库（cancelled 留档）', s2b && s2b.status === 'cancelled', '');

  // 9. 删除确认门
  const d0 = await rpc('tools/call', { name: 'changqi_delete', arguments: { id: id1, confirm: false } });
  record('删除无确认被拒', d0.result.isError, '');
  const d1 = await rpc('tools/call', { name: 'changqi_delete', arguments: { id: id1, confirm: true } });
  record('确认后删除', !d1.result.isError && textOf(d1).includes('已彻底删除'), '');

  // 10. 引导工具（不改数据）
  const g = await rpc('tools/call', { name: 'changqi_cancel_guide', arguments: { channel: 'apple' } });
  record('Apple 取消引导（App 内取消不彻底提示）', textOf(g).includes('订阅') && textOf(g).includes('不彻底'), '');
} catch (e) {
  record('流程异常', false, e.message);
} finally {
  mcp.kill();
  // 快照式清理：只删本次新建键
  let cleaned = 0;
  const nowKeys = await kvKeys();
  for (const k of nowKeys) {
    if (k.startsWith('changqi.') && !preKeys.has(k)) {
      // eslint-disable-next-line no-await-in-loop
      await kvDel(k);
      cleaned++;
    }
  }
  console.log(`[smoke] 清理本次新建键 ${cleaned} 个（既有 ${preKeys.size} 个未动）`);
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n[smoke] 结果：${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
}
