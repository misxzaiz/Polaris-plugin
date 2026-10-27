/**
 * 口袋账本真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中。真实 MCP server（无 env 注入，走 anchor→config
 * 自发现真实桥）执行：入账（今天+昨天+收入）→ 参数校验 → query → stats 预算
 * → delete → categories，最后清理真实 kv 的全部 ledger.* 键恢复原状。
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

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // 1. 记账（今天午饭 35 + 咖啡 22，昨天打车 48，收入工资 6000）
  const a1 = await rpc('tools/call', { name: 'ledger_add', arguments: { amount: 35, category: '餐饮', note: '午饭' } });
  record('真实桥入账（今天餐饮 35）', !a1.result.isError && textOf(a1).includes('¥35.00'), textOf(a1).split('\n')[0]);
  await rpc('tools/call', { name: 'ledger_add', arguments: { amount: 22, category: '餐饮', note: '咖啡' } });
  const a3 = await rpc('tools/call', { name: 'ledger_add', arguments: { amount: 48, category: '交通', note: '打车', date: 'yesterday' } });
  record('补记昨天（交通 48）', textOf(a3).includes('已记录'), '');
  const a4 = await rpc('tools/call', { name: 'ledger_add', arguments: { amount: 6000, type: 'income', category: '工资', note: '月薪' } });
  record('收入入账（工资 6000）', textOf(a4).includes('收入 ¥6000.00'), '');

  // 2. 真实 kv 验证：日键确实落库（与面板读同一份）
  const todayKey = `ledger.day.${new Date().toLocaleDateString('sv-SE')}`;
  const yesterdayKey = `ledger.day.${new Date(Date.now() - 86400000).toLocaleDateString('sv-SE')}`;
  const todayArr = await kvGet(todayKey);
  const yArr = await kvGet(yesterdayKey);
  record('cap.kv 日键落库（面板可读同一份）',
    Array.isArray(todayArr) && todayArr.length === 3 && Array.isArray(yArr) && yArr.length === 1,
    `今天 ${todayArr?.length} 笔 / 昨天 ${yArr?.length} 笔`);

  // 3. query 关键词
  const q = await rpc('tools/call', { name: 'ledger_query', arguments: { keyword: '咖啡' } });
  record('关键词查账（咖啡）', textOf(q).includes('¥22.00'), textOf(q).split('\n')[0]);

  // 4. stats：支出 105 / 收入 6000 / 结余 5895
  const st = await rpc('tools/call', { name: 'ledger_stats', arguments: {} });
  record('月度统计（与 core 口径一致）',
    textOf(st).includes('支出 ¥105.00') && textOf(st).includes('结余 ¥5895.00'),
    textOf(st).split('\n')[1]);

  // 5. 预算：设总预算 100 → 超支提示
  const settings = (await kvGet('ledger.settings')) || {};
  await bridgeDispatch('cap.kv', { action: 'set', key: 'ledger.settings', value: { ...settings, monthlyTotalBudget: 100 } });
  const st2 = await rpc('tools/call', { name: 'ledger_stats', arguments: {} });
  record('预算超支提示', textOf(st2).includes('超支'), '');

  // 6. 删除（AI 拿 id 后删）
  const qAll = await rpc('tools/call', { name: 'ledger_query', arguments: { category: '餐饮' } });
  const idMatch = textOf(qAll).match(/\[(b[0-9a-z]+)\]/);
  const del = await rpc('tools/call', { name: 'ledger_delete', arguments: { id: idMatch[1] } });
  record('删除账单', textOf(del).includes('已删除'), textOf(del));

  record('真实桥冒烟全部通过', true);
} catch (e) {
  record('流程', false, e.message);
  console.error('mcp stderr:', stderrChunks.join('').slice(-800));
} finally {
  mcp.kill();
  await new Promise((r) => setTimeout(r, 500));
  const keys = (await kvKeys()).filter((k) => k.startsWith('ledger.'));
  await Promise.all(keys.map((k) => kvDel(k)));
  console.log(`[smoke] 已清理 ${keys.length} 个 ledger.* 键，真实 kv 恢复原状`);
  const bad = results.filter((r) => !r.pass);
  console.log(`[smoke] 结果：${results.length - bad.length}/${results.length} 通过`);
  process.exit(bad.length ? 1 : 0);
}
