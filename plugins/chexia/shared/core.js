'use strict';
/**
 * core.js —— 车辖（chexia）三方共享纯函数核心（零依赖，浏览器 / node 同源一致）
 *
 * 职责（面板 / MCP / 服务共用同一实现，保证「同一份车务数据」三端口径一字不差）：
 *   - 五类实体规范化（car/energy/item/svc/doc + settings，写入口径唯一）
 *   - 期间口径能耗（Σ补能量 ÷ 里程差 ×100——不要求加满，加半箱/充 80% 都能出数）
 *   - 日均里程（补能里程序列推算 → 无记录回落建档天数）
 *   - 养护项投影（km 轴 / 时间轴 / 双周期取更紧者 → 保养里程点倒计时）
 *   - 证件红黄榜（交强险/商业险/年检/驾驶证…到期分层）
 *   - 费用透视（月度分桶 + 元/公里）
 *   - 全家车辆快照（服务每 tick 重算写 chexia.snapshot）
 *
 * 时区策略（与日晷同源）：「某日」一律本机时区日期串 YYYY-MM-DD（dayKey）。
 * id 策略：idFor(seed)=sha256(seed) 前 12 位——车辆按车名、养护项按 carId|name
 * 定 id，按名 find-or-create 天然幂等（面板/MCP/服务各自算 id 也一字不差）。
 *
 * 安全边界：本核心只做车务记录、展开与派生，不产出任何维修/保险/商家建议。
 */

const { sha256Hex } = require('./sha256');

const DAY_MS = 86400000;
const NAME_CAP = 30;      // 车/养护项名
const NOTE_CAP = 300;
const VENDOR_CAP = 40;
const DESC_CAP = 120;
const MAX_BATCH_HINT = 3000;   // 单次派生输入记录防御上限
const RATE_WINDOW_DAYS = 30;   // 日均里程统计窗口
const CONS_WINDOW_DAYS = 90;   // 期间能耗统计窗口（照顾一周一加的低频车）
const MIN_SPAN_KM = 30;        // 期间能耗里程差下限（低于此拒绝出数，诚实标记）

const CAR_KINDS = ['fuel', 'ev', 'phev'];
const CAR_KIND_LABELS = { fuel: '燃油', ev: '纯电', phev: '插混' };
// 主计量单位：补能 amount 的单位按车辆类型派生
const CAR_KIND_UNITS = { fuel: 'L', ev: 'kWh', phev: 'L' };
const ENERGY_KINDS = ['fuel', 'charge'];
const SVC_TYPES = ['maintenance', 'repair', 'inspection', 'insurance', 'other'];
const SVC_TYPE_LABELS = { maintenance: '保养', repair: '维修', inspection: '年检', insurance: '保险', other: '其他' };
const DOC_TYPES = ['交强险', '商业险', '年检', '驾驶证', '行驶证', '其他'];

