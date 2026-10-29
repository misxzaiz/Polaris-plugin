'use strict';
/**
 * core.js —— 日程提醒（sundial）三方共享纯函数核心（零依赖，浏览器 / node 同源一致）
 *
 * 职责（面板 / MCP / 服务共用同一实现，保证「同一份事件」三端口径一字不差）：
 *   - 事件规范化（normalizeEvent：校验/裁剪/默认值，写入口径唯一）
 *   - RRULE 解析与展开（RFC 5545 实用子集：DAILY/WEEKLY/MONTHLY/YEARLY +
 *     INTERVAL/BYDAY/BYMONTHDAY/BYMONTH/UNTIL/COUNT；友好中文别名输入）
 *   - 提醒投影计算（computeReminders：到期窗口 / done-skip-ack 抑制 / 全天事件锚定本地 09:00）
 *   - 习惯连击（computeStreak：今天未完成不打断昨日连击）
 *   - 倒计时（countdownInfo：下一次发生 → D-N）
 *   - ICS 解析（unfold / VEVENT / VTIMEZONE 换算规则 / EXDATE / RECURRENCE-ID）
 *   - ICS 同步计划（planIcsSync：按 uid 幂等 upsert + 失踪删除 + 保留 done/提醒）
 *   - 保留策略（planRetention）与设置/订阅规范化
 *   - SSRF 守卫（isFetchableUrl：ICS 订阅 URL 属三方数据，抓取前必须过门）
 *
 * 时区策略（如实边界）：
 *   - `Z` 结尾 → UTC；浮动（无 Z 无 TZID）→ 本机时区；TZID → 优先用 ICS 自带
 *     VTIMEZONE 的 STANDARD/DAYLIGHT 换算规则求即时偏移；无 VTIMEZONE 时回落
 *     FIXED_OFFSETS 固定偏移表（DST 时区夏半年可能偏差 1 小时，README 如实声明）。
 *   - 全天事件 start = 当日 UTC 零点，渲染一律走 UTC 日期分量（日期语义跨时区稳定）；
 *     其提醒锚定「当天本地 09:00」。
 */

const { sha256Hex } = require('./sha256');

const TITLE_CAP = 200;
const NOTES_CAP = 2000;
const TAG_CAP = 24;
const URL_CAP = 800;
const MAX_OCC = 500;          // 单次展开发生数上限
const MAX_ITER = 20000;       // 展开迭代硬上限（坏规则防死循环）
const DONE_MAP_CAP = 400;     // 单事件发生标记上限（超出裁最旧）
const DAY_MS = 86400000;

// ── SSRF 守卫（与 feed-radar/clip-relay 同语义：只放行公网 http(s)）─────────
function isFetchableUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl || '')); } catch (_) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (h === '::1' || h === '[::1]' || h === '0.0.0.0') return false;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const oct = v4.slice(1).map((x) => parseInt(x, 10));
    if (oct.some((x) => x > 255)) return false;
    const [a, b] = oct;
    if (a === 127 || a === 10 || a === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false; // 链路本地/云元数据
  }
  return true;
}

// ── 实体解码与裁剪 ────────────────────────────────────────────────────────────
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const code = parseInt(h, 16);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    })
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function clip(s, cap) {
  return decodeEntities(String(s || '')).trim().slice(0, cap);
}

function oneLine(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

// ── 稳定 id ──────────────────────────────────────────────────────────────────
function eventIdFor(seed) { return 'e' + sha256Hex(String(seed)).slice(0, 12); }
function icsIdFor(url) { return 'c' + sha256Hex(String(url).trim().toLowerCase()).slice(0, 10); }
function icsEventId(icsId, uid) { return 'e' + sha256Hex(icsId + '|' + String(uid)).slice(0, 12); }

// ── 星期与日期工具（wd: 0=周日…6=周六；RFC BYDAY: MO=1…SU=7→内部统一 0..6）────
const WD_BY_NAME = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const WD_NAME_BY_NUM = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const WD_CN = ['日', '一', '二', '三', '四', '五', '六'];

function localD(y, m, d, hh, mm) { return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime(); }
function localParts(ts) {
  const dt = new Date(ts);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(), hh: dt.getHours(), mm: dt.getMinutes(), wd: dt.getDay() };
}
function utcParts(ts) {
  const dt = new Date(ts);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
/** 发生键：全天按 UTC 日期串（跨时区稳定）；按时刻按 epoch ms */
function occKey(startTs, allDay) {
  if (!allDay) return String(startTs);
  const p = utcParts(startTs);
  return `d${p.y}${String(p.m).padStart(2, '0')}${String(p.d).padStart(2, '0')}`;
}
/** 全天事件的提醒锚点：当天本地 09:00 */
function allDayAnchor(startTs) {
  const p = utcParts(startTs);
  return localD(p.y, p.m, p.d, 9, 0);
}

// ── 时间输入解析（MCP/面板共用口径）──────────────────────────────────────────
/**
 * parseWhen：接受 epoch ms（number）或字符串：
 *   "2026-10-28"                      → 全天（UTC 零点）
 *   "2026-10-28 15:00[:60]"           → 本机时区时刻
 *   "2026-10-28T15:00[:60][Z|±HH:mm]" → ISO（无时区=本机）
 * @returns {{ts:number, allDay:boolean}|null}
 */
function parseWhen(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return { ts: Math.floor(raw), allDay: false };
  const s = String(raw || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const ts = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    if (!Number.isFinite(ts)) return null;
    const p = utcParts(ts);
    if (p.y !== +m[1] || p.m !== +m[2] || p.d !== +m[3]) return null; // 拒绝 2 月 30 日
    return { ts, allDay: true };
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(Z|[+-]\d{1,2}:?\d{2})?$/);
  if (!m) return null;
  const [, ys, mos, ds, hs, mins, ss, zone] = m;
  const y = +ys, mo = +mos, d = +ds, h = +hs, mi = +mins, sec = ss ? +ss : 0;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;
  let ts;
  if (zone === 'Z') ts = Date.UTC(y, mo - 1, d, h, mi, sec);
  else if (zone) {
    const om = zone.match(/^([+-])(\d{1,2}):?(\d{2})$/);
    if (!om) return null;
    const off = (+om[2] * 60 + +om[3]) * (om[1] === '-' ? -1 : 1);
    ts = Date.UTC(y, mo - 1, d, h, mi, sec) - off * 60000;
  } else ts = localD(y, mo, d, h, mi) + sec * 1000;
  if (!Number.isFinite(ts)) return null;
  return { ts, allDay: false };
}

// ── RRULE 解析（RFC 5545 实用子集）───────────────────────────────────────────
const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const UNSUPPORTED_KEYS = ['BYSETPOS', 'BYWEEKNO', 'BYYEARDAY', 'BYHOUR', 'BYMINUTE', 'BYSECOND', 'BYMONTHDAY_INVALID'];

/** 解析 RRULE 串（our canonical 形态）→ 结构化；不支持的部分报错 */
function parseRrule(str) {
  const raw = String(str || '').trim();
  if (!raw) return null;
  const parts = raw.split(';');
  const r = { freq: '', interval: 1, byday: [], bymonthday: [], bymonth: [], until: null, count: 0, untilTs: 0 };
  for (const part of parts) {
    const i = part.indexOf('=');
    if (i < 1) return { error: `重复规则片段不合法：${oneLine(part, 30)}` };
    const k = part.slice(0, i).toUpperCase();
    const v = part.slice(i + 1).trim();
    if (k === 'FREQ') {
      const f = v.toUpperCase();
      if (!FREQS.includes(f)) return { error: `不支持的重复频率：${f}（支持 DAILY/WEEKLY/MONTHLY/YEARLY）` };
      r.freq = f;
    } else if (k === 'INTERVAL') {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n) || n < 1 || n > 999) return { error: 'INTERVAL 需为 1-999 的整数' };
      r.interval = n;
    } else if (k === 'BYDAY') {
      for (const tok of v.split(',').map((x) => x.trim().toUpperCase())) {
        const mm = tok.match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/);
        if (!mm) return { error: `BYDAY 不合法：${tok}` };
        const nth = mm[1] ? parseInt(mm[1], 10) : 0;
        if (nth < -53 || nth > 53) return { error: `BYDAY 序数越界：${tok}` };
        r.byday.push({ wd: WD_BY_NAME[mm[2]], nth });
      }
    } else if (k === 'BYMONTHDAY') {
      for (const tok of v.split(',').map((x) => x.trim())) {
        const n = parseInt(tok, 10);
        if (!Number.isFinite(n) || n === 0 || n < -31 || n > 31) return { error: `BYMONTHDAY 不合法：${tok}` };
        r.bymonthday.push(n);
      }
    } else if (k === 'BYMONTH') {
      for (const tok of v.split(',').map((x) => x.trim())) {
        const n = parseInt(tok, 10);
        if (!Number.isFinite(n) || n < 1 || n > 12) return { error: `BYMONTH 不合法：${tok}` };
        r.bymonth.push(n);
      }
    } else if (k === 'UNTIL') {
      const u = v.length === 10 ? `${v.slice(0, 4)}-${v.slice(5, 7)}-${v.slice(8, 10)}` : null;
      if (u && /^\d{4}-\d{2}-\d{2}$/.test(u)) r.untilTs = Date.UTC(+u.slice(0, 4), +u.slice(5, 7) - 1, +u.slice(8, 10)) + DAY_MS - 1;
      else if (/^\d{8}T\d{6}Z$/.test(v)) r.untilTs = Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8), +v.slice(9, 11), +v.slice(11, 13), +v.slice(13, 15));
      else if (/^\d{8}$/.test(v)) r.untilTs = Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8)) + DAY_MS - 1;
      else return { error: `UNTIL 不合法：${oneLine(v, 30)}（支持 20261231 / 20261231T235900Z）` };
      r.until = v;
    } else if (k === 'COUNT') {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n) || n < 1 || n > 9999) return { error: 'COUNT 需为 1-9999 的整数' };
      r.count = n;
    } else if (UNSUPPORTED_KEYS.includes(k)) {
      return { error: `暂不支持重复规则参数：${k}` };
    } else {
      return { error: `未知重复规则参数：${k}` };
    }
  }
  if (!r.freq) return { error: '重复规则缺少 FREQ' };
  if (r.byday.some((b) => b.nth !== 0) && r.freq !== 'MONTHLY') return { error: '带序数的 BYDAY 仅在 MONTHLY 下支持' };
  return { r };
}

