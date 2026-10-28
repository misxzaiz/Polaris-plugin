'use strict';
/**
 * core.js —— 金匮（jinkui）两方共享纯函数核心（零依赖，浏览器 / node 同源一致）
 *
 * 职责（面板 / MCP 共用同一实现，保证「同一本保单账」两端口径一字不差）：
 *   - 成员/保单/事件/设置规范化（写入口径唯一，中文报错）
 *   - 缴费进度：paidUntil（最近一次缴到的期）→ 已缴期数 → 下次缴费日
 *   - 保单状态机（法定口径投影）：等待期 → 有效 → 宽限期（60天保障仍有效）→
 *     中止期（2年内可复效、出险不赔）→ 效力终止；退保/满期/一年期短险无宽限
 *   - 缴费日历（未来 N 天应缴清单，宽限期内逾期单置顶）
 *   - 四大件缺口矩阵（成员 × 医疗/重疾/寿险/意外 的覆盖计数与保额合计）
 *   - 12 个月保费现金流（逐月应缴分桶）
 *   - 家庭合计（在保单数 / 年缴保费年化 / 累计已缴 / 累计理赔）
 *
 * 时区与日期：「某日」一律本机时区日期串 YYYY-MM-DD（dayKey，同泉府/青囊）。
 * 金额：全程元为单位、展示层 2dp 舍入；保额大数用万自适应展示。
 *
 * 语义锚（normalizeEvent/工具描述与 README 保持一致）：
 *   - policy.startDate = 首期缴费日（=保单生效日；无缴费事件时视为已缴首期）
 *   - pay 事件 date   = 该次缴费对应的缴费日（缴到哪期就填哪期的缴费日）
 *   - reinstate 事件 date = 复效日（视同把账补缴到该日所在的期）
 *   - surrender 事件 date = 退保日；晚于最近 reinstate 即「已退保」
 *   - claim 只记流水不改保单状态
 *
 * 安全边界：只做记录与现状透视，不产出任何投保/退保建议；零外网请求。
 */

const { sha256Hex } = require('./sha256');

const DAY_MS = 86400000;
const NAME_CAP = 60;
const COMPANY_CAP = 40;
const NOTE_CAP = 300;

const RELATIONS = ['self', 'spouse', 'child', 'parent', 'other'];
const RELATION_NAMES = { self: '本人', spouse: '配偶', child: '子女', parent: '父母', other: '其他' };

const KINDS = ['medical', 'critical', 'life', 'accident', 'annuity', 'property', 'other'];
const KIND_NAMES = {
  medical: '医疗', critical: '重疾', life: '寿险', accident: '意外',
  annuity: '年金', property: '家财', other: '其他',
};
/** 四大件：保障缺口矩阵的列（与知乎/深蓝保等公开配置框架同口径的现状透视） */
const GAP_KINDS = ['medical', 'critical', 'life', 'accident'];

const FREQS = ['yearly', 'half', 'quarter', 'monthly', 'single'];
const FREQ_NAMES = { yearly: '年缴', half: '半年缴', quarter: '季缴', monthly: '月缴', single: '趸交' };
const FREQ_MONTHS = { yearly: 12, half: 6, quarter: 3, monthly: 1, single: 0 };
const FREQ_PER_YEAR = { yearly: 1, half: 2, quarter: 4, monthly: 12, single: 1 };

const EVENT_TYPES = ['pay', 'claim', 'endorse', 'reinstate', 'surrender', 'other'];
const EVENT_NAMES = { pay: '缴费', claim: '理赔', endorse: '批改', reinstate: '复效', surrender: '退保', other: '其他' };

const END_REASONS = ['surrender', 'terminated'];
const END_REASON_NAMES = { surrender: '退保', terminated: '终止' };

const REINSTATE_WINDOW_DAYS = 730; // 中止期复效窗口（法定口径：宽限期届满后 2 年内）
const MAX_WALK = 2400;             // 期数步进安全上限（月缴×100年=1200，双倍冗余）

