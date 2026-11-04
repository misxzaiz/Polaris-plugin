'use strict';
/**
 * datetime-lens core —— 日期时间/时区确定性引擎（纯函数核心，零 node 内置 require）
 *
 * 双端共用：面板经 esbuild 打进 browser bundle，MCP server 在 node 侧 require。
 * 全局 Date/Intl 浏览器与 node 双端内置（与 URL 同族的「全局 API 可用、模块解析禁止」纪律）。
 *
 * 设计纪律：
 *  - 解析一律自研严格语法，不信任 Date.parse 的实现差异语义；解析产物附「匹配语法」与 JS 差分实况
 *  - 时区换算唯一权威是 Intl/ICU（宿主内置数据），自实现逻辑全部经 test/run-tests.mjs 差分对拍守护
 *  - 时区历史变迁完整库不在范围内：依赖 ICU 数据并如实标注（需求 048 边界）
 */

const CORE_VERSION = '0.1.0';

const DAY_MS = 86400000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_INDEX = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// ---------- 基础时间数学习惯（避开 Date.UTC 的两位年映射坑） ----------

function pad2(n) { return n < 10 ? '0' + n : String(n); }
function pad4(n) { return n < 1000 ? ('000' + n).slice(-4) : String(n); }

function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function daysInMonth(y, mo) {
  const table = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mo === 2 && isLeap(y)) return 29;
  return table[mo - 1];
}

/**
 * UTC 分量 → epoch ms。不直接用 Date.UTC 的年份参数（0-99 会被映射为 1900+y，经典坑），
 * 先以 2000 年为枢轴再 setUTCFullYear 校正。分量必须已通过范围校验（month 1-12 等）。
 */
function utcMs(y, mo, d, h, mi, s, ms) {
  const dt = new Date(Date.UTC(2000, mo - 1, d, h, mi, s, ms || 0));
  dt.setUTCFullYear(y);
  return dt.getTime();
}

/** wall（{y,mo,d,h,mi,s}，各自可越界）→ 归一化 wall（逐月滚动，含跨年） */
function normalizeWall(y, mo, d, h, mi, s) {
  let carry = 0;
  let sec = s;
  carry = Math.floor(sec / 60); sec = sec - carry * 60;
  mi += carry;
  carry = Math.floor(mi / 60); mi = mi - carry * 60;
  h += carry;
  carry = Math.floor(h / 24); h = h - carry * 24;
  d += carry;
  carry = Math.floor((mo - 1) / 12); mo = mo - carry * 12; y += carry;
  while (d > daysInMonth(y, mo)) { d -= daysInMonth(y, mo); mo++; if (mo > 12) { mo = 1; y++; } }
  while (d < 1) { mo--; if (mo < 1) { mo = 12; y--; } d += daysInMonth(y, mo); }
  return { y, mo, d, h, mi, s: sec };
}

// ---------- 时区（唯一权威 Intl/ICU） ----------

const fmtCache = new Map();
function getFormatter(zone) {
  let f = fmtCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    fmtCache.set(zone, f);
  }
  return f;
}

function isValidZone(zone) {
  if (typeof zone !== 'string' || zone.length === 0) return false;
  try { getFormatter(zone); return true; } catch (_) { return false; }
}

function localZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; }
}

function listZones() {
  try {
    const z = Intl.supportedValuesOf('timeZone');
    if (Array.isArray(z) && z.length > 0) return z.slice();
  } catch (_) { /* 老运行时降级静态表 */ }
  return ['UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dubai',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago',
    'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'Australia/Sydney',
    'Pacific/Auckland', 'Pacific/Kiritimati', 'Pacific/Chatham', 'Pacific/Marquesas', 'Australia/Lord_Howe'];
}

/**
 * 瞬间 → 时区墙钟分量（含 offsetMin 反推）。offsetMin 由「墙钟按 UTC 解释值 − 真实瞬间」得出（分钟粒度）。
 * 注意：ICU 在 1970 年前含 LMT 秒级偏移时代，分钟粒度反推可能失真（pre-1970 坑规则负责标注）。
 * 不调 getOffset（防相互递归）；DST 判定由 projectZone 在本函数之外补探针。
 */
function wallPartsOf(ms, zone) {
  const parts = getFormatter(zone).formatToParts(new Date(ms));
  const get = (type) => { for (const p of parts) if (p.type === type) return p.value; return ''; };
  const y = parseInt(get('year'), 10);
  const mo = parseInt(get('month'), 10);
  const d = parseInt(get('day'), 10);
  const h = parseInt(get('hour'), 10);
  const mi = parseInt(get('minute'), 10);
  const s = parseInt(get('second'), 10);
  const asUTC = utcMs(y, mo, d, h, mi, s, 0);
  const offsetMin = Math.round((asUTC - ms) / 60000);
  const weekday = new Date(asUTC).getUTCDay();
  return { wall: { y, mo, d, h, mi, s }, asUTC, offsetMin, weekday };
}

function getOffset(ms, zone) { return wallPartsOf(ms, zone).offsetMin; }