/**
 * friendlyRrule：把用户/AI 的友好写法归一为 canonical RRULE 串（'' = 不重复）。
 * 支持：'' | daily|每天 | weekdays|工作日 | weekly[:MO,WE]|每周[一] | monthly[:15|-1]|每月[15号]
 *       yearly|每年 | 或直接传 FREQ=... 完整串；可再接 ;COUNT=n / ;UNTIL=...
 * @returns {{rrule:string}|{error:string}}
 */
function friendlyRrule(input) {
  let s = String(input ?? '').trim();
  if (!s || s === 'none' || s === '不重复' || s === '无') return { rrule: '' };
  s = s.replace(/^repeat[:=]/i, '');
  // 中文友好写法归一（顺序敏感：带参的先于裸头）
  let mCn;
  mCn = s.match(/^每月\s*(末|-?\d{1,2})\s*号?(;.*)?$/); // 每月15号 / 每月末
  if (mCn) s = 'monthly:' + (mCn[1] === '末' ? '-1' : mCn[1]) + (mCn[2] || '');
  mCn = s.match(/^(每周|每星期)([日一二三四五六周、,，\s]+)$/); // 每周一、周三（枚举项可带「周」前缀）
  if (mCn) {
    const set = new Set();
    for (const ch of mCn[2].replace(/[周、,，\s]/g, '')) {
      const i = WD_CN.indexOf(ch);
      if (i < 0) return { error: `不认识的星期：${ch}` };
      set.add(WD_NAME_BY_NUM[i]);
    }
    s = 'weekly:' + [...set].join(',');
  }
  s = s.replace(/^(每天|每日)(?=[;:]|$)/, 'daily')
    .replace(/^工作日(?=[;:]|$)/, 'weekdays')
    .replace(/^每年(?=[;:]|$)/, 'yearly')
    .replace(/^(每周|每星期)(?=[;:]|$)/, 'weekly')
    .replace(/^每月(?=[;:]|$)/, 'monthly');
  const m = s.match(/^(daily|weekdays|weekly|monthly|yearly)(?::([^;]+))?(;.*)?$/i);
  if (m) {
    const head = m[1].toLowerCase();
    const arg = (m[2] || '').trim();
    const tail = (m[3] || '').replace(/^;/, '');
    let base = '';
    if (head === 'daily' || head === '每天') base = 'FREQ=DAILY';
    else if (head === 'weekdays' || head === '工作日') base = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    else if (head === 'weekly') {
      base = 'FREQ=WEEKLY';
      if (arg) {
        const days = arg.split(/[,，]/).map((x) => x.trim().toUpperCase());
        const cn = days.map((x) => (x.length === 1 && WD_CN.includes(x) ? WD_NAME_BY_NUM[WD_CN.indexOf(x)] : x));
        for (const d of cn) if (!(d in WD_BY_NAME)) return { error: `BYDAY 不合法：${d}` };
        base += ';BYDAY=' + cn.join(',');
      }
    } else if (head === 'monthly') {
      base = 'FREQ=MONTHLY';
      if (arg) {
        if (!/^-?\d{1,2}$/.test(arg)) return { error: `monthly 序号不合法：${arg}（如 15 / -1=月末）` };
        base += ';BYMONTHDAY=' + arg;
      }
    } else if (head === 'yearly') base = 'FREQ=YEARLY';
    const full = tail ? `${base};${tail}` : base;
    return friendlyRrule(full); // 尾巴（COUNT/UNTIL）走完整校验
  }
  const parsed = parseRrule(s.toUpperCase());
  if (parsed.error) return { error: parsed.error };
  // canonical 化重排（键顺序固定，方便比较与展示）
  const r = parsed.r;
  const segs = [`FREQ=${r.freq}`];
  if (r.interval !== 1) segs.push(`INTERVAL=${r.interval}`);
  if (r.byday.length) segs.push(`BYDAY=${r.byday.map((b) => (b.nth ? b.nth : '') + WD_NAME_BY_NUM[b.wd]).join(',')}`);
  if (r.bymonthday.length) segs.push(`BYMONTHDAY=${r.bymonthday.join(',')}`);
  if (r.bymonth.length) segs.push(`BYMONTH=${r.bymonth.join(',')}`);
  if (r.count) segs.push(`COUNT=${r.count}`);
  if (r.until) segs.push(`UNTIL=${r.until}`);
  return { rrule: segs.join(';') };
}

