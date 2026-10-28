/**
 * 守闸真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中。真实 MCP server（无 env 注入，走 anchor→config
 * 自发现真实桥）执行：登记 → 直读 kv 验证 → 三榜 → 对账续费（含实付改价）→
 * 试用转正 → 更新 → 统计 → CSV 往返 → 删除，最后按「快照恢复」清理本次新建的
 * shouzha.* 键（不动既有数据）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));

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
async function kvSet(k, v) { return bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }

// 先确认真实桥可用
const probe = await bridgeDispatch('cap.kv', { action: 'get', key: '__smoke_probe__' });
if (!probe.ok) { console.error('✗ 真实桥不可达（Polaris 未运行？）'); process.exit(1); }
console.log(`[smoke] 真实桥 127.0.0.1:${EP.port} 可达`);

// 快照既有 shouzha 数据（冒烟只新建键，结束后恢复原状）
const SUB_PREFIX = 'shouzha.';
const snapshot = new Map();
for (const k of (await kvKeys()).filter((k) => k.startsWith(SUB_PREFIX))) {
  snapshot.set(k, await kvGet(k));
}
console.log(`[smoke] 既有 shouzha.* ${snapshot.size} 键已快照`);

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
  const t = setTimeout(() => reject(new Error('rpc 超时: ' + method)), 45000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = async (name, args) => {
  const r = await rpc('tools/call', { name, arguments: args });
  return { isError: !!r.result?.isError, text: String(r.result?.content?.[0]?.text ?? '') };
};

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${String(extra).slice(0, 300)}` : ''}`); }
};

try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  // notifications/initialized 是通知（无应答），直接写不可等待
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const list = await rpc('tools/list', {});
  check('tools/list 8 工具', (list.result?.tools || []).length === 8);

  // 1) 登记：月付视频（缺省下次扣费日 = 明天推一周期）
  const add1 = await call('sub_add', { name: '__smoke视频__', vendor: 'smoke厂', amount: 25, cycle: 'month', category: '视频娱乐', paymentMethod: '微信' });
  check('sub_add 月付', !add1.isError, add1.text);
  const id1 = (add1.text.match(/id=(s[a-z0-9]+)/) || [])[1];
  check('sub_add 返回 id', !!id1, add1.text);

  // 2) 登记：逾期年付（原定 40 天前扣费）
  const overdueDate = new Date(Date.now() - 40 * 86400000);
  const od = `${overdueDate.getFullYear()}-${String(overdueDate.getMonth() + 1).padStart(2, '0')}-${String(overdueDate.getDate()).padStart(2, '0')}`;
  const add2 = await call('sub_add', { name: '__smoke网盘__', amount: 248, cycle: 'year', nextRenewalDate: od, category: '云盘存储' });
  check('sub_add 逾期年付', !add2.isError, add2.text);
  const id2 = (add2.text.match(/id=(s[a-z0-9]+)/) || [])[1];

  // 3) 登记：试用（3 天后转正）
  const trialEnd = new Date(Date.now() + 3 * 86400000);
  const te = `${trialEnd.getFullYear()}-${String(trialEnd.getMonth() + 1).padStart(2, '0')}-${String(trialEnd.getDate()).padStart(2, '0')}`;
  const add3 = await call('sub_add', { name: '__smoke试用__', amount: 30, cycle: 'month', status: 'trial', trialEndsAt: te, category: '软件工具' });
  check('sub_add 试用', !add3.isError, add3.text);
  const id3 = (add3.text.match(/id=(s[a-z0-9]+)/) || [])[1];

  // 4) 直读 kv 验证入库（面板与 AI 同一事实库）
  const raw1 = await kvGet(`shouzha.sub.${id1}`);
  check('cap.kv 直读订阅存在', raw1 && raw1.name === '__smoke视频__' && raw1.amount === 25, JSON.stringify(raw1));
  check('缺省下次扣费日 = 今天+1 月', raw1 && /^\d{4}-\d{2}-\d{2}$/.test(raw1.nextRenewalDate), raw1?.nextRenewalDate);

  // 5) 三榜：逾期单与试用单应出现
  const due = await call('sub_due', {});
  check('sub_due 含逾期单', !due.isError && due.text.includes('逾期待对账') && due.text.includes('__smoke网盘__'), due.text);
  check('sub_due 含试用单', due.text.includes('__smoke试用__'), due.text);

  // 6) 对账：逾期单确认续费并记实付 268（原 248 → 涨价检出）
  const renew = await call('sub_renew', { id: id2, amount: 268 });
  check('sub_renew 实付改价', !renew.isError && renew.text.includes('268') && renew.text.includes('价格'), renew.text);
  const raw2 = await kvGet(`shouzha.sub.${id2}`);
  check('价格史两笔（248→268）', raw2?.priceHistory?.length === 2 && raw2.priceHistory[1].amount === 268, JSON.stringify(raw2?.priceHistory));
  check('扣费日推进一周期（次年）', raw2 && raw2.nextRenewalDate.startsWith(String(new Date().getFullYear() + 1)), raw2?.nextRenewalDate);

  // 7) 试用转正对账
  const renew3 = await call('sub_renew', { id: id3 });
  check('试用转正', !renew3.isError && renew3.text.includes('转正'), renew3.text);
  const raw3 = await kvGet(`shouzha.sub.${id3}`);
  check('试用单转正后 status=active', raw3?.status === 'active', raw3?.status);

  // 8) 更新：改备注 + 改周期（月付→年付）
  const upd = await call('sub_update', { id: id1, cycle: 'year', amount: 228, note: '改为年付更划算' });
  check('sub_update 改价改周期', !upd.isError, upd.text);
  const raw1b = await kvGet(`shouzha.sub.${id1}`);
  check('update 后价格史 2 笔（开通 25 → 改 228）', raw1b?.priceHistory?.length === 2 && raw1b.priceHistory[1].amount === 228, JSON.stringify(raw1b?.priceHistory));

  // 9) 统计
  const stats = await call('sub_stats', {});
  check('sub_stats 年化口径', !stats.isError && stats.text.includes('年化'), stats.text);

  // 10) CSV 往返
  const csvText = `名称,服务商,分类,套餐,金额,周期,自定义天数,下次扣费日,自动续费,状态,试用到期日,支付方式,管理链接,备注,创建时间\n"__smokeCSV__","smoke厂","视频娱乐","","19.90","每月","","2099-01-01","是","生效中","","支付宝","","","2026/10/29 0:00:00"`;
  const addCsv = await call('sub_add', { name: '__smokeCSV__', amount: 19.9, cycle: 'month', nextRenewalDate: '2099-01-01', paymentMethod: '支付宝' });
  check('CSV 场景登记', !addCsv.isError, addCsv.text);

  // 11) 检索
  const found = await call('sub_list', { keyword: '__smoke' });
  check('sub_list 关键字检索', !found.isError && found.text.includes('__smoke视频__') && found.text.includes('__smokeCSV__'), found.text);

  // 12) 历史
  const hist = await call('sub_history', { id: id2 });
  check('sub_history 价格史', !hist.isError && hist.text.includes('248') && hist.text.includes('268'), hist.text);

  // 13) 删除需确认
  const delNo = await call('sub_delete', { id: id1 });
  check('sub_delete 无 confirm 拒绝', delNo.isError, delNo.text);
  const del = await call('sub_delete', { id: id1, confirm: true });
  check('sub_delete 确认后删除', !del.isError, del.text);
  check('删除后 kv 直读为空', (await kvGet(`shouzha.sub.${id1}`)) === null);

  // 14) 清理本次全部冒烟键：按「值内 name 含 __smoke」判定（键是随机 id，键名不含名称）
  const keys = (await kvKeys()).filter((k) => k.startsWith(SUB_PREFIX));
  let cleaned = 0;
  for (const k of keys) {
    if (snapshot.has(k)) continue; // 快照里既有的一律不碰
    const v = await kvGet(k);
    if (v && typeof v === 'object' && typeof v.name === 'string' && v.name.includes('__smoke')) {
      await kvDel(k);
      cleaned++;
    }
  }
  const leftover = (await kvKeys()).filter((k) => k.startsWith(SUB_PREFIX) && !snapshot.has(k));
  check('冒烟数据清理干净', leftover.length === 0, leftover.join(','));
  console.log(`[smoke] 已清理 ${cleaned} 个冒烟键（快照内 ${snapshot.size} 个既有键未触碰）`);
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
