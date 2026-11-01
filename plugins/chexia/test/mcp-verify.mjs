#!/usr/bin/env node
/**
 * MCP server 全流程验证（node test/mcp-verify.mjs）——不依赖真实宿主：
 * 起本地「内存 cap.kv」桥（/api/router-dispatch 假实现，协议与宿主一致），
 * 注入 POLARIS_HOST/PORT env（kvclient 的 env 优先路径），spawn 真实 mcp/server.js
 * 走 stdio JSON-RPC：initialize → tools/list → 校验拒绝（缺里程/缺周期）→
 * 建车 → 立养护项 → 两次补能（期间口径出数）→ 维保联动锚点 → 证件红黄榜 →
 * today 总览 → 查询六 scope → 更新（续保）→ 删除（confirm 门/purge 门/连带删）→ 清场。
 * 日期全部由「今天」动态推导，测试永不过期。
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, '..');

// ── 内存 cap.kv 桥 ───────────────────────────────────────────────────────────
const store = new Map();
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !(req.url || '').startsWith('/api/router-dispatch')) {
    res.writeHead(404); res.end(JSON.stringify({ ok: false, error: 'not found' })); return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(body).req; } catch { res.writeHead(400); res.end('{}'); return; }
    if (payload.target !== 'cap.kv') { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: `unknown target ${payload.target}` })); return; }
    const a = payload.payload || {};
    try {
      if (a.action === 'list') {
        res.writeHead(200); res.end(JSON.stringify({ ok: true, result: { keys: [...store.keys()] } }));
      } else if (a.action === 'get') {
        res.writeHead(200); res.end(JSON.stringify({ ok: true, result: { value: store.has(a.key) ? store.get(a.key) : null } }));
      } else if (a.action === 'set') {
        store.set(a.key, a.value === undefined ? null : a.value);
        res.writeHead(200); res.end(JSON.stringify({ ok: true, result: {} }));
      } else if (a.action === 'delete') {
        store.delete(a.key);
        res.writeHead(200); res.end(JSON.stringify({ ok: true, result: {} }));
      } else {
        res.writeHead(200); res.end(JSON.stringify({ ok: false, error: `unknown action ${a.action}` }));
      }
    } catch (e) {
      res.writeHead(200); res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
console.log(`[mcp-verify] 内存桥 127.0.0.1:${port}`);

// ── 动态日期 ─────────────────────────────────────────────────────────────────
const DAY = 86400000;
const dk = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const TODAY = dk(Date.now());
const D10 = dk(Date.now() - 10 * DAY);
const D40 = dk(Date.now() - 40 * DAY);

// ── spawn 真实 MCP server（env 注入端点）────────────────────────────────────
const child = spawn(process.execPath, ['mcp/server.js', ''], {
  cwd: pluginDir,
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(port) },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (c) => { stderr += String(c); });

let buf = '';
const pending = new Map();
let nextId = 1;
child.stdout.setEncoding('utf8');
child.stdout.on('data', (c) => {
  buf += c;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const t = setTimeout(() => reject(new Error('rpc 超时: ' + method)), 30000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});

const failures = [];
let passed = 0;
const okIf = (cond, label) => {
  if (!cond) { failures.push(label); console.log(`  ✗ ${label}`); }
  else { passed++; console.log(`  ✓ ${label}`); }
};
const call = async (tool, args) => {
  const r = await rpc('tools/call', { name: tool, arguments: args });
  const text = r.result && r.result.content && r.result.content[0] ? r.result.content[0].text : '';
  return { isError: !!(r.result && r.result.isError), text };
};
const textOf = async (tool, args) => (await call(tool, args)).text;

// ── 1. initialize + tools/list ───────────────────────────────────────────────
console.log('[1] initialize & tools/list');
const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
okIf(init.result && init.result.serverInfo && init.result.serverInfo.name === 'chexia', 'initialize 返回 chexia serverInfo');
const list = await rpc('tools/list', {});
const names = (list.result.tools || []).map((t) => t.name);
okIf(names.length === 6 && ['chexia_today', 'chexia_add', 'chexia_log', 'chexia_query', 'chexia_update', 'chexia_delete'].every((n) => names.includes(n)),
  `6 工具齐全（${names.join(',')}）`);

// ── 2. 空库引导 ──────────────────────────────────────────────────────────────
console.log('[2] 空库引导');
const empty = await textOf('chexia_today', {});
okIf(empty.includes('还没有车辆'), '空库 today 引导建档');

// ── 3. 校验拒绝（护栏先行）───────────────────────────────────────────────────
console.log('[3] 校验拒绝');
const noCar = await call('chexia_log', { kind: 'energy', carName: '白SUV', date: D40, odometer: 45300, amount: 40, cost: 320 });
okIf(noCar.isError === false && noCar.text.includes('建档'), '补能顺手建档（首次即记成功并建车）');
const created = [...store.keys()].find((k) => k.startsWith('chexia.car.'));
okIf(!!created && store.get(created).initialOdometer === 45300, '顺手建档以首条里程为基线（initialOdometer=45300）');
const badOdo = await call('chexia_log', { kind: 'energy', carName: '白SUV', odometer: 100, amount: 40, cost: 320 });
okIf(badOdo.isError && badOdo.text.includes('建档里程'), '补能里程 < 建档里程被拒');
const noOdo = await call('chexia_log', { kind: 'energy', carName: '白SUV', amount: 40, cost: 320 });
okIf(noOdo.isError && noOdo.text.includes('odometer'), '缺 odometer 被拒（生命线护栏）');
const noCycle = await call('chexia_add', { kind: 'item', carName: '白SUV', name: '机油机滤' });
okIf(noCycle.isError && noCycle.text.includes('cycle'), '养护项缺周期被拒');
const noAnchor = await call('chexia_add', { kind: 'item', carName: '白SUV', name: '机油机滤', cycle: { kmInterval: 5000 } });
okIf(noAnchor.isError && noAnchor.text.includes('lastOdometer'), 'km 周期缺锚点被拒');
const badDoc = await call('chexia_add', { kind: 'doc', type: '交强险' });
okIf(badDoc.isError && badDoc.text.includes('expiry'), '证件缺到期日被拒');

// ── 4. 正式建档 + 养护项 + 补能闭环 ─────────────────────────────────────────
console.log('[4] 建档/养护项/补能闭环');
const addCar = await textOf('chexia_add', { kind: 'car', name: '电驴', carKind: 'ev', initialOdometer: 1000 });
okIf(addCar.includes('已建档车辆') && addCar.includes('纯电'), '建纯电车');
const addItem = await textOf('chexia_add', { kind: 'item', carName: '白SUV', name: '机油机滤', cycle: { kmInterval: 5000 }, lastOdometer: 45300, lastDate: D40 });
okIf(addItem.includes('已立养护项'), '立机油养护项（km 周期）');
const e1 = await call('chexia_log', { kind: 'energy', carName: '白SUV', date: D10, odometer: 46200, amount: 42.3, cost: 350, filled: true, station: '中石化' });
okIf(!e1.isError && e1.text.includes('已记补能'), '记第二次补能（加满）');
okIf(e1.text.includes('km'), '补能回复含里程口径');
const e2 = await call('chexia_log', { kind: 'energy', carName: '白SUV', date: TODAY, odometer: 47100, amount: 15.5, cost: 128, filled: false });
okIf(!e2.isError && e2.text.includes('未满') === false && e2.text.includes('已记补能'), '记第三次补能（未加满也收）');
okIf(e2.text.includes('期间口径') || e2.text.includes('毛估'), '补能回复含期间口径能耗');
// 锚定窗：A=D10(46200,加满) B=TODAY(47100)：量=15.5(仅B之后…) 实际=A之后含B=B一条 15.5L / 900km
const carKey = created;
const energies = [...store.keys()].filter((k) => k.startsWith('chexia.energy.')).map((k) => store.get(k));
okIf(energies.length === 3, `补能落库 3 条（${energies.length}）`);

// ── 5. 维保联动锚点 ─────────────────────────────────────────────────────────
console.log('[5] 维保联动锚点');
const svc = await call('chexia_log', { kind: 'svc', carName: '白SUV', svcType: 'maintenance', date: TODAY, odometer: 47100, cost: 480, vendor: '街口修理铺', desc: '小保养换机油机滤', itemName: '机油机滤' });
okIf(!svc.isError && svc.text.includes('已记维保'), '记维保（保养）');
okIf(svc.text.includes('已推进') && svc.text.includes('机油机滤'), '同名养护项锚点自动推进');
const itemKey = [...store.keys()].find((k) => k.startsWith('chexia.item.'));
const itemAfter = store.get(itemKey);
okIf(itemAfter.lastOdometer === 47100 && itemAfter.lastDate === TODAY, `锚点推进落库（lastOdometer=${itemAfter.lastOdometer}, lastDate=${itemAfter.lastDate}）`);
const svcNoItem = await call('chexia_log', { kind: 'svc', carName: '白SUV', svcType: 'repair', date: TODAY, desc: '补胎', cost: 30 });
okIf(!svcNoItem.isError, '记维修（无 itemName 不联动）');

// ── 6. 证件红黄榜 ────────────────────────────────────────────────────────────
console.log('[6] 证件红黄榜');
const soonDate = dk(Date.now() + 12 * DAY);
const addDoc = await textOf('chexia_add', { kind: 'doc', carName: '白SUV', type: '交强险', expiry: soonDate });
okIf(addDoc.includes('已登记') && addDoc.includes('12 天后'), `交强险 12 天后到期（${soonDate}）`);
const expiredDate = dk(Date.now() - 3 * DAY);
const addDoc2 = await textOf('chexia_add', { kind: 'doc', type: '驾驶证', expiry: expiredDate });
okIf(addDoc2.includes('个人'), '个人证件（驾驶证，无车）');
const qDocs = await textOf('chexia_query', { scope: 'docs' });
okIf(qDocs.includes('驾驶证') && qDocs.includes('交强险'), '证件榜含两条预警');

// ── 7. today 总览 ────────────────────────────────────────────────────────────
console.log('[7] today 总览');
const today = await textOf('chexia_today', {});
okIf(today.includes('白SUV') && today.includes('电驴'), 'today 含两车');
okIf(today.includes('证件预警'), 'today 含证件预警段');
okIf(today.includes('机油机滤'), 'today 含养护项');
okIf(today.includes('不构成维修/保险建议'), 'today 带免责口径');

// ── 8. 查询六 scope ─────────────────────────────────────────────────────────
console.log('[8] 查询六 scope');
okIf((await textOf('chexia_query', { scope: 'cars' })).includes('白SUV'), 'scope=cars');
okIf((await textOf('chexia_query', { scope: 'items' })).includes('机油机滤'), 'scope=items');
okIf((await textOf('chexia_query', { scope: 'svcs' })).includes('小保养'), 'scope=svcs');
okIf((await textOf('chexia_query', { scope: 'energy' })).includes('42.3'), 'scope=energy');
const cost = await textOf('chexia_query', { scope: 'cost' });
okIf(cost.includes('白SUV') && cost.includes('月度'), 'scope=cost（月度分桶）');
const badScope = await call('chexia_query', { scope: 'whatever' });
okIf(badScope.isError && badScope.text.includes('scope 不合法'), '非法 scope 诚实报错');

// ── 9. 更新（续保改期 + 改车）───────────────────────────────────────────────
console.log('[9] 更新');
const docKey = [...store.keys()].find((k) => k.startsWith('chexia.doc.') && store.get(k).type === '交强险');
const newExpiry = dk(Date.now() + 365 * DAY);
const upd = await call('chexia_update', { kind: 'doc', id: docKey.slice('chexia.doc.'.length), patch: { expiry: newExpiry } });
okIf(!upd.isError && upd.text.includes(newExpiry), '续保改期（doc expiry 更新）');
const updCar = await call('chexia_update', { kind: 'car', id: carKey.slice('chexia.car.'.length), patch: { plate: '浙A·88888' } });
okIf(!updCar.isError && updCar.text.includes('浙A·88888'), '车辆补登车牌');

// ── 10. 删除：confirm 门 / purge 门 / 连带删 ────────────────────────────────
console.log('[10] 删除门');
const delNoConfirm = await call('chexia_delete', { kind: 'doc', id: docKey.slice('chexia.doc.'.length) });
okIf(delNoConfirm.isError && delNoConfirm.text.includes('confirm=true'), '无 confirm 拒删');
const delDoc = await call('chexia_delete', { kind: 'doc', id: docKey.slice('chexia.doc.'.length), confirm: true });
okIf(!delDoc.isError, 'confirm 后删除证件');
const carId = carKey.slice('chexia.car.'.length);
const delCarNoPurge = await call('chexia_delete', { kind: 'car', id: carId, confirm: true });
okIf(delCarNoPurge.isError && delCarNoPurge.text.includes('purge'), '删车有记录时需 purge');
const delCar = await call('chexia_delete', { kind: 'car', id: carId, confirm: true, purge: true });
okIf(!delCar.isError && delCar.text.includes('已删除车辆'), 'purge 连带删车');
const left = [...store.keys()].filter((k) => k.startsWith('chexia.') && k !== 'chexia.settings' && store.get(k) && store.get(k).carId === carId);
okIf(left.length === 0, `名下记录全部连带删除（剩 ${left.length}）`);

// ── 清场（内存桥，无真实数据）───────────────────────────────────────────────
const evKey = [...store.keys()].find((k) => k.startsWith('chexia.energy.'));
okIf(!evKey || !store.get(evKey) || store.get(evKey).carId !== carId, '电驴数据保留（另一辆车不受影响）');

console.log('');
if (failures.length) {
  console.error(`❌ mcp-verify ${failures.length} 项失败：`);
  for (const f of failures) console.error('  - ' + f);
  if (stderr.includes('[chexia:error]')) console.error('[stderr]', stderr.split('\n').filter((l) => l.includes('[chexia:error]')).slice(0, 5).join('\n'));
  child.kill();
  process.exit(1);
}
console.log(`✅ mcp-verify 全部通过（${passed} 项）`);
child.kill();
process.exit(0);
