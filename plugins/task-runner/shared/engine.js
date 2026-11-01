'use strict';
/**
 * engine.js —— 定时任务台调度核心（纯函数、零依赖）
 *
 * 职责：调度定义归一化 + nextRunAt 计算 + 触发后推进 + 到期/补跑判定。
 * 所有时间均为本地时区毫秒（中国无 DST；逐分钟扫描基于 Date 本地分量）。
 * 分钟粒度：daily/weekly/cron；interval 为自由间隔（≥60s，不要求对齐分钟）。
 */

const MIN = 60 * 1000;
const SCHEDULE_TYPES = ['interval', 'daily', 'weekly', 'cron'];
const JOB_TYPES = ['notify', 'http', 'ai', 'command'];

function minuteOf(ms) {
  return Math.floor(ms / MIN) * MIN;
}

function clampInt(v, lo, hi, dft) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dft;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function parseHM(s) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(s || '').trim());
  if (!m) return null;
  return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
}

// ── cron 五字段（* , - / 数字；0-59 0-23 1-31 1-12 0-6，7 视作 0=周日）────────
// 域语义对齐 vixie cron：dom 与 dow 均受限时取并集，其一受限取该域，均 * 取全部。

function cronVal(s, isDow) {
  s = String(s).trim();
  if (isDow && s === '7') return 0;
  if (!/^\d+$/.test(s)) return null;
  return parseInt(s, 10);
}

function parseCronField(field, min, max, isDow) {
  const set = new Set();
  for (const part of String(field).split(',')) {
    let range = part;
    let step = 1;
    const si = part.indexOf('/');
    if (si !== -1) {
      range = part.slice(0, si);
      step = cronVal(part.slice(si + 1), false);
      if (step === null || step < 1) return null;
    }
    let lo = null;
    let hi = null;
    if (range === '*') {
      lo = min; hi = max;
    } else if (range.includes('-')) {
      const p = range.split('-');
      if (p.length !== 2) return null;
      lo = cronVal(p[0], isDow);
      hi = cronVal(p[1], isDow);
    } else {
      lo = cronVal(range, isDow);
      hi = si !== -1 ? max : lo; // "5/2" = 从 5 到上限步进 2
    }
    if (lo === null || hi === null || lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set.size ? set : null;
}

/** @returns {{min:Set,hour:Set,dom:{any:Set|null},mon:{any:Set|null},dow:{any:Set|null}} | null} */
function parseCron(expr) {
  const fields = String(expr || '').trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const min = parseCronField(fields[0], 0, 59, false);
  const hour = parseCronField(fields[1], 0, 23, false);
  if (!min || !hour) return null;
  const domRaw = fields[2];
  const monRaw = fields[3];
  const dowRaw = fields[4];
  const dom = domRaw === '*' ? null : parseCronField(domRaw, 1, 31, false);
  const mon = monRaw === '*' ? null : parseCronField(monRaw, 1, 12, false);
  const dow = dowRaw === '*' ? null : parseCronField(dowRaw, 0, 7, true);
  if (domRaw !== '*' && !dom) return null;
  if (monRaw !== '*' && !mon) return null;
  if (dowRaw !== '*' && !dow) return null;
  return { min, hour, dom, mon, dow };
}

function cronDayMatches(cron, date) {
  if (cron.mon && !cron.mon.has(date.getMonth() + 1)) return false;
  const domRestricted = !!cron.dom;
  const dowRestricted = !!cron.dow;
  if (!domRestricted && !dowRestricted) return true;
  if (domRestricted && dowRestricted) {
    return cron.dom.has(date.getDate()) || cron.dow.has(date.getDay());
  }
  if (domRestricted) return cron.dom.has(date.getDate());
  return cron.dow.has(date.getDay());
}

/** cron 下一触发时刻（逐天 × 有序时分候选，上限 366 天） */
function nextCronFire(cron, fromMs) {
  const start = new Date(minuteOf(fromMs));
  const startMod = start.getHours() * 60 + start.getMinutes();
  const hours = [...cron.hour].sort((a, b) => a - b);
  const mins = [...cron.min].sort((a, b) => a - b);
  for (let d = 0; d <= 366; d++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
    if (!cronDayMatches(cron, day)) continue;
    for (const h of hours) {
      for (const m of mins) {
        const mod = h * 60 + m;
        if (d === 0 && mod < startMod) continue;
        return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0).getTime();
      }
    }
  }
  return null;
}

/** daily/weekly 下一触发时刻（逐天扫描，上限 7 天；含 fromMs 所在分钟的槽位） */
function nextDailyFire(h, m, dowSet, fromMs) {
  const start = new Date(minuteOf(fromMs));
  for (let d = 0; d <= 7; d++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
    if (dowSet && !dowSet.includes(day.getDay())) continue;
    const fire = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0).getTime();
    if (fire >= minuteOf(fromMs)) return fire;
  }
  return null;
}

// ── 调度归一化 ───────────────────────────────────────────────────────────────