// ── 通用小件 ─────────────────────────────────────────────────────────────────
function clip(s, cap) { return String(s == null ? '' : s).trim().slice(0, cap); }
function idFor(seed) { return 'c' + sha256Hex(String(seed)).slice(0, 12); }
function randTag() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/** 本机日期串（dayKey：YYYY-MM-DD）。手拼而非 toISOString：后者是 UTC，本地 0 点会前跳一天 */
function dayKey(ts) {
  const d = new Date(typeof ts === 'number' ? ts : Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' → 本机当日零点 ts；非法（含 2 月 30 日这类静默进位）返回 null */
function parseDayKey(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const ts = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  const d = new Date(ts);
  return (d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) ? ts : null;
}

/** b − a 自然日差（本机零点锚定；b 在 a 之后为正）；任一非法返回 NaN */
function dayDiff(a, b) {
  const ta = parseDayKey(a), tb = parseDayKey(b);
  if (ta == null || tb == null) return NaN;
  return Math.round((tb - ta) / DAY_MS);
}

function addDaysStr(dateStr, n) {
  const ts = parseDayKey(dateStr);
  if (ts == null) return null;
  return dayKey(ts + n * DAY_MS);
}

/**
 * 月加法： Jan 31 + 1 月 = Feb 28（钳制到目标月最后一天，不进位到 3 月）。
 * 保险/年检周年、保养月周期都依赖这个语义。
 */
function addMonthsStr(dateStr, n) {
  const ts = parseDayKey(dateStr);
  if (ts == null) return null;
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = d.getMonth() + Number(n);
  const target = new Date(y, m, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return dayKey(target.getTime());
}

function r2(x) { return Math.round(Number(x) * 100) / 100; }
function r1(x) { return Math.round(Number(x) * 10) / 10; }

function fmtNum(x) {
  if (!Number.isFinite(x)) return '';
  return Number.isInteger(x) ? String(x) : String(r2(x));
}

// ── 实体规范化（三端唯一写入口径；merge 语义：raw 未提供的字段回退 existing）────
function normalizeCar(raw, existing) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  const prev = existing && typeof existing === 'object' ? existing : null;
  const name = clip(raw.name !== undefined ? raw.name : (prev ? prev.name : ''), NAME_CAP);
  if (!name) return { error: '车辆名称不能为空（如「家里的白色 SUV」「老爸的卡罗拉」）' };
  const kindRaw = String(raw.kind !== undefined ? raw.kind : (prev ? prev.kind : 'fuel'));
  const kind = CAR_KINDS.includes(kindRaw) ? kindRaw : 'fuel';
  let odo = raw.initialOdometer !== undefined ? Number(raw.initialOdometer) : (prev ? prev.initialOdometer : 0);
  if (!Number.isFinite(odo) || odo < 0) odo = prev ? prev.initialOdometer || 0 : 0;
  if (odo > 3000000) return { error: 'initialOdometer 不合理（>300 万 km）' };
  return { car: {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : idFor('car|' + name)),
    name, kind,
    plate: clip(raw.plate !== undefined ? raw.plate : (prev ? prev.plate : ''), 12),
    initialOdometer: r1(odo),
    note: clip(raw.note !== undefined ? raw.note : (prev ? prev.note : ''), NOTE_CAP),
    // createdAt 尊重显式传入（测试合成时间 / 导入保真）；未传才取当下
    createdAt: prev ? prev.createdAt || Date.now() : (Number(raw.createdAt) || Date.now()),
    updatedAt: Date.now(),
    rev: prev ? (Number(prev.rev) || 1) + 1 : 1,
  } };
}

function unitOf(car) { return CAR_KIND_UNITS[car && car.kind] || 'L'; }

/**
 * 补能记录。odometer 必填且 ≥ 车辆 initialOdometer（油耗/电耗与养护里程倒计时的
 * 生命线；缺里程的补能无法参与任何派生，宁拒不收）。odometer 保留 1 位小数（电车表显常带小数）。
 */
function normalizeEnergy(raw, existing, car) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  const prev = existing && typeof existing === 'object' ? existing : null;
  const carId = clip(raw.carId !== undefined ? raw.carId : (prev ? prev.carId : ''), 40);
  if (!carId) return { error: '补能记录必须挂在一辆车下' };
  let kind = String(raw.kind !== undefined ? raw.kind : (prev ? prev.kind : ''));
  if (!kind) kind = car && car.kind === 'ev' ? 'charge' : 'fuel';
  if (!ENERGY_KINDS.includes(kind)) return { error: `kind 不合法（fuel/charge）: ${kind}` };
  const date = clip(raw.date !== undefined ? raw.date : (prev ? prev.date : dayKey(Date.now())), 10);
  if (parseDayKey(date) == null) return { error: `日期不合法：${date}（需 YYYY-MM-DD）` };
  let odo = raw.odometer !== undefined ? Number(raw.odometer) : (prev ? prev.odometer : NaN);
  if (!Number.isFinite(odo) || odo < 0) return { error: 'odometer 必填（里程表读数 km，油耗/养护倒计时都靠它）' };
  odo = r1(odo);
  if (car && odo < (Number(car.initialOdometer) || 0)) {
    return { error: `odometer(${odo}) 不能小于建档里程(${car.initialOdometer})` };
  }
  let amount = raw.amount !== undefined ? Number(raw.amount) : (prev ? prev.amount : NaN);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'amount 必填且为正数（L 或 kWh）' };
  if (amount > 10000) return { error: 'amount 不合理（>10000）' };
  amount = r2(amount);
  let cost = raw.cost !== undefined ? Number(raw.cost) : (prev ? prev.cost : NaN);
  if (!Number.isFinite(cost) || cost < 0) return { error: 'cost 必填且 ≥0（本次花费，元）' };
  cost = r2(Math.min(cost, 1000000));
  const filled = raw.filled === undefined ? (prev ? prev.filled === true : true) : raw.filled === true;
  return { energy: {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : idFor('energy|' + carId + '|' + date + '|' + odo + '|' + randTag())),
    carId, kind, date, odometer: odo, amount, cost, filled,
    station: clip(raw.station !== undefined ? raw.station : (prev ? prev.station : ''), VENDOR_CAP),
    note: clip(raw.note !== undefined ? raw.note : (prev ? prev.note : ''), NOTE_CAP),
    createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now(),
    rev: prev ? (Number(prev.rev) || 1) + 1 : 1,
  } };
}

