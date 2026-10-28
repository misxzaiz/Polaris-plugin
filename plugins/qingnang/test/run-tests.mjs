#!/usr/bin/env node
'use strict';
/**
 * 青囊离线单测：node test/run-tests.mjs（零依赖零 mock，纯函数行为级）
 * 覆盖：日期/时刻工具、四实体+日志规范化边界、频次五型展开（跨月/周期/间隔/
 * 每周几）、todayPlan 状态机（grace/overdue）、FEFO 库存派生（跨批次归因/过期剔除/
 * 超吃钳制/盘点修正）、补货预测两口径回落、效期分带、依从率（未来不计漏）、
 * occKey 幂等与撤销。日期助手 U/L 的月份一律 1 起。
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

// 固定「现在」：2026-10-29（周四）本地 10:30
const NOW = new Date(2026, 9, 29, 10, 30).getTime();
const TODAY = '2026-10-29';
const DAY = core.DAY_MS;

// ── 日期/时刻工具 ─────────────────────────────────────────────────────────────
t('dayKey/parseDayKey 往返一致', () => {
  eq(core.parseDayKey(core.dayKey(NOW)), new Date(2026, 9, 29).getTime());
});
t('parseDayKey 拒绝 2 月 30 日与垃圾', () => {
  eq(core.parseDayKey('2026-02-30'), null);
  eq(core.parseDayKey('明天'), null);
  eq(core.parseDayKey(''), null);
});
t('timeToMin 边界', () => {
  eq(core.timeToMin('08:00'), 480);
  eq(core.timeToMin('23:59'), 1439);
  eq(core.timeToMin('24:00'), -1);
  eq(core.timeToMin('8:0'), -1);
});
t('dayDiff 自然日差', () => {
  eq(core.dayDiff('2026-11-01', '2026-10-29'), 3);
  eq(core.dayDiff('2026-10-29', '2026-11-01'), -3);
  eq(core.dayDiff('2027-01-01', '2026-12-31'), 1);
});
t('dayMinTs = 本机零点+分钟', () => {
  eq(core.dayMinTs('2026-10-29', 480), new Date(2026, 9, 29, 8, 0).getTime());
  eq(core.dayMinTs('2026-02-30', 0), null);
});

// ── 规范化 ───────────────────────────────────────────────────────────────────
t('normalizeProfile：名称必填/kind 白名单', () => {
  ok(core.normalizeProfile({ name: '妈妈' }).profile);
  eq(core.normalizeProfile({ name: '' }).error, '成员名称不能为空');
  eq(core.normalizeProfile({ name: '旺财', kind: 'dog' }).profile.kind, 'human');
  eq(core.normalizeProfile({ name: '旺财', kind: 'pet' }).profile.kind, 'pet');
});
t('normalizeProfile：部分更新保留旧值', () => {
  const p = core.normalizeProfile({ name: '妈妈', note: '高血压' }).profile;
  const p2 = core.normalizeProfile({ note: '高血压二级' }, p).profile;
  eq(p2.name, '妈妈');
  eq(p2.note, '高血压二级');
  eq(p2.rev, 2);
});
t('normalizeMed：默认单位片/form 白名单回落 other', () => {
  const m = core.normalizeMed({ name: '氨氯地平', spec: '5mg×24片' }).med;
  eq(m.unit, '片');
  eq(m.form, 'tablet');
  eq(core.normalizeMed({ name: 'X', form: 'spaceship' }).med.form, 'other');
});
t('normalizeBatch：qty 钳制/效期校验/挂靠必填', () => {
  eq(core.normalizeBatch({ qty: 20 }).error, '批次必须挂在一支药品下');
  ok(core.normalizeBatch({ medId: 'm1', qty: 20, expiry: '2027-06-01' }).batch);
  eq(core.normalizeBatch({ medId: 'm1', qty: 20, expiry: '2027-13-01' }).error, '效期不合法：2027-13-01（需 YYYY-MM-DD）');
  const b = core.normalizeBatch({ medId: 'm1', qty: -5 }).batch;
  eq(b.qty, 0);
  const b2 = core.normalizeBatch({ qty: 15.678 }, core.normalizeBatch({ medId: 'm1', qty: 20, expiry: '2027-06-01' }).batch).batch;
  eq(b2.qty, 15.67); // floor 不超计（库存宁可少记不可多记）
});
t('normalizeRegimen：times 去重排序/非 prn 需时刻', () => {
  const r = core.normalizeRegimen({ profileId: 'p1', medId: 'm1', dose: 1, times: ['20:00', '8:00', '08:00'], freq: { type: 'daily' } }).regimen;
  eq(r.times, ['08:00', '20:00']);
  ok(core.normalizeRegimen({ profileId: 'p1', medId: 'm1', dose: 1, times: [], freq: { type: 'prn' } }).regimen);
  ok(core.normalizeRegimen({ profileId: 'p1', medId: 'm1', dose: 1, times: [], freq: { type: 'daily' } }).error.includes('至少一个服药时刻'));
  eq(core.normalizeRegimen({ profileId: 'p1', medId: 'm1', dose: 0, times: ['08:00'], freq: { type: 'daily' } }).error, 'dose 需为正数（每次剂量）');
});
t('normalizeRegimen：freq 五型校验', () => {
  ok(core.normalizeRegimen({ profileId: 'p', medId: 'm', dose: 1, times: ['08:00'], freq: { type: 'weekly', weekdays: [1, 3] } }).regimen);
  ok(core.normalizeRegimen({ profileId: 'p', medId: 'm', dose: 1, times: ['08:00'], freq: { type: 'weekly', weekdays: [] } }).error.includes('weekdays'));
  ok(core.normalizeRegimen({ profileId: 'p', medId: 'm', dose: 1, times: ['08:00'], freq: { type: 'interval', intervalDays: 30 } }).regimen);
  eq(core.normalizeRegimen({ profileId: 'p', medId: 'm', dose: 1, times: ['08:00'], freq: { type: 'interval', intervalDays: 1 } }).error.includes('2-365'), true);
  ok(core.normalizeRegimen({ profileId: 'p', medId: 'm', dose: 1, times: ['08:00'], freq: { type: 'cycle', onDays: 21, offDays: 7 } }).regimen);
  eq(core.normalizeRegimen({ profileId: 'p', medId: 'm', dose: 1, times: ['08:00'], freq: { type: 'qiming' } }).error.includes('频次类型'), true);
});
t('normalizeRegimen：endDate 不得早于 startDate；部分更新保窗口', () => {
  ok(core.normalizeRegimen({ profileId: 'p', medId: 'm', dose: 1, times: ['08:00'], freq: { type: 'daily' }, startDate: '2026-10-01', endDate: '2026-09-30' }).error.includes('endDate'), true);
  const r = core.normalizeRegimen({ profileId: 'p', medId: 'm', dose: 1, times: ['08:00'], freq: { type: 'daily' }, startDate: '2026-10-01', endDate: '2026-10-31' }).regimen;
  const r2 = core.normalizeRegimen({ dose: 2 }, r).regimen;
  eq(r2.startDate, '2026-10-01');
  eq(r2.endDate, '2026-10-31');
  eq(r2.dose, 2);
});

// ── 日志规范化与 occKey ──────────────────────────────────────────────────────
t('doseOccKey/parseOccKey 往返；幂等键', () => {
  const k = core.doseOccKey('r1', '2026-10-29', '08:00');
  eq(k, 'r1|2026-10-29|08:00');
  eq(core.parseOccKey(k), { regId: 'r1', date: '2026-10-29', time: '08:00' });
  eq(core.parseOccKey('r1|bad'), null);
  eq(core.parseOccKey('r1|2026-02-30|08:00'), null);
});
t('normalizeLog：taken/skip/none；方案窗口与时刻校验', () => {
  const reg = core.normalizeRegimen({ profileId: 'p', medId: 'm', dose: 1, times: ['08:00', '20:00'], freq: { type: 'daily' }, startDate: '2026-10-01' }).regimen;
  ok(core.normalizeLog({ occKey: core.doseOccKey(reg.id, '2026-10-29', '08:00'), status: 'taken' }, reg, NOW).log);
  ok(core.normalizeLog({ regId: reg.id, date: '2026-10-29', time: '08:00', status: 'taken' }, reg, NOW).log);
  ok(core.normalizeLog({ regId: reg.id, date: '2026-10-29', time: '12:00', status: 'taken' }, reg, NOW).error.includes('排期'), true);
  ok(core.normalizeLog({ regId: reg.id, date: '2026-09-30', time: '08:00', status: 'taken' }, reg, NOW).error.includes('早于方案开始'), true);
  eq(core.normalizeLog({ regId: reg.id, date: '2026-10-29', time: '08:00', status: 'none' }, reg, NOW).del, core.doseOccKey(reg.id, '2026-10-29', '08:00'));
  ok(core.normalizeLog({ regId: reg.id, date: '2026-10-29', time: '08:00', status: 'eat' }, reg, NOW).error.includes('status'), true);
});
t('normalizeLog：prn 方案可记任意时刻；amount 可选', () => {
  const reg = core.normalizeRegimen({ profileId: 'p', medId: 'm', dose: 2, times: [], freq: { type: 'prn' } }).regimen;
  const r = core.normalizeLog({ regId: reg.id, date: '2026-10-29', time: '15:37', status: 'taken' }, reg, NOW);
  ok(r.log);
  eq(r.log.amount, undefined);
  const r2 = core.normalizeLog({ regId: reg.id, date: '2026-10-29', time: '15:37', status: 'taken', amount: 1.5 }, reg, NOW);
  eq(r2.log.amount, 1.5);
});

// ── 频次展开 ─────────────────────────────────────────────────────────────────
function reg(freq, extra) {
  return core.normalizeRegimen({ profileId: 'p', medId: 'm', dose: 1, times: ['08:00'], freq, startDate: '2026-10-01', ...extra }).regimen;
}
t('daily：每天发生', () => {
  const r = reg({ type: 'daily' });
  eq(core.regimenDueOnDate(r, '2026-10-29'), true);
  eq(core.regimenDueOnDate(r, '2027-01-01'), true);
  eq(core.regimenDueOnDate(r, '2026-09-30'), false);
});
t('weekly：按周几', () => {
  const r = reg({ type: 'weekly', weekdays: [4] }); // 周四
  eq(core.regimenDueOnDate(r, '2026-10-29'), true);  // 2026-10-29 是周四
  eq(core.regimenDueOnDate(r, '2026-10-30'), false);
});
t('interval：每 N 天，锚定 startDate', () => {
  const r = reg({ type: 'interval', intervalDays: 7 }); // 10-01、10-08、10-15、10-22、10-29
  eq(core.regimenDueOnDate(r, '2026-10-29'), true);
  eq(core.regimenDueOnDate(r, '2026-10-28'), false);
  eq(core.regimenDueOnDate(r, '2026-11-05'), true);
});
t('cycle：吃 N 停 M，锚定 startDate', () => {
  const r = reg({ type: 'cycle', onDays: 7, offDays: 7 }); // 10-01~07 吃，08~14 停，15~21 吃…
  eq(core.regimenDueOnDate(r, '2026-10-07'), true);
  eq(core.regimenDueOnDate(r, '2026-10-08'), false);
  eq(core.regimenDueOnDate(r, '2026-10-15'), true);
  eq(core.regimenDueOnDate(r, '2026-10-21'), true);
  eq(core.regimenDueOnDate(r, '2026-10-22'), false);
});
t('窗口与停用：endDate 后不发生；active=false 不发生', () => {
  const r = reg({ type: 'daily' }, { endDate: '2026-10-31' });
  eq(core.regimenDueOnDate(r, '2026-10-31'), true);
  eq(core.regimenDueOnDate(r, '2026-11-01'), false);
  const stopped = reg({ type: 'daily' }, { active: false });
  eq(core.regimenDueOnDate(stopped, TODAY), false);
});
t('occurrencesForDate：多方案升序且带 occKey', () => {
  const a = core.normalizeRegimen({ profileId: 'p', medId: 'm', dose: 1, times: ['20:00'], freq: { type: 'daily' }, startDate: '2026-10-01' }).regimen;
  const b = core.normalizeRegimen({ profileId: 'p', medId: 'm2', dose: 2, times: ['08:00', '20:00'], freq: { type: 'daily' }, startDate: '2026-10-01' }).regimen;
  const occs = core.occurrencesForDate([a, b], TODAY);
  eq(occs.map((o) => `${o.time}@${o.reg.medId}`), ['08:00@m2', '20:00@m', '20:00@m2']);
  eq(occs[0].amount, 2);
  eq(occs[0].occKey, core.doseOccKey(b.id, TODAY, '08:00'));
});

// ── todayPlan 状态机 ─────────────────────────────────────────────────────────
function mkCtx(over) {
  const profiles = [core.normalizeProfile({ id: 'p1', name: '我' }).profile, core.normalizeProfile({ id: 'p2', name: '妈妈', kind: 'human' }).profile];
  const meds = [core.normalizeMed({ id: 'm1', name: '氨氯地平', unit: '片' }).med, core.normalizeMed({ id: 'm2', name: '布洛芬', unit: '粒' }).med];
  const regimens = [
    core.normalizeRegimen({ id: 'r1', profileId: 'p1', medId: 'm2', dose: 1, times: ['08:00', '20:00'], freq: { type: 'daily' }, startDate: '2026-10-01' }).regimen,
    core.normalizeRegimen({ id: 'r2', profileId: 'p2', medId: 'm1', dose: 1, times: ['08:00'], freq: { type: 'daily' }, startDate: '2026-10-01' }).regimen,
  ];
  return { profiles, meds, regimens, logs: [], settings: null, ...over };
}
t('todayPlan：未到点 upcoming / grace 内 now / 过 grace overdue', () => {
  // NOW=10:30：08:00 已过 2.5h（grace 默认 60min → overdue），20:00 未到
  const plan = core.todayPlan(mkCtx(), TODAY, NOW);
  eq(plan.length, 2);
  const me = plan.find((g) => g.profile.id === 'p1');
  eq(me.items[0].state, 'overdue');
  eq(me.items[1].state, 'upcoming');
  eq(me.counts.overdue, 1);
  // grace 240min：08:00+4h=12:00 > 10:30 → now
  const plan2 = core.todayPlan(mkCtx({ settings: { graceMin: 240 } }), TODAY, NOW);
  eq(plan2.find((g) => g.profile.id === 'p1').items[0].state, 'now');
});
t('todayPlan：打卡后 done/skip；同 occKey 后见覆盖（与 kv 同键覆盖语义一致）', () => {
  const k1 = core.doseOccKey('r1', TODAY, '08:00');
  const k2 = core.doseOccKey('r2', TODAY, '08:00');
  const logs = [
    { occKey: k1, regId: 'r1', date: TODAY, time: '08:00', status: 'taken', at: NOW - 3600000 },
    { occKey: k2, regId: 'r2', date: TODAY, time: '08:00', status: 'skip', at: NOW - 3600000 },
  ];
  const plan = core.todayPlan(mkCtx({ logs }), TODAY, NOW);
  eq(plan.find((g) => g.profile.id === 'p1').items[0].state, 'done');
  eq(plan.find((g) => g.profile.id === 'p2').items[0].state, 'skip');
});
t('todayPlan：方案挂在已删档案下不炸', () => {
  const ctx = mkCtx();
  ctx.profiles = ctx.profiles.slice(0, 1); // 删掉 p2
  const plan = core.todayPlan(ctx, TODAY, NOW);
  eq(plan.length, 1);
});
t('dosesProjection：只含 now+overdue 未打卡项', () => {
  const proj = core.dosesProjection(mkCtx(), TODAY, NOW);
  eq(proj.items.map((i) => `${i.profileName}:${i.medName}:${i.state}`), ['妈妈:氨氯地平:overdue', '我:布洛芬:overdue']);
  const proj2 = core.dosesProjection(mkCtx({ settings: { graceMin: 240 } }), TODAY, NOW);
  eq(proj2.items.length, 2);
});

// ── FEFO 库存派生 ────────────────────────────────────────────────────────────
function batch(medId, qty, expiry, createdAt) {
  return core.normalizeBatch({ medId, qty, expiry, createdAt }).batch;
}
t('stockForMed：FEFO 先到期先用，跨批次归因', () => {
  const b1 = batch('m1', 10, '2027-01-01', 1000); // 先到期
  const b2 = batch('m1', 10, '2027-06-01', 2000);
  const logs = [
    { occKey: 'r|2026-10-28|08:00', regId: 'r1', date: '2026-10-28', time: '08:00', status: 'taken', amount: 12, at: NOW - DAY },
  ];
  const stock = core.stockForMed('m1', [b2, b1], logs, [{ id: 'r1', medId: 'm1', dose: 1 }], TODAY);
  eq(stock.totalUsable, 8);
  const row1 = stock.batches.find((b) => b.id === b1.id);
  const row2 = stock.batches.find((b) => b.id === b2.id);
  eq(row1.remaining, 0);   // 先到期批次先扣完
  eq(row2.remaining, 8);
  eq(stock.over, false);
});
t('stockForMed：过期批次不参与可用量与消耗，单列待清理', () => {
  const b1 = batch('m1', 5, '2026-10-01', 1000); // 已过期
  const b2 = batch('m1', 10, '2027-06-01', 2000);
  const stock = core.stockForMed('m1', [b1, b2], [], [], TODAY);
  eq(stock.totalUsable, 10);
  eq(stock.totalExpired, 5);
  eq(stock.batches.find((b) => b.id === b1.id).expired, true);
});
t('stockForMed：效期当日仍可用，次日转过期红', () => {
  const b = batch('m1', 5, TODAY, 1000); // 今天到期
  eq(core.stockForMed('m1', [b], [], [], TODAY).totalUsable, 5);
  eq(core.stockForMed('m1', [b], [], [], '2026-10-30').totalUsable, 0);
  eq(core.stockForMed('m1', [b], [], [], '2026-10-30').totalExpired, 5);
});
t('stockForMed：超吃不透支，over 标记', () => {
  const b1 = batch('m1', 3, '2027-01-01', 1000);
  const logs = [{ occKey: 'r|2026-10-28|08:00', regId: 'r1', date: '2026-10-28', time: '08:00', status: 'taken', amount: 5, at: NOW - DAY }];
  const stock = core.stockForMed('m1', [b1], logs, [{ id: 'r1', medId: 'm1', dose: 1 }], TODAY);
  eq(stock.totalUsable, 0);
  eq(stock.over, true);
});
t('stockForMed：amount 缺省回落方案 dose；按 at 时序而非键序消耗', () => {
  const b = batch('m1', 5, '2027-01-01', 1000);
  const r1 = { id: 'r1', medId: 'm1', dose: 2 };
  // 第二条实际动作更早（at 更小），两条共 4
  const logs = [
    { occKey: 'r1|2026-10-27|08:00', regId: 'r1', date: '2026-10-27', time: '08:00', status: 'taken', at: NOW - 2 * DAY },
    { occKey: 'r1|2026-10-28|08:00', regId: 'r1', date: '2026-10-28', time: '08:00', status: 'taken', at: NOW - DAY },
  ];
  eq(core.stockForMed('m1', [b], logs, [r1], TODAY).totalUsable, 1);
});
t('stockForMed：同 occKey 重复传入只消耗一次（后见覆盖去重）', () => {
  const b = batch('m1', 10, '2027-01-01', 1000);
  const log = { occKey: 'r1|2026-10-28|08:00', regId: 'r1', date: '2026-10-28', time: '08:00', status: 'taken', amount: 3, at: NOW - DAY };
  const stock = core.stockForMed('m1', [b], [log, { ...log, at: log.at + 1 }], [{ id: 'r1', medId: 'm1', dose: 1 }], TODAY);
  eq(stock.totalUsable, 7);
});
t('stockForMed：skip 不消耗；他药不串账', () => {
  const b1 = batch('m1', 5, '2027-01-01', 1000);
  const b2 = batch('m2', 5, '2027-01-01', 1000);
  const logs = [
    { occKey: 'r1|2026-10-28|08:00', regId: 'r1', date: '2026-10-28', time: '08:00', status: 'skip', at: NOW - DAY },
    { occKey: 'r2|2026-10-28|08:00', regId: 'r2', date: '2026-10-28', time: '08:00', status: 'taken', amount: 2, at: NOW - DAY },
  ];
  const s1 = core.stockForMed('m1', [b1], logs, [{ id: 'r1', medId: 'm1', dose: 1 }, { id: 'r2', medId: 'm2', dose: 1 }], TODAY);
  const s2 = core.stockForMed('m2', [b2], logs, [{ id: 'r1', medId: 'm1', dose: 1 }, { id: 'r2', medId: 'm2', dose: 1 }], TODAY);
  eq(s1.totalUsable, 5);
  eq(s2.totalUsable, 3);
});

// ── 补货预测 ─────────────────────────────────────────────────────────────────
t('refillForecast：实际打卡速率优先；无记录回落方案排量并标 estimated', () => {
  const b = batch('m1', 20, '2027-06-01', 1000);
  const r1 = core.normalizeRegimen({ id: 'r1', profileId: 'p1', medId: 'm1', dose: 2, times: ['08:00', '20:00'], freq: { type: 'daily' }, startDate: '2026-09-01' }).regimen;
  const ctx = mkCtx({ batches: [b], regimens: [r1] });
  ctx.meds = [core.normalizeMed({ id: 'm1', name: '氨氯地平', unit: '片' }).med];
  // 无打卡 → 方案排量 4/天 → 20 可用 = 5 天
  const f1 = core.refillForecast(ctx, NOW);
  eq(f1[0].daysLeft, 5);
  eq(f1[0].estimated, true);
  // 近 14 天实际吃了 14 片 → 1/天；同一记录也已按 FEFO 消耗库存（20-14=6 剩余）
  ctx.logs = [{ occKey: 'r1|2026-10-28|08:00', regId: 'r1', date: '2026-10-28', time: '08:00', status: 'taken', amount: 14, at: NOW - DAY }];
  const f2 = core.refillForecast(ctx, NOW);
  eq(f2[0].remaining, 6);
  eq(f2[0].daysLeft, 6);
  eq(f2[0].estimated, false);
});
t('refillForecast：urgency 分带与排序（low 最前）', () => {
  const ctx = mkCtx();
  ctx.meds = [
    core.normalizeMed({ id: 'm1', name: '药A' }).med,
    core.normalizeMed({ id: 'm2', name: '药B' }).med,
    core.normalizeMed({ id: 'm3', name: '药C' }).med,
  ];
  ctx.batches = [batch('m1', 3, '2027-01-01', 1), batch('m2', 30, '2027-01-01', 2), batch('m3', 10, '2027-01-01', 3)];
  ctx.regimens = [
    core.normalizeRegimen({ id: 'r1', profileId: 'p1', medId: 'm1', dose: 1, times: ['08:00'], freq: { type: 'daily' }, startDate: '2026-09-01' }).regimen,
    core.normalizeRegimen({ id: 'r2', profileId: 'p1', medId: 'm2', dose: 1, times: ['08:00'], freq: { type: 'daily' }, startDate: '2026-09-01' }).regimen,
    core.normalizeRegimen({ id: 'r3', profileId: 'p1', medId: 'm3', dose: 1, times: ['08:00'], freq: { type: 'daily' }, startDate: '2026-09-01' }).regimen,
  ];
  const rows = core.refillForecast(ctx, NOW);
  eq(rows.map((r) => r.medId), ['m1', 'm3', 'm2']); // 3天low → 10天watch → 30天ok
  eq(rows[0].urgency, 'low');
});
t('refillForecast：prn 无排量无记录 → daysLeft null urgency none', () => {
  const ctx = mkCtx();
  ctx.meds = [core.normalizeMed({ id: 'm1', name: '退烧药' }).med];
  ctx.batches = [batch('m1', 8, '2027-01-01', 1)];
  ctx.regimens = [core.normalizeRegimen({ id: 'r1', profileId: 'p1', medId: 'm1', dose: 1, times: [], freq: { type: 'prn' } }).regimen];
  const rows = core.refillForecast(ctx, NOW);
  eq(rows[0].daysLeft, null);
  eq(rows[0].urgency, 'none');
});
t('regimenDailyRate：五型均值', () => {
  const mk = (freq) => core.normalizeRegimen({ profileId: 'p', medId: 'm', dose: 2, times: ['08:00', '20:00'], freq, startDate: '2026-01-01' }).regimen;
  eq(core.regimenDailyRate(mk({ type: 'daily' })), 4);
  eq(core.regimenDailyRate(mk({ type: 'weekly', weekdays: [1, 3, 5] })), 12 / 7);
  eq(core.regimenDailyRate(mk({ type: 'interval', intervalDays: 4 })), 1);
  eq(core.regimenDailyRate(mk({ type: 'cycle', onDays: 7, offDays: 7 })), 2);
  eq(core.regimenDailyRate(mk({ type: 'prn' })), 0);
});

// ── 效期分带 ─────────────────────────────────────────────────────────────────
t('expiryBands：expired/soon/ok/unknown 四带排序', () => {
  const batches = [
    batch('m1', 5, '2026-10-01', 1),   // 过期
    batch('m1', 5, '2026-12-01', 2),   // 33 天 → soon（默认 90）
    batch('m2', 5, '2027-10-01', 3),   // ok
    batch('m2', 5, '', 4),             // unknown
  ];
  const meds = [core.normalizeMed({ id: 'm1', name: '药A' }).med, core.normalizeMed({ id: 'm2', name: '药B' }).med];
  const rows = core.expiryBands(batches, meds, NOW);
  eq(rows.map((r) => r.band), ['expired', 'soon', 'ok', 'unknown']);
  eq(rows[1].daysLeft, 33);
});

// ── 依从率 ───────────────────────────────────────────────────────────────────
t('adherence：过去漏服计 missed，今天未到点不进分母', () => {
  const ctx = mkCtx(); // r1(p1) 每天 08:00/20:00，r2(p2) 每天 08:00
  const a = core.adherence(ctx, null, NOW, 2); // 昨天+今天
  eq(a.scheduled, 6);  // 全计划：昨3 + 今3
  eq(a.decided, 5);    // 已判定：昨3 + 今2（今天 20:00 未到点不进分母）
  eq(a.missed, 5);
  eq(a.rate, 0);
});
t('adherence：打卡后 rate 上升', () => {
  const ctx = mkCtx();
  ctx.logs = [{ occKey: core.doseOccKey('r1', '2026-10-28', '08:00'), regId: 'r1', date: '2026-10-28', time: '08:00', status: 'taken', at: NOW - DAY }];
  const a = core.adherence(ctx, null, NOW, 2);
  eq(a.taken, 1);
  eq(a.missed, 4);
  eq(a.rate, 20); // decided = 1 taken + 4 missed
});
t('adherence：按成员过滤', () => {
  const ctx = mkCtx();
  const a = core.adherence(ctx, 'p2', NOW, 2);
  eq(a.scheduled, 2); // p2 只有 r2：昨1+今1（08:00 已过点）
});

// ── 设置与导出 ───────────────────────────────────────────────────────────────
t('normalizeSettings：默认值与钳制', () => {
  const s = core.normalizeSettings(null);
  eq(s, { graceMin: 60, lowDays: 5, expiryWarnDays: 90, soundOn: true });
  eq(core.normalizeSettings({ graceMin: 9999 }).graceMin, 240);
  eq(core.normalizeSettings({ graceMin: 1 }).graceMin, 10);
  eq(core.normalizeSettings({ soundOn: false }).soundOn, false);
});
t('exportAll：剥离 rev、带免责声明', () => {
  const ctx = mkCtx();
  const txt = core.exportAll(ctx);
  const parsed = JSON.parse(txt);
  eq(parsed.kind, 'polaris-qingnang');
  ok(parsed.disclaimer.includes('非医疗建议'));
  ok(!('rev' in parsed.profiles[0]));
});

// ── 汇总 ─────────────────────────────────────────────────────────────────────
const fails = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : `\n   ${r.detail}`}`);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
if (fails.length) process.exit(1);
