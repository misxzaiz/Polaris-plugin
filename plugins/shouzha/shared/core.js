'use strict';
/**
 * core.js —— 守闸（订阅与续费管家）共享核心（单一权威，零依赖）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 bundle）共用：
 * 键空间、订阅归一化、周期引擎（下次扣费日推进/月均年化归一）、
 * 对账状态机（逾期/即将扣费/试用转正 三榜）、透视统计（现金流投影/
 * 分类/年化排行/已省）、价格史、CSV 导入导出。
 * 所有"计算"必须放这里，两侧只做 IO（cap.kv 读写），防止口径漂移。
 *
 * 产品核心（与记账/提醒工具的本质区别）：
 *   口袋账本记「过去花掉的」，守闸盯「未来要扣的」——四个沉默扣费通道：
 *   1. 免费试用转正   → 试用红榜（trialEndsAt 到期前红榜）
 *   2. 自动续费沉默扣款 → 对账闭环（扣费日过境未确认 = 逾期红榜，不静默滚周期）
 *   3. 涨价无感       → 价格史（每次对账记实付金额，变化即记 price 事件）
 *   4. 僵尸订阅       → 年化排行 + 取消后「年化已省」正反馈
 *
 * 数据契约（cap.kv `shouzha.` 键空间，权威描述见 README）：
 *   shouzha.sub.<id> → Subscription（一订阅一键，低频写，读改写幂等）
 *   shouzha.settings → Settings
 * 纯本地：零后台服务、零外网请求；不存支付凭据（note 提示勿存敏感信息）。
 */

// ── 键空间 ─────────────────────────────────────────────────────────────────
const K = {
  sub: (id) => `shouzha.sub.${id}`,
  subPrefix: 'shouzha.sub.',
  settings: 'shouzha.settings',
};

const DEFAULT_SETTINGS = { schemaVersion: 1, currencySymbol: '¥', defaultRemindDays: 3 };

/** 固定分类（聚合口径稳定；「其他」兜底） */
const CATEGORIES = ['视频娱乐', '音乐', '云盘存储', '软件工具', '生活服务', '新闻资讯', '游戏', '通信', '金融会员', '其他'];

const CYCLES = {
  month: { label: '每月', perYear: 12 },
  year: { label: '每年', perYear: 1 },
  quarter: { label: '每季', perYear: 4 },
  week: { label: '每周', perYear: 52 },
  custom: { label: '自定义', perYear: null },
};

const STATUSES = ['active', 'trial', 'paused', 'cancelled'];
const STATUS_LABELS = { active: '生效中', trial: '试用中', paused: '已暂停', cancelled: '已取消' };

const EVENT_KINDS = ['create', 'renew', 'skip', 'pause', 'resume', 'cancel', 'restore', 'price'];

/** 单字段上限（防 kv 膨胀） */
const LIMITS = {
  name: 40, vendor: 24, plan: 40, note: 300, paymentMethod: 16,
  priceHistory: 60, events: 120, manageUrl: 300, cancelReason: 100,
};
const MAX_AMOUNT = 1e6;

// ── 日期（本地时区，'YYYY-MM-DD' 为权威表示）───────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** epoch ms → 本地 'YYYY-MM-DD' */
function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayStr(now) {
  return dayKeyOf(typeof now === 'number' ? now : Date.now());
}

/** 'YYYY-MM-DD' → 本地当日零点 epoch；非法返回 null */
function dateToTs(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const ts = new Date(y, m - 1, d).getTime();
  // 反解校验：2月30日这类输入会被 Date 归一化成 3 月，必须拒绝
  if (dayKeyOf(ts) !== dateStr) return null;
  return ts;
}

/** 'YYYY-MM-DD' + n 天（经 Date 归一化，自然跨月/跨年） */
function addDays(dateStr, n) {
  const ts = dateToTs(dateStr);
  if (ts === null) return null;
  return dayKeyOf(ts + n * 86400000);
}

