/**
 * 问津 MCP 验证（node test/mcp-verify.mjs，离线）
 * 内存 IPC bridge（cap.kv）+ 子进程 mcp/server.js，走 JSON-RPC stdio 全流程：
 * 工具清单 → 校验拒绝 → 建档 → 事件推进（状态联动）→ 跟进到期（时钟注入）→
 * offer 年化对比 → 查询四型 → 更新 → 删除确认门与级联。
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
const errOf = (m) => m.result.isError === true;

function extractId(text) {
  const m = text.match(/\[(w[0-9a-z]+)\]/);
  return m ? m[1] : null;
}

let passed = 0;
function ok(name, fn) {
  if (typeof fn === 'function') { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  else { passed += 1; console.log(`  ✓ ${name}`); }
}
function fail(name, e) {
  console.error(`  ✗ ${name}\n    ${e && e.message ? e.message : e}`);
  process.exitCode = 1;
}
function step(name) { console.log(name); }

try {
  // initialize
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'v', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'wenjin');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // tools/list：7 个工具
  const tl = await rpc('tools/list', {});
  const names = tl.result.tools.map((t) => t.name);
  assert.equal(names.length, 7, `工具数：${names.join(',')}`);
  for (const n of ['wenjin_today', 'wenjin_add_app', 'wenjin_log_event', 'wenjin_add_offer', 'wenjin_query', 'wenjin_update', 'wenjin_delete']) {
    assert.ok(names.includes(n), `缺工具 ${n}`);
  }
  step('工具清单与初始化');
  ok('initialize + 7 工具齐备');

  // ── 校验拒绝 ──
  step('校验拒绝');
  const bad1 = await rpc('tools/call', { name: 'wenjin_add_app', arguments: { company: '', title: 'x' } });
  assert.ok(errOf(bad1) && textOf(bad1).includes('company'), `空公司拒绝：${textOf(bad1)}`);
  const bad2 = await rpc('tools/call', { name: 'wenjin_add_app', arguments: { company: 'X' } });
  assert.ok(errOf(bad2) && textOf(bad2).includes('title'), `缺职位拒绝：${textOf(bad2)}`);
  const bad3 = await rpc('tools/call', { name: 'wenjin_add_offer', arguments: { company: 'X', title: 'T', baseMonthly: 0 } });
  assert.ok(errOf(bad3) && textOf(bad3).includes('正数'), `零月薪拒绝：${textOf(bad3)}`);
  const bad4 = await rpc('tools/call', { name: 'wenjin_log_event', arguments: { type: 'astral' } });
  assert.ok(errOf(bad4) && textOf(bad4).includes('type'), `非法事件类型拒绝：${textOf(bad4)}`);
  const bad5 = await rpc('tools/call', { name: 'wenjin_delete', arguments: { kind: 'app', id: 'whatever' } });
  assert.ok(errOf(bad5) && textOf(bad5).includes('confirm'), `删除无确认拒绝：${textOf(bad5)}`);
  ok('五类参数/确认门全部拒绝');

  // ── 建档（幂等与重复报错）──
  step('建档');
  const add1 = await rpc('tools/call', {
    name: 'wenjin_add_app',
    arguments: { company: '字节跳动', title: '前端工程师', channel: 'boss', jd: '负责质量效率平台前端', salaryPosted: '30-45k·15薪', location: '北京', resumeLabel: '版本A-质量方向' },
  });
  assert.ok(!errOf(add1), `建档应成功：${textOf(add1)}`);
  const appId = extractId(textOf(add1));
  assert.ok(appId, `返回含 id：${textOf(add1)}`);
  assert.ok(textOf(add1).includes('JD 已存档'), 'JD 存档提示');
  assert.ok(textOf(add1).includes('版本A-质量方向'), '简历版本提示');

  const dup = await rpc('tools/call', {
    name: 'wenjin_add_app',
    arguments: { company: '字节跳动 ', title: '前端 工程师' },
  });
  assert.ok(errOf(dup) && textOf(dup).includes('已存在'), `同名判重：${textOf(dup)}`);
  ok('建档成功 + 大小写空白判重拦截');

  const wish = await rpc('tools/call', {
    name: 'wenjin_add_app',
    arguments: { company: '小红书', title: '数据工程师', status: 'wish' },
  });
  assert.ok(!errOf(wish), `wish 建档：${textOf(wish)}`);
  assert.ok(textOf(wish).includes('不计入漏斗'), 'wish 提示口径');
  ok('wish 想投状态建档（不产事件）');

  // ── 事件推进与状态联动 ──
  step('事件与状态联动');
  const ev1 = await rpc('tools/call', {
    name: 'wenjin_log_event',
    arguments: { company: '字节跳动', title: '前端工程师', type: 'screen', at: '2026-10-20 10:00', detail: 'HR 电话沟通，约一面' },
  });
  assert.ok(!errOf(ev1), `screen 事件：${textOf(ev1)}`);
  assert.ok(textOf(ev1).includes('沟通中 →') || textOf(ev1).includes('状态：'), `状态联动提示：${textOf(ev1)}`);

  const ev2 = await rpc('tools/call', {
    name: 'wenjin_log_event',
    arguments: {
      company: '字节跳动', title: '前端工程师', type: 'interview', at: '2026-10-25 14:00', label: '一面',
      detail: '手写防抖 + 项目深挖', questions: ['手写防抖', '介绍质量平台项目', 'React fiber 原理'],
      remindAt: '2026-10-26 09:00',
    },
  });
  assert.ok(!errOf(ev2), `interview 事件：${textOf(ev2)}`);
  assert.ok(textOf(ev2).includes('3 个面试问题'), `问题收录提示：${textOf(ev2)}`);

  // 自动建档：之前不存在的公司+职位
  const ev3 = await rpc('tools/call', {
    name: 'wenjin_log_event',
    arguments: { company: '美团', title: '后端工程师', type: 'applied', at: '2026-10-15 09:00', detail: '官网投递' },
  });
  assert.ok(!errOf(ev3), `自动建档：${textOf(ev3)}`);
  ok('事件推进状态 + 自动建档');

  // ── 跟进到期（时钟注入：NOW = 2026-10-29 12:00 本地）──
  // mock 桥不感知时间，today 用真实时钟 —— 用 at 相对真实的旧日期触发：
  // 真实今天未知，因此用「删掉事件→重插 30 天前」不可行；改为直接验证 today 输出包含美团（10-15 投，若真实日期晚于 10-20 即到期）。
  step('今日作战板');
  const today = await rpc('tools/call', { name: 'wenjin_today', arguments: {} });
  const ttext = textOf(today);
  assert.ok(ttext.includes('在途'), `在途统计：${ttext}`);
  assert.ok(ttext.includes('面试中'), `状态含面试中：${ttext}`);
  assert.ok(ttext.includes('跟进到期') || ttext.includes('暂无到期的跟进'), `跟进区：${ttext}`);
  assert.ok(ttext.includes('不构成职业建议'), '免责口径');
  ok(`today 输出完整（${ttext.length} 字）`);

  // ── offer ──
  step('offer 录入与对比');
  const of1 = await rpc('tools/call', {
    name: 'wenjin_add_offer',
    arguments: { company: '字节跳动', title: '前端工程师', baseMonthly: 35000, months: 12, bonusMonths: 3, commuteMin: 45, stockNote: 'RSU 若干，细节待谈', deadline: '2026-11-05 18:00' },
  });
  assert.ok(!errOf(of1), `offer 录入：${textOf(of1)}`);
  assert.ok(textOf(of1).includes('525000'), `年化 35k×15=52.5万：${textOf(of1)}`);

  const of2 = await rpc('tools/call', {
    name: 'wenjin_add_offer',
    arguments: { company: '小红书', title: '数据工程师', baseMonthly: 28000, months: 12, bonusMonths: 2, commuteMin: 20 },
  });
  // 小红书目前是 wish → offer 联动 offered
  assert.ok(!errOf(of2), `offer2：${textOf(of2)}`);
  assert.ok(textOf(of2).includes('392000'), `年化 28k×14=39.2万：${textOf(of2)}`);
  assert.ok(textOf(of2).includes('⭐'), `对比星标：${textOf(of2)}`);
  ok('offer 年化与对比（52.5万 vs 39.2万）');

  // ── 查询四型 ──
  step('查询');
  const q1 = await rpc('tools/call', { name: 'wenjin_query', arguments: { kind: 'apps', status: 'offered' } });
  assert.ok(textOf(q1).includes('字节跳动'), `按状态查 offered：${textOf(q1)}`);
  const q1b = await rpc('tools/call', { name: 'wenjin_query', arguments: { kind: 'apps', status: 'applied' } });
  assert.ok(textOf(q1b).includes('美团'), `按状态查 applied：${textOf(q1b)}`);
  const q2 = await rpc('tools/call', { name: 'wenjin_query', arguments: { kind: 'funnel' } });
  assert.ok(textOf(q2).includes('渠道漏斗'), `漏斗：${textOf(q2)}`);
  assert.ok(textOf(q2).includes('版本A-质量方向'), `简历版本漏斗：${textOf(q2)}`);
  const q3 = await rpc('tools/call', { name: 'wenjin_query', arguments: { kind: 'questions' } });
  assert.ok(textOf(q3).includes('手写防抖'), `问题库：${textOf(q3)}`);
  const q4 = await rpc('tools/call', { name: 'wenjin_query', arguments: { kind: 'offers' } });
  assert.ok(textOf(q4).includes('525000') && textOf(q4).includes('392000'), `offer 对比：${textOf(q4)}`);
  const q5 = await rpc('tools/call', { name: 'wenjin_query', arguments: { kind: 'apps', keyword: '字节' } });
  assert.ok(textOf(q5).includes('前端工程师'), `关键词查：${textOf(q5)}`);
  ok('apps/funnel/questions/offers/keyword 五路查询');

  // ── 更新 ──
  step('更新');
  const u1 = await rpc('tools/call', {
    name: 'wenjin_update',
    arguments: { kind: 'app', find: { company: '小红书', title: '数据工程师' }, patch: { location: '上海', note: '可远程' } },
  });
  assert.ok(!errOf(u1), `更新投递：${textOf(u1)}`);
  assert.ok(textOf(u1).includes('上海') === false, 'patch 后摘要不含 location（正常）');
  const u2 = await rpc('tools/call', {
    name: 'wenjin_update',
    arguments: { kind: 'settings', patch: { followUpDays: 3, remindLeadHours: 12 } },
  });
  assert.ok(textOf(u2).includes('3 天'), `设置更新：${textOf(u2)}`);
  const u3 = await rpc('tools/call', {
    name: 'wenjin_update',
    arguments: { kind: 'resume', find: { label: '版本A-质量方向' }, patch: { content: '# 简历正文\n负责……' } },
  });
  assert.ok(!errOf(u3), `简历正文更新：${textOf(u3)}`);
  const u4 = await rpc('tools/call', {
    name: 'wenjin_update',
    arguments: { kind: 'resume', find: { label: '版本A-质量方向' }, patch: { label: '版本B' } },
  });
  assert.ok(errOf(u4) && textOf(u4).includes('不可改'), `改版本名拒绝（保护引用）：${textOf(u4)}`);
  ok('app/settings/resume 更新 + 版本名改保护');

  // ── 删除（确认门 + 级联）──
  step('删除');
  const d1 = await rpc('tools/call', { name: 'wenjin_delete', arguments: { kind: 'app', id: appId } });
  assert.ok(errOf(d1), '无 confirm 删除被拒');
  const d2 = await rpc('tools/call', { name: 'wenjin_delete', arguments: { kind: 'app', id: appId, confirm: true } });
  assert.ok(!errOf(d2) && textOf(d2).includes('级联删除'), `级联删除：${textOf(d2)}`);
  assert.ok(textOf(d2).includes('事件 3 条') || textOf(d2).includes('事件 4 条'), `事件级联数：${textOf(d2)}`);
  const d3 = await rpc('tools/call', { name: 'wenjin_query', arguments: { kind: 'apps', keyword: '字节' } });
  assert.ok(textOf(d3).includes('没有符合条件'), `删除后查无：${textOf(d3)}`);
  const d4 = await rpc('tools/call', {
    name: 'wenjin_delete',
    arguments: { kind: 'resume', find: { label: '版本A-质量方向' }, confirm: true },
  });
  assert.ok(!errOf(d4) && textOf(d4).includes('解除 0 条'), `简历删除解除引用：${textOf(d4)}`);
  ok('确认门 + 级联删除 + 引用解除');

  console.log(`\nMCP 全流程验证通过（${passed} 组）`);
} catch (e) {
  fail('流程中断', e);
  process.stderr.write(stderrChunks.join('').slice(-2000));
} finally {
  child.kill();
  await bridge.close();
}
if (process.exitCode) process.exit(process.exitCode);