/** 重复规则的人类描述（面板/对 AI 展示） */
function describeRrule(rruleStr, startTs) {
  const parsed = parseRrule(rruleStr);
  if (!parsed || parsed.error || !parsed.r) return '不重复';
  const r = parsed.r;
  let head = '';
  if (r.freq === 'DAILY') head = r.interval === 1 ? '每天' : `每 ${r.interval} 天`;
  else if (r.freq === 'WEEKLY') {
    if (r.byday.length) {
      const names = [...r.byday].sort((a, b) => a.wd - b.wd).map((b) => '周' + WD_CN[b.wd]);
      head = (r.interval === 1 ? '每' : `每 ${r.interval} 周 `) + names.join('、');
    } else head = r.interval === 1 ? '每周' : `每 ${r.interval} 周`;
  } else if (r.freq === 'MONTHLY') {
    if (r.bymonthday.length) head = r.interval === 1 ? `每月 ${r.bymonthday.join('/')} 日` : `每 ${r.interval} 个月的 ${r.bymonthday.join('/')} 日`;
    else if (r.byday.length && r.byday[0].nth) {
      const b = r.byday[0];
      const nth = b.nth < 0 ? `倒数 ${-b.nth}` : `第 ${b.nth}`;
      head = `${r.interval === 1 ? '每月' : `每 ${r.interval} 个月`} ${nth} 个周${WD_CN[b.wd]}`;
    } else head = r.interval === 1 ? '每月' : `每 ${r.interval} 个月`;
  } else {
    if (r.bymonth.length && r.bymonthday.length) head = `每年 ${r.bymonth.join('/')} 月 ${r.bymonthday.join('/')} 日`;
    else head = r.interval === 1 ? '每年' : `每 ${r.interval} 年`;
  }
  let tail = '';
  if (r.count) tail += `，共 ${r.count} 次`;
  if (r.untilTs) tail += `，到 ${fmtDay(r.untilTs)} 止`;
  return head + tail;
}

// ── RRULE 展开 ───────────────────────────────────────────────────────────────
/**
 * expandOccurrences：返回事件在 [t0, t1] 内「与其自身时长有重叠」的发生列表
 * （{ start, key }，升序；全天 start=UTC 零点）。窗口外不产生；COUNT/UNTIL 从
 * 事件 start 起算（RFC 语义）。单次展开上限 MAX_OCC。
 */