/** 日期差（to - from，天；均须合法） */
function daysBetween(fromStr, toStr) {
  const a = dateToTs(fromStr);
  const b = dateToTs(toStr);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * 周期推进：dateStr 的下一个扣费日。
 * month/quarter/year 走月序数推进并对月末钳制（1/31 → 2/28；闰年 2/29 → 平年 2/28），
 * week/custom 走天数千加。非法输入返回 null。
 */
function advanceDate(dateStr, cycle, customDays) {
  const ts = dateToTs(dateStr);
  if (ts === null) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (cycle === 'month' || cycle === 'quarter' || cycle === 'year') {
    const step = cycle === 'month' ? 1 : cycle === 'quarter' ? 3 : 12;
    const ny = y + Math.floor((m - 1 + step) / 12);
    const nm = ((m - 1 + step) % 12) + 1;
    // 月末钳制：目标月最后一天
    const lastDay = new Date(ny, nm, 0).getDate();
    return `${ny}-${pad2(nm)}-${pad2(Math.min(d, lastDay))}`;
  }
  if (cycle === 'week') return addDays(dateStr, 7);
  if (cycle === 'custom') {
    const n = Number(customDays);
    if (!Number.isInteger(n) || n < 1) return null;
    return addDays(dateStr, n);
  }
  return null;
}

/** 每年扣费次数（custom 按天数千折算）；非法返回 null */
function perYearOf(cycle, customDays) {
  const c = CYCLES[cycle];
  if (!c) return null;
  if (c.perYear !== null) return c.perYear;
  const n = Number(customDays);
  if (!Number.isFinite(n) || n < 1) return null;
  return 365 / n;
}

/** 月均成本（周期归一）；非法返回 null。与 annualCost 各自独立从 perYear 计算，避免双重舍入漂移 */
function monthlyCost(sub) {
  if (!sub) return null;
  const perYear = perYearOf(sub.cycle, sub.customDays);
  if (perYear === null) return null;
  return Math.round(((sub.amount * perYear) / 12) * 100) / 100;
}

/** 年化成本 */
function annualCost(sub) {
  if (!sub) return null;
  const perYear = perYearOf(sub.cycle, sub.customDays);
  if (perYear === null) return null;
  return Math.round(sub.amount * perYear * 100) / 100;
}

/** '每月' / '每 90 天' 展示标签 */
function cycleLabel(sub) {
  if (!sub) return '';
  if (sub.cycle === 'custom') return `每 ${sub.customDays} 天`;
  return (CYCLES[sub.cycle] || {}).label || sub.cycle;
}

function fmtMoney(n, symbol) {
  return `${symbol || '¥'}${(Math.round(n * 100) / 100).toFixed(2)}`;
}

function makeId(now) {
  const t = typeof now === 'number' ? now : Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return 's' + t.toString(36) + rand;
}

// ── 归一化 ─────────────────────────────────────────────────────────────────
function cleanStr(v, max) {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  return s.slice(0, max);
}

/** http(s) URL 校验（管理/取消入口；拒 javascript: 等其他协议） */
function cleanUrl(v) {
  const s = cleanStr(v, LIMITS.manageUrl);
  if (s === undefined) return undefined;
  return /^https?:\/\//i.test(s) ? s : undefined;
}

/**
 * 归一化一个订阅。非法返回 { error }，合法返回 { sub }。
 * raw: { id?, name, vendor?, plan?, amount, cycle, customDays?, nextRenewalDate?,
 *        autoRenew?, status?, trialEndsAt?, paymentMethod?, manageUrl?, note?,
 *        remindDaysBefore?, priceHistory?, events?, cancelledAt?, cancelReason?,
 *        createdAt?, updatedAt? }
 * 语义要点：
 *  - nextRenewalDate 缺省 = 今天推进一个周期（「现在开通」的天然默认）
 *  - status=trial 必须给 trialEndsAt（试用无到期日＝红榜失效，拒绝）
 *  - priceHistory 缺省补 { date: 开通日, amount }（开通价，供涨价检出）
 */
function normalizeSub(raw, now) {
  if (!raw || typeof raw !== 'object') return { error: '缺少订阅数据' };
  const ts = typeof now === 'number' ? now : Date.now();
  const name = cleanStr(raw.name, LIMITS.name);
  if (!name) return { error: '名称必填（≤40 字）' };
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: `金额必须是正数（收到：${raw.amount}）` };
  if (amount > MAX_AMOUNT) return { error: `金额过大（上限 ${MAX_AMOUNT}），疑似输入错误` };
  const cycle = CYCLES[raw.cycle] ? raw.cycle : null;
  if (!cycle) return { error: `周期须为 ${Object.keys(CYCLES).join('/')}（收到：${raw.cycle}）` };
  let customDays;
  if (cycle === 'custom') {
    const n = Number(raw.customDays);
    if (!Number.isInteger(n) || n < 1 || n > 3650) return { error: '自定义周期须为 1..3650 的整数天' };
    customDays = n;
  }
  const status = STATUSES.includes(raw.status) ? raw.status : 'active';
  const trialEndsAt = cleanStr(raw.trialEndsAt, 10);
  if (status === 'trial' && dateToTs(trialEndsAt || '') === null) {
    return { error: '试用订阅必须提供 trialEndsAt（试用到期日，YYYY-MM-DD）——试用无到期日就无法红榜提醒' };
  }
  let nextRenewalDate = cleanStr(raw.nextRenewalDate, 10);
  if (nextRenewalDate !== undefined && dateToTs(nextRenewalDate) === null) {
    // 显式给了扣费日但格式非法：报错而非静默换默认（AI 传参错误不能被吞掉）
    return { error: `下次扣费日非法（${raw.nextRenewalDate}，须为 YYYY-MM-DD）` };
  }
  if (!nextRenewalDate) {
    const fallback = advanceDate(todayStr(ts), cycle, customDays);
    if (!fallback) return { error: 'nextRenewalDate 缺省且无法按周期推算默认值' };
    nextRenewalDate = fallback;
  }
  const remindDaysBefore = (() => {
    const n = Number(raw.remindDaysBefore);
    if (!Number.isFinite(n)) return null; // 由调用方以 settings.defaultRemindDays 兜底
    return Math.max(0, Math.min(30, Math.round(n)));
  })();

  const created = Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Number(raw.createdAt) : ts;
  const priceHistory = Array.isArray(raw.priceHistory)
    ? raw.priceHistory
      .filter((p) => p && typeof p === 'object' && Number.isFinite(Number(p.amount)) && dateToTs(String(p.date || '')) !== null)
      .slice(0, LIMITS.priceHistory)
      .map((p) => ({ date: String(p.date).slice(0, 10), amount: Math.round(Number(p.amount) * 100) / 100, ...(p.note ? { note: cleanStr(p.note, 60) } : {}) }))
    : [];
  if (!priceHistory.length) priceHistory.push({ date: todayStr(created), amount: Math.round(amount * 100) / 100 });
  const events = Array.isArray(raw.events)
    ? raw.events
      .filter((e) => e && typeof e === 'object' && EVENT_KINDS.includes(e.kind))
      .slice(0, LIMITS.events)
      .map((e) => ({ ts: Number(e.ts) > 0 ? Number(e.ts) : created, kind: e.kind, ...(e.note ? { note: cleanStr(e.note, 100) } : {}) }))
    : [];

  const sub = {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : makeId(ts),
    name,
    category: CATEGORIES.includes(raw.category) ? raw.category : '其他',
    vendor: cleanStr(raw.vendor, LIMITS.vendor),
    plan: cleanStr(raw.plan, LIMITS.plan),
    amount: Math.round(amount * 100) / 100,
    cycle,
    ...(customDays ? { customDays } : {}),
    nextRenewalDate,
    autoRenew: raw.autoRenew !== false,
    status,
    ...(trialEndsAt ? { trialEndsAt } : {}),
    paymentMethod: cleanStr(raw.paymentMethod, LIMITS.paymentMethod),
    manageUrl: cleanUrl(raw.manageUrl),
    note: cleanStr(raw.note, LIMITS.note),
    remindDaysBefore,
    priceHistory,
    events,
    ...(status === 'cancelled' && raw.cancelledAt && dateToTs(String(raw.cancelledAt)) !== null ? { cancelledAt: String(raw.cancelledAt).slice(0, 10) } : {}),
    ...(raw.cancelReason ? { cancelReason: cleanStr(raw.cancelReason, LIMITS.cancelReason) } : {}),
    createdAt: created,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) && Number(raw.updatedAt) > 0 ? Number(raw.updatedAt) : ts,
  };
  return { sub };
}

