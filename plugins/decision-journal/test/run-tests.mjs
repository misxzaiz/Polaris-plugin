/**
 * 谋定 core 逻辑测试（node --test test/run-tests.mjs）
 * 覆盖：id/日期工具、选项与 chosen 解析、预期归一化（方法论强制）、
 *       决策归一化与状态机（合法/非法迁移）、到期判定（含边界）、
 *       总览视图、校准数学（固定样本精确对账：分桶/命中率/Brier/bias）、
 *       经验卡、导出。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/decision-core.js');

const DAY = core.DAY_MS;
const NOW = new Date(2026, 9, 28, 12, 0, 0).getTime();

/** 造一条 decided 决策 */
function mkDecided({ title = '测试决定', conf = 80, text = '三个月内完成', reviewInDays }, now = NOW) {
  const n = core.normalizeDecision(
    { title, options: ['A', 'B'], chosen: 'A', rationale: '理由', expected: { text, confidence: conf } },
    { now },
  );
  if (n.error) throw new Error(n.error);
  if (reviewInDays !== undefined) {
    return { ...n.decision, reviewAt: reviewInDays > 0 ? now + reviewInDays * DAY : null };
  }
  return n.decision;
}

/** 造一条 resolved 决策 */
function mkResolved({ conf, outcome, resolvedAt, title, lesson }, now = NOW) {
  const n = core.normalizeDecision(
    { title, options: ['A'], chosen: 'A', expected: { text: '预期文本', confidence: conf } },
    { now },
  );
  if (n.error) throw new Error(n.error);
  const r = core.resolveDecision(n.decision, { outcome, note: '经过', lesson: lesson || '' }, { now: resolvedAt });
  if (r.error) throw new Error(r.error);
  return r.decision;
}

test('dayKeyOf/monthKeyOf/makeId', () => {
  assert.equal(core.dayKeyOf(new Date(2026, 9, 28, 12, 0).getTime()), '2026-10-28');
  assert.equal(core.monthKeyOf(new Date(2026, 9, 28).getTime()), '2026-10');
  assert.match(core.makeId(NOW), /^d[a-z0-9]+$/);
  assert.notEqual(core.makeId(NOW), core.makeId(NOW));
});

test('normalizeOptions：字符串/对象/>6 报错/空名报错', () => {
  const s = core.normalizeOptions(['甲', '乙']);
  assert.deepEqual(s.options.map((o) => o.name), ['甲', '乙']);
  assert.deepEqual(s.options.map((o) => o.id), ['o1', 'o2']);
  const o = core.normalizeOptions([{ name: 'A', note: 'n1' }]);
  assert.equal(o.options[0].note, 'n1');
  assert.equal(core.normalizeOptions(['a', 'b', 'c', 'd', 'e', 'f', 'g']).error, '选项最多 6 个');
  assert.equal(core.normalizeOptions(['ok', '']).error.includes('名为空'), true);
  assert.deepEqual(core.normalizeOptions(null).options, []);
});

test('resolveChosen：按 id/名/序号/未命中', () => {
  const opts = core.normalizeOptions(['甲', '乙', '丙']).options;
  assert.equal(core.resolveChosen('o2', opts).chosenId, 'o2');
  assert.equal(core.resolveChosen('乙', opts).chosenId, 'o2');
  assert.equal(core.resolveChosen('3', opts).chosenId, 'o3');
  assert.equal(core.resolveChosen('丁', opts).error.includes('不匹配任何选项'), true);
  assert.equal(core.resolveChosen('', opts).chosenId, null);
  assert.equal(core.resolveChosen('甲', []).error.includes('没有选项'), true);
});

test('normalizeExpected：text+confidence 缺一不可、clamp', () => {
  const ok = core.normalizeExpected({ text: '会完成', confidence: '85' });
  assert.equal(ok.expected.confidence, 85);
  assert.equal(core.normalizeExpected({ text: 'x', confidence: 150 }).expected.confidence, 100);
  assert.equal(core.normalizeExpected({ text: 'x', confidence: -3 }).expected.confidence, 0);
  assert.equal(core.normalizeExpected({ text: '', confidence: 80 }).error.includes('text'), true);
  assert.equal(core.normalizeExpected({ text: '只有文本' }).error.includes('confidence'), true);
  assert.equal(core.normalizeExpected(null).expected, null);
});

