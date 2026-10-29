'use strict';
/**
 * core.js —— 用药管家（qingnang）三方共享纯函数核心（零依赖，浏览器 / node 同源一致）
 *
 * 职责（面板 / MCP / 服务共用同一实现，保证「同一份药事数据」三端口径一字不差）：
 *   - 四类实体规范化（profile/med/batch/regimen + settings/log，写入口径唯一）
 *   - 用药方案 → 某日应服发生展开（daily/weekly/interval/cycle/prn 五型）
 *   - 今日全家药单（todayPlan：done/skip/now/overdue/upcoming 状态机）
 *   - 库存 FEFO 派生（先到期先用：批次 + 打卡记录 → 各批剩余/可用总量，库存无可写键，
 *     单一事实 = 批次 qty + taken 记录，天然幂等无并发写）
 *   - 消耗速率与补货预测（实际打卡优先，方案排量回落）
 *   - 效期红黄榜（过期红 / 临期黄）
 *   - 依从率（近 N 天计划 vs 实际打卡）
 *   - 今日应服投影（dosesProjection：服务每 tick 重算写 qingnang.doses）
 *
 * 时区策略（与日晷同源）：「某日」一律本机时区日期串 YYYY-MM-DD（dayKey），
 * 「某刻」= 本机时区 date + HH:MM 构造（Date 本地构造天然处理 DST）。
 *
 * 安全边界：本核心只做记录、展开与派生，不产出任何医疗建议。
 */

const { sha256Hex } = require('./sha256');

const DAY_MS = 86400000;
const NAME_CAP = 40;    // 成员/药品名
const SPEC_CAP = 60;    // 规格（如 5mg×24片）
const NOTE_CAP = 300;
const UNIT_CAP = 8;     // 计量单位（片/粒/袋/支/贴/ml/喷）
const MAX_TIMES = 6;    // 单方案每日时刻数上限
const FREQ_TYPES = ['daily', 'weekly', 'interval', 'cycle', 'prn'];
const FORMS = ['tablet', 'capsule', 'granule', 'liquid', 'injection', 'patch', 'other'];
const MAX_BATCHES_HINT = 400;   // FEFO 输入批次防御上限
const MAX_LOGS_HINT = 5000;     // 派生输入日志防御上限
const RATE_WINDOW_DAYS = 14;    // 消耗速率统计窗口

// ── 通用小件 ─────────────────────────────────────────────────────────────────
function clip(s, cap) {
  return String(s == null ? '' : s).trim().slice(0, cap);
}
function idFor(seed) { return 'q' + sha256Hex(String(seed)).slice(0, 12); }
function randTag() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/** 本机日期串（dayKey：YYYY-MM-DD） */
function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** 'YYYY-MM-DD' → 本机当日零点 ts；非法返回 null（拒绝 2 月 30 日） */
function parseDayKey(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const ts = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  const d = new Date(ts);
  return (d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) ? ts : null;
}
/** 'HH:MM' → 当日分钟数；非法返回 -1 */
function timeToMin(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return -1;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return -1;
  return h * 60 + mi;
}
function minToTime(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
/** 本机某日零点 + 当日分钟 → ts */
function dayMinTs(dayKeyStr, min) {
  const base = parseDayKey(dayKeyStr);
  if (base == null || min < 0) return null;
  return base + min * 60000;
}
/** dayKey 差：a - b（自然日，按本机零点） */
function dayDiff(a, b) {
  const ta = parseDayKey(a), tb = parseDayKey(b);
  if (ta == null || tb == null) return NaN;
  return Math.round((ta - tb) / DAY_MS);
}

// ── 实体规范化（三端唯一写入口径）────────────────────────────────────────────
function normalizeProfile(raw, existing) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  const prev = existing && typeof existing === 'object' ? existing : null;
  const name = clip(raw.name !== undefined ? raw.name : (prev ? prev.name : ''), NAME_CAP);
  if (!name) return { error: '成员名称不能为空' };
  const kindRaw = String(raw.kind !== undefined ? raw.kind : (prev ? prev.kind : 'human'));
  const kind = ['human', 'pet'].includes(kindRaw) ? kindRaw : 'human';
  return { profile: {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : idFor('profile|' + name)),
    name,
    kind,
    note: clip(raw.note !== undefined ? raw.note : (prev ? prev.note : ''), NOTE_CAP),
    createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now(),
    rev: prev ? (Number(prev.rev) || 1) + 1 : 1,
  } };
}