function expandOccurrences(event, t0, t1, opts) {
  const maxOcc = (opts && opts.max) || MAX_OCC;
  if (!event || !Number.isFinite(event.start)) return [];
  const allDay = !!event.allDay;
  const durMs = Math.max(0, Math.floor(Number(event.durationMin) || 0)) * 60000;
  const out = [];
  const emit = (ts) => {
    if (out.length >= maxOcc) return false;
    const end = ts + durMs;
    if (ts <= t1 && end >= t0) out.push({ start: ts, key: occKey(ts, allDay) });
    return true;
  };
  const rrule = String(event.rrule || '').trim();
  if (!rrule) {
    const ts = allDay ? dayStartUtc(event.start) : event.start;
    emit(ts);
    return out.sort((a, b) => a.start - b.start);
  }
  const parsed = parseRrule(rrule);
  if (!parsed || parsed.error || !parsed.r) return [];
  const r = parsed.r;
  let count = 0;
  const accept = (ts) => {
    if (r.untilTs && ts > r.untilTs) return false;
    count++;
    if (r.count && count > r.count) return false;
    return emit(ts);
  };

  if (allDay) {
    // 全天：UTC 日期网格（日期语义稳定，不受渲染端时区影响）
    const p = utcParts(event.start);
    const base = { y: p.y, m: p.m, d: p.d };
    if (r.freq === 'DAILY') {
      for (let k = 0; k < MAX_ITER; k++) {
        const ts = Date.UTC(base.y, base.m - 1, base.d + k * r.interval);
        if (ts > t1 + durMs) break;
        if (!accept(ts)) break;
        if (r.untilTs && ts > r.untilTs) break;
      }
    } else if (r.freq === 'WEEKLY') {
      const days = (r.byday.length ? r.byday.map((b) => b.wd) : [new Date(Date.UTC(base.y, base.m - 1, base.d)).getUTCDay()]).sort((a, b) => a - b);
      const dow = new Date(Date.UTC(base.y, base.m - 1, base.d)).getUTCDay();
      const mondayOff = (dow + 6) % 7; // 距周一的天数
      outer1: for (let w = 0; w < MAX_ITER / 7; w++) {
        for (const dOff of days) {
          const dayIdx = w * 7 * r.interval + (dOff + 6) % 7 - mondayOff;
          if (dayIdx < 0) continue;
          const ts = Date.UTC(base.y, base.m - 1, base.d + dayIdx);
          if (ts > t1 + durMs) break outer1;
          if (!accept(ts)) break outer1;
          if (r.untilTs && ts > r.untilTs) break outer1;
        }
      }
    } else if (r.freq === 'MONTHLY') {
      outer2: for (let k = 0; k < MAX_ITER / 28; k++) {
        const mIdx = (base.m - 1) + k * r.interval;
        const days = r.bymonthday.length
          ? r.bymonthday
          : (r.byday.length && r.byday[0].nth ? null : [base.d]);
        if (days) {
          for (const d of days) {
            const dd = d < 0 ? daysInMonthUtc(base.y, mIdx) + 1 + d : d; // -1 = 月末
            const ts = Date.UTC(base.y, mIdx, dd);
            if (new Date(ts).getUTCDate() !== dd) continue; // 月内无此日（如 2/30）
            if (ts < Date.UTC(base.y, base.m - 1, base.d)) continue;
            if (ts > t1 + durMs) break outer2;
            if (!accept(ts)) break outer2;
            if (r.untilTs && ts > r.untilTs) break outer2;
          }
        } else {
          const ts = nthWeekdayUtc(base.y, mIdx, r.byday[0].nth, r.byday[0].wd);
          if (ts && ts >= Date.UTC(base.y, base.m - 1, base.d)) {
            if (ts > t1 + durMs) break outer2;
            if (!accept(ts)) break outer2;
            if (r.untilTs && ts > r.untilTs) break outer2;
          }
        }
      }
    } else { // YEARLY
      const months = r.bymonth.length ? r.bymonth : [base.m];
      const days = r.bymonthday.length ? r.bymonthday : (r.byday.length && r.byday[0].nth ? null : [base.d]);
      outer3: for (let k = 0; k < MAX_ITER / 365; k++) {
        for (const mo of months) {
          let tsList;
          if (days) {
            tsList = days.map((d) => {
              const dd = d < 0 ? daysInMonthUtc(base.y + k * r.interval, mo - 1) + 1 + d : d;
              return Date.UTC(base.y + k * r.interval, mo - 1, dd);
            });
          } else {
            const t = nthWeekdayUtc(base.y + k * r.interval, mo - 1, r.byday[0].nth, r.byday[0].wd);
            tsList = t ? [t] : [];
          }
          for (const ts of tsList) {
            if (new Date(ts).getUTCMonth() !== ((mo - 1 + 12 * 1200) % 12)) continue; // 2/29 平年等溢出
            if (ts < Date.UTC(base.y, base.m - 1, base.d)) continue;
            if (ts > t1 + durMs) break outer3;
            if (!accept(ts)) break outer3;
            if (r.untilTs && ts > r.untilTs) break outer3;
          }
        }
      }
    }
    return out.sort((a, b) => a.start - b.start);
  }

  // 按时刻：本机时区网格（Date 本地构造天然处理 DST）
  const p = localParts(event.start);
  const firstTs = event.start;
  const acceptLocal = (ts) => {
    if (ts > t1) return false;
    return accept(ts);
  };
  if (r.freq === 'DAILY') {
    for (let k = 0; k < MAX_ITER; k++) {
      const ts = localD(p.y, p.m, p.d + k * r.interval, p.hh, p.mm);
      if (ts < firstTs - 1) continue;
      if (!acceptLocal(ts)) break;
      if (ts > t1) break;
    }
  } else if (r.freq === 'WEEKLY') {
    const days = (r.byday.length ? r.byday.map((b) => b.wd) : [p.wd]).sort((a, b) => a - b);
    const mondayOff = (p.wd + 6) % 7;
    outer4: for (let w = 0; w < MAX_ITER / 7; w++) {
      for (const wd of days) {
        const dayShift = w * 7 * r.interval + ((wd + 6) % 7) - mondayOff;
        const ts = localD(p.y, p.m, p.d + dayShift, p.hh, p.mm);
        if (ts < firstTs - 1) continue;
        if (ts > t1) break outer4;
        if (!acceptLocal(ts)) break outer4;
      }
    }
  } else if (r.freq === 'MONTHLY') {
    outer5: for (let k = 0; k < MAX_ITER / 28; k++) {
      const mShift = k * r.interval;
      if (r.bymonthday.length) {
        for (const d of r.bymonthday) {
          const dd = d < 0 ? daysInMonthLocal(p.y, p.m + mShift) + 1 + d : d; // -1 = 月末
          const ts = localD(p.y, p.m + mShift, dd, p.hh, p.mm);
          const lp = localParts(ts);
          if (lp.d !== dd) continue; // 月内无此日
          if (ts < firstTs - 1) continue;
          if (ts > t1) break outer5;
          if (!acceptLocal(ts)) break outer5;
        }
      } else if (r.byday.length && r.byday[0].nth) {
        const b = r.byday[0];
        const ts = nthWeekdayLocal(p.y, p.m + mShift, b.nth, b.wd, p.hh, p.mm);
        if (ts && ts >= firstTs - 1) {
          if (ts > t1) break outer5;
          if (!acceptLocal(ts)) break outer5;
        }
      } else {
        const ts = localD(p.y, p.m + mShift, p.d, p.hh, p.mm);
        const lp = localParts(ts);
        if (lp.d !== p.d) { /* 月内无此日，跳过 */ }
        else {
          if (ts < firstTs - 1) continue;
          if (ts > t1) break outer5;
          if (!acceptLocal(ts)) break outer5;
        }
      }
    }
  } else { // YEARLY
    const months = r.bymonth.length ? r.bymonth : [p.m];
    const days = r.bymonthday.length ? r.bymonthday : [p.d];
    outer6: for (let k = 0; k < MAX_ITER / 365; k++) {
      for (const mo of months) {
        for (const d of days) {
          const dd = d < 0 ? daysInMonthLocal(p.y + k * r.interval, mo) + 1 + d : d;
          const ts = localD(p.y + k * r.interval, mo, dd, p.hh, p.mm);
          if (localParts(ts).d !== dd) continue; // 2/29 平年
          if (ts < firstTs - 1) continue;
          if (ts > t1) break outer6;
          if (!acceptLocal(ts)) break outer6;
        }
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function dayStartUtc(ts) {
  const p = utcParts(ts);
  return Date.UTC(p.y, p.m - 1, p.d);
}
/** 某月天数（UTC 语义，mIdx0 为 0 起月份，可溢出） */
function daysInMonthUtc(y, mIdx0) {
  return new Date(Date.UTC(y, mIdx0 + 1, 0)).getUTCDate();
}
/** 某月天数（本地语义，m0 为 1 起月份，可溢出） */
function daysInMonthLocal(y, m0) {
  return new Date(y, m0, 0).getDate();
}
/** 某月第 n 个星期几（UTC 零点；n<0 倒数） */
function nthWeekdayUtc(y, mIdx0, nth, wd) {
  const first = new Date(Date.UTC(y, mIdx0, 1));
  const shift = (wd - first.getUTCDay() + 7) % 7;
  let day;
  if (nth > 0) day = 1 + shift + (nth - 1) * 7;
  else {
    const last = new Date(Date.UTC(y, mIdx0 + 1, 0)).getUTCDate();
    const lastDow = new Date(Date.UTC(y, mIdx0 + 1, 0)).getUTCDay();
    day = last - ((lastDow - wd + 7) % 7) - (-nth - 1) * 7;
  }
  const ts = Date.UTC(y, mIdx0, day);
  return new Date(ts).getUTCMonth() === ((mIdx0 % 12) + 12) % 12 ? ts : 0;
}
/** 某月第 n 个星期几（本地；n<0 倒数） */
function nthWeekdayLocal(y, m0, nth, wd, hh, mm) {
  const first = new Date(y, m0 - 1, 1);
  const shift = (wd - first.getDay() + 7) % 7;
  let day;
  if (nth > 0) day = 1 + shift + (nth - 1) * 7;
  else {
    const lastDt = new Date(y, m0, 0);
    const last = lastDt.getDate();
    day = last - ((lastDt.getDay() - wd + 7) % 7) - (-nth - 1) * 7;
  }
  const ts = localD(y, m0, day, hh, mm);
  return localParts(ts).d === day ? ts : 0;
}

// ── 提醒投影 ─────────────────────────────────────────────────────────────────
/**
 * computeReminders：当前「应提醒」列表（纯函数；服务每 tick 重算写投影）。
 * 到期窗口 [remindAt, 锚点+grace]；被发生 done/skip、面板 ack（ackAt > remindAt）抑制。
 * @param events 事件数组（含 done map）
 * @param now 当前时刻
 * @param opts { acked?: Record<string, number>, graceMin?: number, cap?: number, horizonDays?: number }
 */
function computeReminders(events, now, opts) {
  const o = opts || {};
  const graceMs = Math.max(1, Math.floor(Number(o.graceMin ?? 30))) * 60000;
  const cap = Math.max(1, Math.floor(Number(o.cap ?? 50)));
  const acked = o.acked && typeof o.acked === 'object' ? o.acked : {};
  let maxOffset = 0;
  for (const e of events) {
    const arr = Array.isArray(e.remind) ? e.remind : [];
    for (const n of arr) if (Number.isFinite(n)) maxOffset = Math.max(maxOffset, Number(n));
  }
  const t0 = now - graceMs;
  const t1 = now + maxOffset * 60000 + 60000;
  const out = [];
  const live = (Array.isArray(events) ? events : []).filter((e) => e && e.enabled !== false && Array.isArray(e.remind) && e.remind.length);
  for (const e of live) {
    const occs = expandOccurrences(e, t0, t1);
    for (const occ of occs) {
      if (e.done && (e.done[occ.key] === 'done' || e.done[occ.key] === 'skip')) continue;
      for (const off of e.remind) {
        const n = Number(off);
        if (!Number.isFinite(n) || n < 0) continue;
        const anchor = e.allDay ? allDayAnchor(occ.start) : occ.start;
        const remindAt = anchor - n * 60000;
        if (remindAt > now || now >= anchor + graceMs) continue;
        const id = `${e.id}|${occ.key}|${n}`;
        if (Number(acked[id]) > remindAt) continue; // 面板已确认
        out.push({
          id, eventId: e.id, title: e.title, kind: e.kind || 'event',
          start: occ.start, occKey: occ.key, allDay: !!e.allDay,
          offsetMin: n, remindAt,
        });
      }
    }
  }
  out.sort((a, b) => a.remindAt - b.remindAt || (a.title < b.title ? -1 : 1));
  return out.slice(0, cap);
}

// ── 习惯连击与倒计时 ─────────────────────────────────────────────────────────
/**
 * computeStreak：从最近一个已排期发生（≤今天结束）往回数连续 done。
 * 今天这次的未完成不打断昨日连击（宽限）。
 */
function computeStreak(event, now) {
  if (!event || !event.rrule) return event && event.done && Object.values(event.done).some((v) => v === 'done') ? 1 : 0;
  const endOfToday = (() => { const p = localParts(now); return localD(p.y, p.m, p.d + 1, 0, 0) - 1; })();
  const occs = expandOccurrences(event, now - 400 * DAY_MS, endOfToday, { max: 1000 });
  let streak = 0;
  for (let i = occs.length - 1; i >= 0; i--) {
    const v = event.done ? event.done[occs[i].key] : undefined;
    if (v === 'done') { streak++; continue; }
    if (i === occs.length - 1) continue; // 最近一次（今天）未打卡：宽限，不计入但继续往前数
    break;
  }
  return streak;
}

/** 倒计时信息：下一次发生（含今天）距今的天数；已过期一次性事件返回 null */
function countdownInfo(event, now) {
  if (!event || !Number.isFinite(event.start)) return null;
  const occs = expandOccurrences(event, event.allDay ? dayStartUtc(now) : now, (event.allDay ? dayStartUtc(now) : now) + 400 * DAY_MS, { max: 2 });
  if (!occs.length) return null;
  const target = occs[0].start;
  const days = Math.ceil((target - now) / DAY_MS);
  return { targetTs: target, days: Math.max(0, days), key: occs[0].key };
}

// ── 事件规范化（三端唯一写入口径）────────────────────────────────────────────
function normalizeEvent(raw, existing) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  const prev = existing && typeof existing === 'object' ? existing : null;
  // 部分更新（如只改 done/remind）时标题回退到已有值；新建时必须非空
  const title = clip(raw.title !== undefined ? raw.title : (prev ? prev.title : ''), TITLE_CAP);
  if (!title) return { error: '标题不能为空' };
  const when = parseWhen(raw.start !== undefined ? raw.start : (prev ? prev.start : null));
  if (!when) return { error: '时间不合法：支持 2026-10-28（全天）、2026-10-28 15:00、ISO 或毫秒时间戳' };
  const rr = raw.rrule !== undefined ? friendlyRrule(raw.rrule) : { rrule: prev ? String(prev.rrule || '') : '' };
  if (rr.error) return { error: rr.error };
  const allDay = raw.allDay !== undefined ? raw.allDay === true : (prev ? !!prev.allDay : when.allDay);
  let remind = raw.remind !== undefined ? raw.remind : (prev && Array.isArray(prev.remind) ? prev.remind : []);
  if (!Array.isArray(remind)) remind = [];
  const seenOff = new Set();
  // 越界（<0 或 >7 天）直接丢弃而非钳制——负数「提前」语义无意义，静默改 0 会误报
  remind = remind.map((n) => Math.floor(Number(n)))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 10080)
    .filter((n) => { if (seenOff.has(n)) return false; seenOff.add(n); return true; })
    .slice(0, 3);
  let tags = raw.tags !== undefined ? raw.tags : (prev && Array.isArray(prev.tags) ? prev.tags : []);
  if (!Array.isArray(tags)) tags = [];
  tags = tags.map((t) => clip(t, TAG_CAP)).filter(Boolean).slice(0, 5);
  const kindRaw = String(raw.kind !== undefined ? raw.kind : (prev ? prev.kind : 'event'));
  const kind = ['event', 'habit', 'countdown'].includes(kindRaw) ? kindRaw : 'event';
  const doneRaw = raw.done !== undefined ? raw.done : (prev ? prev.done : {});
  const done = {};
  if (doneRaw && typeof doneRaw === 'object') {
    for (const [k, v] of Object.entries(doneRaw)) {
      if ((v === 'done' || v === 'skip') && String(k).length <= 40) done[String(k).slice(0, 40)] = v;
    }
  }
  const durationRaw = raw.durationMin !== undefined ? raw.durationMin : (prev ? prev.durationMin : undefined);
  let durationMin = Math.max(0, Math.floor(Number(durationRaw) || 0));
  if (!Number.isFinite(Number(durationRaw)) && durationRaw === undefined) durationMin = allDay ? 1440 : 0;
  durationMin = Math.min(durationMin, 90 * 1440);
  const event = {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : eventIdFor(title + '|' + when.ts + '|' + Math.random().toString(36).slice(2, 8))),
    title,
    notes: clip(raw.notes !== undefined ? raw.notes : (prev ? prev.notes : ''), NOTES_CAP),
    kind,
    start: when.ts,
    allDay,
    durationMin,
    rrule: rr.rrule,
    remind,
    tags,
    source: prev ? (prev.source || 'manual') : (raw.source === 'ics' ? 'ics' : 'manual'),
    icsId: prev ? prev.icsId || '' : (raw.icsId ? String(raw.icsId).slice(0, 20) : ''),
    uid: prev ? prev.uid || '' : (raw.uid ? String(raw.uid).slice(0, 200) : ''),
    enabled: raw.enabled === undefined ? (prev ? prev.enabled !== false : true) : raw.enabled === true,
    done,
    createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now(),
    rev: prev ? (Number(prev.rev) || 1) + 1 : 1,
  };
  if (raw.start === undefined && prev && prev.start) {
    // 只改其它字段时保持原时间语义（避免隐式 allDay 翻转）
    event.start = prev.start;
    event.allDay = raw.allDay !== undefined ? allDay : !!prev.allDay;
  }
  return { event };
}

// ── 设置与 ICS 订阅规范化 ────────────────────────────────────────────────────
const SETTING_LIMITS = {
  icsIntervalHours: [2, 168, 6],
  retentionDays: [30, 3650, 365],
  reminderGraceMin: [10, 240, 30],
};
function normalizeSettings(raw) {
  const out = {};
  for (const [k, [min, max, dflt]] of Object.entries(SETTING_LIMITS)) {
    const v = Number(raw && typeof raw === 'object' ? raw[k] : undefined);
    out[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : dflt;
  }
  return out;
}

function normalizeIcs(raw, existing) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  let url = String(raw.url || '').trim();
  url = url.replace(/^webcal:\/\//i, 'https://').replace(/^feed:\/\//i, '');
  if (!url) return { error: 'URL 为空' };
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
  if (!isFetchableUrl(url)) return { error: '仅支持公网 http(s) 订阅地址（内网/环回不允许）' };
  const prev = existing && typeof existing === 'object' ? existing : null;
  const ics = {
    id: prev && prev.id ? String(prev.id) : icsIdFor(url),
    url: url.slice(0, URL_CAP),
    name: clip(raw.name, 60) || (prev ? prev.name : '') || '外部日历',
    enabled: raw.enabled === undefined ? (prev ? prev.enabled !== false : true) : raw.enabled === true,
    createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
    etag: prev ? prev.etag || '' : '',
    lastFetchAt: prev ? prev.lastFetchAt || 0 : 0,
    lastStatus: prev ? prev.lastStatus || 'never' : 'never',
    lastError: prev ? prev.lastError || '' : '',
    consecutiveErrors: prev ? prev.consecutiveErrors || 0 : 0,
    eventCount: prev ? Number(prev.eventCount) || 0 : 0,
    rev: prev ? prev.rev || 1 : 1,
  };
  return { ics };
}

// ── 保留策略与 done 裁剪 ─────────────────────────────────────────────────────
/** 一次性（无重复）事件结束超过 retentionDays → 删除；重复事件永留（用户手删） */
function planRetention(events, settings, now) {
  const s = normalizeSettings(settings);
  const del = [];
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || !e.id || e.rrule) continue;
    const end = (e.start || 0) + Math.max(0, Number(e.durationMin) || 0) * 60000;
    if (end > 0 && now - end > s.retentionDays * DAY_MS) del.push(e.id);
  }
  return del;
}
/** done map 超限裁最旧（键序即时间序：epoch 串 / 日期串） */
function pruneDoneMap(done, cap) {
  const c = Math.max(50, Math.floor(Number(cap) || DONE_MAP_CAP));
  if (!done || typeof done !== 'object') return {};
  const keys = Object.keys(done);
  if (keys.length <= c) return done;
  const sorted = keys.sort((a, b) => (a < b ? -1 : 1));
  const out = {};
  for (const k of sorted.slice(keys.length - c)) out[k] = done[k];
  return out;
}