const STATES = ['waiting', 'active', 'paid-off', 'grace', 'lapse', 'matured', 'surrendered', 'terminated'];
const STATE_NAMES = {
  waiting: '等待期中', active: '有效', 'paid-off': '有效·缴费期满', grace: '宽限期',
  lapse: '中止期', matured: '已满期', surrendered: '已退保', terminated: '已终止',
};

// ── 通用小件 ─────────────────────────────────────────────────────────────────
function clip(s, cap) {
  return String(s == null ? '' : s).trim().slice(0, cap);
}

function idFor(seed) {
  return sha256Hex(String(seed)).slice(0, 12);
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

/** 元/万自适应展示：<1万 元（整数不带小数），≥1万 万（尾零剥离：<100万 2dp、≥100万 1dp） */
function fmtMoney(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  const v = round2(x);
  if (Math.abs(v) >= 10000) {
    const w = v / 10000;
    const raw = Math.abs(w) >= 100 ? w.toFixed(1) : w.toFixed(2);
    return `${parseFloat(raw)} 万`;
  }
  return Number.isInteger(v) ? `${v} 元` : `${v.toFixed(2)} 元`;
}

// ── 日期（本机时区日期串， noon 构造规避 DST 边界）───────────────────────────
function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDayKey(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const probe = new Date(y, m - 1, d, 12);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  return new Date(y, m - 1, d).getTime();
}

/** dayDiff(target, base)：target − base 的自然日差 */
function dayDiff(a, b) {
  const ta = parseDayKey(a);
  const tb = parseDayKey(b);
  if (ta == null || tb == null) return null;
  return Math.round((ta - tb) / DAY_MS);
}

/** 月加法（anniversary 语义）：月末钳制（1/31 +1月 → 2/28；闰年 2/29）；入参非法返回 null */
function addMonths(dateStr, k) {
  const t = parseDayKey(dateStr);
  if (t == null || !Number.isInteger(k)) return null;
  const base = new Date(t);
  const target = new Date(base.getFullYear(), base.getMonth() + k, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(base.getDate(), lastDay));
  return dayKey(target.getTime());
}

/** 日加法：自然日推进（跨月/跨年交给 Date 溢出） */
function addDays(dateStr, n) {
  const t = parseDayKey(dateStr);
  if (t == null || !Number.isFinite(n)) return null;
  return dayKey(t + n * DAY_MS);
}

function validDate(s) { return parseDayKey(s) != null; }

// ── 规范化（写入口径唯一）────────────────────────────────────────────────────
function normOk(v) { return v; }

function normalizeMember(input, prev) {
  const i = input || {};
  const name = clip(i.name, NAME_CAP);
  if (!name) return { error: '成员名字必填（如：本人 / 妻子 / 大娃）' };
  const relation = i.relation == null || i.relation === '' ? (prev && prev.relation) || 'other' : String(i.relation);
  if (!RELATIONS.includes(relation)) return { error: `relation 不合法：${relation}（${RELATIONS.join('/')}）` };
  let birthYear = prev && prev.birthYear != null ? prev.birthYear : null;
  if (i.birthYear != null && i.birthYear !== '') {
    const n = Math.floor(Number(i.birthYear));
    const thisYear = new Date().getFullYear();
    if (!Number.isFinite(n) || n < 1900 || n > thisYear + 1) return { error: `birthYear 不合法：${i.birthYear}（1900–${thisYear + 1}）` };
    birthYear = n;
  }
  const member = {
    id: (prev && prev.id) || idFor(`member|${name}`),
    name,
    relation,
    birthYear,
    note: i.note != null ? clip(i.note, NOTE_CAP) : (prev && prev.note) || '',
    createdAt: (prev && prev.createdAt) || Date.now(),
  };
  return normOk({ member });
}

function normalizePolicy(input, prev) {
  const i = input || {};
  const name = clip(i.name, NAME_CAP);
  if (!name) return { error: '保单名称（产品名）必填，如「平安e生保·长期医疗」' };
  const kind = String(i.kind == null ? (prev && prev.kind) || '' : i.kind);
  if (!KINDS.includes(kind)) return { error: `kind 必填且不合法：${kind || '（空）'}（${KINDS.join('/')}）` };
  const insuredId = clip(i.insuredId != null ? i.insuredId : (prev && prev.insuredId), 40);
  if (!insuredId) return { error: '被保险人（insuredId 或 insured 成员名）必填' };

  const freq = String(i.freq == null ? (prev && prev.freq) || 'yearly' : i.freq);
  if (!FREQS.includes(freq)) return { error: `freq 不合法：${freq}（${FREQS.join('/')}）` };

  const startDate = String(i.startDate != null ? i.startDate : (prev && prev.startDate) || '');
  if (!validDate(startDate)) return { error: `startDate 必填且为合法日期 YYYY-MM-DD（首期缴费日）：${startDate || '（空）'}` };

  // 保费：每期应缴（元）；可空（未记录则不进现金流），给了就必须是非负数
  let premium = prev && prev.premium != null ? prev.premium : null;
  if (i.premium != null && i.premium !== '') {
    const p = Number(i.premium);
    if (!Number.isFinite(p) || p < 0 || p > 1e9) return { error: `premium 不合法：${i.premium}（0–10 亿的元数值）` };
    premium = round2(p);
  }

  // 保额（元）：可空；coverageWan（万）由调用方换算后传 coverage
  let coverage = prev && prev.coverage != null ? prev.coverage : null;
  if (i.coverage != null && i.coverage !== '') {
    const c = Number(i.coverage);
    if (!Number.isFinite(c) || c < 0 || c > 1e11) return { error: `coverage 不合法：${i.coverage}（0–1000 亿的元数值）` };
    coverage = round2(c);
  }

  let payYears = prev && prev.payYears != null ? prev.payYears : null;
  if (i.payYears != null && i.payYears !== '') {
    const n = Math.floor(Number(i.payYears));
    if (!Number.isFinite(n) || n < 1 || n > 100) return { error: `payYears 不合法：${i.payYears}（1–100 年）` };
    payYears = n;
  } else if (freq === 'single') {
    payYears = 1;
  }

  let endDate = prev && prev.endDate != null ? prev.endDate : null;
  if (i.endDate != null && i.endDate !== '') {
    const e = String(i.endDate);
    if (!validDate(e)) return { error: `endDate 不合法：${e}（YYYY-MM-DD 或留空=终身）` };
    if (dayDiff(e, startDate) <= 0) return { error: `endDate（${e}）必须晚于 startDate（${startDate}）` };
    endDate = e;
  }

  let waitingDays = prev && prev.waitingDays != null ? prev.waitingDays : null;
  if (i.waitingDays != null && i.waitingDays !== '') {
    const n = Math.floor(Number(i.waitingDays));
    if (!Number.isFinite(n) || n < 0 || n > 730) return { error: `waitingDays 不合法：${i.waitingDays}（0–730 天）` };
    waitingDays = n;
  }

  // 手动终止（endReason + endedAt 必须成对）
  let endedAt = prev && prev.endedAt != null ? prev.endedAt : null;
  let endReason = prev && prev.endReason != null ? prev.endReason : null;
  if (i.endReason != null && i.endReason !== '') {
    if (!END_REASONS.includes(i.endReason)) return { error: `endReason 不合法：${i.endReason}（${END_REASONS.join('/')}）` };
    endReason = i.endReason;
  }
  if (i.endedAt != null && i.endedAt !== '') {
    const e = String(i.endedAt);
    if (!validDate(e)) return { error: `endedAt 不合法：${e}` };
    if (dayDiff(e, startDate) < 0) return { error: `endedAt（${e}）不能早于生效日（${startDate}）` };
    endedAt = e;
  }
  if ((endReason && !endedAt) || (!endReason && endedAt)) {
    return { error: 'endReason 与 endedAt 必须成对提供（手动终止用；退保也可改用 surrender 事件保留流水）' };
  }

  const policy = {
    id: (prev && prev.id) || idFor(`policy|${insuredId}|${kind}|${clip(i.company, COMPANY_CAP)}|${name}`),
    name,
    kind,
    insuredId,
    holderId: i.holderId != null && i.holderId !== '' ? clip(i.holderId, 40) : (prev && prev.holderId) || '',
    company: i.company != null ? clip(i.company, COMPANY_CAP) : (prev && prev.company) || '',
    policyNo: i.policyNo != null ? clip(i.policyNo, 40) : (prev && prev.policyNo) || '',
    coverage,
    coverageNote: i.coverageNote != null ? clip(i.coverageNote, 60) : (prev && prev.coverageNote) || '',
    premium,
    freq,
    payYears,
    startDate,
    endDate,
    waitingDays,
    fileNote: i.fileNote != null ? clip(i.fileNote, 120) : (prev && prev.fileNote) || '',
    note: i.note != null ? clip(i.note, NOTE_CAP) : (prev && prev.note) || '',
    endedAt,
    endReason,
    createdAt: (prev && prev.createdAt) || Date.now(),
  };
  return normOk({ policy });
}

function normalizeEvent(input, prev) {
  const i = input || {};
  const type = String(i.type || '');
  if (!EVENT_TYPES.includes(type)) {
    return { error: `type 必填：${EVENT_TYPES.map((t) => `${t}(${EVENT_NAMES[t]})`).join(' / ')}` };
  }
  const policyId = clip(i.policyId, 40);
  if (!policyId) return { error: 'policyId 必填（jinkui_query scope=policies 可查）' };
  const date = String(i.date || dayKey(Date.now()));
  if (!validDate(date)) return { error: `date 不合法：${date}（YYYY-MM-DD）` };
  let amount = null;
  if (i.amount != null && i.amount !== '') {
    const a = Number(i.amount);
    if (!Number.isFinite(a) || a < 0 || a > 1e10) return { error: `amount 不合法：${i.amount}` };
    amount = round2(a);
  }
  const note = clip(i.note, NOTE_CAP);
  const occKey = `${type}|${policyId}|${date}`;
  const ev = {
    occKey: (prev && prev.occKey) || occKey,
    type,
    policyId,
    date,
    amount,
    note,
    at: (prev && prev.at) || Date.now(),
  };
  return normOk({ ev });
}

function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const num = (v, dflt, lo, hi) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
  };
  return {
    graceDays: num(r.graceDays, 60, 0, 180),
    warnDays: num(r.warnDays, 30, 1, 365),
  };
}