/** 以已入库订阅为基底合并更新（编辑路径）：仅白名单字段可改，金额变化自动记价格史+事件 */
function applyUpdate(sub, patch, now) {
  const ts = typeof now === 'number' ? now : Date.now();
  const merged = { ...sub };
  const next = { ...patch };
  // 金额：变化 → 价格史 + price 事件
  if (next.amount !== undefined && Number(next.amount) !== merged.amount) {
    const a = Number(next.amount);
    if (!Number.isFinite(a) || a <= 0 || a > MAX_AMOUNT) return { error: `金额非法（${next.amount}）` };
    merged.amount = Math.round(a * 100) / 100;
    merged.priceHistory = [...(merged.priceHistory || []), { date: todayStr(ts), amount: merged.amount }].slice(-LIMITS.priceHistory);
    merged.events = [...(merged.events || []), { ts, kind: 'price', note: `金额调整为 ${merged.amount}` }].slice(-LIMITS.events);
    delete next.amount;
  }
  // 周期/自定义天数：变化 → 校验组合合法
  if (next.cycle !== undefined && next.cycle !== merged.cycle) {
    if (!CYCLES[next.cycle]) return { error: `周期须为 ${Object.keys(CYCLES).join('/')}` };
    merged.cycle = next.cycle;
    if (next.cycle !== 'custom') delete merged.customDays;
  }
  if (next.customDays !== undefined && next.customDays !== merged.customDays) {
    const n = Number(next.customDays);
    if (!Number.isInteger(n) || n < 1 || n > 3650) return { error: '自定义周期须为 1..3650 的整数天' };
    if (merged.cycle !== 'custom') return { error: 'customDays 仅在 cycle=custom 下可设置' };
    merged.customDays = n;
  }
  // 下次扣费日：须为合法日期
  if (next.nextRenewalDate !== undefined) {
    if (dateToTs(String(next.nextRenewalDate)) === null) return { error: `下次扣费日非法（${next.nextRenewalDate}）` };
    merged.nextRenewalDate = String(next.nextRenewalDate).slice(0, 10);
  }
  // 其余简单字段
  if (next.name !== undefined) { const v = cleanStr(next.name, LIMITS.name); if (!v) return { error: '名称不可为空' }; merged.name = v; }
  if (next.category !== undefined) { if (!CATEGORIES.includes(next.category)) return { error: `未知分类「${next.category}」` }; merged.category = next.category; }
  if (next.vendor !== undefined) merged.vendor = cleanStr(next.vendor, LIMITS.vendor);
  if (next.plan !== undefined) merged.plan = cleanStr(next.plan, LIMITS.plan);
  if (next.autoRenew !== undefined) merged.autoRenew = next.autoRenew !== false;
  if (next.trialEndsAt !== undefined) {
    if (next.trialEndsAt === null || next.trialEndsAt === '') delete merged.trialEndsAt;
    else if (dateToTs(String(next.trialEndsAt)) === null) return { error: `试用到期日非法（${next.trialEndsAt}）` };
    else merged.trialEndsAt = String(next.trialEndsAt).slice(0, 10);
  }
  if (next.paymentMethod !== undefined) merged.paymentMethod = cleanStr(next.paymentMethod, LIMITS.paymentMethod);
  if (next.manageUrl !== undefined) merged.manageUrl = cleanUrl(next.manageUrl);
  if (next.note !== undefined) merged.note = cleanStr(next.note, LIMITS.note);
  if (next.remindDaysBefore !== undefined) {
    const n = Number(next.remindDaysBefore);
    merged.remindDaysBefore = Number.isFinite(n) ? Math.max(0, Math.min(30, Math.round(n))) : null;
  }
  merged.updatedAt = ts;
  return { sub: merged };
}