function normalizeMed(raw, existing) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  const prev = existing && typeof existing === 'object' ? existing : null;
  const name = clip(raw.name !== undefined ? raw.name : (prev ? prev.name : ''), NAME_CAP);
  if (!name) return { error: '药品名称不能为空' };
  const formRaw = String(raw.form !== undefined ? raw.form : (prev ? prev.form : 'tablet'));
  const form = FORMS.includes(formRaw) ? formRaw : 'other';
  return { med: {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : idFor('med|' + name + '|' + clip(raw.spec, 20))),
    name,
    spec: clip(raw.spec !== undefined ? raw.spec : (prev ? prev.spec : ''), SPEC_CAP),
    form,
    unit: clip(raw.unit !== undefined ? raw.unit : (prev ? prev.unit : ''), UNIT_CAP) || '片',
    note: clip(raw.note !== undefined ? raw.note : (prev ? prev.note : ''), NOTE_CAP),
    createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now(),
    rev: prev ? (Number(prev.rev) || 1) + 1 : 1,
  } };
}

/**
 * 批次（库存+效期的最小单元）。qty = 该批登记时的数量（可回填盘点修正）；
 * expiry 空串 = 未登记效期（计入可用量，但不进效期榜）。
 */
function normalizeBatch(raw, existing) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  const prev = existing && typeof existing === 'object' ? existing : null;
  const medId = clip(raw.medId !== undefined ? raw.medId : (prev ? prev.medId : ''), 40);
  if (!medId) return { error: '批次必须挂在一支药品下' };
  let qty = raw.qty !== undefined ? Number(raw.qty) : (prev ? prev.qty : NaN);
  if (!Number.isFinite(qty) || qty < 0) qty = prev ? prev.qty : 0;
  qty = Math.min(Math.floor(qty * 100) / 100, 1000000); // 两位小数（液体制剂）
  let expiry = '';
  if (raw.expiry !== undefined || !prev) {
    const e = clip(raw.expiry, 10);
    if (e && parseDayKey(e) == null) return { error: `效期不合法：${e}（需 YYYY-MM-DD）` };
    expiry = e;
  } else expiry = prev.expiry || '';
  return { batch: {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : idFor('batch|' + medId + '|' + expiry + '|' + randTag())),
    medId,
    qty,
    expiry,
    note: clip(raw.note !== undefined ? raw.note : (prev ? prev.note : ''), NOTE_CAP),
    createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now(),
    rev: prev ? (Number(prev.rev) || 1) + 1 : 1,
  } };
}

/** freq 规范化：五型。prn=需要时（无排期投影，仅手动记账） */
function normalizeFreq(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const type = String(f.type || 'daily');
  if (!FREQ_TYPES.includes(type)) return { error: `频次类型不合法：${type}（支持 daily/weekly/interval/cycle/prn）` };
  const out = { type };
  if (type === 'weekly') {
    let wd = Array.isArray(f.weekdays) ? f.weekdays : [];
    wd = [...new Set(wd.map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n) && n >= 0 && n <= 6))].sort();
    if (!wd.length) return { error: 'weekly 需至少一个 weekdays（0=周日…6=周六）' };
    out.weekdays = wd;
  } else if (type === 'interval') {
    const n = Math.floor(Number(f.intervalDays));
    if (!Number.isFinite(n) || n < 2 || n > 365) return { error: 'intervalDays 需为 2-365 的整数' };
    out.intervalDays = n;
  } else if (type === 'cycle') {
    const on = Math.floor(Number(f.onDays)), off = Math.floor(Number(f.offDays));
    if (!Number.isFinite(on) || on < 1 || on > 365) return { error: 'onDays 需为 1-365 的整数' };
    if (!Number.isFinite(off) || off < 1 || off > 365) return { error: 'offDays 需为 1-365 的整数' };
    out.onDays = on; out.offDays = off;
  }
  return { freq: out };
}

