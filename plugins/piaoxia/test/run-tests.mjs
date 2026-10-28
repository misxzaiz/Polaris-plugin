'use strict';
/**
 * run-tests.mjs —— shared/core.js 纯函数离线单测（零依赖零网络）
 * 运行：node test/run-tests.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const core = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'core.js'));

let pass = 0;
let fail = 0;
const NOW = new Date(2026, 9, 29, 12, 0).getTime(); // 2026-10-29 12:00 本地

function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('✗', name, extra === undefined ? '' : '—— ' + JSON.stringify(extra).slice(0, 240)); }
}
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
}

console.log('== id 派生与判重键 ==');
{
  const a = core.normalizeInvoice({ total: 100, number: '24312000000123456789', date: '2026-10-01' }, null);
  const b = core.normalizeInvoice({ total: 100, number: '2431 2000 0001 2345 6789', date: '2026-10-01' }, null); // 号码夹空格
  eq('同号码夹空格 → 同 id', a.id, b.id);
  const c = core.normalizeInvoice({ total: 100, number: '12345678', code: '044032000110' }, null);
  ok('不同号码不同 id', a.id !== c.id);
  const m1 = core.normalizeInvoice({ total: 100, date: '2026-10-01', seller: { name: '甲公司' }, items: [{ name: '打印' }] }, null);
  const m2 = core.normalizeInvoice({ total: 100, date: '2026-10-01', seller: { name: '甲公司 ' }, items: [{ name: ' 打印 ' }] }, null);
  eq('手录无号码：内容同 → 同 id（幂等）', m1.id, m2.id);
  const m3 = core.normalizeInvoice({ total: 200, date: '2026-10-01', seller: { name: '甲公司' } }, null);
  ok('手录内容不同 → 不同 id', m1.id !== m3.id);
  ok('id 形如 p+12位', /^p[0-9a-f]{12}$/.test(a.id), a.id);
}

console.log('== normalize 降级与钳制 ==');
{
  let threw = '';
  try { core.normalizeInvoice({ total: 0 }, null); } catch (e) { threw = e.message; }
  ok('total=0 拒绝', threw.indexOf('正数') !== -1, threw);
  threw = '';
  try { core.normalizeInvoice({ total: -5 }, null); } catch (e) { threw = e.message; }
  ok('total<0 拒绝', threw !== '');
  const inv = core.normalizeInvoice({
    total: '1,234.50', number: 'abc24312000000123456789xyz', kind: '乱写', status: '乱写',
    purpose: '乱写', category: '乱写', warrantyMonths: 999, seller: { name: ' x ', taxId: '91-330106 max!' },
  }, null);
  eq('total 字符串带逗号 → 数字', inv.total, 1234.5);
  eq('号码剔除非数字', inv.number, '24312000000123456789');
  eq('非法 kind → other', inv.kind, 'other');
  eq('非法 status → pending', inv.status, 'pending');
  eq('非法 purpose → expense', inv.purpose, 'expense');
  eq('非法 category → 分类器兜底（other）', inv.category, 'other');
  eq('荒谬保修月数 → null（宁缺勿造）', inv.warrantyMonths, null);
  eq('税号清洗大写', inv.seller.taxId, '91330106MAX');
}

console.log('== 部分补丁（prev 继承）==');
{
  const base = core.normalizeInvoice({ total: 100, number: '24312000000123456789', date: '2026-10-01', seller: { name: '甲' }, note: '原始备注' }, null);
  const patched = core.normalizeInvoice({ note: '改了' }, base);
  eq('补丁后号码保留', patched.number, base.number);
  eq('补丁后金额保留', patched.total, base.total);
  eq('备注更新', patched.note, '改了');
  ok('id 不变（号码未动）', patched.id === base.id);
}

console.log('== 状态机 ==');
{
  const mk = (status) => core.normalizeInvoice({ total: 100, number: '24312000000123456789', date: '2026-10-01', status }, null);
  eq('pending→submitted 允许', core.canTransition('pending', 'submitted'), { ok: true, message: '' });
  eq('pending→settled 拒绝', core.canTransition('pending', 'settled').ok, false);
  eq('settled→pending 拒绝（只能纠错回 submitted）', core.canTransition('settled', 'pending').ok, false);
  eq('excluded→settled 拒绝', core.canTransition('excluded', 'settled').ok, false);
  eq('同态 no-op ok', core.canTransition('pending', 'pending').ok, true);

  const p = mk('pending');
  const s = core.applyTransition(p, 'submitted', { nowMs: NOW, reimburseId: 'R202611' });
  eq('submit 记单号与日期', [s.status, s.reimburseId, s.submittedAt], ['submitted', 'R202611', '2026-10-29']);
  const se = core.applyTransition(s, 'settled', { nowMs: NOW + 86400000 });
  eq('settle 记到账日', [se.status, se.settledAt], ['settled', '2026-10-30']);
  const back = core.applyTransition(se, 'submitted', { nowMs: NOW });
  eq('settled→submitted 纠错回退保留单号', [back.status, back.reimburseId], ['submitted', 'R202611']);
  const rj = core.applyTransition(s, 'rejected', { nowMs: NOW, rejectNote: '抬头错' });
  eq('reject 记原因', [rj.status, rj.rejectNote], ['rejected', '抬头错']);
  const re2 = core.applyTransition(rj, 'submitted', { nowMs: NOW });
  eq('退回后可重新提交', re2.status, 'submitted');
  const ex = core.applyTransition(p, 'excluded', { nowMs: NOW });
  eq('archive 清在途痕迹', [ex.status, ex.submittedAt, ex.settledAt], ['excluded', '', '']);
  let threw = '';
  try { core.applyTransition(p, 'settled', { nowMs: NOW }); } catch (e) { threw = e.message; }
  ok('非法流转抛中文错误', threw.indexOf('不允许') !== -1, threw);
}

console.log('== 分类器 ==');
{
  eq('餐饮', core.classifyCategory('某某餐饮管理有限公司', []), 'meal');
  eq('交通（铁路）', core.classifyCategory('中国铁路上海局', ['杭州东-上海虹桥']), 'transport');
  eq('酒店', core.classifyCategory('某某大酒店', []), 'hotel');
  eq('快递', core.classifyCategory('顺丰速运', ['运费']), 'logistics');
  eq('品名优先命中（销方不显）', core.classifyCategory('某某贸易有限公司', ['*信息技术服务*软件开发']), 'office');
  eq('未知 → other', core.classifyCategory('张三个人', ['杂项']), 'other');
  eq('空 → other', core.classifyCategory('', []), 'other');
}

console.log('== 保修派生 ==');
{
  const inv = core.normalizeInvoice({ total: 3000, date: '2026-01-31', purpose: 'warranty', warrantyMonths: 1 }, null);
  eq('月末溢出钳制（1/31+1mo→2/28）', inv.warrantyUntil, '2026-02-28', inv.warrantyUntil);
  const inv2 = core.normalizeInvoice({ total: 3000, date: '2026-03-15', purpose: 'warranty', warrantyMonths: 12 }, null);
  eq('正常加月', inv2.warrantyUntil, '2027-03-15');
  const inv3 = core.normalizeInvoice({ total: 3000, warrantyMonths: 12 }, null); // 无日期
  eq('无日期保修留空', inv3.warrantyUntil, '');
}

console.log('== buildView 透视 ==');
{
  const mk = (over) => core.normalizeInvoice(Object.assign({
    total: 100, number: '24312000000' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0'),
    date: '2026-10-10', seller: { name: '甲' },
  }, over), null);
  const list = [
    mk({ number: '24312000000111111111', status: 'pending' }),
    mk({ number: '24312000000222222222', status: 'pending', date: '2026-08-01' }), // 超 60 天
    mk({ number: '24312000000333333333', status: 'submitted', date: '2026-10-05', submittedAt: '2026-10-20', reimburseId: 'R1' }),
    mk({ number: '24312000000444444444', status: 'settled', date: '2026-10-06', settledAt: '2026-10-25' }),
    mk({ number: '24312000000555555555', status: 'excluded', date: '2026-10-07' }),
    mk({ total: 500, number: '24312000000666666666', status: 'pending', date: '2026-10-15', category: 'transport', seller: { name: '铁路' }, warrantyMonths: 1 }),
  ];
  const view = core.buildView(list, [], NOW);
  eq('待报销 3 张', view.pending.count, 3);
  eq('待报销总额 700', view.pending.total, 700);
  eq('在途 1 张', view.inFlight.count, 1);
  eq('本月开票 4 张（excluded 不计）', view.month.opened.count, 4);
  eq('本月到账 1 张 / 100', [view.month.settled.count, view.month.settled.total], [1, 100]);
  eq('年度累计 900（excluded 不计，含交通 500）', view.year.total, 900);
  eq('逾期未报（>60天）1 张', view.pending.stale.length, 1);
  eq('分类交通 500', view.byCategory.find((r) => r.key === 'transport').total, 500);
  eq('报销单分组 1 组', view.reimburseGroups.length, 1);
  eq('保修榜 1 行', view.warrantyUpcoming.length, 1);
  eq('保修剩 17 天（2026-11-15）', view.warrantyUpcoming[0].daysLeft, 17);
  eq('销方甲 5 张 500（excluded 也计入销方统计）', [view.sellers[0].count, view.sellers[0].total], [5, 500]);
}

console.log('== CSV 往返 ==');
{
  const inv = core.normalizeInvoice({
    total: 296.8, amount: 280, tax: 16.8, number: '24312000000123456789', date: '2026-10-15',
    seller: { name: '某"餐饮,公司"', taxId: '91330105MA2ABCD1XY' }, buyer: { name: '杭州某某网络科技' },
    items: [{ name: '午餐费' }], note: '含"引号,\n换行', category: 'meal', status: 'submitted', reimburseId: 'R9',
  }, null);
  const csv = core.exportCSV([inv]);
  ok('BOM 头', csv.charCodeAt(0) === 0xFEFF);
  const back = core.importCSV(csv);
  eq('导入 1 条', back.drafts.length, 1);
  eq('warns 空', back.warns.length, 0);
  const d = back.drafts[0];
  eq('号码往返', d.number, '24312000000123456789');
  eq('销方引号逗号往返', d.seller.name, '某"餐饮,公司"');
  eq('备注换行往返', d.note, '含"引号,\n换行');
  eq('金额往返', d.total, 296.8);
  eq('状态键往返', d.status, 'submitted');
  eq('同票同 id（CSV 判重可用）', d.id, inv.id);
}

console.log('== CSV 未知值降级 ==');
{
  // 行2=有效（乱枚举降级）；行3=手录无号码有金额（有效）；行4=金额缺失（跳过）
  const csv = '\uFEFFnumber,total,date,status,kind,category\n24312000000123456789,100,2026-10-01,乱状态,乱种类,乱分类\n,50,2026-10-02,,,\n,,2026-10-03,,,\n';
  const r = core.importCSV(csv);
  eq('有效 2 条', r.drafts.length, 2);
  ok('未知状态降级有 warn', r.warns.some((w) => w.indexOf('乱状态') !== -1), r.warns);
  ok('未知种类降级有 warn', r.warns.some((w) => w.indexOf('乱种类') !== -1), r.warns);
  eq('降级后 pending', r.drafts[0].status, 'pending');
  eq('手录无号码入账', r.drafts[1].total, 50);
  ok('金额缺失行跳过有 warn', r.warns.some((w) => w.indexOf('第4行') !== -1), r.warns);
}

console.log('== 抬头 ==');
{
  const t = core.normalizeTitle({ name: ' 杭州某某网络科技有限公司 ', taxId: '91330106ma27xw1234', bank: '某某银行', account: ' 6222 0000 1111 ' }, null);
  eq('名称 trim', t.name, '杭州某某网络科技有限公司');
  eq('税号归一大写', t.taxId, '91330106MA27XW1234');
  eq('账号去空格', t.account, '622200001111');
  const t2 = core.normalizeTitle({ name: '杭州某某网络科技有限公司', taxId: '91330106MA27XW1234' }, null);
  eq('同名称税号 → 同 id（判重）', t.id, t2.id);
  let threw = '';
  try { core.normalizeTitle({ taxId: 'x' }, null); } catch (e) { threw = e.message; }
  ok('无名称拒绝', threw.indexOf('必填') !== -1, threw);
  const copy = core.titleCopyText(t);
  ok('复制文本含名称与税号', copy.indexOf('杭州某某网络科技有限公司') !== -1 && copy.indexOf('91330106MA27XW1234') !== -1, copy);
}

console.log('== 时间工具边界 ==');
{
  eq('中文日期', core.dateKeyOf('2026年10月5日'), '2026-10-05');
  eq('斜杠日期', core.dateKeyOf('2026/10/5'), '2026-10-05');
  eq('时间戳秒', core.dateKeyOf(1769644800), core.dateKeyOf(1769644800 * 1000));
  eq('跨年加月', core.addMonths('2026-11-15', 3), '2027-02-15');
  eq('daysBetween', core.daysBetween('2026-10-01', '2026-10-29'), 28);
  eq('无效日期空串', core.dateKeyOf('乱写'), '');
}

console.log('\n' + pass + ' 通过, ' + fail + ' 失败');
process.exitCode = fail ? 1 : 0;
