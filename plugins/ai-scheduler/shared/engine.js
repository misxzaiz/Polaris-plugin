'use strict';
/**
 * engine.js —— ai-scheduler 纯函数调度核心（零依赖，金标=主仓 Polaris Scheduler 域）
 *
 * 移植来源与对拍：
 *   - parseInterval / calculateNextRun / applyTemplate
 *     ← 主仓 src-tauri/src/models/scheduler.rs（parse_interval / TriggerType::calculate_next_run）
 *   - cron 解析语义 ← cron crate（6/7 字段：sec min hour dom month dow [year]）。
 *     金标对拍数据见 test/run-tests.mjs PROBE_* 常量（由主仓临时探针
 *     cargo test --test cron_probe -- --nocapture 实测导出）。
 *   - update/updateStatus 的 next_run_at 重算规则
 *     ← 主仓 src-tauri/src/services/scheduler/sqlite_task_storage.rs:292-330
 *
 * 金标行为说明（有意保留，勿「修复」）：
 *   主仓 cron 分支的 now 参数被 upcoming(Utc) 忽略——重算永远从「当下真实时钟」
 *   起算（探针实测：传 2026-03-10 锚点，结果落在运行当天）。本实现保持同语义：
 *   cronNext(expr) 不传 now 时用 Date.now()；only 测试注入固定 now 做对拍。
 */

// ── parseInterval：金标 models/scheduler.rs parse_interval ─────────────────
// 支持格式: 30s, 5m, 2h, 1d（单字符后缀 s/m/h/d，大小写不敏感；其他 None）
function parseInterval(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  const numStr = v.slice(0, -1);
  const unit = v.slice(-1).toLowerCase();
  // 与 Rust `num_str.parse::<i64>()` 一致：仅接受整数字符串（"10" ✓ "1.5" ✗ "+5" ✗）
  if (!/^-?\d+$/.test(numStr)) return null;
  const n = parseInt(numStr, 10);
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  if (mult === undefined) return null;
  return n * mult;
}

// ── cron 解析（对齐 cron crate：sec min hour dom month dow [year]）─────────
// 支持：* , - / 数字；dow 兼容 MON-SUN 名字（对齐 cron crate：1=Sunday..7=Saturday）；
// 宏：@yearly @monthly @weekly @daily @hourly；dom 与 dow 同时受限时取交集
// （cron crate 语义，探针用例 "0 30 8 10 * MON" 实测对拍）。
function parseFieldPart(part, min, max, names) {
  // 返回 Set<number>；非法返回 null
  const set = new Set();
  for (const piece of part.split(',')) {
    let body = piece;
    let step = 1;
    const slash = body.indexOf('/');
    if (slash !== -1) {
      step = parseInt(body.slice(slash + 1), 10);
      if (!Number.isInteger(step) || step <= 0) return null;
      body = body.slice(0, slash);
    }
    let lo, hi;
    if (body === '*' || body === '?') {
      lo = min; hi = max;
    } else if (body.includes('-')) {
      const [a, b] = body.split('-');
      lo = resolveVal(a, names); hi = resolveVal(b, names);
      if (lo === null || hi === null) return null;
    } else {
      const v = resolveVal(body, names);
      if (v === null) return null;
      if (slash !== -1) { lo = v; hi = max; } else { lo = v; hi = v; }
    }
    if (lo < min || hi > max || lo > hi) return null;
    for (let i = lo; i <= hi; i += step) set.add(i);
  }
  return set.size ? set : null;
}

function resolveVal(s, names) {
  const t = s.trim();
  if (names && names[t.toUpperCase()] !== undefined) return names[t.toUpperCase()];
  if (!/^\d+$/.test(t)) return null;
  return parseInt(t, 10);
}

const DOW_NAMES = { SUN: 1, MON: 2, TUE: 3, WED: 4, THU: 5, FRI: 6, SAT: 7 };
const MONTH_NAMES = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

function parseCron(expr) {
  if (typeof expr !== 'string') return null;
  let e = expr.trim();
  const MACROS = {
    '@yearly': '0 0 0 1 1 *', '@monthly': '0 0 0 1 * *', '@weekly': '0 0 0 * * SUN',
    '@daily': '0 0 0 * * *', '@hourly': '0 0 * * * *',
  };
  if (MACROS[e]) e = MACROS[e];
  const parts = e.split(/\s+/);
  if (parts.length < 6 || parts.length > 7) return null;
  const sec = parseFieldPart(parts[0], 0, 59);
  const min = parseFieldPart(parts[1], 0, 59);
  const hour = parseFieldPart(parts[2], 0, 23);
  const dom = parseFieldPart(parts[3], 1, 31);
  const mon = parseFieldPart(parts[4], 1, 12, MONTH_NAMES);
  // cron crate dow: 1=Sunday..7=Saturday（探针实测：dow=0 解析失败 → None）
  const dow = parseFieldPart(parts[5], 1, 7, DOW_NAMES);
  let years = null;
  if (parts.length === 7) {
    years = parseFieldPart(parts[6], 1970, 2999);
    if (!years) return null;
  }
  if (!sec || !min || !hour || !dom || !mon || !dow) return null;
  return { sec, min, hour, dom, mon, dow, years };
}

// JS getUTCDay(): 0=Sunday..6=Saturday → cron crate: 1=Sunday..7=Saturday（恒等 jsDow+1）
function jsDowToCron(jsDow) { return jsDow + 1; }

/**
 * cron 下一个触发时间（秒级时间戳）。nowSec 可注入（默认真实时钟，
 * 对齐主仓 upcoming(Utc) 忽略 calculate_next_run 入参 now 的金标行为）。
 * @returns {number|null}
 */