function normalizeRegimen(raw, existing) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  const prev = existing && typeof existing === 'object' ? existing : null;
  const profileId = clip(raw.profileId !== undefined ? raw.profileId : (prev ? prev.profileId : ''), 40);
  const medId = clip(raw.medId !== undefined ? raw.medId : (prev ? prev.medId : ''), 40);
  if (!profileId) return { error: '方案必须挂在一个成员下' };
  if (!medId) return { error: '方案必须挂在一支药品下' };
  let dose = raw.dose !== undefined ? Number(raw.dose) : (prev ? prev.dose : NaN);
  if (!Number.isFinite(dose) || dose <= 0) return { error: 'dose 需为正数（每次剂量）' };
  dose = Math.min(dose, 10000);
  let times = raw.times !== undefined ? raw.times : (prev ? prev.times : []);
  if (!Array.isArray(times)) times = [];
  const seenMin = new Set();
  times = times.map((t) => timeToMin(t))
    .filter((min) => min >= 0 && !seenMin.has(min) && (seenMin.add(min), true))
    .sort((a, b) => a - b)
    .slice(0, MAX_TIMES)
    .map(minToTime);
  const fr = raw.freq !== undefined ? normalizeFreq(raw.freq) : { freq: prev ? prev.freq : null };
  if (fr.error) return { error: fr.error };
  if (!fr.freq) return { error: '缺少频次 freq' };
  if (fr.freq.type !== 'prn' && !times.length) return { error: '非 prn 方案需至少一个服药时刻（times，如 ["08:00"]）' };
  const startDate = raw.startDate !== undefined ? clip(raw.startDate, 10)
    : (prev ? prev.startDate : dayKey(Date.now()));
  if (parseDayKey(startDate) == null) return { error: `startDate 不合法：${startDate}（需 YYYY-MM-DD）` };
  let endDate = prev ? prev.endDate || '' : '';
  if (raw.endDate !== undefined) {
    const e = clip(raw.endDate, 10);
    if (e && parseDayKey(e) == null) return { error: `endDate 不合法：${e}（需 YYYY-MM-DD 或留空）` };
    endDate = e;
  }
  if (endDate && dayDiff(endDate, startDate) < 0) return { error: 'endDate 不能早于 startDate' };
  return { regimen: {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : idFor('reg|' + profileId + '|' + medId + '|' + startDate + '|' + randTag())),
    profileId, medId, dose, times,
    freq: fr.freq,
    startDate, endDate,
    active: raw.active === undefined ? (prev ? prev.active !== false : true) : raw.active === true,
    note: clip(raw.note !== undefined ? raw.note : (prev ? prev.note : ''), NOTE_CAP),
    createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now(),
    rev: prev ? (Number(prev.rev) || 1) + 1 : 1,
  } };
}

/** 服药记录：occKey = `${regId}|${date}|${time}`（同一次发生重复打卡=覆盖，天然幂等） */
function doseOccKey(regId, date, time) {
  return `${regId}|${date}|${time}`;
}
function parseOccKey(key) {
  const s = String(key || '');
  const i = s.indexOf('|');
  if (i < 0) return null;
  const regId = s.slice(0, i);
  const rest = s.slice(i + 1);
  const j = rest.indexOf('|');
  if (j < 0) return null;
  const date = rest.slice(0, j), time = rest.slice(j + 1);
  if (!regId || parseDayKey(date) == null || timeToMin(time) < 0) return null;
  return { regId, date, time };
}
/**
 * normalizeLog：raw {occKey 或 regId+date+time, status, amount?, at?}。
 * regimen 传入时校验发生日在方案窗口内（防错记到未开方案的日期）；
 * status 'none' = 撤销（返回 del 标记）。
 */