// ── ICS 解析 ────────────────────────────────────────────────────────────────
/** RFC 5545 折行还原 */
function unfoldIcsLines(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1);
    else if (line.length) out.push(line);
  }
  return out;
}

function parseIcsProp(line) {
  const i = line.indexOf(':');
  if (i < 0) return null;
  const left = line.slice(0, i);
  const value = line.slice(i + 1);
  const segs = left.split(';');
  const name = segs[0].toUpperCase();
  const params = {};
  for (const seg of segs.slice(1)) {
    const j = seg.indexOf('=');
    if (j > 0) params[seg.slice(0, j).toUpperCase()] = seg.slice(j + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

/** 解析 ICS 文本 → { vtimezones: Map<tzid, comps[]>, vevents: [props 合集] } */
function parseIcs(text) {
  const lines = unfoldIcsLines(text);
  const vtimezones = new Map();
  const vevents = [];
  let tz = null; let tzComp = null;
  let ev = null;
  for (const line of lines) {
    const up = line.toUpperCase();
    if (up === 'BEGIN:VTIMEZONE') { tz = { comps: [] }; continue; }
    if (up === 'END:VTIMEZONE') {
      if (tz && tz.tzid) vtimezones.set(tz.tzid.toUpperCase(), tz);
      tz = null; tzComp = null; continue;
    }
    if (up === 'BEGIN:STANDARD' || up === 'BEGIN:DAYLIGHT') { tzComp = { type: up.slice(6), rrule: '', offsetFrom: 0, offsetTo: 0, dtstart: '', isDate: false }; continue; }
    if (up === 'END:STANDARD' || up === 'END:DAYLIGHT') { if (tz && tzComp) tz.comps.push(tzComp); tzComp = null; continue; }
    if (up === 'BEGIN:VEVENT') { ev = { exdates: [], categories: [] }; continue; }
    if (up === 'END:VEVENT') { if (ev) vevents.push(ev); ev = null; continue; }
    if (!ev && !tz) continue;
    const prop = parseIcsProp(line);
    if (!prop) continue;
    if (tz) {
      if (prop.name === 'TZID') tz.tzid = prop.value;
      else if (tzComp && prop.name === 'DTSTART') { tzComp.dtstart = prop.value; tzComp.isDate = prop.params.VALUE === 'DATE'; }
      else if (tzComp && prop.name === 'RRULE') tzComp.rrule = prop.value.toUpperCase();
      else if (tzComp && prop.name === 'TZOFFSETFROM') tzComp.offsetFrom = offsetStrToMin(prop.value);
      else if (tzComp && prop.name === 'TZOFFSETTO') tzComp.offsetTo = offsetStrToMin(prop.value);
      continue;
    }
    switch (prop.name) {
      case 'UID': ev.uid = prop.value.trim(); break;
      case 'SUMMARY': ev.summary = prop.value; break;
      case 'DESCRIPTION': ev.description = prop.value; break;
      case 'LOCATION': ev.location = prop.value; break;
      case 'STATUS': ev.status = prop.value.toUpperCase(); break;
      case 'DTSTART': ev.dtstart = prop.value; ev.dtstartParams = prop.params; break;
      case 'DTEND': ev.dtend = prop.value; ev.dtendParams = prop.params; break;
      case 'DURATION': ev.duration = prop.value.toUpperCase(); break;
      case 'RRULE': ev.rrule = prop.value.toUpperCase(); break;
      case 'RECURRENCE-ID': ev.recurrenceId = prop.value; ev.recurrenceParams = prop.params; break;
      case 'CATEGORIES':
        for (const c of prop.value.split(',')) { const t = clip(c, TAG_CAP); if (t) ev.categories.push(t); }
        break;
      case 'EXDATE':
        for (const v of prop.value.split(',')) { const t = v.trim(); if (t) ev.exdates.push({ value: t, params: prop.params }); }
        break;
      default: break; // VALARM 等子组件行在 BEGIN:VALARM 后不应到达这里（被 VEVENT 之外分支吞掉）
    }
  }
  return { vtimezones, vevents };
}

function offsetStrToMin(s) {
  const m = String(s || '').trim().match(/^([+-])(\d{2})(\d{2})?$/);
  if (!m) return 0;
  return (+m[2] * 60 + (+m[3] || 0)) * (m[1] === '-' ? -1 : 1);
}

/** 内置固定偏移表（分钟；无 VTIMEZONE 时的回落。DST 区按标准时，夏半年或差 1h——README 如实声明） */
const FIXED_OFFSETS = {
  'ASIA/SHANGHAI': 480, 'ASIA/URUMQI': 480, 'ASIA/HONG_KONG': 480, 'ASIA/MACAU': 480,
  'ASIA/TAIPEI': 480, 'ASIA/SINGAPORE': 480, 'ASIA/KUALA_LUMPUR': 480, 'ASIA/MANILA': 480,
  'ASIA/TOKYO': 540, 'ASIA/SEOUL': 540, 'ASIA/BANGKOK': 420, 'ASIA/JAKARTA': 420,
  'ASIA/HO_CHI_MINH': 420, 'ASIA/KOLKATA': 330, 'ASIA/KARACHI': 300, 'ASIA/DUBAI': 240,
  'ASIA/RIYADH': 180, 'ASIA/TEHRAN': 210, 'EUROPE/LONDON': 0, 'EUROPE/DUBLIN': 0,
  'EUROPE/LISBON': 0, 'EUROPE/PARIS': 60, 'EUROPE/BERLIN': 60, 'EUROPE/MADRID': 60,
  'EUROPE/ROME': 60, 'EUROPE/AMSTERDAM': 60, 'EUROPE/ZURICH': 60, 'EUROPE/STOCKHOLM': 60,
  'EUROPE/WARSAW': 60, 'EUROPE/PRAGUE': 60, 'EUROPE/VIENNA': 60, 'EUROPE/ATHENS': 120,
  'EUROPE/HELSINKI': 120, 'EUROPE/MOSCOW': 180, 'EUROPE/ISTANBUL': 180, 'AFRICA/CAIRO': 120,
  'AFRICA/LAGOS': 60, 'AFRICA/JOHANNESBURG': 120, 'AMERICA/SAO_PAULO': -180,
  'AMERICA/NEW_YORK': -300, 'AMERICA/TORONTO': -300, 'AMERICA/CHICAGO': -360,
  'AMERICA/MEXICO_CITY': -360, 'AMERICA/DENVER': -420, 'AMERICA/PHOENIX': -420,
  'AMERICA/LOS_ANGELES': -480, 'AMERICA/VANCOUVER': -480, 'AMERICA/ANCHORAGE': -540,
  'PACIFIC/HONOLULU': -600, 'AUSTRALIA/SYDNEY': 600, 'AUSTRALIA/MELBOURNE': 600,
  'AUSTRALIA/BRISBANE': 600, 'AUSTRALIA/PERTH': 480, 'UTC': 0, 'ETC/UTC': 0, 'GMT': 0,
};

/**
 * 时区即时偏移（分钟）：优先 VTIMEZONE 换算规则，回落固定偏移表，再回落 0。
 * VTIMEZONE 求值：每个 STANDARD/DAYLIGHT 分量的切换时刻 = DTSTART（按 TZOFFSETFROM
 * 解释为 UTC）+ 其 YEARLY 递归展开；取 ≤ ts 的最近切换，用其 TZOFFSETTO。
 */
function zoneOffsetAt(tzid, ts, vtimezones) {
  const key = String(tzid || '').trim().toUpperCase();
  if (!key) return null;
  const vtz = vtimezones instanceof Map ? vtimezones.get(key) : null;
  if (vtz && Array.isArray(vtz.comps) && vtz.comps.length) {
    const trans = [];
    const qy = localParts(ts).y; // 年份扩展围绕查询时刻，而非 DTSTART 基准年
    for (const comp of vtz.comps) {
      const base = vtzCompBaseTs(comp);
      if (!base) continue;
      trans.push({ ts: base, off: comp.offsetTo, from: comp.offsetFrom });
      if (comp.rrule) {
        const yearly = parseVtzYearly(comp.rrule);
        if (yearly) {
          const lp = localParts(base + comp.offsetFrom * 60000); // DTSTART 的本地分量（时刻来自它）
          for (let y = qy - 2; y <= qy + 1; y++) {
            let t = 0;
            if (yearly.nth) t = nthWeekdayLocal(y, yearly.bymonth, yearly.nth, yearly.wd, lp.hh, lp.mm);
            else {
              t = localD(y, yearly.bymonth, yearly.bymonthday, lp.hh, lp.mm);
              if (localParts(t).d !== yearly.bymonthday) continue;
            }
            if (t) trans.push({ ts: t - comp.offsetFrom * 60000, off: comp.offsetTo, from: comp.offsetFrom });
          }
        }
      }
    }
    if (trans.length) {
      trans.sort((a, b) => a.ts - b.ts);
      let best = null;
      for (const t of trans) { if (t.ts <= ts) best = t; else break; }
      if (best) return best.off;
      return trans[0].from; // 早于首个切换：用「切换前」偏移
    }
  }
  if (key in FIXED_OFFSETS) return FIXED_OFFSETS[key];
  if (/_$/.test(key) || /^ETC\//.test(key)) {
    const gm = key.match(/GMT([+-])(\d{1,2})/);
    if (gm) return (+gm[2] * 60) * (gm[1] === '-' ? -1 : 1);
  }
  return null;
}

function vtzCompBaseTs(comp) {
  if (!comp || !comp.dtstart) return 0;
  const v = comp.dtstart.trim();
  const dm = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!dm) {
    const dOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (dOnly) return Date.UTC(+dOnly[1], +dOnly[2] - 1, +dOnly[3]);
    return 0;
  }
  const local = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +dm[4], +dm[5], +dm[6]);
  return dm[7] ? local : local - comp.offsetFrom * 60000;
}

/** 解析 VTIMEZONE 的 RRULE（YEARLY;BYMONTH=3;BYDAY=2SU 或 BYMONTHDAY=…） */
function parseVtzYearly(rruleStr) {
  let bymonth = 0; let byday = ''; let bymonthday = 0;
  for (const seg of String(rruleStr || '').split(';')) {
    const i = seg.indexOf('=');
    if (i < 1) continue;
    const k = seg.slice(0, i).toUpperCase();
    const v = seg.slice(i + 1).trim().toUpperCase();
    if (k === 'BYMONTH') bymonth = parseInt(v, 10) || 0;
    else if (k === 'BYDAY') byday = v;
    else if (k === 'BYMONTHDAY') bymonthday = parseInt(v, 10) || 0;
  }
  if (!bymonth) return null;
  if (byday) {
    const m = byday.match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/);
    if (!m) return null;
    return { bymonth, nth: m[1] ? parseInt(m[1], 10) : 1, wd: WD_BY_NAME[m[2]], bymonthday: 0 };
  }
  if (bymonthday) return { bymonth, nth: 0, wd: 0, bymonthday };
  return null;
}

