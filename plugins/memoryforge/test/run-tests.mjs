/**
 * 记忆熔炉离线单元测试（node test/run-tests.mjs，不需要 Polaris 在跑）
 *
 * 覆盖 shared/srs-core.js 全部纯函数：归一化、SM-2 调度状态机、
 * 今日计数、每日队列限额、连击、统计/预报/留存、检索、导入导出。
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/srs-core.js');

const results = [];
let current = '';
function test(name, fn) {
  current = name;
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, pass: false });
    console.error(`✗ ${name}\n    [${current}] ${e.message}`);
  }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label ? label + '：' : ''}期望 ${b}，实际 ${a}`);
}
function ok(cond, label = '') {
  if (!cond) throw new Error(label || '断言失败');
}

const MIN = 60000;
const DAY = 86400000;
const NOW = new Date('2026-10-27T10:00:00').getTime();

// ── normalizeCard ──────────────────────────────────────────────────────────
test('normalizeCard：合法卡归一化（tags 去重截断、id 生成、status=new）', () => {
  const r = core.normalizeCard({ deckId: 'd1', front: ' 什么是 SM-2？ ', back: '间隔重复算法', tags: ['算法', '算法', ' 记忆 '], source: '测试', now: NOW });
  ok(!r.error, r.error);
  eq(r.card.status, 'new');
  eq(r.card.tags, ['算法', '记忆'], 'tags');
  eq(r.card.ease, 2.5);
  eq(r.card.due, NOW, '新卡 due=now');
  ok(r.card.id.length > 2, 'id 已生成');
});
test('normalizeCard：front/back 为空或超长报错', () => {
  ok(core.normalizeCard({ front: '', back: 'x' }).error, '空 front');
  ok(core.normalizeCard({ front: 'x', back: '  ' }).error, '空 back');
  ok(core.normalizeCard({ front: 'x'.repeat(501), back: 'y' }).error, 'front 超长');
  ok(core.normalizeCard({ front: 'x', back: 'y'.repeat(2001) }).error, 'back 超长');
  ok(!core.normalizeCard({ front: 'x'.repeat(500), back: 'y'.repeat(2000) }).error, '边界内合法');
});

// ── gradeCard 状态机 ───────────────────────────────────────────────────────
test('调度：新卡 良好 → 学习步1（1 天后再见），再 良好 → 毕业（间隔 1 天，ease 不变）', () => {
  const c1 = core.normalizeCard({ front: 'q', back: 'a', now: NOW }).card;
  const g1 = core.gradeCard(c1, 2, NOW);
  eq(g1.card.status, 'learning');
  eq(g1.card.learningStep, 1);
  eq(g1.card.intervalMin, 1440, '步1=1440 分钟');
  eq(g1.card.due, NOW + 1440 * MIN, 'due=+1 天');
  eq(g1.card.ease, 2.5);
  const g2 = core.gradeCard(g1.card, 2, NOW + 1440 * MIN);
  eq(g2.card.status, 'review', '毕业');
  eq(g2.card.intervalMin, 1440);
  eq(g2.card.reps, 2);
});
test('调度：复习卡 良好 → 间隔 ×ease（1440×2.5=2.5 天，再 ×2.5=6.25 天）', () => {
  let c = core.normalizeCard({ front: 'q', back: 'a', now: NOW }).card;
  c = core.gradeCard(c, 2, NOW).card;
  c = core.gradeCard(c, 2, NOW + DAY).card; // 毕业
  const g3 = core.gradeCard(c, 2, NOW + 2 * DAY);
  eq(g3.card.intervalMin, 3600, '1440×2.5');
  const g4 = core.gradeCard(g3.card, 2, NOW + 5 * DAY);
  eq(g4.card.intervalMin, 9000, '3600×2.5');
});
test('调度：复习卡 重来 → lapse+1、ease-0.2、回学习步0（10 分钟）', () => {
  let c = core.normalizeCard({ front: 'q', back: 'a', now: NOW }).card;
  c = core.gradeCard(c, 2, NOW).card;
  c = core.gradeCard(c, 2, NOW + DAY).card;
  const g = core.gradeCard(c, 0, NOW + 3 * DAY);
  eq(g.card.lapses, 1);
  eq(g.card.ease, 2.3);
  eq(g.card.status, 'learning');
  eq(g.card.intervalMin, 10);
  eq(g.card.due, NOW + 3 * DAY + 10 * MIN);
});
test('调度：学习卡 轻松 → 直接毕业 4 天、ease+0.15；复习卡 轻松 → ×ease×1.3', () => {
  const c1 = core.normalizeCard({ front: 'q', back: 'a', now: NOW }).card;
  const ge = core.gradeCard(c1, 3, NOW);
  eq(ge.card.status, 'review');
  eq(ge.card.intervalMin, 4 * 1440);
  eq(ge.card.ease, 2.65);
  const gr = core.gradeCard(ge.card, 3, NOW + 4 * DAY);
  eq(gr.card.intervalMin, Math.round(5760 * 2.65 * 1.3), '×ease×1.3');
  eq(gr.card.ease, 2.8);
});
test('调度：复习卡 困难 → ×1.2、ease-0.15；学习卡 困难 → 重复当前步', () => {
  let c = core.normalizeCard({ front: 'q', back: 'a', now: NOW }).card;
  c = core.gradeCard(c, 2, NOW).card;
  c = core.gradeCard(c, 2, NOW + DAY).card; // review, ivl=1440, ease=2.5
  const gh = core.gradeCard(c, 1, NOW + 2 * DAY);
  eq(gh.card.intervalMin, Math.round(1440 * 1.2));
  eq(gh.card.ease, 2.35);
  // 学习卡困难：步1 重复
  const c2 = core.gradeCard(core.normalizeCard({ front: 'q', back: 'a', now: NOW }).card, 2, NOW).card;
  const gh2 = core.gradeCard(c2, 1, NOW + 60 * MIN);
  eq(gh2.card.learningStep, 1, '步不前进');
  eq(gh2.card.intervalMin, 1440, '重复步1 时长');
  eq(gh2.card.status, 'learning');
});
test('调度：ease 下限 1.3；间隔上限 365 天；history 窗口 200', () => {
  let c = core.normalizeCard({ front: 'q', back: 'a', now: NOW }).card;
  for (let i = 0; i < 10; i++) c = core.gradeCard(c, 0, NOW + i * MIN).card;
  eq(c.ease, core.MIN_EASE, 'ease 触底');
  c.status = 'review';
  c.intervalMin = core.MAX_INTERVAL_MIN - 10;
  const g = core.gradeCard(c, 2, NOW);
  eq(g.card.intervalMin, core.MAX_INTERVAL_MIN, '封顶');
  const c3 = core.normalizeCard({ front: 'q', back: 'a', now: NOW }).card;
  let cur = c3;
  for (let i = 0; i < 260; i++) cur = core.gradeCard(cur, 0, NOW + i * MIN).card;
  eq(cur.history.length, core.HISTORY_CAP, 'history 截断');
});
test('调度：非法评分报错；editCard 改正背面保留调度状态', () => {
  const c = core.normalizeCard({ front: 'q', back: 'a', now: NOW }).card;
  ok(core.gradeCard(c, 5, NOW).error, 'grade=5');
  ok(core.gradeCard(c, -1, NOW).error, 'grade=-1');
  const e = core.editCard(c, { back: '新答案', tags: ['t1'] });
  ok(!e.error, e.error);
  eq(e.card.back, '新答案');
  eq(e.card.status, 'new', '调度状态不动');
  ok(core.editCard(c, { front: '' }).error, '空 front 拒改');
});

// ── isDue / countToday ─────────────────────────────────────────────────────
test('isDue：过期 learning/review true，未来/新卡/暂停 false', () => {
  const c = core.normalizeCard({ front: 'q', back: 'a', now: NOW }).card;
  ok(!core.isDue(c, NOW + 10 * MIN), 'new 不按 due');
  const l = core.gradeCard(c, 0, NOW).card;
  ok(core.isDue(l, NOW + 10 * MIN), '学习卡到点');
  ok(!core.isDue(l, NOW + 9 * MIN), '未到点');
  const s = { ...l, status: 'suspended' };
  ok(!core.isDue(s, NOW + 60 * MIN), '暂停不出');
});
test('countToday：今日复习数/答对数/新卡数从 history 与 createdAt 派生', () => {
  const t0 = new Date('2026-10-27T01:00:00').getTime();
  let a = core.normalizeCard({ front: 'a', back: 'x', now: t0 }).card;
  let b = core.normalizeCard({ front: 'b', back: 'y', now: t0 }).card;
  a = core.gradeCard(a, 0, t0 + MIN).card;   // 今日 重来（不算答对）
  a = core.gradeCard(a, 2, t0 + 2 * MIN).card; // 今日 良好
  b = core.gradeCard(b, 3, t0 + 3 * MIN).card; // 今日 轻松
  const cnt = core.countToday([a, b], t0 + 60 * MIN);
  eq(cnt.today, '2026-10-27');
  eq(cnt.reviews, 3);
  eq(cnt.correct, 2);
  eq(cnt.newCards, 2, '两卡都是今天创建');
});

// ── computeQueue ───────────────────────────────────────────────────────────
test('computeQueue：到期卡 due 升序在前，新卡创建序在后；暂停卡不进队', () => {
  const now = NOW;
  const mk = (id, front, createdAt) => core.normalizeCard({ id, front, back: 'a', deckId: 'd', now: createdAt }).card;
  const d1 = core.gradeCard(mk('d1', 'q1', now - DAY), 0, now - 20 * MIN).card;  // due now-10min
  const d2 = core.gradeCard(mk('d2', 'q2', now - DAY), 0, now - 30 * MIN).card;  // due now-20min
  const n1 = mk('n1', 'q3', now - 3000);
  const n2 = mk('n2', 'q4', now - 1000);
  const sus = { ...mk('s1', 'q5', now), status: 'suspended' };
  const r = core.computeQueue([n2, d1, sus, d2, n1], { dailyNewLimit: 10, dailyReviewLimit: 100 }, now);
  eq(r.queue.map((c) => c.id), ['d2', 'd1', 'n1', 'n2'], 'due 升序 + 新卡创建序');
  eq(r.dueTotal, 2);
  eq(r.newTotal, 2);
});
test('computeQueue：每日新卡限额与复习限额；0=复习不设限/新卡停发', () => {
  const now = NOW;
  // 新卡与到期卡的 history/createdAt 都落在「昨天」→ 今日计数为 0，限额全额可用
  const fresh = (i) => core.normalizeCard({ id: `n${i}`, front: `q${i}`, back: 'a', now: now - DAY - (10 - i) * 1000 }).card;
  const due = (i) => core.gradeCard(core.normalizeCard({ id: `d${i}`, front: `x${i}`, back: 'a', now: now - 2 * DAY }).card, 0, now - DAY).card;
  let r = core.computeQueue([fresh(1), fresh(2), fresh(3), due(1), due(2)], { dailyNewLimit: 2, dailyReviewLimit: 1 }, now);
  eq(r.queue.map((c) => c.id), ['d1', 'n1', 'n2'], '1 张到期（复习限额 1）+ 2 张新卡（限额内创建序）');
  eq(r.newRemaining, 2);
  eq(r.reviewRemaining, 1);
  r = core.computeQueue([due(1), due(2), fresh(1)], { dailyNewLimit: 5, dailyReviewLimit: 0 }, now);
  eq(r.queue.length, 3, '复习上限 0 = 不设限（全出）+ 新卡 1 张');
  r = core.computeQueue([fresh(1), fresh(2)], { dailyNewLimit: 0, dailyReviewLimit: 10 }, now);
  eq(r.queue.length, 0, '新卡上限 0 = 停发');
});

// ── streak ─────────────────────────────────────────────────────────────────
test('streak：首学 1 → 同日幂等 → 次日 2 → 断签重置 1；displayStreak 隔天不断签', () => {
  const d1 = new Date('2026-10-26T10:00:00').getTime();
  const d2 = new Date('2026-10-27T09:00:00').getTime();
  let meta = {};
  let r = core.updateStreak(meta, d1);
  meta = { streak: r.streak };
  eq(meta.streak.count, 1);
  r = core.updateStreak(meta, d1 + 60 * MIN);
  eq(r.streak.count, 1, '同日幂等');
  eq(r.changed, false);
  r = core.updateStreak(meta, d2);
  eq(r.streak.count, 2, '次日 +1');
  eq(r.streak.best, 2);
  const d5 = new Date('2026-10-30T10:00:00').getTime();
  r = core.updateStreak({ streak: r.streak }, d5);
  eq(r.streak.count, 1, '断签重置');
  eq(core.displayStreak({ streak: r.streak }, d5), 1);
  eq(core.displayStreak({ streak: { count: 3, lastDay: '2026-10-26' } }, d2), 3, '昨天签还在，显示不断');
  eq(core.displayStreak({ streak: { count: 3, lastDay: '2026-10-20' } }, d2), 0, '断了显示 0');
});

// ── computeStats ───────────────────────────────────────────────────────────
test('computeStats：状态计数/到期数/7 天预报/30 天留存/分牌组/未归属', () => {
  const now = NOW;
  const decks = [{ id: 'd1', name: '语言', createdAt: now }];
  let a = core.normalizeCard({ id: 'a', front: 'q', back: 'a', deckId: 'd1', now: now - DAY }).card;
  a = core.gradeCard(a, 2, now - DAY).card;
  a = core.gradeCard(a, 2, now - DAY + MIN).card; // 毕业 review，due ≈ now+1min（今天）
  const e = { ...core.normalizeCard({ id: 'e', front: 'q4', back: 'e', deckId: 'd1', now: now - DAY }).card, status: 'review', intervalMin: 1440, due: now + 36 * 3600000 }; // 明天到期
  const b = core.normalizeCard({ id: 'b', front: 'q2', back: 'b', deckId: 'd1', now: now }).card;
  const c = { ...core.normalizeCard({ id: 'c', front: 'q3', back: 'c', deckId: 'ghost', now: now }).card, status: 'suspended' };
  const s = core.computeStats([a, e, b, c], decks, { streak: { count: 4, lastDay: core.dayKeyOf(now), best: 9 } }, now);
  eq(s.total, 4);
  eq(s.byStatus, { new: 1, learning: 0, review: 2, suspended: 1 });
  eq(s.dueNow, 0, 'a 到期在 1 分钟后，现在还不出');
  eq(s.streak, 4);
  eq(s.bestStreak, 9);
  eq(s.forecast.length, 7, '预报 7 天');
  eq(s.forecast[0].count, 1, '今天 1 张');
  ok(s.forecast[1].count >= 1, `明天应有一张（实际 ${JSON.stringify(s.forecast)}）`);
  eq(s.retention30, 100, '两答对/两复习');
  const d1stat = s.byDeck.find((d) => d.id === 'd1');
  eq(d1stat.total, 3, '牌组 d1：a/e/b');
  eq(d1stat.mature, 0, '间隔 1 天未成熟');
  const orphan = s.byDeck.find((d) => d.id === '__orphan');
  ok(orphan && orphan.total === 1, '未归属 1 张（含暂停）');
});
test('computeStats：activity30 长度 30、按天聚合', () => {
  const now = NOW;
  let a = core.normalizeCard({ front: 'q', back: 'a', now: now - DAY }).card;
  a = core.gradeCard(a, 2, now - DAY).card;
  a = core.gradeCard(a, 0, now - DAY + MIN).card;
  const s = core.computeStats([a], [], {}, now);
  eq(s.activity30.length, 30);
  const yesterday = s.activity30.find((x) => x.date === core.dayKeyOf(now - DAY));
  eq(yesterday.count, 2, '昨天两次评分');
  eq(s.activity30[29].date, core.dayKeyOf(now));
});

// ── searchCards ────────────────────────────────────────────────────────────
test('searchCards：关键词命中 front/back/tags/来源，deck/tag/status 过滤', () => {
  const now = NOW;
  const cards = [
    { ...core.normalizeCard({ id: '1', front: '什么是 CORS', back: '跨源资源共享', tags: ['web'], deckId: 'd1', source: 'MDN', now }).card },
    { ...core.normalizeCard({ id: '2', front: 'SM-2 全称', back: 'SuperMemo-2 算法', tags: ['算法'], deckId: 'd2', now }).card },
    { ...core.normalizeCard({ id: '3', front: 'q3', back: 'b3', tags: ['web'], deckId: 'd1', now }).card, status: 'suspended' },
  ];
  eq(core.searchCards(cards, { query: 'cors' }).map((c) => c.id), ['1'], '大小写不敏感');
  eq(core.searchCards(cards, { query: 'supermemo' }).length, 1, 'back 命中');
  eq(core.searchCards(cards, { query: 'mdn' }).length, 1, '来源命中');
  eq(core.searchCards(cards, { tag: 'web', status: 'new' }).map((c) => c.id), ['1'], 'tag+status');
  eq(core.searchCards(cards, { deckId: 'd1' }).length, 2, 'deck 过滤含暂停');
});

// ── 导入导出 ───────────────────────────────────────────────────────────────
test('导出→导入 roundtrip：toJsonExport 产物可被 parseImportJson 还原', () => {
  const now = NOW;
  const decks = [{ id: 'd1', name: '语言', createdAt: now }];
  const cards = [core.normalizeCard({ front: 'q1', back: 'a1', deckId: 'd1', tags: ['t'], now }).card];
  const dump = core.toJsonExport(cards, decks, core.DEFAULT_SETTINGS, { streak: { count: 1, lastDay: 'x', best: 1 } });
  const parsed = core.parseImportJson(JSON.stringify(dump));
  ok(!parsed.error, parsed.error);
  eq(parsed.cards.length, 1);
  eq(parsed.cards[0].deckName, '语言');
  ok(parsed.cards[0].front === 'q1');
});
test('parseImportJson：裸 cards 数组、坏 JSON、空数组各就各位', () => {
  const r1 = core.parseImportJson(JSON.stringify({ cards: [{ front: 'a', back: 'b', deckName: 'x' }] }));
  eq(r1.cards[0].deckName, 'x');
  eq(r1.cards[0].source, 'import');
  ok(core.parseImportJson('not json').error, '坏 JSON');
  ok(core.parseImportJson(JSON.stringify({ cards: [] })).error, '空 cards');
  ok(core.parseImportJson(JSON.stringify({ foo: 1 })).error, '无 cards');
});
test('toCsv：表头与行数正确、引号转义', () => {
  const now = NOW;
  const decks = [{ id: 'd1', name: '语言', createdAt: now }];
  const c = core.normalizeCard({ front: '他说"你好"', back: 'a', deckId: 'd1', now }).card;
  const csv = core.toCsv([c], decks);
  const lines = csv.split('\n');
  eq(lines.length, 2, '表头+1 行');
  ok(lines[0].startsWith('牌组,问题,答案'), lines[0]);
  ok(lines[1].includes('""你好""'), '引号转义');
});

// ── 汇总 ───────────────────────────────────────────────────────────────────
const bad = results.filter((r) => !r.pass);
console.log(`\n[run-tests] ${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