function normalizeLog(raw, regimen, now) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  let occ = raw.occKey ? parseOccKey(raw.occKey) : null;
  if (!occ) {
    const regId = clip(raw.regId, 40), date = clip(raw.date, 10), time = clip(raw.time, 5);
    if (!regId || parseDayKey(date) == null || timeToMin(time) < 0) return { error: '需提供 occKey 或 regId+date+time（date=YYYY-MM-DD，time=HH:MM）' };
    occ = { regId, date, time };
  }
  const statusRaw = String(raw.status !== undefined ? raw.status : 'taken');
  if (statusRaw === 'none' || statusRaw === 'undo') return { del: doseOccKey(occ.regId, occ.date, occ.time) };
  if (!['taken', 'skip'].includes(statusRaw)) return { error: `status 不合法：${statusRaw}（taken/skip/none）` };
  if (regimen && occ.regId !== regimen.id) return { error: 'occKey 与方案不匹配' };
  if (regimen) {
    const dd = dayDiff(occ.date, regimen.startDate);
    if (Number.isNaN(dd)) return { error: '日期不合法' };
    if (dd < 0) return { error: `打卡日期早于方案开始（${regimen.startDate}）` };
    if (regimen.endDate && dayDiff(occ.date, regimen.endDate) > 0) return { error: `打卡日期晚于方案结束（${regimen.endDate}）` };
    const isPrn = regimen.freq.type === 'prn';
    if (!isPrn && !regimen.times.includes(occ.time)) {
      return { error: `时刻 ${occ.time} 不在该方案排期内（${regimen.times.join('/')}）；需要记录计划外服药请先确认方案` };
    }
  }
  const amount = raw.amount !== undefined && Number.isFinite(Number(raw.amount)) && Number(raw.amount) > 0
    ? Math.min(Number(raw.amount), 10000) : undefined;
  let at = Number(raw.at);
  if (!Number.isFinite(at) || at <= 0) at = now || Date.now();
  return { log: {
    occKey: doseOccKey(occ.regId, occ.date, occ.time),
    regId: occ.regId, date: occ.date, time: occ.time,
    status: statusRaw,
    amount,
    at: Math.floor(at),
  } };
}

const SETTING_LIMITS = { graceMin: [10, 240, 60], lowDays: [1, 60, 5], expiryWarnDays: [7, 730, 90], soundOn: null };
function normalizeSettings(raw) {
  const out = {};
  for (const [k, lim] of Object.entries(SETTING_LIMITS)) {
    if (k === 'soundOn') {
      const v = raw && typeof raw === 'object' ? raw[k] : undefined;
      out[k] = v === undefined ? true : v === true;
      continue;
    }
    const v = Number(raw && typeof raw === 'object' ? raw[k] : undefined);
    out[k] = Number.isFinite(v) ? Math.min(lim[1], Math.max(lim[0], Math.floor(v))) : lim[2];
  }
  return out;
}

// ── 方案 → 某日应服发生 ──────────────────────────────────────────────────────
/** 方案在某天是否排期（active、窗口、频次五型判定） */
function regimenDueOnDate(reg, date) {
  if (!reg || reg.active === false || reg.freq.type === 'prn') return false;
  const dd = dayDiff(date, reg.startDate);
  if (Number.isNaN(dd) || dd < 0) return false;
  if (reg.endDate && dayDiff(date, reg.endDate) > 0) return false;
  const f = reg.freq;
  if (f.type === 'daily') return true;
  if (f.type === 'weekly') {
    const ts = parseDayKey(date);
    if (ts == null) return false;
    return f.weekdays.includes(new Date(ts).getDay());
  }
  if (f.type === 'interval') return dd % f.intervalDays === 0;
  if (f.type === 'cycle') { const pos = dd % (f.onDays + f.offDays); return pos < f.onDays; }
  return false;
}

/** 方案某日全部应服发生：[{occKey,time,min,amount,dueTs,reg}] */
function regimenOccurrencesOnDate(reg, date) {
  if (!regimenDueOnDate(reg, date)) return [];
  return reg.times.map((time) => {
    const min = timeToMin(time);
    return {
      occKey: doseOccKey(reg.id, date, time),
      time, min,
      amount: reg.dose,
      dueTs: dayMinTs(date, min),
      reg,
    };
  });
}

/** 多方案某日应服（升序） */
function occurrencesForDate(regimens, date) {
  const out = [];
  for (const reg of Array.isArray(regimens) ? regimens : []) {
    if (reg && reg.id) out.push(...regimenOccurrencesOnDate(reg, date));
  }
  return out.sort((a, b) => a.min - b.min);
}

// ── 今日全家药单 ─────────────────────────────────────────────────────────────
/**
 * todayPlan：按成员分组、按时序排列的某日药单。
 * state：'done' | 'skip'（已打卡）| 'now'（时刻起 grace 内）| 'overdue'（过 grace 未打卡）| 'upcoming'
 */
