#!/usr/bin/env node
'use strict';
/**
 * 装修台账离线单测：node test/run-tests.mjs（零依赖零 mock，纯函数行为级）
 * 覆盖：日期/金额工具、项目/科目/供应商/节点/支出规范化边界、科目按名解析
 * （精确/包含/歧义/缺失）、预算对比红黄绿灰全档位（含 90% 边界与总预算覆盖）、
 * 增项口径、常见漏项检查、节点红黄榜、对账小结结构。
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

// 固定「现在」：2026-11-01 本地 10:30
const NOW = new Date(2026, 10, 1, 10, 30).getTime();
const TODAY = '2026-11-01';

// ── 日期/金额工具 ─────────────────────────────────────────────────────────────
t('dayKey/parseDayKey 往返一致', () => {
  eq(core.parseDayKey(core.dayKey(NOW)), new Date(2026, 10, 1).getTime());
});
t('parseDayKey 拒绝 2 月 30 日与垃圾', () => {
  eq(core.parseDayKey('2026-02-30'), null);
  eq(core.parseDayKey('明天'), null);
  eq(core.parseDayKey(''), null);
});
t('parseTimeHM 边界（缺省 12:00 / 24 点拒绝）', () => {
  eq(core.parseTimeHM(undefined), 720);
  eq(core.parseTimeHM('8:05'), 485);
  eq(core.parseTimeHM('24:00'), null);
  eq(core.parseTimeHM('9:60'), null);
});
t('dayMinTs = 本地零点+分钟', () => {
  eq(core.dayMinTs(TODAY, 480), new Date(2026, 10, 1, 8, 0).getTime());
  eq(core.dayMinTs('2026-02-30', 0), null);
});
t('fmtMoney 千分位与两位小数', () => {
  eq(core.fmtMoney(1234567.5), '1,234,567.5');
  eq(core.fmtMoney(1234567.89), '1,234,567.89');
  eq(core.fmtMoney(0), '0');
  eq(core.fmtMoney(300000), '300,000');
});
t('round2 消浮点尾差', () => {
  eq(core.round2(3200.145), 3200.15);
  eq(core.round2(0.1 + 0.2), 0.3);
});

// ── 项目规范化 ────────────────────────────────────────────────────────────────
t('normalizeProject：名称必填/总预算边界/状态枚举', () => {
  eq(core.normalizeProject({ name: '' }, null).error, '项目名称不能为空');
  eq(core.normalizeProject({ name: 'X', totalBudget: -1 }, null).error, '总预算需在 0-1,000,000,000 元之间');
  eq(core.normalizeProject({ name: 'X', status: 'xx' }, null).project.status, 'active');
  ok(core.normalizeProject({ name: '世纪花园', totalBudget: 300000, startDate: TODAY }, null).project);
  eq(core.normalizeProject({ name: 'X', startDate: '明天' }, null).error, '开始日期 "明天" 无法识别（需 YYYY-MM-DD）');
});
t('normalizeProject：更新保留 id/createdAt，totalBudget 传 null 清除', () => {
  const base = core.normalizeProject({ name: 'A', totalBudget: 100 }, null).project;
  const r = core.normalizeProject({ name: 'B' }, base).project;
  eq(r.id, base.id);
  ok(r.createdAt === base.createdAt && r.updatedAt >= base.updatedAt);
  eq(core.normalizeProject({ totalBudget: null }, base).project.totalBudget, undefined);
});

// ── 科目规范化与解析 ──────────────────────────────────────────────────────────
t('normalizeCategory：名称/分组/预算边界', () => {
  eq(core.normalizeCategory({ name: '' }, null).error, '科目名称不能为空');
  eq(core.normalizeCategory({ name: 'X', group: '不存在的组' }, null).error, '科目分组须为 前期/拆改/水电/泥瓦/木工/油漆/主材/家具家电/软装/其他 之一');
  eq(core.normalizeCategory({ name: 'X', budget: -5 }, null).error, '科目预算需在 0-1,000,000,000 元之间');
  ok(core.normalizeCategory({ name: '瓷砖', group: '泥瓦', budget: 8000 }, null).cat);
});
t('normalizeCategory：普通科目不能改为增项（增项只能新建）', () => {
  const base = core.normalizeCategory({ name: '瓷砖', group: '泥瓦' }, null).cat;
  eq(core.normalizeCategory({ isExtra: true }, base).error, '普通科目不能改为增项科目（增项科目只能新建）');
  ok(core.normalizeCategory({ name: '窗套加固', isExtra: true }, null).cat.isExtra === true);
});
t('resolveCatName：精确→包含→歧义→缺失', () => {
  const cats = [
    core.normalizeCategory({ name: '瓷砖', group: '泥瓦' }, null).cat,
    core.normalizeCategory({ name: '墙砖瓷砖', group: '泥瓦' }, null).cat,
    core.normalizeCategory({ name: '水电改造', group: '水电' }, null).cat,
  ];
  ok(core.resolveCatName('瓷砖', cats).cat.id === cats[0].id);          // 精确优先
  ok(core.resolveCatName('水电', cats).cat.id === cats[2].id);          // 唯一包含
  ok(core.resolveCatName('砖', cats).error.includes('多个候选'));        // 歧义拒绝
  ok(core.resolveCatName('美缝', cats).error.includes('没有') && core.resolveCatName('美缝', cats).error.includes('asExtra'));
  ok(core.resolveCatName('', cats).error.includes('需提供'));
});

// ── 供应商 / 节点 ─────────────────────────────────────────────────────────────
t('normalizeVendor：名称必填/合同额边界/更新保留 id', () => {
  eq(core.normalizeVendor({ name: '' }, null).error, '供应商名称不能为空');
  eq(core.normalizeVendor({ name: '张师傅', contractAmount: -1 }, null).error, '合同额需在 0-1,000,000,000 元之间');
  const v = core.normalizeVendor({ name: '张师傅', role: '瓦工' }, null).vendor;
  const v2 = core.normalizeVendor({ phone: '13800000000' }, v).vendor;
  eq(v2.id, v.id);
  eq(v2.role, '瓦工');
  eq(v2.phone, '13800000000');
});
t('normalizeMilestone：日期必填合法；milestoneLevel 红黄绿', () => {
  eq(core.normalizeMilestone({ title: '水电验收' }, null).error.includes('无法识别'), true);
  const m = core.normalizeMilestone({ title: '水电验收', date: '2026-10-30' }, null).mile;
  eq(core.milestoneLevel(m, NOW).level, 'red');                        // 已过期
  const m2 = core.normalizeMilestone({ title: '泥瓦验收', date: '2026-11-03' }, null).mile;
  eq(core.milestoneLevel(m2, NOW).level, 'yellow');                    // 3 天内
  const m3 = core.normalizeMilestone({ title: '竣工验收', date: '2026-12-20' }, null).mile;
  eq(core.milestoneLevel(m3, NOW).level, 'green');
  const m4 = core.normalizeMilestone({ title: '油工进场', date: '2026-10-01', done: true }, null).mile;
  eq(core.milestoneLevel(m4, NOW).level, 'green');                     // 完成=绿
});

// ── 支出规范化 ────────────────────────────────────────────────────────────────
t('normalizeExpense：金额边界（0/负/上限）与 catId 必填', () => {
  eq(core.normalizeExpense({ catId: 'c1', amount: 0 }, null).error, '金额需在 0 与 1,000,000,000 元之间（不含 0）');
  eq(core.normalizeExpense({ catId: 'c1', amount: -100 }, null).error, '金额需在 0 与 1,000,000,000 元之间（不含 0）');
  ok(core.normalizeExpense({ catId: 'c1', amount: 1e9 }, null).expense);
  eq(core.normalizeExpense({ amount: 100 }, null).error, '支出必须归属一个科目（catId）');
});
t('normalizeExpense：幂等 id 契约（传入即用/非法 id 回退）', () => {
  const e = core.normalizeExpense({ catId: 'c1', amount: 100, id: 'my-fixed-id-1' }, null).expense;
  eq(e.id, 'my-fixed-id-1');
  const e2 = core.normalizeExpense({ catId: 'c1', amount: 100, id: '带 空格中文!' }, null).expense;
  ok(/^e-/.test(e2.id), '非法 id 回退自动生成');
  const upd = core.normalizeExpense({ amount: 200 }, e).expense;
  eq(upd.id, 'my-fixed-id-1', '更新保留原 id');
});
t('normalizeExpense：date+time → 本地 ts；缺省当前时间；更新保留原时间', () => {
  const e = core.normalizeExpense({ catId: 'c1', amount: 3200, date: TODAY, time: '09:30' }, null).expense;
  eq(e.ts, new Date(2026, 10, 1, 9, 30).getTime());
  const e2 = core.normalizeExpense({ catId: 'c1', amount: 100 }, null).expense;
  eq(e2.ts, new Date(2026, 10, 1, 12, 0).getTime(), '缺省时间=当天 12:00（避免零点歧义）');
  const e3 = core.normalizeExpense({ amount: 150 }, { ...e, ts: new Date(2026, 9, 20, 8, 0).getTime() }).expense;
  eq(e3.ts, new Date(2026, 9, 20, 8, 0).getTime(), '更新不传日期保留原 ts');
});
t('normalizeExpense：更新可迁移日期；note/payMethod 裁剪', () => {
  const base = core.normalizeExpense({ catId: 'c1', amount: 3200, date: TODAY, note: 'x'.repeat(300) }, null).expense;
  eq(base.note.length, 200);
  const moved = core.normalizeExpense({ date: '2026-10-15', time: '08:00' }, base).expense;
  eq(moved.ts, new Date(2026, 9, 15, 8, 0).getTime());
  eq(core.normalizeExpense({ date: '垃圾' }, base).error.includes('无法识别'), true);
});

// ── 预算对比（唯一口径）───────────────────────────────────────────────────────
function mkCat(name, budget, isExtra) {
  return core.normalizeCategory({ name, group: '泥瓦', budget, isExtra: !!isExtra }, null).cat;
}
function mkExp(catId, amount) {
  return core.normalizeExpense({ catId, amount, date: TODAY }, null).expense;
}
t('budgetCompare：红（超支）/黄（≥90%）/绿/灰（未定）四档', () => {
  const c0 = mkCat('未定预算');      // gray
  const c1 = mkCat('绿的', 1000);
  const c2 = mkCat('黄线', 1000);
  const c3 = mkCat('超支', 500);
  const cats = [c0, c1, c2, c3];
  const exps = [mkExp(c0.id, 100), mkExp(c1.id, 899), mkExp(c2.id, 900), mkExp(c3.id, 501)];
  const r = core.budgetCompare(cats, exps, undefined);
  const byName = new Map(r.rows.map((x) => [x.cat.name, x]));
  eq(byName.get('未定预算').level, 'gray');
  eq(byName.get('绿的').level, 'green');   // 89.9%
  eq(byName.get('黄线').level, 'yellow');  // 恰 90%
  eq(byName.get('超支').level, 'red');     // 501 > 500
});
t('budgetCompare：总预算覆盖科目合计；总额红黄；增项只算 isExtra 科目', () => {
  const c1 = mkCat('瓷砖', 8000);
  const cx = mkCat('窗套加固', undefined, true);
  const exps = [mkExp(c1.id, 3200), mkExp(cx.id, 800), mkExp(cx.id, 200)];
  // 科目合计 8000 < 总预算 300000 → 以总预算为准：3200+1000=4200 → 1.4% 绿
  let r = core.budgetCompare([c1, cx], exps, 300000);
  eq(r.totals.budgetTotal, 300000);
  eq(r.totals.catBudgetTotal, 8000);
  eq(r.totals.spentTotal, 4200);
  eq(r.totals.level, 'green');
  eq(r.extraSpent, 1000);
  eq(r.extraCount, 2);
  // 无总预算 → 科目合计 8000：4200/8000=53% 绿
  r = core.budgetCompare([c1, cx], exps, undefined);
  eq(r.totals.budgetTotal, 8000);
  eq(r.totals.pct, 53);
  // 总额临超：总预算 4400 → 4200/4400=95% 黄
  r = core.budgetCompare([c1, cx], exps, 4400);
  eq(r.totals.level, 'yellow');
  // 总额超支
  r = core.budgetCompare([c1, cx], exps, 4100);
  eq(r.totals.level, 'red');
});
t('budgetCompare：零预算科目有支出=红', () => {
  const c = mkCat('其他杂项', 0);
  const r = core.budgetCompare([c], [mkExp(c.id, 50)]);
  eq(r.rows[0].level, 'red');
});

// ── 漏项检查 ─────────────────────────────────────────────────────────────────
t('missingCheck：标准模板采用后归零；裸表列出全部', () => {
  eq(core.missingCheck(core.TEMPLATE.map((x) => core.normalizeCategory({ name: x.name, group: x.group }, null).cat)).length, 0);
  eq(core.missingCheck([]).length, core.COMMON_MISS.length);
  eq(core.missingCheck([mkCat('防水')]).length, core.COMMON_MISS.length - 1);
});

// ── 对账小结 ─────────────────────────────────────────────────────────────────
t('buildSummary：结构完整（总览/分科目表/超支榜/漏项/供应商/节点）', () => {
  const p = core.normalizeProject({ name: '世纪花园', totalBudget: 300000 }, null).project;
  const c1 = mkCat('瓷砖', 8000);
  const c2 = mkCat('水电改造', 500);
  const cx = mkCat('窗套加固', undefined, true);
  const exps = [mkExp(c1.id, 8200), mkExp(c2.id, 300), mkExp(cx.id, 800)];
  const v = core.normalizeVendor({ name: '张师傅', role: '瓦工', phone: '13800000000' }, null).vendor;
  const m = core.normalizeMilestone({ title: '泥瓦验收', date: '2026-11-03' }, null).mile;
  const s = core.buildSummary({ project: p, cats: [c1, c2, cx], expenses: exps, vendors: [v], milestones: [m] }, NOW);
  ok(s.includes('装修对账小结'), '标题');
  ok(s.includes('世纪花园'), '项目名');
  ok(s.includes('已超支') === false, '总额未超支不标');
  ok(s.includes('**超支**'), '瓷砖科目超支标记');
  ok(s.includes('8,200'), '金额千分位');
  ok(s.includes('增项合计：**800 元**'), '增项合计');
  ok(s.includes('垃圾清运'), '漏项提醒');
  ok(s.includes('张师傅') && s.includes('13800000000'), '供应商付款');
  ok(s.includes('还剩 2 天'), '节点黄');
  ok(s.includes('不构成造价/法律建议'), '免责');
});
t('buildSummary：空数据也有标题与免责；超支榜列出超支科目', () => {
  const p = core.normalizeProject({ name: 'X' }, null).project;
  const s0 = core.buildSummary({ project: p, cats: [], expenses: [], vendors: [], milestones: [] }, NOW);
  ok(s0.includes('未设定') && s0.includes('不构成造价/法律建议'));
  const c = mkCat('瓷砖', 100);
  const s1 = core.buildSummary({ project: p, cats: [c], expenses: [mkExp(c.id, 200)], vendors: [], milestones: [] }, NOW);
  ok(s1.includes('## 超支科目') && s1.includes('超 100 元'));
});

console.log('');
const fails = results.filter((x) => !x.pass);
for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`);
console.log(`\n${results.length - fails.length}/${results.length} 通过`);
if (fails.length) process.exit(1);
console.log('✅ 离线单测通过（core 纯函数行为级）');
process.exit(0);
