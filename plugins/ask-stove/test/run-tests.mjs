/**
 * 问灶离线单元测试（node test/run-tests.mjs，不需要 Polaris 在跑）
 *
 * 覆盖 shared/stove-core.js：名称归一与同义词、用料匹配、设置/库存/菜谱/
 * 计划/采购/历史归一、临期边界、灶签评分与理由、采购聚合与去重、浪费统计、
 * 日期工具。
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/stove-core.js');

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, pass: false });
    console.error(`✗ ${name}\n    ${e.message}`);
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

const DAY = 86400 * 1000;

// ── 名称归一 ────────────────────────────────────────────────────────────────
test('normName：全角/大小写/空白/括注/分隔符归一', () => {
  eq(core.normName('Ｔｏｍａｔｏ'), 'tomato');
  eq(core.normName(' 肥牛卷（火锅用） '), '肥牛卷');
  eq(core.normName('A-Grade 米'), 'agrade米');
  eq(core.normName('生　粉'), '玉米淀粉', '全角空格+同义词到组首词');
  eq(core.normName(''), '');
});

test('normName：同义词组映射到组首词', () => {
  eq(core.normName('西红柿'), '番茄');
  eq(core.normName('马铃薯'), '土豆');
  eq(core.normName('麻油'), '香油');
  eq(core.normName('Carrot'), 'carrot', '非中文词不映射');
});

test('ingredientHit：归一相等/双向包含/短词不误伤', () => {
  ok(core.ingredientHit('西红柿', '番茄'), '同义');
  ok(core.ingredientHit('小葱', '香葱'), '双向包含');
  ok(core.ingredientHit('肥牛卷（火锅用）', '肥牛卷'), '括注归一');
  ok(!core.ingredientHit('排骨', '排叉'), '短词不误伤');
  ok(!core.ingredientHit('鸡蛋', '鸭蛋'), '不同物');
  ok(!core.ingredientHit('', '鸡蛋'), '空名不命中');
});

// ── 设置 ────────────────────────────────────────────────────────────────────
test('normalizeSettings：空入参得默认，越界钳制', () => {
  eq(core.normalizeSettings(undefined).settings, { v: 1, expiringDays: 5, suggestCount: 3 });
  const r = core.normalizeSettings({ expiringDays: 999, suggestCount: 0 });
  eq(r.settings.expiringDays, 30, '上界 30');
  eq(r.settings.suggestCount, 1, '下界 1');
});
test('normalizeSettings：非法类型报错', () => {
  ok(core.normalizeSettings('x').error, '字符串拒绝');
  ok(core.normalizeSettings([1]).error, '数组拒绝');
});

// ── 库存 ────────────────────────────────────────────────────────────────────
test('normalizePantryItem：合法入库 + expiresAt 日期解释为当天末', () => {
  const r = core.normalizePantryItem({ name: '排骨', qty: 2, unit: '斤', location: 'fridge', expiresAt: '2026-11-01' });
  ok(!r.error, r.error);
  eq(r.item.norm, '排骨');
  eq(r.item.location, 'fridge');
  const d = new Date(r.item.expiresAt);
  eq(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, '2026-11-1');
  eq(d.getHours(), 23, '当天 23:59:59 —— 整天算未过期');
});
test('normalizePantryItem：非法 qty/过期值/超长名报错', () => {
  ok(core.normalizePantryItem({ name: 'x', qty: 'abc' }).error, 'qty 非数');
  ok(core.normalizePantryItem({ name: 'x', qty: -1 }).error, 'qty 负');
  ok(core.normalizePantryItem({ name: 'x', expiresAt: ' Nov 1 ' }).error, 'expiresAt 非法');
  ok(core.normalizePantryItem({ name: '长'.repeat(41) }).error, 'name 超长');
  ok(core.normalizePantryItem({}).error, 'name 缺');
  ok(core.normalizePantryItem({ name: 'x', location: 'moon' }).item.location === 'fridge', '未知分区回 fridge');
});
test('normalizePantry：读侧防御，保留原 id，补 norm', () => {
  const p = core.normalizePantry({ items: [
    { id: 'keep1', name: '番茄' },
    { name: '' },           // 无名丢弃
    null,                   // 非对象丢弃
    { id: 'keep2', name: '土豆', location: 'dry' },
  ] });
  eq(p.items.map((x) => x.id), ['keep1', 'keep2']);
  eq(p.items[0].norm, '番茄');
});

// ── 临期 ────────────────────────────────────────────────────────────────────
test('isExpired/isExpiring/expiringItems：边界与排序（过期最先）', () => {
  const now = new Date('2026-10-28T10:00:00').getTime();
  ok(!core.isExpired({ expiresAt: now + DAY }, now), '明天未过期');
  ok(core.isExpired({ expiresAt: now - 1 }, now), '刚过期');
  ok(core.isExpiring({ expiresAt: now + 5 * DAY }, 5, now), '窗口边界含第 5 天');
  ok(!core.isExpiring({ expiresAt: now + 6 * DAY }, 5, now), '窗口外不算');
  const p = { items: [
    { id: 'a', name: 'A', expiresAt: now + DAY },
    { id: 'b', name: 'B', expiresAt: now - DAY },
    { id: 'c', name: 'C', expiresAt: null },
    { id: 'd', name: 'D', expiresAt: now + 2 * DAY },
  ] };
  eq(core.expiringItems(p, 5, now).map((x) => x.id), ['b', 'a', 'd'], '过期在前，其余按时间升序；无期限不出榜');
});

// ── 菜谱 ────────────────────────────────────────────────────────────────────
test('normalizeRecipe：用料归一/步骤截断/缺料报错', () => {
  const r = core.normalizeRecipe({
    name: '番茄炒蛋', minutes: 9999, tags: ['快手', '', '快手'],
    ingredients: [{ name: '西红柿', qty: 2, unit: '个' }, { name: '蛋' }, { name: '' }],
    steps: ['切块', '步'.repeat(600), '炒'],
  });
  ok(!r.error, r.error);
  eq(r.recipe.minutes, 1440, '分钟钳到上限');
  eq(r.recipe.tags, ['快手'], '标签去空去重');
  eq(r.recipe.ingredients.map((x) => x.norm), ['番茄', '鸡蛋'], '用料名归一+丢空（到组首词）');
  eq(r.recipe.steps.length, 3, '空白步过滤，实步保留');
  eq(r.recipe.steps[1].length, core.RECIPE_STEP_CAP, '单步截断到上限');
  ok(core.normalizeRecipe({ name: 'x', ingredients: [], steps: ['a'] }).error, '用料空报错');
  ok(core.normalizeRecipe({ name: 'x', ingredients: [{ name: 'a' }], steps: [] }).error, '步骤空报错');
});
test('normalizeRecipeBook：order 对齐 + cap 保新 + 同 id 归一', () => {
  const mk = (id, name) => ({ id, name, minutes: 10, tags: [], ingredients: [{ name }], steps: ['s'], createdAt: 1 });
  const byId = { a: mk('a', 'A'), b: mk('b', 'B'), c: mk('c', 'C'), d: mk('d', 'D') };
  const book = core.normalizeRecipeBook({ order: ['a', 'b', 'b', 'x', 'c'], byId });
  eq(book.order, ['a', 'b', 'c', 'd'], '去重去悬空，byId 孤儿追加');
  // cap：塞 205 条只留最后 200
  const big = { order: [], byId: {} };
  for (let i = 0; i < 205; i++) { big.order.push(`r${i}`); big.byId[`r${i}`] = mk(`r${i}`, `菜${i}`); }
  const capped = core.normalizeRecipeBook(big);
  eq(capped.order.length, core.RECIPE_CAP);
  eq(capped.order[0], 'r5', '保新（旧的被裁）');
});

// ── 计划 ────────────────────────────────────────────────────────────────────
test('normalizePlan：窗口裁剪 + 非法项丢弃 + 空项不保留', () => {
  const now = new Date('2026-10-28T10:00:00').getTime();
  const today = core.dayKey(now);
  const far = core.dayShift(today, 90);
  const p = core.normalizePlan({ days: {
    [today]: { recipeId: 'r1', note: null },
    [far]: { recipeId: 'r2', note: null },          // 超窗丢弃
    '2026-13-40': { recipeId: 'r3', note: null },   // 非法日期丢弃
    [core.dayShift(today, 1)]: { recipeId: null, note: null }, // 空项丢弃
    [core.dayShift(today, 2)]: { recipeId: null, note: '外卖' },
  } }, now);
  eq(Object.keys(p.days).sort(), [core.dayShift(today, 2), today].sort());
  eq(p.days[today].recipeId, 'r1');
  eq(p.days[core.dayShift(today, 2)].note, '外卖');
});

// ── 采购 ────────────────────────────────────────────────────────────────────
test('categorize：动线分类', () => {
  eq(core.categorize('三文鱼'), 'seafood');
  eq(core.categorize('大虾'), 'seafood');
  eq(core.categorize('排骨'), 'meat');
  eq(core.categorize('鸡蛋'), 'meat');
  eq(core.categorize('大米'), 'staple');
  eq(core.categorize('挂面'), 'staple');
  eq(core.categorize('生抽'), 'condiment');
  eq(core.categorize('番茄'), 'veg');
  eq(core.categorize('纸巾'), 'other', '关键词全不中');
});
test('normalizeShopping：同名未完成去重（保留早的），已完成不参与去重', () => {
  const now = Date.now();
  const s = core.normalizeShopping({ items: [
    { id: '1', name: '排骨', addedAt: 1 },
    { id: '2', name: '肋排', addedAt: 2 },        // 同义 → 去重
    { id: '3', name: '排骨', done: true, addedAt: 3 },
    { id: '4', name: '牛奶', addedAt: 4 },
  ] }, now);
  eq(s.items.map((x) => x.id), ['1', '3', '4'], '同义未完成只留第一条；已完成保留');
});

// ── 历史 ────────────────────────────────────────────────────────────────────
test('pushHistory：追加 + FIFO cap + 非法类型兜底', () => {
  let h = { v: 1, events: [] };
  for (let i = 0; i < core.HISTORY_CAP + 5; i++) {
    h = core.pushHistory(h, { type: 'consume', name: `n${i}` }, 1000 + i);
  }
  eq(h.events.length, core.HISTORY_CAP);
  eq(h.events[0].name, 'n5', '裁掉最旧');
  eq(h.events.at(-1).name, `n${core.HISTORY_CAP + 4}`);
  const bad = core.pushHistory({ events: [] }, { type: 'wat', name: '' });
  eq(bad.events.length, 0, '无名事件丢弃');
});

// ── 灶签 ────────────────────────────────────────────────────────────────────
function fixture() {
  const now = Date.now();
  const pantry = { items: [
    { id: 'p1', name: '番茄', location: 'fridge', expiresAt: now + 2 * DAY },
    { id: 'p2', name: '鸡蛋', location: 'fridge', expiresAt: now + 3 * DAY },
    { id: 'p3', name: '青菜', location: 'fridge', expiresAt: now + 2 * DAY },
    { id: 'p4', name: '排骨', location: 'fridge', expiresAt: now - DAY }, // 过期不参与命中
  ] };
  const recipes = {
    order: ['r_tomato', 'r_meat', 'r_green'],
    byId: {
      r_tomato: { id: 'r_tomato', name: '番茄炒蛋', minutes: 10, tags: ['快手'], ingredients: [{ name: '番茄', norm: '番茄' }, { name: '蛋', norm: '蛋' }], steps: ['s'], createdAt: 1 },
      r_meat: { id: 'r_meat', name: '红烧排骨', minutes: 60, tags: ['硬菜'], ingredients: [{ name: '排骨', norm: '排骨' }, { name: '土豆', norm: '土豆' }], steps: ['s'], createdAt: 1 },
      r_green: { id: 'r_green', name: '炒青菜', minutes: 10, tags: ['快手'], ingredients: [{ name: '青菜', norm: '青菜' }], steps: ['s'], createdAt: 1 },
    },
  };
  return { now, pantry, recipes };
}

test('scoreRecipe：临期命中加分、缺料扣分、理由可解释', () => {
  const { pantry, recipes } = fixture();
  const s1 = core.scoreRecipe(recipes.byId.r_tomato, pantry, { events: [] }, { expiringDays: 5 }, Date.now());
  ok(s1.score > 0, `临期番茄应加分：score=${s1.score}`);
  ok(s1.hitExpiring.includes('番茄'), '记录临期命中名');
  eq(s1.missing, [], '料全');
  ok(s1.reasons.some((r) => r.includes('临期的番茄')), '理由点名临期食材');
  const s2 = core.scoreRecipe(recipes.byId.r_meat, pantry, { events: [] }, { expiringDays: 5 }, Date.now());
  eq(s2.hitExpiring, [], '过期排骨不算命中');
  eq(s2.missing.length, 2, '排骨过期视为缺料');
  ok(s2.score < s1.score, '缺料多分低');
  ok(s2.reasons.some((r) => r.includes('缺')), '缺料理由');
});

test('suggestServing：缺料过半落榜 + 近 7 天做过降权', () => {
  const { pantry, recipes } = fixture();
  const now = Date.now();
  const top1 = core.suggestServing(recipes, pantry, { events: [] }, { expiringDays: 5, suggestCount: 3 }, now);
  eq(top1[0].recipe.id, 'r_tomato', '临期+料全者第一');
  ok(!top1.some((s) => s.recipe.id === 'r_meat'), '缺料过半（2/2）落榜');
  // 近做过：青菜 7 天内做过 → 排序应跌出第一
  const history = { events: [{ at: now - DAY, type: 'cook', name: '炒青菜', recipeId: 'r_green' }] };
  const top2 = core.suggestServing(recipes, pantry, history, { expiringDays: 5, suggestCount: 3 }, now);
  ok(top2[0].recipe.id !== 'r_green', '近做过不上第一');
  ok(top2.find((s) => s.recipe.id === 'r_green')?.reasons.some((r) => r.includes('最近做过')), '降权理由可见');
});

test('suggestServing：jitter 同日同菜稳定，跨日变化', () => {
  const a = core.scoreRecipe(fixture().recipes.byId.r_tomato, fixture().pantry, { events: [] }, {}, Date.now());
  const b = core.scoreRecipe(fixture().recipes.byId.r_tomato, fixture().pantry, { events: [] }, {}, Date.now());
  eq(a.score, b.score, '同日同菜同分（确定性）');
});

// ── 采购聚合 ────────────────────────────────────────────────────────────────
test('fillFromPlan + mergeShopping：扣在库/去重/分类/fromPlan 标记', () => {
  const now = Date.now();
  const today = core.dayKey(now);
  // r_ghost 刻意不存在于菜谱书：悬空引用要被跳过并说明
  const plan = { v: 1, days: { [today]: { recipeId: 'r1', note: null }, [core.dayShift(today, 3)]: { recipeId: 'r_ghost', note: null } } };
  const recipes = { v: 1, order: ['r1'], byId: {
    r1: { id: 'r1', name: '番茄排骨汤', minutes: 40, tags: [], ingredients: [
      { name: '番茄', norm: '番茄', qty: 2, unit: '个' },
      { name: '排骨', norm: '排骨', qty: 1, unit: '斤' },
      { name: '生姜', norm: '生姜', qty: null, unit: '' },
    ], steps: ['s'], createdAt: 1 },
  } };
  const pantry = { v: 1, items: [{ id: 'p1', name: '番茄', location: 'fridge', expiresAt: now + 10 * DAY }] };
  const agg = core.fillFromPlan(plan, recipes, pantry, now);
  eq(agg.items.map((x) => x.name).sort(), ['生姜', '排骨'].sort(), '在库番茄被扣掉；过期/缺料进清单');
  ok(agg.items.every((x) => x.fromPlan), '标记 fromPlan');
  eq(agg.skipped, [{ day: core.dayShift(today, 3), reason: '菜谱不存在' }], '悬空计划跳过并说明');
  eq(core.categorize(agg.items.find((x) => x.name === '排骨').name), 'meat');
  // merge：与已有未完成「肋排」同义去重
  const list = { v: 1, items: [{ id: 's1', name: '肋排', norm: '排骨', category: 'meat', done: false, addedAt: 1, fromPlan: false }] };
  const added = core.mergeShopping(list, agg.items, now);
  eq(added.map((x) => x.name), ['生姜'], '同义已在不重复加');
});

// ── 浪费统计 ────────────────────────────────────────────────────────────────
test('wasteStats：浪费率/top/周桶', () => {
  const now = Date.now();
  const HOUR = 3600 * 1000;
  // 全部事件落在今天（同一天必然同周桶），避免跨周边界让断言依赖星期几
  const events = [];
  for (let i = 0; i < 7; i++) events.push({ at: now - i * HOUR, type: 'consume', name: `e${i}` });
  for (let i = 0; i < 3; i++) events.push({ at: now - i * HOUR, type: 'discard', name: i < 2 ? '青菜' : '豆腐' });
  events.push({ at: now - 400 * DAY, type: 'consume', name: '远古' }); // 窗口外
  const s = core.wasteStats({ v: 1, events }, 30, now);
  eq(s.used, 7);
  eq(s.discarded, 3);
  eq(s.wasteRate, 30);
  eq(s.topDiscarded[0], { name: '青菜', count: 2 });
  eq(s.weeks.length, 12);
  eq(s.weeks[11].used + s.weeks[11].discarded, 10, '今天的事件全部落入本周桶');
  ok(s.weeks[0].used + s.weeks[0].discarded === 0, '12 周前无事件');
  ok(s.weeks[10].used === 0, '远古事件被窗口与周桶双重排除');
});

// ── 日期 ────────────────────────────────────────────────────────────────────
test('dayKey/dayShift/isValidDayKey', () => {
  const t = new Date(2026, 9, 28, 10, 30).getTime();
  eq(core.dayKey(t), '2026-10-28');
  eq(core.dayShift('2026-10-28', 4), '2026-11-01', '跨月进位');
  eq(core.dayShift('2026-10-28', -28), '2026-09-30', '跨月退位');
  ok(core.isValidDayKey('2026-10-28'));
  ok(!core.isValidDayKey('2026-13-01'));
  ok(!core.isValidDayKey(''));
});

// ── 汇总 ───────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length > 0) process.exit(1);