/** 养护项：周期 km / 月至少其一；id=carId|name 确定性（同名 find-or-create 幂等） */
function normalizeItem(raw, existing) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  const prev = existing && typeof existing === 'object' ? existing : null;
  const carId = clip(raw.carId !== undefined ? raw.carId : (prev ? prev.carId : ''), 40);
  if (!carId) return { error: '养护项必须挂在一辆车下' };
  const name = clip(raw.name !== undefined ? raw.name : (prev ? prev.name : ''), NAME_CAP);
  if (!name) return { error: '养护项名称不能为空（如「机油机滤」「空调滤芯」「轮胎换位」）' };
  const c = raw.cycle !== undefined ? raw.cycle : (prev ? prev.cycle : null);
  const cyc = c && typeof c === 'object' ? c : {};
  let km = cyc.kmInterval !== undefined ? Math.floor(Number(cyc.kmInterval)) : (prev && prev.cycle ? prev.cycle.kmInterval : undefined);
  if (km !== undefined && (!Number.isFinite(km) || (km !== 0 && km < 500))) {
    if (!(km === 0 && cyc.kmInterval === 0)) return { error: `cycle.kmInterval 需 ≥500 km 或显式 0 表示关闭: ${cyc.kmInterval}` };
  }
  if (km === 0) km = undefined;
  let mo = cyc.monthInterval !== undefined ? Math.floor(Number(cyc.monthInterval)) : (prev && prev.cycle ? prev.cycle.monthInterval : undefined);
  if (mo !== undefined && (!Number.isFinite(mo) || mo < 0 || (mo > 0 && mo < 1))) {
    if (!(mo === 0 && cyc.monthInterval === 0)) return { error: `cycle.monthInterval 需 ≥1 月或显式 0: ${cyc.monthInterval}` };
  }
  if (mo === 0) mo = undefined;
  if (km === undefined && mo === undefined) return { error: 'cycle 至少要有 kmInterval 或 monthInterval 之一' };
  let lastOdometer = raw.lastOdometer !== undefined ? Number(raw.lastOdometer) : (prev ? prev.lastOdometer : undefined);
  if (lastOdometer !== undefined) {
    if (!Number.isFinite(lastOdometer) || lastOdometer < 0) return { error: `lastOdometer 非法: ${raw.lastOdometer}` };
    lastOdometer = r1(lastOdometer);
  }
  let lastDate = raw.lastDate !== undefined ? clip(raw.lastDate, 10) : (prev ? prev.lastDate : undefined);
  if (lastDate !== undefined && parseDayKey(lastDate) == null) return { error: `lastDate 不合法：${lastDate}` };
  if (kmIntervalIsSet(km) && lastOdometer === undefined) return { error: 'km 周期需要 lastOdometer（上次保养时的里程表读数）作为锚点' };
  if (mo !== undefined && lastDate === undefined) return { error: '月周期需要 lastDate（上次保养日期）作为锚点' };
  const active = raw.active === undefined ? (prev ? prev.active !== false : true) : raw.active === true;
  return { item: {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : idFor('item|' + carId + '|' + name)),
    carId, name,
    cycle: { ...(km !== undefined ? { kmInterval: km } : {}), ...(mo !== undefined ? { monthInterval: mo } : {}) },
    lastOdometer, lastDate, active,
    note: clip(raw.note !== undefined ? raw.note : (prev ? prev.note : ''), NOTE_CAP),
    createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now(),
    rev: prev ? (Number(prev.rev) || 1) + 1 : 1,
  } };
}
function kmIntervalIsSet(km) { return km !== undefined && km !== null; }

/**
 * 维保记录。type=maintenance 且 itemName 命中该车养护项时，工具层应同步更新该项锚点
 * （本 normalize 只落记录，不写 item——保持「一条记录一键」的单一写者）。
 */
