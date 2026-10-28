/**
 * 常契 MCP 验证（node test/mcp-verify.mjs，离线）
 * 内存 IPC bridge（cap.kv）+ 子进程 mcp/server.js，走 JSON-RPC stdio 全流程：
 * 校验拒绝 → 入册（含试用）→ 列表 → 推进 → 取消引导 → 透视 → 窗口 → 删除确认门。
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

/** 今后第 n 天的 'YYYY-MM-DD'（本地时区） */
function dayFromNow(n) {
  const d = new Date(Date.now() + n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** 从工具返回文本中提取首个订阅 id */
function extractId(text) {
  const m = text.match(/\[(sub_[0-9a-z]+)\]/);
  return m ? m[1] : null;
}

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'v', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'changqi');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // tools/list：9 个工具
  const tl = await rpc('tools/list', {});
  const names = tl.result.tools.map((t) => t.name);
  assert.equal(names.length, 9, `工具数：${names.join(',')}`);
  for (const n of ['changqi_add', 'changqi_list', 'changqi_update', 'changqi_advance', 'changqi_cancel', 'changqi_delete', 'changqi_upcoming', 'changqi_summary', 'changqi_cancel_guide']) {
    assert.ok(names.includes(n), `缺工具 ${n}`);
  }

  // 参数校验
  const bad1 = await rpc('tools/call', { name: 'changqi_add', arguments: { name: 'x', amount: -5 } });
  assert.ok(textOf(bad1).includes('正数'), `金额校验：${textOf(bad1)}`);
  const bad2 = await rpc('tools/call', { name: 'changqi_add', arguments: { name: 'x', amount: 5, cycle: 'daily' } });
  assert.ok(textOf(bad2).includes('cycle'), `周期校验：${textOf(bad2)}`);
  const bad3 = await rpc('tools/call', { name: 'changqi_add', arguments: { name: 'x', amount: 5, cycle: 'custom' } });
  assert.ok(textOf(bad3).includes('cycleDays'), `custom 校验：${textOf(bad3)}`);
  const bad4 = await rpc('tools/call', { name: 'changqi_add', arguments: { name: 'x', amount: 5, anchorDate: '2026/01/01' } });
  assert.ok(textOf(bad4).includes('anchorDate'), `日期校验：${textOf(bad4)}`);
  const bad5 = await rpc('tools/call', { name: 'changqi_add', arguments: { name: 'x', amount: 5, channel: 'paypal' } });
  assert.ok(textOf(bad5).includes('channel'), `渠道校验：${textOf(bad5)}`);

  // 入册 1：今天扣费的视频会员（月付）
  const a1 = await rpc('tools/call', {
    name: 'changqi_add',
    arguments: { name: '视频会员', amount: 25, cycle: 'monthly', anchorDate: 'today', channel: 'wechat', category: '影视音乐' },
  });
  assert.ok(!a1.result.isError, `入册1：${textOf(a1)}`);
  assert.ok(textOf(a1).includes('月均支出 ¥25.00'), `月均口径：${textOf(a1)}`);
  assert.ok(textOf(a1).includes('下期扣费'), `下期提示：${textOf(a1)}`);
  const id1 = extractId(textOf(a1));
  assert.ok(id1, `提取 id1：${textOf(a1)}`);

  // 入册 2：试用期 AI 服务，3 天后转正（月付 20）
  const a2 = await rpc('tools/call', {
    name: 'changqi_add',
    arguments: { name: 'AI 助手 Pro', amount: 20, cycle: 'monthly', channel: 'card', category: 'AI 订阅', trialEndsAt: dayFromNow(3), note: '体验中' },
  });
  assert.ok(!a2.result.isError, `入册2（试用）：${textOf(a2)}`);
  assert.ok(textOf(a2).includes('试用期至'), `试用回显：${textOf(a2)}`);
  const id2 = extractId(textOf(a2));

  // 入册 3：年付云存储，10 天后到期（不在 7 天窗口）
  const a3 = await rpc('tools/call', {
    name: 'changqi_add',
    arguments: { name: '云盘年费', amount: 298, cycle: 'yearly', anchorDate: dayFromNow(10), channel: 'alipay', category: '云存储' },
  });
  assert.ok(!a3.result.isError, `入册3（年付）：${textOf(a3)}`);
  assert.ok(textOf(a3).includes('月均支出 ¥24.83'), `年付月均：${textOf(a3)}`);
  const id3 = extractId(textOf(a3));

  // 落库检查：三个 changqi.sub.* 键
  const subKeys = [...bridge.store.keys()].filter((k) => k.startsWith('changqi.sub.'));
  assert.equal(subKeys.length, 3, `落库键数：${subKeys}`);

  // advance 前：视频会员今天扣费 → 窗口带【今天】标记
  const up0 = await rpc('tools/call', { name: 'changqi_upcoming', arguments: {} });
  assert.ok(textOf(up0).includes('【今天】视频会员'), `today 标记：${textOf(up0)}`);
  const st0 = await rpc('tools/call', { name: 'changqi_summary', arguments: {} });
  assert.ok(textOf(st0).includes('今天将扣 1 笔'), `透视 today 提示：${textOf(st0)}`);

  // 列表：进行中 3 笔，月均合计 25+20+24.83=69.83
  const l1 = await rpc('tools/call', { name: 'changqi_list', arguments: {} });
  assert.ok(!l1.result.isError, `列表：${textOf(l1)}`);
  assert.ok(textOf(l1).includes('共 3 笔'), `列表计数：${textOf(l1)}`);
  assert.ok(textOf(l1).includes('月均 ¥69.83'), `列表月均：${textOf(l1)}`);
  // 排序：视频会员（今天）在最前
  assert.ok(textOf(l1).indexOf('视频会员') < textOf(l1).indexOf('AI 助手'), `排序：${textOf(l1)}`);
  // 关键词过滤
  const l2 = await rpc('tools/call', { name: 'changqi_list', arguments: { keyword: '云盘' } });
  assert.ok(textOf(l2).includes('云盘年费') && !textOf(l2).includes('视频会员'), `关键词过滤：${textOf(l2)}`);

  // 推进：确认视频会员今天已扣 → 下期一个月后
  const adv = await rpc('tools/call', { name: 'changqi_advance', arguments: { id: id1 } });
  assert.ok(!adv.result.isError, `推进：${textOf(adv)}`);
  assert.ok(textOf(adv).includes('已确认'), `推进回显：${textOf(adv)}`);
  // 落库 lastConfirmedDate
  const s1 = bridge.store.get(`changqi.sub.${id1}`);
  assert.ok(s1.lastConfirmedDate, `lastConfirmedDate 落库：${JSON.stringify(s1)}`);

  // 取消：云盘年费 → 附引导（alipay → 免密支付）
  const c1 = await rpc('tools/call', { name: 'changqi_cancel', arguments: { id: id3 } });
  assert.ok(!c1.result.isError, `取消：${textOf(c1)}`);
  assert.ok(textOf(c1).includes('免密支付'), `支付宝引导：${textOf(c1)}`);
  assert.ok(textOf(c1).includes('月均省下'), `省下口径：${textOf(c1)}`);
  // 取消后列表只剩 2 笔（进行中+试用）
  const l3 = await rpc('tools/call', { name: 'changqi_list', arguments: {} });
  assert.ok(textOf(l3).includes('共 2 笔'), `取消后列表：${textOf(l3)}`);
  // all 含已取消
  const l4 = await rpc('tools/call', { name: 'changqi_list', arguments: { status: 'all' } });
  assert.ok(textOf(l4).includes('共 3 笔'), `all 列表：${textOf(l4)}`);
  const l5 = await rpc('tools/call', { name: 'changqi_list', arguments: { status: 'cancelled' } });
  assert.ok(textOf(l5).includes('云盘年费'), `取消列表：${textOf(l5)}`);

  // 透视：进行中 2 笔，月均 25+20=45
  const st = await rpc('tools/call', { name: 'changqi_summary', arguments: {} });
  assert.ok(!st.result.isError, `透视：${textOf(st)}`);
  assert.ok(textOf(st).includes('月均支出 ¥45.00'), `透视月均：${textOf(st)}`);
  assert.ok(textOf(st).includes('年化 ¥540.00'), `透视年化：${textOf(st)}`);
  assert.ok(textOf(st).includes('已取消 1 笔留档'), `取消留档提示：${textOf(st)}`);
  assert.ok(textOf(st).includes('按渠道'), `渠道分布：${textOf(st)}`);
  // 试用转正预警（3 天 ≤ trialWarnDays 3）
  assert.ok(textOf(st).includes('试用临近转正'), `试用预警：${textOf(st)}`);

  // 窗口：7 天含 AI 助手转正（3 天）；视频会员已推进到下月，不在窗口
  const up = await rpc('tools/call', { name: 'changqi_upcoming', arguments: {} });
  assert.ok(!up.result.isError, `窗口：${textOf(up)}`);
  assert.ok(textOf(up).includes('【试用转正】') && textOf(up).includes('AI 助手'), `转正标记：${textOf(up)}`);
  assert.ok(textOf(up).includes('合计约 ¥20.00'), `窗口合计：${textOf(up)}`);
  assert.ok(!textOf(up).includes('视频会员'), `已推进不在窗口：${textOf(up)}`);
  // 3 天窗口仍含 AI 助手
  const up2 = await rpc('tools/call', { name: 'changqi_upcoming', arguments: { days: 3 } });
  assert.ok(textOf(up2).includes('AI 助手'), `小窗口：${textOf(up2)}`);

  // 更新：AI 助手改年付 → 月均 20/12=1.67
  const u1 = await rpc('tools/call', { name: 'changqi_update', arguments: { id: id2, amount: 240, cycle: 'yearly' } });
  assert.ok(!u1.result.isError, `更新：${textOf(u1)}`);
  assert.ok(textOf(u1).includes('月均 ¥20.00'), `更新后月均：${textOf(u1)}`);

  // 删除确认门
  const d0 = await rpc('tools/call', { name: 'changqi_delete', arguments: { id: id1, confirm: false } });
  assert.ok(d0.result.isError, `无确认删除应拒：${textOf(d0)}`);
  const d1 = await rpc('tools/call', { name: 'changqi_delete', arguments: { id: id1, confirm: true } });
  assert.ok(!d1.result.isError, `确认删除：${textOf(d1)}`);
  assert.ok(textOf(d1).includes('已彻底删除'), `删除回显：${textOf(d1)}`);
  assert.equal(bridge.store.has(`changqi.sub.${id1}`), false, '删除后键清理');

  // 取消引导（不改数据）
  const g1 = await rpc('tools/call', { name: 'changqi_cancel_guide', arguments: { channel: 'apple' } });
  assert.ok(textOf(g1).includes('订阅'), `apple 引导：${textOf(g1)}`);
  const g2 = await rpc('tools/call', { name: 'changqi_cancel_guide', arguments: { channel: 'wechat' } });
  assert.ok(textOf(g2).includes('钱包'), `wechat 引导：${textOf(g2)}`);

  console.log('✓ 常契 MCP 全流程验证通过（校验/入册/试用/列表/推进/取消引导/透视/窗口/更新/删除确认门/引导）');
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
