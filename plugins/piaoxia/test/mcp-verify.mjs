'use strict';
/**
 * mcp-verify.mjs —— MCP 全流程验证：内存 kv 桥 + spawn 子进程走 stdio
 * 覆盖：7 工具、判重、状态机拒绝、confirm 门、collect 批量解析、归档落盘。
 * 运行：node test/mcp-verify.mjs
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const FIX = path.join(HERE, 'fixtures');

// ── 内存 kv 桥 ──────────────────────────────────────────────────────────────
const store = new Map();
const bridge = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const { req: inner } = JSON.parse(body);
      if (!inner || inner.target !== 'cap.kv') throw new Error('只支持 cap.kv');
      const p = inner.payload || {};
      let result = {};
      if (p.action === 'get') result = { value: store.has(p.key) ? store.get(p.key) : null };
      else if (p.action === 'set') { store.set(p.key, p.value); result = { ok: true }; }
      else if (p.action === 'delete') { store.delete(p.key); result = { ok: true }; }
      else if (p.action === 'list') result = { keys: Array.from(store.keys()) };
      else throw new Error('未知 action ' + p.action);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e.message) }));
    }
  });
});
await new Promise((r) => bridge.listen(0, '127.0.0.1', r));
const bridgePort = bridge.address().port;

// ── 隔离环境：临时 APPDATA（anchor.json → 临时 dataRoot）───────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'piaoxia-verify-'));
const fakeAppdata = path.join(tmp, 'appdata');
const dataRoot = path.join(tmp, 'dataroot');
fs.mkdirSync(path.join(fakeAppdata, 'Polaris'), { recursive: true });
fs.mkdirSync(dataRoot, { recursive: true });
fs.writeFileSync(path.join(fakeAppdata, 'Polaris', 'anchor.json'), JSON.stringify({ schemaVersion: 1, dataRoot }));

// ── spawn MCP 子进程 ────────────────────────────────────────────────────────
const child = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.js'), fakeAppdata], {
  env: Object.assign({}, process.env, {
    POLARIS_HOST: '127.0.0.1',
    POLARIS_PORT: String(bridgePort),
    POLARIS_TOKEN: 'test-token',
    APPDATA: fakeAppdata,
  }),
  stdio: ['pipe', 'pipe', 'pipe'],
});
child.stderr.on('data', () => { /* 静默：mcp 日志走 stderr */ });

let buf = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (d) => { buf += d; });
let rpcId = 0;
const pending = new Map();

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++rpcId;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('rpc timeout: ' + method)); }
    }, 60000);
  });
}
child.stdout.on('data', () => {
  let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        p.resolve(msg);
      }
    } catch (_) { /* 忽略坏行 */ }
  }
});

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : '—— ' + JSON.stringify(extra).slice(0, 300)); }
}
function textOf(resp) {
  return resp && resp.result && resp.result.content && resp.result.content[0] ? resp.result.content[0].text : '';
}
function isError(resp) {
  return !!(resp && resp.result && resp.result.isError);
}