// ── 缴费进度 ─────────────────────────────────────────────────────────────────
/** 最近一次缴到的期（pay/reinstate 事件日最大值；无事件 = startDate，投保即缴首期） */
function paidUntilOf(policy, events) {
  let m = policy.startDate;
  for (const e of events || []) {
    if ((e.type === 'pay' || e.type === 'reinstate') && typeof e.date === 'string' && e.date > m && validDate(e.date)) {
      m = e.date;
    }
  }
  return m;
}

/** 已缴期数：startDate 到 paidUntil 按 freq 步进计数 */
function periodsPaid(policy, paidUntil) {
  const fm = FREQ_MONTHS[policy.freq];
  if (!fm) return 1; // 趸交
  let n = 0;
  let d = policy.startDate;
  while (d != null && d <= paidUntil && n < MAX_WALK) {
    n += 1;
    d = addMonths(d, fm);
  }
  return n;
}

/** 应缴总期数；缴费年限未记录（非趸交）→ null = 未知，按持续续缴提醒 */
function totalPeriods(policy) {
  if (policy.freq === 'single') return 1;
  if (policy.payYears == null) return null;
  return policy.payYears * FREQ_PER_YEAR[policy.freq];
}

/** 下次缴费日；已终止/趸交/缴费期满 → null */
function nextPayDate(policy, events) {
  if (policy.endReason || policy.endedAt) return null;
  if (policy.freq === 'single') return null;
  const tp = totalPeriods(policy);
  const pu = paidUntilOf(policy, events);
  const pp = periodsPaid(policy, pu);
  if (tp != null && pp >= tp) return null; // 缴费期满
  return addMonths(pu, FREQ_MONTHS[policy.freq]);
}