// ── 对账状态机 ─────────────────────────────────────────────────────────────
/**
 * 单订阅当前对账态（红黄绿判断的唯一定义）：
 *  - 'overdue'    生效中但扣费日已过境未对账（沉默扣款高危）
 *  - 'trialUrgent' 试用且距转正 ≤ 提醒窗口
 *  - 'dueSoon'    生效中且距扣费 ≤ 提醒窗口（含今天）
 *  - 'trial'      试用中但转正日尚远
 *  - 'ok'         其余
 */
function renewState(sub, today) {
  const t = typeof today === 'string' ? today : todayStr(today);
  if (sub.status === 'active') {
    const diff = daysBetween(t, sub.nextRenewalDate); // 负 = 已过期
    if (diff !== null && diff < 0) return 'overdue';
    const win = sub.remindDaysBefore != null ? sub.remindDaysBefore : DEFAULT_SETTINGS.defaultRemindDays;
    if (diff !== null && diff <= win) return 'dueSoon';
    return 'ok';
  }
  if (sub.status === 'trial' && sub.trialEndsAt) {
    const diff = daysBetween(t, sub.trialEndsAt);
    if (diff === null) return 'trial';
    const win = sub.remindDaysBefore != null ? sub.remindDaysBefore : DEFAULT_SETTINGS.defaultRemindDays;
    return diff <= win ? 'trialUrgent' : 'trial';
  }
  return 'ok';
}

