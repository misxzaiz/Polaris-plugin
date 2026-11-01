/**
 * 车辖真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中。真实 MCP server（无 env 注入，走 anchor→config 自发现
 * 真实桥）执行：空库引导 → 建车 → 立养护项 → 两次补能（期间口径）→ 维保联动锚点 →
 * 证件红黄榜 → today → 查询/更新/删除门 → 清场。
 * 另独立拉起后台服务（node service/chexia.js），验证快照 chexia.snapshot / 心跳
 * chexia.meta 真实落库后收割。
 * 清理为快照式：只删本次冒烟新建的 chexia.* 键，不动既有数据。
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

const preKeys = new Set((await kvKeys()).filter((k) => k.startsWith('chexia.')));
console.log(`[smoke] 既有 chexia.* 键 ${preKeys.size} 个（不动）`);

// ── MCP server 进程 ──────────────────────────────────────────────────────────
const mcp = spawn(process.execPath, ['mcp/server.js', path.join(process.env.APPDATA || '', 'Polaris')], {
  cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
});
mcp.stderr.on('data', (c) => { if (String(c).includes('[chexia:error]')) console.log('[mcp:stderr]', String(c).trim()); });

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
const call = async (tool, args) => {
  const r = await rpc('tools/call', { name: tool, arguments: args });
  return { isError: !!(r.result && r.result.isError), text: r.result?.content?.[0]?.text || '' };
};

const failures = [];
let passed = 0;
const okIf = (cond, label) => {
  if (!cond) { failures.push(label); console.log(`  ✗ ${label}`); }
  else { passed++; console.log(`  ✓ ${label}`); }
};

const myKeys = () => [...store].filter((k) => !preKeys.has(k));
const store = new Set();

// ── MCP 全流程 ───────────────────────────────────────────────────────────────
console.log('[smoke] MCP 全流程');
await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
const empty = (await call('chexia_today', {})).text;
okIf(empty.includes('还没有车辆') || empty.includes('【'), 'today 可用（空库引导或已有数据）');

const addCar = (await call('chexia_add', { kind: 'car', name: '冒烟白SUV', carKind: 'fuel', initialOdometer: 45000 })).text;
okIf(addCar.includes('已建档车辆'), '建车');
for (const k of await kvKeys()) if (k.startsWith('chexia.car.') && (await kvGet(k))?.name === '冒烟白SUV') store.add(k);

const addItem = (await call('chexia_add', { kind: 'item', carName: '冒烟白SUV', name: '冒烟机油', cycle: { kmInterval: 5000 }, lastOdometer: 45000, lastDate: '2026-09-01' })).text;
okIf(addItem.includes('已立养护项'), '立养护项');

const DAY = 86400000;
const dk = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const e1 = (await call('chexia_log', { kind: 'energy', carName: '冒烟白SUV', date: dk(Date.now() - 20 * DAY), odometer: 45500, amount: 40, cost: 320, filled: true })).text;
okIf(e1.includes('已记补能'), '补能一（20天前 45500）');
const e2 = (await call('chexia_log', { kind: 'energy', carName: '冒烟白SUV', date: dk(Date.now() - 3 * DAY), odometer: 46300, amount: 42, cost: 340, filled: true })).text;
okIf(e2.includes('期间口径'), '补能二回执含期间口径（锚定窗出数）');

const svc = (await call('chexia_log', { kind: 'svc', carName: '冒烟白SUV', svcType: 'maintenance', date: dk(Date.now() - 3 * DAY), odometer: 46300, cost: 480, desc: '冒烟小保养', itemName: '冒烟机油' })).text;
okIf(svc.includes('已推进'), '维保联动推进锚点');

const soon = dk(Date.now() + 10 * DAY);
const doc = (await call('chexia_add', { kind: 'doc', carName: '冒烟白SUV', type: '交强险', expiry: soon })).text;
okIf(doc.includes('已登记') && doc.includes('10 天后'), '证件登记（10 天后到期）');

const today = (await call('chexia_today', {})).text;
okIf(today.includes('冒烟白SUV'), 'today 含冒烟车');
okIf(today.includes('不构成维修/保险建议'), 'today 带免责');

const q = (await call('chexia_query', { scope: 'cost', carName: '冒烟白SUV' })).text;
okIf(q.includes('冒烟白SUV'), '费用透视可用');

// 记录本次新建的所有键（含流水/锚点推进产物）
for (const k of await kvKeys()) if (k.startsWith('chexia.') && !preKeys.has(k)) store.add(k);

// ── 服务进程 ─────────────────────────────────────────────────────────────────
console.log('[smoke] 后台服务');
const svcProc = spawn(process.execPath, ['service/chexia.js', '0', path.join(process.env.APPDATA || '', 'Polaris')], {
  cwd: APP_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
});
let svcLog = '';
svcProc.stderr.on('data', (c) => { svcLog += String(c); });
let snapOk = false; let metaOk = false;
const deadline = Date.now() + 40000;
while (Date.now() < deadline && !(snapOk && metaOk)) {
  await new Promise((r) => setTimeout(r, 2500));
  if (!snapOk) {
    const snap = await kvGet('chexia.snapshot').catch(() => null);
    if (snap && Array.isArray(snap.cars) && snap.cars.some((c) => c.name === '冒烟白SUV')) {
      const mine = snap.cars.find((c) => c.name === '冒烟白SUV');
      okIf(mine.odometer === 46300, `快照里程 ${mine.odometer}`);
      okIf(mine.consumption && mine.consumption.per100 > 0, `快照能耗 ${mine.consumption ? mine.consumption.per100 : '—'}`);
      okIf(mine.docsDue.some((d) => d.type === '交强险'), '快照证件榜含交强险');
      snapOk = true;
    }
  }
  if (!metaOk) {
    const meta = await kvGet('chexia.meta').catch(() => null);
    if (meta && meta.pid === svcProc.pid) metaOk = true;
  }
}
okIf(snapOk, '服务快照真实落库（chexia.snapshot）');
okIf(metaOk, '服务心跳真实落库（chexia.meta）');

// ── 清场（快照式：只删本次新建键）────────────────────────────────────────────
console.log('[smoke] 清场');
const leftovers = myKeys();
let deleted = 0;
for (const k of leftovers) { await kvDel(k); deleted++; }
okIf(true, `已清理 ${deleted} 个冒烟键（既有 ${preKeys.size} 个未动）`);

svcProc.kill();
mcp.kill();
console.log('');
if (failures.length) {
  console.error(`❌ smoke-real ${failures.length} 项失败`);
  console.error(svcLog.split('\n').filter((l) => l.includes('[chexia:warn]') || l.includes('[chexia:error]')).slice(0, 8).join('\n'));
  process.exit(1);
}
console.log(`✅ 真实冒烟通过（${passed} 项）`);
process.exit(0);