function projectZone(ms, zone) {
  const wp = wallPartsOf(ms, zone);
  // DST 判定：与同年 1 月 / 7 月偏移对比，标准时偏移是两者较小值，高出即夏令时
  const jan = getOffset(utcMs(wp.wall.y, 1, 15, 12, 0, 0, 0), zone);
  const jul = getOffset(utcMs(wp.wall.y, 7, 15, 12, 0, 0, 0), zone);
  const stdOffset = Math.min(jan, jul);
  const isDST = wp.offsetMin > stdOffset;
  return {
    zone, wall: wp.wall, offsetMin: wp.offsetMin, isDST,
    stdOffset, weekday: wp.weekday, weekdayEn: DAY_NAMES[wp.weekday], weekdayZh: DAY_NAMES_ZH[wp.weekday],
  };
}

/** 墙钟时间在指定时区是否与该瞬间一致（round-trip 校验） */
function wallMatches(ms, wall, zone) {
  const p = projectZone(ms, zone).wall;
  return p.y === wall.y && p.mo === wall.mo && p.d === wall.d && p.h === wall.h && p.mi === wall.mi && p.s === wall.s;
}

/** 二分找偏移切换瞬间：在 (lo, hi] 内找第一个 offset === afterOffset 的时刻（秒精度） */
function findTransition(zone, lo, hi, afterOffset) {
  let a = lo, b = hi;
  while (b - a > 1000) {
    const mid = Math.floor((a + b) / 2);
    if (getOffset(mid, zone) === afterOffset) b = mid; else a = mid;
  }
  return b;
}

/**
 * 墙钟消解：墙钟时间在指定时区的真实瞬间。
 * 探针法：用 ±24h 两个时刻的偏移生成候选，逐个 round-trip 校验。
 * 两个候选都过 → fall back 歧义（出现两次）；都不过 → spring forward 空洞（不存在）。
 * 返回形状三态统一（同形空键，TS allowJs 推断友好——cron-lens 实证坑）。
 */
function resolveWall(wall, zone) {
  const wallAsUTC = utcMs(wall.y, wall.mo, wall.d, wall.h, wall.mi, wall.s, 0);
  const o1 = getOffset(wallAsUTC - DAY_MS, zone);
  const o2 = getOffset(wallAsUTC + DAY_MS, zone);
  const candSet = [];
  const c1 = wallAsUTC - o1 * 60000;
  const c2 = wallAsUTC - o2 * 60000;
  if (candSet.indexOf(c1) === -1) candSet.push(c1);
  if (candSet.indexOf(c2) === -1) candSet.push(c2);
  candSet.sort((a, b) => a - b);
  const valid = candSet.filter((c) => wallMatches(c, wall, zone));
  if (valid.length === 1) {
    return {
      status: 'unique', zone, wall,
      instantMs: valid[0], offsetMin: getOffset(valid[0], zone),
      secondInstantMs: null, secondOffsetMin: null,
      transition: null, skippedMinutes: 0, wallJustBefore: null, wallJustAfter: null,
      offsetChanged: o1 !== o2,
      note: o1 !== o2 ? '该时区在附近发生过偏移切换（非典型 DST 双向切换），墙钟时间唯一存在' : '',
    };
  }
  if (valid.length === 2) {
    const transition = findTransition(zone, valid[0], valid[1], o2);
    const first = projectZone(valid[0], zone);
    const second = projectZone(valid[1], zone);
    return {
      status: 'ambiguous', zone, wall,
      instantMs: valid[0], offsetMin: first.offsetMin,
      secondInstantMs: valid[1], secondOffsetMin: second.offsetMin,
      transition, skippedMinutes: 0, wallJustBefore: null, wallJustAfter: null,
      offsetChanged: true,
      note: '时钟回拨：该墙钟时间出现两次，早的一次是首个真实时刻（转换前的偏移 ' + fmtOffsetMin(first.offsetMin) + '，晚的一次 ' + fmtOffsetMin(second.offsetMin) + '）',
    };
  }
  // 都不合法 → 空洞
  const transition = findTransition(zone, candSet[0], candSet[1], o2);
  const skippedMinutes = Math.abs(o1 - o2);
  const wallJustBefore = projectZone(transition - 1, zone).wall;
  const wallJustAfter = projectZone(transition, zone).wall;
  return {
    status: 'gap', zone, wall,
    instantMs: null, offsetMin: null,
    secondInstantMs: null, secondOffsetMin: null,
    transition, skippedMinutes, wallJustBefore, wallJustAfter,
    offsetChanged: true,
    note: '时钟前拨：该墙钟时间不存在（DST 空洞），真实时间在切换瞬间从 ' + fmtOffsetMin(o1) + ' 直接跳到 ' + fmtOffsetMin(o2) + '，墙钟 ' + pad2(wallJustBefore.h) + ':' + pad2(wallJustBefore.mi) + ':' + pad2(wallJustBefore.s) + ' 之后直接是 ' + pad2(wallJustAfter.h) + ':' + pad2(wallJustAfter.mi) + ':' + pad2(wallJustAfter.s),
  };
}

// ---------- 偏移与格式 ----------