test('normalizeDecision：decided 全链路（默认 90 天复盘期限）', () => {
  const n = core.normalizeDecision(
    { title: '选迁移方案 B', context: '背景', options: ['方案A', '方案B'], chosen: '方案B',
      rationale: '成本低', expected: { text: '3 个月内完成且零丢失', confidence: 80 }, tags: ['架构', '迁移'] },
    { now: NOW },
  );
  assert.equal(n.error, undefined);
  const d = n.decision;
  assert.equal(d.status, 'decided');
  assert.equal(d.chosenId, 'o2');
  assert.equal(d.expected.confidence, 80);
  assert.equal(d.decidedAt, NOW);
  assert.equal(d.reviewAt, NOW + 90 * DAY, 'decided 缺省按 defaultReviewDays 设复盘期限');
  assert.deepEqual(d.tags, ['架构', '迁移']);
  assert.equal(d.id.startsWith('d'), true);
  assert.equal(d.source, 'ai');
});

test('normalizeDecision：decided 必带可检验预期（方法论接口化）', () => {
  const r = core.normalizeDecision({ title: 'x', options: ['A'], chosen: 'A' }, { now: NOW });
  assert.equal(r.error.includes('可检验的预期'), true);
  const r2 = core.normalizeDecision({ title: 'x', options: ['A'], chosen: 'A', expected: { confidence: 80 } }, { now: NOW });
  assert.equal(r2.error.includes('text'), true);
});

test('normalizeDecision：open（纠结中）与显式 decided 无选项', () => {
  const open = core.normalizeDecision({ title: '要不要换工作', question: '在纠结 A 公司还是 B 公司', options: ['A 公司', 'B 公司'] }, { now: NOW });
  assert.equal(open.decision.status, 'open');
  assert.equal(open.decision.chosenId, null);
  assert.equal(open.decision.expected, null);
  assert.equal(open.decision.reviewAt, null, 'open 不设复盘期限');
  // 无选项直接拍板（如「决定接受 offer」）
  const noOpt = core.normalizeDecision({ title: '接受 offer', status: 'decided', expected: { text: '下月入职', confidence: 90 } }, { now: NOW });
  assert.equal(noOpt.error, undefined);
  assert.equal(noOpt.decision.status, 'decided');
  assert.equal(noOpt.decision.decidedAt, NOW);
  // open 既无 question 又无 options → 报错
  assert.equal(core.normalizeDecision({ title: '空' }, { now: NOW }).error.includes('question'), true);
  // chosen 但没 options → 报错
  assert.equal(core.normalizeDecision({ title: 'x', chosen: 'A' }, { now: NOW }).error.includes('没有选项'), true);
});

test('normalizeDecision：reviewInDays（0=不定期）与显式 reviewAt', () => {
  const d0 = core.normalizeDecision(
    { title: 'x', options: ['A'], chosen: 'A', expected: { text: 'y', confidence: 60 }, reviewInDays: 0 }, { now: NOW });
  assert.equal(d0.decision.reviewAt, null);
  const d30 = core.normalizeDecision(
    { title: 'x', options: ['A'], chosen: 'A', expected: { text: 'y', confidence: 60 }, reviewInDays: 30 }, { now: NOW });
  assert.equal(d30.decision.reviewAt, NOW + 30 * DAY);
  const dAt = core.normalizeDecision(
    { title: 'x', options: ['A'], chosen: 'A', expected: { text: 'y', confidence: 60 }, reviewAt: NOW + 5 }, { now: NOW });
  assert.equal(dAt.decision.reviewAt, NOW + 5);
  assert.equal(core.normalizeDecision(
    { title: 'x', options: ['A'], chosen: 'A', expected: { text: 'y', confidence: 60 }, reviewInDays: -1 }, { now: NOW }).error,
    'reviewInDays 应为非负数字（0 = 不定期）');
});

test('settleDecision：open→decided；重复定案/缺预期报错；reviewInDays 透传', () => {
  const open = core.normalizeDecision({ title: '纠结', question: '选哪个', options: ['甲', '乙'] }, { now: NOW }).decision;
  const s = core.settleDecision(open, { chosen: '乙', expected: { text: '两周内上线', confidence: 70 } },
    { now: NOW + DAY, defaultReviewDays: 90 });
  assert.equal(s.error, undefined);
  assert.equal(s.decision.status, 'decided');
  assert.equal(s.decision.chosenId, 'o2');
  assert.equal(s.decision.reviewAt, NOW + DAY + 90 * DAY);
  assert.equal(s.decision.createdAt, NOW, 'createdAt 保留创建时点');
  // 缺预期 → 方法论报错
  const s2 = core.settleDecision(open, { chosen: '乙' }, { now: NOW });
  assert.equal(s2.error.includes('可检验的预期'), true);
  // 显式不定期
  const s3 = core.settleDecision(open, { chosen: '甲', expected: { text: '会好', confidence: 60 }, reviewInDays: 0 }, { now: NOW });
  assert.equal(s3.decision.reviewAt, null);
  // 非 open 报错
  const again = core.settleDecision(s.decision, { chosen: '乙', expected: { text: 'x', confidence: 5 } }, { now: NOW });
  assert.equal(again.error.includes('定案'), true);
});