/**
 * 解析一个 ICS 时间值 → { ts, allDay, tzid }
 * value 形态：20261028（全天）/ 20261028T093000（浮动=本机）/ …Z（UTC）
 */
function parseIcsDateTime(value, params, vtimezones) {
  const v = String(value || '').trim();
  const isDate = (params && params.VALUE === 'DATE') || /^\d{8}$/.test(v);
  if (isDate) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return { ts: Date.UTC(+m[1], +m[2] - 1, +m[3]), allDay: true, tzid: '' };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, ys, mos, ds, hs, mins, ss, z] = m;
  const localMs = Date.UTC(+ys, +mos - 1, +ds, +hs, +mins, +ss);
  if (z === 'Z') return { ts: localMs, allDay: false, tzid: '' };
  const tzid = params && params.TZID ? String(params.TZID) : '';
  if (tzid) {
    const off = zoneOffsetAt(tzid, localMs, vtimezones);
    return { ts: localMs - (off === null ? 0 : off) * 60000, allDay: false, tzid };
  }
  // 浮动 → 本机时区
  const [, ly, lmo, ld] = [0, +ys, +mos, +ds];
  return { ts: localD(ly, lmo, ld, +hs, +mins) + (+ss) * 1000, allDay: false, tzid: '' };
}

/** ISO 8601 duration（P1DT2H30M / PT45M / P2W）→ 分钟 */
function parseIcsDuration(s) {
  const m = String(s || '').toUpperCase().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [_, sign, w, d, h, mi, sec] = m;
  const mins = (+w || 0) * 7 * 1440 + (+d || 0) * 1440 + (+h || 0) * 60 + (+mi || 0) + Math.round((+sec || 0) / 60);
  return (sign === '-' ? -1 : 1) * mins;
}