function todayPlan(ctx, date, now) {
  const { profiles, meds, regimens, logs } = ctx;
  const settings = normalizeSettings(ctx.settings);
  const nowTs = now == null ? Date.now() : now;
  const logMap = new Map();
  for (const l of Array.isArray(logs) ? logs : []) {
    if (l && l.occKey) logMap.set(l.occKey, l); // 后见覆盖（与 cap.kv 同键覆盖语义一致；写侧传 [...旧, 新] 时新值在后）
  }
  const medById = new Map((Array.isArray(meds) ? meds : []).filter((m) => m && m.id).map((m) => [m.id, m]));
  const regById = new Map((Array.isArray(regimens) ? regimens : []).filter((r) => r && r.id).map((r) => [r.id, r]));
  const byProfile = new Map((Array.isArray(profiles) ? profiles : []).filter((p) => p && p.id).map((p) => [p.id, []]));
  const graceMs = settings.graceMin * 60000;

  for (const occ of occurrencesForDate((Array.isArray(regimens) ? regimens : []).filter((r) => r && r.active !== false), date)) {
    const bucket = byProfile.get(occ.reg.profileId);
    if (!bucket) continue; // 方案挂在已删档案下：跳过不炸
    const log = logMap.get(occ.occKey);
    let state = 'upcoming';
    if (log && log.status === 'taken') state = 'done';
    else if (log && log.status === 'skip') state = 'skip';
    else if (occ.dueTs != null && nowTs >= occ.dueTs && nowTs <= occ.dueTs + graceMs) state = 'now';
    else if (occ.dueTs != null && nowTs > occ.dueTs + graceMs) state = 'overdue';
    const med = medById.get(occ.reg.medId);
    bucket.push({
      occKey: occ.occKey, time: occ.time, dueTs: occ.dueTs,
      medId: occ.reg.medId,
      medName: med ? med.name : '未知药品',
      unit: med ? med.unit : '',
      amount: log && log.amount != null ? log.amount : occ.amount,
      status: log ? log.status : null,
      loggedAt: log ? log.at : null,
      state,
      note: occ.reg.note || '',
    });
  }
  const out = [];
  for (const p of Array.isArray(profiles) ? profiles : []) {
    if (!p || !p.id) continue;
    const items = (byProfile.get(p.id) || []).sort((a, b) => a.dueTs - b.dueTs || (a.medName < b.medName ? -1 : 1));
    out.push({
      profile: p,
      items,
      counts: {
        done: items.filter((i) => i.state === 'done').length,
        skip: items.filter((i) => i.state === 'skip').length,
        now: items.filter((i) => i.state === 'now').length,
        overdue: items.filter((i) => i.state === 'overdue').length,
        upcoming: items.filter((i) => i.state === 'upcoming').length,
      },
    });
  }
  return out;
}

/**
 * dosesProjection：服务投影口径——某日「未打卡且已到点」的应服（now + overdue）。
 * 服务每 tick 重算写 qingnang.doses；面板横幅 / AI / 三端共用。
 */
function dosesProjection(ctx, date, now) {
  const plan = todayPlan(ctx, date, now);
  const items = [];
  for (const g of plan) {
    for (const it of g.items) {
      if (it.state === 'now' || it.state === 'overdue') {
        items.push({
          occKey: it.occKey,
          profileId: g.profile.id, profileName: g.profile.name,
          medId: it.medId, medName: it.medName, unit: it.unit,
          amount: it.amount, time: it.time, dueTs: it.dueTs, state: it.state,
        });
      }
    }
  }
  items.sort((a, b) => a.dueTs - b.dueTs || (a.profileName < b.profileName ? -1 : 1));
  return { at: Math.floor(now == null ? Date.now() : now), date, items };
}

// ── 库存 FEFO 派生 ───────────────────────────────────────────────────────────
/**
 * stockForMed：单一事实 = 批次 qty + taken 记录；库存纯派生，无可写库存键。
 * FEFO：可用批次按（有效期升序，createdAt 升序，id）排队，消耗按打卡时序归因；
 * 已过期批次不参与可用量与消耗，单列待清理。remaining 钳制 ≥0（超吃不透支，标记 over）。
 * @returns {{ totalUsable, totalExpired, batches:[{id,qty,remaining,expiry,expired,note}], over:boolean, lastTakenAt }}
 */
