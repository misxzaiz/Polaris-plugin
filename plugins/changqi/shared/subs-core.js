'use strict';
/**
 * 订阅台账 subs-core —— 订阅契约账本的唯一计算权威（CommonJS，零依赖）
 *
 * 面板（esbuild 打包进 bundle）与 MCP（require）与测试三方共用，
 * 保证「下次扣费日推导 / 月度化口径 / 提醒分级 / 透视聚合」口径不漂移。
 *
 * 键空间契约（与 mcp/server.js 一致，权威描述见 README）：
 *   changqi.sub.<id>  → Subscription（一条一键，规避列表并发覆盖）
 *   changqi.settings  → Settings
 *
 * 日期一律 'YYYY-MM-DD' 字符串（本地日期语义），比较用 UTC 日期算术避免 DST 漂移。
 */

const CYCLES = ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'];
const CYCLE_LABELS = { weekly: '每周', monthly: '每月', quarterly: '每季', yearly: '每年', custom: '自定义' };
const CHANNELS = ['alipay', 'wechat', 'apple', 'card', 'other'];
const CHANNEL_LABELS = { alipay: '支付宝', wechat: '微信', apple: 'Apple', card: '银行卡', other: '其他' };
const STATUSES = ['active', 'trial', 'cancelled'];
const STATUS_LABELS = { active: '进行中', trial: '试用期', cancelled: '已取消' };
const DEFAULT_CATEGORIES = ['影视音乐', '软件工具', '云存储', 'AI 订阅', '电商会员', '游戏', '学习', '生活服务', '其他'];

const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  currencySymbol: '¥',
  /** 续费前提醒天数（0=仅当天提醒） */
  remindDays: 3,
  /** 试用转正预警天数 */
  trialWarnDays: 3,
};

const K = {
  subPrefix: 'changqi.sub.',
  sub(id) { return `changqi.sub.${id}`; },
  settings: 'changqi.settings',
};

