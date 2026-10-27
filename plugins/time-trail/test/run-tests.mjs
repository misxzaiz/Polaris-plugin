#!/usr/bin/env node
/**
 * 刻漏纯函数单测（node test/run-tests.mjs）
 * 覆盖 shared/trail-core.js：键/归集/合并/削顶/聚合/分类引擎/设置夹取/保留清扫
 */
import assert from 'node:assert';
import core from '../shared/trail-core.js';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, pass: false });
    console.log(`✗ ${name}\n    ${e.message}`);
  }
}

// ── 键与时间 ───────────────────────────────────────────────────────────────
test('dateKeyOf/hourOf 使用本地时间', () => {
  const ts = new Date(2026, 9, 28, 13, 45).getTime(); // 本地 2026-10-28 13:45
  assert.equal(core.dateKeyOf(ts), '2026-10-28');
  assert.equal(core.hourOf(ts), 13);
});

test('键构造与前缀', () => {
  assert.equal(core.K.day('2026-10-28'), 'timetrail.day.2026-10-28');
  assert.ok(core.K.day('2026-01-01').startsWith(core.K.dayPrefix));
  assert.ok(core.K.cmd('x').startsWith(core.K.cmdPrefix));
  assert.ok(core.K.result('x').startsWith(core.K.resultPrefix));
});

// ── appKey ─────────────────────────────────────────────────────────────────
test('appKeyOf：小写化 + 去 .exe', () => {
  assert.equal(core.appKeyOf('Code.EXE', ''), 'code');
  assert.equal(core.appKeyOf(' chrome ', ''), 'chrome');
});

test('appKeyOf：UWP 宿主回退标题（截断 24）', () => {
  assert.equal(core.appKeyOf('ApplicationFrameHost', '计算器'), '计算器');
  assert.equal(core.appKeyOf('applicationframehost.exe', 'X'.repeat(30)), 'x'.repeat(24));
  assert.equal(core.appKeyOf('applicationframehost', ''), 'applicationframehost');
});

// ── 分类引擎 ───────────────────────────────────────────────────────────────
test('classifyApp：内置精确命中', () => {
  assert.equal(core.classifyApp('code', {}), 'dev');
  assert.equal(core.classifyApp('wechat', {}), 'meet');
  assert.equal(core.classifyApp('chrome', {}), 'browse');
});

test('classifyApp：用户规则优先于内置', () => {
  assert.equal(core.classifyApp('code', { rules: [{ match: 'code', kind: 'exact', cat: 'play' }] }), 'play');
});

test('classifyApp：前缀最长赢（避开内置精确命中的应用）', () => {
  const rules = { rules: [{ match: 'mineapp', kind: 'prefix', cat: 'play' }, { match: 'mineapp-la', kind: 'prefix', cat: 'media' }] };
  assert.equal(core.classifyApp('mineapp-launcher', rules), 'media');
  assert.equal(core.classifyApp('mineapp-x', rules), 'play');
});

test('classifyApp：未知归 other；大小写不敏感', () => {
  assert.equal(core.classifyApp('totally-unknown-app', {}), 'other');
  assert.equal(core.classifyApp('CODE', {}), 'dev');
});

test('normalizeRules 丢弃非法项并补 kind 默认', () => {
  const rules = core.normalizeRules({ rules: [
    { match: 'CODE', cat: 'dev' },
    { match: '', cat: 'dev' },
    { match: 'x', cat: 'nope' },
    null,
    { match: 'y', kind: 'prefix', cat: 'play' },
  ] });
  assert.deepEqual(rules, [
    { match: 'code', kind: 'exact', cat: 'dev' },
    { match: 'y', kind: 'prefix', cat: 'play' },
  ]);
});

test('isKnownApp：exact/prefix/内置三路', () => {
  const rules = { rules: [{ match: 'myapp', kind: 'exact', cat: 'dev' }, { match: 'pref', kind: 'prefix', cat: 'play' }] };
  assert.equal(core.isKnownApp('myapp', rules), true);
  assert.equal(core.isKnownApp('prefix-thing', rules), true);
  assert.equal(core.isKnownApp('chrome', rules), true);
  assert.equal(core.isKnownApp('who-am-i', rules), false);
});

// ── 归集 ───────────────────────────────────────────────────────────────────
test('dayAdd：活跃归应用+小时桶，idle 归 _idle', () => {
  const day = core.emptyDay('2026-10-28');
  const ts = new Date(2026, 9, 28, 9, 0).getTime();
  core.dayAdd(day, { ts, sec: 60, app: 'code', idle: false });
  core.dayAdd(day, { ts, sec: 30, idle: true });
  assert.equal(day.apps.code, 60);
  assert.equal(day.hours[9].code, 60);
  assert.equal(day.hours[9]._idle, 30);
  assert.equal(day.idleSec, 30);
  assert.equal(day.firstAt, ts);
  assert.equal(day.lastAt, ts);
});