/**
 * 三榜（AI sub_due 与面板总览共用）：
 *  overdue   逾期待对账（按过期天数降序——欠账最久的排最前）
 *  upcoming  即将扣费（按扣费日升序）
 *  trials    试用转正（按到期日升序；urgent 在前）
 */
function dueBoard(subs, today) {
  const t = typeof today === 'string' ? today : todayStr(today);
  const overdue = [];
  const upcoming = [];
  const trials = [];
  for (const s of subs || []) {
    if (s.status === 'cancelled' || s.status === 'paused') continue;
    const st = renewState(s, t);
    if (st === 'overdue') overdue.push(s);
    else if (st === 'dueSoon') upcoming.push(s);
    else if (st === 'trialUrgent' || st === 'trial') trials.push(s);
  }
  const asc = (k) => (a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0);
  overdue.sort((a, b) => (a.nextRenewalDate < b.nextRenewalDate ? -1 : 1));
  upcoming.sort(asc('nextRenewalDate'));
  trials.sort((a, b) => (a.trialEndsAt || '9999' ) <= (b.trialEndsAt || '9999') ? -1 : 1);
  return { overdue, upcoming, trials };
}

// ── 状态迁移（返回 { sub } 或 { error }；事件流水在此追加）─────────────────
function pushEvent(sub, kind, note, ts) {
  return [...(sub.events || []), { ts, kind, ...(note ? { note: String(note).slice(0, 100) } : {}) }].slice(-LIMITS.events);
}

/** 对账-确认续费：推进下一周期；实付金额 ≠ 现价时记价格史（涨价/降价检出） */
function renewSub(sub, opts, now) {
  const ts = typeof now === 'number' ? now : Date.now();
  const o = opts || {};
  if (sub.status === 'cancelled') return { error: `「${sub.name}」已取消，请先恢复再对账` };
  if (sub.status === 'paused') return { error: `「${sub.name}」已暂停，请先恢复再对账` };
  let s = { ...sub };
  // 实付金额：≠ 现价 → 更新现价 + 价格史 + price 事件
  if (o.amount !== undefined && Number(o.amount) !== s.amount) {
    const a = Number(o.amount);
    if (!Number.isFinite(a) || a <= 0 || a > MAX_AMOUNT) return { error: `实付金额非法（${o.amount}）` };
    s.amount = Math.round(a * 100) / 100;
    s.priceHistory = [...(s.priceHistory || []), { date: todayStr(ts), amount: s.amount }].slice(-LIMITS.priceHistory);
    s = { ...s, events: pushEvent(s, 'price', `对账实付 ${s.amount}（原 ${sub.amount}）`, ts) };
  }
  // 推进：以当前 nextRenewalDate 为基准（自动续费的下一期仍按原节奏）；可显式指定
  const base = o.date && dateToTs(String(o.date)) !== null ? String(o.date).slice(0, 10) : s.nextRenewalDate;
  const next = advanceDate(base, s.cycle, s.customDays);
  if (!next) return { error: '周期推进失败（日期/周期非法）' };
  s.nextRenewalDate = next;
  // 试用转正对账：清试用态
  if (s.status === 'trial') s.status = 'active';
  s.events = pushEvent(s, 'renew', o.note, ts).slice(-LIMITS.events);
  s.updatedAt = ts;
  return { sub: s };
}

