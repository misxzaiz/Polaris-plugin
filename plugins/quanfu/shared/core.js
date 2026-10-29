'use strict';
/**
 * core.js —— 贷款台账（quanfu）两方共享纯函数核心（零依赖，浏览器 / node 同源一致）
 *
 * 职责（面板 / MCP 共用同一实现，保证「同一本贷款账」两端口径一字不差）：
 *   - 贷款/事件/设置规范化（写入口径唯一，中文报错）
 *   - 三种还款方式逐期生成：annuity 等额本息 / linear 等额本金 / bullet 先息后本
 *   - 事件分段重放引擎：利率变更（重定价）与提前还款把还款表切段，每个边界按
 *     当前 plan 模式（payment 减供=保期数重推月供 / term 缩期=保月供解新期数）重推
 *   - whatif 三方案对比（基准 / 缩期 / 减供），缩期不可行如实报告
 *   - 状态投影（loanState）：当前期数 / 下次扣款 / 剩余本金 / 剩余总利息 / 结清日 /
 *     下次重定价日（repricing 配置推导，零投机）
 *   - 对账漂移（checkpoint 事件 vs 账面余额）
 *   - 年度本息构成（面板迷你柱图与 AI 年度复盘共用）
 *
 * 时区与日期：「某日」一律本机时区日期串 YYYY-MM-DD（dayKey，同日晷/青囊）。
 * 金额：全程元为单位、每步 2dp（分级）舍入，末期本金补差——与银行逐期计息口径
 * 对齐，但仍可能与具体银行有分级出入（工具输出如实声明）。
 *
 * 语义锚（normalizeEvent/工具描述与 README 保持一致）：
 *   - loan.startDate = 第一期还款日
 *   - rate 事件 date = 新利率生效的第一期还款日（按 date ≥ 事件日的首个还款期生效）
 *   - prepay 事件 date = 生效基准日，实际在 date ≥ 该日的第一个还款期生效（额外
 *     支出，不并入当期月供）；该次 mode 即此后该贷款的调整模式
 *   - checkpoint = 银行口径剩余本金快照，只对账不改账面
 *
 * 安全边界：只做记录与测算，不产出任何金融建议；零外网请求。
 */

const { sha256Hex } = require('./sha256');

const DAY_MS = 86400000;
const NAME_CAP = 40;
const LENDER_CAP = 40;
const NOTE_CAP = 300;
const MAX_TERM_MONTHS = 600;   // 50 年上限
const MAX_WALK = 1200;         // 重放安全上限（含多次缩期后的绝对上限）
const METHODS = ['annuity', 'linear', 'bullet'];
const METHOD_NAMES = { annuity: '等额本息', linear: '等额本金', bullet: '先息后本' };
const KINDS = ['mortgage', 'car', 'consumer', 'business', 'other'];
const KIND_NAMES = { mortgage: '房贷', car: '车贷', consumer: '消费贷', business: '经营贷', other: '其他' };
const EVENT_TYPES = ['rate', 'prepay', 'checkpoint'];
const CYCLES = [3, 6, 12];
const PREPAY_MIN = 100;        // 元——防手滑录入 0.01 级噪声
const EPS_BAL = 0.005;         // 余额收敛阈值（半分级）

// ── 通用小件 ─────────────────────────────────────────────────────────────────
function clip(s, cap) {
  return String(s == null ? '' : s).trim().slice(0, cap);
}
function idFor(seed) { return 'f' + sha256Hex(String(seed)).slice(0, 12); }
function randTag() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/** 分级舍入（每步 2dp）：JS 浮点下保证确定性的整数分级 */
function round2(x) {
  return Math.round(x * 100) / 100;
}

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
function dayDiff(a, b) {
  const ta = parseDayKey(a); const tb = parseDayKey(b);
  if (ta == null || tb == null) return null;
  return Math.round((ta - tb) / DAY_MS);
}
/** 当月天数（1 起） */
function daysInMonth(y, mIdx) { return new Date(y, mIdx + 1, 0).getDate(); }

