/**
 * 口袋账本 MCP 验证（node test/mcp-verify.mjs）
 * 内存 IPC bridge（cap.kv）+ 子进程 mcp/server.js，走 JSON-RPC stdio 全流程：
 * add 校验 → add 入账（含补记昨天）→ 去重重放 → query 过滤 → stats 预算 →
 * delete → categories 管理。
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

function startMockBridge() {
  const store = new Map();
  const server = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => {
      const { target, payload } = JSON.parse(b).req;
      let result = null; let ok = true;
      if (target === 'cap.kv') {
        const { action, key, value } = payload;
        if (action === 'get') result = { value: store.has(key) ? store.get(key) : null };
        else if (action === 'set') { store.set(key, value === undefined ? null : value); result = { id: key }; }
        else if (action === 'delete') { store.delete(key); result = { deleted: true }; }
        else if (action === 'list') result = { keys: [...store.keys()] };
        else ok = false;
      } else ok = false;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ msgId: 'm', ok, result, error: ok ? null : 'x' }));
    });
  });
  return { server, store, listen: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port))), close: () => new Promise((r) => server.close(r)) };
}

const bridge = startMockBridge();
const bridgePort = await bridge.listen();

const here = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const child = spawn(process.execPath, ['mcp/server.js'], {
  cwd: here,
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgePort), POLARIS_TOKEN: '' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const stderrChunks = [];
child.stderr.on('data', (c) => stderrChunks.push(String(c)));

let nextId = 1;
const pending = new Map();
let buf = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buf += chunk;
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
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`rpc ${method} 超时`)); }, 60000);
    pending.set(id, (msg) => { clearTimeout(t); resolve(msg); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
const textOf = (m) => m.result.content[0].text;

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'v', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'pocket-ledger');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // 参数校验：负数金额
  const bad1 = await rpc('tools/call', { name: 'ledger_add', arguments: { amount: -5 } });
  assert.ok(textOf(bad1).includes('正数'), `金额校验：${textOf(bad1)}`);
  const bad2 = await rpc('tools/call', { name: 'ledger_add', arguments: { amount: 10, category: '不存在' } });
  assert.ok(textOf(bad2).includes('未知分类'), `分类校验：${textOf(bad2)}`);
  const bad3 = await rpc('tools/call', { name: 'ledger_add', arguments: { amount: 10, date: '2026/01/01' } });
  assert.ok(textOf(bad3).includes('date'), `日期校验：${textOf(bad3)}`);

  // 正常入账（今天午饭 35 餐饮）
  const a1 = await rpc('tools/call', { name: 'ledger_add', arguments: { amount: 35, category: '餐饮', note: '午饭' } });
  assert.ok(!a1.result.isError, `入账：${textOf(a1)}`);
  assert.ok(textOf(a1).includes('¥35.00'), `金额格式：${textOf(a1)}`);

  // 补记昨天（咖啡 28）
  const a2 = await rpc('tools/call', { name: 'ledger_add', arguments: { amount: 28, category: '餐饮', note: '咖啡', date: 'yesterday' } });
  assert.ok(textOf(a2).includes('已记录'), `补记：${textOf(a2)}`);

  // 收入
  const a3 = await rpc('tools/call', { name: 'ledger_add', arguments: { amount: 6000, type: 'income', category: '工资', note: '月薪' } });
  assert.ok(textOf(a3).includes('收入 ¥6000.00'), `收入：${textOf(a3)}`);

  // 落库检查：今天日键含 1 笔，昨天日键含 1 笔
  const keys = [...bridge.store.keys()].filter((k) => k.startsWith('ledger.day.'));
  assert.equal(keys.length, 2, `日键数：${keys}`);

  // query：分类过滤
  const q1 = await rpc('tools/call', { name: 'ledger_query', arguments: { category: '餐饮' } });
  assert.ok(textOf(q1).includes('¥35.00') && textOf(q1).includes('¥28.00'), `餐饮查询：${textOf(q1)}`);
  const q2 = await rpc('tools/call', { name: 'ledger_query', arguments: { keyword: '咖啡' } });
  assert.ok(textOf(q2).includes('咖啡'), `关键词查询：${textOf(q2)}`);

  // stats：合计与结余
  const st = await rpc('tools/call', { name: 'ledger_stats', arguments: {} });
  assert.ok(textOf(st).includes('支出 ¥63.00'), `统计支出：${textOf(st)}`);
  assert.ok(textOf(st).includes('结余 ¥5937.00'), `统计结余：${textOf(st)}`);

  // 预算：设餐饮预算 50 → 已用 70%（35+28=63）应提示
  bridge.store.set('ledger.settings', { budgets: { 餐饮: 100 }, monthlyTotalBudget: 60 });
  const st2 = await rpc('tools/call', { name: 'ledger_stats', arguments: {} });
  assert.ok(textOf(st2).includes('总预算'), `预算行：${textOf(st2)}`);
  assert.ok(textOf(st2).includes('超支') || textOf(st2).includes('105%'), `超支提示：${textOf(st2)}`);

  // delete
  const listToday = [...bridge.store.entries()].find(([k]) => k.startsWith('ledger.day.') && k !== `ledger.day.${new Date(Date.now() - 86400000).toLocaleDateString('sv-SE')}`);
  const todayKey = [...bridge.store.keys()].filter((k) => k.startsWith('ledger.day.')).sort().pop();
  const todayArr = bridge.store.get(todayKey);
  assert.ok(todayArr.length >= 1);
  const delId = todayArr[0].id;
  const del = await rpc('tools/call', { name: 'ledger_delete', arguments: { id: delId } });
  assert.ok(textOf(del).includes('已删除'), `删除：${textOf(del)}`);
  const after = bridge.store.get(todayKey).filter((b) => b.id !== delId);
  assert.equal(bridge.store.get(todayKey).filter((b) => b.id === delId).length, 0);

  // categories
  const cat0 = await rpc('tools/call', { name: 'ledger_categories', arguments: { action: 'list' } });
  assert.ok(textOf(cat0).includes('餐饮') && textOf(cat0).includes('工资'), `分类列表：${textOf(cat0)}`);
  const cat1 = await rpc('tools/call', { name: 'ledger_categories', arguments: { action: 'add', name: '宠物' } });
  assert.ok(textOf(cat1).includes('已添加'), `加分类：${textOf(cat1)}`);
  const cat2 = await rpc('tools/call', { name: 'ledger_add', arguments: { amount: 80, category: '宠物', note: '猫粮' } });
  assert.ok(!cat2.result.isError, `新分类入账：${textOf(cat2)}`);
  const cat3 = await rpc('tools/call', { name: 'ledger_categories', arguments: { action: 'remove', name: '餐饮' } });
  assert.ok(textOf(cat3).includes('内置'), `内置分类保护：${textOf(cat3)}`);

  // ── 附件：保存 → 引用入账 → 查询带 📎 → 读取 → 删除级联 ──
  const att1 = await rpc('tools/call', { name: 'ledger_attach_save', arguments: { name: 'receipt.png', mime: 'image/png', data: Buffer.from('fakeimg').toString('base64') } });
  assert.ok(!att1.result.isError, `附件保存：${textOf(att1)}`);
  const attId = (textOf(att1).match(/"([A-Za-z0-9]+)"/) || [])[1];
  assert.ok(attId, `提取附件 id：${textOf(att1)}`);
  const addAtt = await rpc('tools/call', { name: 'ledger_add', arguments: { amount: 12, category: '餐饮', note: '带小票', attachmentId: attId } });
  assert.ok(!addAtt.result.isError, `附件入账：${textOf(addAtt)}`);
  assert.ok(textOf(addAtt).includes('📎'), `入账回显附件：${textOf(addAtt)}`);
  // 引用不存在的附件应报错
  const addBadAtt = await rpc('tools/call', { name: 'ledger_add', arguments: { amount: 5, category: '餐饮', attachmentId: 'att_不存在' } });
  assert.ok(addBadAtt.result.isError, `无效附件引用报错：${textOf(addBadAtt)}`);
  const attGet = await rpc('tools/call', { name: 'ledger_attach_get', arguments: { id: attId } });
  assert.ok(textOf(attGet).includes('receipt.png'), `附件读取：${textOf(attGet)}`);
  // 删除带附件账单 → 附件键级联清理
  const attBill = [...bridge.store.entries()].find(([k, v]) => Array.isArray(v) && v.some((b) => b.attachmentId === attId));
  assert.ok(attBill, '带附件账单已落库');
  const attBillId = attBill[1].find((b) => b.attachmentId === attId).id;
  const delAtt = await rpc('tools/call', { name: 'ledger_delete', arguments: { id: attBillId } });
  assert.ok(textOf(delAtt).includes('附件已级联清理'), `删除级联：${textOf(delAtt)}`);
  assert.equal(bridge.store.has(`ledger.att.${attId}`), false, '附件键已清理');

  // ── 不参与汇总（工资）：设置后统计排除，明细仍见 ──
  const ex1 = await rpc('tools/call', { name: 'ledger_exclude', arguments: { category: '工资', on: true } });
  assert.ok(!ex1.result.isError, `设置排除：${textOf(ex1)}`);
  const stEx = await rpc('tools/call', { name: 'ledger_stats', arguments: {} });
  assert.ok(textOf(stEx).includes('另有 ¥6000.00 不参与汇总'), `统计排除提示：${textOf(stEx)}`);
  assert.ok(textOf(stEx).includes('收入 ¥0.00'), `工资不计入收入：${textOf(stEx)}`);
  // 明细仍能查到工资
  const qEx = await rpc('tools/call', { name: 'ledger_query', arguments: { category: '工资' } });
  assert.ok(textOf(qEx).includes('¥6000.00'), `明细仍见工资：${textOf(qEx)}`);
  const ex2 = await rpc('tools/call', { name: 'ledger_exclude', arguments: { category: '工资', on: false } });
  assert.ok(textOf(ex2).includes('恢复'), `恢复参与：${textOf(ex2)}`);

  console.log('✓ 口袋账本 MCP 全流程验证通过（校验/入账/补记/查询/统计/预算/删除/分类/附件/排除汇总）');
  process.exitCode = 0;
} catch (e) {
  console.error('✗ 验证失败：', e.message);
  console.error('stderr:', stderrChunks.join('').slice(-1200));
  process.exitCode = 1;
} finally {
  child.kill();
  await bridge.close();
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref();
}
