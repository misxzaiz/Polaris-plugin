/**
 * 观止核心单测（node test/run-tests.mjs，离线）
 * 全部显式合成日期（NOW=2026-10-29 本地正午），不依赖真实时钟。
 * 覆盖：日期工具/状态文案/归一化校验/状态-日期语义/补丁合并/判重检索/
 * 透视聚合/年报/推荐评分/CSV/批量导入/行文案。
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/guanzhi-core.js');

// 本地正午合成时间：跨时区稳定落在 2026-10-29
const NOW = new Date(2026, 9, 29, 12, 0, 0).getTime();
const TODAY = '2026-10-29';

let pass = 0; let fail = 0; const failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); } catch (e) { fail++; failures.push({ name, e }); console.error(`✗ ${name}\n  ${e.message}`); }
}

const ms = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).getTime();
const mkWork = (over = {}) => core.normalizeWork({ title: '测试作品', kind: 'movie', ...over }, NOW).work;

// ── 日期工具 ───────────────────────────────────────────────────────────────
t('todayStr 输出本地日期', () => {
  assert.equal(core.todayStr(NOW), TODAY);
});
t('parseYMD 合法/非法', () => {
  assert.deepEqual(core.parseYMD('2026-02-28'), { y: 2026, m: 2, d: 28 });
  assert.equal(core.parseYMD('2026-13-01'), null);
  assert.equal(core.parseYMD('2026/01/02'), null);
  assert.equal(core.parseYMD(''), null);
});
t('diffDays 跨年/同日', () => {
  assert.equal(core.diffDays('2026-10-29', '2027-01-01'), 64);
  assert.equal(core.diffDays('2026-10-29', '2026-10-29'), 0);
  assert.equal(core.diffDays('2026-10-29', '2026-10-01'), -28);
  assert.equal(core.diffDays('bad', TODAY), null);
});

// ── 状态文案 ───────────────────────────────────────────────────────────────
t('statusLabel 体裁感知', () => {
  assert.equal(core.statusLabel('book', 'wish'), '想读');
  assert.equal(core.statusLabel('book', 'active'), '在读');
  assert.equal(core.statusLabel('book', 'done'), '读完');
  assert.equal(core.statusLabel('movie', 'wish'), '想看');
  assert.equal(core.statusLabel('game', 'active'), '在玩');
  assert.equal(core.statusLabel('music', 'done'), '听完');
  assert.equal(core.statusLabel('podcast', 'active'), '在听');
  assert.equal(core.statusLabel('movie', 'dropped'), '弃了');
});

// ── 归一化校验 ─────────────────────────────────────────────────────────────
t('normalizeWork 缺 title 拒绝', () => {
  assert.ok(core.normalizeWork({ kind: 'movie' }, NOW).error.includes('title'));
});
t('normalizeWork title 过长拒绝', () => {
  assert.ok(core.normalizeWork({ title: 'x'.repeat(81), kind: 'movie' }, NOW).error.includes('title'));
});
t('normalizeWork 非法 kind 拒绝', () => {
  assert.ok(core.normalizeWork({ title: 'X', kind: 'drama' }, NOW).error.includes('kind'));
});
t('normalizeWork 缺 kind 拒绝（kind 必填）', () => {
  assert.ok(core.normalizeWork({ title: 'X' }, NOW).error.includes('kind'));
});
t('normalizeWork status 缺省 done', () => {
  assert.equal(mkWork().status, 'done');
});
t('normalizeWork rating 校验（负数/超界/字符串数字/舍入）', () => {
  assert.ok(core.normalizeWork({ title: 'X', kind: 'movie', rating: -1 }, NOW).error.includes('rating'));
  assert.ok(core.normalizeWork({ title: 'X', kind: 'movie', rating: 10.5 }, NOW).error.includes('rating'));
  assert.equal(mkWork({ rating: '8.5' }).rating, 8.5);
  assert.equal(mkWork({ rating: 9.55 }).rating, 9.6);
  assert.equal(mkWork({ rating: 0 }).rating, 0);
  assert.equal(mkWork({}).rating, undefined);
});
t('normalizeWork 日期格式与先后', () => {
  assert.ok(core.normalizeWork({ title: 'X', kind: 'movie', finishDate: '2026/01/02' }, NOW).error.includes('finishDate'));
  assert.ok(core.normalizeWork({ title: 'X', kind: 'movie', startDate: 'bad' }, NOW).error.includes('startDate'));
  assert.ok(core.normalizeWork({ title: 'X', kind: 'movie', startDate: '2026-10-01', finishDate: '2026-09-30' }, NOW).error.includes('不能早于'));
  assert.equal(mkWork({ startDate: '2026-10-01', finishDate: '2026-10-01' }).finishDate, '2026-10-01');
});
t('normalizeWork year 范围', () => {
  assert.ok(core.normalizeWork({ title: 'X', kind: 'movie', year: 1899 }, NOW).error.includes('year'));
  assert.ok(core.normalizeWork({ title: 'X', kind: 'movie', year: 2101 }, NOW).error.includes('year'));
  assert.equal(mkWork({ year: '2023' }).year, 2023);
});
t('normalizeWork link 必须 http(s)', () => {
  assert.ok(core.normalizeWork({ title: 'X', kind: 'movie', link: 'ftp://x' }, NOW).error.includes('link'));
  assert.equal(mkWork({ link: 'https://movie.douban.com/x' }).link, 'https://movie.douban.com/x');
});
t('normalizeWork 长度上限（creator/genre/note）', () => {
  assert.ok(core.normalizeWork({ title: 'X', kind: 'movie', creator: 'c'.repeat(61) }, NOW).error.includes('creator'));
  assert.ok(core.normalizeWork({ title: 'X', kind: 'movie', genre: 'g'.repeat(31) }, NOW).error.includes('genre'));
  assert.ok(core.normalizeWork({ title: 'X', kind: 'movie', note: 'n'.repeat(501) }, NOW).error.includes('note'));
});
t('normalizeWork favorite 仅 true 落库', () => {
  assert.equal(mkWork({ favorite: true }).favorite, true);
  assert.equal(mkWork({ favorite: 'yes' }).favorite, undefined);
});

// ── 状态-日期语义 ──────────────────────────────────────────────────────────
t('autoDates：done 缺完成日记今天', () => {
  assert.equal(mkWork({}).finishDate, TODAY);
});
t('autoDates：done 显式完成日保留', () => {
  assert.equal(mkWork({ finishDate: '2026-10-01' }).finishDate, '2026-10-01');
});
t('autoDates：active 缺开始日记今天、清完成日', () => {
  const w = mkWork({ status: 'active', finishDate: '2026-09-01' });
  assert.equal(w.startDate, TODAY);
  assert.equal(w.finishDate, undefined);
});
t('autoDates：wish 清掉起止日', () => {
  const w = mkWork({ status: 'wish', startDate: '2026-10-01', finishDate: '2026-10-02' });
  assert.equal(w.startDate, undefined);
  assert.equal(w.finishDate, undefined);
});
t('autoDates：dropped 保留日期', () => {
  const w = mkWork({ status: 'dropped', startDate: '2026-10-01', finishDate: '2026-10-02' });
  assert.equal(w.startDate, '2026-10-01');
  assert.equal(w.finishDate, '2026-10-02');
});
t('autoDates=false（导入）：缺完成日不盖今天', () => {
  const norm = core.normalizeWork({ title: '旧书', kind: 'book', status: 'done' }, NOW, { autoDates: false });
  assert.equal(norm.work.finishDate, undefined);
  assert.equal(norm.work.startDate, undefined);
});

// ── 补丁合并 ───────────────────────────────────────────────────────────────
t('applyPatch 白名单合并 + 校验', () => {
  const w = mkWork({ rating: 7 });
  const r = core.applyPatch(w, { rating: 9, note: '重看仍神作', hackerField: 1 }, NOW);
  assert.equal(r.work.rating, 9);
  assert.equal(r.work.note, '重看仍神作');
  assert.equal(r.work.hackerField, undefined);
  const bad = core.applyPatch(w, { rating: 11 }, NOW);
  assert.ok(bad.error.includes('rating'));
});
t('applyPatch wish→done：完成日记今天', () => {
  const w = mkWork({ status: 'wish' });
  const r = core.applyPatch(w, { status: 'done' }, NOW);
  assert.equal(r.work.status, 'done');
  assert.equal(r.work.finishDate, TODAY);
});
t('applyPatch done→active：清完成日、补开始日', () => {
  const w = mkWork({ status: 'done', finishDate: '2026-10-01' });
  const r = core.applyPatch(w, { status: 'active' }, NOW);
  assert.equal(r.work.finishDate, undefined);
  assert.equal(r.work.startDate, TODAY);
});
t('applyPatch →wish：清日期', () => {
  const w = mkWork({ status: 'done', finishDate: '2026-10-01' });
  const r = core.applyPatch(w, { status: 'wish' }, NOW);
  assert.equal(r.work.finishDate, undefined);
  assert.equal(r.work.startDate, undefined);
});
t('applyPatch rating null 清除评分', () => {
  const w = mkWork({ rating: 8 });
  const r = core.applyPatch(w, { rating: null }, NOW);
  assert.equal(r.work.rating, undefined);
});
t('applyPatch favorite false 清除', () => {
  const w = mkWork({ favorite: true });
  const r = core.applyPatch(w, { favorite: false }, NOW);
  assert.equal(r.work.favorite, undefined);
});
t('applyPatch updatedAt 刷新、createdAt 保留', () => {
  const w = mkWork({ createdAt: ms(2020, 1, 1) });
  const r = core.applyPatch(w, { note: 'x' }, NOW);
  assert.equal(r.work.createdAt, ms(2020, 1, 1));
  assert.equal(r.work.updatedAt, NOW);
});

// ── 判重检索 ───────────────────────────────────────────────────────────────
t('findSameWork：压缩空白+忽略大小写，同体裁才匹配', () => {
  const a = mkWork({ title: '流浪地球 2' });
  const list = [a, mkWork({ title: '流浪地球2', kind: 'book', id: 'gw_other' })];
  assert.equal(core.findSameWork(list, 'movie', '  流浪地球2 ').id, a.id);
  assert.equal(core.findSameWork(list, 'movie', '流浪地球2'.toUpperCase()).id, a.id);
  assert.equal(core.findSameWork(list, 'book', '流浪地球2').id, 'gw_other');
  assert.equal(core.findSameWork(list, 'movie', '沙丘'), null);
});
t('findSameWork 多条命中取最近更新', () => {
  const old = core.normalizeWork({ title: '三体', kind: 'book' }, NOW - 1000).work;
  const neu = core.normalizeWork({ title: '三体', kind: 'book', id: 'gw_neu' }, NOW).work;
  assert.equal(core.findSameWork([old, neu], 'book', '三体').id, 'gw_neu');
});
t('searchWorks：子串/过滤/排序/limit', () => {
  const w1 = core.normalizeWork({ title: '沙丘', kind: 'movie', genre: '科幻', note: '视听盛宴', updatedAt: NOW - 100 }, NOW).work;
  const w2 = core.normalizeWork({ title: '三体', kind: 'book', creator: '刘慈欣', favorite: true, updatedAt: NOW }, NOW).work;
  const w3 = core.normalizeWork({ title: '沙丘2', kind: 'movie', status: 'wish', updatedAt: NOW - 50 }, NOW).work;
  const list = [w1, w2, w3];
  assert.equal(core.searchWorks(list, { query: '沙' }).length, 2);
  assert.equal(core.searchWorks(list, { query: '刘慈欣' })[0].id, w2.id);
  assert.equal(core.searchWorks(list, { query: '科幻' })[0].id, w1.id);
  assert.equal(core.searchWorks(list, { kind: 'movie', status: 'done' }).length, 1);
  assert.equal(core.searchWorks(list, { favorite: true })[0].id, w2.id);
  assert.equal(core.searchWorks(list, { year: 9999 }).length, 0);
  const sorted = core.searchWorks(list, {});
  assert.equal(sorted[0].id, w2.id, '按最近更新排序');
  assert.equal(core.searchWorks(list, { limit: 2 }).length, 2);
});

// ── 透视聚合 ───────────────────────────────────────────────────────────────
t('computeOverview 计数/排序/均值/评分档/心头好', () => {
  const works = [
    core.normalizeWork({ title: 'A', kind: 'movie', status: 'active', startDate: '2026-10-20' }, NOW).work,
    core.normalizeWork({ title: 'B', kind: 'movie', status: 'active', startDate: '2026-10-25' }, NOW).work,
    core.normalizeWork({ title: 'C', kind: 'book', finishDate: '2026-10-01', rating: 9 }, NOW).work,
    core.normalizeWork({ title: 'D', kind: 'movie', finishDate: '2026-10-15', rating: 6, favorite: true }, NOW).work,
    core.normalizeWork({ title: 'E', kind: 'game', status: 'wish', createdAt: ms(2025, 3, 1) }, NOW).work,
    core.normalizeWork({ title: 'F', kind: 'tv', status: 'dropped' }, NOW).work,
    core.normalizeWork({ title: 'G', kind: 'book', finishDate: '2025-12-31', rating: 8 }, NOW).work,
  ];
  const ov = core.computeOverview(works, TODAY);
  assert.equal(ov.total, 7);
  assert.deepEqual(ov.byStatus, { wish: 1, active: 2, done: 3, dropped: 1 });
  assert.equal(ov.activeList[0].title, 'A', '进行中按开始日升序');
  assert.equal(ov.recentDone[0].title, 'D', '最近完成按完成日降序');
  assert.equal(ov.wishOldest[0].title, 'E');
  assert.equal(ov.thisYearDone, 2);
  assert.equal(ov.thisMonthDone, 2);
  assert.equal(ov.avgRating, 7.7, '(9+6+8)/3=7.67→7.7');
  assert.ok(ov.avgByKind.find((k) => k.kind === 'movie' && k.count === 1 && k.avg === 6));
  assert.equal(ov.ratingBands['9-10'], 1);
  assert.equal(ov.ratingBands['7-8'], 1);
  assert.equal(ov.ratingBands['5-6'], 1);
  assert.equal(ov.favoriteCount, 1);
});
t('computeOverview 空账本', () => {
  const ov = core.computeOverview([], TODAY);
  assert.equal(ov.total, 0);
  assert.equal(ov.avgRating, null);
  assert.deepEqual(ov.ratingBands, { '9-10': 0, '7-8': 0, '5-6': 0, '≤4': 0, 未评: 0 });
});

// ── 年报 ───────────────────────────────────────────────────────────────────
t('computeYearReport 完成数/分体裁/月度/评分档/十佳/心头好/最长短评/跨年遗留', () => {
  const works = [
    core.normalizeWork({ title: '甲', kind: 'movie', finishDate: '2026-01-05', rating: 9.5, note: '短', creator: '郭帆', year: 2023 }, NOW).work,
    core.normalizeWork({ title: '乙', kind: 'movie', finishDate: '2026-01-20', rating: 9.5, note: '这里是一条非常长的短评，用来测试最长短评的挑选逻辑是否正确。' }, NOW).work,
    core.normalizeWork({ title: '丙', kind: 'book', finishDate: '2026-03-11', rating: 8, favorite: true }, NOW).work,
    core.normalizeWork({ title: '丁', kind: 'game', finishDate: '2026-08-02', rating: 4 }, NOW).work,
    core.normalizeWork({ title: '戊', kind: 'movie', finishDate: '2025-12-01', rating: 10 }, NOW).work, // 去年
    core.normalizeWork({ title: '己', kind: 'movie', status: 'wish', createdAt: ms(2024, 6, 1) }, NOW).work, // 跨年遗留
    core.normalizeWork({ title: '庚', kind: 'movie', finishDate: '2026-02-02' }, NOW).work, // 未评
  ];
  const yr = core.computeYearReport(works, '2026');
  assert.equal(yr.doneCount, 5);
  assert.equal(yr.ratedCount, 4);
  assert.equal(yr.avgRating, 7.8, '(9.5+9.5+8+4)/4=7.75→7.8');
  const movieKind = yr.perKind.find((k) => k.kind === 'movie');
  assert.equal(movieKind.count, 3);
  assert.equal(movieKind.avg, 9.5, '(9.5+9.5)/2 未评不算');
  assert.equal(yr.monthly[0].count, 2);
  assert.equal(yr.monthly[2].count, 1);
  assert.equal(yr.monthly[11].count, 0);
  assert.equal(yr.ratingBands['9-10'], 2);
  assert.equal(yr.ratingBands['7-8'], 1);
  assert.equal(yr.ratingBands['≤4'], 1);
  assert.equal(yr.top[0].title, '乙', '同分按完成日新者在先');
  assert.equal(yr.top.length, 4);
  assert.equal(yr.favorites.length, 1);
  assert.equal(yr.longestNote.title, '乙');
  assert.equal(yr.wishCarryover, 1);
});
t('computeYearReport 空年份', () => {
  const yr = core.computeYearReport([], '1999');
  assert.equal(yr.doneCount, 0);
  assert.equal(yr.longestNote, null);
  assert.equal(yr.top.length, 0);
});

// ── 推荐 ───────────────────────────────────────────────────────────────────
t('recommend：continueList 来自 active（开始日升序），picks 来自 wish', () => {
  const works = [
    core.normalizeWork({ title: '看一半', kind: 'book', status: 'active', startDate: '2026-10-01' }, NOW).work,
    core.normalizeWork({ title: '旧心愿', kind: 'movie', status: 'wish', createdAt: ms(2026, 1, 1) }, NOW).work,
    core.normalizeWork({ title: '新心愿', kind: 'movie', status: 'wish', createdAt: ms(2026, 10, 28) }, NOW).work,
    core.normalizeWork({ title: '已看完', kind: 'movie', finishDate: '2026-10-01' }, NOW).work,
  ];
  const rec = core.recommend(works, TODAY, {});
  assert.equal(rec.continueList.length, 1);
  assert.equal(rec.continueList[0].daysOpen, 28);
  assert.equal(rec.picks.length, 2);
  assert.ok(rec.picks.every((p) => ['旧心愿', '新心愿'].includes(p.title)));
  assert.equal(rec.picks.find((p) => p.title === '旧心愿').reason.includes('压在清单里'), true, '躺龄≥60天给压清单理由');
  assert.equal(rec.picks.find((p) => p.title === '新心愿').reason.includes('新成员'), true);
});
t('recommend：逐日确定（同日同结果），跨日可轮换；体裁过滤', () => {
  const works = [
    core.normalizeWork({ title: 'M1', kind: 'movie', status: 'wish', createdAt: ms(2026, 5, 1) }, NOW).work,
    core.normalizeWork({ title: 'M2', kind: 'movie', status: 'wish', createdAt: ms(2026, 5, 2) }, NOW).work,
    core.normalizeWork({ title: 'B1', kind: 'book', status: 'wish', createdAt: ms(2026, 5, 3) }, NOW).work,
  ];
  const r1 = core.recommend(works, TODAY, {});
  const r2 = core.recommend(works, TODAY, {});
  assert.deepEqual(r1.picks.map((p) => p.id), r2.picks.map((p) => p.id), '同日确定');
  const onlyBooks = core.recommend(works, TODAY, { kind: 'book' });
  assert.equal(onlyBooks.picks.length, 1);
  assert.equal(onlyBooks.picks[0].title, 'B1');
  const otherDay = core.recommend(works, '2026-10-30', {});
  assert.ok(Array.isArray(otherDay.picks), '跨日仍可计算');
});
t('recommend：口味画像（分体裁均分+高频类型，多分隔符拆分）', () => {
  const works = [
    core.normalizeWork({ title: 'A', kind: 'movie', finishDate: '2026-01-01', rating: 9, genre: '科幻,悬疑' }, NOW).work,
    core.normalizeWork({ title: 'B', kind: 'movie', finishDate: '2026-01-02', rating: 7, genre: '科幻/灾难' }, NOW).work,
    core.normalizeWork({ title: 'C', kind: 'book', finishDate: '2026-01-03', rating: 8, genre: '科幻、历史' }, NOW).work,
  ];
  const rec = core.recommend(works, TODAY, {});
  const movie = rec.taste.avgByKind.find((k) => k.kind === 'movie');
  assert.equal(movie.avg, 8);
  const sciFi = rec.taste.topGenres.find((g) => g.genre === '科幻');
  assert.equal(sciFi.count, 3);
});
t('recommend：count 钳制与空池', () => {
  const works = [core.normalizeWork({ title: 'X', kind: 'movie', finishDate: '2026-01-01' }, NOW).work];
  const rec = core.recommend(works, TODAY, { count: 99 });
  assert.equal(rec.picks.length, 0, 'done 不参与推荐');
  assert.equal(rec.continueList.length, 0);
});

// ── CSV 与导入 ─────────────────────────────────────────────────────────────
t('toCsv：BOM/表头/引号转义', () => {
  const w = core.normalizeWork({ title: '《沙"丘》,2', kind: 'movie', rating: 9, finishDate: '2026-10-01', note: '好看,"真的"' }, NOW).work;
  const csv = core.toCsv([w]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"kind","title","status","rating"'));
  assert.ok(csv.includes('"《沙""丘》,2"'));
  assert.ok(csv.includes('"好看,""真的"""'));
});
t('normalizeImport：判重/拒绝/上限/autoDates=false', () => {
  const dup = { title: '三体', kind: 'book', status: 'done', year: 2008 };
  const res = core.normalizeImport([
    dup,
    { ...dup, rating: 9 },
    { title: '', kind: 'book' },
    { title: 'X', kind: 'bad' },
    { title: '旧记录', kind: 'movie', status: 'done' },
    'not-an-object',
  ]);
  assert.equal(res.accepted.length, 2);
  assert.equal(res.duplicates, 1);
  assert.equal(res.rejected.length, 3);
  const old = res.accepted.find((w) => w.title === '旧记录');
  assert.equal(old.finishDate, undefined, '导入不做「缺完成日记今天」');
  assert.ok(core.normalizeImport(new Array(501).fill(dup)).error.includes('500'));
  const empty = core.normalizeImport([]);
  assert.equal(empty.accepted.length, 0);
  assert.equal(empty.error, undefined);
});
t('normalizeImport：与既有账本判重（同年同体裁同名跳过）', () => {
  const existing = [core.normalizeWork({ title: '三体', kind: 'book', year: 2008 }, NOW).work];
  const res = core.normalizeImport([
    { title: '三体', kind: 'book', status: 'done', year: 2008 },
    { title: '三体', kind: 'book', status: 'done' },
    { title: '三体 2', kind: 'book', year: 2008 },
    { title: '三体', kind: 'movie', year: 2008 },
  ], existing);
  assert.equal(res.accepted.length, 2, '同名同年命中既有 → 跳过；跨体裁/不同名保留');
  assert.equal(res.duplicates, 2);
});

// ── 行文案 ─────────────────────────────────────────────────────────────────
t('fmtWorkLine：done/active/wish/心头好/短评', () => {
  const done = core.normalizeWork({ title: '沙丘', kind: 'movie', rating: 9, finishDate: '2026-10-01', note: '神作', creator: '维伦纽瓦', year: 2024 }, NOW).work;
  const line = core.fmtWorkLine(done, TODAY);
  assert.ok(line.includes('《沙丘》') && line.includes('电影') && line.includes('看完') && line.includes('9 分') && line.includes('2024') && line.includes('维伦纽瓦') && line.includes('神作'));
  const active = core.normalizeWork({ title: '三体', kind: 'book', status: 'active', startDate: '2026-10-19' }, NOW).work;
  assert.ok(core.fmtWorkLine(active, TODAY).includes('10 天前'));
  const wish = core.normalizeWork({ title: '沙丘3', kind: 'movie', status: 'wish', createdAt: ms(2026, 8, 1) }, NOW).work;
  assert.ok(core.fmtWorkLine(wish, TODAY).includes('89 天'));
  const fav = core.normalizeWork({ title: 'EVA', kind: 'anime', favorite: true }, NOW).work;
  assert.ok(core.fmtWorkLine(fav, TODAY).includes('★心头好'));
});

// ── 汇总 ───────────────────────────────────────────────────────────────────
console.log(`\n[run-tests] 结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  for (const f of failures) console.error(`  失败：${f.name} — ${f.e.message}`);
  process.exit(1);
}