function normalizeSvc(raw, existing) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  const prev = existing && typeof existing === 'object' ? existing : null;
  const carId = clip(raw.carId !== undefined ? raw.carId : (prev ? prev.carId : ''), 40);
  if (!carId) return { error: '维保记录必须挂在一辆车下' };
  const type = String(raw.type !== undefined ? raw.type : (prev ? prev.type : 'maintenance'));
  if (!SVC_TYPES.includes(type)) return { error: `type 不合法（${SVC_TYPES.join('/')}）: ${type}` };
  const date = clip(raw.date !== undefined ? raw.date : (prev ? prev.date : dayKey(Date.now())), 10);
  if (parseDayKey(date) == null) return { error: `日期不合法：${date}` };
  let odometer = raw.odometer !== undefined ? Number(raw.odometer) : (prev ? prev.odometer : undefined);
  if (odometer !== undefined) {
    if (!Number.isFinite(odometer) || odometer < 0) return { error: `odometer 非法: ${raw.odometer}` };
    odometer = r1(odometer);
  }
  let cost = raw.cost !== undefined ? Number(raw.cost) : (prev ? prev.cost : undefined);
  if (cost !== undefined) {
    if (!Number.isFinite(cost) || cost < 0) return { error: `cost 非法: ${raw.cost}` };
    cost = r2(Math.min(cost, 1000000));
  }
  return { svc: {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : idFor('svc|' + carId + '|' + date + '|' + randTag())),
    carId, type, date, odometer,
    desc: clip(raw.desc !== undefined ? raw.desc : (prev ? prev.desc : ''), DESC_CAP) || SVC_TYPE_LABELS[type],
    cost, vendor: clip(raw.vendor !== undefined ? raw.vendor : (prev ? prev.vendor : ''), VENDOR_CAP),
    itemName: clip(raw.itemName !== undefined ? raw.itemName : (prev ? prev.itemName : ''), NAME_CAP),
    note: clip(raw.note !== undefined ? raw.note : (prev ? prev.note : ''), NOTE_CAP),
    createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now(),
    rev: prev ? (Number(prev.rev) || 1) + 1 : 1,
  } };
}

/** 证件/凭证：carId 可空（个人证件如驾驶证）；expiry 必填——到期提醒是本插件的法定刚需锚点 */
function normalizeDoc(raw, existing) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  const prev = existing && typeof existing === 'object' ? existing : null;
  const carId = raw.carId !== undefined ? clip(raw.carId, 40) : (prev ? prev.carId : '');
  let type = clip(raw.type !== undefined ? raw.type : (prev ? prev.type : ''), 20);
  if (!type) return { error: 'type 必填（交强险/商业险/年检/驾驶证/行驶证/其他）' };
  const expiry = clip(raw.expiry !== undefined ? raw.expiry : (prev ? prev.expiry : ''), 10);
  if (parseDayKey(expiry) == null) return { error: `expiry 必填且需 YYYY-MM-DD：${expiry}` };
  let remindDays = raw.remindDays !== undefined ? Math.floor(Number(raw.remindDays)) : (prev ? prev.remindDays : undefined);
  if (remindDays !== undefined && (!Number.isFinite(remindDays) || remindDays < 0 || remindDays > 365)) {
    return { error: `remindDays 需 0-365: ${raw.remindDays}` };
  }
  return { doc: {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : idFor('doc|' + (carId || 'personal') + '|' + type + '|' + expiry)),
    carId: carId || '',
    type, expiry,
    remindDays,
    note: clip(raw.note !== undefined ? raw.note : (prev ? prev.note : ''), NOTE_CAP),
    createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now(),
    rev: prev ? (Number(prev.rev) || 1) + 1 : 1,
  } };
}

const SETTING_LIMITS = { docWarnDays: [7, 365, 30], itemWatchKm: [100, 5000, 500], itemWatchDays: [1, 120, 14], costWindowDays: [30, 365, 90] };
function normalizeSettings(raw) {
  const out = {};
  for (const [k, lim] of Object.entries(SETTING_LIMITS)) {
    const v = Number(raw && typeof raw === 'object' ? raw[k] : undefined);
    out[k] = Number.isFinite(v) ? Math.min(lim[1], Math.max(lim[0], Math.floor(v))) : lim[2];
  }
  return out;
}