test('resolveDecision：分数映射/重复盘覆盖/open 报错', () => {
  const d = mkDecided({ conf: 80 });
  const r1 = core.resolveDecision(d, { outcome: 'hit', note: '成了', lesson: '多问一句' }, { now: NOW + DAY });
  assert.equal(r1.decision.resolution.score, 1);
  assert.equal(core.resolveDecision(d, { outcome: 'partial' }).decision.resolution.score, 0.5);
  assert.equal(core.resolveDecision(d, { outcome: 'miss' }).decision.resolution.score, 0);
  const rv = core.resolveDecision(d, { outcome: 'void' });
  assert.equal(rv.decision.resolution.score, null);
  assert.equal(rv.decision.status, 'resolved');
  // 重复盘覆盖
  const again = core.resolveDecision(r1.decision, { outcome: 'miss', note: '改判' }, { now: NOW + 2 * DAY });
  assert.equal(again.error, undefined);
  assert.equal(again.decision.resolution.outcome, 'miss');
  assert.equal(again.decision.resolution.resolvedAt, NOW + 2 * DAY);
  // open 不可复盘
  const open = core.normalizeDecision({ title: 'x', question: 'y' }, { now: NOW }).decision;
  assert.equal(core.resolveDecision(open, { outcome: 'hit' }).error.includes('settle'), true);
  // 非法 outcome
  assert.equal(core.resolveDecision(d, { outcome: 'maybe' }).error.includes('outcome'), true);
});

test('shelveDecision：open/decided 可搁置，resolved 报错', () => {
  const open = core.normalizeDecision({ title: 'x', question: 'y' }, { now: NOW }).decision;
  assert.equal(core.shelveDecision(open, '优先级让位').decision.status, 'shelved');
  const d = mkDecided({ conf: 80 });
  const sh = core.shelveDecision(d, '');
  assert.equal(sh.decision.status, 'shelved');
  assert.equal(sh.decision.shelvedReason, '');
  const res = core.resolveDecision(d, { outcome: 'hit' }, { now: NOW }).decision;
  assert.equal(core.shelveDecision(res, 'x').error.includes('不搁置'), true);
});

test('updateDecision：字段编辑不改状态；不定期不被重置；resolved 拒编辑', () => {
  const d = mkDecided({ conf: 80 });
  const u = core.updateDecision(d, { title: ' 改标题 ', tags: ['新'] }, { now: NOW + DAY });
  assert.equal(u.decision.title, '改标题');
  assert.equal(u.decision.status, 'decided');
  assert.deepEqual(u.decision.tags, ['新']);
  assert.equal(u.decision.reviewAt, d.reviewAt, '未触碰期限字段时保持原值');
  // 不定期（null）不被无关编辑重置回默认
  const undated = mkDecided({ conf: 80, reviewInDays: 0 });
  const u2 = core.updateDecision(undated, { title: 'x2' }, { now: NOW + DAY });
  assert.equal(u2.decision.reviewAt, null);
  // 显式改期限
  const u3 = core.updateDecision(d, { reviewInDays: 30 }, { now: NOW + DAY });
  assert.equal(u3.decision.reviewAt, NOW + DAY + 30 * DAY);
  // expected 更新
  const u4 = core.updateDecision(d, { expected: { text: '新预期', confidence: 90 } }, { now: NOW });
  assert.equal(u4.decision.expected.confidence, 90);
  // decided 不能清空预期
  assert.equal(core.updateDecision(d, { expected: null }, { now: NOW }).error.includes('不能清空'), true);
  // options 更新须保留 chosen（chosen 为第 2 项时缩短列表会使 o2 消失）
  const d2opt = core.normalizeDecision(
    { title: 'x', options: ['A', 'B'], chosen: 'B', expected: { text: 'y', confidence: 60 } }, { now: NOW }).decision;
  assert.equal(core.updateDecision(d2opt, { options: ['C'] }, { now: NOW }).error.includes('chosenId'), true);
  const u5 = core.updateDecision(d2opt, { options: ['A', 'C'] }, { now: NOW });
  assert.equal(u5.error, undefined);
  // resolved 拒编辑
  const res = core.resolveDecision(d, { outcome: 'hit' }, { now: NOW }).decision;
  assert.equal(core.updateDecision(res, { title: 'x' }, { now: NOW }).error.includes('resolve/delete'), true);
});