/** 对账-跳过：这次没续（已取消签约/不再续）→ 转取消，可恢复 */
function skipSub(sub, opts, now) {
  const ts = typeof now === 'number' ? now : Date.now();
  const o = opts || {};
  const s = {
    ...sub,
    status: 'cancelled',
    autoRenew: false,
    cancelledAt: todayStr(ts),
    ...(o.reason ? { cancelReason: String(o.reason).slice(0, LIMITS.cancelReason) } : {}),
    events: pushEvent(sub, 'skip', o.note, ts).slice(-LIMITS.events),
    updatedAt: ts,
  };
  return { sub: s };
}

/** 取消订阅（与 skip 的区别：显式决策，记原因；可恢复，恢复需给下次扣费日） */
function cancelSub(sub, opts, now) {
  const ts = typeof now === 'number' ? now : Date.now();
  const o = opts || {};
  const s = {
    ...sub,
    status: 'cancelled',
    autoRenew: false,
    cancelledAt: todayStr(ts),
    ...(o.reason ? { cancelReason: String(o.reason).slice(0, LIMITS.cancelReason) } : {}),
    events: pushEvent(sub, 'cancel', o.reason || o.note, ts).slice(-LIMITS.events),
    updatedAt: ts,
  };
  return { sub: s };
}

/** 暂停（挂起：不计入成本/榜单，保留档案） */
function pauseSub(sub, opts, now) {
  const ts = typeof now === 'number' ? now : Date.now();
  const s = {
    ...sub,
    status: 'paused',
    events: pushEvent(sub, 'pause', (opts || {}).note, ts).slice(-LIMITS.events),
    updatedAt: ts,
  };
  return { sub: s };
}

/** 恢复（取消/暂停 → 生效）：必须给下次扣费日（旧值已失真） */
function resumeSub(sub, nextRenewalDate, now) {
  const ts = typeof now === 'number' ? now : Date.now();
  if (dateToTs(String(nextRenewalDate || '')) === null) {
    return { error: '恢复订阅必须提供下次扣费日（YYYY-MM-DD）——旧扣费日已失真' };
  }
  const s = {
    ...sub,
    status: 'active',
    autoRenew: true,
    nextRenewalDate: String(nextRenewalDate).slice(0, 10),
    events: pushEvent(sub, 'restore', undefined, ts).slice(-LIMITS.events),
    updatedAt: ts,
  };
  delete s.cancelledAt;
  delete s.cancelReason;
  return { sub: s };
}

