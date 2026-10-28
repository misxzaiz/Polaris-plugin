#!/usr/bin/env node
'use strict';
/**
 * quanfu MCP Server —— 泉府的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现）
 * 中 quanfu.* 键空间的读写，并用 shared/core 现算还款表/状态/三方案对比。
 * 本进程零外网请求；派生量（还款表/状态/漂移）一律 core 现算，不落快照键。
 *
 * 工具一览（AI 侧约定：这是「家庭贷款记录与测算」，不构成金融建议——
 * 输出不推荐任何还款决策，只并列事实数字）：
 *   quanfu_today    全家贷款现状 + 临近事件（扣款/重定价/对账漂移）+ 家庭合计
 *   quanfu_add      建贷款（name/principal|principalWan/annualRate/method/termMonths/startDate…）
 *   quanfu_whatif   提前还款三方案对比（基准/缩期/减供，不落库）
 *   quanfu_log      记事件：rate(利率变更/重定价) / prepay(提前还款,mode必选) / checkpoint(银行剩余本金)
 *   quanfu_query    scope=loans|detail|events|schedule|yearly
 *   quanfu_update   改贷款参数（初始参数改动=账本如实重放）
 *   quanfu_delete   删贷款（confirm 门，连带事件）/ 删事件
 *
 * 金额双单位：principal/amount 用元；principalWan/amountWan 用万（Wan 优先，防换算错）。
 * 写幂等：事件 occKey = type|loanId|date，同日同型覆盖。
 */
const { createKvClient } = require('./kvclient');
const core = require('../shared/core');

const SERVER_NAME = 'quanfu';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (level, msg) => log(level, msg),
});

const K = {
  loan: (id) => `quanfu.loan.${id}`,
  loanPrefix: 'quanfu.loan.',
  ev: (occKey) => `quanfu.ev.${occKey}`,
  evPrefix: 'quanfu.ev.',
  settings: 'quanfu.settings',
};

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}
const DISCLAIMER = '（泉府只做贷款记录与测算：标准等额本息/等额本金/先息后本公式、逐期分级舍入，与银行实际计息可能有分级出入；不构成金融建议，提前还款前请核对合同违约金条款。）';

// ── 数据访问 ─────────────────────────────────────────────────────────────────
async function listLoans() {
  const keys = await kv.kvKeys();
  const mine = keys.filter((k) => k.startsWith(K.loanPrefix));
  const out = await Promise.all(mine.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' && v.id ? v : null;
  }));
  return out.filter(Boolean);
}
async function listEvents() {
  const keys = await kv.kvKeys();
  const mine = keys.filter((k) => k.startsWith(K.evPrefix));
  const out = await Promise.all(mine.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' && v.occKey === k.slice(K.evPrefix.length) ? v : null;
  }));
  return out.filter(Boolean);
}
function eventsFor(events, loanId) {
  return events.filter((e) => e.loanId === loanId).sort((a, b) => (a.date < b.date ? -1 : 1));
}
async function readSettings() {
  return core.normalizeSettings(await kv.kvGet(K.settings).catch(() => null));
}

function resolveAmount(args, key, wanKey) {
  const wan = args[wanKey];
  if (wan != null && Number.isFinite(+wan) && +wan > 0) return Math.round(+wan * 10000 * 100) / 100;
  if (args[key] != null && Number.isFinite(+args[key])) return Math.round(+args[key] * 100) / 100;
  return null;
}

function fmtStateLine(name, st) {
  const parts = [`${name}：`];
  if (st.settled) {
    parts.push(`已按计划结清（末期 ${st.endDate}）`);
  } else {
    parts.push(`已还 ${st.monthsPaid}/${st.totalMonths} 期`);
    parts.push(`剩余本金 ${core.fmtMoney(st.remainingPrincipal)}`);
    if (st.nextPaymentDate) parts.push(`下期 ${st.nextPaymentDate} 扣 ${core.fmtMoney(st.nextPaymentAmount)}`);
    parts.push(`当前利率 ${core.fmtPct(st.currentRate)}`);
    parts.push(`剩余总利息约 ${core.fmtMoney(st.remainingInterest)}`);
    parts.push(`计划结清 ${st.endDate}`);
  }
  if (st.paidThisYearInterest > 0) parts.push(`今年已付息 ${core.fmtMoney(st.paidThisYearInterest)}`);
  if (st.nextRepricingDate) parts.push(`下次重定价 ${st.nextRepricingDate}`);
  return parts.join('，');
}