function fmtOffsetMin(min) {
  if (min === 0) return 'Z';
  const sign = min < 0 ? '-' : '+';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs - h * 60;
  return sign + pad2(h) + ':' + pad2(m);
}

function fmtOffsetRFC(min) { // RFC 2822 形态 ±HHMM
  if (min === 0) return '+0000';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs - h * 60;
  return (min < 0 ? '-' : '+') + pad2(h) + pad2(m);
}

/** ISO 周日期（周四是本年成员决定周年；周一=1） */
function isoWeekOf(y, mo, d) {
  const noon = utcMs(y, mo, d, 12, 0, 0, 0);
  const dayNum = (new Date(noon).getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const thursday = noon - (dayNum - 3) * DAY_MS;
  const weekYear = new Date(thursday).getUTCFullYear();
  const jan1 = utcMs(weekYear, 1, 1, 12, 0, 0, 0);
  const jan1DayNum = (new Date(jan1).getUTCDay() + 6) % 7;
  const week = Math.round(((thursday - jan1) / DAY_MS - jan1DayNum) / 7) + 1;
  return { year: weekYear, week, weekday: dayNum + 1 };
}

function dayOfYear(y, mo, d) {
  let n = 0;
  for (let m = 1; m < mo; m++) n += daysInMonth(y, m);
  return n + d;
}

/** 全格式输出（HTTP 日期恒为 GMT；ISO/RFC 2822 带目标时区偏移） */
function formatAll(ms, zone) {
  const p = projectZone(ms, zone);
  const w = p.wall;
  const iso = pad4(w.y) + '-' + pad2(w.mo) + '-' + pad2(w.d) + 'T' + pad2(w.h) + ':' + pad2(w.mi) + ':' + pad2(w.s) + (p.offsetMin === 0 ? 'Z' : fmtOffsetMin(p.offsetMin));
  const rfc3339 = iso;
  const rfc2822 = DAY_NAMES[p.weekday] + ', ' + pad2(w.d) + ' ' + MONTH_NAMES[w.mo - 1] + ' ' + pad4(w.y) + ' ' + pad2(w.h) + ':' + pad2(w.mi) + ':' + pad2(w.s) + ' ' + fmtOffsetRFC(p.offsetMin);
  // HTTP 日期恒为 GMT：必须用 UTC 分量与 UTC 星期（时区墙钟的星期/钟点都不是 GMT 语义）
  const u = new Date(Math.round(ms));
  const http = DAY_NAMES[u.getUTCDay()] + ', ' + pad2(u.getUTCDate()) + ' ' + MONTH_NAMES[u.getUTCMonth()] + ' ' + pad4(u.getUTCFullYear()) + ' ' + pad2(u.getUTCHours()) + ':' + pad2(u.getUTCMinutes()) + ':' + pad2(u.getUTCSeconds()) + ' GMT';
  const wk = isoWeekOf(w.y, w.mo, w.d);
  const msExact = Math.round(ms);
  return {
    iso, rfc3339, rfc2822, http,
    unixSeconds: Math.floor(msExact / 1000),
    unixMillis: msExact,
    isoWeek: pad4(wk.year) + '-W' + pad2(wk.week) + '-' + wk.weekday,
    isoWeekDetail: wk,
    dayOfYear: dayOfYear(w.y, w.mo, w.d),
    weekdayEn: p.weekdayEn, weekdayZh: p.weekdayZh,
    offsetMin: p.offsetMin, offsetText: fmtOffsetMin(p.offsetMin), zone,
    wall: w,
  };
}

// ---------- 解析（自研严格语法） ----------

// ISO 8601 / RFC 3339 风格：日期必有，时间与偏移可选。分隔符 T/t 或空格（空格=非规范但广泛支持，单独标注）
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:([Tt ])(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|z|[+-]\d{2}(?::?\d{2})?)?)?$/;
const RE_YM = /^(\d{4})-(\d{2})$/;
const RE_Y = /^(\d{4})$/;
const RE_NUM = /^(-)?(\d{1,20})(?:\.(\d{1,9}))?$/;
const RE_2822 = /^(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s+)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|[+-]\d{2}:?\d{2}|[A-Za-z]{1,5})?$/i;
const RE_HTTP = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;

// RFC 5322 已知时区名（分钟）；军字母单名按规范视为 -0000
const ZONE_NAME_MIN = { UT: 0, GMT: 0, UTC: 0, Z: 0, EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420 };

function parseOffsetToken(tok) {
  // 返回 { ok, offsetMin, hasOffset, extreme, error }
  if (tok === undefined || tok === '') return { ok: true, offsetMin: null, hasOffset: false };
  if (tok === 'Z' || tok === 'z') return { ok: true, offsetMin: 0, hasOffset: true };
  const m = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(tok); // ±HH / ±HH:MM / ±HHMM
  if (m) {
    const h = parseInt(m[2], 10);
    const mi = m[3] ? parseInt(m[3], 10) : 0;
    if (mi > 59) return { ok: false, error: '偏移分钟 ' + mi + ' 越界（0-59）' };
    const off = (m[1] === '-' ? -1 : 1) * (h * 60 + mi);
    return { ok: true, offsetMin: off, hasOffset: true, extreme: h > 14 };
  }
  return { ok: false, error: '无法识别的偏移形态「' + tok + '」' };
}

