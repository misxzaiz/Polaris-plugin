#!/usr/bin/env node
/**
 * 金匮真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中。真实 MCP server（无 env 注入，走 anchor→config 自发现
 * 真实桥）执行：空台账引导 → 建成员/建保单（自动配档/判重拒）→ today 红黄榜 →
 * 记缴费/理赔/复效门 → 查询六 scope → 更新 → confirm 门 → 删除连带 → 清场。
 * 护栏：真实 kv 里已有 jinkui.* 业务键时拒跑（防冒烟毁生产数据，memoryforge 先例）。
 * 清理为快照式：只删本次冒烟新建的 jinkui.* 键，不动既有数据。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = (await import('node:module')).createRequire(import.meta.url)('../shared/core.js');

function loadEndpoint() {
  const anchorPath = path.join(process.env.APPDATA || path.join(process.env.HOME || '', '.config'), 'Polaris', 'anchor.json');
  const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
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
async function kvSet(k, v) { await bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); }
async function kvDel(k) { await bridgeDispatch('cap.kv', { action: 'delete', key: k }); }

// ── 护栏：真实 kv 已有本插件业务键时拒跑 ─────────────────────────────────────
const existing = (await kvKeys()).filter((k) => k.startsWith('jinkui.'));
if (existing.length) {
  console.error(`🛑 真实 kv 中已存在 ${existing.length} 个 jinkui.* 键（${existing.slice(0, 3).join('，')}…），拒绝运行冒烟以防污染生产数据。`);
  process.exit(1);
}

// ── spawn 真实 MCP server（无 env 注入 → kvclient 自发现真实桥）──────────────
const child = spawn(process.execPath, ['mcp/server.js', ''], { cwd: pluginDir, stdio: ['pipe', 'pipe', 'pipe'] });
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
const call = async (name, args) => {
  const m = await rpc('tools/call', { name, arguments: args });
  const r = m.result || {};
  return { isError: !!r.isError, text: (r.content || []).map((c) => c.text).join('\n') };
};

const failures = [];
let passed = 0;
const okIf = (cond, label) => {
  if (!cond) { failures.push(label); console.log(`  ✗ ${label}`); }
  else { passed++; console.log(`  ✓ ${label}`); }
};

// 快照：记录初始键集，清场时删除「本次新增」的 jinkui.* 键
const snapshot = new Set(await kvKeys());
async function cleanup() {
  const now = await kvKeys();
  let n = 0;
  for (const k of now) {
    if (k.startsWith('jinkui.') && !snapshot.has(k)) { await kvDel(k); n++; }
  }
  return n;
}

try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  okIf((await rpc('tools/list', {})).result.tools.length === 6, '真实桥：tools/list 6 工具');

  const T = core.dayKey(Date.now());
  const START_ACTIVE = core.addDays(core.addMonths(T, -12), 13); // nextPay = T+13d
  const START_GRACE = core.addDays(core.addMonths(T, -12), -9);  // nextPay = T-9d 宽限期

  let r = await call('jinkui_today', {});
  okIf(!r.isError && (r.text.includes('还没有保单台账') || r.text.includes('家庭保单台账')), 'today：空台账引导/正常台账');

  r = await call('jinkui_add', { entity: 'member', name: '冒烟本人', relation: 'self' });
  okIf(!r.isError && r.text.includes('已建成员'), 'add member：真桥写入');
  r = await call('jinkui_add', { name: '冒烟重疾险', kind: 'critical', insured: '冒烟本人', relation: 'self', company: '冒烟人寿', coverageWan: 50, premium: 4000, freq: 'yearly', payYears: 20, startDate: START_ACTIVE });
  okIf(!r.isError && r.text.includes('已入柜') && r.text.includes('下次缴费'), 'add policy：自动配档入柜');
  const kidId = (r.text.match(/id=([0-9a-f]{12})/) || [])[1];
  okIf(!!kidId, 'add policy：返回 id');
  r = await call('jinkui_add', { name: '冒烟重疾险', kind: 'critical', insured: '冒烟本人', company: '冒烟人寿', coverageWan: 50, premium: 4000, startDate: START_ACTIVE });
  okIf(r.isError && r.text.includes('同名'), 'add policy：判重拒建（真桥回读）');
  r = await call('jinkui_add', { name: '冒烟医疗险', kind: 'medical', insured: '冒烟本人', company: '冒烟健康', coverageWan: 300, premium: 233, startDate: START_GRACE, payYears: 20 });
  okIf(!r.isError, 'add policy：宽限期种子');

  r = await call('jinkui_today', {});
  okIf(!r.isError && r.text.includes('冒烟重疾险') && r.text.includes('黄榜'), 'today：黄榜含冒烟保单');
  okIf(r.text.includes('宽限期'), 'today：宽限期红榜');
  okIf(r.text.includes('不构成投保建议'), 'today：免责口径');

  r = await call('jinkui_log', { type: 'pay', policyId: kidId, date: core.addDays(T, 13) });
  okIf(!r.isError && r.text.includes('已记缴费') && r.text.includes('已缴 2'), 'log pay：进度推进（真桥）');
  r = await call('jinkui_log', { type: 'reinstate', policyId: kidId });
  okIf(r.isError && r.text.includes('无需复效'), 'log reinstate：有效保单拒绝');
  r = await call('jinkui_log', { type: 'claim', policyName: '冒烟重疾险', amount: 5000, note: '冒烟理赔' });
  okIf(!r.isError && r.text.includes('累计理赔'), 'log claim：理赔流水');

  for (const scope of ['policies', 'calendar', 'gap', 'stats']) {
    r = await call('jinkui_query', { scope });
    okIf(!r.isError, `query ${scope}：真桥现算`);
  }
  r = await call('jinkui_query', { scope: 'detail', policyId: kidId });
  okIf(!r.isError && r.text.includes('已缴 2') && r.text.includes('下次缴费'), 'query detail：进度与流水');
  r = await call('jinkui_update', { kind: 'policy', id: kidId, patch: { note: '冒烟备注' } });
  okIf(!r.isError && r.text.includes('已更新保单'), 'update：真桥写回');
  r = await call('jinkui_delete', { kind: 'policy', id: kidId, confirm: false });
  okIf(r.isError && r.text.includes('confirm'), 'delete：confirm 门');
  const keysBeforeDel = (await kvKeys()).filter((k) => k.startsWith('jinkui.ev.')).length;
  r = await call('jinkui_delete', { kind: 'policy', id: kidId, confirm: true });
  okIf(!r.isError && r.text.includes('已删除保单'), 'delete policy：连带流水');
  const keysAfterDel = (await kvKeys()).filter((k) => k.startsWith('jinkui.ev.')).length;
  okIf(keysAfterDel === keysBeforeDel - 2, `delete policy：连带清 2 条流水（${keysBeforeDel}→${keysAfterDel}）`);
} catch (e) {
  failures.push(`异常中断：${e.message}`);
  console.error(e);
}

const cleaned = await cleanup();
console.log(`\n[cleanup] 已清理本次冒烟新建键 ${cleaned} 个`);
child.kill();
const remaining = (await kvKeys()).filter((k) => k.startsWith('jinkui.'));
okIf(remaining.length === 0, `清场：jinkui.* 键全净（剩 ${remaining.length}）`);
if (failures.length) {
  console.error(`❌ smoke-real ${failures.length} 项失败`);
  process.exit(1);
}
console.log(`✅ smoke-real 通过（${passed} 项：真桥自发现/建档/红黄榜/事件/六 scope/更新/删除连带/清场 全闭环）`);
process.exit(0);