test('isDue/overdueDays：边界（reviewAt==now 算到期）', () => {
  const due = { ...mkDecided({ conf: 80 }), reviewAt: NOW };
  assert.equal(core.isDue(due, NOW), true);
  assert.equal(core.overdueDays(due, NOW), 0);
  const future = { ...mkDecided({ conf: 80 }), reviewAt: NOW + 1 };
  assert.equal(core.isDue(future, NOW), false);
  const late = { ...mkDecided({ conf: 80 }), reviewAt: NOW - 3 * DAY - 12 };
  assert.equal(core.overdueDays(late, NOW), 3);
  const undated = { ...mkDecided({ conf: 80 }), reviewAt: null };
  assert.equal(core.isDue(undated, NOW), false);
  const open = core.normalizeDecision({ title: 'x', question: 'y' }, { now: NOW }).decision;
  assert.equal(core.isDue(open, NOW), false);
});

test('buildOverview：计数/到期升序/7 天内 upcoming', () => {
  const a = { ...mkDecided({ title: '到期早', conf: 80 }), reviewAt: NOW - 2 * DAY };
  const b = { ...mkDecided({ title: '到期晚', conf: 80 }), reviewAt: NOW - DAY };
  const up = { ...mkDecided({ title: '三天后', conf: 80 }), reviewAt: NOW + 3 * DAY };
  const far = { ...mkDecided({ title: '八天后', conf: 80 }), reviewAt: NOW + 8 * DAY };
  const open = core.normalizeDecision({ title: '纠结', question: 'q' }, { now: NOW }).decision;
  const res = mkResolved({ title: '已复盘', conf: 70, outcome: 'hit', resolvedAt: NOW });
  const sh = core.shelveDecision(mkDecided({ conf: 60 }), 'x').decision;
  const ov = core.buildOverview([b, a, up, far, open, res, sh], NOW);
  assert.deepEqual(ov.counts, { open: 1, decided: 4, resolved: 1, shelved: 1 });
  assert.deepEqual(ov.due.map((d) => d.title), ['到期早', '到期晚'], 'due 按 reviewAt 升序');
  assert.deepEqual(ov.upcoming.map((d) => d.title), ['三天后'], '8 天后不进 7 天窗口');
});

test('summarize：due 标 ⚠️ 与逾期天数', () => {
  const late = { ...mkDecided({ title: '晚了的', conf: 85 }), reviewAt: NOW - 2 * DAY };
  const s = core.summarize(late, NOW);
  assert.ok(s.includes('[d'));
  assert.ok(s.includes('晚了的'));
  assert.ok(s.includes('⚠️'));
  assert.ok(s.includes('2 天'));
});