function checkDateRange(y, mo, d) {
  if (mo < 1 || mo > 12) return '月份 ' + mo + ' 越界（1-12）';
  const dim = daysInMonth(y, mo);
  if (d < 1 || d > dim) return y + ' 年 ' + mo + ' 月没有 ' + d + ' 日（该月只有 ' + dim + ' 天' + (d === 29 && mo === 2 ? '，' + y + ' 不是闰年' : '') + '）';
  return '';
}

function weekdayOfUTC(y, mo, d) { return new Date(utcMs(y, mo, d, 12, 0, 0, 0)).getUTCDay(); }

function jsDateParse(text) {
  try { const v = Date.parse(text); return Number.isNaN(v) ? null : v; } catch (_) { return null; }
}

/**
 * 数字串 → unix 时间戳（单位按位数候选猜测：秒/毫秒/微秒/纳秒）。
 * 各单位有「惯用位数」（秒 10、毫秒 13、微秒 16、纳秒 19）：先按年份合理性过滤（[1970,2300]），
 * 再按 |实际位数 − 惯用位数| 取最小分；次优候选分差 ≤1 且同样在界内 → 歧义警告（列明备选）。
 * 大整数经 BigInt 精确除（19 位纳秒超出 Number 安全整数）。
 */
function parseUnixNumeric(neg, intDigits, frac) {
  const n = intDigits.length;
  const sign = neg ? -1n : 1n;
  const v = BigInt(intDigits);
  const fracMs = frac ? Math.floor(parseInt(frac.padEnd(3, '0').slice(0, 3), 10)) : 0;
  const candidates = [];
  // [单位名, 惯用位数, 每单位对应的毫秒 BigInt 缩放]
  if (n <= 11) candidates.push({ unit: '秒', canon: 10, div: null, mul: 1000n });
  if (n <= 14) candidates.push({ unit: '毫秒', canon: 13, div: null, mul: 1n });
  if (n <= 17) candidates.push({ unit: '微秒', canon: 16, div: 1000n, mul: null });
  if (n <= 20) candidates.push({ unit: '纳秒', canon: 19, div: 1000000n, mul: null });
  const plausible = [];
  for (const c of candidates) {
    const msBig = c.div ? sign * (v / c.div) : sign * v * c.mul;
    if (msBig > 10440960000000n || msBig < -62135596800000n) continue; // 1970-2300 界外（负向放宽到公元 1 年）
    plausible.push({ unit: c.unit, score: Math.abs(n - c.canon), ms: Number(msBig) });
  }
  if (plausible.length === 0) {
    return { ok: false, error: '数字串 ' + (neg ? '-' : '') + intDigits + ' 按秒/毫秒/微秒/纳秒解读都落在 1970-2300 之外，无法确定单位' };
  }
  plausible.sort((a, b) => a.score - b.score);
  const chosen = plausible[0];
  const ambiguous = plausible.filter((p) => p !== chosen && p.score - chosen.score <= 1);
  const y = new Date(chosen.ms).getUTCFullYear();
  return {
    ok: true, kind: 'unix', unit: chosen.unit, ms: chosen.ms + (chosen.unit === '秒' ? fracMs : 0),
    ambiguous, yearFromUnit: y,
  };
}

/**
 * 任意文本 → 解析报告（kind/matched/instant/pits/js 差分）。
 * opts.zone：date-only / floating（无偏移）形态的解读时区，默认宿主本地时区。
 * 返回形状全分支统一（同形空键）——TS allowJs 推断不做 narrowing 假设（cron-lens 实证坑）。
 */
