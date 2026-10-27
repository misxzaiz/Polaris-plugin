/**
 * 口袋账本 core 逻辑测试（node --test test/run-tests.mjs）
 * 覆盖：日键/月份换算、账单归一化校验、幂等追加去重、删除、
 *       筛选、月度统计与预算、CSV 导出。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/ledger-core.js');

const DAY_MS = 24 * 3600 * 1000;

test('dayKeyOf/monthOf/shiftMonth：本地时区与跨月', () => {
  // 2026-10-27 00:30 本地 → 用固定构造验证（本地时区无关性：同月内不跨日）
  const ts = new Date(2026, 9, 27, 0, 30).getTime();
  assert.equal(core.dayKeyOf(ts), '2026-10-27');
  assert.equal(core.monthOf(ts), '2026-10');
  assert.equal(core.monthOf('2026-10-27'), '2026-10');
  assert.equal(core.shiftMonth('2026-10', -1), '2026-09');
  assert.equal(core.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(core.shiftMonth('2026-12', 1), '2027-01');
  // 月末 23:59 与次月 1 日 00:01 应归属不同日键
  const last = new Date(2026, 9, 31, 23, 59).getTime();
  const next = last + 2 * 60 * 1000;
  assert.equal(core.dayKeyOf(last), '2026-10-31');
  assert.equal(core.dayKeyOf(next), '2026-11-01');
});

test('normalizeBill：校验与兜底', () => {
  const cats = ['餐饮', '其他'];
  const ok = core.normalizeBill({ amount: '35.5', category: '餐饮', note: '午饭', source: 'ai' }, cats);
  assert.equal(ok.bill.amount, 35.5);
  assert.equal(ok.bill.type, 'expense');
  assert.ok(ok.bill.id.startsWith('b'));
  assert.equal(core.normalizeBill({ amount: -5 }, cats).error.includes('正数'), true);
  assert.equal(core.normalizeBill({ amount: 0 }, cats).error.includes('正数'), true);
  assert.equal(core.normalizeBill({ amount: 10, category: '不存在' }, cats).error.includes('未知分类'), true);
  // 收入类型默认分类
  const inc = core.normalizeBill({ amount: 100, type: 'income' }, cats.concat('其他收入'));
  assert.equal(inc.bill.category, '其他收入');
  // 不传校验集合则不校验分类
  assert.ok(core.normalizeBill({ amount: 1, category: '任意' }).bill);
});

test('appendBills：幂等去重 + 时间排序', () => {
  const a = { id: 'b1', ts: 200, type: 'expense', amount: 1, category: '餐饮', note: '', source: 'ai' };
  const b = { id: 'b2', ts: 100, type: 'expense', amount: 2, category: '餐饮', note: '', source: 'ai' };
  const b2 = { id: 'b2', ts: 100, type: 'expense', amount: 2, category: '餐饮', note: '重试写入', source: 'ai' };
  const once = core.appendBills([], [a, b]);
  assert.equal(once.length, 2);
  assert.equal(once[0].id, 'b2', '按 ts 排序');
  const twice = core.appendBills(once, [b2]); // 同 id 重放不重复
  assert.equal(twice.length, 2);
  assert.equal(twice.find((x) => x.id === 'b2').note, '重试写入', '同 id 后写覆盖');
});

test('removeBill / filterBills', () => {
  const bills = [
    { id: 'b1', ts: 1, type: 'expense', amount: 10, category: '餐饮', note: '午饭', source: 'ai' },
    { id: 'b2', ts: 2, type: 'expense', amount: 30, category: '交通', note: '地铁', source: 'panel' },
    { id: 'b3', ts: 3, type: 'income', amount: 5000, category: '工资', note: '月薪', source: 'panel' },
  ];
  const r = core.removeBill(bills, 'b2');
  assert.ok(r.removed && r.arr.length === 2);
  assert.equal(core.removeBill(bills, 'zzz').removed, false);
  assert.equal(core.filterBills(bills, { category: '餐饮' }).length, 1);
  assert.equal(core.filterBills(bills, { type: 'income' }).length, 1);
  assert.equal(core.filterBills(bills, { keyword: '午饭' }).length, 1);
  assert.equal(core.filterBills(bills, { keyword: '咖啡' }).length, 0);
  assert.equal(core.filterBills(bills, { minAmount: 100 }).length, 1);
});

test('computeStats：合计/分类/逐日/预算', () => {
  const mk = (d, amount, category, type = 'expense') => ({
    id: 'x' + d + category, ts: new Date(2026, 9, d, 12).getTime(), type, amount, category, note: '', source: 'ai',
  });
  const bills = [
    mk(1, 30, '餐饮'), mk(1, 20, '餐饮'), mk(2, 50, '交通'), mk(3, 100, '购物'),
    mk(5, 6000, '工资', 'income'),
  ];
  const settings = {
    currencySymbol: '¥',
    budgets: { 餐饮: 100, 购物: 50 },
    monthlyTotalBudget: 1000,
  };
  const s = core.computeStats(bills, settings, '2026-10');
  assert.equal(s.expense, 200);
  assert.equal(s.income, 6000);
  assert.equal(s.balance, 5800);
  assert.equal(s.byCategory[0].category, '工资');
  const food = s.byCategory.find((c) => c.category === '餐饮');
  assert.equal(food.sum, 50);
  assert.equal(food.budget, 100);
  assert.equal(s.totalBudgetUsed, 0.2);
  assert.equal(s.categoryBudgetUsed['餐饮'], 0.5);
  assert.equal(s.byDay.length, 31);
  assert.equal(s.byDay[0].expense, 50);
  assert.equal(s.byDay[9].expense, 0);
  const hint = core.budgetHint({ ...s, totalBudgetUsed: 0.95, totalBudget: 1000, expense: 950 });
  assert.ok(hint.includes('95%'), hint);
  const over = core.budgetHint({ ...s, totalBudgetUsed: 1.2, totalBudget: 1000, expense: 1200 });
  assert.ok(over.includes('超支'));
  assert.equal(core.budgetHint({ totalBudgetUsed: null }), '');
});

test('toCsv：转义与排序', () => {
  const bills = [
    { id: 'b2', ts: new Date(2026, 9, 2).getTime(), type: 'expense', amount: 3.5, category: '餐饮', note: '含"引号"', source: 'panel' },
    { id: 'b1', ts: new Date(2026, 9, 1).getTime(), type: 'income', amount: 10, category: '退款', note: '', source: 'ai' },
  ];
  const csv = core.toCsv(bills, '¥');
  const lines = csv.split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes('日期时间') && lines[0].includes('ID'));
  assert.ok(lines[1].includes('2026/10/1') || lines[1].includes('2026-10-01') || lines[1].includes('10月1'), lines[1]);
  assert.ok(lines[2].includes('""引号""'), 'CSV 引号转义');
});

test('excludeFromStats：排除汇总分类不参与统计但明细仍见', () => {
  const mk = (d, amount, category, type = 'expense') => ({
    id: 'x' + d + category, ts: new Date(2026, 9, d, 12).getTime(), type, amount, category, note: '', source: 'ai',
  });
  const bills = [
    mk(1, 30, '餐饮'), mk(1, 20, '餐饮'), mk(5, 6000, '工资', 'income'), mk(6, 100, '购物'),
  ];
  const settings = { currencySymbol: '¥', excludeFromStats: ['工资'] };
  const s = core.computeStats(bills, settings, '2026-10');
  // 工资被排除：不计入收入/结余/逐日
  assert.equal(s.income, 0, '工资不计入收入');
  assert.equal(s.expense, 150);
  assert.equal(s.balance, -150);
  assert.equal(s.excludedSum, 6000, 'excludedSum 单独合计');
  // 但 count 与 byCategory 仍列出该分类（带 excluded 标记）
  assert.equal(s.count, 4);
  const salary = s.byCategory.find((c) => c.category === '工资');
  assert.ok(salary && salary.excluded === true);
  // 逐日不含工资
  assert.equal(s.byDay[4].expense, 0, '10-05 无支出（工资被排除）');
  assert.equal(s.byDay[5].expense, 100);
});

test('normalizeBill：attachmentId 引用透传与兜底', () => {
  const cats = ['餐饮', '其他'];
  const withAtt = core.normalizeBill({ amount: 20, category: '餐饮', attachmentId: 'att_abc' }, cats);
  assert.equal(withAtt.bill.attachmentId, 'att_abc');
  // 空/非字符串 → undefined（避免写入空串）
  assert.equal(core.normalizeBill({ amount: 20, category: '餐饮', attachmentId: '' }, cats).bill.attachmentId, undefined);
  assert.equal(core.normalizeBill({ amount: 20, category: '餐饮', attachmentId: 123 }, cats).bill.attachmentId, undefined);
  // 超长截断
  const long = core.normalizeBill({ amount: 20, category: '餐饮', attachmentId: 'a'.repeat(80) }, cats);
  assert.equal(long.bill.attachmentId.length, 60);
});

test('normalizeAttachment：元数据校验与大小上限', () => {
  const ok = core.normalizeAttachment({ name: 'receipt.png', mime: 'image/png', size: 1024 });
  assert.ok(ok.att);
  assert.equal(ok.att.name, 'receipt.png');
  assert.equal(ok.att.mime, 'image/png');
  assert.equal(ok.att.size, 1024);
  assert.ok(ok.att.id.startsWith('b'));
  // 大小上限 2MB
  const over = core.normalizeAttachment({ name: 'big.png', size: 3 * 1024 * 1024 });
  assert.ok(over.error && over.error.includes('过大'));
  // mime 缺省按扩展名
  const png = core.normalizeAttachment({ name: 'a.png', size: 10 });
  assert.equal(png.att.mime, 'image/png');
  // isImageMime
  assert.equal(core.isImageMime('image/png'), true);
  assert.equal(core.isImageMime('application/pdf'), false);
});