// ── 检索 ───────────────────────────────────────────────────────────────────
function filterSubs(subs, { keyword, category, status, autoRenew } = {}) {
  return (subs || []).filter((s) => {
    if (category && s.category !== category) return false;
    if (status && s.status !== status) return false;
    if (autoRenew !== undefined && s.autoRenew !== !!autoRenew) return false;
    if (keyword) {
      const kw = String(keyword).toLowerCase();
      const hay = [s.name, s.vendor, s.plan, s.note, s.paymentMethod].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

// ── 透视统计 ───────────────────────────────────────────────────────────────
/**
 * 全量透视。口径：
 *  - monthlyActive/annualActive 仅 status=active；试用单的「若转正月均」单列 monthlyTrial
 *  - savedMonthly/savedAnnual 为 cancelled 单按现价折算的止损额（取消瞬间的档位）
 *  - cashflow 未来 12 个自然月逐月将扣金额（active 从下次扣费日起按周期推进；
 *    trial 从 trialEndsAt 起扣；逾期单按今天起算——它是「现在就该处理」的钱）
 */
function stats(subs, today, opts) {
  const t = typeof today === 'string' ? today : todayStr(today);
  const windowMonths = opts && Number.isInteger(opts.cashflowMonths) ? opts.cashflowMonths : 12;
  const counts = { active: 0, trial: 0, paused: 0, cancelled: 0 };
  let monthlyActive = 0;
  let monthlyTrial = 0;
  let savedMonthly = 0;
  const byCategory = new Map();
  const rankable = [];
  const priceChanges = [];

  for (const s of subs || []) {
    counts[s.status] = (counts[s.status] || 0) + 1;
    const m = monthlyCost(s);
    if (m === null) continue;
    if (s.status === 'active') {
      monthlyActive += m;
      const c = byCategory.get(s.category) || { category: s.category, monthly: 0, count: 0 };
      c.monthly = Math.round((c.monthly + m) * 100) / 100;
      c.count += 1;
      byCategory.set(s.category, c);
      rankable.push(s);
    } else if (s.status === 'trial') {
      monthlyTrial += m;
      rankable.push(s);
    } else if (s.status === 'cancelled') {
      savedMonthly += m;
    }
    // 涨价检出：首价 vs 现价
    const ph = s.priceHistory || [];
    if (ph.length > 1 && ph[ph.length - 1].amount !== ph[0].amount) {
      priceChanges.push({ id: s.id, name: s.name, from: ph[0].amount, to: ph[ph.length - 1].amount, date: ph[ph.length - 1].date, vendor: s.vendor });
    }
  }

  // 未来 12 个月现金流
  const startTs = dateToTs(t);
  const windowEnd = dayKeyOf(startTs + Math.round(365.25 * 86400000));
  const cashMap = new Map();
  for (const s of rankable) {
    let cursor = s.nextRenewalDate;
    if (s.status === 'trial') cursor = s.trialEndsAt || cursor;
    if (dateToTs(cursor) === null) continue;
    if (dateToTs(cursor) < startTs) cursor = t; // 逾期单挂当月（待对账）
    for (let i = 0; i < 100; i++) {
      if (cursor > windowEnd) break;
      const mk = cursor.slice(0, 7);
      const item = { name: s.name, amount: s.amount, date: cursor };
      const cell = cashMap.get(mk) || { month: mk, amount: 0, items: [] };
      cell.amount = Math.round((cell.amount + s.amount) * 100) / 100;
      if (cell.items.length < 40) cell.items.push(item);
      cashMap.set(mk, cell);
      const next = advanceDate(cursor, s.cycle, s.customDays);
      if (!next) break;
      cursor = next;
    }
  }
  const cashflow = [];
  {
    const [y, m] = t.split('-').map(Number);
    for (let i = 0; i < windowMonths; i++) {
      const d = new Date(y, m - 1 + i, 1);
      const mk = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      const cell = cashMap.get(mk);
      cashflow.push({ month: mk, amount: cell ? cell.amount : 0, items: cell ? cell.items : [] });
    }
  }

  const topAnnual = rankable
    .map((s) => ({ id: s.id, name: s.name, vendor: s.vendor, category: s.category, status: s.status, monthly: monthlyCost(s), annual: annualCost(s), cycleLabel: cycleLabel(s), amount: s.amount, nextRenewalDate: s.status === 'trial' ? s.trialEndsAt : s.nextRenewalDate }))
    .sort((a, b) => b.annual - a.annual);

  return {
    today: t,
    counts,
    monthlyActive: Math.round(monthlyActive * 100) / 100,
    annualActive: Math.round(monthlyActive * 12 * 100) / 100,
    monthlyTrial: Math.round(monthlyTrial * 100) / 100,
    monthlyAll: Math.round((monthlyActive + monthlyTrial) * 100) / 100,
    annualAll: Math.round((monthlyActive + monthlyTrial) * 12 * 100) / 100,
    byCategory: [...byCategory.values()].sort((a, b) => b.monthly - a.monthly),
    topAnnual,
    cashflow,
    savedMonthly: Math.round(savedMonthly * 100) / 100,
    savedAnnual: Math.round(savedMonthly * 12 * 100) / 100,
    priceChanges: priceChanges.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20),
  };
}

// ── CSV 导入导出 ───────────────────────────────────────────────────────────
const CSV_HEADERS = ['名称', '服务商', '分类', '套餐', '金额', '周期', '自定义天数', '下次扣费日', '自动续费', '状态', '试用到期日', '支付方式', '管理链接', '备注', '创建时间'];

function toCsv(subs, symbol) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const statusZh = { active: '生效中', trial: '试用中', paused: '已暂停', cancelled: '已取消' };
  const head = CSV_HEADERS.join(',');
  const rows = (subs || [])
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s) => [
      s.name, s.vendor || '', s.category, s.plan || '', s.amount.toFixed(2),
      cycleLabel(s), s.cycle === 'custom' ? s.customDays : '',
      s.nextRenewalDate, s.autoRenew ? '是' : '否', statusZh[s.status] || s.status,
      s.trialEndsAt || '', s.paymentMethod || '', s.manageUrl || '', s.note || '',
      new Date(s.createdAt).toLocaleString('zh-CN', { hour12: false }),
    ].map(esc).join(','));
  return [head, ...rows].join('\n');
}