test('dayAdd：标题记录 + 80 字符截断 + 不传标题不记（开停由调用方门控）', () => {
  const day = core.emptyDay('2026-10-28');
  const ts = new Date(2026, 9, 28, 9, 0).getTime();
  core.dayAdd(day, { ts, sec: 10, app: 'code', title: 'T'.repeat(120), idle: false });
  const titles = Object.keys(day.titles.code);
  assert.equal(titles.length, 1);
  assert.equal(titles[0].length, core.TITLE_MAX);
  const day2 = core.emptyDay('2026-10-28');
  core.dayAdd(day2, { ts, sec: 10, app: 'code', idle: false });
  assert.equal(Object.keys(day2.titles).length, 0);
});

test('mergeDayInto：add 语义合并（apps/hours/titles/idle/switches/firstAt/lastAt）', () => {
  const t1 = new Date(2026, 9, 28, 9, 0).getTime();
  const t2 = new Date(2026, 9, 28, 10, 0).getTime();
  const a = core.emptyDay('2026-10-28');
  core.dayAdd(a, { ts: t1, sec: 50, app: 'code', title: 'A', idle: false });
  const b = core.emptyDay('2026-10-28');
  core.dayAdd(b, { ts: t2, sec: 70, app: 'code', title: 'B', idle: false });
  b.switches = 3;
  const merged = core.emptyDay('2026-10-28');
  core.mergeDayInto(merged, a);
  core.mergeDayInto(merged, b);
  assert.equal(merged.apps.code, 120);
  assert.equal(merged.hours[9].code, 50);
  assert.equal(merged.hours[10].code, 70);
  assert.equal(merged.titles.code.A, 50);
  assert.equal(merged.titles.code.B, 70);
  assert.equal(merged.switches, 3);
  assert.equal(merged.firstAt, t1);
  assert.equal(merged.lastAt, t2);
});

test('capTitles：每应用保留 top N（按时长）', () => {
  const day = core.emptyDay('2026-10-28');
  const ts = new Date(2026, 9, 28, 9, 0).getTime();
  day.titles.code = {};
  for (let i = 0; i < core.TITLES_PER_APP + 10; i++) {
    day.titles.code[`标题${i}`] = i + 1;
  }
  core.capTitles(day);
  assert.equal(Object.keys(day.titles.code).length, core.TITLES_PER_APP);
  // 最小者被淘汰
  assert.ok(!('标题0' in day.titles.code));
  assert.ok('标题49' in day.titles.code);
  void ts;
});

test('hydrateDay：非法输入回空天，合法输入补默认', () => {
  const d1 = core.hydrateDay(null, '2026-10-28');
  assert.equal(d1.apps && Object.keys(d1.apps).length, 0);
  assert.equal(d1.idleSec, 0);
  const d2 = core.hydrateDay({ apps: { code: 5 }, idleSec: 2, switches: 1 }, '2026-10-28');
  assert.equal(d2.apps.code, 5);
  assert.equal(d2.date, '2026-10-28');
  const d3 = core.hydrateDay('garbage', '2026-10-28');
  assert.deepEqual(d3.apps, {});
});

test('hasDayContent：空缓冲 false，有量 true', () => {
  assert.equal(core.hasDayContent(core.emptyDay('x')), false);
  const d = core.emptyDay('x');
  d.idleSec = 1;
  assert.equal(core.hasDayContent(d), true);
  const d2 = core.emptyDay('x');
  d2.hours[9] = {};
  assert.equal(core.hasDayContent(d2), false); // 完全空桶不算内容
});

// ── 聚合 ───────────────────────────────────────────────────────────────────
test('aggregateDays：分类视图 + byDay + idle 不计入 total', () => {
  const ts = new Date(2026, 9, 28, 9, 0).getTime();
  const day = core.emptyDay('2026-10-28');
  core.dayAdd(day, { ts, sec: 100, app: 'code', idle: false });
  core.dayAdd(day, { ts, sec: 40, app: 'chrome', idle: false });
  core.dayAdd(day, { ts, sec: 60, idle: true });
  const agg = core.aggregateDays([day], {});
  assert.equal(agg.totalSec, 140);
  assert.equal(agg.idleSec, 60);
  assert.equal(agg.byCat.dev, 100);
  assert.equal(agg.byCat.browse, 40);
  assert.equal(agg.byDay['2026-10-28'].totalSec, 140);
  assert.equal(agg.byApp.code, 100);
});

test('aggregateDays：cat/app 过滤（第二参数 opts 内）', () => {
  const ts = new Date(2026, 9, 28, 9, 0).getTime();
  const day = core.emptyDay('2026-10-28');
  core.dayAdd(day, { ts, sec: 100, app: 'code', idle: false });
  core.dayAdd(day, { ts, sec: 40, app: 'chrome', idle: false });
  assert.equal(core.aggregateDays([day], { cat: 'dev' }).totalSec, 100);
  assert.equal(core.aggregateDays([day], { app: 'chrome' }).totalSec, 40);
  assert.equal(core.aggregateDays([day], { cat: 'media' }).totalSec, 0);
});

