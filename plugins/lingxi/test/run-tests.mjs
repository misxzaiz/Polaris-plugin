/**
 * 灵犀 pond-core 逻辑测试（node --test test/run-tests.mjs）
 * 覆盖：归一化、回访 SRS（首访/翻倍/推进归零/落地收口/归档恢复）、
 *       成熟度管道、CJK 双元检索与相关匹配、星系聚类与合并候选、
 *       随机碰撞（确定性注入）、星图布局（确定性/边界）、统计、时间线截断。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/pond-core.js');

const DAY = core.DAY_MS;
const NOW = new Date(2026, 9, 28, 12, 0).getTime();

function mkIdea(over = {}) {
  const r = core.normalizeIdea({ title: '测试想法', now: NOW, ...over });
  assert.ok(!r.error, r.error);
  return r.idea;
}

test('normalizeIdea：标题必填/类型兜底/标签清洗/URL 校验/回访初始化', () => {
  assert.ok(core.normalizeIdea({ title: '  ' }).error.includes('标题'));
  const a = core.normalizeIdea({ title: '想 法', now: NOW });
  assert.equal(a.idea.kind, 'idea');
  assert.equal(a.idea.maturity, 0);
  assert.equal(a.idea.status, 'active');
  assert.equal(a.idea.revisit.interval, core.REVISIT_BASE_DAYS);
  assert.equal(a.idea.revisit.dueAt, NOW + 3 * DAY);
  assert.equal(a.idea.timeline.length, 1);
  assert.equal(a.idea.timeline[0].kind, 'catch');
  // 标签：去重、截断、限量
  const b = core.normalizeIdea({ title: 'x', tags: ['A', 'A', ' B ', 'C', 'D', 'E', 'F', 'G'], now: NOW });
  assert.deepEqual(b.idea.tags, ['A', 'B', 'C', 'D', 'E', 'F']);
  // URL：仅 http(s)
  assert.equal(core.normalizeIdea({ title: 'x', url: 'javascript:alert(1)' }).idea.url, undefined);
  assert.equal(core.normalizeIdea({ title: 'x', url: 'https://a.b/c' }).idea.url, 'https://a.b/c');
  // 未知 kind 兜底
  assert.equal(core.normalizeIdea({ title: 'x', kind: 'hack' }).idea.kind, 'idea');
});

test('回访 SRS：深化翻倍 / 推进归零回活跃 / snooze 翻倍 / 落地收口', () => {
  const idea = mkIdea({ title: '星空屏保' });
  // 深化：3 → 6
  const d1 = core.deepenIdea(idea, '先做最小内核', NOW + DAY);
  assert.equal(d1.idea.revisit.interval, 6);
  assert.equal(d1.idea.revisit.dueAt, NOW + DAY + 6 * DAY);
  assert.equal(d1.idea.timeline[0].kind, 'deepen');
  // 再深化：6 → 12
  const d2 = core.deepenIdea(d1.idea, '色板定成暖夜', NOW + 2 * DAY);
  assert.equal(d2.idea.revisit.interval, 12);
  assert.ok(core.deepenIdea(d2.idea, '   ').error.includes('不能为空'));
  // 推进：maturity 0→1，间隔回 3
  const p1 = core.promoteIdea(d2.idea, NOW + 3 * DAY, '方案已定');
  assert.equal(p1.idea.maturity, 1);
  assert.equal(p1.idea.revisit.interval, core.REVISIT_BASE_DAYS);
  assert.ok(p1.idea.timeline[0].text.includes('嫩芽'));
  // snooze：3 → 6
  const s1 = core.applyRevisitOutcome(p1.idea, 'snooze', NOW + 4 * DAY);
  assert.equal(s1.idea.revisit.interval, 6);
  // 连续推进到落地：状态收口、退出回访
  let cur = s1.idea;
  for (let i = 0; i < 3; i++) {
    const r = core.promoteIdea(cur, NOW + (5 + i) * DAY);
    assert.ok(!r.error, r.error);
    cur = r.idea;
  }
  assert.equal(cur.maturity, 4);
  assert.equal(cur.status, 'done');
  assert.equal(cur.revisit.dueAt, 0);
  assert.ok(core.promoteIdea(cur, NOW).error.includes('落地'));
  assert.ok(core.deepenIdea(cur, 'x', NOW).error.includes('active'));});

test('applyRevisitOutcome：archive 分支与非法值', () => {
  const idea = mkIdea({ title: '旧念头' });
  const a = core.applyRevisitOutcome(idea, 'archive', NOW + DAY);
  assert.equal(a.idea.status, 'archived');
  assert.equal(a.idea.revisit.dueAt, 0);
  assert.ok(core.applyRevisitOutcome(a.idea, 'snooze', NOW).error.includes('active'));
  assert.ok(core.applyRevisitOutcome(mkIdea(), 'warp', NOW).error.includes('未知回访结果'));
  // 归档重复归档报错；恢复重置节奏
  assert.ok(core.archiveIdea(a.idea, NOW).error.includes('已'));
  const r = core.restoreIdea(a.idea, NOW + 2 * DAY);
  assert.equal(r.idea.status, 'active');
  assert.equal(r.idea.revisit.dueAt, NOW + 2 * DAY + 3 * DAY);
  assert.equal(r.idea.timeline[0].kind, 'restore');
  assert.ok(core.restoreIdea(mkIdea(), NOW).error.includes('归档'));
});

test('retitle：改题留痕', () => {
  const idea = mkIdea({ title: '旧题' });
  const r = core.retitleIdea(idea, ' 新题 ', NOW + DAY);
  assert.equal(r.idea.title, '新题');
  assert.equal(r.idea.timeline[0].kind, 'edit');
  assert.ok(core.retitleIdea(idea, '', NOW).error.includes('标题'));
});

test('timeline 截断上限（40 条，新在前）', () => {
  const idea = mkIdea({ title: '长史' });
  for (let i = 0; i < 60; i++) {
    const r = core.deepenIdea(idea, `第${i}次`, NOW + i * 1000);
    assert.ok(!r.error);
  }
  assert.equal(idea.timeline.length, core.LIMITS.timeline);
  assert.ok(idea.timeline[0].text.includes('59'), '最新事件在最前');
  assert.equal(idea.revisit.history.length, core.LIMITS.revisitHistory);
});

test('tokenize：CJK 双元 + ASCII 词', () => {
  const t = core.tokenize('星空屏保 StarShip_v2');
  assert.ok(t.has('星空'));
  assert.ok(t.has('空屏'));
  assert.ok(t.has('屏保'));
  assert.ok(!t.has('保'), '四字串只产双元，无单字尾');
  assert.ok(t.has('starship_v2'));
  const single = core.tokenize('猫');
  assert.ok(single.has('猫'), '单字 CJK 保留原字');
});

test('findRelated：同主题命中、异主题不误报、小池返回空', () => {
  const target = mkIdea({ title: '星空屏保的色板方案', raw: '深蓝紫渐变，暖色点缀', tags: ['屏保'] });
  const related = mkIdea({ title: '星空屏保', raw: '做一个代号星空的动态屏保' });
  const noise = mkIdea({ title: '周五提醒我取快递', raw: '顺路买咖啡' });
  const pool = [related, noise, mkIdea({ title: '菜谱导入解析器', raw: '跨域抓取菜谱' })];
  const hits = core.findRelated(target, pool, 3);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].idea.id, related.id, '最相关的应是同主题');
  assert.ok(!hits.some((h) => h.idea.id === noise.id), '不相关不入选');
  assert.equal(core.findRelated(target, [noise], 3).length, 0, 'corpus<2 返回空');
});

test('searchIdeas：缺省藏归档 / 关键词 / 标签 / 成熟度过滤', () => {
  const a = mkIdea({ title: '星空屏保', tags: ['屏保'] });
  const b = mkIdea({ title: '菜谱导入', tags: ['插件'], kind: 'problem' });
  const c = mkIdea({ title: '旧点子', tags: ['屏保'] });
  core.archiveIdea(c, NOW + DAY);
  core.promoteIdea(b, NOW + DAY);
  const all = [a, b, c];
  assert.equal(core.searchIdeas(all, {}).length, 2, '缺省不见归档');
  assert.equal(core.searchIdeas(all, { status: 'archived' }).length, 1);
  assert.equal(core.searchIdeas(all, { keyword: '星空' }).length, 1);
  assert.equal(core.searchIdeas(all, { tag: '屏保' }).length, 1, '归档仍可被 tag+status 组合查到吗——缺省 status 不隐藏时才可见');
  assert.equal(core.searchIdeas(all, { tag: '屏保', status: 'archived' }).length, 1);
  assert.equal(core.searchIdeas(all, { kind: 'problem' }).length, 1);
  assert.equal(core.searchIdeas(all, { minMaturity: 1 }).length, 1);
});

test('dueRevisits / nextRevisitAt：到期排序与空池', () => {
  const a = mkIdea({ title: '甲' });
  const b = mkIdea({ title: '乙' });
  core.deepenIdea(a, 'x', NOW - 2 * DAY); // a.dueAt = NOW-2d+6d = NOW+4d（被推后）
  const now2 = NOW + 10 * DAY;
  const due = core.dueRevisits([a, b], now2);
  assert.equal(due.length, 2);
  assert.equal(due[0].id, b.id, '到期更早的先见（未深化者）');
  assert.ok(core.nextRevisitAt([a, b]) > 0);
  assert.equal(core.nextRevisitAt([]), null);
});

test('clusterConstellations：主标签聚类 + 合并候选阈值', () => {
  const now = NOW;
  const ideas = [];
  for (const t of ['星空屏保', '星空主题色板', '星空动效', '买菜清单']) {
    const i = mkIdea({ title: t, tags: [t.includes('买菜') ? '生活' : '星空'] });
    ideas.push(i);
  }
  core.promoteIdea(ideas[0], now); // 星空簇 1 条到嫩芽（<2，非候选）
  core.promoteIdea(ideas[0], now + 1); // 到轮廓
  let { clusters, mergeCandidates } = core.clusterConstellations(ideas, now);
  const star = clusters.find((c) => c.tag === '星空');
  assert.equal(star.count, 3);
  assert.equal(mergeCandidates.length, 0, '只有 1 条到轮廓，不构成候选');
  core.promoteIdea(ideas[1], now + 2);
  core.promoteIdea(ideas[1], now + 3); // 第二条也到轮廓 → 候选
  ({ clusters, mergeCandidates } = core.clusterConstellations(ideas, now));
  assert.equal(mergeCandidates.length, 1, '2 条到轮廓 → 候选');
  assert.equal(mergeCandidates[0].tag, '星空');
  // 归档不进星系
  core.archiveIdea(ideas[2], now + 3);
  const after = core.clusterConstellations(ideas, now);
  assert.equal(after.clusters.find((c) => c.tag === '星空').count, 2);
});

test('pickCollisions：确定性注入 / scope 过滤 / 数量夹取', () => {
  const ideas = [];
  for (let i = 0; i < 6; i++) ideas.push(mkIdea({ title: `想法${i}` }));
  ideas[5].status = 'archived';
  const rand = () => 0.42;
  const r1 = core.pickCollisions(ideas, { count: 3, rand });
  assert.ok(!r1.error);
  assert.equal(r1.picks.length, 3);
  assert.ok(r1.picks.every((p) => p.status !== 'archived'), '归档不参碰');
  assert.ok(core.TECHNIQUES.includes(r1.technique));
  const r2 = core.pickCollisions(ideas, { count: 3, rand });
  assert.deepEqual(r1.picks.map((p) => p.id), r2.picks.map((p) => p.id), '同 rand 同结果');
  // scope=mature：无成熟想法时报错
  assert.ok(core.pickCollisions(ideas, { scope: 'mature', rand }).error.includes('少于 2'));
  const m1 = core.promoteIdea(ideas[0], NOW);
  core.promoteIdea(m1.idea, NOW + 1);
  const m2 = core.promoteIdea(ideas[1], NOW + 2);
  core.promoteIdea(m2.idea, NOW + 3);
  const rm = core.pickCollisions(ideas, { scope: 'mature', rand });
  assert.ok(!rm.error);
  assert.ok(rm.picks.every((p) => p.maturity >= 2));
  assert.ok(core.pickCollisions(ideas.slice(0, 1), { rand }).error.includes('少于 2'));
});

test('computeStarLayout：确定性 / 全覆盖 / 边界内 / 到期标记', () => {
  const ideas = [];
  for (let i = 0; i < 12; i++) ideas.push(mkIdea({ title: `想法${i}`, tags: [i % 3 === 0 ? '甲' : '乙'] }));
  const due = core.deepenIdea(ideas[0], 'x', NOW - 10 * DAY); // dueAt = NOW-10d+6d < NOW → 到期
  ideas[0] = due.idea;
  const L1 = core.computeStarLayout(ideas, 400, 420);
  const L2 = core.computeStarLayout(ideas, 400, 420);
  assert.deepEqual(L1, L2, '同输入同输出');
  assert.equal(L1.stars.length, ideas.length);
  for (const s of L1.stars) {
    assert.ok(s.x >= 12 && s.x <= 388, `x 在界内 ${s.x}`);
    assert.ok(s.y >= 12 && s.y <= 408, `y 在界内 ${s.y}`);
  }
  assert.ok(L1.clusters.length >= 2);
  const dueStar = L1.stars.find((s) => s.id === ideas[0].id);
  assert.equal(dueStar.due, true);
  const arch = core.archiveIdea(ideas[1], NOW + DAY);
  const L3 = core.computeStarLayout([arch.idea, ...ideas.slice(2)], 400, 420);
  assert.equal(L3.stars.find((s) => s.id === arch.idea.id).alpha < 0.5, true, '归档星暗淡');
  // 小画布不炸
  const tiny = core.computeStarLayout(ideas, 100, 80);
  assert.equal(tiny.stars.length, ideas.length);
  assert.equal(core.computeStarLayout([], 400, 420).stars.length, 0);
});

test('computePondStats：计数/漏斗/周桶/标签', () => {
  const ideas = [];
  for (let i = 0; i < 5; i++) ideas.push(mkIdea({ title: `想法${i}`, tags: i < 3 ? ['星空'] : ['生活'] }));
  core.promoteIdea(ideas[0], NOW + 1);
  core.promoteIdea(ideas[1], NOW + 1);
  core.archiveIdea(ideas[3], NOW + 2);
  const s = core.computePondStats(ideas, NOW + 3 * DAY);
  assert.equal(s.total, 5);
  assert.equal(s.active, 4);
  assert.equal(s.archived, 1);
  assert.equal(s.byMaturity[0], 3, '三条仍是种子（含归档那条）');
  assert.equal(s.byMaturity[1], 2, '两条推进到嫩芽');
  core.promoteIdea(ideas[2], NOW + 2);
  core.promoteIdea(ideas[2], NOW + 2 + 1); // ideas[2] 到轮廓
  const s2 = core.computePondStats(ideas, NOW + 3 * DAY);
  assert.equal(s2.byMaturity[2], 1);
  assert.equal(s2.byKind.idea, 4);
  assert.equal(s2.topTags[0].tag, '星空');
  assert.equal(s2.captures8w.length, 8);
  assert.ok(s2.captures8w[7].count >= 1, '本周桶含今天捕获');
  assert.ok(s2.matureShare > 0);
  assert.ok(s2.oldestActiveDays >= 0);
});

test('fmtIdeaLine / fmtDueRelative / hashStr：展示层', () => {
  const idea = mkIdea({ title: '星空屏保', tags: ['屏保'], kind: 'idea' });
  const line = core.fmtIdeaLine(idea, NOW);
  assert.ok(line.includes('星空屏保') && line.includes('种子') && line.includes('#屏保'));
  assert.ok(line.includes('3 天后'));
  assert.equal(core.fmtDueRelative(NOW + 3 * DAY, NOW), '3 天后');
  assert.equal(core.fmtDueRelative(NOW - 2 * DAY, NOW), '逾期 2 天');
  assert.equal(core.hashStr('abc'), core.hashStr('abc'));
  assert.notEqual(core.hashStr('abc'), core.hashStr('abd'));
  assert.ok(core.fmtDay(NOW).match(/^\d{4}-\d{2}-\d{2}$/));
});