/** 极简 CSV 行解析（支持引号转义）；返回字段数组或 null */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const STATUS_ZH_MAP = { 生效中: 'active', 试用中: 'trial', 已暂停: 'paused', 已取消: 'cancelled' };
const CYCLE_ZH_MAP = { 每月: 'month', 每年: 'year', 每季: 'quarter', 每周: 'week' };

/**
 * 导入（本插件导出的 CSV）：逐行归一化，坏行不致命。
 * 返回 { items: { ok: boolean, error?: string, sub?: Subscription }[] }
 */
function fromCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { items: [], error: 'CSV 至少需要表头 + 一行数据' };
  const header = parseCsvLine(lines[0]);
  const idx = {};
  CSV_HEADERS.forEach((h) => { idx[h] = header.indexOf(h); });
  if (idx['名称'] < 0 || idx['金额'] < 0) return { items: [], error: '表头缺少「名称/金额」列（须为本插件导出的 CSV）' };
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const get = (h) => (idx[h] >= 0 ? (cells[idx[h]] || '').trim() : '');
    // 周期列：枚举中文（每月/每年/…）或「每 N 天」自定义形式（toCsv 的 cycleLabel 输出）
    let cycle = CYCLE_ZH_MAP[get('周期')];
    let customDays = get('自定义天数') ? Number(get('自定义天数')) : undefined;
    if (!cycle) {
      const mCustom = /^每\s*(\d+)\s*天$/.exec(get('周期'));
      if (mCustom) {
        cycle = 'custom';
        if (!Number.isInteger(customDays)) customDays = Number(mCustom[1]);
      }
    }
    const raw = {
      name: get('名称'),
      vendor: get('服务商') || undefined,
      category: get('分类') || undefined,
      plan: get('套餐') || undefined,
      amount: Number(get('金额')),
      cycle,
      customDays,
      nextRenewalDate: get('下次扣费日') || undefined,
      autoRenew: get('自动续费') !== '否',
      status: STATUS_ZH_MAP[get('状态')] || 'active',
      trialEndsAt: get('试用到期日') || undefined,
      paymentMethod: get('支付方式') || undefined,
      manageUrl: get('管理链接') || undefined,
      note: get('备注') || undefined,
    };
    const r = normalizeSub(raw, Date.now());
    if (r.error) items.push({ ok: false, error: `第 ${i + 1} 行：${r.error}` });
    else items.push({ ok: true, sub: r.sub });
  }
  return { items };
}

module.exports = {
  K, DEFAULT_SETTINGS, CATEGORIES, CYCLES, STATUSES, STATUS_LABELS, EVENT_KINDS, LIMITS, MAX_AMOUNT, CSV_HEADERS,
  dayKeyOf, todayStr, dateToTs, addDays, daysBetween, advanceDate, perYearOf,
  monthlyCost, annualCost, cycleLabel, fmtMoney, makeId,
  normalizeSub, applyUpdate,
  renewState, dueBoard,
  renewSub, skipSub, cancelSub, pauseSub, resumeSub,
  filterSubs, stats,
  toCsv, fromCsv, parseCsvLine,
};
