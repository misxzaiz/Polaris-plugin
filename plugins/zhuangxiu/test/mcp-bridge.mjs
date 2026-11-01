#!/usr/bin/env node
/**
 * MCP 全链路测试（内存桥）：node test/mcp-bridge.mjs
 * 起一个 stub 宿主（HTTP /api/router-dispatch + 内存 kv），以 POLARIS_HOST/PORT
 * 环境变量喂给真实 mcp/server.js 子进程，走完整 stdio JSON-RPC：
 * initialize → tools/list → 八工具全流程（漏项检查→标准模板→建增项科目→
 * 录预算→记账/幂等覆盖/asExtra→预算红黄绿→改账跨科目迁移→六查询视图→
 * 供应商/节点→confirm 删除门→对账小结→非法入参拒绝）。
 * 零业务 mock：桥只是把 cap.kv 换成内存 Map，读写语义与宿主一致。
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, '..');

// ── stub 宿主（内存 cap.kv）──────────────────────────────────────────────────
const store = new Map();
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/api/router-dispatch')) {
    res.writeHead(404); res.end('{}'); return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const { req: r } = JSON.parse(body);
      if (r.target !== 'cap.kv') { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'unknown target' })); return; }
      const a = r.payload;
      let result = {};
      if (a.action === 'get') result = { value: store.has(a.key) ? store.get(a.key) : null };
      else if (a.action === 'set') { store.set(a.key, a.value); result = {}; }
      else if (a.action === 'delete') { store.delete(a.key); result = {}; }
      else if (a.action === 'list') result = { keys: [...store.keys()] };
      else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'unknown action' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (e) {
      res.writeHead(200); res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

// ── 起 MCP 子进程 ─────────────────────────────────────────────────────────────
const child = spawn(process.execPath, [path.join(pluginDir, 'mcp', 'server.js'), ''], {
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(port), POLARIS_TOKEN: '' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (c) => { stderr += c; });

let buf = '';
const pending = new Map();
let nextId = 1;
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch (_) { /* 忽略非 JSON 行 */ }
  }
});
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`RPC 超时: ${method}`)); } }, 10000);
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}
async function call(name, args) {
  const res = await rpc('tools/call', { name, arguments: args });
  const text = res.result?.content?.[0]?.text || '';
  return { isError: !!res.result?.isError, text };
}