function cronNext(expr, nowSec) {
  const p = parseCron(expr);
  if (!p) return null;
  const base = (nowSec === undefined ? Date.now() / 1000 : nowSec) * 1000;
  const t = new Date(Math.floor(base / 1000) * 1000 + 1000); // 从下一秒起步
  const limitMs = base + 4 * 366 * 86400 * 1000;
  for (let guard = 0; guard < 4_000_000; guard++) {
    if (t.getTime() > limitMs) return null;
    const year = t.getUTCFullYear();
    if (p.years && !p.years.has(year)) {
      // 跳到下一年 1 月 1 日
      t.setUTCFullYear(year + 1, 0, 1); t.setUTCHours(0, 0, 0, 0); continue;
    }
    if (!p.mon.has(t.getUTCMonth() + 1)) {
      t.setUTCMonth(t.getUTCMonth() + 1, 1); t.setUTCHours(0, 0, 0, 0); continue;
    }
    if (!p.dom.has(t.getUTCDate()) || !p.dow.has(jsDowToCron(t.getUTCDay()))) {
      t.setUTCDate(t.getUTCDate() + 1); t.setUTCHours(0, 0, 0, 0); continue;
    }
    if (!p.hour.has(t.getUTCHours())) {
      t.setUTCHours(t.getUTCHours() + 1, 0, 0, 0); continue;
    }
    if (!p.min.has(t.getUTCMinutes())) {
      t.setUTCMinutes(t.getUTCMinutes() + 1, 0, 0); continue;
    }
    if (!p.sec.has(t.getUTCSeconds())) {
      t.setUTCSeconds(t.getUTCSeconds() + 1); continue;
    }
    return Math.floor(t.getTime() / 1000);
  }
  return null;
}

// RFC3339 解析（金标 chrono::DateTime::parse_from_rfc3339 的 JS 子集：
// Date.parse 接受 "2026-11-11T01:00:00Z" / "+08:00" 偏移；"bad" → NaN）
function parseRfc3339Ts(v) {
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * calculateNextRun —— 金标 models/scheduler.rs TriggerType::calculate_next_run。
 * triggerType: "once" | "cron" | "interval" | "after_completion"
 */
function calculateNextRun(triggerType, triggerValue, now) {
  switch (triggerType) {
    case 'once': {
      const ts = parseRfc3339Ts(triggerValue);
      return ts !== null && ts > now ? ts : null;
    }
    case 'cron':
      // 金标行为：忽略 now，从真实当下起算（见文件头说明）
      return cronNext(triggerValue);
    case 'interval':
    case 'after_completion': {
      const secs = parseInterval(triggerValue);
      return secs !== null ? now + secs : null;
    }
    default:
      return null;
  }
}

// ── 提示词模板变量（金标 models/scheduler.rs apply_template，UTC 取值）──────
function weekdayNameCn(jsDow) {
  return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][jsDow];
}
function pad2(n) { return String(n).padStart(2, '0'); }

function applyTemplate(template, taskName, userPrompt, nowMs) {
  const now = nowMs === undefined ? new Date() : new Date(nowMs);
  const date = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
  const time = `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}`;
  return String(template)
    .replace(/\{\{prompt\}\}/g, userPrompt)
    .replace(/\{\{taskName\}\}/g, taskName)
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{time\}\}/g, time)
    .replace(/\{\{datetime\}\}/g, `${date} ${time}`)
    .replace(/\{\{weekday\}\}/g, weekdayNameCn(now.getUTCDay()));
}

// ── 运行态机（金标 sqlite_task_storage.rs:292-330 重算规则）─────────────────
/**
 * 通用 update 后重算：nextRunAt 未显式给出时按规则重算。
 * AfterCompletion 且 Running → null（锁，等终态回收）；
 * 其余 → calculateNextRun(triggerValue, updatedAt)。
 */
function recalcNextOnUpdate(task, updatedAt, explicitNext) {
  if (explicitNext !== undefined && explicitNext !== null) return explicitNext;
  const running = task.lastRunStatus === 'running';
  if (task.triggerType === 'after_completion' && running) return null;
  return calculateNextRun(task.triggerType, task.triggerValue, updatedAt);
}

/** 终态回收（status: running|success|failed）后重算。 */
function recalcNextOnStatus(task, now, status) {
  if (task.triggerType === 'after_completion' && status === 'running') return null;
  return calculateNextRun(task.triggerType, task.triggerValue, now);
}

/**
 * tick 到期判定（金标 scheduler_daemon.rs check_and_execute_due_tasks）：
 * enabled 且非 Running 锁 且 nextRunAt 已设且 <= now。
 * Running 卡死自愈阈值：timeoutMinutes*60 或默认 30 分钟。
 */
const STALE_RUNNING_SECS = 30 * 60;

function isDue(task, now) {
  if (!task.enabled) return false;
  if (task.lastRunStatus === 'running') {
    if (task.lastRunAt !== null && task.lastRunAt !== undefined) {
      const stale = (task.timeoutMinutes ? task.timeoutMinutes * 60 : STALE_RUNNING_SECS);
      if (now - task.lastRunAt > stale) return 'stale'; // 自愈信号
    }
    return false;
  }
  if (task.nextRunAt === null || task.nextRunAt === undefined) return false;
  return task.nextRunAt <= now;
}

module.exports = {
  parseInterval, parseCron, cronNext, calculateNextRun, applyTemplate,
  recalcNextOnUpdate, recalcNextOnStatus, isDue, STALE_RUNNING_SECS,
  parseRfc3339Ts, weekdayNameCn, jsDowToCron,
};