// ── 里程派生 ─────────────────────────────────────────────────────────────────
/** 该车最新里程：补能/维保记录 odometer 最大值，回落建档里程 */
function latestOdometer(energies, svcs, car) {
  let odo = Number(car && car.initialOdometer) || 0;
  for (const e of energies || []) {
    const v = Number(e && e.odometer);
    if (Number.isFinite(v) && v > odo) odo = v;
  }
  for (const s of svcs || []) {
    const v = Number(s && s.odometer);
    if (Number.isFinite(v) && v > odo) odo = v;
  }
  return r1(odo);
}

/**
 * 日均里程：RATE_WINDOW_DAYS 窗口内（最大里程 − 窗口首记录里程）/ 记录跨度天数；
 * 窗口内不足两条回落「(最新里程 − 建档里程) / 建档至今天数」；再无 → null。
 */
function mileageRate(energies, svcs, car, nowTs) {
  const now = typeof nowTs === 'number' ? nowTs : Date.now();
  const rows = [];
  for (const e of energies || []) if (e && Number.isFinite(Number(e.odometer))) rows.push({ odo: Number(e.odometer), at: parseDayKey(e.date) || Number(e.createdAt) || now });
  for (const s of svcs || []) if (s && Number.isFinite(Number(s.odometer))) rows.push({ odo: Number(s.odometer), at: parseDayKey(s.date) || Number(s.createdAt) || now });
  rows.sort((a, b) => a.at - b.at);
  if (rows.length >= 2) {
    const since = now - RATE_WINDOW_DAYS * DAY_MS;
    const window = rows.filter((r) => r.at >= since);
    const use = window.length >= 2 ? window : rows.slice(-2);
    const first = use[0]; const last = use[use.length - 1];
    const days = Math.max(1, Math.round((last.at - first.at) / DAY_MS));
    const km = last.odo - first.odo;
    if (km > 0) return { rate: km / days, source: window.length >= 2 ? 'window' : 'span', days, km };
  }
  const init = Number(car && car.initialOdometer) || 0;
  const cur = latestOdometer(energies, svcs, car);
  const created = Number(car && car.createdAt) || now;
  const days = Math.round((now - created) / DAY_MS);
  if (cur > init && days >= 1) return { rate: (cur - init) / days, source: 'lifetime', days, km: cur - init };
  return { rate: null, source: 'none' };
}

/**
 * 期间口径能耗。两级方法（针对「必须两次加满才能算油耗」的既有产品吐槽）：
 *   1. 加满锚定法（首选）：窗口内若存在 ≥2 条 filled 记录，取最早与最近两条加满为锚 A/B，
 *      消耗 = A 之后到 B（含 B）的全部补能量——教科书 full-to-full，中途加半箱也被正确计入
 *     （那些油在 B 之前已烧完）；A 之前与 B 之后的量不进窗口（尚未被完整折算）。
 *   2. 毛估法（无两次加满时退化）：窗口首条只做里程锚点不计其量，Σ其余量 / Δkm；
 *      首尾存量相近时基本准确，输出 estimated=true 如实标注。
 * kmSpan < MIN_SPAN_KM 拒绝出数（诚实标记）。元/公里与能耗同窗口。
 */
function periodConsumption(energies, car, today, sinceDate) {
  const unit = unitOf(car);
  const rows = (energies || [])
    .filter((e) => e && e.carId === car.id && Number.isFinite(Number(e.odometer)))
    .filter((e) => !sinceDate || dayDiff(sinceDate, e.date) >= 0)
    // 升序：dayDiff(base, target)=target−base，做比较器要 (b,a)
    .sort((a, b) => (dayDiff(b.date, a.date) || (Number(a.createdAt) - Number(b.createdAt))));
  if (rows.length < 2) return { ok: false, reason: '样本不足（至少两条补能记录）', unit };
  const idxOf = new Map(rows.map((e, i) => [e.id, i]));
  let A = null; let B = null; let estimated = false;
  const filled = rows.filter((e) => e.filled === true);
  if (filled.length >= 2) {
    A = filled[0]; B = filled[filled.length - 1];
  } else {
    A = rows[0]; B = rows[rows.length - 1];
    estimated = true;
  }
  const kmSpan = r1(B.odometer - A.odometer);
  if (kmSpan < MIN_SPAN_KM) return { ok: false, reason: `里程跨度过小（${kmSpan}km < ${MIN_SPAN_KM}km）`, unit };
  const aIdx = idxOf.get(A.id);
  const bIdx = idxOf.get(B.id);
  let amount = 0; let cost = 0;
  for (let i = aIdx + 1; i <= bIdx; i++) {
    amount += Number(rows[i].amount) || 0;
    cost += Number(rows[i].cost) || 0;
  }
  if (amount <= 0) return { ok: false, reason: '锚定窗口内无有效补能量', unit };
  return {
    ok: true, unit, estimated,
    per100: r2((amount / kmSpan) * 100),
    costPerKm: cost > 0 ? r2(cost / kmSpan) : null,
    kmSpan, days: Math.max(1, dayDiff(A.date, B.date)),
    amount: r2(amount), cost: r2(cost),
    since: A.date, until: B.date,
  };
}