function whatifText(w, amount) {
  const L = [];
  L.push(`生效期 ${w.effectiveDate}（该期期初余额 ${core.fmtMoney(w.balanceAtEff)}，提前还款 ${core.fmtMoney(amount)}）`);
  if (w.bulletNote) L.push(`⚠ ${w.bulletNote}`);
  const row = (label, s, saved) => {
    const bits = [
      `剩余总利息 ${core.fmtMoney(s.remainingInterest)}`,
      `剩余 ${s.remainingMonths} 期`,
      `结清 ${s.endDate}`,
    ];
    if (label !== '不提前还（基准）') bits.push(`下期月供 ${core.fmtMoney(s.nextPayment)}`);
    if (saved != null && saved > 0) bits.push(`比基准省息 ${core.fmtMoney(saved)}`);
    return `  ${label}：${bits.join('，')}`;
  };
  L.push(row('不提前还（基准）', w.baseline, null));
  L.push(row('缩期（月供基本不变，期限缩短）', w.term, w.saved.term));
  L.push(row('减月供（期限不变，月供降低）', w.payment, w.saved.payment));
  L.push('事实对比：同样一笔钱，缩期通常省息更多、减月供现金流更松——选哪个取决于你的现金流与合同条款，泉府不代作决定。');
  return L.join('\n');
}

// ── 工具实现 ─────────────────────────────────────────────────────────────────
async function toolToday() {
  const [loans, events, settings] = await Promise.all([listLoans(), listEvents(), readSettings()]);
  if (!loans.length) {
    return ok('泉府还没有贷款台账。请用 quanfu_add 建档，或引导用户说「我有一笔 100 万 30 年等额本息 3.6% 的房贷，2021 年 3 月开始还」。\n' + DISCLAIMER);
  }
  const now = Date.now();
  const today = core.dayKey(now);
  const sections = [];
  const alerts = [];
  const states = [];
  for (const loan of loans.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))) {
    if (loan.active === false) {
      sections.push(`${loan.name}：【已停用/结清记录保留】`);
      continue;
    }
    const evs = eventsFor(events, loan.id);
    const st = core.loanState(loan, evs, now);
    states.push(st);
    sections.push(fmtStateLine(loan.name, st));
    // 临近事件
    if (!st.settled && st.nextPaymentDate) {
      const d = core.dayDiff(st.nextPaymentDate, today);
      if (d != null && d >= 0 && d <= settings.warnDays) {
        alerts.push(`📅 ${loan.name} 将于 ${st.nextPaymentDate}（${d === 0 ? '今天' : `${d} 天后`}）扣款 ${core.fmtMoney(st.nextPaymentAmount)}`);
      }
    }
    if (st.nextRepricingDate) {
      const d = core.dayDiff(st.nextRepricingDate, today);
      if (d != null && d >= 0 && d <= settings.repricingWarnDays) {
        alerts.push(`🔁 ${loan.name} 将于 ${st.nextRepricingDate} 重定价（${d === 0 ? '今天' : `${d} 天后`}）——到时把新利率告诉 AI（quanfu_log type=rate）`);
      }
    }
    const lastCp = st.checkpoints[st.checkpoints.length - 1];
    if (lastCp && Math.abs(lastCp.drift) > settings.driftWarn) {
      alerts.push(`⚖ ${loan.name} 对账漂移：${lastCp.date} 银行口径 ${core.fmtMoney(lastCp.bank)} vs 账面 ${core.fmtMoney(lastCp.book)}（差 ${core.fmtMoney(lastCp.drift)}）——可能漏记了利率变更或提前还款`);
    }
    if (st.truncated) alerts.push(`⚠ ${loan.name} 还款表异常（参数矛盾），请检查期数/月供可行性`);
  }
  const totals = core.familyTotals(states);
  const head = `家庭贷款合计：月供 ${core.fmtMoney(totals.monthlyPayment)}，剩余本金 ${core.fmtMoney(totals.remainingPrincipal)}，剩余总利息约 ${core.fmtMoney(totals.remainingInterest)}，今年已付息 ${core.fmtMoney(totals.paidThisYearInterest)}（在还 ${totals.loanCount} 笔）`;
  const out = [`${today} 贷款台账`, head, '', ...sections];
  if (alerts.length) out.push('', '临近与异常：', ...alerts.map((a) => '  ' + a));
  return ok(out.join('\n') + '\n' + DISCLAIMER);
}