test('computeCalibration：固定样本精确对账（分桶/命中率/Brier/bias/作废排除）', () => {
  const d1 = mkResolved({ title: 'd1', conf: 80, outcome: 'hit', resolvedAt: new Date(2026, 9, 5).getTime() });
  const d2 = mkResolved({ title: 'd2', conf: 90, outcome: 'miss', resolvedAt: new Date(2026, 9, 10).getTime() });
  const d3 = mkResolved({ title: 'd3', conf: 60, outcome: 'partial', resolvedAt: new Date(2026, 9, 15).getTime() });
  const d4 = mkResolved({ title: 'd4', conf: 95, outcome: 'hit', resolvedAt: new Date(2026, 10, 1).getTime() });
  const d5 = mkResolved({ title: 'd5', conf: 99, outcome: 'void', resolvedAt: new Date(2026, 9, 20).getTime() });
  const open = core.normalizeDecision({ title: '纠结', question: 'q' }, { now: NOW }).decision;

  const cal = core.computeCalibration([d1, d2, d3, d4, d5, open]);
  assert.equal(cal.nScored, 4, '作废与未复盘不进计分');
  assert.equal(cal.nVoid, 1);
  // avgConf = (0.8+0.9+0.6+0.95)/4 = 0.8125 → 0.813
  assert.equal(cal.avgConf, 0.813);
  // hitRate = (1+0+0.5+1)/4 = 0.625
  assert.equal(cal.hitRate, 0.625);
  // brier = ((.2)²+(.9)²+(.1)²+(.05)²)/4 = 0.215625 → 0.216
  assert.equal(cal.brier, 0.216);
  // bias = 0.625 - 0.8125 = -0.1875 → -0.187（Math.round 向 +∞ 取整）
  assert.equal(cal.bias, -0.187);
  // n=4 < 5 → 样本不足提示优先
  assert.ok(cal.verdict.includes('样本还少'));

  const byKey = Object.fromEntries(cal.buckets.map((b) => [b.key, b]));
  assert.equal(byKey['<50'].n, 0);
  assert.equal(byKey['50-69'].n, 1);
  assert.equal(byKey['50-69'].hitRate, 0.5);
  assert.equal(byKey['50-69'].brier, 0.01);
  assert.equal(byKey['70-84'].n, 1);
  assert.equal(byKey['70-84'].hitRate, 1);
  assert.equal(byKey['70-84'].avgConf, 0.8);
  assert.equal(byKey['85-100'].n, 2, '90 与 95 同桶');
  assert.equal(byKey['85-100'].hitRate, 0.5);
  assert.equal(byKey['85-100'].brier, 0.406, '(0.81+0.0025)/2=0.40625 → 0.406');

  // byMonth 按复盘月聚合且升序
  assert.deepEqual(cal.byMonth.map((m) => m.month), ['2026-10', '2026-11']);
  assert.equal(cal.byMonth[0].n, 3, '10 月：d1/d2/d3');

  // 空库
  const empty = core.computeCalibration([]);
  assert.equal(empty.nScored, 0);
  assert.ok(empty.verdict.includes('还没有'));
});

test('computeCalibration：n≥5 且 bias 小 → 校准良好', () => {
  const ds = [
    mkResolved({ title: 'a', conf: 80, outcome: 'hit', resolvedAt: NOW }),
    mkResolved({ title: 'b', conf: 90, outcome: 'miss', resolvedAt: NOW }),
    mkResolved({ title: 'c', conf: 60, outcome: 'partial', resolvedAt: NOW }),
    mkResolved({ title: 'd', conf: 95, outcome: 'hit', resolvedAt: NOW }),
    mkResolved({ title: 'e', conf: 70, outcome: 'hit', resolvedAt: NOW }),
  ];
  const cal = core.computeCalibration(ds);
  assert.equal(cal.nScored, 5);
  assert.equal(cal.hitRate, 0.7, '(1+0+0.5+1+1)/5');
  assert.equal(cal.avgConf, 0.79, '(0.8+0.9+0.6+0.95+0.7)/5');
  assert.equal(cal.brier, 0.191, '(0.04+0.81+0.01+0.0025+0.09)/5');
  assert.equal(cal.bias, -0.09);
  assert.ok(cal.verdict.includes('校准良好'));
});

test('computeCalibration：系统性过度自信解读（bias ≤ -0.1 且 n≥5）', () => {
  const ds = [85, 90, 88, 92, 86].map((conf, i) =>
    mkResolved({ title: `t${i}`, conf, outcome: 'miss', resolvedAt: NOW }));
  const cal = core.computeCalibration(ds);
  assert.equal(cal.nScored, 5);
  assert.ok(cal.verdict.includes('过度自信'), cal.verdict);
});

test('recentLessons：只含有教训的复盘，按时间降序取前 N', () => {
  const l1 = mkResolved({ title: '早', conf: 70, outcome: 'hit', resolvedAt: NOW - 2 * DAY, lesson: '教训一' });
  const l2 = mkResolved({ title: '晚', conf: 70, outcome: 'miss', resolvedAt: NOW, lesson: '教训二' });
  const noLesson = mkResolved({ title: '无', conf: 70, outcome: 'hit', resolvedAt: NOW - DAY, lesson: '' });
  const ls = core.recentLessons([l1, noLesson, l2], 5);
  assert.deepEqual(ls.map((l) => l.title), ['晚', '早']);
  assert.equal(ls[0].lesson, '教训二');
  assert.equal(core.recentLessons([l1, l2], 1).length, 1);
});

test('exportJson：可往返解析', () => {
  const d = mkDecided({ conf: 80 });
  const json = JSON.parse(core.exportJson([d], core.DEFAULT_SETTINGS));
  assert.equal(json.app, 'decision-journal');
  assert.equal(json.decisions.length, 1);
  assert.equal(json.decisions[0].id, d.id);
  assert.equal(json.settings.reviewDefaultDays, 90);
});