function stockForMed(medId, batches, logs, regimens, today) {
  const day = today || dayKey(Date.now());
  const own = (Array.isArray(batches) ? batches : [])
    .filter((b) => b && b.medId === medId && Number.isFinite(Number(b.qty)))
    .slice(0, MAX_BATCHES_HINT);
  // 有效期序（空效期视为最远——仍可用但不上榜）；过期批不进可用队列
  const usable = [];
  const expiredList = [];
  for (const b of own) {
    const exp = b.expiry || '';
    const isExpired = !!exp && dayDiff(day, exp) > 0; // 今天 = exp 当天仍可用（当日到期算可用，次日红）
    (isExpired ? expiredList : usable).push(b);
  }
  usable.sort((a, b) => {
    const ea = a.expiry || '9999-12-31', eb = b.expiry || '9999-12-31';
    if (ea !== eb) return ea < eb ? -1 : 1;
    if (a.createdAt !== b.createdAt) return (a.createdAt || 0) - (b.createdAt || 0);
    return String(a.id) < String(b.id) ? -1 : 1;
  });
  const remaining = new Map(usable.map((b) => [b.id, Math.max(0, Number(b.qty) || 0)]));
  // 该药的全部 taken 记录（经方案映射 medId），按真实动作时序消耗
  const regById = new Map((Array.isArray(regimens) ? regimens : []).filter((r) => r && r.id).map((r) => [r.id, r]));
  // occKey 去重（后见覆盖）：防御写侧把同一 occKey 传两次导致双份扣减
  const logMap = new Map();
  for (const l of Array.isArray(logs) ? logs : []) {
    if (l && l.occKey) logMap.set(l.occKey, l);
  }
  const taken = [...logMap.values()]
    .filter((l) => l && l.status === 'taken' && l.occKey)
    .map((l) => {
      const reg = regById.get(l.regId);
      const amount = l.amount != null && Number.isFinite(Number(l.amount)) ? Number(l.amount) : (reg ? reg.dose : 0);
      return { medId: reg ? reg.medId : null, amount, at: Number(l.at) || 0 };
    })
    .filter((x) => x.medId === medId && x.amount > 0)
    .sort((a, b) => a.at - b.at);
  let over = false;
  let lastTakenAt = 0;
  for (const t of taken) {
    lastTakenAt = Math.max(lastTakenAt, t.at);
    let need = t.amount;
    for (const b of usable) {
      if (need <= 0) break;
      const cur = remaining.get(b.id) || 0;
      if (cur <= 0) continue;
      const use = Math.min(cur, need);
      remaining.set(b.id, Math.round((cur - use) * 100) / 100);
      need -= use;
    }
    if (need > 0) over = true; // 库存不足以覆盖历史消耗（如实标记，不透支）
  }
  const batchRows = own.map((b) => ({
    id: b.id, qty: Number(b.qty) || 0,
    remaining: expiredList.includes(b) ? (Number(b.qty) || 0) : Math.round((remaining.get(b.id) || 0) * 100) / 100,
    expiry: b.expiry || '',
    expired: expiredList.includes(b),
    note: b.note || '',
  })).sort((a, b) => {
    const ea = a.expiry || '9999-12-31', eb = b.expiry || '9999-12-31';
    if (ea !== eb) return ea < eb ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
  return {
    totalUsable: Math.round(batchRows.filter((b) => !b.expired).reduce((s, b) => s + b.remaining, 0) * 100) / 100,
    totalExpired: Math.round(batchRows.filter((b) => b.expired).reduce((s, b) => s + b.remaining, 0) * 100) / 100,
    batches: batchRows,
    over,
    lastTakenAt,
  };
}

// ── 消耗速率与补货预测 ───────────────────────────────────────────────────────
/** 方案的平均每日排量（考虑频次五型的长期均值） */
function regimenDailyRate(reg) {
  if (!reg || reg.active === false || reg.freq.type === 'prn') return 0;
  const perDay = reg.dose * reg.times.length;
  const f = reg.freq;
  if (f.type === 'daily') return perDay;
  if (f.type === 'weekly') return perDay * f.weekdays.length / 7;
  if (f.type === 'interval') return perDay / f.intervalDays;
  if (f.type === 'cycle') return perDay * f.onDays / (f.onDays + f.offDays);
  return 0;
}

/**
 * refillForecast：全药箱补货榜。速率口径：近 RATE_WINDOW_DAYS 实际 taken 均值优先，
 * 无记录回落方案排量（并标注 estimated）；daysLeft = 可用量 / 速率。
 */
function refillForecast(ctx, now) {
  const { meds, batches, logs, regimens } = ctx;
  const settings = normalizeSettings(ctx.settings);
  const nowTs = now == null ? Date.now() : now;
  const today = dayKey(nowTs);
  const since = nowTs - RATE_WINDOW_DAYS * DAY_MS;
  const regById = new Map((Array.isArray(regimens) ? regimens : []).filter((r) => r && r.id).map((r) => [r.id, r]));
  const takenByMed = new Map();
  for (const l of Array.isArray(logs) ? logs : []) {
    if (!l || l.status !== 'taken' || !(Number(l.at) >= since)) continue;
    const reg = regById.get(l.regId);
    if (!reg) continue;
    const amount = l.amount != null && Number.isFinite(Number(l.amount)) ? Number(l.amount) : reg.dose;
    takenByMed.set(reg.medId, (takenByMed.get(reg.medId) || 0) + amount);
  }
  const out = [];
  for (const med of Array.isArray(meds) ? meds : []) {
    if (!med || !med.id) continue;
    const stock = stockForMed(med.id, batches, logs, regimens, today);
    const actualRate = takenByMed.get(med.id) != null ? takenByMed.get(med.id) / RATE_WINDOW_DAYS : null;
    const schedRate = (Array.isArray(regimens) ? regimens : [])
      .filter((r) => r && r.medId === med.id && r.active !== false)
      .reduce((s, r) => s + regimenDailyRate(r), 0);
    const rate = actualRate != null ? actualRate : schedRate;
    const daysLeft = rate > 0 ? Math.floor(stock.totalUsable / rate) : null;
    out.push({
      medId: med.id, name: med.name, spec: med.spec || '', unit: med.unit || '',
      remaining: stock.totalUsable, expired: stock.totalExpired,
      ratePerDay: Math.round(rate * 100) / 100,
      estimated: actualRate == null && schedRate > 0,
      daysLeft,
      urgency: daysLeft == null ? 'none' : daysLeft <= settings.lowDays ? 'low' : daysLeft <= settings.lowDays * 3 ? 'watch' : 'ok',
    });
  }
  out.sort((a, b) => {
    const w = { low: 0, watch: 1, ok: 2, none: 3 };
    if (w[a.urgency] !== w[b.urgency]) return w[a.urgency] - w[b.urgency];
    if (a.daysLeft != null && b.daysLeft != null) return a.daysLeft - b.daysLeft;
    return a.name < b.name ? -1 : 1;
  });
  return out;
}

// ── 效期红黄榜 ───────────────────────────────────────────────────────────────
/** 每批次效期分带：expired（<今天）/ soon（warnDays 内）/ ok / unknown（未登记效期） */
function expiryBands(batches, meds, now, warnDays) {
  const nowTs = now == null ? Date.now() : now;
  const today = dayKey(nowTs);
  const warn = normalizeSettings({ expiryWarnDays: warnDays }).expiryWarnDays;
  const medById = new Map((Array.isArray(meds) ? meds : []).filter((m) => m && m.id).map((m) => [m.id, m]));
  const rows = [];
  for (const b of Array.isArray(batches) ? batches : []) {
    if (!b || !b.medId) continue;
    let band = 'unknown';
    let daysLeft = null;
    if (b.expiry) {
      daysLeft = dayDiff(b.expiry, today); // 正 = 还剩几天；负 = 已过期
      band = daysLeft < 0 ? 'expired' : daysLeft <= warn ? 'soon' : 'ok';
    }
    const med = medById.get(b.medId);
    rows.push({
      batchId: b.id, medId: b.medId,
      medName: med ? med.name : '未知药品',
      unit: med ? med.unit : '',
      expiry: b.expiry || '',
      daysLeft,
      qty: Number(b.qty) || 0,
      band, note: b.note || '',
    });
  }
  const order = { expired: 0, soon: 1, ok: 2, unknown: 3 };
  rows.sort((a, b) => {
    if (order[a.band] !== order[b.band]) return order[a.band] - order[b.band];
    const ea = a.expiry || '9999-12-31', eb = b.expiry || '9999-12-31';
    if (ea !== eb) return ea < eb ? -1 : 1;
    return String(a.batchId) < String(b.batchId) ? -1 : 1;
  });
  return rows;
}

// ── 依从率 ───────────────────────────────────────────────────────────────────
/**
 * adherence：近 days 天（含今天）。分母（decided）只含「已判定」次数——已打卡或
 * 已过 grace 未打卡（missed）；今天未到点的不进分母（未来不算漏服，否则压低依从率）。
 * scheduled 为窗口内全部计划次数（含未到点），仅供展示。
 */
function adherence(ctx, profileId, now, days) {
  const { meds, regimens, logs } = ctx;
  const settings = normalizeSettings(ctx.settings);
  const nowTs = now == null ? Date.now() : now;
  const n = Math.max(1, Math.floor(Number(days) || 7));
  const graceMs = settings.graceMin * 60000;
  let scheduled = 0, decided = 0, taken = 0, skipped = 0, missed = 0;
  const logMap = new Map();
  for (const l of Array.isArray(logs) ? logs : []) {
    if (l && l.occKey) logMap.set(l.occKey, l); // 后见覆盖（同 todayPlan）
  }
  const regById = new Map((Array.isArray(regimens) ? regimens : []).filter((r) => r && r.id).map((r) => [r.id, r]));
  for (let i = n - 1; i >= 0; i--) {
    const date = dayKey(nowTs - i * DAY_MS);
    for (const occ of occurrencesForDate((Array.isArray(regimens) ? regimens : []).filter((r) => r && r.active !== false && (!profileId || r.profileId === profileId)), date)) {
      scheduled++;
      const l = logMap.get(occ.occKey);
      if (l && l.status === 'taken') { decided++; taken++; }
      else if (l && l.status === 'skip') { decided++; skipped++; }
      else if (occ.dueTs != null && nowTs > occ.dueTs + graceMs) { decided++; missed++; }
    }
  }
  return {
    days: n, scheduled, decided, taken, skipped, missed,
    rate: decided > 0 ? Math.round((taken / decided) * 100) : null,
  };
}

// ── 概览与描述 ───────────────────────────────────────────────────────────────
const FREQ_CN = { daily: '每天', weekly: '每周', interval: '隔', cycle: '周期', prn: '需要时' };
const WD_CN = ['日', '一', '二', '三', '四', '五', '六'];
function describeFreq(freq) {
  const f = freq || { type: 'daily' };
  if (f.type === 'daily') return '每天';
  if (f.type === 'weekly') return `每周${f.weekdays.map((d) => WD_CN[d]).join('、')}`;
  if (f.type === 'interval') return `每 ${f.intervalDays} 天`;
  if (f.type === 'cycle') return `吃 ${f.onDays} 天停 ${f.offDays} 天`;
  return '需要时（prn）';
}
function describeRegimen(reg, med) {
  const parts = [`${med ? med.name : '未知药品'} 每次 ${reg.dose}${med ? med.unit : ''}`];
  if (reg.freq.type !== 'prn') parts.push(reg.times.join(' / '));
  parts.push(describeFreq(reg.freq));
  parts.push(`自 ${reg.startDate}${reg.endDate ? ` 至 ${reg.endDate}` : ''}`);
  if (reg.active === false) parts.push('（已停）');
  return parts.join(' · ');
}

/** 全库导出（面板/设置用；剥离无业务语义字段） */
function exportAll(data) {
  const strip = (arr, drop) => (Array.isArray(arr) ? arr : []).map((x) => {
    const o = {}; for (const k of Object.keys(x || {})) if (!drop.includes(k)) o[k] = x[k]; return o;
  });
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    kind: 'polaris-qingnang',
    disclaimer: '家庭药事记录，非医疗建议。',
    profiles: strip(data.profiles, ['rev']),
    meds: strip(data.meds, ['rev']),
    batches: strip(data.batches, ['rev']),
    regimens: strip(data.regimens, ['rev']),
    logs: strip(data.logs, []),
    settings: normalizeSettings(data.settings),
  }, null, 2);
}

module.exports = {
  DAY_MS, NAME_CAP, SPEC_CAP, NOTE_CAP, UNIT_CAP, MAX_TIMES, FREQ_TYPES, FORMS, RATE_WINDOW_DAYS,
  clip, idFor, randTag,
  dayKey, parseDayKey, timeToMin, minToTime, dayMinTs, dayDiff,
  normalizeProfile, normalizeMed, normalizeBatch, normalizeFreq, normalizeRegimen,
  normalizeLog, normalizeSettings, doseOccKey, parseOccKey,
  regimenDueOnDate, regimenOccurrencesOnDate, occurrencesForDate,
  todayPlan, dosesProjection,
  stockForMed, regimenDailyRate, refillForecast, expiryBands, adherence,
  FREQ_CN, WD_CN, describeFreq, describeRegimen, exportAll,
};