function analyze(text, opts) {
  const o = opts || {};
  const zone = isValidZone(o.zone) ? o.zone : localZone();
  const raw = String(text == null ? '' : text).trim();
  const pits = [];
  const notes = [];
  const base = {
    input: raw, zone, pits, notes,
    ok: false, kind: '', kindText: '', instant: null,
    js: null, unit: null, isoWeek: null, floating: null, error: '',
  };
  const fail = (error) => Object.assign({}, base, { ok: false, error });

  function finish(kind, kindText, instant, extra) {
    const out = Object.assign({}, base, {
      ok: true, kind, kindText,
      instant: instant ? {
        ms: instant.ms, isoUtc: new Date(instant.ms).toISOString().replace('.000Z', 'Z'),
        leapSecond: !!instant.leapSecond,
      } : null,
    }, extra || {});
    // JS Date.parse 差分（本运行时实况 vs 本引擎语义；分歧/拒收都如实入坑，不硬编码引擎行为）
    const jsMs = jsDateParse(raw);
    const agrees = jsMs !== null && instant !== null && instant.ms === jsMs;
    out.js = { parseMs: jsMs, agrees };
    const localZ = localZone();
    const isFloating = kind === 'floating';
    // unix 数字串/年份对 Date.parse 无意义（V8 一律 NaN），差分坑只对「语法字符串」类形态生效
    const jsDiffApplicable = kind !== 'now' && kind.indexOf('unix') !== 0 && kind !== 'year-only';
    if (instant !== null && jsMs !== null && !agrees && (kind !== 'now' && (!isFloating || zone === localZ)) && jsDiffApplicable) {
      pits.push({ code: 'js-disagrees', level: 'warn', message: 'JS Date.parse 与本引擎相差 ' + Math.abs(jsMs - instant.ms) + ' ms（JS 得 ' + new Date(jsMs).toISOString() + '）——本引擎按语法表权威解读，JS 侧行为以 js.parseMs 实况为准' });
    }
    if (instant !== null && jsMs === null && jsDiffApplicable) {
      pits.push({ code: 'js-rejects', level: 'info', message: '本运行时 Date.parse 对该输入返回 NaN（ES 规范语法之外）——JS 侧需先按本报告解读再自行构造 Date' });
    }
    return out;
  }

  if (raw === '') return fail('输入为空');

  // now
  if (raw.toLowerCase() === 'now') {
    const ms = Date.now();
    return finish('now', '当前时刻', { ms }, { js: { parseMs: null, agrees: false } });
  }

  // 纯数字（unix 族）；4 位以内无符号整数按年份解读（new Date('2026') 同语义）
  const mNum = RE_NUM.exec(raw);
  if (mNum && (mNum[1] || mNum[3] || mNum[2].length > 4)) {
    const u = parseUnixNumeric(mNum[1], mNum[2], mNum[3]);
    if (!u.ok) return fail(u.error);
    const extra = { unit: u.unit };
    if (u.ambiguous.length > 0) {
      pits.push({ code: 'unix-unit-ambiguous', level: 'warn', message: '该位数按「' + u.unit + '」解读为 ' + u.yearFromUnit + ' 年；备选单位「' + u.ambiguous.map((a) => a.unit).join('」或「') + '」也在合理年份内——确认上游产出的单位' });
    }
    if (u.unit === '秒' && u.ms > 2147483647000) {
      pits.push({ code: 'year-2038', level: 'warn', message: 'Unix 秒已超出 32 位 time_t 上限（2038-01-19T03:14:07Z 之后），32 位系统/旧库会溢出' });
    }
    if (u.unit !== '毫秒' && u.unit !== '秒') {
      notes.push('亚毫秒单位（' + u.unit + '）超出 JS Date 精度，已折算到毫秒（余数截断）');
    }
    return finish(u.unit === '毫秒' || u.unit === '秒' ? 'unix' : 'unix-subsec', 'Unix 时间戳（' + u.unit + '）', { ms: u.ms }, extra);
  }
  if (mNum) { // 4 位以内：年份
    const y = parseInt(mNum[2], 10) * (mNum[1] ? -1 : 1);
    const ms = utcMs(y, 1, 1, 0, 0, 0, 0);
    pits.push({ code: 'bare-year', level: 'info', message: '「' + raw + '」按年份解读（' + y + '-01-01T00:00:00 UTC，与 new Date("' + raw + '") 同语义）；若想表达 Unix 秒请补足位数或前缀' });
    return finish('year-only', '年份', { ms }, {});
  }

  // HTTP 日期（IMF-fixdate，恒 GMT）
  const mHttp = RE_HTTP.exec(raw);
  if (mHttp) {
    const d = parseInt(mHttp[2], 10), mo = MONTH_INDEX[mHttp[3].toLowerCase()], y = parseInt(mHttp[4], 10);
    const h = parseInt(mHttp[5], 10), mi = parseInt(mHttp[6], 10), s = parseInt(mHttp[7], 10);
    const rangeErr = checkDateRange(y, mo, d);
    if (rangeErr) return fail(rangeErr);
    if (h > 23 || mi > 59 || s > 59) return fail('时间分量越界（时 0-23、分/秒 0-59）');
    const wd = weekdayOfUTC(y, mo, d);
    const ms = utcMs(y, mo, d, h, mi, s, 0);
    if (DAY_NAMES[wd] !== mHttp[1]) {
      pits.push({ code: 'weekday-mismatch', level: 'warn', message: '星期名 ' + mHttp[1] + ' 与实际 ' + DAY_NAMES[wd] + '（' + raw + ' 的日期）不符——RFC 7231 要求一致，脏数据常见，严格接收端会拒收' });
    }
    return finish('http-date', 'HTTP 日期（IMF-fixdate，恒 GMT）', { ms }, {});
  }

  // RFC 2822 邮件日期
  const m2822 = RE_2822.exec(raw);
  if (m2822) {
    const d = parseInt(m2822[2], 10);
    const mo = MONTH_INDEX[m2822[3].toLowerCase()];
    let y = parseInt(m2822[4], 10);
    const h = parseInt(m2822[5], 10), mi = parseInt(m2822[6], 10);
    const s = m2822[7] ? parseInt(m2822[7], 10) : 0;
    if (m2822[4].length === 2) {
      // RFC 2822 §4.3 过时两位年：00-49 → 2000-2049，50-99 → 1950-1999
      y = y < 50 ? 2000 + y : 1900 + y;
      pits.push({ code: 'two-digit-year', level: 'warn', message: '两位年按 RFC 2822 过时规则展开为 ' + y + '（00-49→20xx，50-99→19xx）；另有旧实现按 +1900 处理，跨解析器结果可能分歧' });
    }
    if (y < 1 || y > 9999) return fail('年份 ' + y + ' 越界');
    const rangeErr = checkDateRange(y, mo, d);
    if (rangeErr) return fail(rangeErr);
    if (h > 23 || mi > 59 || s > 59) return fail('时间分量越界（时 0-23、分/秒 0-59）');
    const zoneTok = m2822[8];
    let off = null;
    if (zoneTok && zoneTok.charAt(0) !== '+' && zoneTok.charAt(0) !== '-') {
      const key = zoneTok.toUpperCase();
      if (Object.prototype.hasOwnProperty.call(ZONE_NAME_MIN, key)) off = ZONE_NAME_MIN[key];
      else {
        off = 0;
        pits.push({ code: 'unknown-zone-name', level: 'warn', message: '时区名「' + zoneTok + '」不在 RFC 5322 已知表内，按 -0000 处理；RFC 5322 规定未知区名应视作本地时间——接收端语义可能分歧' });
      }
    } else if (zoneTok) {
      const po = parseOffsetToken(zoneTok.replace(':', ''));
      if (!po.ok) return fail(po.error);
      off = po.offsetMin;
      if (po.extreme) pits.push({ code: 'offset-extreme', level: 'warn', message: '偏移 ' + zoneTok + ' 超过 ±14:00——现实时区不存在该偏移，疑似脏数据' });
    }
    const wd = weekdayOfUTC(y, mo, d);
    if (m2822[1] && DAY_NAMES[wd].toLowerCase() !== m2822[1].toLowerCase()) {
      pits.push({ code: 'weekday-mismatch', level: 'warn', message: '星期名 ' + m2822[1] + ' 与实际 ' + DAY_NAMES[wd] + ' 不符——RFC 2822 要求一致，脏数据常见' });
    }
    const wallUTC = utcMs(y, mo, d, h, mi, s, 0);
    const ms = off === null ? null : wallUTC - off * 60000;
    if (ms === null) {
      // 无时区（RFC 2822 允许省略）——floating
      const rv = resolveWall({ y, mo, d, h, mi, s }, zone);
      pits.push({ code: 'zoneless-floating', level: 'warn', message: '无时区的时间：语义依赖运行环境（本引擎按解读时区 ' + zone + ' 消解；date-only 却按 UTC——同一语言两套规则）' });
      if (rv.status === 'unique') return finish('floating', 'RFC 2822 无时区（floating，按 ' + zone + ' 解读）', { ms: rv.instantMs }, { floating: { zone, status: rv.status, resolve: rv } });
      return finish('floating', 'RFC 2822 无时区（floating，按 ' + zone + ' 解读）', { ms: rv.instantMs || rv.transition }, { floating: { zone, status: rv.status, resolve: rv } });
    }
    return finish('rfc2822', 'RFC 2822 邮件日期', { ms }, {});
  }

  // ISO 8601 / RFC 3339 风格
  const mIso = RE_ISO.exec(raw);
  if (mIso) {
    const y = parseInt(mIso[1], 10), mo = parseInt(mIso[2], 10), d = parseInt(mIso[3], 10);
    const rangeErr = checkDateRange(y, mo, d);
    if (rangeErr) return fail(rangeErr);
    const sep = mIso[4];
    if (sep === undefined) {
      // date-only（或 YYYY-MM 已在上面分支）——ES 规范：按 UTC 零点
      const ms = utcMs(y, mo, d, 0, 0, 0, 0);
      pits.push({ code: 'date-only-utc', level: 'warn', message: 'date-only「' + raw + '」按 ES 规范解析为 UTC 零点；而 new Date(' + y + ', ' + (mo - 1) + ', ' + d + ') 是本地时区零点——UTC+8 下两者相差 8 小时，日程/统计常用错' });
      const wk = isoWeekOf(y, mo, d);
      if (wk.year !== y) pits.push({ code: 'week-year-mismatch', level: 'info', message: '该日期的 ISO 周日期是 ' + pad4(wk.year) + '-W' + pad2(wk.week) + '——周年 ' + wk.year + ' 与日历年 ' + y + ' 不同（跨年周归属），按周统计时别拿错年份' });
      return finish('date-only', '日期（无时间，ES 规范按 UTC 零点）', { ms }, { isoWeek: pad4(wk.year) + '-W' + pad2(wk.week) + '-' + wk.weekday });
    }
    const h = parseInt(mIso[5], 10), mi = parseInt(mIso[6], 10);
    const s = mIso[7] ? parseInt(mIso[7], 10) : 0;
    if (h > 23 || mi > 59) return fail('时间分量越界（时 0-23、分 0-59）');
    const frac = mIso[8];
    const fracMs = frac ? Math.floor(parseInt(frac.padEnd(3, '0').slice(0, 3), 10)) : 0;
    if (frac && frac.length > 3) notes.push('小数秒 ' + frac.length + ' 位超出毫秒精度，已截断到 ' + fracMs + ' ms');
    const zoneTok = mIso[9];
    const po = parseOffsetToken(zoneTok);
    if (!po.ok) return fail(po.error);
    if (po.extreme) pits.push({ code: 'offset-extreme', level: 'warn', message: '偏移 ' + zoneTok + ' 超过 ±14:00——现实时区不存在该偏移' });
    const leap = s === 60;
    if (leap && mi !== 59) return fail('秒 60（闰秒）只允许出现在 xx:59:60');
    if (leap) pits.push({ code: 'leap-second', level: 'warn', message: '闰秒 xx:59:60：JS Date 不接受（new Date(...) 得 Invalid Date）；本引擎映射到下一分钟边界前一秒的真实瞬间' });
    const wallUTC = leap ? utcMs(y, mo, d, h, mi + 1, 0, fracMs) - 1000 + fracMs : utcMs(y, mo, d, h, mi, s, fracMs);
    const kindTextBase = sep === ' ' ? '（空格分隔，ES 规范语法外、V8 等按本地时区接受的广泛扩展）' : '';
    if (!po.hasOffset) {
      // floating：date-time 无偏移 = 本地时区（ES 规范）
      const rv = resolveWall({ y, mo, d, h, mi, s: leap ? 59 : s }, zone);
      pits.push({ code: 'zoneless-floating', level: 'warn', message: '无偏移的 date-time：ES 规范按本地时区解读（date-only 却按 UTC 零点）——同一语言两套规则，跨时区部署的服务端/浏览器会给出不同瞬间' + kindTextBase });
      if (rv.status !== 'unique') {
        pits.push(rv.status === 'gap'
          ? { code: 'dst-gap', level: 'error', message: '该墙钟时间在 ' + zone + ' 不存在（夏令时前拨跳过 ' + (rv.gapSeconds / 60) + ' 分钟，切换瞬间 ' + new Date(rv.transition).toISOString() + '）——实际会落到切换后或前，取决于解析器' }
          : { code: 'dst-ambiguous', level: 'warn', message: '该墙钟时间在 ' + zone + ' 出现两次（夏令时回拨，转换瞬间 ' + new Date(rv.transition).toISOString() + '）——不同解析器会取不同一次，本引擎取早的一次' });
      }
      const resolvedMs = rv.status === 'gap' ? rv.transition : rv.instantMs;
      return finish('floating', '无时区时间' + kindTextBase + '（按 ' + zone + ' 消解）', { ms: resolvedMs, leapSecond: leap }, { floating: { zone, status: rv.status, resolve: rv } });
    }
    const ms = wallUTC - po.offsetMin * 60000;
    if (zoneTok === 'z') notes.push('小写 z 被 V8 等接受但 ES 规范语法只认大写 Z——严格解析器会拒');
    if (/[+-]\d{4}$/.test(raw)) notes.push('无冒号偏移（+HHMM）：ISO 8601 基本格式合法，但 RFC 3339 与 ES 规范只认 ±HH:MM——跨解析器可能被拒');
    return finish('iso', 'ISO 8601 / RFC 3339' + kindTextBase, { ms, leapSecond: leap }, {});
  }

  // YYYY-MM（月粒度）
  const mYm = RE_YM.exec(raw);
  if (mYm) {
    const y = parseInt(mYm[1], 10), mo = parseInt(mYm[2], 10);
    if (mo < 1 || mo > 12) return fail('月份 ' + mo + ' 越界（1-12）');
    const ms = utcMs(y, mo, 1, 0, 0, 0, 0);
    pits.push({ code: 'month-only-utc', level: 'info', message: '年-月粒度按 ' + pad4(y) + '-' + pad2(mo) + '-01T00:00:00 UTC 解读（new Date("' + raw + '") 同语义）——别把它当月尾或本地月初' });
    return finish('month-only', '年-月（按当月 1 日 UTC 零点）', { ms }, {});
  }

  const supported = '支持：now；Unix 秒/毫秒/微秒/纳秒；ISO 8601 / RFC 3339（YYYY-MM-DD[T ]HH:MM[:SS][.f][Z|±HH:MM|±HHMM]）；YYYY-MM；YYYY；RFC 2822 邮件日期；HTTP 日期（IMF-fixdate）';
  return fail('无法识别的日期时间形态「' + raw + '」。' + supported);
}