const results = [];
function t(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: cond ? '' : (detail || '断言失败') });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` —— ${detail || ''}`}`);
}
const expKeys = () => [...store.keys()].filter((k) => k.startsWith('zhuangxiu.exp.'));
const expArr = () => expKeys().map((k) => store.get(k));

// ── initialize / tools/list ──────────────────────────────────────────────────
const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'harness', version: '0' } });
t('initialize 返回 serverInfo zhuangxiu', init.result?.serverInfo?.name === 'zhuangxiu', JSON.stringify(init.result));
notify('notifications/initialized', {});
const list = await rpc('tools/list', {});
const toolNames = (list.result?.tools || []).map((x) => x.name);
t('tools/list 八工具', JSON.stringify(toolNames) === JSON.stringify(['zx_record', 'zx_category', 'zx_query', 'zx_vendor', 'zx_milestone', 'zx_update', 'zx_delete', 'zx_summary']), toolNames.join(','));

// ── 漏项检查（模板前）→ 标准模板 ─────────────────────────────────────────────
let r = await call('zx_query', { view: 'missing' });
t('模板前漏项检查列出常见漏项', !r.isError && r.text.includes('垃圾清运') && r.text.includes('美缝'), r.text);
r = await call('zx_category', { action: 'template' });
t('标准模板一键采用（30 科目）', !r.isError && r.text.includes('30 个'), r.text);
r = await call('zx_query', { view: 'missing' });
t('模板后漏项归零', !r.isError && r.text.includes('通过'), r.text);
const catKeys = () => [...store.keys()].filter((k) => k.startsWith('zhuangxiu.cat.'));
t('模板落库 30 个科目键', catKeys().length === 30, String(catKeys().length));

// ── 项目档案 ─────────────────────────────────────────────────────────────────
r = await call('zx_category', { action: 'project', name: '世纪花园', totalBudget: 300000, house: '3-502' });
t('项目档案建立（总预算 300000）', !r.isError && r.text.includes('世纪花园') && r.text.includes('300,000'), r.text);
r = await call('zx_category', { action: 'project', totalBudget: -1 });
t('总预算负数拒绝', r.isError, r.text);

// ── 科目 add/set ─────────────────────────────────────────────────────────────
r = await call('zx_category', { action: 'add', name: '窗套加固', group: '木工', isExtra: true });
t('建增项科目', !r.isError && r.text.includes('增项科目'), r.text);
r = await call('zx_category', { action: 'add', name: '瓷砖' });
t('重复建科目拒绝（模板已有）', r.isError && r.text.includes('已存在'), r.text);
r = await call('zx_category', { action: 'set', name: '瓷砖', budget: 8000 });
t('录瓷砖预算 8000', !r.isError && r.text.includes('8,000'), r.text);
r = await call('zx_category', { action: 'set', name: '水电改造', budget: 15000 });
t('录水电预算 15000', !r.isError, r.text);

// ── 记账（自动建供应商/科目快照/幂等/asExtra）────────────────────────────────
r = await call('zx_record', { amount: 3200, categoryName: '瓷砖', vendorName: '张师傅', note: '80x80 灰砖', id: 'dup1' });
t('记瓷砖 3200 → 绿（40%）+ 供应商自动建档', !r.isError && r.text.includes('已记录') && r.text.includes('【绿】') && r.text.includes('张师傅'), r.text);
r = await call('zx_record', { amount: 3200, categoryName: '瓷砖', id: 'dup1' });
t('同 id 幂等覆盖', !r.isError && r.text.includes('已覆盖更新'), r.text);
t('dup1 不双写（恰好 1 笔支出）', expArr().filter((x) => x.id === 'dup1').length === 1 && expArr().length === 1, `实际 ${expArr().length} 笔`);
r = await call('zx_record', { amount: 4400, categoryName: '瓷砖' });
t('再记 4400 → 瓷砖 95% 临超【黄】', !r.isError && r.text.includes('【黄·临超】') && r.text.includes('95%'), r.text);
r = await call('zx_record', { amount: 500, categoryName: '瓷砖', time: '15:00' });
t('再记 500 → 瓷砖超支【红】', !r.isError && r.text.includes('【红·超支】'), r.text);
r = await call('zx_record', { amount: 800, categoryName: '窗套加固' });
t('增项科目记账 → 计入增项合计', !r.isError && r.text.includes('增项口径') && r.text.includes('800 元'), r.text);
r = await call('zx_record', { amount: 100, categoryName: '垃圾清运费', asExtra: true });
t('asExtra 模糊命中已有科目 → 拒绝并引导（不静默改记普通科目）', r.isError && r.text.includes('相近科目'), r.text);
r = await call('zx_record', { amount: 600, categoryName: '窗台大理石加固', asExtra: true });
t('asExtra 一步建增项科目并记账', !r.isError && r.text.includes('窗台大理石加固') && r.text.includes('增项科目') && r.text.includes('计入增项合计'), r.text);
const red500 = expArr().find((x) => x.amount === 500 && x.catId === expArr().find((e) => e.id === 'dup1')?.catId);
t('500 那笔落库（time 15:00）', !!red500, JSON.stringify(expArr().map((x) => x.amount)));

// ── 非法入参 ─────────────────────────────────────────────────────────────────
r = await call('zx_record', { amount: 0, categoryName: '瓷砖' });
t('金额 0 拒绝', r.isError && r.text.includes('不含 0'), r.text);
r = await call('zx_record', { amount: -5, categoryName: '瓷砖' });
t('金额负数拒绝', r.isError, r.text);
r = await call('zx_record', { amount: 100, categoryName: '不存在的科目' });
t('未知科目拒单并提示 asExtra', r.isError && r.text.includes('asExtra'), r.text);
r = await call('zx_record', { amount: 100, categoryName: '瓷砖', date: '2026-02-30' });
t('非法日期拒绝', r.isError && r.text.includes('无法识别'), r.text);

// ── 修改（含跨科目迁移）──────────────────────────────────────────────────────
r = await call('zx_update', { id: red500.id, amount: 500, categoryName: '水电改造' });
t('改 500 那笔迁移到水电改造', !r.isError && r.text.includes('水电改造') && r.text.includes('【绿】'), r.text);
const tileCatId = expArr().find((x) => x.id === 'dup1').catId;
const tileRecs = expArr().filter((x) => x.catId === tileCatId);
t('瓷砖回到 2 笔 7600（95% 黄）', tileRecs.length === 2 && Math.abs(tileRecs.reduce((s, x) => s + x.amount, 0) - 7600) < 0.01, JSON.stringify(tileRecs.map((x) => x.amount)));
r = await call('zx_update', { id: 'nope', amount: 100 });
t('不存在 id 报错', r.isError && r.text.includes('未找到'), r.text);

// ── 查询六视图 ───────────────────────────────────────────────────────────────
r = await call('zx_query', { view: 'budget' });
t('budget 总览含总预算与增项合计', !r.isError && r.text.includes('300,000') && r.text.includes('增项合计'), r.text);
t('budget 含瓷砖黄档行', r.text.includes('瓷砖') && r.text.includes('黄·临超'), r.text);
r = await call('zx_query', { view: 'recent', catName: '瓷砖' });
t('recent 按科目过滤（瓷砖 2 笔）', !r.isError && r.text.includes('2 笔流水') && r.text.includes('3,200'), r.text);
r = await call('zx_query', { view: 'recent', vendorName: '张师傅' });
t('recent 按供应商过滤', !r.isError && r.text.includes('张师傅'), r.text);
r = await call('zx_query', { view: 'extra' });
t('extra 增项视图（1400 元 2 笔）', !r.isError && r.text.includes('1,400') && r.text.includes('2 笔'), r.text);
if (process.env.ZX_DEBUG) console.error('DEBUG-STORE', JSON.stringify([...store.entries()].filter(([k]) => k.includes('.ven.') || k.includes('.exp.'))));
r = await call('zx_query', { view: 'vendors' });
t('vendors 视图含张师傅已付', !r.isError && r.text.includes('张师傅') && r.text.includes('3,200'), r.text);
r = await call('zx_query', { view: 'milestones' });
t('milestones 空提示', !r.isError && r.text.includes('还没有工期节点'), r.text);
r = await call('zx_query', { view: '垃圾' });
t('未知 view 拒绝', r.isError && r.text.includes('未知 view'), r.text);

// ── 供应商 ───────────────────────────────────────────────────────────────────
r = await call('zx_vendor', { action: 'add', name: '李工长', role: '全包公司', phone: '13900000000', contractAmount: 250000 });
t('供应商建档（合同额）', !r.isError && r.text.includes('李工长') && r.text.includes('250,000'), r.text);
r = await call('zx_vendor', { action: 'add', name: '李工长' });
t('重复供应商拒绝', r.isError && r.text.includes('已存在'), r.text);
r = await call('zx_vendor', { action: 'list' });
t('供应商列表', !r.isError && r.text.includes('李工长') && r.text.includes('张师傅'), r.text);

// ── 节点 ─────────────────────────────────────────────────────────────────────
r = await call('zx_milestone', { action: 'add', title: '水电验收', date: '2026-10-30' });
t('节点已过期提示（红）', !r.isError && r.text.includes('日期已过'), r.text);
r = await call('zx_milestone', { action: 'add', title: '泥瓦验收', date: '2026-11-03' });
t('节点 3 天内（黄）', !r.isError, r.text);
r = await call('zx_milestone', { action: 'done', title: '水电验收' });
t('节点标完成', !r.isError && r.text.includes('已完成'), r.text);
r = await call('zx_milestone', { action: 'list' });
t('节点红黄榜（泥瓦验收黄）', !r.isError && r.text.includes('【黄·还剩') && r.text.includes('【绿·已完成】'), r.text);
r = await call('zx_milestone', { action: 'add', title: '竣工验收', date: '垃圾日' });
t('节点非法日期拒绝', r.isError && r.text.includes('无法识别'), r.text);

// ── 删除 confirm 门 ──────────────────────────────────────────────────────────
const victim = expArr().find((x) => x.amount === 800 && x.id !== 'dup1');
r = await call('zx_delete', { kind: 'expense', id: victim.id });
t('无 confirm 拒绝', r.isError && r.text.includes('confirm'), r.text);
const nBefore = expKeys().length;
r = await call('zx_delete', { kind: 'expense', id: victim.id, confirm: true });
t('confirm 后删除支出', !r.isError && r.text.includes('已删除'), r.text);
t('支出键数减一', expKeys().length === nBefore - 1, `${nBefore}→${expKeys().length}`);
r = await call('zx_delete', { kind: 'category', categoryName: '瓷砖', confirm: true });
t('有支出科目拒删', r.isError && r.text.includes('2 笔支出'), r.text);
r = await call('zx_delete', { kind: 'vendor', vendorName: '李工长', confirm: true });
t('删供应商保留流水', !r.isError && r.text.includes('历史流水保留'), r.text);

// ── 对账小结 ─────────────────────────────────────────────────────────────────
r = await call('zx_summary', {});
t('小结含标题与项目', !r.isError && r.text.includes('装修对账小结') && r.text.includes('世纪花园'), r.text.slice(0, 120));
t('小结含分科目表/增项/漏项免责', r.text.includes('| 科目 |') && r.text.includes('增项合计') && r.text.includes('不构成造价/法律建议'), '');

// ── 收尾 ─────────────────────────────────────────────────────────────────────
child.kill();
server.close();
const fails = results.filter((x) => !x.pass);
console.log(`\n${results.length - fails.length}/${results.length} 通过`);
if (fails.length) {
  console.error('stderr tail:', stderr.slice(-500));
  process.exit(1);
}
console.log('✅ MCP 内存桥全链路通过（八工具 + 幂等 + asExtra 增项 + 红黄绿 + confirm 门 + 小结）');
process.exit(0);