async function toolAdd(args) {
  const principal = resolveAmount(args, 'principal', 'principalWan');
  const r = core.normalizeLoan({
    name: args.name, kind: args.kind, method: args.method,
    principal: principal != null ? principal : undefined,
    annualRate: args.annualRate, startDate: args.startDate, termMonths: args.termMonths,
    repricing: args.repricing, groupId: args.groupId, lender: args.lender, note: args.note,
  }, null);
  if (r.error) return err(r.error);
  const loans = await listLoans();
  const dup = loans.find((l) => l.name === r.loan.name);
  if (dup) return err(`已存在同名贷款「${r.loan.name}」（id=${dup.id}）。如需调整请用 quanfu_update；组合贷请用不同名称（如「商贷」「公积金」）+ 相同 groupId。`);
  await kv.kvSet(K.loan(r.loan.id), r.loan);
  const now = Date.now();
  const st = core.loanState(r.loan, [], now);
  const L = [
    `已建贷款：${core.describeLoan(r.loan)}（id=${r.loan.id}）`,
    `按参数推算：月供 ${core.fmtMoney(st.nextPaymentAmount)}（首期 ${st.nextPaymentDate}），总利息约 ${core.fmtMoney(roundAdd(st.paidInterest, st.remainingInterest))}，计划结清 ${st.endDate}`,
  ];
  if (st.monthsPaid > 0) {
    L.push(`该贷款起于 ${r.loan.startDate}，按 ${st.monthsPaid} 期已还推算当前剩余本金 ${core.fmtMoney(st.remainingPrincipal)}——建议让用户提供银行 App 的实际剩余本金（quanfu_log type=checkpoint）对一次账。`);
  }
  return ok(L.join('\n') + '\n' + DISCLAIMER);
}
function roundAdd(a, b) { return Math.round((a + b) * 100) / 100; }

async function toolWhatif(args) {
  const loans = await listLoans();
  const loan = args.loanId
    ? loans.find((l) => l.id === args.loanId)
    : (args.loanName ? loans.find((l) => l.name === args.loanName) : null);
  if (!loan) {
    return err(`找不到贷款（${args.loanId || args.loanName || '未指定'}）。quanfu_today 可看现有贷款。`);
  }
  const amount = resolveAmount(args, 'amount', 'amountWan');
  if (amount == null) return err('需提供金额：amountWan=20（万）或 amount=200000（元）');
  const events = eventsFor(await listEvents(), loan.id);
  const w = core.whatifPrepay(loan, events, {
    date: args.date ? String(args.date) : core.dayKey(Date.now()),
    amount,
  });
  if (w.error) return err(w.error);
  return ok(`「${loan.name}」提前还款测算\n${whatifText(w, amount)}\n${DISCLAIMER}`);
}

