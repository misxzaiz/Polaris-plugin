#!/usr/bin/env node
/**
 * 泉府真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中。真实 MCP server（无 env 注入，走 anchor→config 自发现
 * 真实桥）执行：拒绝路径 → 建档（组合贷两笔）→ today → whatif 三方案 → 记利率变更
 * → 记提前还款 → 记对账点 → 查询四 scope → 更新 → 确认门 → 删除连带清 → 清场。
 * 清理为快照式：只删本次冒烟新建的 quanfu.* 键，不动既有数据。
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

// ── 桥可用性 ─────────────────────────────────────────────────────────────────
const probe = await bridgeDispatch('cap.kv', { action: 'get', key: '__smoke_probe__' });
if (!probe.ok) { console.error('✗ 真实桥不可达（Polaris 未运行？）'); process.exit(1); }
console.log(`[smoke] 真实桥 127.0.0.1:${EP.port} 可达`);

const preKeys = new Set((await kvKeys()).filter((k) => k.startsWith('quanfu.')));
console.log(`[smoke] 既有 quanfu.* 键 ${preKeys.size} 个（不动）`);

// ── MCP server 进程 ──────────────────────────────────────────────────────────
const mcp = spawn(process.execPath, ['mcp/server.js', path.join(process.env.APPDATA || '', 'Polaris')], {
  cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
});
mcp.stderr.on('data', (c) => { if (String(c).includes('[quanfu:error]')) console.log('[mcp:stderr]', String(c).trim()); });

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
  const r = m.result || {};
  return { isError: !!r.isError, text: (r.content || []).map((c) => c.text).join('\n') };
};

const failures = [];
let passed = 0;
const okIf = (cond, label) => {
  if (!cond) { failures.push(label); console.log(`  ✗ ${label}`); }
  else { passed++; console.log(`  ✓ ${label}`); }
};

try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const tl = await rpc('tools/list', {});
  okIf((tl.result.tools || []).length === 7, 'tools/list：7 工具');

  // 冒烟用唯一名称（避免与真实数据撞名）
  const TAG = `冒烟${Date.now().toString(36)}`;

  console.log('[smoke] 建档（组合贷两笔）');
  let r = await call('quanfu_add', { name: `${TAG}商贷`, principalWan: 100, annualRate: 3.6, method: 'annuity', termMonths: 360, startDate: '2021-03-01', repricing: { day: '01-01', cycleMonths: 12 }, groupId: 'smoke-home', lender: '冒烟银行' });
  okIf(!r.isError && r.text.includes('已建贷款'), `add 商贷`);
  okIf(r.text.includes('4546.45'), `add 月供金标准`);
  r = await call('quanfu_add', { name: `${TAG}公积金`, principalWan: 60, annualRate: 2.85, method: 'linear', termMonths: 360, startDate: '2021-03-01', groupId: 'smoke-home' });
  okIf(!r.isError && r.text.includes('公积金'), 'add 公积金（等额本金）');

  console.log('[smoke] today + whatif');
  r = await call('quanfu_today', {});
  okIf(!r.isError && r.text.includes(TAG), 'today：冒烟贷款出现');
  okIf(r.text.includes('下次重定价 2027-01-01'), 'today：重定价倒数');
  r = await call('quanfu_whatif', { loanName: `${TAG}商贷`, amountWan: 20 });
  okIf(!r.isError && r.text.includes('缩期') && r.text.includes('减月供') && r.text.includes('省息'), 'whatif：三方案');
  const todayText = r.text;
  const effDate = /生效期 (\d{4}-\d{2}-\d{2})/.exec(todayText)?.[1];
  okIf(!!effDate, `whatif：生效期 ${effDate}`);

  console.log('[smoke] 记事件');
  r = await call('quanfu_log', { type: 'rate', loanName: `${TAG}商贷`, date: '2025-01-01', rate: 3.3, note: '重定价' });
  okIf(!r.isError && r.text.includes('利率变更'), 'log rate');
  r = await call('quanfu_log', { type: 'prepay', loanName: `${TAG}商贷`, amountWan: 15, mode: 'term', note: '冒烟提前还' });
  okIf(!r.isError && r.text.includes('已记录提前还款') && r.text.includes('缩期'), 'log prepay（缩期）');
  r = await call('quanfu_log', { type: 'checkpoint', loanName: `${TAG}商贷`, amountWan: 70 });
  okIf(!r.isError && (r.text.includes('差') || r.text.includes('一致')), 'log checkpoint 对账');
  r = await call('quanfu_query', { scope: 'detail', loanName: `${TAG}商贷` });
  okIf(!r.isError && r.text.includes('当前利率 3.3%') && r.text.includes('提前还'), 'query detail：重放生效（利率 3.3 + 提前还流水）');
  r = await call('quanfu_query', { scope: 'yearly', loanName: `${TAG}商贷` });
  okIf(!r.isError && r.text.includes('2021'), 'query yearly');

  console.log('[smoke] 更新 + 删除');
  const keysNow = await kvKeys();
  const myLoanKey = keysNow.find((k) => k.startsWith('quanfu.loan.'));
  const loanId = (await bridgeDispatch('cap.kv', { action: 'get', key: myLoanKey })).result?.value?.id;
  r = await call('quanfu_update', { id: loanId, patch: { note: '冒烟备注' } });
  okIf(!r.isError && r.text.includes('已更新贷款'), 'update 备注');
  r = await call('quanfu_delete', { kind: 'loan', id: loanId, confirm: false });
  okIf(r.isError, 'delete 无 confirm 拒绝');
  r = await call('quanfu_delete', { kind: 'loan', id: loanId, confirm: true });
  okIf(!r.isError && r.text.includes('已删除贷款'), 'delete loan');

  r = await call('quanfu_query', { scope: 'loans' });
  const gjjId = /f[0-9a-f]{12}/.exec((r.text.split('\n').find((l) => l.includes(`${TAG}公积金`)) || ' f'))?.[0];
  if (gjjId) {
    r = await call('quanfu_delete', { kind: 'loan', id: gjjId, confirm: true });
    okIf(!r.isError && r.text.includes('已删除贷款'), 'delete 公积金');
  } else {
    okIf(false, 'delete 公积金（未找到 id）');
  }
} catch (e) {
  failures.push(`异常中断：${e.message}`);
  console.error(e);
}

// ── 清场（快照式：只删本次新建键）────────────────────────────────────────────
const postKeys = await kvKeys();
const mine = postKeys.filter((k) => k.startsWith('quanfu.') && !preKeys.has(k));
for (const k of mine) await kvDel(k);
console.log(`[smoke] 清场：删除 ${mine.length} 个冒烟键`);
mcp.kill();

console.log('');
if (failures.length) {
  console.error(`❌ smoke-real ${failures.length} 项失败`);
  process.exit(1);
}
console.log(`✅ smoke-real 通过（${passed} 项：真桥全链路，真实 MCP server 自发现桥）`);
process.exit(0);