/** 宽限期适用性：一年期短险（缴 1 期且保障期≈1 年）到期即满期，无宽限/中止 */
function graceApplies(policy) {
  if (policy.freq !== 'yearly') return true;
  if (totalPeriods(policy) !== 1) return true;
  if (!policy.endDate) return true; // 数据不全：保守按长险提醒（多提醒不误导）
  const approx1y = addMonths(policy.startDate, 12);
  return !(dayDiff(policy.endDate, approx1y) != null && dayDiff(policy.endDate, approx1y) <= 45);
}

// ── 状态机 ───────────────────────────────────────────────────────────────────
function latestDateOf(events, type) {
  let m = null;
  for (const e of events || []) {
    if (e.type === type && typeof e.date === 'string' && validDate(e.date) && (m == null || e.date > m)) m = e.date;
  }
  return m;
}

/**
 * 保单状态投影（法定口径）：
 * surrendered → terminated(手动) → matured(endDate 过境) → waiting → active →
 * grace(nextPayDate 后 graceDays 内) → lapse(其后 2 年内可复效、出险不赔) → terminated
 */
function policyStatus(policy, events, settings, now) {
  const s = normalizeSettings(settings);
  const today = dayKey(now == null ? Date.now() : now);
  const paidUntil = paidUntilOf(policy, events);
  const nextPay = nextPayDate(policy, events);
  const out = {
    today,
    policyId: policy.id,
    state: 'active',
    stateName: STATE_NAMES.active,
    paidUntil,
    nextPayDate: nextPay,
    daysToPay: null,
    graceEnd: null,
    waitingEnd: null,
    surrenderDate: null,
  };

  const lastSurrender = latestDateOf(events, 'surrender');
  const lastReinstate = latestDateOf(events, 'reinstate');
  if (lastSurrender && (!lastReinstate || lastSurrender > lastReinstate)) {
    out.state = 'surrendered';
    out.stateName = STATE_NAMES.surrendered;
    out.surrenderDate = lastSurrender;
    return out;
  }
  if (policy.endReason) {
    out.state = 'terminated';
    out.stateName = `${STATE_NAMES.terminated}（${END_REASON_NAMES[policy.endReason] || policy.endReason}）`;
    return out;
  }
  if (policy.endDate && today > policy.endDate) {
    out.state = 'matured';
    out.stateName = STATE_NAMES.matured;
    return out;
  }
  if (policy.waitingDays != null && policy.waitingDays > 0) {
    const we = addDays(policy.startDate, policy.waitingDays);
    if (we && today < we) {
      out.state = 'waiting';
      out.stateName = STATE_NAMES.waiting;
      out.waitingEnd = we;
      return out;
    }
  }
  if (!nextPay) {
    // 一年期短险只缴一期后仍在保障期内：状态=有效（临近满期走黄榜），不标「缴费期满」
    if (policy.freq !== 'single' && !graceApplies(policy)) {
      out.state = 'active';
      return out;
    }
    out.state = 'paid-off';
    out.stateName = STATE_NAMES['paid-off'];
    return out;
  }
  const d = dayDiff(nextPay, today);
  out.daysToPay = d;
  if (d != null && d >= 0) {
    // waiting 已在上方 return；active
    return out;
  }
  if (!graceApplies(policy)) {
    out.state = 'matured';
    out.stateName = STATE_NAMES.matured;
    return out;
  }
  const ge = addDays(nextPay, s.graceDays);
  out.graceEnd = ge;
  if (ge && today <= ge) {
    out.state = 'grace';
    out.stateName = STATE_NAMES.grace;
    return out;
  }
  const re = ge ? addDays(ge, REINSTATE_WINDOW_DAYS) : null;
  if (re && today <= re) {
    out.state = 'lapse';
    out.stateName = STATE_NAMES.lapse;
    return out;
  }
  out.state = 'terminated';
  out.stateName = `${STATE_NAMES.terminated}（复效期已过）`;
  return out;
}