async function toolLog(args) {
  const type = String(args.type || '');
  if (!['rate', 'prepay', 'checkpoint'].includes(type)) {
    return err('type 必填：rate(利率变更/重定价) / prepay(提前还款) / checkpoint(银行剩余本金对账)');
  }
  const loans = await listLoans();
  const loan = args.loanId
    ? loans.find((l) => l.id === args.loanId)
    : (args.loanName ? loans.find((l) => l.name === args.loanName) : null);
  if (!loan) return err(`找不到贷款（${args.loanId || args.loanName || '未指定'}）`);
  const date = args.date ? String(args.date) : core.dayKey(Date.now());
  if (type === 'prepay') {
    const amount = resolveAmount(args, 'amount', 'amountWan');
    if (amount == null) return err('需提供金额：amountWan=10（万）或 amount=100000（元）');
    const events = eventsFor(await listEvents(), loan.id);
    const v = core.validatePrepay(loan, events, { date, amount });
    if (v.error) return err(v.error);
    const r = core.normalizeEvent({ type, loanId: loan.id, date, amount, mode: args.mode, note: args.note }, null);
    if (r.error) return err(r.error);
    await kv.kvSet(K.ev(r.ev.occKey), r.ev);
    const w = core.whatifPrepay(loan, events, { date: v.effectiveDate, amount });
    const L = [
      `已记录提前还款：${loan.name} ${core.fmtMoney(amount)}（${args.mode === 'term' ? '缩期' : '减月供'}），生效期 ${v.effectiveDate}`,
    ];
    if (!w.error) {
      L.push(`效果：剩余 ${w.payment.remainingMonths} 期（原 ${w.baseline.remainingMonths}），结清 ${w.payment.endDate}（原 ${w.baseline.endDate}），比不还省息 ${core.fmtMoney(w.saved[args.mode === 'term' ? 'term' : 'payment'])}`);
      L.push(`新计划：下期 ${core.fmtMoney(args.mode === 'payment' ? w.payment.nextPayment : w.baseline.nextPayment)}${args.mode === 'term' ? '（月供不变）' : '（月供已降）'}，剩余本金 ${core.fmtMoney(Math.round((v.balanceAtEff - amount) * 100) / 100)}`);
    }
    return ok(L.join('\n') + '\n（账本已按此重放；几秒后面板同步。）');
  }
  if (type === 'rate') {
    const r = core.normalizeEvent({ type, loanId: loan.id, date, rate: args.rate, note: args.note }, null);
    if (r.error) return err(r.error);
    if (date < loan.startDate) return err(`日期早于首期还款日（${loan.startDate}）。重定价/利率变更请填新利率生效的第一期还款日。`);
    await kv.kvSet(K.ev(r.ev.occKey), r.ev);
    const st = core.loanState(loan, eventsFor(await listEvents(), loan.id), Date.now());
    return ok([
      `已记录利率变更：${loan.name} 自 ${date} 起 ${core.fmtPct(r.ev.rate)}`,
      `重放后：下期月供 ${core.fmtMoney(st.nextPaymentAmount)}（${st.nextPaymentDate}），剩余总利息约 ${core.fmtMoney(st.remainingInterest)}，结清 ${st.endDate}`,
    ].join('\n') + '\n' + DISCLAIMER);
  }
  // checkpoint
  const amount = resolveAmount(args, 'amount', 'amountWan');
  if (amount == null) return err('需提供银行口径剩余本金：amountWan=65（万）或 amount=650000（元）');
  const r = core.normalizeEvent({ type, loanId: loan.id, date, amount, note: args.note }, null);
  if (r.error) return err(r.error);
  await kv.kvSet(K.ev(r.ev.occKey), r.ev);
  const st = core.loanState(loan, eventsFor(await listEvents(), loan.id), Date.now());
  const cp = st.checkpoints[st.checkpoints.length - 1];
  const L = [`已记录对账点：${loan.name} ${date} 银行口径剩余本金 ${core.fmtMoney(cp.bank)}`];
  if (Math.abs(cp.drift) <= 0.01) L.push('✅ 与账面完全一致。');
  else if (Math.abs(cp.drift) <= (await readSettings()).driftWarn) {
    L.push(`与账面差 ${core.fmtMoney(cp.drift)}（分级舍入内的正常差异）。`);
  } else {
    L.push(`⚖ 与账面差 ${core.fmtMoney(cp.drift)}：多半是漏记了利率变更（quanfu_log type=rate）或某笔提前还款（type=prepay），补记后漂移会收敛。`);
  }
  return ok(L.join('\n'));
}