// ── 流程 ────────────────────────────────────────────────────────────────────
try {
  console.log('== initialize / tools/list ==');
  const init = await rpc('initialize', {});
  ok('协议版本 2024-11-05', init.result.protocolVersion === '2024-11-05', init.result);
  notify('notifications/initialized', {});
  const tl = await rpc('tools/list', {});
  ok('7 个工具', tl.result.tools.length === 7, tl.result.tools.map((t) => t.name));
  ok('工具名前缀 piaoxia_', tl.result.tools.every((t) => t.name.startsWith('piaoxia_')));

  console.log('== add：校验与判重 ==');
  const bad = await rpc('tools/call', { name: 'piaoxia_add', arguments: { date: '2026-10-01' } });
  ok('无 total 拒绝', isError(bad), textOf(bad));
  const inv1 = await rpc('tools/call', {
    name: 'piaoxia_add',
    arguments: {
      total: 296.8, date: '2026-10-15', number: '24312000000123456789',
      sellerName: '杭州某某餐饮管理有限公司', items: [{ name: '午餐费' }], category: '餐饮',
    },
  });
  ok('入账成功', !isError(inv1), textOf(inv1));
  ok('返回含号码与状态', textOf(inv1).indexOf('24312000000123456789') !== -1 && textOf(inv1).indexOf('待报销') !== -1, textOf(inv1));
  const dup = await rpc('tools/call', {
    name: 'piaoxia_add',
    arguments: { total: 296.8, date: '2026-10-15', number: '24312000000123456789' },
  });
  ok('同号码判重拒绝', isError(dup) && textOf(dup).indexOf('已入账') !== -1, textOf(dup));

  console.log('== collect：批量解析 + 归档 + 判重 ==');
  const col = await rpc('tools/call', { name: 'piaoxia_collect', arguments: { path: FIX } });
  ok('collect 成功', !isError(col), textOf(col));
  const colText = textOf(col);
  ok('新增 4 张（另 4 个 fixture 与手录票同号码判重）', /新增 4 张/.test(colText), colText.slice(0, 200));
  ok('重复 4（同号码同票）', /重复跳过 4/.test(colText), colText.slice(0, 200));
  ok('失败 2（扫描件+非发票）', /失败 2/.test(colText), colText.slice(0, 400));
  ok('失败文案引导手动录入', colText.indexOf('手动录入') !== -1 || colText.indexOf('piaoxia_add') !== -1);
  const archived = fs.readdirSync(path.join(dataRoot, 'piaoxia'));
  ok('归档 5 个原件（4 新 + 1 个 XML 原件补挂到已有票）', archived.length === 5, archived);
  ok('归档含 20 位号码名', archived.some((n) => n.startsWith('2431')), archived);

  const colAgain = await rpc('tools/call', { name: 'piaoxia_collect', arguments: { path: FIX } });
  ok('重复 collect 全部判重', /新增 0 张/.test(textOf(colAgain)), textOf(colAgain).slice(0, 120));

  console.log('== query ==');
  const pendingQ = await rpc('tools/call', { name: 'piaoxia_query', arguments: { type: 'pending' } });
  ok('待报销清单：铁路客票按票种归入交通类', textOf(pendingQ).indexOf('交通') !== -1, textOf(pendingQ).slice(0, 200));
  const search = await rpc('tools/call', { name: 'piaoxia_query', arguments: { type: 'search', q: '复印纸' } });
  ok('search 命中旧版票品名', textOf(search).indexOf('12345678') !== -1, textOf(search).slice(0, 200));
  const stats = await rpc('tools/call', { name: 'piaoxia_query', arguments: { type: 'stats' } });
  ok('stats 总览', textOf(stats).indexOf('票匣总览') !== -1, textOf(stats));

  console.log('== set_status 状态机 ==');
  const noTicket = await rpc('tools/call', { name: 'piaoxia_set_status', arguments: { number: '00000000000000000000', action: 'submit' } });
  ok('未知票拒绝', isError(noTicket), textOf(noTicket));
  const sub = await rpc('tools/call', { name: 'piaoxia_set_status', arguments: { number: '24312000000123456789', action: 'submit', reimburseId: 'R202611-1' } });
  ok('提交+单号', !isError(sub) && textOf(sub).indexOf('R202611-1') !== -1, textOf(sub));
  const reimburseQ = await rpc('tools/call', { name: 'piaoxia_query', arguments: { type: 'reimburse', reimburseId: 'R202611-1' } });
  ok('报销单明细可查', textOf(reimburseQ).indexOf('24312000000123456789') !== -1, textOf(reimburseQ));
  const settle = await rpc('tools/call', { name: 'piaoxia_set_status', arguments: { number: '24312000000123456789', action: 'settle' } });
  ok('到账', !isError(settle) && textOf(settle).indexOf('已到账') !== -1, textOf(settle));
  const badReopen = await rpc('tools/call', { name: 'piaoxia_set_status', arguments: { number: '24312000000123456789', action: 'reopen' } });
  ok('settled→pending 拒绝', isError(badReopen) && textOf(badReopen).indexOf('不允许') !== -1, textOf(badReopen));

  console.log('== update ==');
  const upd = await rpc('tools/call', { name: 'piaoxia_update', arguments: { number: '24122000000198765432', warrantyMonths: 36, note: '服务器整机保修' } });
  ok('补保修期', !isError(upd) && textOf(upd).indexOf('保修至 2029-10-01') !== -1, textOf(upd));
  const warrantyQ = await rpc('tools/call', { name: 'piaoxia_query', arguments: { type: 'warranty' } });
  ok('保修台账登记生效（36 个月超 90 天窗口不进到期榜，只报登记数）', textOf(warrantyQ).indexOf('已登记保修的票共 1 张') !== -1, textOf(warrantyQ));

  console.log('== delete confirm 门 ==');
  const noConfirm = await rpc('tools/call', { name: 'piaoxia_delete', arguments: { number: '24319000000011234567' } });
  ok('无 confirm 拒绝', isError(noConfirm) && textOf(noConfirm).indexOf('confirm') !== -1, textOf(noConfirm));
  const del = await rpc('tools/call', { name: 'piaoxia_delete', arguments: { number: '24319000000011234567', confirm: true } });
  ok('确认后删除', !isError(del), textOf(del));
  ok('归档原件保留', fs.readdirSync(path.join(dataRoot, 'piaoxia')).some((n) => n.startsWith('24319000000011234567')));

  console.log('== titles ==');
  const tadd = await rpc('tools/call', {
    name: 'piaoxia_titles',
    arguments: { action: 'add', name: '杭州某某网络科技有限公司', taxId: '91330106MA27XW1234', isDefault: true },
  });
  ok('抬头添加', !isError(tadd) && textOf(tadd).indexOf('91330106MA27XW1234') !== -1, textOf(tadd));
  const tdup = await rpc('tools/call', {
    name: 'piaoxia_titles',
    arguments: { action: 'add', name: '杭州某某网络科技有限公司', taxId: '91330106MA27XW1234' },
  });
  ok('抬头判重拒绝', isError(tdup), textOf(tdup));
  const tcopy = await rpc('tools/call', { name: 'piaoxia_titles', arguments: { action: 'copy' } });
  ok('copy 输出可贴文本', textOf(tcopy).indexOf('名称：杭州某某网络科技有限公司') !== -1, textOf(tcopy));
  const tlist = await rpc('tools/call', { name: 'piaoxia_titles', arguments: { action: 'list' } });
  ok('list 展示默认标记', textOf(tlist).indexOf('【默认】') !== -1, textOf(tlist));
} catch (e) {
  fail++;
  console.log('  ✗ 流程异常：' + (e && e.stack || e));
}

child.kill();
bridge.close();
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n' + pass + ' 通过, ' + fail + ' 失败');
process.exitCode = fail ? 1 : 0;
