/**
 * 守闸 core 逻辑测试（node --test test/run-tests.mjs）
 * 覆盖：日期周期引擎（月末钳制/闰年/跨年）、成本归一（周/自定义周期折算）、
 *       归一化校验（必填/试用必须到期日/URL 协议/非法日期）、对账状态机
 *       （逾期/即将扣费/试用红榜/三榜排序/排除暂停取消）、renew 语义
 *       （推进/实付记价/试用转正/拒绝态）、恢复必填扣费日、透视
 *       （月均/年化排行/12月现金流/逾期挂当月/试用从转正日起算/已省/涨价检出）、
 *       CSV 往返与坏行、检索过滤。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

const NOW = new Date(2026, 9, 29, 12, 0).getTime(); // 2026-10-29 12:00 本地

function mk(over = {}) {
  const r = core.normalizeSub({ name: '测试订阅', amount: 25, cycle: 'month', ...over }, NOW);
  assert.ok(!r.error, r.error);
  return r.sub;
}

// ── 日期周期引擎 ───────────────────────────────────────────────────────────
test('advanceDate：月推进与月末钳制（1/31→2/28，闰年 2/29→平年 2/28）', () => {
  assert.equal(core.advanceDate('2026-01-31', 'month'), '2026-02-28');
  assert.equal(core.advanceDate('2026-02-28', 'month'), '2026-03-28');
  assert.equal(core.advanceDate('2027-02-28', 'year'), '2028-02-28'); // 2028 闰年
  assert.equal(core.advanceDate('2028-02-29', 'year'), '2029-02-28'); // 闰日→平年钳制
  assert.equal(core.advanceDate('2026-11-15', 'month'), '2026-12-15'); // 跨年
  assert.equal(core.advanceDate('2026-11-15', 'quarter'), '2027-02-15');
  assert.equal(core.advanceDate('2026-12-15', 'quarter'), '2027-03-15');
  assert.equal(core.advanceDate('2026-10-29', 'week'), '2026-11-05');
  assert.equal(core.advanceDate('2026-10-29', 'custom', 90), '2027-01-27');
  assert.equal(core.advanceDate('2026-10-29', 'custom', 0), null);
  assert.equal(core.advanceDate('2026-13-40', 'month'), null); // 非法日期
  assert.equal(core.advanceDate('2026-02-30', 'month'), null); // 被 Date 归一化的假日期须拒绝
});

test('monthlyCost/annualCost：周期归一（周=52/12，自定义=365/n 天）', () => {
  assert.equal(core.monthlyCost({ amount: 25, cycle: 'month' }), 25);
  assert.equal(core.annualCost({ amount: 25, cycle: 'month' }), 300);
  assert.equal(core.annualCost({ amount: 248, cycle: 'year' }), 248);
  assert.ok(Math.abs(core.annualCost({ amount: 15, cycle: 'week' }) - 780) < 1e-9);
  assert.ok(Math.abs(core.monthlyCost({ amount: 90, cycle: 'custom', customDays: 90 }) - 365 / 12) < 0.01); // 90×365/90/12 ≈ 30.42
  assert.equal(core.annualCost({ amount: 90, cycle: 'custom', customDays: 90 }), 365);
  assert.equal(core.cycleLabel({ cycle: 'custom', customDays: 90 }), '每 90 天');
  assert.equal(core.cycleLabel({ cycle: 'year' }), '每年');
  assert.equal(core.monthlyCost({ amount: 10, cycle: 'custom', customDays: 0 }), null);
});

// ── 归一化 ─────────────────────────────────────────────────────────────────
test('normalizeSub：必填/枚举/金额校验与默认值', () => {
  assert.ok(core.normalizeSub({ name: '  ', amount: 1, cycle: 'month' }, NOW).error.includes('名称'));
  assert.ok(core.normalizeSub({ name: 'x', amount: -1, cycle: 'month' }, NOW).error.includes('正数'));
  assert.ok(core.normalizeSub({ name: 'x', amount: 2e6, cycle: 'month' }, NOW).error.includes('过大'));
  assert.ok(core.normalizeSub({ name: 'x', amount: 10, cycle: 'decade' }, NOW).error.includes('周期'));
  assert.ok(core.normalizeSub({ name: 'x', amount: 10, cycle: 'custom' }, NOW).error.includes('自定义'));
  assert.ok(core.normalizeSub({ name: 'x', amount: 10, cycle: 'custom', customDays: 4000 }, NOW).error.includes('3650'));
  // 缺省下次扣费日 = 今天推进一周期（2026-10-29 → 2026-11-29）
  assert.equal(mk().nextRenewalDate, '2026-11-29');
  // 显式非法日期被拒（而非静默换默认）
  assert.ok(core.normalizeSub({ name: 'x', amount: 10, cycle: 'month', nextRenewalDate: '2026-02-30' }, NOW).error.includes('推算') || core.normalizeSub({ name: 'x', amount: 10, cycle: 'month', nextRenewalDate: '2026-02-30' }, NOW).error.includes('非法'));
  // URL 只认 http(s)
  assert.equal(mk({ manageUrl: 'javascript:alert(1)' }).manageUrl, undefined);
  assert.equal(mk({ manageUrl: 'https://a.b/c' }).manageUrl, 'https://a.b/c');
  // 分类兜底 + remindDaysBefore 钳制
  assert.equal(mk({ category: '不存在的类' }).category, '其他');
  assert.equal(mk({ remindDaysBefore: 99 }).remindDaysBefore, 30);
  assert.equal(mk({ remindDaysBefore: -3 }).remindDaysBefore, 0);
  // 价格史缺省补开通价
  assert.deepEqual(mk().priceHistory, [{ date: '2026-10-29', amount: 25 }]);
});

test('normalizeSub：试用态必须带 trialEndsAt；cancelled 保留取消字段', () => {
  const r = core.normalizeSub({ name: 'x', amount: 10, cycle: 'month', status: 'trial' }, NOW);
  assert.ok(r.error.includes('trialEndsAt'));
  const c = core.normalizeSub({ name: 'x', amount: 10, cycle: 'month', status: 'cancelled', cancelledAt: '2026-10-01', cancelReason: '太贵' }, NOW);
  assert.equal(c.sub.cancelledAt, '2026-10-01');
  assert.equal(c.sub.cancelReason, '太贵');
  const okT = core.normalizeSub({ name: 'x', amount: 10, cycle: 'month', status: 'trial', trialEndsAt: '2026-11-05' }, NOW);
  assert.equal(okT.sub.trialEndsAt, '2026-11-05');
});

// ── 对账状态机 ─────────────────────────────────────────────────────────────
test('renewState：逾期/即将扣费/试用红榜/提醒窗口', () => {
  const overdue = mk({ nextRenewalDate: '2026-10-01' });
  assert.equal(core.renewState(overdue, '2026-10-29'), 'overdue');
  const soon = mk({ nextRenewalDate: '2026-10-31' }); // 距今 2 天 ≤ 默认 3
  assert.equal(core.renewState(soon, '2026-10-29'), 'dueSoon');
  const far = mk({ nextRenewalDate: '2026-11-29' });
  assert.equal(core.renewState(far, '2026-10-29'), 'ok');
  const win0 = mk({ nextRenewalDate: '2026-11-20', remindDaysBefore: 0 });
  assert.equal(core.renewState(win0, '2026-11-20'), 'dueSoon'); // 当天也在窗口内
  assert.equal(core.renewState(win0, '2026-11-19'), 'ok');
  const trialFar = mk({ status: 'trial', trialEndsAt: '2026-12-20' });
  assert.equal(core.renewState(trialFar, '2026-10-29'), 'trial');
  const trialSoon = mk({ status: 'trial', trialEndsAt: '2026-11-01' });
  assert.equal(core.renewState(trialSoon, '2026-10-29'), 'trialUrgent');
  const paused = mk({ status: 'paused', nextRenewalDate: '2026-10-01' });
  assert.equal(core.renewState(paused, '2026-10-29'), 'ok'); // 暂停不进榜单
});

test('dueBoard：三榜与排序（逾期最久在前、即将按日期升序、试用按到期升序）', () => {
  const subs = [
    mk({ name: 'A逾期较近', nextRenewalDate: '2026-10-25' }),
    mk({ name: 'B逾期最久', nextRenewalDate: '2026-09-01' }),
    mk({ name: 'C明天扣', nextRenewalDate: '2026-10-30' }),
    mk({ name: 'D后天扣', nextRenewalDate: '2026-10-31' }),
    mk({ name: 'E试用急', status: 'trial', trialEndsAt: '2026-10-30' }),
    mk({ name: 'F暂停', status: 'paused', nextRenewalDate: '2026-09-01' }),
    mk({ name: 'G已取消', status: 'cancelled', nextRenewalDate: '2026-09-01' }),
    mk({ name: 'H无恙', nextRenewalDate: '2026-12-01' }),
  ];
  const b = core.dueBoard(subs, '2026-10-29');
  assert.deepEqual(b.overdue.map((s) => s.name), ['B逾期最久', 'A逾期较近']);
  assert.deepEqual(b.upcoming.map((s) => s.name), ['C明天扣', 'D后天扣']);
  assert.deepEqual(b.trials.map((s) => s.name), ['E试用急']);
  assert.ok(!b.overdue.some((s) => s.name === 'F暂停') && !b.upcoming.some((s) => s.name === 'G已取消'));
});

// ── renew / skip / cancel / resume ────────────────────────────────────────
test('renewSub：推进一周期；实付≠现价记价格史+price 事件；试用转正', () => {
  const s1 = mk({ nextRenewalDate: '2026-10-29' });
  const r1 = core.renewSub(s1, {}, NOW);
  assert.equal(r1.sub.nextRenewalDate, '2026-11-29'); // 月末钳制从 10-29 顺推
  assert.equal(r1.sub.status, 'active');
  const kinds1 = r1.sub.events.map((e) => e.kind);
  assert.deepEqual(kinds1, ['renew']);

  const s2 = mk({ amount: 25, nextRenewalDate: '2026-10-01' });
  const r2 = core.renewSub(s2, { amount: 30 }, NOW);
  assert.equal(r2.sub.amount, 30);
  assert.equal(r2.sub.nextRenewalDate, '2026-11-01'); // 基准是原扣费日，不是今天
  assert.equal(r2.sub.priceHistory.length, 2);
  assert.equal(r2.sub.priceHistory[1].amount, 30);
  assert.ok(r2.sub.events.some((e) => e.kind === 'price'));
  assert.ok(r2.sub.events.some((e) => e.kind === 'renew'));

  const s3 = mk({ status: 'trial', trialEndsAt: '2026-10-29' });
  const r3 = core.renewSub(s3, {}, NOW);
  assert.equal(r3.sub.status, 'active'); // 试用对账转正
});

test('renewSub：已取消/暂停拒绝；多期逾期单次推进仍在逾期（不静默滚多期）', () => {
  const c = mk({ status: 'cancelled' });
  assert.ok(core.renewSub(c, {}, NOW).error.includes('取消'));
  const p = mk({ status: 'paused' });
  assert.ok(core.renewSub(p, {}, NOW).error.includes('暂停'));
  const s = mk({ nextRenewalDate: '2026-07-29' }); // 欠 3 期
  const r = core.renewSub(s, {}, NOW);
  assert.equal(r.sub.nextRenewalDate, '2026-08-29'); // 只推进一期
  assert.equal(core.renewState(r.sub, '2026-10-29'), 'overdue'); // 仍待对账
});

test('skipSub/cancelSub/resumeSub：语义与字段清理', () => {
  const s = mk({ nextRenewalDate: '2026-10-01' });
  const sk = core.skipSub(s, { reason: '已取消签约' }, NOW);
  assert.equal(sk.sub.status, 'cancelled');
  assert.equal(sk.sub.autoRenew, false);
  assert.equal(sk.sub.cancelledAt, '2026-10-29');
  const resume = core.resumeSub(sk.sub, '2026-12-01', NOW);
  assert.equal(resume.sub.status, 'active');
  assert.equal(resume.sub.nextRenewalDate, '2026-12-01');
  assert.equal(resume.sub.cancelledAt, undefined);
  assert.equal(resume.sub.cancelReason, undefined);
  assert.ok(core.resumeSub(sk.sub, '', NOW).error.includes('下次扣费日'));
  const cx = core.cancelSub(s, { reason: '太贵' }, NOW);
  assert.equal(cx.sub.status, 'cancelled');
  assert.equal(cx.sub.cancelReason, '太贵');
});

// ── applyUpdate ───────────────────────────────────────────────────────────
test('applyUpdate：白名单字段、金额变化自动记史、非法值拒绝', () => {
  const s = mk();
  const u1 = core.applyUpdate(s, { name: '新名字', note: '备注', paymentMethod: '支付宝' }, NOW);
  assert.equal(u1.sub.name, '新名字');
  assert.equal(u1.sub.paymentMethod, '支付宝');
  assert.equal(u1.sub.priceHistory.length, 1); // 未变价不加史
  const u2 = core.applyUpdate(s, { amount: 30 }, NOW);
  assert.equal(u2.sub.amount, 30);
  assert.equal(u2.sub.priceHistory.length, 2);
  assert.ok(u2.sub.events.some((e) => e.kind === 'price'));
  assert.ok(core.applyUpdate(s, { amount: -5 }, NOW).error.includes('金额'));
  assert.ok(core.applyUpdate(s, { cycle: 'week2' }, NOW).error.includes('周期'));
  assert.ok(core.applyUpdate(s, { nextRenewalDate: 'bad' }, NOW).error.includes('非法'));
  const u3 = core.applyUpdate(s, { manageUrl: 'ftp://x' }, NOW);
  assert.equal(u3.sub.manageUrl, undefined); // 非法协议剥除
});

// ── 透视统计 ───────────────────────────────────────────────────────────────
test('stats：月均/年化/分类/排行/已省/涨价检出', () => {
  const subs = [
    mk({ name: '视频A', amount: 25, cycle: 'month', category: '视频娱乐' }),
    mk({ name: '网盘B', amount: 298, cycle: 'year', category: '云盘存储' }),
    mk({ name: '音乐C', amount: 180, cycle: 'year', category: '音乐' }),
    mk({ name: '试用D', amount: 30, cycle: 'month', status: 'trial', trialEndsAt: '2026-11-10' }),
    mk({ name: '旧E', amount: 100, cycle: 'month', status: 'cancelled', nextRenewalDate: '2026-01-01' }),
  ];
  const st = core.stats(subs, '2026-10-29');
  assert.equal(st.counts.active, 3);
  assert.equal(st.counts.trial, 1);
  assert.equal(st.counts.cancelled, 1);
  assert.equal(st.monthlyActive, Math.round((25 + 298 / 12 + 15) * 100) / 100);
  assert.equal(st.annualActive, Math.round(st.monthlyActive * 12 * 100) / 100);
  assert.equal(st.monthlyTrial, 30);
  assert.equal(st.savedMonthly, 100);
  assert.equal(st.savedAnnual, 1200);
  assert.equal(st.byCategory[0].category, '视频娱乐'); // 25 > 24.83 > 15
  assert.equal(st.topAnnual[0].name, '试用D'); // 试用若转正 360/年——转正前就该看到它最贵
  assert.equal(st.topAnnual[1].name, '视频A'); // 300/年
  assert.equal(st.topAnnual[2].name, '网盘B'); // 298/年
  // 涨价检出：F 从 20 涨到 30
  const f = mk({ name: 'F涨价', amount: 30, cycle: 'month', priceHistory: [{ date: '2026-01-01', amount: 20 }, { date: '2026-10-01', amount: 30 }] });
  const st2 = core.stats([f], '2026-10-29');
  assert.equal(st2.priceChanges.length, 1);
  assert.equal(st2.priceChanges[0].from, 20);
  assert.equal(st2.priceChanges[0].to, 30);
});

test('stats.cashflow：12 个月窗口/月付逐月/年付挂单月/试用从转正日起算/逾期挂当月', () => {
  const subs = [
    mk({ name: '月付', amount: 10, cycle: 'month', nextRenewalDate: '2026-11-05' }),
    mk({ name: '年付', amount: 120, cycle: 'year', nextRenewalDate: '2026-12-01' }),
    mk({ name: '试用', amount: 40, cycle: 'month', status: 'trial', trialEndsAt: '2026-11-15' }),
    mk({ name: '逾期', amount: 20, cycle: 'month', nextRenewalDate: '2026-10-01' }),
  ];
  const st = core.stats(subs, '2026-10-29');
  const byM = Object.fromEntries(st.cashflow.map((c) => [c.month, c.amount]));
  assert.equal(byM['2026-10'], 20); // 逾期挂当月（今天就是该处理的钱）
  assert.equal(byM['2026-11'], 10 + 40 + 20); // 月付 + 试用转正首次扣 + 逾期单的下期
  assert.equal(byM['2026-12'], 10 + 120 + 40 + 20); // 试用转正后逐月续扣
  // 窗口末月（当前月起 12 个自然月 → 2027-09）仍有逐月扣费
  assert.equal(byM['2027-09'], 10 + 40 + 20);
  assert.equal(st.cashflow.length, 12);
});

// ── CSV ───────────────────────────────────────────────────────────────────
test('CSV：导出→导入往返一致；引号转义；坏行逐行报错不致命', () => {
  const subs = [
    mk({ name: '视频,含"引号"', vendor: '腾讯', plan: '超级会员', amount: 25, cycle: 'month', nextRenewalDate: '2026-11-29', paymentMethod: '微信', note: '备注"引号"' }),
    mk({ name: '年费', amount: 248, cycle: 'year', nextRenewalDate: '2027-03-01', status: 'trial', trialEndsAt: '2027-03-01', remindDaysBefore: 5 }),
    mk({ name: '自定义90天', amount: 90, cycle: 'custom', customDays: 90, nextRenewalDate: '2027-01-27' }),
  ];
  const csv = core.toCsv(subs, '¥');
  const back = core.fromCsv(csv);
  assert.ok(!back.error, back.error);
  assert.equal(back.items.length, 3);
  assert.ok(back.items.every((i) => i.ok), back.items.filter((i) => !i.ok).map((i) => i.error).join(';'));
  const r0 = back.items[0].sub;
  assert.equal(r0.name, '视频,含"引号"');
  assert.equal(r0.amount, 25);
  assert.equal(r0.cycle, 'month');
  assert.equal(r0.paymentMethod, '微信');
  const r2 = back.items[2].sub;
  assert.equal(r2.cycle, 'custom');
  assert.equal(r2.customDays, 90);
  // 坏行：金额非法 → 该行报错（表头占第 1 行，追加行是第 5 行），其余照常
  const bad = csv + '\n"坏行",,视频娱乐,,abc,每月,,,是,生效中,,,,,';
  const back2 = core.fromCsv(bad);
  assert.equal(back2.items.length, 4);
  assert.equal(back2.items.filter((i) => !i.ok).length, 1);
  assert.ok(back2.items.find((i) => !i.ok).error.includes('第 5 行'), back2.items.find((i) => !i.ok).error);
  // 非本插件表头
  assert.ok(core.fromCsv('a,b\n1,2').error.includes('表头'));
});

// ── 检索 ──────────────────────────────────────────────────────────────────
test('filterSubs：关键字跨字段/分类/状态/自动续费', () => {
  const subs = [
    mk({ name: '腾讯视频', vendor: '腾讯', paymentMethod: '微信' }),
    mk({ name: '网盘', vendor: '百度', paymentMethod: '支付宝' }),
    mk({ name: '音乐', status: 'trial', trialEndsAt: '2026-11-30' }),
  ];
  assert.equal(core.filterSubs(subs, { keyword: '腾讯' }).length, 1);
  assert.equal(core.filterSubs(subs, { keyword: '支付宝' }).length, 1); // 命中支付方式
  assert.equal(core.filterSubs(subs, { status: 'trial' }).length, 1);
  assert.equal(core.filterSubs(subs, { autoRenew: false }).length, 0);
  assert.equal(core.filterSubs(subs, { keyword: '腾讯', status: 'trial' }).length, 0);
});