async function toolQuery(args) {
  const scope = String(args.scope || 'loans');
  const loans = await listLoans();
  if (scope === 'loans') {
    if (!loans.length) return ok('暂无贷款。');
    return ok(loans.map((l) => `[${l.id}] ${core.describeLoan(l)}`).join('\n'));
  }
  const loan = args.loanId
    ? loans.find((l) => l.id === args.loanId)
    : (args.loanName ? loans.find((l) => l.name === args.loanName) : null);
  if (!loan) return err(`找不到贷款（${args.loanId || args.loanName || '未指定'}）`);
  const events = eventsFor(await listEvents(), loan.id);
  const now = Date.now();
  if (scope === 'detail') {
    const st = core.loanState(loan, events, now);
    const L = [
      `[${loan.id}] ${core.describeLoan(loan)}`,
      loan.note ? `备注：${loan.note}` : '',
      `状态：已还 ${st.monthsPaid}/${st.totalMonths} 期，剩余本金 ${core.fmtMoney(st.remainingPrincipal)}，当前利率 ${core.fmtPct(st.currentRate)}`,
      `下次扣款 ${st.nextPaymentDate || '—'} ${core.fmtMoney(st.nextPaymentAmount)}；已付利息 ${core.fmtMoney(st.paidInterest)} + 本金 ${core.fmtMoney(st.paidPrincipal)}${st.paidPrepay ? ` + 提前还款 ${core.fmtMoney(st.paidPrepay)}` : ''}；今年已付息 ${core.fmtMoney(st.paidThisYearInterest)}`,
      `剩余总利息约 ${core.fmtMoney(st.remainingInterest)}，计划结清 ${st.endDate || '—'}`,
      st.nextRepricingDate ? `下次重定价：${st.nextRepricingDate}` : '',
      st.checkpoints.length ? `最近对账：${st.checkpoints[st.checkpoints.length - 1].date} 银行 ${core.fmtMoney(st.checkpoints[st.checkpoints.length - 1].bank)} vs 账面 ${core.fmtMoney(st.checkpoints[st.checkpoints.length - 1].book)}（差 ${core.fmtMoney(st.checkpoints[st.checkpoints.length - 1].drift)}）` : '尚无对账点（建议用银行 App 实际余额对一次账）',
      events.length ? `事件 ${events.length} 笔（quanfu_query scope=events 看流水）` : '尚无利率变更/提前还款/对账记录',
    ].filter(Boolean);
    return ok(L.join('\n') + '\n' + DISCLAIMER);
  }
  if (scope === 'events') {
    if (!events.length) return ok('该贷款暂无事件。');
    const L = events.slice().reverse().map((e) => {
      if (e.type === 'rate') return `${e.date} 利率变更为 ${core.fmtPct(e.rate)}（occKey=${e.occKey}）`;
      if (e.type === 'prepay') return `${e.date} 提前还款 ${core.fmtMoney(e.amount)}（${e.mode === 'term' ? '缩期' : '减月供'}，occKey=${e.occKey}）`;
      return `${e.date} 对账：银行剩余本金 ${core.fmtMoney(e.amount)}（occKey=${e.occKey}）`;
    });
    return ok(L.slice(0, 100).join('\n') + (L.length > 100 ? `\n（仅最近 100 条，共 ${L.length} 条）` : ''));
  }
  if (scope === 'schedule') {
    const months = Math.max(1, Math.min(60, Math.floor(+args.months || 12)));
    const sim = core.simulate(loan, events);
    const today = core.dayKey(now);
    const upcoming = sim.periods.filter((p) => p.date >= today).slice(0, months);
    if (!upcoming.length) return ok('该贷款已按计划还清。');
    const L = upcoming.map((p) =>
      `${p.date} 期${p.k}：还 ${core.fmtMoney(p.payment)}（本金 ${core.fmtMoney(p.principal)} + 利息 ${core.fmtMoney(p.interest)}），余额 ${core.fmtMoney(p.closing)}${p.prepay ? `，含提前还款 ${core.fmtMoney(p.prepay)}` : ''}`);
    return ok(`「${loan.name}」未来 ${months} 期还款表\n${L.join('\n')}\n（当前利率 ${core.fmtPct(upcoming[0].rate)}；未来利率如有重定价会变，重定价日在 ${core.nextRepricing(loan, events, today) || '未配置'}。）`);
  }
  if (scope === 'yearly') {
    const rows = core.yearlyBreakdown(loan, events);
    const L = rows.map((r) => `${r.year}：付息 ${core.fmtMoney(r.interest)} / 还本 ${core.fmtMoney(r.principal)}${r.prepay ? ` / 提前还 ${core.fmtMoney(r.prepay)}` : ''}，合计支出 ${core.fmtMoney(r.paid)}`);
    return ok(`「${loan.name}」年度本息构成\n${L.join('\n')}\n${DISCLAIMER}`);
  }
  return err(`scope 不合法：${scope}（loans/detail/events/schedule/yearly）`);
}