/**
 * icsToRawEvents：ICS 文本 → 原始事件定义数组（无 id；planIcsSync 里定）。
 * RRULE 带不支持参数（BYSETPOS 等）→ 按一次性处理并在 notes 标注，绝不静默丢失标题。
 */
function icsToRawEvents(icsText, icsName, now) {
  const parsed = parseIcs(icsText);
  const raws = [];
  const skipsByUid = {}; // uid → [occKey]（EXDATE / RECURRENCE-ID 联动）
  for (const ev of parsed.vevents) {
    if (!ev.dtstart || !ev.uid) continue;
    if (ev.status === 'CANCELLED') continue;
    const st = parseIcsDateTime(ev.dtstart, ev.dtstartParams, parsed.vtimezones);
    if (!st) continue;
    let durationMin = 0;
    if (ev.duration) durationMin = Math.min(90 * 1440, Math.max(0, parseIcsDuration(ev.duration)));
    else if (ev.dtend) {
      const en = parseIcsDateTime(ev.dtend, ev.dtendParams, parsed.vtimezones);
      if (en) {
        if (st.allDay && en.allDay) durationMin = Math.max(1440, Math.round((en.ts - st.ts) / 60000)); // DTEND;VALUE=DATE 为排他端，差值即天数
        else durationMin = Math.min(90 * 1440, Math.max(0, Math.round((en.ts - st.ts) / 60000)));
      }
    }
    if (st.allDay) durationMin = Math.max(1440, durationMin || 1440);
    let rrule = '';
    let rruleWarn = '';
    if (ev.rrule) {
      const fr = friendlyRrule(ev.rrule);
      if (fr.rrule !== undefined && fr.rrule !== '') rrule = fr.rrule;
      else if (fr.error) rruleWarn = `（重复规则已简化为单次：${fr.error}）`;
    }
    const notesParts = [];
    if (ev.location) notesParts.push(`📍 ${clip(ev.location, 100)}`);
    const desc = clip(ev.description, NOTES_CAP - 200);
    if (desc) notesParts.push(desc);
    if (rruleWarn) notesParts.push(rruleWarn);
    const raw = {
      uid: ev.uid.slice(0, 200),
      rid: ev.recurrenceId ? String(ev.recurrenceId).slice(0, 60) : '', // 例外实例标识（与主事件同 UID，id 用 uid|rid 区分）
      title: clip(ev.summary, TITLE_CAP) || '（无标题）',
      notes: notesParts.join('\n').slice(0, NOTES_CAP),
      start: st.ts,
      allDay: st.allDay,
      durationMin,
      rrule,
      remind: [],
      tags: (ev.categories || []).slice(0, 3),
      source: 'ics',
      kind: 'event',
    };
    raws.push(raw);
    // EXDATE → 抑制对应发生
    const skipKeys = [];
    for (const ex of ev.exdates || []) {
      const t = parseIcsDateTime(ex.value, ex.params, parsed.vtimezones);
      if (t) skipKeys.push(occKey(t.ts, t.allDay || st.allDay));
    }
    // RECURRENCE-ID（例外实例）：本条按单次入库，并抑制主事件的同刻发生
    if (ev.recurrenceId) {
      const t = parseIcsDateTime(ev.recurrenceId, ev.recurrenceParams, parsed.vtimezones);
      if (t) skipKeys.push(occKey(t.ts, t.allDay || st.allDay));
    }
    if (skipKeys.length) skipsByUid[raw.uid] = (skipsByUid[raw.uid] || []).concat(skipKeys);
  }
  return { ok: true, raws, skipsByUid, count: raws.length, name: icsName || '' };
}