/** 缺口矩阵计入覆盖的状态：等待期/有效/缴费期满/宽限期（中止期出险不赔，如实不计） */
function coversGap(state) {
  return state === 'waiting' || state === 'active' || state === 'paid-off' || state === 'grace';
}

// ── 投影聚合 ─────────────────────────────────────────────────────────────────
function eventsFor(events, policyId) {
  return (events || []).filter((e) => e.policyId === policyId).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** 未来 days 天应缴清单；宽限期内的逾期单（daysToPay<0）置顶，state=grace */
function paymentCalendar(policies, events, settings, now, days) {
  const s = normalizeSettings(settings);
  const horizon = Math.max(1, Math.min(365, Math.floor(days || 90)));
  const now2 = now == null ? Date.now() : now;
  const rows = [];
  for (const p of policies) {
    const evs = eventsFor(events, p.id);
    const st = policyStatus(p, evs, s, now2);
    if (!coversGap(st.state) || st.nextPayDate == null) continue;
    const d = dayDiff(st.nextPayDate, st.today);
    if (d == null) continue;
    // 逾期单在宽限期内（coversGap 已排除 lapse）必须置顶保留，下界 = -graceDays
    if (d < -s.graceDays || d > horizon) continue;
    rows.push({
      policyId: p.id,
      name: p.name,
      kind: p.kind,
      company: p.company,
      state: st.state,
      date: st.nextPayDate,
      daysToPay: d,
      premium: p.premium,
    });
  }
  rows.sort((a, b) => (a.daysToPay - b.daysToPay));
  return rows;
}

/**
 * 四大件缺口矩阵：成员 × GAP_KINDS。
 * 返回 rows[{memberId,name,cells:{kind:{count,sum}|null},missing:[kind]}] 与 otherKinds 信息层。
 */
function gapMatrix(members, policies, events, settings, now) {
  const s = normalizeSettings(settings);
  const now2 = now == null ? Date.now() : now;
  const byMember = new Map();
  for (const m of members) {
    byMember.set(m.id, { memberId: m.id, name: m.name, cells: {}, missing: [] });
  }
  const otherKinds = { annuity: 0, property: 0, other: 0 };
  for (const p of policies) {
    if (!byMember.has(p.insuredId)) continue;
    if (p.kind in otherKinds) {
      const evs = eventsFor(events, p.id);
      if (coversGap(policyStatus(p, evs, s, now2).state)) otherKinds[p.kind] += 1;
      continue;
    }
    if (!GAP_KINDS.includes(p.kind)) continue;
    const evs = eventsFor(events, p.id);
    if (!coversGap(policyStatus(p, evs, s, now2).state)) continue;
    const row = byMember.get(p.insuredId);
    const cell = row.cells[p.kind] || { count: 0, sum: 0 };
    cell.count += 1;
    cell.sum = round2(cell.sum + (p.coverage || 0));
    row.cells[p.kind] = cell;
  }
  const rows = [...byMember.values()];
  for (const row of rows) {
    row.missing = GAP_KINDS.filter((k) => !row.cells[k]);
  }
  return { rows, otherKinds };
}

/** 未来 12 个月逐月应缴分桶：{months:{'YYYY-MM':{amount,items[]}}, total} */
function premiumFlow(policies, events, settings, now) {
  const s = normalizeSettings(settings);
  const now2 = now == null ? Date.now() : now;
  const today = dayKey(now2);
  const windowEnd = addMonths(today, 12);
  const months = {};
  let total = 0;
  for (const p of policies) {
    const evs = eventsFor(events, p.id);
    const st = policyStatus(p, evs, s, now2);
    if (!coversGap(st.state) || st.nextPayDate == null || p.premium == null) continue;
    const fm = FREQ_MONTHS[p.freq];
    const tp = totalPeriods(p);
    let d = st.nextPayDate;
    let paid = periodsPaid(p, st.paidUntil);
    let guard = 0;
    while (d != null && d < windowEnd && guard < MAX_WALK) {
      guard += 1;
      if (tp != null && paid >= tp) break;
      if (d >= today) {
        const mk = d.slice(0, 7);
        const bucket = months[mk] || { amount: 0, items: [] };
        bucket.amount = round2(bucket.amount + p.premium);
        bucket.items.push({ policyId: p.id, name: p.name, date: d, premium: p.premium });
        months[mk] = bucket;
        total = round2(total + p.premium);
      }
      d = addMonths(d, fm);
      paid += 1;
    }
  }
  return { months, total, from: today, to: windowEnd };
}

/** 家庭合计：年缴保费年化（freq×每年期数）、累计已缴（pay 事件，缺额回落保单保费）、累计理赔 */
function familyTotals(policies, events, settings, now) {
  const s = normalizeSettings(settings);
  const now2 = now == null ? Date.now() : now;
  let activeCount = 0;
  let annualized = 0;
  const byState = {};
  for (const p of policies) {
    const evs = eventsFor(events, p.id);
    const st = policyStatus(p, evs, s, now2);
    byState[st.state] = (byState[st.state] || 0) + 1;
    if (coversGap(st.state)) {
      activeCount += 1;
      if (p.premium != null && p.freq !== 'single') annualized = round2(annualized + p.premium * FREQ_PER_YEAR[p.freq]);
    }
  }
  let totalPaid = 0;
  let totalClaim = 0;
  const policyById = new Map(policies.map((p) => [p.id, p]));
  for (const e of events || []) {
    const p = policyById.get(e.policyId);
    if (e.type === 'pay') {
      totalPaid = round2(totalPaid + (e.amount != null ? e.amount : (p && p.premium) || 0));
    } else if (e.type === 'claim') {
      totalClaim = round2(totalClaim + (e.amount || 0));
    }
  }
  return {
    policyCount: policies.length,
    activeCount,
    byState,
    annualizedPremium: annualized,
    totalPaid,
    totalClaim,
  };
}

function describePolicy(policy, insuredName) {
  const bits = [
    `「${policy.name}」`,
    `${KIND_NAMES[policy.kind] || policy.kind}`,
    policy.company ? `${policy.company}` : '',
    insuredName ? `被保：${insuredName}` : '',
    policy.premium != null ? `${FREQ_NAMES[policy.freq]} ${fmtMoney(policy.premium)}` : FREQ_NAMES[policy.freq],
    `生效 ${policy.startDate}`,
    policy.endDate ? `保障至 ${policy.endDate}` : '保障期终身/未填',
    policy.coverage != null ? `保额 ${fmtMoney(policy.coverage)}${policy.coverageNote ? `（${policy.coverageNote}）` : ''}` : '',
  ].filter(Boolean);
  return bits.join('，');
}

module.exports = {
  DAY_MS,
  RELATIONS, RELATION_NAMES,
  KINDS, KIND_NAMES, GAP_KINDS,
  FREQS, FREQ_NAMES, FREQ_MONTHS, FREQ_PER_YEAR,
  EVENT_TYPES, EVENT_NAMES,
  END_REASONS, END_REASON_NAMES,
  REINSTATE_WINDOW_DAYS, STATES, STATE_NAMES,
  clip, idFor, round2, fmtMoney,
  dayKey, parseDayKey, dayDiff, addMonths, addDays,
  normalizeMember, normalizePolicy, normalizeEvent, normalizeSettings,
  paidUntilOf, periodsPaid, totalPeriods, nextPayDate, graceApplies,
  policyStatus, coversGap, eventsFor,
  paymentCalendar, gapMatrix, premiumFlow, familyTotals,
  describePolicy,
};