async function toolUpdate(args) {
  const id = String(args.id || '').trim();
  if (!id) return err('需提供 id');
  const prev = await kv.kvGet(K.loan(id)).catch(() => null);
  if (!prev) return err(`找不到贷款 ${id}`);
  const patch = args.patch && typeof args.patch === 'object' ? args.patch : {};
  const principal = patch.principalWan != null ? Math.round(+patch.principalWan * 10000 * 100) / 100
    : (patch.principal != null ? Math.round(+patch.principal * 100) / 100 : undefined);
  const r = core.normalizeLoan({
    name: patch.name, kind: patch.kind, method: patch.method,
    principal, annualRate: patch.annualRate, startDate: patch.startDate, termMonths: patch.termMonths,
    repricing: patch.repricing, groupId: patch.groupId, lender: patch.lender,
    note: patch.note, active: patch.active,
  }, prev);
  if (r.error) return err(r.error);
  await kv.kvSet(K.loan(id), r.loan);
  const st = core.loanState(r.loan, eventsFor(await listEvents(), id), Date.now());
  const warnings = [];
  if (patch.annualRate != null || patch.principal != null || patch.principalWan != null || patch.termMonths != null || patch.method || patch.startDate) {
    warnings.push('初始参数改动会让整个还款表如实重放——历史对账点可能显示漂移，属预期。利率调整建议改用 quanfu_log type=rate（保留历史）。');
  }
  if (patch.active === false) warnings.push('已停用（结清/转出）：不再计入合计与提醒，历史保留，可随时 active:true 恢复。');
  return ok([
    `已更新贷款：${core.describeLoan(r.loan)}`,
    `重放后：剩余本金 ${core.fmtMoney(st.remainingPrincipal)}，下期 ${core.fmtMoney(st.nextPaymentAmount)}（${st.nextPaymentDate || '—'}），结清 ${st.endDate || '—'}`,
    ...warnings,
  ].join('\n') + '\n' + DISCLAIMER);
}

