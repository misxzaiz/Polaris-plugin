#!/usr/bin/env node
'use strict';
/**
 * 金匮离线单测：node test/run-tests.mjs（零依赖零 mock，纯函数行为级）
 * 覆盖：日期工具边界（月末钳制/闰年/跨年/非法拒绝）、成员与保单与事件规范化、
 * 缴费进度（趸交/缴费期满/未知缴费年限/补缴推进）、保单状态机全转移
 * （等待期/有效/宽限期/中止期/复效/退保/满期/短险无宽限/效力终止）、
 * 缴费日历排序、缺口矩阵（缺格/中止不计入/保额合计/信息层）、
 * 12 个月现金流分桶、家庭合计（年化口径/趸交不计入）、describePolicy。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label || ''} 期望 ${b} 实得 ${a}`);
}
function ok(cond, label) { if (!cond) throw new Error(label || '断言失败'); }

// 固定「现在」：2026-10-29 本地 10:30
const NOW = new Date(2026, 9, 29, 10, 30).getTime();
const TODAY = '2026-10-29';
const SETTINGS = { graceDays: 60, warnDays: 30 };

// ── 日期工具 ─────────────────────────────────────────────────────────────────
t('dayKey/parseDayKey 往返一致', () => {
  eq(core.parseDayKey(core.dayKey(NOW)), new Date(2026, 9, 29).getTime());
});
t('parseDayKey 拒绝 2 月 30 日与垃圾', () => {
  eq(core.parseDayKey('2026-02-30'), null);
  eq(core.parseDayKey('明天'), null);
  eq(core.parseDayKey(''), null);
  eq(core.parseDayKey('2026-13-01'), null);
});
t('addMonths 月末钳制与闰年', () => {
  eq(core.addMonths('2026-01-31', 1), '2026-02-28');
  eq(core.addMonths('2024-01-31', 1), '2024-02-29');
  eq(core.addMonths('2026-12-31', 2), '2027-02-28');
  eq(core.addMonths('2026-03-31', -1), '2026-02-28');
  eq(core.addMonths('2026-02-30', 1), null);
});
t('addDays 跨月/跨年', () => {
  eq(core.addDays('2026-10-29', 0), '2026-10-29');
  eq(core.addDays('2026-10-29', 60), '2026-12-28');
  eq(core.addDays('2026-12-31', 1), '2027-01-01');
  eq(core.addDays('2026-10-29', -58), '2026-09-01');
});
t('dayDiff 自然日差', () => {
  eq(core.dayDiff('2026-11-01', '2026-10-29'), 3);
  eq(core.dayDiff('2026-10-29', '2026-11-01'), -3);
  eq(core.dayDiff('垃圾', '2026-10-29'), null);
});
t('fmtMoney 元/万自适应', () => {
  eq(core.fmtMoney(4546.45), '4546.45 元');
  eq(core.fmtMoney(4000), '4000 元');
  eq(core.fmtMoney(883540.09), '88.35 万');
  eq(core.fmtMoney(3000000), '300 万');
  eq(core.fmtMoney(1234567), '123.5 万');
  eq(core.fmtMoney(null), '—');
});

// ── 规范化 ───────────────────────────────────────────────────────────────────
t('member：空名拒绝/关系枚举/幂等 id', () => {
  ok(core.normalizeMember({ name: '  ' }, null).error, '空名拒绝');
  ok(core.normalizeMember({ name: '某人', relation: 'boss' }, null).error, '非法 relation 拒绝');
  const a = core.normalizeMember({ name: '妻子' }, null).member;
  const b = core.normalizeMember({ name: ' 妻子 ' }, null).member;
  eq(a.id, b.id, '同名同 id');
  eq(a.relation, 'other', '缺省 other');
  const c = core.normalizeMember({ name: '大娃', relation: 'child', birthYear: 2020.7 }, null).member;
  eq(c.birthYear, 2020, 'birthYear 取整');
  ok(core.normalizeMember({ name: '大娃', birthYear: 1899 }, null).error, 'birthYear 越界拒绝');
});
t('policy：必填与枚举/日期矛盾/成对终止', () => {
  const base = { name: 'e生保', kind: 'medical', insuredId: 'm1', premium: 300, startDate: '2024-05-01' };
  ok(!core.normalizePolicy(base, null).error, '合法通过');
  ok(core.normalizePolicy({ ...base, name: '' }, null).error, '空名拒绝');
  ok(core.normalizePolicy({ ...base, kind: 'cars' }, null).error, '非法 kind 拒绝');
  ok(core.normalizePolicy({ ...base, insuredId: '' }, null).error, '缺被保人拒绝');
  ok(core.normalizePolicy({ ...base, freq: 'weekly' }, null).error, '非法 freq 拒绝');
  ok(core.normalizePolicy({ ...base, startDate: '2026-02-30' }, null).error, '非法日期拒绝');
  ok(core.normalizePolicy({ ...base, endDate: '2024-05-01' }, null).error, 'endDate<=startDate 拒绝');
  ok(core.normalizePolicy({ ...base, endDate: '2024-05-01T00:00' }, null).error, 'endDate 非日期串拒绝');
  ok(core.normalizePolicy({ ...base, endReason: 'surrender' }, null).error, 'endReason 缺 endedAt 拒绝');
  ok(core.normalizePolicy({ ...base, endedAt: '2025-01-01' }, null).error, 'endedAt 缺 endReason 拒绝');
  ok(core.normalizePolicy({ ...base, premium: -1 }, null).error, '负保费拒绝');
  ok(core.normalizePolicy({ ...base, payYears: 0 }, null).error, 'payYears=0 拒绝');
  const single = core.normalizePolicy({ ...base, freq: 'single' }, null).policy;
  eq(single.payYears, 1, '趸交 payYears=1');
  const id1 = core.normalizePolicy({ ...base, company: '平安' }, null).policy.id;
  const id2 = core.normalizePolicy({ ...base, company: ' 平安 ' }, null).policy.id;
  eq(id1, id2, 'company 修剪后同 id');
});
t('event：type 枚举/occKey 格式/金额边界', () => {
  ok(core.normalizeEvent({ type: 'refund', policyId: 'p1' }, null).error, '非法 type 拒绝');
  ok(core.normalizeEvent({ type: 'pay' }, null).error, '缺 policyId 拒绝');
  ok(core.normalizeEvent({ type: 'pay', policyId: 'p1', amount: -5 }, null).error, '负金额拒绝');
  const ev = core.normalizeEvent({ type: 'claim', policyId: 'p1', date: '2026-08-01', amount: 8000, note: '住院' }, null).ev;
  eq(ev.occKey, 'claim|p1|2026-08-01', 'occKey 格式');
  const ev2 = core.normalizeEvent({ type: 'pay', policyId: 'p1', date: 'bogus' }, null);
  ok(ev2.error && ev2.error.includes('date'), '非法 date 拒绝');
});
t('settings：钳制与缺省', () => {
  eq(core.normalizeSettings(null), { graceDays: 60, warnDays: 30 });
  eq(core.normalizeSettings({ graceDays: 9999, warnDays: 0 }), { graceDays: 60, warnDays: 30 }, '非法回落缺省');
});

// ── 缴费进度 ─────────────────────────────────────────────────────────────────
function mkPolicy(over) {
  return core.normalizePolicy({
    name: '测试险', kind: 'critical', insuredId: 'm1', premium: 4000,
    freq: 'yearly', payYears: 20, startDate: '2023-05-01', ...over,
  }, null).policy;
}
t('缴费进度：无事件=首期已缴', () => {
  const p = mkPolicy({});
  eq(core.paidUntilOf(p, []), '2023-05-01');
  eq(core.periodsPaid(p, '2023-05-01'), 1);
  eq(core.nextPayDate(p, []), '2024-05-01');
});
t('缴费进度：pay 事件推进/补缴/期数', () => {
  const p = mkPolicy({});
  const evs = [
    core.normalizeEvent({ type: 'pay', policyId: p.id, date: '2024-05-01' }, null).ev,
    core.normalizeEvent({ type: 'pay', policyId: p.id, date: '2025-05-01' }, null).ev,
  ];
  eq(core.periodsPaid(p, core.paidUntilOf(p, evs)), 3, '3 期已缴');
  eq(core.nextPayDate(p, evs), '2026-05-01');
});
t('缴费进度：缴满 payYears 后无续期', () => {
  const p = mkPolicy({ payYears: 5 });
  const evs = ['2024-05-01', '2025-05-01', '2026-05-01', '2027-05-01'].map((d) =>
    core.normalizeEvent({ type: 'pay', policyId: p.id, date: d }, null).ev);
  // 4 次 pay + 首期 = 5 期 → 缴费期满
  eq(core.totalPeriods(p), 5);
  eq(core.nextPayDate(p, evs), null);
});
t('缴费进度：月缴步进', () => {
  const p = mkPolicy({ freq: 'monthly', startDate: '2026-01-15' });
  eq(core.periodsPaid(p, '2026-02-15'), 2);
  eq(core.nextPayDate(p, []), '2026-02-15');
  const evs = [core.normalizeEvent({ type: 'pay', policyId: p.id, date: '2026-02-15' }, null).ev];
  eq(core.nextPayDate(p, evs), '2026-03-15');
});
t('缴费进度：缴费年限未记=持续推进', () => {
  const p = mkPolicy({ payYears: null });
  eq(core.totalPeriods(p), null);
  const evs = ['2024-05-01', '2025-05-01', '2026-05-01'].map((d) =>
    core.normalizeEvent({ type: 'pay', policyId: p.id, date: d }, null).ev);
  eq(core.nextPayDate(p, evs), '2027-05-01', '未知年限照常推进');
});
t('缴费进度：趸交无续期', () => {
  const p = mkPolicy({ freq: 'single', startDate: '2024-05-01' });
  eq(core.nextPayDate(p, []), null);
});

// ── 状态机 ───────────────────────────────────────────────────────────────────
t('状态机：有效（warnDays 内/外）', () => {
  const near = mkPolicy({ startDate: '2023-11-15' });
  const nearEvs = ['2024-11-15', '2025-11-15'].map((d) =>
    core.normalizeEvent({ type: 'pay', policyId: near.id, date: d }, null).ev);
  const st1 = core.policyStatus(near, nearEvs, SETTINGS, NOW);
  eq(st1.state, 'active');
  eq(st1.nextPayDate, '2026-11-15');
  eq(st1.daysToPay, 17, '10-29 → 11-15 为 17 天');
  const far = mkPolicy({ startDate: '2026-01-01' });
  const st2 = core.policyStatus(far, [], SETTINGS, NOW);
  eq(st2.state, 'active');
  eq(st2.daysToPay, 64, '超 warnDays 也在 active（黄榜过滤在展示层）');
});
t('状态机：宽限期（逾期未超 60 天，保障仍有效）', () => {
  const p = mkPolicy({ startDate: '2020-09-01' });
  const evs = ['2021-09-01', '2022-09-01', '2023-09-01', '2024-09-01', '2025-09-01'].map((d) =>
    core.normalizeEvent({ type: 'pay', policyId: p.id, date: d }, null).ev);
  const st = core.policyStatus(p, evs, SETTINGS, NOW);
  eq(st.nextPayDate, '2026-09-01');
  eq(st.graceEnd, '2026-10-31');
  eq(st.state, 'grace');
});
t('状态机：中止期（宽限期后 2 年内，出险不赔）', () => {
  const p = mkPolicy({ startDate: '2020-06-01' });
  const evs = ['2021-06-01', '2022-06-01', '2023-06-01', '2024-06-01', '2025-06-01'].map((d) =>
    core.normalizeEvent({ type: 'pay', policyId: p.id, date: d }, null).ev);
  const st = core.policyStatus(p, evs, SETTINGS, NOW);
  eq(st.nextPayDate, '2026-06-01');
  eq(st.state, 'lapse');
});
t('状态机：效力终止（复效期 2 年已过）', () => {
  const p = mkPolicy({ startDate: '2018-01-01', payYears: null });
  const st = core.policyStatus(p, [], SETTINGS, NOW);
  eq(st.state, 'terminated');
});
t('状态机：复效事件拉回有效（补缴至复效日）', () => {
  const p = mkPolicy({ startDate: '2020-06-01' });
  const evs = ['2021-06-01', '2022-06-01', '2023-06-01', '2024-06-01', '2025-06-01'].map((d) =>
    core.normalizeEvent({ type: 'pay', policyId: p.id, date: d }, null).ev);
  eq(core.policyStatus(p, evs, SETTINGS, NOW).state, 'lapse');
  const re = core.normalizeEvent({ type: 'reinstate', policyId: p.id, date: '2026-08-15', note: '复效' }, null).ev;
  const st2 = core.policyStatus(p, [...evs, re], SETTINGS, NOW);
  eq(st2.state, 'active', '复效后有效');
  eq(st2.paidUntil, '2026-08-15', '账面补缴至复效日');
  eq(st2.nextPayDate, '2027-08-15');
});
t('状态机：退保（晚于复效即已退保）', () => {
  const p = mkPolicy({ startDate: '2020-06-01' });
  const sur = core.normalizeEvent({ type: 'surrender', policyId: p.id, date: '2026-05-01' }, null).ev;
  eq(core.policyStatus(p, [sur], SETTINGS, NOW).state, 'surrendered');
  eq(core.policyStatus(p, [sur], SETTINGS, NOW).surrenderDate, '2026-05-01');
  const re = core.normalizeEvent({ type: 'reinstate', policyId: p.id, date: '2026-06-15' }, null).ev;
  eq(core.policyStatus(p, [sur, re], SETTINGS, NOW).state, 'active', '退保后又复效=有效');
  const sur2 = core.normalizeEvent({ type: 'surrender', policyId: p.id, date: '2026-07-01' }, null).ev;
  eq(core.policyStatus(p, [sur, re, sur2], SETTINGS, NOW).state, 'surrendered', '再退保=已退保');
});
t('状态机：满期（endDate 过境）', () => {
  const p = mkPolicy({ endDate: '2026-09-30' });
  eq(core.policyStatus(p, [], SETTINGS, NOW).state, 'matured');
});
t('状态机：等待期优先于有效', () => {
  const p = mkPolicy({ startDate: '2026-10-01', waitingDays: 90 });
  const st = core.policyStatus(p, [], SETTINGS, NOW);
  eq(st.state, 'waiting');
  eq(st.waitingEnd, '2026-12-30');
});
t('状态机：手动终止（endReason 成对）', () => {
  const p = mkPolicy({ endReason: 'terminated', endedAt: '2026-03-01' });
  const st = core.policyStatus(p, [], SETTINGS, NOW);
  eq(st.state, 'terminated');
  eq(core.nextPayDate(p, []), null, '终止后无续期');
});
t('短险：一年期无宽限期，到期即满期', () => {
  ok(core.graceApplies(mkPolicy({ payYears: 1, startDate: '2025-01-01', endDate: '2026-01-01' })) === false, '1 年期≈1 年保障');
  ok(core.graceApplies(mkPolicy({ payYears: 1 })) === true, '未填满期日保守按长险');
  ok(core.graceApplies(mkPolicy({ payYears: 20 })) === true, '长期缴费有宽限');
  const short1 = mkPolicy({ payYears: 1, startDate: '2025-11-15', endDate: '2026-11-15' });
  const st1 = core.policyStatus(short1, [], SETTINGS, NOW);
  eq(st1.state, 'active', '未到期仍有效（只缴一期，无续缴）');
  eq(st1.nextPayDate, null);
  const short2 = mkPolicy({ payYears: 1, startDate: '2025-01-15', endDate: '2026-01-15' });
  eq(core.policyStatus(short2, [], SETTINGS, NOW).state, 'matured', '过境即满期（无宽限/中止）');
});

// ── 投影聚合 ─────────────────────────────────────────────────────────────────
const M = {
  self: core.normalizeMember({ name: '本人', relation: 'self' }, null).member,
  wife: core.normalizeMember({ name: '妻子', relation: 'spouse' }, null).member,
  kid: core.normalizeMember({ name: '大娃', relation: 'child' }, null).member,
};
function mkPolicyFor(insuredId, over) {
  return core.normalizePolicy({
    name: `险-${insuredId}-${over.kind}`, kind: over.kind, insuredId, insuredIdFix: undefined,
    premium: 1000, freq: 'yearly', startDate: '2024-01-01', ...over,
  }, null).policy;
}
t('paymentCalendar：逾期置顶 + 窗口过滤', () => {
  const p1 = mkPolicyFor(M.self.id, { kind: 'critical', startDate: '2025-11-10' }); // nextPay 2026-11-10
  const p2 = mkPolicyFor(M.wife.id, { kind: 'medical', startDate: '2025-10-20' });   // nextPay 2026-10-20 逾期 9 天
  const p3 = mkPolicyFor(M.kid.id, { kind: 'accident', startDate: '2026-01-01' });   // nextPay 2027-01-01
  const p4 = mkPolicyFor(M.self.id, { kind: 'life', startDate: '2025-01-01' });
  const sur = core.normalizeEvent({ type: 'surrender', policyId: p4.id, date: '2025-01-01' }, null).ev;
  const rows = core.paymentCalendar([p1, p2, p3, p4], [sur], SETTINGS, NOW, 90);
  eq(rows.map((r) => r.policyId), [p2.id, p1.id, p3.id], '逾期在前，90 天窗口含 2027-01-01');
  eq(rows[0].state, 'grace');
  eq(rows[0].daysToPay, -9);
});
t('gapMatrix：覆盖合计/缺格/中止不计入/信息层', () => {
  const medSelf = mkPolicyFor(M.self.id, { kind: 'medical', coverage: 3000000, startDate: '2026-06-01' });
  const critSelf = mkPolicyFor(M.self.id, { kind: 'critical', coverage: 500000, startDate: '2026-06-01' });
  const lifeLapse = mkPolicyFor(M.self.id, { kind: 'life', coverage: 1000000, startDate: '2020-06-01' });
  const lapseEvs = ['2021-06-01', '2022-06-01', '2023-06-01', '2024-06-01', '2025-06-01'].map((d) =>
    core.normalizeEvent({ type: 'pay', policyId: lifeLapse.id, date: d }, null).ev);
  const medWife = mkPolicyFor(M.wife.id, { kind: 'medical', coverage: 2000000, startDate: '2026-06-01' });
  const accKid = mkPolicyFor(M.kid.id, { kind: 'accident', coverage: 200000, startDate: '2026-06-01' });
  const annSelf = mkPolicyFor(M.self.id, { kind: 'annuity', coverage: null, startDate: '2026-06-01' });
  const gap = core.gapMatrix([M.self, M.wife, M.kid], [medSelf, critSelf, lifeLapse, medWife, accKid, annSelf], lapseEvs, SETTINGS, NOW);
  const self = gap.rows.find((r) => r.name === '本人');
  eq(self.cells.medical, { count: 1, sum: 3000000 });
  eq(self.cells.critical, { count: 1, sum: 500000 });
  eq(self.missing, ['life', 'accident'], '中止期寿险不计入；本人无意外险');
  const wife = gap.rows.find((r) => r.name === '妻子');
  eq(wife.missing, ['critical', 'life', 'accident']);
  const kid = gap.rows.find((r) => r.name === '大娃');
  eq(kid.missing, ['medical', 'critical', 'life']);
  eq(gap.otherKinds.annuity, 1, '年金进信息层');
});
t('premiumFlow：年缴单笔/月缴分桶/趸交不计', () => {
  const pY = mkPolicyFor(M.self.id, { kind: 'critical', startDate: '2025-11-10', premium: 4000 });
  const pM = mkPolicyFor(M.wife.id, { kind: 'medical', startDate: '2026-09-15', premium: 100, freq: 'monthly', payYears: null });
  const pS = mkPolicyFor(M.kid.id, { kind: 'other', freq: 'single', premium: 20000, startDate: '2026-01-01' });
  const flow = core.premiumFlow([pY, pM, pS], [], SETTINGS, NOW);
  eq(flow.months['2026-11'].amount, 4100, '11 月桶 = 年缴 4000 + 月缴 100');
  ok(!flow.months['2027-11'], '窗口外不计');
  const mKeys = Object.keys(flow.months).filter((k) => k !== '2026-11');
  eq(mKeys.length, 11, `月缴其余 11 个桶（${mKeys.join(',')}）`);
  const mSum = mKeys.reduce((a, k) => a + flow.months[k].amount, 0);
  eq(mSum, 1100, '月缴 100×11');
  eq(flow.total, 5200, '合计 4000+1200，趸交不计');
});
t('premiumFlow：缴满 payYears 后不再计', () => {
  const p = mkPolicyFor(M.self.id, { kind: 'critical', payYears: 3, startDate: '2023-11-10' });
  // 首期 2023-11-10 + 3 次 pay = 4 期 > 3 → 期满
  const evs = ['2024-11-10', '2025-11-10', '2026-11-10'].map((d) =>
    core.normalizeEvent({ type: 'pay', policyId: p.id, date: d }, null).ev);
  const flow = core.premiumFlow([p], evs, SETTINGS, NOW);
  eq(flow.total, 0, '缴费期满不计现金流');
});
t('familyTotals：年化/趸交不计/已缴/理赔/状态分布', () => {
  const pY = mkPolicyFor(M.self.id, { kind: 'critical', startDate: '2025-11-10', premium: 4000 });
  const pM = mkPolicyFor(M.wife.id, { kind: 'medical', startDate: '2026-09-15', premium: 100, freq: 'monthly', payYears: null });
  const pS = mkPolicyFor(M.kid.id, { kind: 'other', freq: 'single', premium: 20000, startDate: '2026-01-01' });
  const pG = mkPolicyFor(M.wife.id, { kind: 'life', startDate: '2025-10-20', premium: 600 }); // grace
  const payEv = core.normalizeEvent({ type: 'pay', policyId: pY.id, date: '2025-11-10', amount: 4000 }, null).ev;
  const payNoAmt = core.normalizeEvent({ type: 'pay', policyId: pM.id, date: '2026-09-15' }, null).ev;
  const claim = core.normalizeEvent({ type: 'claim', policyId: pY.id, date: '2026-08-01', amount: 8000 }, null).ev;
  const tot = core.familyTotals([pY, pM, pS, pG], [payEv, payNoAmt, claim], SETTINGS, NOW);
  eq(tot.policyCount, 4);
  eq(tot.activeCount, 4, '全部在保（grace 计入）');
  eq(tot.annualizedPremium, 4000 + 1200 + 600, '趸交 20000 不计入年化');
  eq(tot.totalPaid, 4000 + 100, 'pay 金额缺额回落保单保费');
  eq(tot.totalClaim, 8000);
  eq(tot.byState, { active: 1, grace: 2, 'paid-off': 1 }, '状态分布如实');
});
t('describePolicy：要素齐全', () => {
  const p = mkPolicyFor(M.self.id, { kind: 'critical', company: '平安', coverage: 500000, premium: 4000 });
  const s = core.describePolicy(p, '本人');
  ok(s.includes('平安') && s.includes('重疾') && s.includes('4000 元') && s.includes('生效 2024-01-01') && s.includes('保额 50 万'), s);
});
t('idFor：seed 稳定', () => {
  eq(core.idFor('policy|m1|critical|平安|重疾2021'), core.idFor('policy|m1|critical|平安|重疾2021'));
  ok(core.idFor('a') !== core.idFor('b'));
});

// ── 汇总 ─────────────────────────────────────────────────────────────────────
let failed = 0;
for (const r of results) {
  if (r.pass) console.log(`✓ ${r.name}`);
  else { failed += 1; console.error(`✗ ${r.name}\n    ${r.detail}`); }
}
console.log('');
if (failed) {
  console.error(`❌ ${failed}/${results.length} 项失败`);
  process.exit(1);
}
console.log(`✅ run-tests 通过（${results.length} 组）`);