// ── 养护项投影 ───────────────────────────────────────────────────────────────
/**
 * 养护项到点预测。km 轴：dueKm = lastOdometer + kmInterval，kmLeft = dueKm − 当前里程，
 * daysLeft = kmLeft / 日均里程（无速率时 null）；时间轴：dueDate = lastDate + monthInterval（月末钳制）。
 * 双周期取**更紧者**（daysLeft 小者）；已超 = overdue（kmLeft ≤ 0 或 dueDate ≤ 今天）。
 * @returns {{state:'overdue'|'due'|'watch'|'ok', axis:'km'|'time'|null, dueKm?, kmLeft?, dueDate?, daysLeft?, byKm?, byTime?}}
 */
function itemProjection(item, car, energies, svcs, nowTs, settings) {
  const st = settings && typeof settings === 'object' ? normalizeSettings(settings) : normalizeSettings(null);
  const now = typeof nowTs === 'number' ? nowTs : Date.now();
  const today = dayKey(now);
  const cyc = item.cycle || {};
  const cur = latestOdometer(energies, svcs, car);
  const rate = mileageRate(energies, svcs, car, now).rate;
  let byKm = null;
  if (cyc.kmInterval && item.lastOdometer !== undefined) {
    const dueKm = r1(Number(item.lastOdometer) + Number(cyc.kmInterval));
    const kmLeft = r1(dueKm - cur);
    const daysLeft = rate && rate > 0 && kmLeft > 0 ? Math.ceil(kmLeft / rate) : (kmLeft <= 0 ? 0 : null);
    byKm = { dueKm, kmLeft, daysLeft };
  }
  let byTime = null;
  if (cyc.monthInterval && item.lastDate) {
    const dueDate = addMonthsStr(item.lastDate, Number(cyc.monthInterval));
    const daysLeft = dayDiff(today, dueDate);
    byTime = { dueDate, daysLeft };
  }
  let pick = null;
  if (byKm && byTime) {
    const kd = byKm.kmLeft <= 0 ? -1 : (byKm.daysLeft == null ? Number.MAX_SAFE_INTEGER : byKm.daysLeft);
    const td = byTime.daysLeft;
    pick = kd <= td ? 'km' : 'time';
  } else if (byKm) pick = 'km';
  else if (byTime) pick = 'time';

  const worst = (a, b) => {
    if (a === 'overdue' || b === 'overdue') return 'overdue';
    const w = { overdue: 0, due: 1, watch: 2, ok: 3 };
    return w[a] <= w[b] ? a : b;
  };
  let state = 'ok';
  let axis = null;
  if (byKm) {
    const s = byKm.kmLeft <= 0 ? 'overdue' : byKm.kmLeft <= st.itemWatchKm ? 'due' : (byKm.daysLeft != null && byKm.daysLeft <= st.itemWatchDays ? 'watch' : 'ok');
    if (s !== 'ok') { axis = axis || 'km'; }
    state = worst(state, s);
  }
  if (byTime) {
    const d = byTime.daysLeft;
    const s = d <= 0 ? 'overdue' : d <= st.itemWatchDays ? 'due' : d <= st.itemWatchDays * 2 ? 'watch' : 'ok';
    if (s !== 'ok') axis = axis || 'time';
    state = worst(state, s);
  }
  if (state === 'ok') axis = null;
  const out = { state, axis };
  if (byKm) { out.dueKm = byKm.dueKm; out.kmLeft = byKm.kmLeft; out.daysLeftByKm = byKm.daysLeft; }
  if (byTime) { out.dueDate = byTime.dueDate; out.daysLeftByTime = byTime.daysLeft; }
  if (pick) out._pick = pick;
  return out;
}