async function toolDelete(args) {
  const kind = String(args.kind || 'loan');
  const id = String(args.id || '').trim();
  if (!id) return err('需提供 id');
  if (args.confirm !== true) return err('删除需显式 confirm=true（不可逆）。');
  if (kind === 'loan') {
    const prev = await kv.kvGet(K.loan(id)).catch(() => null);
    if (!prev) return err(`找不到贷款 ${id}`);
    // occKey = type|loanId|date：loanId 在中段，按段解析（勿用 endsWith）
    const keys = await kv.kvKeys();
    const evKeys = keys.filter((k) => {
      if (!k.startsWith(K.evPrefix)) return false;
      const parts = k.slice(K.evPrefix.length).split('|');
      return parts.length >= 3 && parts[1] === id;
    });
    for (const k of evKeys) await kv.kvDel(k);
    await kv.kvDel(K.loan(id));
    return ok(`已删除贷款「${prev.name}」及 ${evKeys.length} 条事件记录。`);
  }
  if (kind === 'event') {
    const occKey = id;
    const prev = await kv.kvGet(K.ev(occKey)).catch(() => null);
    if (!prev) return err(`找不到事件 ${occKey}（格式 type|loanId|YYYY-MM-DD，quanfu_query scope=events 可查）`);
    await kv.kvDel(K.ev(occKey));
    return ok(`已删除事件：${prev.type} @ ${prev.date}（${prev.note || '无备注'}）。还款表已按剩余事件重放。`);
  }
  return err(`kind 不合法：${kind}（loan/event）`);
}

// ── 工具清单 ─────────────────────────────────────────────────────────────────
const METHOD_HINT = 'annuity(等额本息)｜linear(等额本金)｜bullet(先息后本)';
const KIND_HINT = 'mortgage(房贷)｜car(车贷)｜consumer(消费贷)｜business(经营贷)｜other';
const AMOUNT_HINT = '金额双单位：*Wan 用万（推荐，如 20 万=amountWan:20），无 Wan 后缀用元';