/**
 * planIcsSync：订阅同步计划（纯函数）。
 * @param existingEvents 该 icsId 下的现有事件数组
 * @param raws icsToRawEvents 的产物
 * @param skipsByUid uid → 待抑制 occKey 列表
 * @returns {{ upserts: event[], deletes: string[] }}
 */
function planIcsSync(existingEvents, raws, icsId, skipsByUid, now) {
  const existing = (Array.isArray(existingEvents) ? existingEvents : []).filter((e) => e && e.source === 'ics' && e.icsId === icsId);
  const syncKey = (uid, rid) => uid + (rid ? '|' + rid : '');
  const byUid = new Map(existing.map((e) => [syncKey(e.uid, e.rid || ''), e]));
  const upserts = [];
  const incomingUids = new Set();
  for (const raw of Array.isArray(raws) ? raws : []) {
    const sk = syncKey(raw.uid, raw.rid || '');
    incomingUids.add(sk);
    const id = icsEventId(icsId, sk);
    const prev = byUid.get(sk);
    const ev = {
      ...raw,
      id,
      icsId,
      source: 'ics',
      kind: prev ? prev.kind || 'event' : 'event',
      remind: prev && Array.isArray(prev.remind) ? prev.remind : [],
      enabled: prev ? prev.enabled !== false : true,
      done: prev && prev.done && typeof prev.done === 'object' ? { ...prev.done } : {},
      createdAt: prev ? prev.createdAt || now : now,
      updatedAt: now,
      rev: prev ? (Number(prev.rev) || 1) + 1 : 1,
    };
    // EXDATE / RECURRENCE-ID 抑制键只作用于主事件（例外实例自身是单次）
    const skips = raw.rid ? [] : ((skipsByUid && skipsByUid[raw.uid]) || []);
    for (const k of skips) {
      if (ev.done[k] !== 'done') ev.done[k] = 'skip';
    }
    ev.done = pruneDoneMap(ev.done);
    upserts.push(ev);
  }
  const deletes = existing.filter((e) => !incomingUids.has(syncKey(e.uid, e.rid || ''))).map((e) => e.id);
  return { upserts, deletes };
}

// ── 展示辅助 ─────────────────────────────────────────────────────────────────
function fmtDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtClock(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/** 事件发生的时间描述（全天走 UTC 日期分量） */
function fmtOccWhen(startTs, allDay, durationMin) {
  if (allDay) {
    const p = utcParts(startTs);
    const days = Math.max(1, Math.round((Number(durationMin) || 1440) / 1440));
    const base = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    return days > 1 ? `${base} 起 ${days} 天` : base;
  }
  const dur = Number(durationMin) || 0;
  const base = `${fmtDay(startTs)} ${fmtClock(startTs)}`;
  if (dur > 0) {
    if (dur % 1440 === 0) return `${base} · ${dur / 1440} 天`;
    return `${base} · ${dur >= 60 && dur % 60 === 0 ? `${dur / 60} 小时` : `${dur} 分钟`}`;
  }
  return base;
}

module.exports = {
  TITLE_CAP, NOTES_CAP, TAG_CAP, MAX_OCC, DONE_MAP_CAP, DAY_MS,
  WD_BY_NAME, WD_NAME_BY_NUM, WD_CN, FIXED_OFFSETS,
  isFetchableUrl, decodeEntities, clip, oneLine,
  eventIdFor, icsIdFor, icsEventId,
  parseWhen, parseRrule, friendlyRrule, describeRrule,
  expandOccurrences, occKey, dayStartUtc, allDayAnchor,
  computeReminders, computeStreak, countdownInfo,
  normalizeEvent, normalizeSettings, normalizeIcs,
  planRetention, pruneDoneMap,
  unfoldIcsLines, parseIcs, parseIcsDateTime, parseIcsDuration, zoneOffsetAt,
  icsToRawEvents, planIcsSync, offsetStrToMin,
  fmtDay, fmtClock, fmtOccWhen, localParts, utcParts,
};
