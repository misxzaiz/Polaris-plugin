/**
 * 问津离线单测（node test/run-tests.mjs，零依赖零网络）
 * 覆盖：normalize 边界 / 时间解析 / 管道与跟进到期 / 漏斗四级归因 /
 *       offer 年化对比 / 复盘问题库 / CSV 导出导入（判重与未知值降级）
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

const DAY = core.DAY_MS;
const NOW = new Date(2026, 9, 29, 12, 0, 0).getTime(); // 2026-10-29 12:00 本地

let passed = 0;
function ok(name, fn) {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

// ── normalize ───────────────────────────────────────────────────────────
console.log('normalize');

ok('公司名空白拒绝', () => {
  assert.throws(() => core.normalizeCompany({ name: '   ' }, null), /公司名/);
});

ok('公司名归一：同名异写同 id', () => {
  const a = core.normalizeCompany({ name: '字节跳动' }, null);
  const b = core.normalizeCompany({ name: ' 字节跳动  ' }, null);
  assert.equal(a.id, b.id);
  assert.equal(b.name, '字节跳动');
});

ok('英文公司名大小写不分裂 id', () => {
  const a = core.normalizeCompany({ name: 'OpenAI' }, null);
  const b = core.normalizeCompany({ name: 'openai' }, null);
  assert.equal(a.id, b.id);
  assert.equal(b.name, 'openai'); // 展示态保留原写法
});

ok('职位空拒绝；同公司同职位同 id（find-or-create 幂等）', () => {
  assert.throws(() => core.normalizeApp({ title: '  ', companyName: 'X' }, null), /职位/);
  assert.throws(() => core.normalizeApp({ title: '前端', companyName: '' }, null), /公司/);
  const c = core.normalizeCompany({ name: 'X 公司' }, null);
  const a1 = core.normalizeApp({ title: '前端工程师', companyId: c.id, companyName: 'X 公司' }, null);
  const a2 = core.normalizeApp({ title: '  前端工程师  ', companyId: c.id, companyName: 'X  公司' }, null);
  assert.equal(a1.id, a2.id);
  // 词中空格也是同一岗位（'Java 开发' ≡ 'Java开发'），展示名保留原写法
  const a3 = core.normalizeApp({ title: 'Java 开发', companyId: c.id, companyName: 'X 公司' }, null);
  const a4 = core.normalizeApp({ title: 'Java开发', companyId: c.id, companyName: 'X 公司' }, null);
  assert.equal(a3.id, a4.id);
  assert.equal(a3.title, 'Java 开发');
  assert.equal(a4.title, 'Java开发');
});

ok('非法状态/渠道降级为 wish/other 不炸', () => {
  const a = core.normalizeApp({ title: 'T', companyName: 'C', status: 'hacker', channel: '朋友圈' }, null);
  assert.equal(a.status, 'wish');
  assert.equal(a.channel, 'other');
});

ok('事件必须挂投递；非法类型降级 note', () => {
  assert.throws(() => core.normalizeEvent({ type: 'interview' }, null, ''), /投递/);
  const e = core.normalizeEvent({ type: 'on-site', detail: 'x' }, null, 'app1');
  assert.equal(e.type, 'note');
});

ok('事件幂等键：同投递同型同刻同文 = 同一条', () => {
  const at = '2026-10-28 14:30';
  const e1 = core.normalizeEvent({ type: 'interview', at, detail: '二面' }, null, 'app1');
  const e2 = core.normalizeEvent({ type: 'interview', at: '2026-10-28T14:30:00', detail: '二面' }, null, 'app1');
  assert.equal(e1.id, e2.id);
  const e3 = core.normalizeEvent({ type: 'interview', at, detail: '三面' }, null, 'app1');
  assert.notEqual(e1.id, e3.id);
});

ok('questions：字符串拆行 / 数组 / 去空 / 截断 300', () => {
  const e = core.normalizeEvent({ type: 'interview', questions: 'Q1\n\n Q2 \nQ3' }, null, 'app1');
  assert.deepEqual(e.questions, ['Q1', 'Q2', 'Q3']);
  const e2 = core.normalizeEvent({ type: 'interview', questions: ['A'.repeat(400), '  ', 42] }, null, 'app1');
  assert.equal(e2.questions.length, 2);
  assert.equal(e2.questions[0].length, 300);
  assert.equal(e2.questions[1], '42');
});

ok('offer：baseMonthly 必须 > 0；months/bonus 钳制', () => {
  assert.throws(() => core.normalizeOffer({ baseMonthly: 0 }, null, 'app1'), /正数/);
  assert.throws(() => core.normalizeOffer({ baseMonthly: 'abc' }, null, 'app1'), /正数/);
  const o = core.normalizeOffer({ baseMonthly: 20000, months: 99, bonusMonths: -5 }, null, 'app1');
  assert.equal(o.months, 24);
  assert.equal(o.bonusMonths, 0);
});

ok('offer 每 app 一份：同 app 重算同 id（重复添加=更新语义）', () => {
  const o1 = core.normalizeOffer({ baseMonthly: 20000 }, null, 'app1');
  const o2 = core.normalizeOffer({ baseMonthly: 25000 }, null, 'app1');
  assert.equal(o1.id, o2.id);
});

ok('settings 钳制：followUpDays 1..60，remindLeadHours 1..168', () => {
  const s = core.normalizeSettings({ followUpDays: 999, remindLeadHours: 0 }, null);
  assert.equal(s.followUpDays, 60);
  assert.equal(s.remindLeadHours, 1);
  const s2 = core.normalizeSettings({ followUpDays: 'abc' }, null);
  assert.equal(s2.followUpDays, 5);
});

// ── 时间解析 ────────────────────────────────────────────────────────────
console.log('时间解析');

ok('三种格式解析一致（本地时区）', () => {
  const a = core.parseTs('2026-10-28');
  const b = core.parseTs('2026-10-28 00:00');
  const c = core.parseTs('2026-10-28T00:00:00');
  assert.equal(a, b);
  assert.equal(a, c);
  assert.equal(core.parseTs('垃圾'), null);
  assert.equal(core.parseTs(''), null);
  assert.equal(core.parseTs(null), null);
});

ok('分钟精度键跨格式稳定', () => {
  assert.equal(core.minuteKey(core.parseTs('2026-10-28 14:30')), core.minuteKey(core.parseTs('2026-10-28T14:30:59')));
});

// ── 管道 / 跟进 ────────────────────────────────────────────────────────
console.log('管道与跟进');

function mkApp(id, status, extra) {
  return core.normalizeApp({ title: 'T' + id, companyName: 'C' + id, status, appliedAt: '2026-10-01 09:00', ...extra }, null, 'C' + id);
}
function mkEvent(appId, type, at, extra) {
  return core.normalizeEvent({ type, at, ...extra }, null, appId);
}

const SETTINGS5 = { schemaVersion: 1, followUpDays: 5, remindLeadHours: 24 };

ok('状态计数与活跃排序：面试在前', () => {
  const apps = [
    mkApp('1', 'applied'), mkApp('2', 'interview'), mkApp('3', 'wish'),
    mkApp('4', 'rejected'), mkApp('5', 'interview'),
  ];
  const p = core.pipeline(apps);
  assert.equal(p.counts.interview, 2);
  assert.equal(p.counts.rejected, 1);
  assert.equal(p.active[0].status, 'interview');
  assert.equal(p.active[p.active.length - 1].status, 'rejected');
});

ok('跟进到期：恰好第 5 天即到期（>= 语义）', () => {
  const last = NOW - 5 * DAY; // 恰好 5 天前
  const apps = [mkApp('1', 'applied')];
  const events = [mkEvent(apps[0].id, 'applied', new Date(last).toISOString())];
  const due = core.followUps(apps, events, SETTINGS5, NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].daysSince, 5);
});

ok('跟进到期：4 天23小时未到期', () => {
  const last = NOW - (5 * DAY - 60 * 60 * 1000);
  const apps = [mkApp('1', 'applied')];
  const events = [mkEvent(apps[0].id, 'applied', new Date(last).toISOString())];
  assert.equal(core.followUps(apps, events, SETTINGS5, NOW).length, 0);
});

ok('跟进到期：wish / 终态 / 归档不点名', () => {
  const last = NOW - 20 * DAY;
  const apps = [mkApp('1', 'wish'), mkApp('2', 'rejected'), mkApp('3', 'withdrawn')];
  const appsArch = [mkApp('4', 'applied', { archived: true })];
  const events = [];
  for (const a of [...apps, ...appsArch]) events.push(mkEvent(a.id, 'applied', new Date(last).toISOString()));
  assert.equal(core.followUps(apps, events, SETTINGS5, NOW).length, 0);
  assert.equal(core.followUps(appsArch, events, SETTINGS5, NOW).length, 0);
});

ok('跟进到期：笔试后没信也点名（written 在覆盖面内）', () => {
  const apps = [mkApp('1', 'written')];
  const events = [mkEvent(apps[0].id, 'written', new Date(NOW - 6 * DAY).toISOString())];
  const due = core.followUps(apps, events, SETTINGS5, NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].daysSince, 6);
});

ok('跟进到期：无事件时回退 appliedAt / createdAt', () => {
  const apps = [core.normalizeApp({ title: 'T', companyName: 'C', status: 'applied', appliedAt: new Date(NOW - 9 * DAY).toISOString() }, null, 'C')];
  const due = core.followUps(apps, [], SETTINGS5, NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].daysSince, 9);
});

ok('跟进到期按失联天数倒序', () => {
  const apps = [mkApp('1', 'applied'), mkApp('2', 'screening')];
  const events = [
    mkEvent(apps[0].id, 'applied', new Date(NOW - 6 * DAY).toISOString()),
    mkEvent(apps[1].id, 'screen', new Date(NOW - 15 * DAY).toISOString()),
  ];
  const due = core.followUps(apps, events, SETTINGS5, NOW);
  assert.equal(due[0].daysSince, 15);
  assert.equal(due[1].daysSince, 6);
});

ok('近期日程：面试升序 + 提醒窗口（lead 24h 内可见）', () => {
  const apps = [mkApp('1', 'interview')];
  const events = [
    mkEvent(apps[0].id, 'interview', '2026-11-05 10:00'),
    mkEvent(apps[0].id, 'note', '2026-10-01 10:00', { remindAt: '2026-10-29 11:00' }), // 已到点
  ];
  const u = core.upcoming(events, SETTINGS5, NOW);
  assert.equal(u.schedule.length, 1);
  assert.equal(u.reminders.length, 1);
});

ok('近期日程：提醒过期超 48h 不再显示', () => {
  const apps = [mkApp('1', 'applied')];
  const events = [mkEvent(apps[0].id, 'note', '2026-10-01 10:00', { remindAt: '2026-10-26 11:00' })];
  const u = core.upcoming(events, SETTINGS5, NOW);
  assert.equal(u.reminders.length, 0);
});

// ── 漏斗 ────────────────────────────────────────────────────────────────
console.log('漏斗');

ok('四级归因：wish（无投递时间无事件）不入漏斗', () => {
  const apps = [mkApp('1', 'wish', { appliedAt: '' })];
  assert.equal(core.stageOf(apps[0], []), null);
  assert.deepEqual(core.funnelBy(apps, [], 'channel'), []);
});

ok('只投无回 = submitted；有 screen = responded；面试 = interviewed；offer = offered', () => {
  const a1 = mkApp('1', 'applied');
  const a2 = mkApp('2', 'screening');
  const a3 = mkApp('3', 'interview');
  const a4 = mkApp('4', 'offered');
  const events = [
    mkEvent(a1.id, 'applied', '2026-10-02 09:00'),
    mkEvent(a2.id, 'applied', '2026-10-02 09:00'), mkEvent(a2.id, 'screen', '2026-10-03 09:00'),
    mkEvent(a3.id, 'applied', '2026-10-02 09:00'), mkEvent(a3.id, 'interview', '2026-10-04 09:00'),
    mkEvent(a4.id, 'applied', '2026-10-02 09:00'), mkEvent(a4.id, 'offer', '2026-10-05 09:00'),
  ];
  assert.equal(core.stageOf(a1, events), 'submitted');
  assert.equal(core.stageOf(a2, events), 'responded');
  assert.equal(core.stageOf(a3, events), 'interviewed');
  assert.equal(core.stageOf(a4, events), 'offered');
});

ok('被拒仍计入 responded（转化率口径：有回音算回音）', () => {
  const a = mkApp('1', 'rejected');
  const events = [mkEvent(a.id, 'applied', '2026-10-02 09:00'), mkEvent(a.id, 'result', '2026-10-03 09:00', { outcome: 'fail' })];
  assert.equal(core.stageOf(a, events), 'responded');
});

ok('状态也能推出级：无事件但 status=interview', () => {
  const a = mkApp('1', 'interview');
  assert.equal(core.stageOf(a, []), 'interviewed');
});

ok('按渠道分组 + 小样本不出百分比', () => {
  const apps = [];
  const events = [];
  for (let i = 0; i < 3; i++) {
    const a = core.normalizeApp({ title: 'T' + i, companyName: 'C' + i, channel: 'boss', appliedAt: '2026-10-02 09:00' }, null, 'C' + i);
    apps.push(a);
    events.push(mkEvent(a.id, 'applied', '2026-10-02 09:00'));
  }
  const rows = core.funnelBy(apps, events, 'channel');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'BOSS直聘');
  assert.equal(rows[0].submitted, 3);
  assert.equal(rows[0].respondedRate, null); // 3 < 5 不出百分比
});

ok('大样本出百分比', () => {
  const apps = [];
  const events = [];
  for (let i = 0; i < 10; i++) {
    const a = core.normalizeApp({ title: 'T' + i, companyName: 'C' + i, channel: 'referral', appliedAt: '2026-10-02 09:00' }, null, 'C' + i);
    apps.push(a);
    events.push(mkEvent(a.id, 'applied', '2026-10-02 09:00'));
    if (i < 5) events.push(mkEvent(a.id, 'screen', '2026-10-03 09:00'));
  }
  const rows = core.funnelBy(apps, events, 'channel');
  assert.equal(rows[0].respondedRate, '50%');
});

ok('按简历版本分组；未标注归 (未标注)', () => {
  const r = core.normalizeResume({ label: '版本A' }, null);
  const a1 = core.normalizeApp({ title: 'T1', companyName: 'C1', resumeId: r.id, appliedAt: '2026-10-02 09:00' }, null, 'C1');
  const a2 = core.normalizeApp({ title: 'T2', companyName: 'C2', appliedAt: '2026-10-02 09:00' }, null, 'C2');
  const rows = core.funnelBy([a1, a2], [], 'resumeId');
  assert.deepEqual(rows.map((x) => x.key).sort(), ['(未标注)', r.id]);
});

// ── offer 对比 ─────────────────────────────────────────────────────────
console.log('offer 对比');

ok('年化 = 月薪×(月数+奖金月数)；按年化降序 + 差额', () => {
  const a1 = mkApp('1', 'offered');
  const a2 = mkApp('2', 'offered');
  const o1 = core.normalizeOffer({ baseMonthly: 20000, months: 12, bonusMonths: 2 }, null, a1.id); // 28万
  const o2 = core.normalizeOffer({ baseMonthly: 30000, months: 12, bonusMonths: 4 }, null, a2.id); // 48万
  const rows = core.offerCompare([o1, o2], [a1, a2]);
  assert.equal(rows[0].annual, 480000);
  assert.equal(rows[1].deltaVsBest, -200000);
  assert.equal(rows[0].companyName, 'C2');
});

ok('年通勤小时 = commuteMin×2×250÷60，一位小数', () => {
  const a = mkApp('1', 'offered');
  const o = core.normalizeOffer({ baseMonthly: 20000, commuteMin: 60 }, null, a.id);
  const rows = core.offerCompare([o], [a]);
  assert.equal(rows[0].commuteHoursPerYear, 500); // 60*2*250/60 = 500
});

ok('已删投递的 offer 仍可展示（companyName 兜底）', () => {
  const o = core.normalizeOffer({ baseMonthly: 10000 }, null, 'ghost');
  const rows = core.offerCompare([o], []);
  assert.equal(rows[0].companyName, '(已删投递)');
});

// ── 问题库 ─────────────────────────────────────────────────────────────
console.log('复盘问题库');

ok('同题归一去重计数 + 来源公司去重', () => {
  const a1 = mkApp('1', 'interview');
  const a2 = mkApp('2', 'interview');
  const events = [
    mkEvent(a1.id, 'interview', '2026-10-02 09:00', { questions: ['介绍一下项目', ' 讲讲项目  '] }),
    mkEvent(a2.id, 'interview', '2026-10-03 09:00', { questions: ['介绍一下项目', '事件循环'] }),
  ];
  const bank = core.questionBank(events, [a1, a2]);
  assert.equal(bank.length, 3);
  const top = bank[0];
  assert.equal(top.q, '介绍一下项目');
  assert.equal(top.count, 2);
  assert.deepEqual(top.companies.sort(), ['C1', 'C2']);
});

// ── CSV ────────────────────────────────────────────────────────────────
console.log('CSV');

ok('导出含表头与中文渠道/状态标签；引号转义', () => {
  const a = mkApp('1', 'applied', { note: '备注,带逗号' });
  const events = [mkEvent(a.id, 'applied', '2026-10-02 09:00')];
  const csv = core.exportCSV([a], events, [], []);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('公司,职位'));
  assert.ok(csv.includes('"备注,带逗号"'));
  assert.ok(csv.includes('BOSS直聘') || csv.includes('其他'));
});

ok('CSV 解析：引号内逗号/换行/双引号', () => {
  const rows = core.parseCSV('a,"b,c","d""e",\r\n"f\nx",,');
  assert.deepEqual(rows[0], ['a', 'b,c', 'd"e', '']);
  assert.deepEqual(rows[1], ['f\nx', '', '']);
});

ok('导入：判重跳过 / 未知渠道状态降级并报告 / 生成 note 事件', () => {
  const exist = [mkApp('1', 'applied', { title: '前端工程师' })]; // C1|T1 -> C1 公司名, T1 标题
  const csv = [
    '公司,职位,渠道,状态,投递时间,最新进展,最新进展时间,期望薪资,地点,简历版本,备注',
    'C1,前端工程师,BOSS直聘,已投,2026-10-01,自动跳过,,20k,北京,,重复',
    '美团,后端,陌陌app,神秘状态,2026-10-02 10:00,电话沟通了,2026-10-03 09:00,25k,上海,,',
    '小红书,数据,内推,面试中,,,30k,,',
  ].join('\r\n');
  const r = core.importCSV(csv, exist, NOW);
  assert.equal(r.created, 2);
  assert.equal(r.skipped, 1);
  assert.ok(r.warns.some((w) => w.includes('陌陌app')));
  assert.ok(r.warns.some((w) => w.includes('神秘状态')));
  const meituan = r.apps.find((a) => a.companyName === '美团');
  assert.equal(meituan.channel, 'other');
  assert.equal(meituan.status, 'applied');
  assert.equal(meituan.appliedAt, new Date(2026, 9, 2, 10, 0, 0).toISOString());
  assert.equal(r.noteEvents.length, 1); // 只有美团有最新进展
  assert.equal(r.noteEvents[0].detail, '电话沟通了');
  const xhs = r.apps.find((a) => a.companyName === '小红书');
  assert.equal(xhs.status, 'interview');
  assert.equal(xhs.appliedAt, ''); // 投递时间空
});

ok('导入：缺公司/职位行报 warn 不中断；整行空被静默过滤；缺关键列直接拒绝', () => {
  // 整行全空 → parseCSV 过滤，不算 warn
  const r0 = core.importCSV('公司,职位\r\n,,\r\nA,B\r\n', [], NOW);
  assert.equal(r0.created, 1);
  assert.equal(r0.warns.length, 0);
  // 有内容但缺公司 → warn
  const csv = '公司,职位,备注\r\n,,待定\r\nA,B,y\r\n';
  const r = core.importCSV(csv, [], NOW);
  assert.equal(r.created, 1);
  assert.ok(r.warns[0].includes('第 2 行'));
  assert.throws(() => core.importCSV('a,b\r\n1,2\r\n', [], NOW), /公司/);
});

ok('全量导出 JSON 结构可序列化', () => {
  const data = { companies: [core.normalizeCompany({ name: 'X' }, null)], apps: [], resumes: [], events: [], offers: [], settings: SETTINGS5 };
  const s = JSON.stringify(core.exportAll(data));
  assert.ok(s.includes('wenjin-backup'));
});

console.log(`\n共 ${passed} 组断言通过${process.exitCode ? '（有失败）' : ''}`);