const tools = [
  {
    name: 'quanfu_today',
    description: '泉府·今日台账：全家每笔贷款的进度（已还期数/剩余本金/下期扣款/当前利率/剩余总利息/结清日）、临近事件（扣款日、重定价日、对账漂移）与家庭合计。用户问「我还欠多少」「下月供多少」「什么时候还完」时用。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'quanfu_add',
    description: '泉府·建贷款：用户说「我有一笔 100 万 30 年等额本息 3.6% 的房贷，2021 年 3 月开始还」→ name=商贷, principalWan=100, annualRate=3.6, method=annuity, termMonths=360, startDate=2021-03-01。startDate=第一期还款日（不是放款日）；组合贷（公积金+商贷）分两笔建、同名 groupId 归组；已有 repricing 时传 {day:"01-01"|"anniversary", cycleMonths:12|6|3}。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '贷款名，如 商贷/公积金/车贷' },
        principalWan: { type: 'number', description: '本金（万）' },
        principal: { type: 'number', description: '本金（元），Wan 优先' },
        annualRate: { type: 'number', description: '年利率 %（如 3.6）' },
        method: { type: 'string', enum: ['annuity', 'linear', 'bullet'], description: METHOD_HINT },
        termMonths: { type: 'number', description: '总期数（月）' },
        startDate: { type: 'string', description: '第一期还款日 YYYY-MM-DD' },
        kind: { type: 'string', enum: ['mortgage', 'car', 'consumer', 'business', 'other'], description: KIND_HINT },
        lender: { type: 'string', description: '放贷机构（可选）' },
        repricing: { type: 'object', description: '重定价配置 {day:"MM-DD"|"anniversary", cycleMonths:3|6|12}' },
        groupId: { type: 'string', description: '组合贷归组名（如 home）' },
        note: { type: 'string', description: '备注' },
      },
      required: ['name', 'annualRate', 'method', 'termMonths', 'startDate'],
    },
  },
  {
    name: 'quanfu_whatif',
    description: '泉府·提前还款测算（不落库）：对已有贷款并列「基准/缩期/减月供」三方案——剩余总利息、省息、月供变化、期限变化、新结清日。用户说「提前还 20 万缩期还是减月供」「还 10 万能省多少利息」时用。先 quanfu_today 拿贷款名/id。',
    inputSchema: {
      type: 'object',
      properties: {
        loanId: { type: 'string' }, loanName: { type: 'string' },
        amountWan: { type: 'number', description: '提前还款金额（万）' },
        amount: { type: 'number', description: '提前还款金额（元），Wan 优先' },
        date: { type: 'string', description: '生效基准日 YYYY-MM-DD，缺省今天（实际在其后第一个扣款日生效）' },
      },
    },
  },
  {
    name: 'quanfu_log',
    description: '泉府·记事件：type=rate 记利率变更/重定价（date=新利率生效的第一期还款日，rate=新年利率%）；type=prepay 记提前还款（mode 必填：term 缩期/payment 减月供——用户没说就先用 quanfu_whatif 给出对比再问）；type=checkpoint 记银行 App 里的实际剩余本金对账。用户说「这个月重定价了 3.3%」「提前还了 10 万选的缩期」「银行说我剩 65 万」时用。',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['rate', 'prepay', 'checkpoint'] },
        loanId: { type: 'string' }, loanName: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD，缺省今天' },
        rate: { type: 'number', description: '（rate）新年利率 %' },
        amountWan: { type: 'number', description: '（prepay/checkpoint）金额（万）' },
        amount: { type: 'number', description: '（prepay/checkpoint）金额（元），Wan 优先' },
        mode: { type: 'string', enum: ['term', 'payment'], description: '（prepay）缩期/减月供' },
        note: { type: 'string' },
      },
      required: ['type'],
    },
  },
  {
    name: 'quanfu_query',
    description: '泉府·查询：scope=loans 贷款清单｜detail 单笔详情（含最近对账漂移）｜events 事件流水｜schedule 未来还款表（默认 12 期，可 months）｜yearly 年度本息构成。用户问「月供里利息占多少」「未来几个月还多少」「每年利息多少」时用。',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['loans', 'detail', 'events', 'schedule', 'yearly'] },
        loanId: { type: 'string' }, loanName: { type: 'string' },
        months: { type: 'number', description: '（schedule）期数 1-60，默认 12' },
      },
      required: ['scope'],
    },
  },
  {
    name: 'quanfu_update',
    description: '泉府·修改贷款参数：id + patch。改 name/lender/kind/note/groupId/repricing 无副作用；改 principal/annualRate/method/termMonths/startDate 会整表如实重放（历史利率调整请用 quanfu_log type=rate 而不是直接改初始利率）；active:false 停用（结清/转出，保留历史）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patch: { type: 'object', description: '要改的字段（形态同 quanfu_add；active:false=停用）' },
      },
      required: ['id', 'patch'],
    },
  },
  {
    name: 'quanfu_delete',
    description: '泉府·删除（需 confirm=true）：kind=loan 删贷款及全部事件；kind=event 删单条事件（id=occKey，误记的利率/提前还款/对账用）。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['loan', 'event'] },
        id: { type: 'string' },
        confirm: { type: 'boolean' },
      },
      required: ['kind', 'id', 'confirm'],
    },
  },
];

const HANDLERS = {
  quanfu_today: toolToday,
  quanfu_add: toolAdd,
  quanfu_whatif: toolWhatif,
  quanfu_log: toolLog,
  quanfu_query: toolQuery,
  quanfu_update: toolUpdate,
  quanfu_delete: toolDelete,
};

// ── stdio JSON-RPC 主循环 ────────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) { log('warn', `非 JSON 行：${e.message}`); continue; }
    handleMessage(msg).catch((e) => {
      log('error', `处理异常：${e.stack || e.message}`);
      if (msg && msg.id != null) send({ jsonrpc: '2.0', id: msg.id, result: err(`内部错误：${e.message}`) });
    });
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools } });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const fn = HANDLERS[name];
    if (!fn) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const r = await fn(args);
      send({ jsonrpc: '2.0', id: msg.id, result: r });
    } catch (e) {
      log('error', `工具 ${name} 失败：${e.stack || e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`${e.message}（若为桥连接问题，请确认 Polaris 正在运行）`) });
    }
    return;
  }
  if (msg.method === 'ping') { send({ jsonrpc: '2.0', id: msg.id, result: {} }); return; }
  if (msg.id != null) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `方法不存在：${msg.method}` } });
}

log('info', `quanfu mcp server v${SERVER_VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
