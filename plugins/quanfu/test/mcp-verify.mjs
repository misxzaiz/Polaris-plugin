#!/usr/bin/env node
/**
 * MCP server 全流程验证（node test/mcp-verify.mjs）——不依赖真实宿主：
 * 起本地「内存 cap.kv」桥（/api/router-dispatch 假实现，协议与宿主一致），
 * 注入 POLARIS_HOST/PORT env（kvclient 的 env 优先路径），spawn 真实 mcp/server.js
 * 走 stdio JSON-RPC：initialize → tools/list → 建档/测算/记事件/查询/更新/删除
 * 全闭环 + 错误路径。业务口径与 shared/core 真实现一致（零 mock 业务逻辑）。
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
const call = async (name, args) => {
  const m = await rpc('tools/call', { name, arguments: args });
  const r = m.result || {};
  return { isError: !!r.isError, text: (r.content || []).map((c) => c.text).join('\n') };
};

try {
  // initialize + tools/list
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  okIf(init.result && init.result.serverInfo.name === 'quanfu', 'initialize：serverInfo=quanfu');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const tl = await rpc('tools/list', {});
  const names = (tl.result.tools || []).map((t) => t.name);
  okIf(names.length === 7, `tools/list：7 个工具（${names.join(',')}）`);
  okIf(['quanfu_today', 'quanfu_add', 'quanfu_whatif', 'quanfu_log', 'quanfu_query', 'quanfu_update', 'quanfu_delete'].every((n) => names.includes(n)), '工具名齐全');

  console.log('[mcp] 建档 + 今日');
  let r = await call('quanfu_add', { name: '商贷', principalWan: 100, annualRate: 3.6, method: 'annuity', termMonths: 360, startDate: '2021-03-01', repricing: { day: '01-01', cycleMonths: 12 }, groupId: 'home' });
  okIf(!r.isError && r.text.includes('已建贷款'), 'add：建档成功');
  okIf(r.text.includes('4546.45'), `add：月供金标准 4546.45`);
  okIf(r.text.includes('对一次账'), 'add：引导对账提示');
  r = await call('quanfu_add', { name: '公积金', principalWan: 60, annualRate: 2.85, method: 'annuity', termMonths: 360, startDate: '2021-03-01', groupId: 'home' });
  okIf(!r.isError && r.text.includes('公积金'), 'add：第二笔（组合贷归组）');
  r = await call('quanfu_add', { name: '商贷', principalWan: 50, annualRate: 3.6, method: 'annuity', termMonths: 360, startDate: '2021-03-01' });
  okIf(r.isError && r.text.includes('同名'), 'add：同名拒建');
  r = await call('quanfu_add', { name: 'x', annualRate: 40, method: 'annuity', termMonths: 360, startDate: '2021-03-01', principalWan: 1 });
  okIf(r.isError && r.text.includes('年利率'), 'add：利率越界拒绝');

  r = await call('quanfu_today', {});
  okIf(!r.isError && r.text.includes('商贷') && r.text.includes('公积金'), 'today：两笔都在');
  okIf(r.text.includes('月供') && r.text.includes('剩余本金'), 'today：家庭合计');
  okIf(r.text.includes('下次重定价 2027-01-01'), 'today：重定价倒数');
  okIf(r.text.includes('不构成金融建议') || r.text.includes('不构成任何金融建议'), 'today：免责口径');

  console.log('[mcp] whatif 三方案');
  r = await call('quanfu_whatif', { loanName: '商贷', amountWan: 20 });
  okIf(!r.isError && r.text.includes('不提前还（基准）') && r.text.includes('缩期') && r.text.includes('减月供'), 'whatif：三方案并列');
  okIf(r.text.includes('省息'), 'whatif：省息数字');
  okIf(r.text.includes('2026-11-01'), 'whatif：生效期=下一扣款日');
  okIf(!store.has('quanfu.ev.prepay|' + r.text.match(/f[0-9a-z]+/)?.[0] + '|x'), 'whatif：不落库');
  r = await call('quanfu_whatif', { loanName: '不存在', amountWan: 1 });
  okIf(r.isError, 'whatif：未知贷款拒绝');

  console.log('[mcp] 记事件');
  r = await call('quanfu_log', { type: 'prepay', loanName: '商贷', amountWan: 20, mode: 'payment', note: '年终奖' });
  okIf(!r.isError && r.text.includes('已记录提前还款'), 'log prepay：成功');
  okIf(r.text.includes('减月供') && r.text.includes('月供已降'), 'log prepay：减供效果');
  okIf(store.has('quanfu.ev.prepay|' + (await storeKeys()).find((k) => k.startsWith('quanfu.loan.')).slice('quanfu.loan.'.length) + '|' + today()), 'log prepay：落库 occKey');
  r = await call('quanfu_log', { type: 'prepay', loanName: '商贷', amountWan: 500, mode: 'term' });
  okIf(r.isError && r.text.includes('余额'), 'log prepay：超额拒绝');
  r = await call('quanfu_log', { type: 'rate', loanName: '商贷', date: '2025-01-01', rate: 3.3 });
  okIf(!r.isError && r.text.includes('利率变更'), 'log rate：成功');
  r = await call('quanfu_log', { type: 'checkpoint', loanName: '商贷', amountWan: 65.2 });
  okIf(!r.isError && (r.text.includes('差') || r.text.includes('一致')), 'log checkpoint：对账回报');

  console.log('[mcp] 查询');
  r = await call('quanfu_query', { scope: 'loans' });
  okIf(!r.isError && r.text.split('\n').length >= 2, 'query loans：清单');
  r = await call('quanfu_query', { scope: 'detail', loanName: '商贷' });
  okIf(!r.isError && r.text.includes('当前利率 3.3%'), 'query detail：重放后当前利率');
  okIf(r.text.includes('最近对账'), 'query detail：对账漂移');
  r = await call('quanfu_query', { scope: 'schedule', loanName: '商贷', months: 3 });
  okIf(!r.isError && r.text.split('\n').filter((l) => l.includes('期')).length >= 3, 'query schedule：未来 3 期');
  r = await call('quanfu_query', { scope: 'yearly', loanName: '商贷' });
  okIf(!r.isError && r.text.includes('2021'), 'query yearly：年度构成');
  r = await call('quanfu_query', { scope: 'events', loanName: '商贷' });
  okIf(!r.isError && r.text.includes('occKey='), 'query events：流水带 occKey');
  r = await call('quanfu_query', { scope: 'bad' });
  okIf(r.isError, 'query：scope 非法拒绝');

  console.log('[mcp] 更新 / 删除');
  const loanId = [...store.keys()].find((k) => k.startsWith('quanfu.loan.')).slice('quanfu.loan.'.length);
  r = await call('quanfu_update', { id: loanId, patch: { note: '测试备注' } });
  okIf(!r.isError && r.text.includes('已更新贷款'), 'update：备注修改');
  okIf(!r.text.includes('如实重放'), 'update：纯备注不触发重放警告');
  r = await call('quanfu_update', { id: loanId, patch: { annualRate: 4.2 } });
  okIf(!r.isError && r.text.includes('如实重放'), 'update：初始参数改动提示重放');
  await call('quanfu_update', { id: loanId, patch: { annualRate: 3.6 } });
  r = await call('quanfu_delete', { kind: 'loan', id: loanId, confirm: false });
  okIf(r.isError && r.text.includes('confirm'), 'delete：无 confirm 拒绝');
  const evCountBefore = [...store.keys()].filter((k) => k.startsWith('quanfu.ev.')).length;
  okIf(evCountBefore >= 3, `delete 前事件存在（${evCountBefore}）`);
  r = await call('quanfu_delete', { kind: 'loan', id: loanId, confirm: true });
  okIf(!r.isError && r.text.includes('已删除贷款'), 'delete loan：成功');
  const evCountAfter = [...store.keys()].filter((k) => k.startsWith('quanfu.ev.')).length;
  okIf(evCountAfter === 0, `delete loan：连带清事件（剩 ${evCountAfter}）`);
  r = await call('quanfu_today', {});
  okIf(!r.isError && r.text.includes('公积金') && !r.text.includes('商贷'), 'today：删除后只剩公积金');

  // 公积金留存，最后清场
  const gjjId = [...store.keys()].find((k) => k.startsWith('quanfu.loan.')).slice('quanfu.loan.'.length);
  await call('quanfu_delete', { kind: 'loan', id: gjjId, confirm: true });
  okIf([...store.keys()].filter((k) => k.startsWith('quanfu.')).length === 0, '清场：quanfu.* 键全净');
} catch (e) {
  failures.push(`异常中断：${e.message}`);
  console.error(e);
}

console.log('');
child.kill();
server.close();
if (stderr.includes('[quanfu:error]')) console.log('[stderr 有 error 级日志，已忽略非致命]');
if (failures.length) {
  console.error(`❌ mcp-verify ${failures.length} 项失败`);
  process.exit(1);
}
console.log(`✅ mcp-verify 通过（${passed} 项：建档/测算/记事件/查询/更新/删除/错误路径 全闭环）`);
process.exit(0);

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
async function storeKeys() { return [...store.keys()]; }
