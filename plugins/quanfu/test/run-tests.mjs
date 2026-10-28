#!/usr/bin/env node
'use strict';
/**
 * 泉府离线单测：node test/run-tests.mjs（零依赖零 mock，纯函数行为级）
 * 覆盖：日期/金额工具、贷款与事件规范化边界、三种还款方式金标准手算例
 * （首期/末期/Σ本金守恒）、事件分段重放（利率变更/提前还款双模式）、
 * whatif 三方案与不可行路径、重定价日推导、对账漂移、年度构成、家庭合计。
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
function near(actual, expected, eps, label) {
  if (Math.abs(actual - expected) > eps) throw new Error(`${label || ''} 期望≈${expected} 实得 ${actual}（eps=${eps}）`);
}

// 固定「现在」：2026-10-29（周四）本地 10:30
const NOW = new Date(2026, 9, 29, 10, 30).getTime();
const TODAY = '2026-10-29';

// ── 日期/金额工具 ─────────────────────────────────────────────────────────────
t('dayKey/parseDayKey 往返一致', () => {
  eq(core.parseDayKey(core.dayKey(NOW)), new Date(2026, 9, 29).getTime());
});
t('parseDayKey 拒绝 2 月 30 日与垃圾', () => {
  eq(core.parseDayKey('2026-02-30'), null);
  eq(core.parseDayKey('明天'), null);
  eq(core.parseDayKey(''), null);
});
t('addMonths 月末钳制与闰年', () => {
  eq(core.addMonths('2026-01-31', 1), '2026-02-28');
  eq(core.addMonths('2024-01-31', 1), '2024-02-29');
  eq(core.addMonths('2026-12-31', 2), '2027-02-28');
  eq(core.addMonths('2026-03-31', -1), '2026-02-28');
  eq(core.addMonths('2026-02-30', 1), null);
});
t('dayDiff 自然日差', () => {
  eq(core.dayDiff('2026-11-01', '2026-10-29'), 3);
  eq(core.dayDiff('2026-10-29', '2026-11-01'), -3);
});
t('round2 分级舍入', () => {
  eq(core.round2(4546.4474), 4546.45);
  eq(core.round2(0.1 + 0.2), 0.3);
});
t('fmtMoney 万/元自适应与负号', () => {
  eq(core.fmtMoney(4546.45), '4546.45 元');
  eq(core.fmtMoney(883540.09), '88.35 万');
  eq(core.fmtMoney(1234567), '123.5 万');
  eq(core.fmtMoney(-50), '−50 元');
  eq(core.fmtMoney(null), '—');
});
t('fmtPct', () => {
  eq(core.fmtPct(3.6), '3.6%');
  eq(core.fmtPct(3.8575), '3.8575%');
  eq(core.fmtPct(null), '—');
});

// ── 规范化 ───────────────────────────────────────────────────────────────────
const VALID_LOAN = {
  name: '商贷', kind: 'mortgage', method: 'annuity',
  principal: 1000000, annualRate: 3.6, startDate: '2021-03-01', termMonths: 360,
};
t('normalizeLoan 合法路径与 id 确定性（同名同 id）', () => {
  const a = core.normalizeLoan({ ...VALID_LOAN }, null);
  const b = core.normalizeLoan({ ...VALID_LOAN, note: 'x' }, null);
  ok(!a.error && a.loan);
  ok(!b.error && b.loan);
  eq(a.loan.id, b.loan.id);
  eq(a.loan.active, true);
  eq(a.loan.lender, '');
});
t('normalizeLoan 边界拒绝', () => {
  ok(core.normalizeLoan({ ...VALID_LOAN, name: '' }, null).error);
  ok(core.normalizeLoan({ ...VALID_LOAN, method: 'weird' }, null).error);
  ok(core.normalizeLoan({ ...VALID_LOAN, method: '' }, null).error);
  ok(core.normalizeLoan({ ...VALID_LOAN, principal: 50 }, null).error);
  ok(core.normalizeLoan({ ...VALID_LOAN, principal: 3e8 }, null).error);
  ok(core.normalizeLoan({ ...VALID_LOAN, annualRate: 0 }, null).error);
  ok(core.normalizeLoan({ ...VALID_LOAN, annualRate: 40 }, null).error);
  ok(core.normalizeLoan({ ...VALID_LOAN, termMonths: 0 }, null).error);
  ok(core.normalizeLoan({ ...VALID_LOAN, termMonths: 601 }, null).error);
  ok(core.normalizeLoan({ ...VALID_LOAN, termMonths: 360.5 }, null).error);
  ok(core.normalizeLoan({ ...VALID_LOAN, startDate: '2021-02-30' }, null).error);
  ok(core.normalizeLoan({ ...VALID_LOAN, startDate: 'abc' }, null).error);
});
t('normalizeLoan repricing 校验', () => {
  ok(core.normalizeLoan({ ...VALID_LOAN, repricing: { day: '01-01', cycleMonths: 12 } }, null).loan.repricing.day === '01-01');
  ok(core.normalizeLoan({ ...VALID_LOAN, repricing: { day: 'anniversary', cycleMonths: 6 } }, null).loan.repricing.day === 'anniversary');
  ok(core.normalizeLoan({ ...VALID_LOAN, repricing: { day: '13-01', cycleMonths: 12 } }, null).error);
  ok(core.normalizeLoan({ ...VALID_LOAN, repricing: { day: '01-32', cycleMonths: 12 } }, null).error);
  ok(core.normalizeLoan({ ...VALID_LOAN, repricing: { day: '01-01', cycleMonths: 5 } }, null).error);
  eq(core.normalizeLoan({ ...VALID_LOAN, repricing: null }, null).loan.repricing, null);
});
t('normalizeLoan update 合并 prev（只传 patch 字段）', () => {
  const prev = core.normalizeLoan({ ...VALID_LOAN }, null).loan;
  const r = core.normalizeLoan({ annualRate: 3.3 }, prev);
  ok(!r.error && r.loan);
  eq(r.loan.annualRate, 3.3);
  eq(r.loan.principal, 1000000);
  eq(r.loan.id, prev.id);
});
t('normalizeEvent：occKey 幂等（同日同型同键）', () => {
  const a = core.normalizeEvent({ type: 'rate', loanId: 'l1', date: '2026-11-01', rate: 3.3 }, null);
  const b = core.normalizeEvent({ type: 'rate', loanId: 'l1', date: '2026-11-01', rate: 3.5 }, null);
  ok(!a.error && !b.error);
  eq(a.ev.occKey, 'rate|l1|2026-11-01');
  eq(b.ev.occKey, 'rate|l1|2026-11-01');
});
t('normalizeEvent 边界拒绝', () => {
  ok(core.normalizeEvent({ type: 'zzz', loanId: 'l1', date: '2026-01-01' }, null).error);
  ok(core.normalizeEvent({ type: 'rate', loanId: '', date: '2026-01-01', rate: 3.3 }, null).error);
  ok(core.normalizeEvent({ type: 'rate', loanId: 'l1', date: '2026-02-30', rate: 3.3 }, null).error);
  ok(core.normalizeEvent({ type: 'rate', loanId: 'l1', date: '2026-01-01', rate: 0 }, null).error);
  ok(core.normalizeEvent({ type: 'rate', loanId: 'l1', date: '2026-01-01' }, null).error);
  ok(core.normalizeEvent({ type: 'prepay', loanId: 'l1', date: '2026-01-01', amount: 50, mode: 'term' }, null).error);
  ok(core.normalizeEvent({ type: 'prepay', loanId: 'l1', date: '2026-01-01', amount: 5000 }, null).error);
  ok(core.normalizeEvent({ type: 'prepay', loanId: 'l1', date: '2026-01-01', amount: 5000, mode: 'zzz' }, null).error);
  ok(core.normalizeEvent({ type: 'checkpoint', loanId: 'l1', date: '2026-01-01', amount: -1 }, null).error);
  const cp = core.normalizeEvent({ type: 'checkpoint', loanId: 'l1', date: '2026-01-01', amount: 650000 }, null);
  ok(!cp.error && cp.ev.amount === 650000);
});
t('normalizeSettings 钳制', () => {
  const s = core.normalizeSettings({ warnDays: 99, repricingWarnDays: 0, driftWarn: -5 });
  eq(s.warnDays, 30);
  eq(s.repricingWarnDays, 1);
  eq(s.driftWarn, 1);
  eq(core.normalizeSettings(null).warnDays, 3);
  eq(core.normalizeSettings({ warnDays: '7' }).warnDays, 7);
});

// ── 引擎：三种还款方式 ───────────────────────────────────────────────────────
const LOAN_A = core.normalizeLoan({ ...VALID_LOAN }, null).loan; // 100万 3.6% 360期 annuity
t('等额本息金标准：月供 4546.45、首期息 3000/本 1546.45', () => {
  const sim = core.simulate(LOAN_A, []);
  eq(sim.periods[0].payment, 4546.45);
  eq(sim.periods[0].interest, 3000);
  eq(sim.periods[0].principal, 1546.45);
  eq(sim.periods[0].closing, 998453.55);
});
t('等额本息守恒：Σ本金=本金、期数=360、末期清零', () => {
  const sim = core.simulate(LOAN_A, []);
  eq(sim.periods.length, 360);
  near(sim.periods.reduce((s, p) => s + p.principal, 0), 1000000, 0.005, 'Σ本金');
  eq(sim.periods[359].closing, 0);
  ok(sim.periods.slice(1).every((p, i) => p.closing < sim.periods[i].closing || (p.closing === 0 && sim.periods[i].closing > 0)), '余额单调不增');
});
t('等额本息利率近零：月供趋近 P/n', () => {
  const loan = core.normalizeLoan({ ...VALID_LOAN, annualRate: 0.0001 }, null).loan;
  const sim = core.simulate(loan, []);
  // 手算：r=8.33e-8，annuity 公式 pmt≈2777.82（略高于 P/n=2777.78 的部分为利息）
  near(sim.periods[0].payment, 2777.82, 0.05, '首期');
  eq(sim.periods.length, 360);
});
t('annuityPmt 单期金标准：n=1 时月供=本息和', () => {
  eq(core.annuityPmt(1000, 12, 1), 1010);
  eq(core.annuityPmt(1200, 0.0001, 1), 1200);
});
t('等额本金金标准：首期 6933.33、末期补差', () => {
  const loan = core.normalizeLoan({ ...VALID_LOAN, method: 'linear', principal: 1200000 }, null).loan;
  const sim = core.simulate(loan, []);
  eq(sim.periods[0].payment, 6933.33);
  eq(sim.periods[0].principal, 3333.33);
  near(sim.periods.reduce((s, p) => s + p.principal, 0), 1200000, 0.005, 'Σ本金');
  eq(sim.periods[359].closing, 0);
});
t('先息后本：逐期只付息、到期还本', () => {
  const loan = core.normalizeLoan({ ...VALID_LOAN, method: 'bullet', termMonths: 60 }, null).loan;
  const sim = core.simulate(loan, []);
  eq(sim.periods[0].payment, 3000);
  eq(sim.periods[0].principal, 0);
  eq(sim.periods[58].payment, 3000);
  eq(sim.periods[59].payment, 1003000);
  eq(sim.periods[59].closing, 0);
  eq(sim.periods.length, 60);
});

// ── 引擎：事件分段重放 ───────────────────────────────────────────────────────
t('利率变更：变更期起用新利率、annuity 月供重推（保期数）', () => {
  const ev = core.normalizeEvent({ type: 'rate', loanId: LOAN_A.id, date: '2026-11-01', rate: 3.3 }, null).ev;
  const sim = core.simulate(LOAN_A, [ev]);
  const idx = sim.periods.findIndex((p) => p.date === '2026-11-01');
  ok(idx > 0);
  eq(sim.periods[idx].rate, 3.3);
  eq(sim.periods[idx - 1].rate, 3.6);
  ok(sim.periods[idx].payment < sim.periods[idx - 1].payment, '降息后月供应下降');
  eq(sim.periods.length, 360);
});
t('早于首期的利率事件在第一期生效', () => {
  const ev = core.normalizeEvent({ type: 'rate', loanId: LOAN_A.id, date: '2020-12-15', rate: 4.0 }, null).ev;
  const sim = core.simulate(LOAN_A, [ev]);
  eq(sim.periods[0].rate, 4.0);
  ok(sim.periods[0].payment > 4546.45, '升息后月供上升');
});
t('提前还款-减供：期数不变、下期月供下降、Σ本金+Σ提前还=本金', () => {
  const ev = core.normalizeEvent({ type: 'prepay', loanId: LOAN_A.id, date: '2026-11-01', amount: 200000, mode: 'payment' }, null).ev;
  const base = core.simulate(LOAN_A, []);
  const sim = core.simulate(LOAN_A, [ev]);
  eq(sim.periods.length, base.periods.length, '期数不变');
  const idx = sim.periods.findIndex((p) => p.prepay);
  ok(idx > 0 && sim.periods[idx].prepay === 200000);
  ok(sim.periods[idx].payment < base.periods[idx].payment, '减供后月供下降');
  near(sim.periods.reduce((s, p) => s + p.principal + (p.prepay || 0), 0), 1000000, 0.02, 'Σ本金+提前还');
  eq(sim.periods[sim.periods.length - 1].closing, 0);
});
t('提前还款-缩期：月供基本不变、期数缩短、末期补差收尾', () => {
  const ev = core.normalizeEvent({ type: 'prepay', loanId: LOAN_A.id, date: '2026-11-01', amount: 200000, mode: 'term' }, null).ev;
  const base = core.simulate(LOAN_A, []);
  const sim = core.simulate(LOAN_A, [ev]);
  ok(sim.periods.length < base.periods.length, `缩期后期数 ${sim.periods.length} < ${base.periods.length}`);
  const idx = sim.periods.findIndex((p) => p.prepay);
  near(sim.periods[idx].payment, base.periods[idx].payment, 0.02, '缩期当期月供不变');
  // 末期补差：按保月供解出期数后，末期只收剩余零头（银行同口径）
  ok(sim.periods[sim.periods.length - 1].payment < base.periods[idx].payment, '末期补差 < 月供');
  eq(sim.periods[sim.periods.length - 1].closing, 0);
  near(sim.periods.reduce((s, p) => s + p.principal + (p.prepay || 0), 0), 1000000, 0.02, 'Σ本金+提前还');
  ok(sim.periods[sim.periods.length - 1].date < base.periods[base.periods.length - 1].date, '结清日提前');
});
t('等额本金缩期：月本金不变、期数缩短', () => {
  const loan = core.normalizeLoan({ ...VALID_LOAN, method: 'linear' }, null).loan;
  const ev = core.normalizeEvent({ type: 'prepay', loanId: loan.id, date: '2026-11-01', amount: 100000, mode: 'term' }, null).ev;
  const base = core.simulate(loan, []);
  const sim = core.simulate(loan, [ev]);
  const idx = sim.periods.findIndex((p) => p.prepay);
  near(sim.periods[idx].principal, base.periods[idx].principal, 0.02, '月本金不变');
  ok(sim.periods.length < base.periods.length);
  eq(sim.periods[sim.periods.length - 1].closing, 0);
});
t('连续事件：重定价 + 提前还款按序重放', () => {
  const e1 = core.normalizeEvent({ type: 'rate', loanId: LOAN_A.id, date: '2026-11-01', rate: 3.3 }, null).ev;
  const e2 = core.normalizeEvent({ type: 'prepay', loanId: LOAN_A.id, date: '2027-01-01', amount: 100000, mode: 'term' }, null).ev;
  const sim = core.simulate(LOAN_A, [e2, e1]); // 乱序传入也应按日期排好
  const iRate = sim.periods.findIndex((p) => p.rate === 3.3);
  const iPre = sim.periods.findIndex((p) => p.prepay);
  ok(iRate > 0 && iPre > iRate);
  eq(sim.periods[sim.periods.length - 1].closing, 0);
});
t('全额结清拒绝（validatePrepay）', () => {
  const st = core.loanState(LOAN_A, [], NOW);
  const v = core.validatePrepay(LOAN_A, [], { date: '2026-11-01', amount: st.remainingPrincipal });
  ok(v.error && v.error.includes('全额结清'), '恰好全额应拒绝');
  const v2 = core.validatePrepay(LOAN_A, [], { date: '2020-01-01', amount: 100000 });
  ok(v2.error && v2.error.includes('早于'), '早于首期拒绝');
  const v3 = core.validatePrepay(LOAN_A, [], { date: '2051-03-01', amount: 100000 });
  ok(v3.error, '超出还款期拒绝');
  const v4 = core.validatePrepay(LOAN_A, [], { date: '2026-10-29', amount: 200000 });
  ok(!v4.error && v4.effectiveDate === '2026-11-01', `生效期=${v4.effectiveDate || v4.error}`);
});

// ── whatif 三方案 ────────────────────────────────────────────────────────────
t('whatif：缩期省息 > 减供省息（正利率 annuity）', () => {
  const w = core.whatifPrepay(LOAN_A, [], { date: '2026-10-29', amount: 200000 });
  ok(!w.error);
  eq(w.effectiveDate, '2026-11-01');
  ok(w.saved.term > w.saved.payment, `缩期省 ${w.saved.term} 应 > 减供省 ${w.saved.payment}`);
  ok(w.saved.term > 0 && w.saved.payment > 0);
  eq(w.term.nextPayment, w.baseline.nextPayment, '缩期月供不变');
  ok(w.payment.nextPayment < w.baseline.nextPayment, '减供月供下降');
  eq(w.payment.remainingMonths, w.baseline.remainingMonths, '减供期数不变');
  ok(w.term.remainingMonths < w.baseline.remainingMonths, '缩期期数缩短');
});
t('whatif：三方案同一分界（剩余利息可横向相减）', () => {
  const w = core.whatifPrepay(LOAN_A, [], { date: '2026-10-29', amount: 50000 });
  ok(!w.error);
  const base = core.simulate(LOAN_A, []);
  const slice = base.periods.filter((p) => p.date >= w.effectiveDate);
  near(w.baseline.remainingInterest, slice.reduce((s, p) => s + p.interest, 0), 0.01, '基准=无事件重放');
});
t('whatif：先息后本如实标注不缩期', () => {
  const loan = core.normalizeLoan({ ...VALID_LOAN, method: 'bullet', startDate: '2026-01-01', termMonths: 60 }, null).loan;
  const w = core.whatifPrepay(loan, [], { date: '2026-10-29', amount: 100000 });
  ok(!w.error);
  ok(w.bulletNote && w.bulletNote.includes('只减少每月利息'), w.bulletNote || '（无标注）');
  ok(w.term.sameAsPayment === true);
  eq(w.saved.term, w.saved.payment, 'bullet 两模式同解');
});
t('whatif：金额不足/越界报错', () => {
  ok(core.whatifPrepay(LOAN_A, [], { date: '2026-10-29', amount: 10 }).error, '低于 PREPAY_MIN');
  ok(core.whatifPrepay(LOAN_A, [], { date: '2026-10-29', amount: 1e9 }).error, '超过余额');
  ok(core.whatifPrepay(LOAN_A, [], { date: 'bad', amount: 100 }).error, '日期非法');
});

// ── 状态投影 / 重定价 / 对账 ────────────────────────────────────────────────
t('loanState：68 期已还、下次扣款 2026-11-01、剩余本金一致', () => {
  const st = core.loanState(LOAN_A, [], NOW);
  eq(st.monthsPaid, 68);
  eq(st.totalMonths, 360);
  eq(st.nextPaymentDate, '2026-11-01');
  eq(st.nextPaymentAmount, 4546.45);
  near(st.remainingPrincipal, 883540.09, 0.01, '剩余本金');
  near(st.paidInterest + st.remainingInterest, core.simulate(LOAN_A, []).periods.reduce((s, p) => s + p.interest, 0), 0.05, '已付+剩余=总利息');
  eq(st.settled, false);
  eq(st.endDate, '2051-02-01');
  ok(st.paidThisYearInterest > 0);
});
t('loanState：已结清贷款 settled=true', () => {
  const loan = core.normalizeLoan({ ...VALID_LOAN, termMonths: 24 }, null).loan;
  const st = core.loanState(loan, [], NOW);
  eq(st.settled, true);
  eq(st.nextPaymentDate, null);
  eq(st.remainingPrincipal, 0);
});
t('loanState：未来贷款 monthsPaid=0', () => {
  const loan = core.normalizeLoan({ ...VALID_LOAN, startDate: '2027-01-01' }, null).loan;
  const st = core.loanState(loan, [], NOW);
  eq(st.monthsPaid, 0);
  near(st.remainingPrincipal, 1000000, 0.001, '未开始=全额本金');
  eq(st.nextPaymentDate, '2027-01-01');
});
t('nextRepricing：固定 MM-DD 与 anniversary（rate 锚点优先）', () => {
  const loanA = core.normalizeLoan({ ...VALID_LOAN, repricing: { day: '01-01', cycleMonths: 12 } }, null).loan;
  eq(core.nextRepricing(loanA, [], TODAY), '2027-01-01');
  const loanB = core.normalizeLoan({ ...VALID_LOAN, repricing: { day: 'anniversary', cycleMonths: 12 } }, null).loan;
  eq(core.nextRepricing(loanB, [], TODAY), '2027-03-01', '无 rate 事件→锚=startDate 2021-03-01');
  const ev = core.normalizeEvent({ type: 'rate', loanId: loanB.id, date: '2026-05-10', rate: 3.3 }, null).ev;
  eq(core.nextRepricing(loanB, [ev], TODAY), '2027-05-10', '有 rate 事件→锚=最后 rate 日');
  const loanC = core.normalizeLoan({ ...VALID_LOAN, repricing: { day: '11-01', cycleMonths: 3 } }, null).loan;
  eq(core.nextRepricing(loanC, [], TODAY), '2026-11-01', '固定日历日=下一个该日（周期只对 anniversary 有意义）');
  const loanD = core.normalizeLoan({ ...VALID_LOAN, repricing: { day: 'anniversary', cycleMonths: 6 } }, null).loan;
  eq(core.nextRepricing(loanD, [], TODAY), '2027-03-01', 'anniversary+6 个月：从 2026-09-01 递推');
  eq(core.nextRepricing(LOAN_A, [], TODAY), null, '未配置→null');
});
t('对账漂移：正负号与账面口径', () => {
  const book = core.loanState(LOAN_A, [], NOW).remainingPrincipal;
  const cpMore = core.normalizeEvent({ type: 'checkpoint', loanId: LOAN_A.id, date: TODAY, amount: book + 120 }, null).ev;
  const st1 = core.loanState(LOAN_A, [cpMore], NOW);
  near(st1.checkpoints[0].drift, 120, 0.01, '银行比账面多 120');
  const cpLess = core.normalizeEvent({ type: 'checkpoint', loanId: LOAN_A.id, date: TODAY, amount: book - 0.5 }, null).ev;
  const st2 = core.loanState(LOAN_A, [cpLess], NOW);
  near(st2.checkpoints[0].drift, -0.5, 0.01, '分级内差异');
  eq(st2.checkpoints[0].bank, core.round2(book - 0.5));
});

// ── 年度构成 / 家庭合计 / 描述 ───────────────────────────────────────────────
t('yearlyBreakdown：年度利息合计=总利息、含提前还款计入当年', () => {
  const ev = core.normalizeEvent({ type: 'prepay', loanId: LOAN_A.id, date: '2026-11-01', amount: 200000, mode: 'payment' }, null).ev;
  const rows = core.yearlyBreakdown(LOAN_A, [ev]);
  const sim = core.simulate(LOAN_A, [ev]);
  near(rows.reduce((s, r) => s + r.interest, 0), sim.periods.reduce((s, p) => s + p.interest, 0), 0.05, 'Σ年息=Σ期息');
  const y2026 = rows.find((r) => r.year === '2026');
  ok(y2026.prepay === 200000, '提前还款计入 2026');
  ok(rows.every((r) => r.year <= r.year)); // 有序
  eq(rows[0].year, '2021');
});
t('familyTotals：排除停用与已结清', () => {
  const loanB = core.normalizeLoan({ ...VALID_LOAN, name: '公积金', principal: 600000, annualRate: 2.85, startDate: '2027-01-01' }, null).loan;
  const stA = core.loanState(LOAN_A, [], NOW);
  const stB = core.loanState(loanB, [], NOW);
  const totals = core.familyTotals([stA, stB]);
  near(totals.monthlyPayment, stA.nextPaymentAmount + stB.nextPaymentAmount, 0.01, '两笔都在还');
  const stAOff = { ...stA, active: false };
  const t2 = core.familyTotals([stAOff, stB]);
  eq(t2.monthlyPayment, stB.nextPaymentAmount, '停用不计入');
  const stBSettled = { ...stB, settled: true, nextPaymentAmount: null };
  const t3 = core.familyTotals([stAOff, stBSettled]);
  eq(t3.monthlyPayment, 0);
  eq(t3.settledCount, 1);
});
t('describeLoan 包含关键事实', () => {
  const d = core.describeLoan(LOAN_A);
  ok(d.includes('商贷') && d.includes('等额本息') && d.includes('3.6%') && d.includes('2021-03-01'), d);
  const loanRp = core.normalizeLoan({ ...VALID_LOAN, repricing: { day: '01-01', cycleMonths: 12 } }, null).loan;
  ok(core.describeLoan(loanRp).includes('01-01'));
  ok(core.describeLoan({ ...LOAN_A, active: false }).includes('已结清/停用'));
});

// ── 汇总 ─────────────────────────────────────────────────────────────────────
const bad = results.filter((r) => !r.pass);
console.log(results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : `\n    ${r.detail}`}`).join('\n'));
console.log(`\n${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