function describeItem(item) {
  const c = item.cycle || {};
  const parts = [];
  if (c.kmInterval) parts.push(`每 ${fmtNum(c.kmInterval)} km`);
  if (c.monthInterval) parts.push(`每 ${c.monthInterval} 个月`);
  const anchors = [];
  if (item.lastOdometer !== undefined) anchors.push(`上次 ${fmtNum(item.lastOdometer)} km`);
  if (item.lastDate) anchors.push(`上次 ${item.lastDate}`);
  return `${item.name}（${parts.join(' + ')}${anchors.length ? '；' + anchors.join('，') : ''}）`;
}

// ── 证件红黄榜 ───────────────────────────────────────────────────────────────
/** expired / soon / ok；soon 阈值 = doc.remindDays ?? settings.docWarnDays */
function docBands(docs, cars, nowTs, settings) {
  const st = settings && typeof settings === 'object' ? normalizeSettings(settings) : normalizeSettings(null);
  const today = dayKey(typeof nowTs === 'number' ? nowTs : Date.now());
  const carById = new Map((cars || []).map((c) => [c.id, c]));
  const rows = [];
  for (const d of docs || []) {
    if (!d || !d.expiry) continue;
    const days = dayDiff(today, d.expiry);
    if (Number.isNaN(days)) continue;
    const warn = Number.isFinite(Number(d.remindDays)) ? Number(d.remindDays) : st.docWarnDays;
    const car = d.carId ? carById.get(d.carId) : null;
    rows.push({
      docId: d.id, type: d.type, expiry: d.expiry, days,
      band: days < 0 ? 'expired' : days <= warn ? 'soon' : 'ok',
      carName: car ? car.name : (d.carId ? '未知车辆' : '个人'),
      note: d.note || '',
    });
  }
  const order = { expired: 0, soon: 1, ok: 2 };
  rows.sort((a, b) => order[a.band] - order[b.band] || (a.expiry < b.expiry ? -1 : 1));
  return rows;
}

// ── 费用透视 ─────────────────────────────────────────────────────────────────
/** 窗口内费用：补能 + 维保按月分桶、按类小计、元/公里 */
function costBreakdown(energies, svcs, car, today, windowDays) {
  const days = Math.max(30, Math.floor(Number(windowDays) || 90));
  const since = addDaysStr(today, -days);
  const months = new Map(); // 'YYYY-MM' → {energy, maintenance, repair, inspection, insurance, other}
  const add = (date, key, v) => {
    const m = String(date).slice(0, 7);
    const b = months.get(m) || { energy: 0, maintenance: 0, repair: 0, inspection: 0, insurance: 0, other: 0 };
    b[key] = r2((b[key] || 0) + (Number(v) || 0));
    months.set(m, b);
  };
  let eCost = 0; let sCost = 0;
  for (const e of energies || []) {
    if (!e || e.carId !== car.id) continue;
    if (dayDiff(since, e.date) < 0) continue;
    eCost += Number(e.cost) || 0;
    add(e.date, 'energy', e.cost);
  }
  for (const s of svcs || []) {
    if (!s || s.carId !== car.id) continue;
    if (dayDiff(since, s.date) < 0) continue;
    const key = SVC_TYPES.includes(s.type) ? s.type : 'other';
    sCost += Number(s.cost) || 0;
    add(s.date, key, s.cost);
  }
  const perMonth = [...months.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([month, b]) => ({ month, ...b, total: r2(Object.values(b).reduce((x, y) => x + (Number(y) || 0), 0)) }));
  const odoRows = [];
  for (const e of energies || []) if (e && e.carId === car.id && dayDiff(since, e.date) >= 0) odoRows.push({ odo: Number(e.odometer), at: parseDayKey(e.date) || 0 });
  odoRows.sort((a, b) => a.at - b.at);
  let kmSpan = 0;
  if (odoRows.length >= 2) kmSpan = r1(odoRows[odoRows.length - 1].odo - odoRows[0].odo);
  const total = r2(eCost + sCost);
  return {
    windowDays: days,
    energyCost: r2(eCost), serviceCost: r2(sCost), total,
    costPerKm: kmSpan >= MIN_SPAN_KM ? r2(total / kmSpan) : null,
    perMonth,
  };
}