// ---------- 历法算术（日历 vs 精确双口径） ----------

/**
 * amount: {years?, months?, days?, hours?, minutes?, seconds?}（整数，可负）
 * mode: 'calendar'（墙钟历法口径）| 'exact'（真实时长口径）| 'both'
 * calendar：月/日/时分秒全部在目标时区墙钟上叠加后消解（遇 DST 空洞/歧义如实标注，歧义取早的一次）
 */
function addDuration(ms, amount, zone, mode) {
  const a = amount || {};
  const years = Math.trunc(a.years || 0), months = Math.trunc(a.months || 0);
  const days = Math.trunc(a.days || 0), hours = Math.trunc(a.hours || 0);
  const minutes = Math.trunc(a.minutes || 0), seconds = Math.trunc(a.seconds || 0);
  const pits = [];
  const mode2 = mode || 'both';

  let calendar = null;
  if (mode2 === 'calendar' || mode2 === 'both') {
    const p = projectZone(ms, zone);
    let y = p.wall.y + years, mo = p.wall.mo + months;
    const norm = { y, mo };
    while (norm.mo > 12) { norm.mo -= 12; norm.y++; }
    while (norm.mo < 1) { norm.mo += 12; norm.y--; }
    const dim = daysInMonth(norm.y, norm.mo);
    let d = p.wall.d + days;
    let clamped = false;
    // 月末钳制只对加月/年生效（加天数的越界是正当滚动，不是钳制对象）
    if (days === 0 && d > dim) { d = dim; clamped = true; }
    if (clamped) {
      pits.push({ code: 'month-clamp', level: 'warn', message: '月末钳制：' + p.wall.y + '-' + pad2(p.wall.mo) + '-' + pad2(p.wall.d) + ' 加月后 ' + pad4(norm.y) + '-' + pad2(norm.mo) + ' 月没有 ' + p.wall.d + ' 日，已钳到 ' + d + ' 日；JS 的 date.setMonth 走回卷语义（溢出天数滚进下个月初）——两种引擎结果不同，跨语言对账要当心' });
    }
    const wall2 = normalizeWall(norm.y, norm.mo, d, p.wall.h + hours, p.wall.mi + minutes, p.wall.s + seconds);
    const rv = resolveWall(wall2, zone);
    let instantMs, resolvedNote = '';
    if (rv.status === 'unique') instantMs = rv.instantMs;
    else if (rv.status === 'ambiguous') { instantMs = rv.instantMs; resolvedNote = '结果墙钟时间出现两次（DST 回拨），取早的一次'; }
    else { instantMs = rv.transition; resolvedNote = '结果墙钟时间不存在（DST 前拨空洞），已取切换瞬间（墙钟直接到 ' + pad2(rv.wallJustAfter.h) + ':' + pad2(rv.wallJustAfter.mi) + '）'; pits.push({ code: 'dst-gap', level: 'error', message: '算术结果 ' + pad2(wall2.h) + ':' + pad2(wall2.mi) + ':' + pad2(wall2.s) + ' 在 ' + zone + ' 不存在（DST 空洞）' }); }
    if (rv.status === 'ambiguous') pits.push({ code: 'dst-ambiguous', level: 'warn', message: '算术结果在 ' + zone + ' 出现两次（DST 回拨），取早的一次' });
    const offsetShift = getOffset(instantMs, zone) - p.offsetMin;
    calendar = {
      instantMs, wallAfter: wall2, resolvedStatus: rv.status, clamped,
      realDeltaMs: instantMs - ms,
      wallDeltaText: years + ' 年 ' + months + ' 月 ' + days + ' 天 ' + hours + ' 时 ' + minutes + ' 分 ' + seconds + ' 秒',
      offsetShiftMin: offsetShift,
      note: resolvedNote + (offsetShift !== 0 ? '；期间时区偏移变化 ' + (offsetShift > 0 ? '+' : '') + offsetShift + ' 分钟' + (offsetShift !== 0 ? '（DST），墙钟保形但真实时长 ≠ 日历时长' : '') : ''),
    };
  }

  let exact = null;
  if (mode2 === 'exact' || mode2 === 'both') {
    if (years !== 0 || months !== 0) {
      if (mode2 === 'exact') {
        return { ok: false, error: 'exact 模式不支持 years/months（历法月长度不定，请用 calendar 或 both 模式）', pits };
      }
      // both 模式含历法单位：只出日历口径，无精确口径可比
      pits.push({ code: 'no-exact-counterpart', level: 'info', message: 'years/months 是历法单位（月长度不定），没有对应的精确时长口径——本结果只有日历口径' });
    } else {
      const deltaSec = days * 86400 + hours * 3600 + minutes * 60 + seconds;
      exact = { instantMs: ms + deltaSec * 1000, realDeltaMs: deltaSec * 1000 };
    }
  }

  const differ = calendar && exact ? calendar.instantMs !== exact.instantMs : null;
  if (differ) {
    const diffMin = Math.round((calendar.instantMs - exact.instantMs) / 60000);
    pits.push({ code: 'calendar-vs-exact', level: 'warn', message: '两口径差 ' + diffMin + ' 分钟：日历口径保墙钟形（跨过 DST 边界偏移变化 ' + calendar.offsetShiftMin + ' 分钟），精确口径保真实时长——选错口径是日程漂移的经典来源' });
  }
  return { ok: true, zone, mode: mode2, calendar, exact, differ, pits };
}

module.exports = {
  CORE_VERSION,
  utcMs, normalizeWall, daysInMonth, isLeap,
  isValidZone, localZone, listZones,
  projectZone, getOffset, resolveWall, wallMatches,
  analyze, addDuration, formatAll, isoWeekOf, dayOfYear,
  pad2, pad4, fmtOffsetMin, fmtOffsetRFC, parseUnixNumeric,
};