test('aggregateDays：规则改动对历史即时生效（裸数组与包装形态都收）', () => {
  const ts = new Date(2026, 9, 28, 9, 0).getTime();
  const day = core.emptyDay('2026-10-28');
  core.dayAdd(day, { ts, sec: 100, app: 'weirdapp', idle: false });
  assert.equal(core.aggregateDays([day], {}).byCat.other, 100);
  const agg2 = core.aggregateDays([day], { rules: [{ match: 'weirdapp', kind: 'exact', cat: 'media' }] });
  assert.equal(agg2.byCat.media, 100);
  assert.equal(agg2.byCat.other, undefined);
  const agg3 = core.aggregateDays([day], { rules: { rules: [{ match: 'weirdapp', kind: 'exact', cat: 'play' }] } });
  assert.equal(agg3.byCat.play, 100);
});

test('unknownApps：未分类按时长降序', () => {
  const ts = new Date(2026, 9, 28, 9, 0).getTime();
  const day = core.emptyDay('2026-10-28');
  core.dayAdd(day, { ts, sec: 30, app: 'code', idle: false });
  core.dayAdd(day, { ts, sec: 50, app: 'mystery-a', idle: false });
  core.dayAdd(day, { ts, sec: 10, app: 'mystery-b', idle: false });
  const list = core.unknownApps([day], {});
  assert.deepEqual(list, [{ app: 'mystery-a', sec: 50 }, { app: 'mystery-b', sec: 10 }]);
});

test('categoryBars：按耗时降序并带元数据', () => {
  const ts = new Date(2026, 9, 28, 9, 0).getTime();
  const day = core.emptyDay('2026-10-28');
  core.dayAdd(day, { ts, sec: 40, app: 'chrome', idle: false });
  core.dayAdd(day, { ts, sec: 100, app: 'code', idle: false });
  const agg = core.aggregateDays([day], {});
  const bars = core.categoryBars(agg);
  assert.equal(bars[0].cat, 'dev');
  assert.equal(bars[0].label, '开发');
  assert.equal(bars[1].cat, 'browse');
});

// ── 设置与清理 ──────────────────────────────────────────────────────────────
test('normalizeSettings：夹取 + 严格布尔契约', () => {
  const s = core.normalizeSettings({ tickSec: 999, idleSec: 1, retentionDays: 9999, captureTitles: true, paused: true });
  assert.deepEqual(s, { tickSec: 15, idleSec: 30, retentionDays: 365, captureTitles: true, paused: true });
  const s2 = core.normalizeSettings(null);
  assert.deepEqual(s2, { tickSec: 3, idleSec: 180, retentionDays: 90, captureTitles: false, paused: false });
  const s3 = core.normalizeSettings({ tickSec: 0, captureTitles: 'yes', paused: 1 });
  assert.equal(s3.tickSec, 2);   // 数值越界夹到下界；默认仅用于非数值
  assert.equal(s3.captureTitles, false); // 严格 === true 才开
  assert.equal(s3.paused, false);
  assert.equal(core.normalizeSettings({ tickSec: 'x' }).tickSec, 3); // 非数值回默认
});

test('isPrunable：保留窗边界', () => {
  const today = '2026-10-28';
  assert.equal(core.isPrunable(today, 7, today), false);
  assert.equal(core.isPrunable('2026-10-22', 7, today), false); // 第 7 天仍在窗内
  assert.equal(core.isPrunable('2026-10-21', 7, today), true);  // 第 8 天剪掉
  assert.equal(core.isPrunable('garbage', 7, today), true);
});

// ── 归因 ───────────────────────────────────────────────────────────────────
test('attributionSec：ms 换算秒 + 90s 截断 + 非法输入', () => {
  assert.equal(core.attributionSec(1000, 3000), 2);
  assert.equal(core.attributionSec(0, 91 * 1000), 90); // 截断
  assert.equal(core.attributionSec(0, 500), 0.5);      // 亚秒
  assert.equal(core.attributionSec(3000, 1000), 0);    // 倒序
  assert.equal(core.attributionSec(1000, 1000), 0);
  assert.equal(core.attributionSec(NaN, 2000), 0);
  // 回归：此前误用「ms 差 vs 90（秒）」取 min，任何 ≥90ms 间隙都记 90 秒
  assert.equal(core.attributionSec(0, 2000), 2);
  assert.notEqual(core.attributionSec(0, 2000), 90);
});

// ── 展示 ───────────────────────────────────────────────────────────────────
test('fmtDur 分级', () => {
  assert.equal(core.fmtDur(30), '30秒');
  assert.equal(core.fmtDur(90), '1分30秒');
  assert.equal(core.fmtDur(3600), '1小时');
  assert.equal(core.fmtDur(3720), '1小时2分');
  assert.equal(core.fmtDur(NaN), '0秒');
});

test('displayName 内置映射与兜底', () => {
  assert.equal(core.displayName('code'), 'VS Code');
  assert.equal(core.displayName('wechat'), '微信');
  assert.equal(core.displayName('mything'), 'Mything');
});

// ── 汇总 ───────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  process.exit(1);
}