// ── 单车快照（服务/面板共用）──────────────────────────────────────────────────
function carSnapshot(car, energies, items, svcs, docs, nowTs, settings) {
  const now = typeof nowTs === 'number' ? nowTs : Date.now();
  const today = dayKey(now);
  const ownE = (energies || []).filter((e) => e && e.carId === car.id).slice(0, MAX_BATCH_HINT);
  const ownS = (svcs || []).filter((s) => s && s.carId === car.id).slice(0, MAX_BATCH_HINT);
  const ownI = (items || []).filter((i) => i && i.carId === car.id && i.active !== false);
  const ownD = (docs || []).filter((d) => d && d.carId === car.id);
  const odo = latestOdometer(ownE, ownS, car);
  const rate = mileageRate(ownE, ownS, car, now);
  const cons = periodConsumption(ownE, car, today, addDaysStr(today, -CONS_WINDOW_DAYS));
  const itemsProj = ownI.map((it) => ({ itemId: it.id, name: it.name, describe: describeItem(it), projection: itemProjection(it, car, ownE, ownS, now, settings) }))
    .sort((a, b) => {
      const w = { overdue: 0, due: 1, watch: 2, ok: 3 };
      return w[a.projection.state] - w[b.projection.state];
    });
  const docRows = docBands(ownD, [car], now, settings).filter((r) => r.band !== 'ok');
  const cost = costBreakdown(ownE, ownS, car, today, normalizeSettings(settings).costWindowDays);
  return {
    carId: car.id, name: car.name, kind: car.kind, plate: car.plate || '',
    unit: unitOf(car),
    odometer: odo,
    kmPerDay: rate.rate != null ? r1(rate.rate) : null, rateSource: rate.source,
    consumption: cons.ok ? { per100: cons.per100, costPerKm: cons.costPerKm, unit: cons.unit, since: cons.since, until: cons.until, kmSpan: cons.kmSpan } : null,
    consumptionNote: cons.ok ? '' : cons.reason,
    items: itemsProj,
    docsDue: docRows,
    cost,
  };
}

/** 全家快照（服务写 chexia.snapshot 的载荷） */
function familySnapshot(cars, energies, items, svcs, docs, nowTs, settings) {
  const now = typeof nowTs === 'number' ? nowTs : Date.now();
  const list = (cars || []).filter((c) => c && c.id).map((car) => carSnapshot(car, energies, items, svcs, docs, now, settings));
  const personalDocs = docBands((docs || []).filter((d) => d && !d.carId), [], now, settings).filter((r) => r.band !== 'ok');
  return { at: now, cars: list, personalDocs };
}

// ── 全库导出 ─────────────────────────────────────────────────────────────────
function exportAll(data) {
  const strip = (arr, drop) => (Array.isArray(arr) ? arr : []).map((x) => {
    const o = {}; for (const k of Object.keys(x || {})) if (!drop.includes(k)) o[k] = x[k]; return o;
  });
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    kind: 'polaris-chexia',
    disclaimer: '家庭车务记录，非维修/保险建议。',
    cars: strip(data.cars, ['rev']),
    energies: strip(data.energies, ['rev']),
    items: strip(data.items, ['rev']),
    svcs: strip(data.svcs, ['rev']),
    docs: strip(data.docs, ['rev']),
    settings: normalizeSettings(data.settings),
  }, null, 2);
}

module.exports = {
  DAY_MS, NAME_CAP, NOTE_CAP, RATE_WINDOW_DAYS, CONS_WINDOW_DAYS, MIN_SPAN_KM,
  CAR_KINDS, CAR_KIND_LABELS, CAR_KIND_UNITS, ENERGY_KINDS, SVC_TYPES, SVC_TYPE_LABELS, DOC_TYPES,
  clip, idFor, randTag, dayKey, parseDayKey, dayDiff, addDaysStr, addMonthsStr, r1, r2, fmtNum,
  normalizeCar, normalizeEnergy, normalizeItem, normalizeSvc, normalizeDoc, normalizeSettings, unitOf,
  latestOdometer, mileageRate, periodConsumption, itemProjection, describeItem,
  docBands, costBreakdown, carSnapshot, familySnapshot, exportAll,
};