/** 日期串 + k 个月（月末钳制：1/31 + 1 月 = 2/28；非法输入返回 null） */
function addMonths(dateStr, k) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!m) return null;
  const y = +m[1]; const mo = +m[2] - 1; const d = +m[3];
  if (d < 1 || d > daysInMonth(y, mo)) return null;
  const total = y * 12 + mo + k;
  const ny = Math.floor(total / 12);
  const nmo = total - ny * 12;
  const nd = Math.min(d, daysInMonth(ny, nmo));
  return `${ny}-${String(nmo + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

/** 金额格式化：分 → 千分位；万格式（≥1 万显示 x.xx 万） */
function fmtMoney(x) {
  if (x == null || !Number.isFinite(+x)) return '—';
  const n = round2(+x);
  const neg = n < 0;
  const abs = Math.abs(n);
  const s = abs >= 10000
    ? `${(abs / 10000).toFixed(abs >= 1000000 ? 1 : 2)} 万`
    : `${abs.toFixed(2).replace(/\.00$/, '')} 元`;
  return (neg ? '−' : '') + s;
}
function fmtPct(x) {
  if (x == null || !Number.isFinite(+x)) return '—';
  return `${round2(+x * 100) / 100}%`;
}

// ── 规范化 ───────────────────────────────────────────────────────────────────
function normalizeLoan(input, prev) {
  const src = input || {};
  const prevLoan = prev && typeof prev === 'object' ? prev : null;
  const name = clip(src.name != null ? src.name : (prevLoan && prevLoan.name), NAME_CAP);
  if (!name) return { error: '贷款名称必填（如「商贷」「公积金」「车贷」）' };
  const kind = KINDS.includes(src.kind) ? src.kind
    : (KINDS.includes(prevLoan && prevLoan.kind) ? prevLoan.kind : 'mortgage');
  const method = METHODS.includes(src.method) ? src.method
    : (METHODS.includes(prevLoan && prevLoan.method) ? prevLoan.method : null);
  if (!method) return { error: `还款方式必填：annuity(等额本息)/linear(等额本金)/bullet(先息后本)` };
  const principal = Math.round((+((src.principal != null ? src.principal : prevLoan && prevLoan.principal)) || 0) * 100) / 100;
  if (!Number.isFinite(principal) || principal < 100 || principal > 2e8) {
    return { error: '本金不合法（100 元 ~ 2 亿元）' };
  }
  const annualRate = Math.round((+((src.annualRate != null ? src.annualRate : prevLoan && prevLoan.annualRate)) || 0) * 10000) / 10000;
  if (!Number.isFinite(annualRate) || annualRate < 0.0001 || annualRate > 36) {
    return { error: '年利率不合法（0.0001% ~ 36%）' };
  }
  const startDate = clip(src.startDate != null ? src.startDate : prevLoan && prevLoan.startDate, 10);
  if (parseDayKey(startDate) == null) return { error: `开始日期不合法：${startDate || '（空）'}（YYYY-MM-DD，第一期还款日）` };
  const tmRaw = +(src.termMonths != null ? src.termMonths : prevLoan && prevLoan.termMonths);
  const termMonths = Math.round(tmRaw || 0);
  if (!Number.isFinite(tmRaw) || Math.round(tmRaw) !== tmRaw || termMonths < 1 || termMonths > MAX_TERM_MONTHS) {
    return { error: `期数须为整数月（1 ~ ${MAX_TERM_MONTHS}）` };
  }
  // repricing：day='MM-DD' 或 'anniversary'，cycleMonths ∈ {3,6,12}
  let repricing = null;
  const rpSrc = src.repricing !== undefined ? src.repricing : (prevLoan && prevLoan.repricing);
  if (rpSrc && typeof rpSrc === 'object') {
    const day = clip(rpSrc.day, 12);
    const cm = Math.round(+rpSrc.cycleMonths || 0);
    if (day !== 'anniversary' && !/^\d{2}-\d{2}$/.test(day)) {
      return { error: '重定价日应为 MM-DD（如 01-01）或 "anniversary"（放款对月对日）' };
    }
    if (day !== 'anniversary') {
      const mm = +day.slice(0, 2); const dd = +day.slice(3, 5);
      if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return { error: `重定价日不合法：${day}` };
    }
    if (!CYCLES.includes(cm)) return { error: '重定价周期只支持 3 / 6 / 12 个月' };
    repricing = { day, cycleMonths: cm };
  }
  const loan = {
    id: clip(src.id, 20) || (prevLoan && prevLoan.id) || idFor('loan|' + name),
    name,
    lender: clip(src.lender != null ? src.lender : prevLoan && prevLoan.lender, LENDER_CAP),
    kind, method, principal, annualRate, startDate, termMonths,
    repricing,
    groupId: clip(src.groupId != null ? src.groupId : prevLoan && prevLoan.groupId, NAME_CAP),
    note: clip(src.note != null ? src.note : prevLoan && prevLoan.note, NOTE_CAP),
    active: src.active === undefined ? (prevLoan ? prevLoan.active !== false : true) : src.active !== false,
    createdAt: Math.round(+(src.createdAt != null ? src.createdAt : prevLoan && prevLoan.createdAt) || Date.now()),
  };
  return { loan };
}

/** 事件规范化。occKey = type|loanId|date（同日同型覆盖 = 幂等） */
function normalizeEvent(input, prev) {
  const src = input || {};
  const prevEv = prev && typeof prev === 'object' ? prev : null;
  const type = EVENT_TYPES.includes(src.type) ? src.type
    : (EVENT_TYPES.includes(prevEv && prevEv.type) ? prevEv.type : null);
  if (!type) return { error: `事件类型必填：rate(利率变更)/prepay(提前还款)/checkpoint(对账)` };
  const loanId = clip(src.loanId != null ? src.loanId : prevEv && prevEv.loanId, 20);
  if (!loanId) return { error: 'loanId 必填' };
  const date = clip(src.date != null ? src.date : prevEv && prevEv.date, 10);
  if (parseDayKey(date) == null) return { error: `日期不合法：${date || '（空）'}（YYYY-MM-DD）` };
  const ev = {
    occKey: `${type}|${loanId}|${date}`,
    type, loanId, date,
    at: Math.round(+(src.at != null ? src.at : prevEv && prevEv.at) || Date.now()),
    note: clip(src.note != null ? src.note : prevEv && prevEv.note, NOTE_CAP),
  };
  if (type === 'rate') {
    const rate = Math.round((+((src.rate != null ? src.rate : prevEv && prevEv.rate)) || 0) * 10000) / 10000;
    if (!Number.isFinite(rate) || rate < 0.0001 || rate > 36) return { error: '新利率不合法（0.0001% ~ 36%）' };
    ev.rate = rate;
  } else if (type === 'prepay') {
    const amount = Math.round((+((src.amount != null ? src.amount : prevEv && prevEv.amount)) || 0) * 100) / 100;
    if (!Number.isFinite(amount) || amount < PREPAY_MIN) return { error: `提前还款金额不合法（≥ ${PREPAY_MIN} 元）` };
    const mode = ['term', 'payment'].includes(src.mode) ? src.mode
      : (['term', 'payment'].includes(prevEv && prevEv.mode) ? prevEv.mode : null);
    if (!mode) return { error: '提前还款必须选 mode：term(缩期)/payment(减月供)' };
    ev.amount = amount;
    ev.mode = mode;
  } else {
    const amount = Math.round((+((src.amount != null ? src.amount : prevEv && prevEv.amount)) || 0) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 0) return { error: '对账金额（银行口径剩余本金）不合法' };
    ev.amount = amount;
  }
  return { ev };
}

function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const num = (v, dflt, lo, hi) => {
    const n = Math.round(+v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };
  return {
    warnDays: num(s.warnDays, 3, 0, 30),
    repricingWarnDays: num(s.repricingWarnDays, 30, 1, 365),
    driftWarn: num(s.driftWarn, 100, 1, 1000000),
  };
}

// ── 引擎：事件分段重放 ───────────────────────────────────────────────────────
/**
 * 月利率（小数）
 */
function monthlyRate(annualRatePct) { return annualRatePct / 100 / 12; }

/** 等额本息月供（分级舍入）；n ≥ 1 */
function annuityPmt(P, annualRatePct, n) {
  const r = monthlyRate(annualRatePct);
  if (r <= 0) return round2(P / n);
  const f = Math.pow(1 + r, n);
  return round2(P * r * f / (f - 1));
}

/** 保月供反解剩余期数；不可行（月供 ≤ 当期利息）返回 null */
function solvedN(bal, pmt, annualRatePct) {
  if (!(pmt > 0) || !(bal > 0)) return null;
  const r = monthlyRate(annualRatePct);
  if (r <= 0) return Math.max(1, Math.ceil((bal - EPS_BAL) / pmt));
  if (pmt <= bal * r) return null;
  const n = Math.log(pmt / (pmt - bal * r)) / Math.log(1 + r);
  return Math.max(1, Math.ceil(n - 1e-9));
}

function cmpEvent(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const w = { rate: 0, prepay: 1, checkpoint: 2 };
  return (w[a.type] ?? 9) - (w[b.type] ?? 9);
}

/**
 * 完整重放一笔贷款的还款表（含利率变更 / 提前还款）。
 * @param loan    normalizeLoan 产物（或同形对象）
 * @param events  normalizeEvent 产物数组（rate/prepay 参与，checkpoint 忽略）
 * @param extra   可选合成的额外事件（whatif 用；不落库）
 * @returns {periods, plan, truncated}
 *   periods[]: {k,date,opening,interest,principal,payment,closing,rate,prepay?}
 */
function simulate(loan, events, extra) {
  const start = parseDayKey(loan.startDate);
  const list = [].concat(Array.isArray(events) ? events : [], extra ? [extra] : [])
    .filter((e) => e && (e.type === 'rate' || e.type === 'prepay'))
    .sort(cmpEvent);
  const r0 = monthlyRate(loan.annualRate);
  let bal = round2(loan.principal);
  let curRate = loan.annualRate;
  let termEnd = loan.termMonths;          // 当前计划的末期（1 起绝对期数）
  let plan = 'payment';                    // payment=保期数 / term=保月供（每次 prepay 改写）
  let pmt = annuityPmt(loan.principal, loan.annualRate, loan.termMonths);       // annuity 当前月供
  let princM = round2(loan.principal / loan.termMonths);                        // linear 当前月本金（分级）
  const periods = [];
  let truncated = false;
  if (!start) return { periods, plan, truncated: true };
  let ei = 0;
  const rederive = (k) => {
    const remain = termEnd - k + 1;
    if (remain <= 0) return;
    if (loan.method === 'annuity') {
      if (plan === 'payment') {
        pmt = annuityPmt(bal, curRate, remain);
      } else { // term：保月供解期数；不可行（升息后月供不够付息）回落保期数
        const n2 = solvedN(bal, pmt, curRate);
        if (n2 == null) { plan = 'payment'; pmt = annuityPmt(bal, curRate, remain); }
        else termEnd = k + n2 - 1;
      }
    } else if (loan.method === 'linear') {
      if (plan === 'payment') princM = round2(bal / remain);
      // term：保持月本金不变，期数在 prepay 边界解出（此处不改）
    }
  };
  for (let k = 1; k <= MAX_WALK; k++) {
    const date = addMonths(loan.startDate, k - 1);
    const opening = bal;
    let prepayNote = 0;
    // 生效日 ≤ 本期的未应用事件（rate 先于 prepay）
    while (ei < list.length && list[ei].date <= date) {
      const ev = list[ei];
      if (ev.type === 'rate') {
        // 早于首期的利率事件（放款日重定价）同样在首个还款期生效
        curRate = ev.rate;
        rederive(k);
      } else {
        const effBal = bal;
        // 至少留一分钱：全额结清走「停用」而非提前还款（两处口径与 validatePrepay 一致）
        if (ev.amount < round2(effBal - 0.01)) {
          bal = round2(effBal - ev.amount);
          plan = ev.mode;
          if (loan.method === 'annuity') {
            if (plan === 'payment') pmt = annuityPmt(bal, curRate, termEnd - k + 1);
            else {
              const n2 = solvedN(bal, pmt, curRate);
              if (n2 == null) { plan = 'payment'; pmt = annuityPmt(bal, curRate, termEnd - k + 1); }
              else termEnd = k + n2 - 1;
            }
          } else if (loan.method === 'linear') {
            if (plan === 'payment') princM = round2(bal / (termEnd - k + 1));
            else termEnd = k + Math.max(1, Math.ceil((bal - EPS_BAL) / princM)) - 1;
          }
          // bullet：余额减少自动减息，期数与到期日不变（到期还本）
          prepayNote = ev.amount;
        }
      }
      ei++;
    }
    if (k > termEnd && bal > EPS_BAL) {
      // 缩期解出的期数下仍剩尾差：延长一期补收（诚实处理浮点尾差）
      termEnd = k;
    }
    const r = monthlyRate(curRate);
    const interest = round2(bal * r);
    let principal = 0;
    let payment = 0;
    if (loan.method === 'annuity') {
      if (k >= termEnd) principal = bal;
      else principal = Math.min(round2(pmt - interest), bal);
      payment = round2(principal + interest);
    } else if (loan.method === 'linear') {
      if (k >= termEnd) principal = bal;
      else principal = Math.min(princM, bal);
      payment = round2(principal + interest);
    } else { // bullet
      principal = (k >= termEnd) ? bal : 0;
      payment = round2(principal + interest);
    }
    bal = round2(bal - principal);
    if (bal < EPS_BAL) bal = 0;
    periods.push({
      k, date, opening, interest, principal, payment, closing: bal,
      rate: curRate, prepay: prepayNote || undefined,
    });
    if (bal <= 0 && principal > 0) break;
    if (k === MAX_WALK) truncated = true;
  }
  return { periods, plan, truncated };
}

/** 余额@某日：该日（含）前最后一期 closing；早于首期返回初始本金 */
function balanceAt(sim, dateStr) {
  const t = parseDayKey(dateStr);
  if (t == null) return null;
  let bal = null;
  for (const p of sim.periods) {
    const pd = parseDayKey(p.date);
    if (pd != null && pd <= t) bal = p.closing;
    else break;
  }
  return bal;
}

/** 提前还款可行性校验（写入前 & whatif 共用）：返回 {ok,effectiveDate,balanceAtEff} 或 {error} */
function validatePrepay(loan, events, { date, amount }) {
  const sim = simulate(loan, events);
  if (!sim.periods.length) return { error: '还款表无法生成（请检查贷款参数）' };
  if (parseDayKey(date) == null) return { error: `日期不合法：${date}（YYYY-MM-DD）` };
  if (date < loan.startDate) return { error: `提前还款日期早于首期还款日（${loan.startDate}）` };
  const last = sim.periods[sim.periods.length - 1];
  if (date > last.date) return { error: `贷款已还清或超出还款期（末期为 ${last.date}）` };
  const eff = sim.periods.find((p) => p.date >= date);
  if (!eff) return { error: '找不到生效还款期' };
  if (!(amount >= PREPAY_MIN)) return { error: `金额至少 ${PREPAY_MIN} 元` };
  if (amount >= round2(eff.opening - 0.005)) {
    return { error: `金额达到该期余额（生效期 ${eff.date}，余额 ${fmtMoney(eff.opening)}）。全额结清请在贷款详情里停用并备注，提前还款请少还一点。` };
  }
  return { ok: true, effectiveDate: eff.date, balanceAtEff: eff.opening };
}

/**
 * whatif 三方案对比：基准 / 缩期(term) / 减供(payment)。
 * @returns {baseline, term, payment, effectiveDate}
 *   每方案：{remainingInterest, remainingMonths, endDate, nextPayment, feasible, infeasibleReason?}
 *   remainingInterest/remainingMonths 自生效期（含）起算，三口径同一分界，可直接相减。
 */
function whatifPrepay(loan, events, { date, amount }) {
  const v = validatePrepay(loan, events, { date, amount });
  if (v.error) return { error: v.error };
  const effDate = v.effectiveDate;
  const slice = (sim) => {
    const ps = sim.periods.filter((p) => p.date >= effDate);
    const ri = round2(ps.reduce((s, p) => s + p.interest, 0));
    return {
      remainingInterest: ri,
      remainingMonths: ps.length,
      endDate: ps.length ? ps[ps.length - 1].date : null,
      nextPayment: ps.length ? round2(ps[0].payment) : 0,
    };
  };
  const base = slice(simulate(loan, events));
  const termSim = simulate(loan, events, { type: 'prepay', loanId: loan.id, date: effDate, amount, mode: 'term', at: 0, note: '' });
  const paySim = simulate(loan, events, { type: 'prepay', loanId: loan.id, date: effDate, amount, mode: 'payment', at: 0, note: '' });
  const term = slice(termSim);
  const payment = slice(paySim);
  // bullet：缩期/减供同解（只减息不缩期）——如实合并口径
  const isBullet = loan.method === 'bullet';
  return {
    effectiveDate: effDate,
    balanceAtEff: round2(v.balanceAtEff),
    method: loan.method,
    bulletNote: isBullet ? '先息后本：提前还款只减少每月利息，到期日与到期还本额不变' : null,
    baseline: base,
    term: isBullet ? { ...term, sameAsPayment: true } : term,
    payment,
    saved: {
      term: round2(base.remainingInterest - term.remainingInterest),
      payment: round2(base.remainingInterest - payment.remainingInterest),
    },
  };
}

/** 下次重定价日（零投机：只按配置推导日期，不预测利率） */
function nextRepricing(loan, events, today) {
  if (!loan.repricing || loan.repricing.cycleMonths !== 12 && loan.repricing.cycleMonths !== 6 && loan.repricing.cycleMonths !== 3) return null;
  const t = parseDayKey(today);
  if (t == null) return null;
  let anchor;
  if (loan.repricing.day === 'anniversary') {
    const rateDates = (events || []).filter((e) => e.type === 'rate' && e.date <= today).map((e) => e.date).sort();
    anchor = rateDates.length ? rateDates[rateDates.length - 1] : loan.startDate;
  } else {
    // 固定 MM-DD：找今天之后的下一个该日
    const mm = +loan.repricing.day.slice(0, 2); const dd = +loan.repricing.day.slice(3, 5);
    const ty = new Date(t).getFullYear();
    const mk = (y) => {
      const dim = daysInMonth(y, mm - 1);
      return `${y}-${String(mm).padStart(2, '0')}-${String(Math.min(dd, dim)).padStart(2, '0')}`;
    };
    for (let y = ty; y <= ty + 2; y++) {
      const cand = mk(y);
      if (cand > today) return cand;
    }
    return null;
  }
  let next = addMonths(anchor, loan.repricing.cycleMonths);
  let guard = 0;
  while ((next == null || next <= today) && guard++ < 200) next = addMonths(next || anchor, loan.repricing.cycleMonths);
  return next;
}

/**
 * 状态投影：某日看这笔贷款。
 * @returns monthsPaid/totalMonths/nextPaymentDate/nextPaymentAmount/currentRate/
 *   remainingPrincipal/remainingInterest/paidInterest/paidPrincipal/paidPrepay/
 *   paidThisYearInterest/endDate/settled/nextRepricingDate/checkpoints[]
 */
function loanState(loan, events, now) {
  const today = dayKey(now);
  const sim = simulate(loan, events);
  const ps = sim.periods;
  const past = ps.filter((p) => p.date <= today);
  const future = ps.filter((p) => p.date > today);
  const sum = (arr, f) => round2(arr.reduce((s, p) => s + f(p), 0));
  const prepays = (events || []).filter((e) => e.type === 'prepay' && e.date <= today && e.date >= loan.startDate);
  const paidPrepay = sum(prepays, (e) => e.amount);
  const thisYear = today.slice(0, 4);
  const cps = (events || []).filter((e) => e.type === 'checkpoint')
    .map((e) => {
      const book = balanceAt(sim, e.date);
      return book == null ? null : {
        date: e.date, bank: round2(e.amount), book, drift: round2(e.amount - book), note: e.note || '',
      };
    }).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
  const curRate = (future.length ? future[0].rate : ps.length ? ps[ps.length - 1].rate : loan.annualRate);
  return {
    today,
    loanId: loan.id,
    active: loan.active !== false,
    monthsPaid: past.length,
    totalMonths: ps.length,
    nextPaymentDate: future.length ? future[0].date : null,
    nextPaymentAmount: future.length ? future[0].payment : null,
    currentRate: curRate,
    remainingPrincipal: past.length ? past[past.length - 1].closing : loan.principal,
    remainingInterest: sum(future, (p) => p.interest),
    paidInterest: sum(past, (p) => p.interest),
    paidPrincipal: round2(loan.principal - (past.length ? past[past.length - 1].closing : loan.principal)),
    paidPrepay,
    paidThisYearInterest: sum(past.filter((p) => p.date.startsWith(thisYear)), (p) => p.interest),
    endDate: ps.length ? ps[ps.length - 1].date : null,
    settled: ps.length > 0 && ps[ps.length - 1].date <= today,
    truncated: sim.truncated,
    nextRepricingDate: nextRepricing(loan, events, today),
    checkpoints: cps,
  };
}

/** 年度本息构成（面板柱图 + AI 复盘共用）；含提前还款计入当年本金 */
function yearlyBreakdown(loan, events) {
  const sim = simulate(loan, events);
  const map = new Map();
  for (const p of sim.periods) {
    const y = p.date.slice(0, 4);
    let row = map.get(y);
    if (!row) { row = { year: y, interest: 0, principal: 0, prepay: 0, paid: 0 }; map.set(y, row); }
    row.interest = round2(row.interest + p.interest);
    row.principal = round2(row.principal + p.principal);
    row.paid = round2(row.paid + p.payment);
    if (p.prepay) { row.prepay = round2(row.prepay + p.prepay); row.paid = round2(row.paid + p.prepay); }
  }
  return [...map.values()].sort((a, b) => (a.year < b.year ? -1 : 1));
}

/** 给 AI 的单行摘要 */
function describeLoan(loan) {
  return `${loan.name}（${KIND_NAMES[loan.kind] || loan.kind}·${METHOD_NAMES[loan.method] || loan.method}）` +
    ` 本金 ${fmtMoney(loan.principal)} @ ${fmtPct(loan.annualRate)} / ${loan.termMonths} 期` +
    `，首期 ${loan.startDate}${loan.lender ? `，${loan.lender}` : ''}${loan.groupId ? `，组「${loan.groupId}」` : ''}` +
    `${loan.repricing ? `，重定价 ${loan.repricing.day === 'anniversary' ? '放款对日' : '每年 ' + loan.repricing.day}/${loan.repricing.cycleMonths} 个月` : ''}` +
    `${loan.active === false ? '，【已结清/停用】' : ''}`;
}

/** 全家合计（面板总览 / quanfu_today 共用） */
function familyTotals(states) {
  const live = states.filter((s) => s && s.active !== false && !s.settled);
  const r2 = (x) => round2(x);
  return {
    monthlyPayment: r2(live.reduce((s, x) => s + (x.nextPaymentAmount || 0), 0)),
    remainingPrincipal: r2(live.reduce((s, x) => s + x.remainingPrincipal, 0)),
    remainingInterest: r2(live.reduce((s, x) => s + x.remainingInterest, 0)),
    paidThisYearInterest: r2(states.reduce((s, x) => s + x.paidThisYearInterest, 0)),
    loanCount: live.length,
    settledCount: states.filter((s) => s && s.settled).length,
  };
}

module.exports = {
  // 常量
  DAY_MS, METHODS, METHOD_NAMES, KINDS, KIND_NAMES, EVENT_TYPES, CYCLES,
  MAX_TERM_MONTHS, PREPAY_MIN,
  // 小件
  clip, idFor, randTag, round2, dayKey, parseDayKey, dayDiff, addMonths, fmtMoney, fmtPct,
  monthlyRate, annuityPmt, solvedN,
  // 规范化
  normalizeLoan, normalizeEvent, normalizeSettings,
  // 引擎
  simulate, balanceAt, validatePrepay, whatifPrepay, nextRepricing, loanState,
  yearlyBreakdown, describeLoan, familyTotals,
};
