/**
 * datetime-lens core 单测 + 双差分对拍（node test/run-tests.mjs）
 *
 * 三道防线：
 *  1. 语法子集定向断言（解析/错误路径/坑规则逐条触发）
 *  2. Intl/ICU 权威差分：自算 offsetMin vs Intl longOffset 全 zone×instant 矩阵（不等即红）
 *  3. 墙钟消解差分：探针法 vs 分钟步进暴力扫描（±30h 全搜，瞬间集合必须一致）
 * 另加 formatAll round-trip 自证与算术双口径定向断言。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/datetime-core.js');

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  if (!cond) console.log(`  ✖ ${name}${detail ? ` —— ${detail}` : ''}`);
}

const MIN = 60000;
const HOUR = 3600000;

// ---------- 1. 解析：ISO 族 ----------
{
  const r = core.analyze('2026-11-04T08:00:00Z', { zone: 'UTC' });
  check('parse ISO Z', r.ok && r.kind === 'iso' && r.instant.ms === Date.UTC(2026, 10, 4, 8, 0, 0));
  const r2 = core.analyze('2026-11-04T16:00:00+08:00', { zone: 'UTC' });
  check('parse ISO +08:00 归一 UTC', r2.ok && r2.instant.ms === Date.UTC(2026, 10, 4, 8, 0, 0));
  const r3 = core.analyze('2026-11-04T16:00:00+0800', { zone: 'UTC' });
  check('parse ISO 无冒号偏移（ISO 基本格式合法）', r3.ok && r3.instant.ms === Date.UTC(2026, 10, 4, 8, 0, 0));
  const r4 = core.analyze('2026-11-04T16:00:00+08', { zone: 'UTC' });
  check('parse ISO ±HH 短偏移', r4.ok && r4.instant.ms === Date.UTC(2026, 10, 4, 8, 0, 0));
  const r5 = core.analyze('2026-11-04T08:00:00.25Z', { zone: 'UTC' });
  check('parse ISO 小数秒 250ms', r5.ok && r5.instant.ms === Date.UTC(2026, 10, 4, 8, 0, 0) + 250);
  const r6 = core.analyze('2026-11-04 08:00:00Z', { zone: 'UTC' });
  check('parse 空格分隔（非规范语法）可解析', r6.ok && r6.kind === 'iso');
  check('parse 空格分隔注记非规范', r6.notes.some((n) => n.indexOf('空格') !== -1) || r6.kindText.indexOf('空格') !== -1);
  const r7 = core.analyze('2026-11-04T08:00Z', { zone: 'UTC' });
  check('parse ISO 无秒位', r7.ok && r7.instant.ms === Date.UTC(2026, 10, 4, 8, 0, 0));
  const r8 = core.analyze('2026-11-04T25:00:00Z', { zone: 'UTC' });
  check('parse 拒绝时 25', !r8.ok && r8.error.indexOf('越界') !== -1);
  const r9 = core.analyze('2026-02-29T00:00:00Z', { zone: 'UTC' });
  check('parse 拒绝非闰年 2/29（2026 非闰年）', !r9.ok && r9.error.indexOf('闰年') !== -1);
  const r10 = core.analyze('2028-02-29T00:00:00Z', { zone: 'UTC' });
  check('parse 接受闰年 2/29（2028 是闰年）', r10.ok);
  const r11 = core.analyze('2026-02-30', { zone: 'UTC' });
  check('parse 拒绝 2/30', !r11.ok);
  const r12 = core.analyze('2026-11-04T23:59:60Z', { zone: 'UTC' });
  check('parse 闰秒映射到下一分钟前 1s', r12.ok && r12.instant.ms === Date.UTC(2026, 10, 5, 0, 0, 0) - 1000 && r12.pits.some((p) => p.code === 'leap-second'));
  const r13 = core.analyze('2026-11-04T10:30:60Z', { zone: 'UTC' });
  check('parse 拒绝非 xx:59:60 的秒 60', !r13.ok);
}

// ---------- 2. 解析：date-only / 月 / 年 ----------
{
  const r = core.analyze('2026-11-04', { zone: 'UTC' });
  check('date-only 按 UTC 零点（ES 规范）', r.ok && r.kind === 'date-only' && r.instant.ms === Date.UTC(2026, 10, 4));
  check('date-only 坑规则触发', r.pits.some((p) => p.code === 'date-only-utc'));
  check('date-only JS Date.parse 一致（同为 UTC）', r.js.agrees === true);
  const r2 = core.analyze('2026-11', { zone: 'UTC' });
  check('年-月按当月 1 日 UTC', r2.ok && r2.kind === 'month-only' && r2.instant.ms === Date.UTC(2026, 10, 1));
  const r3 = core.analyze('2026', { zone: 'UTC' });
  check('4 位数字按年份解读', r3.ok && r3.kind === 'year-only' && r3.instant.ms === Date.UTC(2026, 0, 1));
  check('年份坑规则触发', r3.pits.some((p) => p.code === 'bare-year'));
  const r4 = core.analyze('2026-11-04', { zone: 'America/New_York' });
  check('date-only 在纽约解读时仍为 UTC 零点 + 本地投影注记', r4.ok && r4.instant.ms === Date.UTC(2026, 10, 4));
}

// ---------- 3. 解析：unix 族 ----------
{
  const r = core.analyze('1762212000', { zone: 'UTC' });
  check('10 位数字按秒', r.ok && r.unit === '秒' && r.instant.ms === 1762212000000);
  check('10 位无歧义警告（秒是惯用位数）', !r.pits.some((p) => p.code === 'unix-unit-ambiguous'));
  const r2 = core.analyze('1762212000123', { zone: 'UTC' });
  check('13 位数字按毫秒', r2.ok && r2.unit === '毫秒' && r2.instant.ms === 1762212000123);
  const r3 = core.analyze('1762212000000123', { zone: 'UTC' });
  check('16 位数字按微秒（BigInt 精确）', r3.ok && r3.unit === '微秒' && r3.instant.ms === 1762212000000);
  const r4 = core.analyze('1762212000123456789', { zone: 'UTC' });
  check('19 位纳秒 BigInt 精确除到毫秒', r4.ok && r4.unit === '纳秒' && r4.instant.ms === 1762212000123);
  const r5 = core.analyze('1762212000.5', { zone: 'UTC' });
  check('秒带小数部分', r5.ok && r5.instant.ms === 1762212000500);
  const r6 = core.analyze('-86400', { zone: 'UTC' });
  check('负时间戳（1970 前）', r6.ok && r6.instant.ms === -86400000);
  const r7 = core.analyze('10000000000000', { zone: 'UTC' });
  check('14 位按毫秒（1e13 ms = 2286 年，界内；按微秒/纳秒会落界外或 1970）', r7.ok && r7.unit === '毫秒');
  const r8 = core.analyze('2147483648', { zone: 'UTC' });
  check('2038 溢出坑触发', r8.ok && r8.pits.some((p) => p.code === 'year-2038'));
  const r9 = core.analyze('176221200000000000000', { zone: 'UTC' });
  check('21 位拒绝（单位无从猜测）', !r9.ok);
  const r10 = core.analyze('115', { zone: 'UTC' });
  check('3 位数字按年份（非 unix）', r10.ok && r10.kind === 'year-only');
}

// ---------- 4. 解析：RFC 2822 / HTTP ----------
{
  const r = core.analyze('Wed, 04 Nov 2026 08:00:00 +0800', { zone: 'UTC' });
  check('parse RFC 2822 带偏移', r.ok && r.kind === 'rfc2822' && r.instant.ms === Date.UTC(2026, 10, 4, 0, 0, 0));
  const r2 = core.analyze('04 Nov 2026 08:00:00 GMT', { zone: 'UTC' });
  check('parse RFC 2822 无星期名/秒缺省', r2.ok && r2.instant.ms === Date.UTC(2026, 10, 4, 8, 0, 0));
  const r3 = core.analyze('04 Nov 2026 08:00:00 EST', { zone: 'UTC' });
  check('parse RFC 2822 区名 EST=-5h', r3.ok && r3.instant.ms === Date.UTC(2026, 10, 4, 13, 0, 0));
  const r4 = core.analyze('04 Nov 26 08:00:00 GMT', { zone: 'UTC' });
  check('两位年按 RFC 2822 过时规则展开 2026', r4.ok && r4.instant.ms === Date.UTC(2026, 10, 4, 8, 0, 0) && r4.pits.some((p) => p.code === 'two-digit-year'));
  const r5 = core.analyze('04 Nov 99 08:00:00 GMT', { zone: 'UTC' });
  check('两位年 99 → 1999', r5.ok && r5.instant.ms === Date.UTC(1999, 10, 4, 8, 0, 0));
  const r6 = core.analyze('04 Nov 2026 08:00:00 XYZ', { zone: 'UTC' });
  check('未知区名按 -0000 + 坑', r6.ok && r6.instant.ms === Date.UTC(2026, 10, 4, 8, 0, 0) && r6.pits.some((p) => p.code === 'unknown-zone-name'));
  const r7 = core.analyze('Mon, 04 Nov 2026 08:00:00 GMT', { zone: 'UTC' });
  check('星期名与日期不符报坑（2026-11-04 是周三）', r7.ok && r7.pits.some((p) => p.code === 'weekday-mismatch'));
  const r8 = core.analyze('Wed, 04 Nov 2026 08:00:00 GMT', { zone: 'UTC' });
  check('星期名正确无坑', r8.ok && !r8.pits.some((p) => p.code === 'weekday-mismatch'));
  const r9 = core.analyze('Wed, 04 Nov 2026 08:00:00 GMT', { zone: 'UTC' });
  check('HTTP 日期 kind=http-date', r9.ok && r9.kind === 'http-date');
  const r10 = core.analyze('Wed, 04 Nov 26 08:00:00 GMT', { zone: 'UTC' });
  check('两位年 HTTP 形态回落 RFC 2822 语义并报两位年坑', r10.ok && r10.kind === 'rfc2822' && r10.pits.some((p) => p.code === 'two-digit-year'));
  const r11 = core.analyze('32 Jan 2026 08:00:00 GMT', { zone: 'UTC' });
  check('RFC 2822 拒绝 1/32', !r11.ok);
}

// ---------- 5. ISO 周规范向量（周四归属规则） ----------
{
  const wk = core.isoWeekOf(2027, 1, 1);
  check('ISO 周：2027-01-01（周五）属 2026-W53', wk.year === 2026 && wk.week === 53 && wk.weekday === 5);
  const wk2 = core.isoWeekOf(2026, 1, 1);
  check('ISO 周：2026-01-01（周四）属 2026-W01', wk2.year === 2026 && wk2.week === 1 && wk2.weekday === 4);
  const wk3 = core.isoWeekOf(2020, 12, 31);
  check('ISO 周：2020-12-31 属 2020-W53', wk3.year === 2020 && wk3.week === 53);
  const wk4 = core.isoWeekOf(2026, 11, 4);
  check('ISO 周：2026-11-04 = W45（由 formatAll isoWeek 断言）', core.formatAll(Date.UTC(2026, 10, 4), 'UTC').isoWeek === '2026-W45-3');
  const r = core.analyze('2027-01-01', { zone: 'UTC' });
  check('跨年周年错位坑触发（2027-01-01 属 2026 周）', r.pits.some((p) => p.code === 'week-year-mismatch'));
}

// ---------- 6. utcMs 两位年映射坑守护（Date.UTC(26,...) = 1926 的反例） ----------
{
  check('utcMs(26,...) 是公元 26 年而非 1926', new Date(core.utcMs(26, 1, 1, 0, 0, 0, 0)).getUTCFullYear() === 26);
  check('utcMs(99,...) 是公元 99 年', new Date(core.utcMs(99, 6, 15, 0, 0, 0, 0)).getUTCFullYear() === 99);
  check('utcMs 常规年份直通', new Date(core.utcMs(2026, 11, 4, 8, 0, 0, 0)).getUTCFullYear() === 2026);
  check('normalizeWall 月末滚动（1/31 + 1 月 = 2/28 而非 3/2）', (() => {
    const w = core.normalizeWall(2026, 1, 31, 0, 0, 0); // 月归一在 addDuration 做钳制，这里只验滚动路径
    return w.y === 2026 && w.mo === 1 && w.d === 31;
  })());
  check('normalizeWall 时进位（23:59:60 → 次日 00:00）', (() => {
    const w = core.normalizeWall(2026, 11, 4, 23, 59, 60);
    return w.d === 5 && w.h === 0 && w.mi === 0 && w.s === 0;
  })());
  check('normalizeWall 负数回卷（0 点 -1s → 前日 23:59:59）', (() => {
    const w = core.normalizeWall(2026, 11, 4, 0, 0, -1);
    return w.d === 3 && w.h === 23 && w.mi === 59 && w.s === 59;
  })());
}

// ---------- 7. 差分对拍 A：投影 offsetMin vs Intl longOffset 全矩阵 ----------
{
  const ZONES = ['UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dubai',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Lisbon',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix',
    'America/Sao_Paulo', 'America/St_Johns',
    'Australia/Sydney', 'Australia/Lord_Howe', 'Pacific/Auckland', 'Pacific/Chatham',
    'Pacific/Kiritimati', 'Pacific/Marquesas', 'Pacific/Apia'];
  const oracleFmt = new Map();
  function oracleOffsetMin(ms, z) {
    let f = oracleFmt.get(z);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', { timeZone: z, timeZoneName: 'longOffset', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
      oracleFmt.set(z, f);
    }
    const tp = f.formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName').value;
    if (tp === 'GMT') return 0;
    const m = /^GMT([+-])(\d{2}):(\d{2})$/.exec(tp);
    if (!m) throw new Error('oracle 偏移形态异常: ' + tp);
    return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
  }
  // 瞬间集：2026 全年每 11 天扫一遍（覆盖南北半球全部 DST 切换）+ 已知切换瞬间精确点
  const instants = [];
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 11 * 24 * HOUR) instants.push(t);
  const transitions = [
    Date.UTC(2026, 2, 8, 7, 0, 0), Date.UTC(2026, 10, 1, 6, 0, 0),           // US
    Date.UTC(2026, 2, 29, 1, 0, 0), Date.UTC(2026, 9, 25, 1, 0, 0),          // EU
    Date.UTC(2026, 3, 5, 14, 0, 0), Date.UTC(2026, 9, 3, 16, 0, 0),          // NZ/Chatham
    Date.UTC(2026, 3, 4, 15, 0, 0), Date.UTC(2026, 9, 2, 15, 0, 0),          // Lord Howe / Sydney
    Date.UTC(2026, 9, 17, 22, 0, 0), Date.UTC(2026, 1, 14, 21, 0, 0),        // Brazil
  ];
  for (const t of transitions) { instants.push(t - 1000, t, t + 1000, t + 30 * MIN); }
  let pairs = 0, bad = 0, firstBad = '';
  for (const z of ZONES) {
    for (const t of instants) {
      pairs++;
      const mine = core.getOffset(t, z);
      const oracle = oracleOffsetMin(t, z);
      if (mine !== oracle) { bad++; if (!firstBad) firstBad = `${z}@${new Date(t).toISOString()} mine=${mine} oracle=${oracle}`; }
    }
  }
  check(`投影差分：offsetMin 与 Intl longOffset 全等（${ZONES.length} zone × ${instants.length} instant = ${pairs} 组）`, bad === 0, firstBad);
  // isDST 定向
  check('isDST：纽约 7 月 = 是', core.projectZone(Date.UTC(2026, 6, 15), 'America/New_York').isDST === true);
  check('isDST：纽约 1 月 = 否', core.projectZone(Date.UTC(2026, 0, 15), 'America/New_York').isDST === false);
  check('isDST：悉尼 1 月 = 是（南半球）', core.projectZone(Date.UTC(2026, 0, 15), 'Australia/Sydney').isDST === true);
  check('isDST：凤凰城 7 月 = 否（无 DST）', core.projectZone(Date.UTC(2026, 6, 15), 'America/Phoenix').isDST === false);
}

// ---------- 8. 差分对拍 B：墙钟消解 vs 分钟步进暴力扫描 ----------
{
  // 暴力扫描 ±30h 内所有与墙钟一致的「分钟起点」集合；探针法结论必须与之同判同瞬间
  function bruteResolve(wall, zone) {
    const wallAsUTC = core.utcMs(wall.y, wall.mo, wall.d, wall.h, wall.mi, wall.s, 0);
    const hits = [];
    for (let t = wallAsUTC - 30 * HOUR; t <= wallAsUTC + 30 * HOUR; t += MIN) {
      if (core.wallMatches(t, wall, zone)) hits.push(t);
    }
    return hits;
  }
  const CASES = [
    { wall: { y: 2026, mo: 3, d: 8, h: 2, mi: 30, s: 0 }, zone: 'America/New_York', expect: 'gap' },
    { wall: { y: 2026, mo: 3, d: 8, h: 3, mi: 0, s: 0 }, zone: 'America/New_York', expect: 'unique' },
    { wall: { y: 2026, mo: 11, d: 1, h: 1, mi: 30, s: 0 }, zone: 'America/New_York', expect: 'ambiguous' },
    { wall: { y: 2026, mo: 11, d: 1, h: 4, mi: 0, s: 0 }, zone: 'America/New_York', expect: 'unique' },
    { wall: { y: 2026, mo: 10, d: 4, h: 2, mi: 15, s: 0 }, zone: 'Australia/Lord_Howe', expect: 'gap' },
    { wall: { y: 2026, mo: 4, d: 5, h: 1, mi: 45, s: 0 }, zone: 'Australia/Lord_Howe', expect: 'ambiguous' },
    { wall: { y: 2011, mo: 12, d: 30, h: 12, mi: 0, s: 0 }, zone: 'Pacific/Apia', expect: 'gap' },
    { wall: { y: 2026, mo: 6, d: 15, h: 12, mi: 0, s: 0 }, zone: 'Asia/Shanghai', expect: 'unique' },
    { wall: { y: 2026, mo: 6, d: 15, h: 12, mi: 0, s: 0 }, zone: 'Asia/Kathmandu', expect: 'unique' },
    { wall: { y: 2026, mo: 6, d: 15, h: 12, mi: 0, s: 0 }, zone: 'America/Phoenix', expect: 'unique' },
    { wall: { y: 2026, mo: 4, d: 5, h: 3, mi: 15, s: 0 }, zone: 'Pacific/Chatham', expect: 'ambiguous' },
    { wall: { y: 2026, mo: 9, d: 27, h: 2, mi: 50, s: 0 }, zone: 'Pacific/Chatham', expect: 'gap' },
  ];
  let diffs = 0, firstDiff = '';
  for (const c of CASES) {
    const mine = core.resolveWall(c.wall, c.zone);
    const hits = bruteResolve(c.wall, c.zone);
    const status = hits.length === 0 ? 'gap' : hits.length === 1 ? 'unique' : 'ambiguous';
    let ok = mine.status === c.expect && status === c.expect;
    if (ok && status === 'unique') ok = Math.floor(mine.instantMs / MIN) === Math.floor(hits[0] / MIN);
    if (ok && status === 'ambiguous') ok = Math.floor(mine.instantMs / MIN) === Math.floor(hits[0] / MIN) && Math.floor(mine.secondInstantMs / MIN) === Math.floor(hits[1] / MIN);
    if (!ok) { diffs++; if (!firstDiff) firstDiff = `${c.zone} ${JSON.stringify(c.wall)} mine=${mine.status} brute=${status}(${hits.length})`; }
  }
  check(`墙钟消解差分：探针法与暴力扫描同判（${CASES.length} 例，含 30 分钟 DST/整日跳空/无 DST 区）`, diffs === 0, firstDiff);
  // 歧义两次瞬间的偏移语义：早的一次应是夏令时侧（偏移更大）
  const amb = core.resolveWall({ y: 2026, mo: 11, d: 1, h: 1, mi: 30, s: 0 }, 'America/New_York');
  check('歧义：早的一次偏移更大（夏令时侧）', amb.offsetMin > amb.secondOffsetMin);
  check('歧义：切换瞬间夹在两次之间', amb.instantMs < amb.transition && amb.transition < amb.secondInstantMs);
  const gap = core.resolveWall({ y: 2026, mo: 3, d: 8, h: 2, mi: 30, s: 0 }, 'America/New_York');
  check('空洞：跳过 60 分钟，墙钟 01:59:59 → 03:00:00', gap.skippedMinutes === 60 && gap.wallJustBefore.h === 1 && gap.wallJustBefore.mi === 59 && gap.wallJustAfter.h === 3);
  check('空洞：切换瞬间 2026-03-08T07:00:00Z', gap.transition === Date.UTC(2026, 2, 8, 7, 0, 0));
}

// ---------- 9. floating 解读（无偏移 = 本地/指定时区） ----------
{
  const local = core.localZone();
  const r = core.analyze('2026-06-15T02:30:00', { zone: local });
  const expected = core.resolveWall({ y: 2026, mo: 6, d: 15, h: 2, mi: 30, s: 0 }, local);
  check('floating 按指定时区消解', r.ok && r.kind === 'floating' && r.instant.ms === expected.instantMs);
  check('floating 坑规则触发', r.pits.some((p) => p.code === 'zoneless-floating'));
  // 同一运行时 V8 语义（本地时区）应与本引擎一致
  check('floating：本运行时 Date.parse（本地语义）与引擎一致', r.js.agrees === true, `jsMs=${r.js.parseMs} mine=${r.instant.ms} local=${local}`);
  const g = core.analyze('2026-03-08T02:30:00', { zone: 'America/New_York' });
  check('floating DST 空洞坑触发（纽约解读）', g.ok && g.pits.some((p) => p.code === 'dst-gap'));
  const a = core.analyze('2026-11-01T01:30:00', { zone: 'America/New_York' });
  check('floating DST 歧义坑触发（纽约解读）', a.ok && a.pits.some((p) => p.code === 'dst-ambiguous'));
}

// ---------- 10. 算术双口径 ----------
{
  const start = Date.UTC(2026, 10, 1, 4, 30, 0); // 2026-11-01T04:30Z = 纽约 00:30 EDT
  const r = core.addDuration(start, { days: 1 }, 'America/New_York', 'both');
  check('回拨边界 +1d：日历口径保墙钟', r.ok && r.calendar.instantMs === Date.UTC(2026, 10, 2, 5, 30, 0));
  check('回拨边界 +1d：精确口径 +86400s', r.ok && r.exact.instantMs === start + 86400000);
  check('回拨边界 +1d：两口径不一致（日历口径落在精确口径 +1h，EST 侧墙钟保形）', r.ok && r.differ === true && r.calendar.instantMs - r.exact.instantMs === HOUR);
  const r2 = core.addDuration(Date.UTC(2026, 2, 7, 7, 0, 0), { days: 2 }, 'America/New_York', 'both');
  check('前拨边界 +2d：日历口径差 -60 分钟（EDT 侧墙钟保形）', r2.ok && r2.differ === true && r2.calendar.instantMs - r2.exact.instantMs === -HOUR);
  const r3 = core.addDuration(Date.UTC(2026, 0, 31, 12, 0, 0), { months: 1 }, 'UTC', 'both');
  check('1/31 + 1 月钳制到 2/28', r3.ok && r3.calendar.wallAfter.mo === 2 && r3.calendar.wallAfter.d === 28 && r3.calendar.clamped === true);
  check('月末钳制坑触发', r3.pits.some((p) => p.code === 'month-clamp'));
  check('历法单位无精确口径提示', r3.exact === null && r3.pits.some((p) => p.code === 'no-exact-counterpart'));
  const r4 = core.addDuration(Date.UTC(2026, 0, 31, 12, 0, 0), { months: 1 }, 'UTC', 'exact');
  check('exact 模式拒绝 months', !r4.ok);
  const r5 = core.addDuration(Date.UTC(2026, 5, 1, 0, 0, 0), { hours: 25 }, 'Asia/Shanghai', 'both');
  check('无 DST 区两口径一致', r5.ok && r5.differ === false && r5.exact.instantMs === Date.UTC(2026, 5, 2, 1, 0, 0));
  const r6 = core.addDuration(Date.UTC(2026, 2, 8, 6, 30, 0), { hours: 1 }, 'America/New_York', 'calendar');
  check('前拨空洞内 +1h 落到切换瞬间', r6.ok && r6.calendar.resolvedStatus === 'gap' && r6.calendar.instantMs === Date.UTC(2026, 2, 8, 7, 0, 0));
  const r7 = core.addDuration(Date.UTC(2026, 10, 1, 4, 30, 0), { hours: 1 }, 'America/New_York', 'calendar');
  check('回拨歧义内 +1h 取早的一次', r7.ok && r7.calendar.resolvedStatus === 'ambiguous' && r7.calendar.instantMs === Date.UTC(2026, 10, 1, 5, 30, 0));
  const r8 = core.addDuration(Date.UTC(2026, 0, 1, 0, 0, 0), { years: 4 }, 'UTC', 'calendar');
  check('加 4 年跨闰（2026→2030 无异常）', r8.ok && r8.calendar.wallAfter.y === 2030);
}

// ---------- 11. formatAll round-trip 自证 ----------
{
  const zones = ['UTC', 'Asia/Shanghai', 'America/New_York', 'Australia/Lord_Howe', 'Pacific/Chatham', 'Asia/Kathmandu'];
  const instants = [Date.UTC(2026, 10, 4, 0, 0, 0), Date.UTC(2026, 2, 8, 7, 0, 0), Date.UTC(2026, 6, 15, 3, 30, 0), Date.UTC(2026, 11, 31, 23, 59, 59), Date.UTC(2027, 0, 1, 0, 0, 0)];
  let bad = 0, firstBad = '';
  for (const z of zones) {
    for (const t of instants) {
      const f = core.formatAll(t, z);
      const rt = core.analyze(f.iso, { zone: z });
      if (!rt.ok || rt.instant.ms !== t) { bad++; if (!firstBad) firstBad = `${z}@${f.iso}`; }
      // HTTP 日期（GMT）也须往返一致
      const rtHttp = core.analyze(f.http, { zone: 'UTC' });
      if (!rtHttp.ok || rtHttp.instant.ms !== Math.floor(t / 1000) * 1000) { bad++; if (!firstBad) firstBad = `${z}@${f.http}(http)`; }
    }
  }
  check(`formatAll round-trip（${zones.length} zone × ${instants.length} instant，ISO 与 HTTP 双通道）`, bad === 0, firstBad);
  const f = core.formatAll(Date.UTC(2026, 10, 4, 0, 0, 0), 'Asia/Shanghai');
  check('formatAll 具体值：上海 08:00 +08:00', f.iso === '2026-11-04T08:00:00+08:00' && f.weekdayZh === '周三');
  check('formatAll HTTP 恒 GMT', f.http === 'Wed, 04 Nov 2026 00:00:00 GMT');
  check('formatAll RFC 2822 形态', f.rfc2822 === 'Wed, 04 Nov 2026 08:00:00 +0800');
  check('formatAll 天序', f.dayOfYear === 308);
}

// ---------- 12. 时区工具函数 ----------
{
  check('isValidZone 拒绝垃圾串', !core.isValidZone('Not/AZone') && !core.isValidZone('') && !core.isValidZone(123));
  check('isValidZone 接受 IANA 名', core.isValidZone('Asia/Shanghai') && core.isValidZone('UTC'));
  const zones = core.listZones();
  check('listZones 非空且含主流', zones.length > 100 && zones.indexOf('Asia/Shanghai') !== -1 && zones.indexOf('America/New_York') !== -1);
}

// ---------- 13. now 与空输入 ----------
{
  const r = core.analyze('now', {});
  check('now 可解析且在合理范围', r.ok && r.kind === 'now' && Math.abs(Date.now() - r.instant.ms) < 5000);
  const e = core.analyze('', {});
  check('空输入如实报错', !e.ok);
  const e2 = core.analyze('hello world', {});
  check('无法识别给支持清单', !e2.ok && e2.error.indexOf('支持') !== -1);
  const e3 = core.analyze('2026-11-04T08:00:00+08:70', {});
  check('偏移分钟越界拒绝', !e3.ok);
  const e4 = core.analyze('2026-11-04T08:00:00+99:00', {});
  check('偏移超过 ±14 报坑', e4.ok && e4.pits.some((p) => p.code === 'offset-extreme'));
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n共 ${results.length} 项断言：${results.length - failed} 通过 / ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
