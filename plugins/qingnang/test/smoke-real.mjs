/**
 * 青囊真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中。真实 MCP server（无 env 注入，走 anchor→config 自发现
 * 真实桥）执行：校验拒绝 → 建档 → 建药+首批 → 立方案 → 今日药单 → 打卡（库存派生
 * 联动）→ 查询（库存/补货/效期）→ 补货 → 过期批次 → 停用 → 确认门 → 连带删清理。
 * 另独立拉起后台服务（node service/qingnang.js），验证 doses 投影 / stocks 快照 /
 * meta 心跳真实落库后收割。
 * 清理为快照式：只删本次冒烟新建的 qingnang.* 键，不动既有数据。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';

const APP_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

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
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
async function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); return r.result?.keys ?? []; }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); return r.result?.value ?? null; }

// ── 桥可用性 ─────────────────────────────────────────────────────────────────
const probe = await bridgeDispatch('cap.kv', { action: 'get', key: '__smoke_probe__' });
if (!probe.ok) { console.error('✗ 真实桥不可达（Polaris 未运行？）'); process.exit(1); }
console.log(`[smoke] 真实桥 127.0.0.1:${EP.port} 可达`);

const preKeys = new Set((await kvKeys()).filter((k) => k.startsWith('qingnang.')));
console.log(`[smoke] 既有 qingnang.* 键 ${preKeys.size} 个（不动）`);

// ── MCP server 进程 ──────────────────────────────────────────────────────────
const mcp = spawn(process.execPath, ['mcp/server.js', path.join(process.env.APPDATA || '', 'Polaris')], {
  cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
});
mcp.stderr.on('data', (c) => { if (String(c).includes('[qingnang:error]')) console.log('[mcp:stderr]', String(c).trim()); });

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
const call = async (name, args) => {
  const m = await rpc('tools/call', { name, arguments: args });
  return { text: m.result?.content?.[0]?.text ?? '', isError: !!m.result?.isError };
};
const okIf = (cond, label) => { if (!cond) throw new Error('冒烟断言失败：' + label); console.log(`  ✓ ${label}`); };

await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
const listed = await rpc('tools/list', {});
okIf(listed.result.tools.length === 6, `tools/list 6 工具（实得 ${listed.result.tools.length}）`);

const RUN_TAG = `冒烟${Date.now().toString(36).slice(-4)}`;
const TODAY = new Date();
const dayKey = (ts) => `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}`;
const today = dayKey(TODAY);
const yearLater = dayKey(new Date(TODAY.getFullYear() + 1, TODAY.getMonth(), TODAY.getDate()));
const pastDay = dayKey(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));

try {
// 1. 校验拒绝：坏频次 / 坏效期 / 无 confirm 删除
{
  const bad1 = await call('qingnang_add', { kind: 'regimen', profileName: '妈妈', medName: '氨氯地平', dose: 1, times: ['08:00'], freq: { type: 'qiming' } });
  okIf(bad1.isError && bad1.text.includes('频次类型'), `坏频次被拒：${bad1.text.slice(0, 40)}`);
  const bad2 = await call('qingnang_add', { kind: 'med', name: 'X药', batchQty: 10, batchExpiry: '2027-13-01' });
  okIf(bad2.isError && bad2.text.includes('效期不合法'), `坏效期被拒`);
  const bad3 = await call('qingnang_delete', { kind: 'med', id: 'whatever', confirm: false });
  okIf(bad3.isError, '无 confirm 删除被拒');
}

// 2. 建档（profile）
{
  const r = await call('qingnang_add', { kind: 'profile', name: RUN_TAG + '妈妈', profileKind: 'human', note: '冒烟测试成员' });
  okIf(!r.isError && r.text.includes('' + RUN_TAG + '妈妈'), `建成员：${r.text.trim().split('\n')[0]}`);
}
const profilesTxt = await call('qingnang_query', { scope: 'profiles' });
const profLine = profilesTxt.text.split('\n').find((l) => l.includes('' + RUN_TAG + '妈妈'));
okIf(!!profLine, '档案列表含' + RUN_TAG + '妈妈');
const profileId = profLine.match(/\[(q[0-9a-f]+)\]/)[1];

// 3. 建药 + 首批 24 片（效期一年后）
{
  const r = await call('qingnang_add', { kind: 'med', name: RUN_TAG + '氨氯地平', spec: '5mg×24片', unit: '片', batchQty: 24, batchExpiry: yearLater });
  okIf(!r.isError && r.text.includes('首批入库 24'), `建药+首批：${r.text.trim().split('\n')[1]}`);
}
const medsTxt = await call('qingnang_query', { scope: 'meds' });
const medLine = medsTxt.text.split('\n').find((l) => l.includes('' + RUN_TAG + '氨氯地平'));
const medId = medLine.match(/\[(q[0-9a-f]+)\]/)[1];

// 4. 立方案：每天 08:00 / 20:00 各 1 片
let regimenId = '';
{
  const r = await call('qingnang_add', {
    kind: 'regimen', profileId, medId, dose: 1, times: ['08:00', '20:00'],
    freq: { type: 'daily' }, startDate: pastDay, note: '冒烟方案',
  });
  okIf(!r.isError && r.text.includes('每天'), `立方案：${r.text.trim().split('\n')[0]}`);
  regimenId = r.text.match(/regId=(q[0-9a-f]+)/)[1];
}

// 5. 今日药单：两次排期 + 应服提示（08:00 已过点 / 视当前时刻）
{
  const r = await call('qingnang_today', {});
  okIf(!r.isError && r.text.includes('' + RUN_TAG + '妈妈') && r.text.includes('' + RUN_TAG + '氨氯地平'), '今日药单含冒烟成员与药品');
  okIf(r.text.includes(`|${today}|`), '今日药单带 occKey（可回填打卡）');
}

// 6. 打卡 taken（早 08:00）→ 库存 24-1=23；重复打卡幂等覆盖
{
  const r1 = await call('qingnang_log', { regId: regimenId, date: today, time: '08:00', status: 'taken' });
  okIf(!r1.isError && r1.text.includes('剩 23片'), `打卡后库存 23：${r1.text.split('\n')[1] || r1.text}`);
  const r2 = await call('qingnang_log', { regId: regimenId, date: today, time: '08:00', status: 'taken' });
  okIf(!r2.isError && r2.text.includes('剩 23片'), '重复打卡幂等（同 occKey 覆盖，不重复扣）');
  // 排期外时刻被拒
  const r3 = await call('qingnang_log', { regId: regimenId, date: today, time: '12:00', status: 'taken' });
  okIf(r3.isError && r3.text.includes('排期'), '排期外时刻被拒');
}

// 7. 补货 25 片 → 48；再打卡晚 20:00 → 47
{
  const r = await call('qingnang_add', { kind: 'batch', medId, qty: 25, expiry: yearLater });
  okIf(!r.isError, '补货入库 25');
  const s1 = await call('qingnang_query', { scope: 'stock' });
  okIf(s1.text.includes('剩 48片'), `补货后 48：${(s1.text.split('\n').find((l) => l.includes('剩 48')) || '').trim()}`);
  const r2 = await call('qingnang_log', { regId: regimenId, date: today, time: '20:00', status: 'taken' });
  okIf(!r2.isError && r2.text.includes('剩 47片'), `晚服打卡后 47`);
}

// 8. 过期批次 → 效期红榜 + 待清理；FEFO 过期批不参与可用量
{
  const r = await call('qingnang_add', { kind: 'batch', medId, qty: 5, expiry: pastDay });
  const batchId = '';
  void batchId;
  okIf(!r.isError, '过期批次入库（模拟囤药过期）');
  const ex = await call('qingnang_query', { scope: 'expiry' });
  okIf(ex.text.includes('🔴已过期') && ex.text.includes('' + RUN_TAG + '氨氯地平'), '效期红榜含过期批次');
  const s = await call('qingnang_query', { scope: 'stock' });
  const line = s.text.split('\n').find((l) => l.includes('' + RUN_TAG + '氨氯地平'));
  okIf(line && line.includes('剩 47片') && line.includes('过期待清理 5片'), `可用量不受过期批污染：${line.trim()}`);
}

// 9. 补货清单口径（方案排量 2/天；实际近14天 2 → 仍回落或实际，均可接受，只要给出预测）
{
  const rf = await call('qingnang_query', { scope: 'refill' });
  okIf(!rf.isError && rf.text.includes('' + RUN_TAG + '氨氯地平') && rf.text.includes('约够'), `补货清单含预测：${(rf.text.split('\n').find((l) => l.includes('' + RUN_TAG + '氨氯地平')) || '').trim()}`);
}

// 10. 依从率
{
  const a = await call('qingnang_query', { scope: 'adherence', days: 7 });
  okIf(!a.isError && a.text.includes('' + RUN_TAG + '妈妈'), `依从率查询：${(a.text.split('\n').find((l) => l.includes('' + RUN_TAG + '妈妈')) || '').trim()}`);
}

// 11. 停用方案 → 今日药单不再出现该排期
{
  const u = await call('qingnang_update', { kind: 'regimen', id: regimenId, patch: { active: false } });
  okIf(!u.isError && u.text.includes('已停'), `停用方案：${u.text.trim()}`);
  const t = await call('qingnang_today', {});
  okIf(!t.text.includes('' + RUN_TAG + '氨氯地平'), '停用后今日药单不再排期');
  // 重新启用（后续撤销打卡测试用）
  await call('qingnang_update', { kind: 'regimen', id: regimenId, patch: { active: true } });
}

// 12. 撤销打卡（status none）→ 库存回升
{
  const r = await call('qingnang_log', { regId: regimenId, date: today, time: '20:00', status: 'none' });
  okIf(!r.isError && r.text.includes('已撤销'), '撤销晚服打卡');
  const s = await call('qingnang_query', { scope: 'stock' });
  const line = s.text.split('\n').find((l) => l.includes('剩 48片'));
  okIf(!!line, `撤销后库存回升 48`);
}

// 12.5 建一个 00:00 时刻的排期（任何时刻运行都已到点，投影断言与运行时间无关）
let nightRegId = '';
{
  const r = await call('qingnang_add', { kind: 'regimen', profileId, medId, dose: 1, times: ['00:00'], freq: { type: 'daily' }, startDate: today, note: '冒烟投影用' });
  okIf(!r.isError, '立 00:00 排期方案');
  nightRegId = r.text.match(/regId=(q[0-9a-f]+)/)[1];
}

// 13. 后台服务独立拉起：doses 投影 / stocks 快照 / meta 心跳 真实落库
console.log('[smoke] 拉起后台服务（独立进程）…');
const svc = spawn(process.execPath, ['service/qingnang.js', '0', path.join(process.env.APPDATA || '', 'Polaris')], {
  cwd: APP_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
});
let svcLog = '';
svc.stderr.on('data', (c) => { svcLog += String(c); });
try {
  const deadline = Date.now() + 60000;
  let doses = null, stocks = null, meta = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    doses = await kvGet('qingnang.doses');
    stocks = await kvGet('qingnang.stocks');
    meta = await kvGet('qingnang.meta');
    if (doses && stocks && meta) break;
  }
  okIf(!!doses && Array.isArray(doses.items), 'qingnang.doses 投影落库');
  okIf(!!stocks && Array.isArray(stocks.refill) && Array.isArray(stocks.expiry), 'qingnang.stocks 快照落库');
  okIf(stocks && stocks.meds && stocks.meds[medId] && stocks.meds[medId].totalUsable === 48, `快照库存=48（实得 ${stocks?.meds?.[medId]?.totalUsable}）`);
  okIf(stocks && stocks.refill.some((r) => r.medId === medId && r.daysLeft != null), '快照含补货预测天数');
  okIf(!!meta && meta.counts && meta.counts.regimens >= 1, `meta 心跳落库（counts=${JSON.stringify(meta?.counts)}）`);
  okIf(!!doses && doses.date === today, `投影日期=今天（${doses?.date}）`);
  okIf(!!doses && doses.items.some((i) => i.occKey.startsWith(nightRegId + '|')), '投影含 00:00 未打卡应服项（now/overdue 均应出现）');
} finally {
  svc.kill();
}

// 14. 删除链：med 有引用拒删 → 方案连带删 → 成员 purge 删 → 键全部消失
{
  const d1 = await call('qingnang_delete', { kind: 'med', id: medId, confirm: true });
  okIf(d1.isError && d1.text.includes('引用'), '有引用的药品拒删');
  const d2 = await call('qingnang_delete', { kind: 'regimen', id: regimenId, confirm: true });
  okIf(!d2.isError && d2.text.includes('打卡记录'), '删方案连带删打卡');
  const d3 = await call('qingnang_delete', { kind: 'profile', id: profileId, confirm: true, purge: true }); // 夜间排期方案仍在，需连带
  okIf(!d3.isError, '删成员');
  // 删药前先清该药的批次（有引用拒删的正确防御）
  const allKeys = await kvKeys();
  const myBatchKeys = allKeys.filter((k) => k.startsWith('qingnang.batch.'));
  for (const k of myBatchKeys) {
    const b = await kvGet(k);
    if (b && b.medId === medId) await call('qingnang_delete', { kind: 'batch', id: b.id, confirm: true });
  }
  const d4 = await call('qingnang_delete', { kind: 'med', id: medId, confirm: true });
  okIf(!d4.isError, '无引用后删药');
  const d5 = await call('qingnang_delete', { kind: 'batch', id: '不存在', confirm: true });
  okIf(d5.isError, '删不存在批次报错（不静默成功）');
}

} finally {
  // ── 清理（快照式：只删本次新建键；中断也执行）──────────────────────────────
  try {
    const postKeys = (await kvKeys()).filter((k) => k.startsWith('qingnang.') && !preKeys.has(k));
    for (const k of postKeys) await kvDel(k);
    console.log(`[smoke] 清理本次新建键 ${postKeys.length} 个`);
  } catch (e) {
    console.error('[smoke] 清理失败：', e.message);
  }
  mcp.kill();
}
console.log('\n✅ 冒烟全链路通过（MCP 6 工具 + 服务投影/快照/心跳 + 幂等/确认门/连带删）');
process.exit(0);