/** 本地日期 → 'YYYY-MM-DD' */
function todayStr(nowMs) {
  const d = new Date(nowMs == null ? Date.now() : nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function fmtYMD(p) {
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

/** 天数差 target - base（按纯日期，UTC 算术防 DST） */
function diffDays(base, target) {
  const b = parseYMD(base); const t = parseYMD(target);
  if (!b || !t) return null;
  return Math.round((Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000);
}

/** 'YYYY-MM-DD' 日期比较：a<b → -1，a===b → 0，a>b → 1 */
function cmpDate(a, b) {
  const d = diffDays(b, a);
  return d === 0 ? 0 : d > 0 ? 1 : -1;
}

/** 月索引（y*12 + m-1）下的 clamp 日：名义日照 clamp 到当月月末（anniversary 语义） */
function clampDayAtMonthIndex(idx, nominalDay) {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return { y, m, d: Math.min(nominalDay, daysInMonth(y, m)) };
}

/**
 * 下次扣费日：从 anchor 起步（anchor 为名义周期原点），步进到首个
 * 「>= today 且 > notBefore」的扣费日。
 * - anchor 在未来 → 直接返回 anchor
 * - anchor === today → 返回 today（今天将扣）
 * - notBefore（如 lastConfirmedDate，已确认扣费的最后一天）为排他下限：
 *   advance 确认已扣后，当天不再重复报警，下期自然顺延
 * - monthly/quarterly/yearly 用 anniversary 语义：名义日取 anchor 的日，
 *   仅当月 clamp 到月末（1/31 → 2/28 → 3/31，而非漂移成 28 日）
 * - weekly/custom 直接加天数
 * 返回 null 仅在 guard 兜底（理论不可达）时出现。
 */
function nextChargeDateFrom(anchor, cycle, cycleDays, today, notBefore) {
  const a = parseYMD(anchor);
  const t = parseYMD(today);
  if (!a || !t) return null;
  const floorMs = notBefore && parseYMD(notBefore) ? Date.UTC(parseYMD(notBefore).y, parseYMD(notBefore).m - 1, parseYMD(notBefore).d) : null;
  if (cycle === 'weekly' || cycle === 'custom') {
    const step = cycle === 'weekly' ? 7 : Math.max(1, Math.floor(cycleDays || 1));
    // 加天数用 UTC 算术
    let ms = Date.UTC(a.y, a.m - 1, a.d);
    const tMs = Date.UTC(t.y, t.m - 1, t.d);
    let guard = 0;
    while (ms < tMs || (floorMs != null && ms <= floorMs)) {
      ms += step * 86400000;
      if (++guard > 6000) return null;
    }
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  if (cycle === 'monthly' || cycle === 'quarterly') {
    const stepMonths = cycle === 'monthly' ? 1 : 3;
    let idx = a.y * 12 + (a.m - 1);
    let guard = 0;
    while (guard <= 3000) {
      const cur = clampDayAtMonthIndex(idx, a.d);
      const curMs = Date.UTC(cur.y, cur.m - 1, cur.d);
      // 首个 >= today 且 > notBefore 的扣费日
      if (curMs >= Date.UTC(t.y, t.m - 1, t.d) && (floorMs == null || curMs > floorMs)) return fmtYMD(cur);
      idx += stepMonths;
      guard++;
    }
    return null;
  }
  if (cycle === 'yearly') {
    let y = a.y;
    let guard = 0;
    while (guard <= 300) {
      const cur = { y, m: a.m, d: Math.min(a.d, daysInMonth(y, a.m)) };
      const curMs = Date.UTC(cur.y, cur.m - 1, cur.d);
      if (curMs >= Date.UTC(t.y, t.m - 1, t.d) && (floorMs == null || curMs > floorMs)) return fmtYMD(cur);
      y += 1;
      guard++;
    }
    return null;
  }
  return null;
}

/** 订阅的下次扣费日：trial → 试用期截止日；cancelled → null；active → 推导（排除已确认期） */
function nextChargeDateOf(sub, today) {
  if (!sub || typeof sub !== 'object') return null;
  if (sub.status === 'cancelled') return null;
  if (sub.status === 'trial') return sub.trialEndsAt || null;
  return nextChargeDateFrom(sub.anchorDate, sub.cycle, sub.cycleDays, today, sub.lastConfirmedDate);
}

/** 月度化金额（round2）：口径唯一权威 */
function monthlyEquivalent(sub) {
  const amt = Number(sub && sub.amount) || 0;
  switch (sub && sub.cycle) {
    case 'weekly': return round2(amt * 52 / 12);
    case 'monthly': return round2(amt);
    case 'quarterly': return round2(amt / 3);
    case 'yearly': return round2(amt / 12);
    case 'custom': {
      const days = Math.max(1, Math.floor(Number(sub.cycleDays) || 1));
      return round2(amt * (365.25 / 12) / days);
    }
    default: return 0;
  }
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function fmtMoney(n, symbol) {
  const sym = symbol == null ? '¥' : symbol;
  const num = Number(n) || 0;
  const neg = num < 0;
  const [i, f] = Math.abs(num).toFixed(2).split('.');
  const ii = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${sym}${ii}.${f}`;
}

/**
 * 提醒分级（纯派生）：cancelled → null；
 * trial 以 trialEndsAt 为扣费日与 active 同口径分级（0 天 today、≤remindDays soon、
 * ≤7 week），进入 trialWarnDays 窗口后升级为 'trial'（今日之后最高关注级）；
 * active 按下次扣费日：0 天 'today'，≤remindDays 'soon'，≤7 'week'，否则 'calm'
 */
function urgencyOf(sub, settings, today) {
  if (!sub || sub.status === 'cancelled') return null;
  const remindDays = Math.max(0, Number(settings && settings.remindDays) || 0);
  const trialWarnDays = Math.max(0, Number(settings && settings.trialWarnDays) || 0);
  if (sub.status === 'trial') {
    const d = sub.trialEndsAt ? diffDays(today, sub.trialEndsAt) : null;
    if (d == null) return 'calm';
    if (d <= trialWarnDays) return 'trial';
    if (d <= 0) return 'today';
    if (d <= remindDays) return 'soon';
    if (d <= 7) return 'week';
    return 'calm';
  }
  const next = nextChargeDateOf(sub, today);
  if (!next) return 'calm';
  const d = diffDays(today, next);
  if (d != null && d <= 0) return 'today';
  if (d != null && d <= remindDays) return 'soon';
  if (d != null && d <= 7) return 'week';
  return 'calm';
}

const URGENCY_LABELS = { today: '今天扣费', soon: '即将扣费', week: '本周内', trial: '试用将转正', calm: '' };
const URGENCY_ORDER = { today: 0, trial: 1, soon: 2, week: 3, calm: 4 };

/**
 * 归一化校验（新增/更新共用）。返回 { error } 或 { sub }。
 * 校验：name 非空≤60、amount 正数、cycle 合法、custom 必带 cycleDays≥1、
 * anchorDate 合法日期、channel 合法、trialEndsAt 提供则 status=trial 且日期合法。
 */
function normalizeSub(raw, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  if (!raw || typeof raw !== 'object') return { error: '参数缺失' };
  const name = String(raw.name == null ? '' : raw.name).trim();
  if (!name) return { error: '需要 name（订阅名称）' };
  if (name.length > 60) return { error: 'name 过长（≤60 字）' };
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'amount 需为正数（每期金额）' };
  const amt = round2(amount);
  if (amt > 1e9) return { error: 'amount 过大' };
  const cycle = String(raw.cycle || 'monthly');
  if (!CYCLES.includes(cycle)) return { error: `cycle 需为 ${CYCLES.join('/')}` };
  let cycleDays;
  if (cycle === 'custom') {
    cycleDays = Math.floor(Number(raw.cycleDays));
    if (!Number.isFinite(cycleDays) || cycleDays < 1) return { error: 'custom 周期需提供 cycleDays（≥1 的整数天）' };
  }
  const anchor = String(raw.anchorDate || '').trim();
  if (!anchor) return { error: '需要 anchorDate（上次扣费日或下次扣费日，YYYY-MM-DD）' };
  if (!parseYMD(anchor)) return { error: 'anchorDate 格式应为 YYYY-MM-DD' };
  const channel = String(raw.channel || 'other');
  if (!CHANNELS.includes(channel)) return { error: `channel 需为 ${CHANNELS.join('/')}` };
  const note = String(raw.note == null ? '' : raw.note).trim();
  if (note.length > 200) return { error: 'note 过长（≤200 字）' };
  let trialEndsAt;
  if (raw.trialEndsAt != null && raw.trialEndsAt !== '') {
    trialEndsAt = String(raw.trialEndsAt).trim();
    if (!parseYMD(trialEndsAt)) return { error: 'trialEndsAt 格式应为 YYYY-MM-DD' };
  }
  // status 显式优先（试用期内也可直接取消）；缺省时 trialEndsAt 隐含 trial
  const status = STATUSES.includes(raw.status) ? raw.status : (trialEndsAt ? 'trial' : 'active');
  if (status === 'trial' && !trialEndsAt) return { error: 'trial 状态需要 trialEndsAt（试用期截止日）' };
  const category = String(raw.category == null ? '' : raw.category).trim() || '其他';
  if (category.length > 30) return { error: 'category 过长（≤30 字）' };
  const sub = {
    id: String(raw.id || genId(now)),
    name,
    amount: amt,
    currency: String(raw.currency || 'CNY'),
    cycle,
    channel,
    category,
    status,
    anchorDate: anchor,
    note,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: now,
  };
  if (cycleDays != null) sub.cycleDays = cycleDays;
  if (trialEndsAt) sub.trialEndsAt = trialEndsAt;
  if (raw.lastConfirmedDate && parseYMD(raw.lastConfirmedDate)) sub.lastConfirmedDate = String(raw.lastConfirmedDate);
  return { sub };
}

/** 更新合并：只接受白名单字段，仍走 normalizeSub 全量校验（保旧值兜底） */
function applyPatch(existing, patch, nowMs) {
  if (!existing || typeof existing !== 'object') return { error: '订阅不存在' };
  const merged = { ...existing };
  const keys = ['name', 'amount', 'currency', 'cycle', 'cycleDays', 'anchorDate', 'channel', 'category', 'status', 'trialEndsAt', 'note', 'lastConfirmedDate'];
  for (const k of keys) {
    if (patch && patch[k] !== undefined) merged[k] = patch[k];
  }
  // trialEndsAt 显式置空：退出试用
  if (patch && patch.trialEndsAt === '') {
    delete merged.trialEndsAt;
    if (merged.status === 'trial') merged.status = 'active';
  }
  return normalizeSub(merged, nowMs);
}

function genId(nowMs) {
  const n = nowMs == null ? Date.now() : nowMs;
  return `sub_${n.toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
}

/**
 * 透视聚合（active + trial 参与；cancelled 只计数量）。
 * monthKey 形如 'YYYY-MM'：本月将扣 = 下次扣费日落在本月的笔与钱。
 */
function computeOverview(subs, settings, today, monthKey) {
  const list = (Array.isArray(subs) ? subs : []).filter((s) => s && typeof s === 'object');
  const active = list.filter((s) => s.status === 'active' || s.status === 'trial');
  const cancelledCount = list.length - active.length;

  let monthlyTotal = 0;
  const rows = [];
  for (const s of active) {
    const me = monthlyEquivalent(s);
    monthlyTotal += me;
    const next = nextChargeDateOf(s, today);
    const urg = urgencyOf(s, settings, today);
    rows.push({
      sub: s,
      monthlyEquiv: me,
      nextChargeDate: next,
      daysUntil: next ? diffDays(today, next) : null,
      urgency: urg,
    });
  }
  rows.sort((a, b) => {
    const ua = URGENCY_ORDER[a.urgency] ?? 9;
    const ub = URGENCY_ORDER[b.urgency] ?? 9;
    if (ua !== ub) return ua - ub;
    const da = a.daysUntil == null ? 1e9 : a.daysUntil;
    const db = b.daysUntil == null ? 1e9 : b.daysUntil;
    if (da !== db) return da - db;
    return b.monthlyEquiv - a.monthlyEquiv;
  });

  // 本月将扣 & 今天将扣
  let monthCount = 0; let monthSum = 0; let todayCount = 0; let todaySum = 0;
  for (const r of rows) {
    if (r.nextChargeDate && r.nextChargeDate.slice(0, 7) === monthKey) {
      monthCount += 1; monthSum += r.sub.amount;
    }
    if (r.daysUntil === 0) { todayCount += 1; todaySum += r.sub.amount; }
  }

  // 渠道 / 分类聚合（月度化口径）
  const chMap = new Map(); const catMap = new Map();
  for (const r of rows) {
    const ch = chMap.get(r.sub.channel) || { channel: r.sub.channel, label: CHANNEL_LABELS[r.sub.channel] || r.sub.channel, monthlySum: 0, count: 0 };
    ch.monthlySum = round2(ch.monthlySum + r.monthlyEquiv); ch.count += 1;
    chMap.set(r.sub.channel, ch);
    const cat = catMap.get(r.sub.category) || { category: r.sub.category, monthlySum: 0, count: 0 };
    cat.monthlySum = round2(cat.monthlySum + r.monthlyEquiv); cat.count += 1;
    catMap.set(r.sub.category, cat);
  }

  const trialRows = rows.filter((r) => r.sub.status === 'trial');
  const trialExpiring = trialRows
    .filter((r) => r.daysUntil != null && r.daysUntil <= (Number(settings && settings.trialWarnDays) || 0))
    .map((r) => ({ id: r.sub.id, name: r.sub.name, trialEndsAt: r.sub.trialEndsAt, daysUntil: r.daysUntil }));

  return {
    today,
    monthKey,
    currencySymbol: (settings && settings.currencySymbol) || '¥',
    monthlyTotal: round2(monthlyTotal),
    yearlyTotal: round2(monthlyTotal * 12),
    activeCount: rows.length,
    trialCount: trialRows.length,
    cancelledCount,
    monthCharge: { count: monthCount, sum: round2(monthSum) },
    todayCharge: { count: todayCount, sum: round2(todaySum) },
    rows,
    upcoming: rows.filter((r) => r.daysUntil != null && r.daysUntil <= 7).map((r) => ({
      id: r.sub.id, name: r.sub.name, amount: r.sub.amount, cycle: r.sub.cycle,
      date: r.nextChargeDate, daysUntil: r.daysUntil, urgency: r.urgency,
      isTrial: r.sub.status === 'trial', trialEndsAt: r.sub.trialEndsAt || undefined,
    })),
    trialExpiring,
    byChannel: [...chMap.values()].sort((a, b) => b.monthlySum - a.monthlySum),
    byCategory: [...catMap.values()].sort((a, b) => b.monthlySum - a.monthlySum),
    top: rows.slice().sort((a, b) => b.monthlyEquiv - a.monthlyEquiv).slice(0, 3)
      .map((r) => ({ id: r.sub.id, name: r.sub.name, monthlyEquiv: r.monthlyEquiv })),
  };
}

/** 取消路径引导（回应「App 内取消不彻底、入口割裂」痛点） */
const CANCEL_GUIDES = {
  alipay: '支付宝：App → 我的 → 设置（右上齿轮）→ 支付设置 → 免密支付/自动扣款 → 选中该服务 → 关闭服务。关闭后建议在对应服务 App 内再确认订阅已退订。',
  wechat: '微信：我 → 服务 → 钱包 → 支付设置 → 自动续费（扣费服务）→ 选中该服务 → 关闭扣费。关闭后建议在对应服务 App 内再确认订阅已退订。',
  apple: 'Apple：iPhone 设置 → 顶部你的名字 → 订阅 → 选中该订阅 → 取消订阅。注意：只在服务 App 内退订不彻底，必须在 Apple 账户的订阅页取消才停扣。',
  card: '银行卡代扣：到该服务的官网/App 的会员或订阅设置里关闭自动续费；若无法取消，可联系发卡行关闭对该商户的代扣授权。',
  other: '到该服务的官网/App 的会员或订阅设置里关闭自动续费；建议再确认支付渠道（支付宝/微信/Apple）侧的扣费协议已一并解除。',
};

function cancelGuide(channel) {
  return CANCEL_GUIDES[channel] || CANCEL_GUIDES.other;
}

/** CSV 导出（带 BOM 便于 Excel 识别 UTF-8；字段全部引号包裹防注入） */
function toCsv(subs, today) {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const head = ['name', 'amount', 'currency', 'cycle', 'cycleDays', 'anchorDate', 'nextChargeDate', 'monthlyEquivalent', 'channel', 'category', 'status', 'trialEndsAt', 'note', 'createdAt'];
  const lines = [head.map(esc).join(',')];
  for (const s of Array.isArray(subs) ? subs : []) {
    if (!s || typeof s !== 'object') continue;
    const next = nextChargeDateOf(s, today);
    lines.push([
      s.name, s.amount, s.currency, s.cycle, s.cycleDays == null ? '' : s.cycleDays,
      s.anchorDate, next == null ? '' : next, monthlyEquivalent(s),
      CHANNEL_LABELS[s.channel] || s.channel, s.category, STATUS_LABELS[s.status] || s.status,
      s.trialEndsAt == null ? '' : s.trialEndsAt, s.note,
      s.createdAt ? new Date(s.createdAt).toISOString() : '',
    ].map(esc).join(','));
  }
  return '\ufeff' + lines.join('\r\n');
}

/** 订阅卡一行文案（MCP 列表/面板复用的展示口径） */
function fmtSubLine(sub, settings, today) {
  const sym = (settings && settings.currencySymbol) || '¥';
  const next = nextChargeDateOf(sub, today);
  const cyc = sub.cycle === 'custom' ? `每${sub.cycleDays}天` : CYCLE_LABELS[sub.cycle] || sub.cycle;
  const bits = [
    `[${sub.id}] ${sub.name}`,
    `${fmtMoney(sub.amount, sym)}/${cyc}（月均 ${fmtMoney(monthlyEquivalent(sub), sym)}）`,
    sub.status === 'cancelled' ? '已取消' : next ? `下期 ${next}（${diffDays(today, next)} 天后）` : '无下期',
    CHANNEL_LABELS[sub.channel] || sub.channel,
    sub.category,
  ];
  if (sub.status === 'trial') bits.push(`试用至 ${sub.trialEndsAt}`);
  if (sub.note) bits.push(sub.note);
  return bits.join(' · ');
}

module.exports = {
  CYCLES, CYCLE_LABELS, CHANNELS, CHANNEL_LABELS, STATUSES, STATUS_LABELS,
  DEFAULT_CATEGORIES, DEFAULT_SETTINGS, K,
  URGENCY_LABELS, URGENCY_ORDER,
  todayStr, parseYMD, fmtYMD, daysInMonth, diffDays, cmpDate,
  nextChargeDateFrom, nextChargeDateOf, monthlyEquivalent, urgencyOf,
  round2, fmtMoney, normalizeSub, applyPatch, genId,
  computeOverview, CANCEL_GUIDES, cancelGuide, toCsv, fmtSubLine,
};