/** @returns {{ok:true, schedule:object} | {ok:false, error:string}} */
function normalizeSchedule(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '调度定义缺失' };
  const type = String(raw.type || '');
  if (!SCHEDULE_TYPES.includes(type)) {
    return { ok: false, error: `调度类型须为 ${SCHEDULE_TYPES.join('/')}` };
  }
  if (type === 'interval') {
    let everyMs = parseInt(raw.everyMs, 10);
    if (!Number.isFinite(everyMs) && raw.everyMinutes !== undefined) {
      everyMs = parseInt(raw.everyMinutes, 10) * MIN;
    }
    if (!Number.isFinite(everyMs) || everyMs < MIN) {
      return { ok: false, error: '间隔须 ≥ 60 秒' };
    }
    if (everyMs > 366 * 24 * 3600 * 1000) return { ok: false, error: '间隔过大（>1 年）' };
    return { ok: true, schedule: { type, everyMs } };
  }
  if (type === 'daily' || type === 'weekly') {
    const hm = parseHM(raw.time);
    if (!hm) return { ok: false, error: '时间须为 HH:MM（24 小时制）' };
    if (type === 'daily') return { ok: true, schedule: { type, time: raw.time } };
    const dows = normalizeDows(raw.dows);
    if (!dows) return { ok: false, error: 'weekly 须给 dows（0=周日 … 6=周六，至少一项）' };
    return { ok: true, schedule: { type, time: raw.time, dows } };
  }
  const cron = parseCron(raw.expr);
  if (!cron) return { ok: false, error: 'cron 须为五字段（分 时 日 月 周；支持 * , - / 数字）' };
  return { ok: true, schedule: { type, expr: String(raw.expr).trim() } };
}

function normalizeDows(raw) {
  if (!Array.isArray(raw)) return null;
  const set = new Set();
  for (const v of raw) {
    const n = parseInt(v, 10);
    if (!Number.isInteger(n) || n < 0 || n > 6) return null;
    set.add(n);
  }
  return set.size ? [...set].sort((a, b) => a - b) : null;
}

// ── nextRunAt / 推进 / 到期 ─────────────────────────────────────────────────

/** 计算自 fromMs 起的下一触发时刻；无匹配（理论不发生）返回 null */
function nextRunAt(schedule, fromMs) {
  if (!schedule) return null;
  if (schedule.type === 'interval') return fromMs + schedule.everyMs;
  if (schedule.type === 'daily') {
    const hm = parseHM(schedule.time);
    return hm ? nextDailyFire(hm.h, hm.m, null, fromMs) : null;
  }
  if (schedule.type === 'weekly') {
    const hm = parseHM(schedule.time);
    return hm ? nextDailyFire(hm.h, hm.m, schedule.dows, fromMs) : null;
  }
  if (schedule.type === 'cron') {
    const cron = parseCron(schedule.expr);
    return cron ? nextCronFire(cron, fromMs) : null;
  }
  return null;
}

/**
 * 触发后推进。interval 防风暴：next = max(now, firedAt) + everyMs——长期宕机
 * 后不回放积压（错过补跑由服务层的 catchUpOnce 单独语义负责，只补一次）。
 * 分钟型调度：严格从已触发槽位之后一分钟起算。
 */
function advanceAfterFire(schedule, firedAtMs, nowMs) {
  if (schedule.type === 'interval') {
    return Math.max(nowMs, firedAtMs) + schedule.everyMs;
  }
  return nextRunAt(schedule, minuteOf(firedAtMs) + MIN);
}

/** 到期任务（enabled 且 nextRunAt ≤ now）。服务层负责「先执行再推进」。 */
function dueJobs(jobs, nowMs) {
  return (jobs || []).filter((j) => j && j.enabled && Number.isFinite(j.nextRunAt) && j.nextRunAt <= nowMs);
}

/** 人类可读调度文案（面板/AI 共用） */
function describeSchedule(schedule) {
  if (!schedule) return '未知调度';
  if (schedule.type === 'interval') {
    const s = Math.round(schedule.everyMs / 1000);
    if (s % 3600 === 0) return `每 ${s / 3600} 小时`;
    if (s % 60 === 0) return `每 ${s / 60} 分钟`;
    return `每 ${s} 秒`;
  }
  if (schedule.type === 'daily') return `每天 ${schedule.time}`;
  if (schedule.type === 'weekly') {
    const names = ['日', '一', '二', '三', '四', '五', '六'];
    return `每周${schedule.dows.map((d) => names[d]).join('、')} ${schedule.time}`;
  }
  return `cron(${schedule.expr})`;
}

module.exports = {
  MIN,
  SCHEDULE_TYPES,
  JOB_TYPES,
  minuteOf,
  clampInt,
  parseHM,
  parseCron,
  parseCronField,
  normalizeSchedule,
  normalizeDows,
  nextRunAt,
  advanceAfterFire,
  dueJobs,
  describeSchedule,
};
