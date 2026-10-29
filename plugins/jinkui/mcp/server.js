#!/usr/bin/env node
'use strict';
/**
 * jinkui MCP Server —— 保单台账的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现）
 * 中 jinkui.* 键空间的读写，并用 shared/core 现算缴费进度/状态机/缺口矩阵。
 * 本进程零外网请求；派生量一律 core 现算，不落快照键（无服务进程，纯 kv）。
 *
 * 工具一览（AI 侧约定：这是「家庭保单记录与现状透视」，不构成投保建议——
 * 输出不推荐任何产品，只并列事实与缺口）：
 *   jinkui_today    缴费红黄榜（宽限期/中止期红、warnDays 内黄）+ 等待期 + 满期 + 家庭合计 + 缺口速览
 *   jinkui_add      entity=member 建成员 / entity=policy 建保单（insured 传成员名自动配档）
 *   jinkui_log      记事件：pay(缴费) / claim(理赔) / endorse(批改) / reinstate(复效) / surrender(退保) / other
 *   jinkui_query    scope=policies|detail|events|calendar|gap|stats
 *   jinkui_update   改成员/保单（kind + id + patch）
 *   jinkui_delete   删保单（confirm 门，连带事件）/ 删成员（名下有保单拒删）/ 删事件
 *
 * 保额双单位：coverage 用元、coverageWan 用万（Wan 优先，防换算错）。
 * 写幂等：事件 occKey = type|policyId|date，同日同型覆盖。
 */
const { createKvClient } = require('./kvclient');
const core = require('../shared/core');

const SERVER_NAME = 'jinkui';
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
  member: (id) => `jinkui.member.${id}`,
  memberPrefix: 'jinkui.member.',
  policy: (id) => `jinkui.policy.${id}`,
  policyPrefix: 'jinkui.policy.',
  ev: (occKey) => `jinkui.ev.${occKey}`,
  evPrefix: 'jinkui.ev.',
  settings: 'jinkui.settings',
};

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}
const DISCLAIMER = '（保单台账只做保单记录与现状透视：状态/宽限期/缺口为台账口径投影，与保司实际条款可能有出入；不构成投保建议，退保/复效/理赔以保司合同与客服为准。）';

// ── 数据访问 ─────────────────────────────────────────────────────────────────
async function listMembers() {
  const keys = await kv.kvKeys();
  const mine = keys.filter((k) => k.startsWith(K.memberPrefix));
  const out = await Promise.all(mine.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' && v.id ? v : null;
  }));
  return out.filter(Boolean);
}
async function listPolicies() {
  const keys = await kv.kvKeys();
  const mine = keys.filter((k) => k.startsWith(K.policyPrefix));
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
async function readSettings() {
  return core.normalizeSettings(await kv.kvGet(K.settings).catch(() => null));
}
function memberName(members, id) {
  const m = members.find((x) => x.id === id);
  return m ? m.name : '未知成员';
}

/** 按名取成员（不存在即建，relation 可带；幂等） */
async function ensureMember(name, relation) {
  const members = await listMembers();
  const found = members.find((m) => m.name === name);
  if (found) return { member: found, created: false };
  const r = core.normalizeMember({ name, relation: relation || 'other' }, null);
  if (r.error) throw new Error(r.error);
  await kv.kvSet(K.member(r.member.id), r.member);
  return { member: r.member, created: true };
}

/** 解析保单：id 精确 → name 精确（多同名报错提示用 id） */
async function resolvePolicy(args) {
  const policies = await listPolicies();
  if (args.policyId) {
    const p = policies.find((x) => x.id === args.policyId);
    if (!p) return { error: `找不到保单 ${args.policyId}（jinkui_query scope=policies 可查）` };
    return { policy: p, policies };
  }
  if (args.policyName) {
    const hits = policies.filter((x) => x.name === args.policyName);
    if (hits.length === 0) return { error: `找不到名为「${args.policyName}」的保单（jinkui_query scope=policies 可查）` };
    if (hits.length > 1) {
      return { error: `有 ${hits.length} 张同名保单「${args.policyName}」，请用 policyId 指定：${hits.map((h) => h.id).join('、')}（jinkui_query scope=policies 可区分）` };
    }
    return { policy: hits[0], policies };
  }
  return { error: '需提供 policyId 或 policyName（jinkui_query scope=policies 可查）' };
}

function resolveCoverage(args, key, wanKey) {
  const wan = args[wanKey];
  if (wan != null && Number.isFinite(+wan) && +wan > 0) return Math.round(+wan * 10000 * 100) / 100;
  if (args[key] != null && Number.isFinite(+args[key])) return Math.round(+args[key] * 100) / 100;
  return undefined;
}

function fmtAlertDate(d) {
  return d === 0 ? '今天' : d === 1 ? '明天' : `${d} 天后`;
}

// ── 工具实现 ─────────────────────────────────────────────────────────────────
async function toolToday() {
  const [policies, events, members, settings] = await Promise.all([listPolicies(), listEvents(), listMembers(), readSettings()]);
  if (!policies.length) {
    return ok('保单台账还没有保单台账。请用 jinkui_add entity=policy 建档，或引导用户说「给娃买了份 50 万的重疾，平安的，年缴 4000 缴 20 年，2023 年 5 月生效」。\n' + DISCLAIMER);
  }
  const now = Date.now();
  const today = core.dayKey(now);
  const lines = [];
  const reds = [];
  const yellows = [];
  const infos = [];
  const states = [];
  for (const p of policies.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))) {
    const evs = core.eventsFor(events, p.id);
    const st = core.policyStatus(p, evs, settings, now);
    states.push({ policy: p, st });
    const insured = memberName(members, p.insuredId);
    if (st.state === 'surrendered') {
      infos.push(`☐ ${insured} 的「${p.name}」已退保（${st.surrenderDate}）——仅留档`);
      continue;
    }
    if (st.state === 'terminated') {
      infos.push(`☐ ${insured} 的「${p.name}」已终止——仅留档`);
      continue;
    }
    if (st.state === 'matured') {
      infos.push(`☐ ${insured} 的「${p.name}」已满期（${p.endDate || st.paidUntil}）——如续保了新单请另建档`);
      continue;
    }
    if (st.state === 'lapse') {
      reds.push(`🔴 ${insured} 的「${p.name}」处于中止期：出险不赔！${st.graceEnd ? `复效窗口约至 ${core.addDays(st.graceEnd, core.REINSTATE_WINDOW_DAYS)}` : ''}，联系保司办复效后用 jinkui_log type=reinstate 记复效日`);
      continue;
    }
    if (st.state === 'grace') {
      reds.push(`🔴 ${insured} 的「${p.name}」缴费已逾期（应缴 ${st.nextPayDate}），宽限期至 ${st.graceEnd}——保障仍有效，尽快补缴（jinkui_log type=pay date=${st.nextPayDate}）`);
      continue;
    }
    if (st.state === 'waiting') {
      infos.push(`⏳ ${insured} 的「${p.name}」等待期中（至 ${st.waitingEnd}）——等待期内出险通常不赔`);
      continue;
    }
    if (st.nextPayDate && st.daysToPay != null && st.daysToPay >= 0 && st.daysToPay <= settings.warnDays) {
      yellows.push(`🟡 ${insured} 的「${p.name}」${fmtAlertDate(st.daysToPay)}（${st.nextPayDate}）缴费${p.premium != null ? ` ${core.fmtMoney(p.premium)}` : ''}`);
      continue;
    }
    if (p.endDate && st.state === 'active') {
      const dEnd = core.dayDiff(p.endDate, today);
      if (dEnd != null && dEnd >= 0 && dEnd <= settings.warnDays) {
        yellows.push(`🟡 ${insured} 的「${p.name}」${fmtAlertDate(dEnd)}（${p.endDate}）满期`);
      }
    }
  }
  const totals = core.familyTotals(policies, events, settings, now);
  const gap = core.gapMatrix(members, policies, events, settings, now);
  const gapBits = gap.rows.filter((r) => r.missing.length).map((r) => `${r.name}缺${r.missing.map((k) => core.KIND_NAMES[k]).join('/')}`);
  lines.push(`${today} 家庭保单台账：在保 ${totals.activeCount}/${totals.policyCount} 张，年缴保费约 ${core.fmtMoney(totals.annualizedPremium)}，累计已缴 ${core.fmtMoney(totals.totalPaid)}，累计理赔 ${core.fmtMoney(totals.totalClaim)}`);
  if (gapBits.length) lines.push(`缺口速览：${gapBits.join('；')}（jinkui_query scope=gap 看矩阵）`);
  else if (policies.length > 1) lines.push('缺口速览：四大件（医疗/重疾/寿险/意外）在册成员暂无缺格。');
  if (reds.length) lines.push('', '红榜（保障风险）：', ...reds);
  if (yellows.length) lines.push('', '黄榜（临近缴费/满期）：', ...yellows);
  if (infos.length) lines.push('', '其他：', ...infos);
  return ok(lines.join('\n') + '\n' + DISCLAIMER);
}

async function toolAdd(args) {
  const entity = String(args.entity || 'policy');
  if (entity === 'member') {
    const r = core.normalizeMember({ name: args.name, relation: args.relation, birthYear: args.birthYear, note: args.note }, null);
    if (r.error) return err(r.error);
    const members = await listMembers();
    const dup = members.find((m) => m.name === r.member.name);
    if (dup) return err(`已存在成员「${r.member.name}」（id=${dup.id}），无需重建。`);
    await kv.kvSet(K.member(r.member.id), r.member);
    return ok(`已建成员：${r.member.name}（${core.RELATION_NAMES[r.member.relation] || r.member.relation}，id=${r.member.id}）。建保单时被保人直接填这个名字即可。`);
  }

  // entity=policy：insured 传成员名自动配档（qingnang 范式）
  let insuredId = String(args.insuredId || '').trim();
  if (!insuredId) {
    const insuredName = core.clip(args.insured, 40);
    if (!insuredName) return err('被保险人必填：insured（成员名，自动建档）或 insuredId');
    let ensured;
    try {
      ensured = await ensureMember(insuredName, args.relation);
    } catch (e) {
      return err(e.message);
    }
    const prelude = ensured.created
      ? `已自动建成员「${ensured.member.name}」(${ensured.member.id})${ensured.member.relation === 'other' ? '；如关系不对可用 jinkui_update kind=member 调整' : ''}`
      : `配到已有成员「${ensured.member.name}」`;
    return finishPolicyCreate(args, ensured.member.id, prelude);
  }
  return finishPolicyCreate(args, insuredId, '');
}

async function finishPolicyCreate(args, insuredId, prelude) {
  const coverage = resolveCoverage(args, 'coverage', 'coverageWan');
  const r = core.normalizePolicy({
    name: args.name, kind: args.kind, insuredId,
    holderId: args.holderId, company: args.company, policyNo: args.policyNo,
    coverage, coverageNote: args.coverageNote,
    premium: args.premium, freq: args.freq, payYears: args.payYears,
    startDate: args.startDate, endDate: args.endDate, waitingDays: args.waitingDays,
    fileNote: args.fileNote, note: args.note,
  }, null);
  if (r.error) return err(r.error);
  const policies = await listPolicies();
  const dup = policies.find((p) => p.insuredId === r.policy.insuredId && p.name === r.policy.name && p.company === r.policy.company);
  if (dup) return err(`已有同被保人/同名/同公司的保单「${r.policy.name}」（id=${dup.id}）。加保请把产品名区分开（如加注年份），调整请用 jinkui_update。`);
  await kv.kvSet(K.policy(r.policy.id), r.policy);
  const members = await listMembers();
  const now = Date.now();
  const st = core.policyStatus(r.policy, [], (await readSettings()), now);
  const L = [];
  if (prelude) L.push(prelude);
  L.push(`已入柜：${core.describePolicy(r.policy, core.clip(args.insured, 40) || memberName(members, insuredId))}（id=${r.policy.id}）`);
  const payBits = [];
  if (st.waitingEnd) payBits.push(`等待期至 ${st.waitingEnd}（期内出险通常不赔）`);
  if (st.nextPayDate) payBits.push(`下次缴费 ${st.nextPayDate}${r.policy.premium != null ? ` ${core.fmtMoney(r.policy.premium)}` : ''}`);
  else payBits.push(r.policy.freq === 'single' ? '趸交，无续期缴费' : '缴费期满，无续期缴费');
  if (r.policy.endDate) payBits.push(`保障至 ${r.policy.endDate}`);
  L.push(payBits.join('，') + '。');
  L.push('建议补全：保单号（policyNo）、电子保单存放位置（fileNote，如「邮箱 xxx」「保司App」）——理赔时找得到原件。');
  return ok(L.join('\n') + '\n' + DISCLAIMER);
}

async function toolLog(args) {
  const type = String(args.type || '');
  if (!core.EVENT_TYPES.includes(type)) {
    return err(`type 必填：${core.EVENT_TYPES.map((t) => `${t}(${core.EVENT_NAMES[t]})`).join(' / ')}`);
  }
  const resolved = await resolvePolicy(args);
  if (resolved.error) return err(resolved.error);
  const policy = resolved.policy;
  const date = args.date ? String(args.date) : core.dayKey(Date.now());
  const settings = await readSettings();
  const now = Date.now();

  if (type === 'surrender') {
    const r = core.normalizeEvent({ type, policyId: policy.id, date, amount: args.amount, note: args.note || '退保' }, null);
    if (r.error) return err(r.error);
    await kv.kvSet(K.ev(r.ev.occKey), r.ev);
    const st = core.policyStatus(policy, core.eventsFor(await listEvents(), policy.id), settings, now);
    return ok([
      `已记退保：「${policy.name}」自 ${date} 起按已退保留档${args.amount != null ? `，退回 ${core.fmtMoney(args.amount)}` : ''}。`,
      `提醒：退保通常只退现金价值（前期可能远低于已缴保费），后续新保单有等待期——决定前建议与保司确认。保单台账不代作决定。`,
    ].join('\n') + '\n' + DISCLAIMER);
  }
  if (type === 'reinstate') {
    const cur = core.policyStatus(policy, core.eventsFor(await listEvents(), policy.id), settings, now);
    if (cur.state !== 'grace' && cur.state !== 'lapse') {
      return err(`「${policy.name}」当前状态是「${cur.stateName}」，无需复效。宽限期内补缴直接记 jinkui_log type=pay；正常缴费也用 type=pay。`);
    }
    const r = core.normalizeEvent({ type, policyId: policy.id, date, note: args.note || '复效（视同补缴至此期）' }, null);
    if (r.error) return err(r.error);
    await kv.kvSet(K.ev(r.ev.occKey), r.ev);
    const st = core.policyStatus(policy, core.eventsFor(await listEvents(), policy.id), settings, now);
    return ok(`已记复效：「${policy.name}」${date} 起恢复效力（账面补缴至 ${st.paidUntil}）。复效通常有等待期/观察期，以保司确认为准。\n${DISCLAIMER}`);
  }

  // pay / claim / endorse / other
  const r = core.normalizeEvent({ type, policyId: policy.id, date, amount: args.amount, note: args.note }, null);
  if (r.error) return err(r.error);
  await kv.kvSet(K.ev(r.ev.occKey), r.ev);
  const evs = core.eventsFor(await listEvents(), policy.id);
  const st = core.policyStatus(policy, evs, settings, now);
  if (type === 'pay') {
    const paidAmt = args.amount != null ? core.fmtMoney(args.amount) : (policy.premium != null ? core.fmtMoney(policy.premium) : '一笔');
    const L = [`已记缴费：「${policy.name}」${date} 缴 ${paidAmt}，账面缴至 ${st.paidUntil}（已缴 ${core.periodsPaid(policy, st.paidUntil)} 期${policy.payYears ? `/${policy.payYears * (core.FREQ_PER_YEAR[policy.freq] || 1)}` : ''}）`];
    if (st.nextPayDate) L.push(`下次缴费 ${st.nextPayDate}${policy.premium != null ? ` ${core.fmtMoney(policy.premium)}` : ''}。`);
    else L.push('缴费期已满/趸交：无续期缴费，保障继续。');
    return ok(L.join('\n') + '\n' + DISCLAIMER);
  }
  if (type === 'claim') {
    const claims = evs.filter((e) => e.type === 'claim');
    const sum = claims.reduce((acc, e) => acc + (e.amount || 0), 0);
    return ok(`已记理赔：「${policy.name}」${date}${args.amount != null ? ` 获赔 ${core.fmtMoney(args.amount)}` : ''}${args.note ? `（${args.note}）` : ''}。该保单累计理赔 ${core.fmtMoney(sum)}，${claims.length} 笔。`);
  }
  if (type === 'endorse') {
    return ok(`已记批改：「${policy.name}」${date}${args.note ? `（${args.note}）` : '（建议 note 写清改了什么，如加保额/换受益人）'}。`);
  }
  return ok(`已记录（other）：「${policy.name}」${date}${args.note ? `（${args.note}）` : ''}。`);
}

async function toolQuery(args) {
  const scope = String(args.scope || 'policies');
  const [policies, events, members, settings] = await Promise.all([listPolicies(), listEvents(), listMembers(), readSettings()]);
  const now = Date.now();
  if (scope === 'policies') {
    if (!policies.length) return ok('暂无保单。');
    const states = policies.map((p) => {
      const st = core.policyStatus(p, core.eventsFor(events, p.id), settings, now);
      return `[${p.id}] ${core.describePolicy(p, memberName(members, p.insuredId))} —— ${st.stateName}${st.nextPayDate ? `，下次缴费 ${st.nextPayDate}` : ''}`;
    });
    return ok(states.join('\n') + '\n' + DISCLAIMER);
  }
  if (scope === 'calendar') {
    const days = Math.max(1, Math.min(365, Math.floor(+args.days || 90)));
    const rows = core.paymentCalendar(policies, events, settings, now, days);
    if (!rows.length) return ok(`未来 ${days} 天没有应缴保单。`);
    const byId = new Map(policies.map((p) => [p.id, p]));
    const L = rows.map((r) => {
      const p = byId.get(r.policyId);
      const insured = p ? memberName(members, p.insuredId) : '未知';
      const when = r.daysToPay < 0
        ? `已逾期 ${-r.daysToPay} 天，宽限期至 ${core.addDays(r.date, settings.graceDays)}`
        : fmtAlertDate(r.daysToPay);
      return `${r.date}（${when}）${insured} 的「${r.name}」${r.premium != null ? core.fmtMoney(r.premium) : '（保费未记）'}${r.daysToPay < 0 ? '【宽限期·保障仍有效】' : ''}`;
    });
    return ok(`未来 ${days} 天缴费日历\n${L.join('\n')}\n${DISCLAIMER}`);
  }
  if (scope === 'gap') {
    const gap = core.gapMatrix(members, policies, events, settings, now);
    const L = ['家庭保障缺口矩阵（现状透视，不构成投保建议）：'];
    const head = '成员'.padEnd(6) + core.GAP_KINDS.map((k) => core.KIND_NAMES[k]).map((n) => n.padEnd(8)).join('');
    L.push(head);
    for (const row of gap.rows) {
      const cells = core.GAP_KINDS.map((k) => {
        const c = row.cells[k];
        return c ? `${c.count}张/${core.fmtMoney(c.sum)}`.padEnd(10) : '缺'.padEnd(10);
      });
      L.push(row.name.padEnd(6) + cells.join(''));
    }
    const missBits = gap.rows.filter((r) => r.missing.length).map((r) => `${r.name}：${r.missing.map((k) => core.KIND_NAMES[k]).join('/')}`);
    if (missBits.length) L.push('缺格：' + missBits.join('；'));
    else L.push('四大件暂无缺格。');
    const otherBits = Object.entries(gap.otherKinds).filter(([, n]) => n > 0).map(([k, n]) => `${core.KIND_NAMES[k]}${n}张`);
    if (otherBits.length) L.push(`其他在保：${otherBits.join('、')}（信息层，不计入四大件）。`);
    L.push('口径：只统计有效/等待期/宽限期内的保单；中止期、已退保、已满期不计入覆盖。保额为台账登记合计，以合同为准。');
    return ok(L.join('\n') + '\n' + DISCLAIMER);
  }
  if (scope === 'stats') {
    const totals = core.familyTotals(policies, events, settings, now);
    const flow = core.premiumFlow(policies, events, settings, now);
    const L = [
      `保单 ${totals.policyCount} 张（在保 ${totals.activeCount}）`,
      `年缴保费约 ${core.fmtMoney(totals.annualizedPremium)}，未来 12 个月应缴 ${core.fmtMoney(flow.total)}，累计已缴 ${core.fmtMoney(totals.totalPaid)}，累计理赔 ${core.fmtMoney(totals.totalClaim)}`,
      `状态分布：${Object.entries(totals.byState).map(([k, n]) => `${core.STATE_NAMES[k] || k}×${n}`).join('，') || '—'}`,
    ];
    const monthKeys = Object.keys(flow.months).sort();
    if (monthKeys.length) {
      L.push('未来 12 个月现金流：');
      for (const mk of monthKeys) {
        L.push(`  ${mk}：${core.fmtMoney(flow.months[mk].amount)}（${flow.months[mk].items.map((i) => i.name).join('、')}）`);
      }
    } else {
      L.push('未来 12 个月无应缴（趸交/缴费期满/无保费记录）。');
    }
    return ok(L.join('\n') + '\n' + DISCLAIMER);
  }
  // 以下 scope 需要定位保单
  const resolved = await resolvePolicy(args);
  if (resolved.error) return err(resolved.error);
  const policy = resolved.policy;
  const evs = core.eventsFor(events, policy.id);
  const st = core.policyStatus(policy, evs, settings, now);
  if (scope === 'detail') {
    const insured = memberName(members, policy.insuredId);
    const pp = core.periodsPaid(policy, st.paidUntil);
    const tp = core.totalPeriods(policy);
    const L = [
      `[${policy.id}] ${core.describePolicy(policy, insured)}`,
      policy.policyNo ? `保单号：${policy.policyNo}` : '',
      `状态：${st.stateName}${st.state === 'grace' && st.graceEnd ? `（宽限期至 ${st.graceEnd}，保障仍有效）` : ''}${st.state === 'lapse' ? '（出险不赔，可申请复效）' : ''}`,
      st.waitingEnd && st.state === 'waiting' ? `等待期至 ${st.waitingEnd}（等待期内出险通常不赔）` : '',
      `缴费：已缴 ${pp}${tp != null ? `/${tp}` : ''} 期，缴至 ${st.paidUntil}${st.nextPayDate ? `，下次缴费 ${st.nextPayDate}${policy.premium != null ? ` ${core.fmtMoney(policy.premium)}` : ''}` : '，无续期缴费'}`,
      policy.coverage != null ? `保额 ${core.fmtMoney(policy.coverage)}${policy.coverageNote ? `（${policy.coverageNote}）` : ''}` : '保额未登记',
      policy.fileNote ? `电子保单：${policy.fileNote}` : '电子保单位置未登记（理赔时难找原件，建议补记）',
      evs.length ? `事件 ${evs.length} 条（jinkui_query scope=events 看流水）` : '暂无缴费/理赔/批改流水',
      policy.note ? `备注：${policy.note}` : '',
    ].filter(Boolean);
    return ok(L.join('\n') + '\n' + DISCLAIMER);
  }
  if (scope === 'events') {
    if (!evs.length) return ok('该保单暂无事件。');
    const L = evs.slice().reverse().map((e) => {
      const bits = [`${e.date}`, core.EVENT_NAMES[e.type] || e.type];
      if (e.amount != null) bits.push(core.fmtMoney(e.amount));
      if (e.note) bits.push(e.note);
      return `${bits.join(' ')}（occKey=${e.occKey}）`;
    });
    return ok(L.slice(0, 100).join('\n') + (L.length > 100 ? `\n（仅最近 100 条，共 ${L.length} 条）` : ''));
  }
  return err(`scope 不合法：${scope}（policies/detail/events/calendar/gap/stats）`);
}

async function toolUpdate(args) {
  const kind = String(args.kind || 'policy');
  const id = String(args.id || '').trim();
  if (!id) return err('需提供 id');
  const patch = args.patch && typeof args.patch === 'object' ? args.patch : {};
  if (kind === 'member') {
    const prev = await kv.kvGet(K.member(id)).catch(() => null);
    if (!prev) return err(`找不到成员 ${id}`);
    const input = { ...prev };
    for (const k of ['name', 'relation', 'birthYear', 'note']) {
      if (patch[k] !== undefined) input[k] = patch[k];
    }
    const r = core.normalizeMember(input, prev);
    if (r.error) return err(r.error);
    if (r.member.name !== prev.name) {
      return err(`成员名字用作档案锚点，不支持改名（${prev.name} → ${r.member.name}）。如需换人请删除重建。`);
    }
    await kv.kvSet(K.member(id), r.member);
    return ok(`已更新成员：${r.member.name}（${core.RELATION_NAMES[r.member.relation] || r.member.relation}${r.member.birthYear ? `，${r.member.birthYear} 年生` : ''}）`);
  }
  if (kind === 'policy') {
    const prev = await kv.kvGet(K.policy(id)).catch(() => null);
    if (!prev) return err(`找不到保单 ${id}`);
    const coverage = patch.coverageWan != null ? Math.round(+patch.coverageWan * 10000 * 100) / 100
      : (patch.coverage != null ? Math.round(+patch.coverage * 100) / 100 : undefined);
    // patch 只传改动字段：以 prev 为底，仅覆盖显式提供的键（否则空字段会被当「清空」拒绝）
    const input = { ...prev };
    const assigns = {
      name: patch.name, kind: patch.kind, insuredId: patch.insuredId, holderId: patch.holderId,
      company: patch.company, policyNo: patch.policyNo, coverage, coverageNote: patch.coverageNote,
      premium: patch.premium, freq: patch.freq, payYears: patch.payYears,
      startDate: patch.startDate, endDate: patch.endDate, waitingDays: patch.waitingDays,
      fileNote: patch.fileNote, note: patch.note, endedAt: patch.endedAt, endReason: patch.endReason,
    };
    for (const [k, v] of Object.entries(assigns)) {
      if (v !== undefined) input[k] = v;
    }
    const r = core.normalizePolicy(input, prev);
    if (r.error) return err(r.error);
    if (r.policy.name !== prev.name) {
      return err(`产品名用作判重锚点，不支持改名（${prev.name} → ${r.policy.name}）。如录错了请删除重建。`);
    }
    await kv.kvSet(K.policy(id), r.policy);
    const st = core.policyStatus(r.policy, core.eventsFor(await listEvents(), id), await readSettings(), Date.now());
    const warnings = [];
    if (patch.startDate != null || patch.freq != null || patch.payYears != null || patch.premium != null) {
      warnings.push('缴费参数改动会如实重推缴费进度——若中途利率/保费调整过，历史以事件流水为准。');
    }
    if (patch.endReason != null) warnings.push('手动终止已标记（退保建议改用 jinkui_log type=surrender 保留流水）。');
    return ok([
      `已更新保单：${core.describePolicy(r.policy)}`,
      `状态：${st.stateName}${st.nextPayDate ? `，下次缴费 ${st.nextPayDate}` : ''}`,
      ...warnings,
    ].join('\n') + '\n' + DISCLAIMER);
  }
  return err(`kind 不合法：${kind}（policy/member）`);
}

async function toolDelete(args) {
  const kind = String(args.kind || 'policy');
  const id = String(args.id || '').trim();
  if (!id) return err('需提供 id');
  if (args.confirm !== true) return err('删除需显式 confirm=true（不可逆）。AI 应先向用户确认再执行。');
  if (kind === 'policy') {
    const prev = await kv.kvGet(K.policy(id)).catch(() => null);
    if (!prev) return err(`找不到保单 ${id}`);
    // occKey = type|policyId|date：policyId 在中段，按段解析（勿用 endsWith）
    const keys = await kv.kvKeys();
    const evKeys = keys.filter((k) => {
      if (!k.startsWith(K.evPrefix)) return false;
      const parts = k.slice(K.evPrefix.length).split('|');
      return parts.length >= 3 && parts[1] === id;
    });
    for (const k of evKeys) await kv.kvDel(k);
    await kv.kvDel(K.policy(id));
    return ok(`已删除保单「${prev.name}」及 ${evKeys.length} 条事件记录。成员档案保留。`);
  }
  if (kind === 'member') {
    const prev = await kv.kvGet(K.member(id)).catch(() => null);
    if (!prev) return err(`找不到成员 ${id}`);
    const policies = await listPolicies();
    const owned = policies.filter((p) => p.insuredId === id || p.holderId === id);
    if (owned.length) {
      return err(`「${prev.name}」名下有 ${owned.length} 张保单（${owned.map((p) => p.name).join('、')}），不能直接删。先逐张处理保单（删除或改 insuredId），再删成员。`);
    }
    await kv.kvDel(K.member(id));
    return ok(`已删除成员「${prev.name}」。`);
  }
  if (kind === 'event') {
    const occKey = id;
    const prev = await kv.kvGet(K.ev(occKey)).catch(() => null);
    if (!prev) return err(`找不到事件 ${occKey}（格式 type|policyId|YYYY-MM-DD，jinkui_query scope=events 可查）`);
    await kv.kvDel(K.ev(occKey));
    return ok(`已删除事件：${core.EVENT_NAMES[prev.type] || prev.type} @ ${prev.date}（${prev.note || '无备注'}）。缴费进度已按剩余事件重推。`);
  }
  return err(`kind 不合法：${kind}（policy/member/event）`);
}

// ── 工具清单 ─────────────────────────────────────────────────────────────────
const KIND_HINT = 'medical(医疗)｜critical(重疾)｜life(寿险)｜accident(意外)｜annuity(年金)｜property(家财)｜other';
const FREQ_HINT = 'yearly(年缴)｜half(半年缴)｜quarter(季缴)｜monthly(月缴)｜single(趸交)';
const COVERAGE_HINT = '保额双单位：coverageWan 用万（推荐，如 300 万=coverageWan:300），无 Wan 后缀用元';

const tools = [
  {
    name: 'jinkui_today',
    description: '保单台账·今日台账：缴费红黄榜（宽限期/中止期红榜——保障已出风险；warnDays 内缴费黄榜）、等待期、满期提醒、家庭合计（在保单数/年缴保费/累计已缴/累计理赔）与缺口速览。用户问「保单该交了吗」「有啥要注意的」「全家保障怎么样」时用。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'jinkui_add',
    description: '保单台账·入柜建档：entity=policy 建保单——用户说「给娃买了份 50 万的重疾，平安的，年缴 4000 缴 20 年，2023 年 5 月生效」→ name=平安少儿重疾, kind=critical, insured=娃, coverageWan=50, premium=4000, freq=yearly, payYears=20, startDate=2023-05-01。insured 传成员名自动配档；entity=member 先建成员（本人/配偶/子女/父母）。startDate=首期缴费日（不是签单日）；趸交 freq=single；电子保单位置用 fileNote 登记。',
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string', enum: ['policy', 'member'], description: '建什么（缺省 policy）' },
        name: { type: 'string', description: '（policy）产品名，如 平安e生保·长期医疗' },
        kind: { type: 'string', enum: ['medical', 'critical', 'life', 'accident', 'annuity', 'property', 'other'], description: KIND_HINT },
        insured: { type: 'string', description: '（policy）被保险人成员名，不存在自动建档' },
        relation: { type: 'string', enum: ['self', 'spouse', 'child', 'parent', 'other'], description: '（自动建档时）与户主关系' },
        insuredId: { type: 'string', description: '（policy）被保险人 id，与 insured 二选一' },
        holderId: { type: 'string', description: '（policy）投保人 id（可选，默认同被保险人）' },
        company: { type: 'string', description: '（policy）保险公司/平台' },
        policyNo: { type: 'string', description: '（policy）保单号' },
        coverageWan: { type: 'number', description: '（policy）保额（万）' },
        coverage: { type: 'number', description: '（policy）保额（元），Wan 优先' },
        coverageNote: { type: 'string', description: '（policy）保额口径，如 一般医疗300万/年' },
        premium: { type: 'number', description: '（policy）每期保费（元）' },
        freq: { type: 'string', enum: ['yearly', 'half', 'quarter', 'monthly', 'single'], description: FREQ_HINT },
        payYears: { type: 'number', description: '（policy）缴费年限（年），趸交不用传' },
        startDate: { type: 'string', description: '（policy）首期缴费日/生效日 YYYY-MM-DD' },
        endDate: { type: 'string', description: '（policy）保障期满日（留空=终身/未定）' },
        waitingDays: { type: 'number', description: '（policy）等待期天数' },
        fileNote: { type: 'string', description: '（policy）电子保单在哪，如 邮箱xx / 保司App-我的保单' },
        note: { type: 'string' },
      },
    },
  },
  {
    name: 'jinkui_log',
    description: '保单台账·记事件：type=pay 记缴费（date=该期缴费日，缴到哪期填哪期；金额缺省按保单保费）；type=claim 记理赔（amount=获赔金额，note=出险说明）；type=endorse 记批改（note 写清改了什么）；type=reinstate 记复效（date=复效日，仅宽限期/中止期可用）；type=surrender 记退保（date=退保日）。用户说「这份交过了」「理赔下来 8000」「把受益人改成我」「那份退了」时用。',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['pay', 'claim', 'endorse', 'reinstate', 'surrender', 'other'] },
        policyId: { type: 'string' }, policyName: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD，缺省今天' },
        amount: { type: 'number', description: '（pay/claim/surrender）金额（元），缺省按保单保费' },
        note: { type: 'string' },
      },
      required: ['type'],
    },
  },
  {
    name: 'jinkui_query',
    description: '保单台账·查询：scope=policies 全家保单清单｜detail 单张详情（缴费进度/宽限期/等待期/流水数）｜events 事件流水｜calendar 未来 N 天缴费日历（days，默认 90）｜gap 四大件缺口矩阵｜stats 家庭合计+未来 12 个月保费现金流。用户问「我妈的重疾什么时候缴费」「谁没医疗险」「今年保费多少」「未来几个月要交哪些」时用。',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['policies', 'detail', 'events', 'calendar', 'gap', 'stats'] },
        policyId: { type: 'string' }, policyName: { type: 'string' },
        days: { type: 'number', description: '（calendar）天数 1-365，默认 90' },
      },
      required: ['scope'],
    },
  },
  {
    name: 'jinkui_update',
    description: '保单台账·修改：kind=policy 改保单（company/policyNo/coverage/premium/payYears/endDate/waitingDays/fileNote/note…；产品名与被保人不可改，录错删重建）；kind=member 改成员（relation/birthYear/note）。改缴费参数会如实重推缴费进度。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['policy', 'member'] },
        id: { type: 'string' },
        patch: { type: 'object', description: '要改的字段（形态同 jinkui_add；coverageWan 用万）' },
      },
      required: ['kind', 'id', 'patch'],
    },
  },
  {
    name: 'jinkui_delete',
    description: '保单台账·删除（需 confirm=true，AI 必须先向用户确认）：kind=policy 删保单连带事件；kind=member 删成员（名下有保单会拒绝）；kind=event 删单条事件（id=occKey，误记的缴费/理赔用）。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['policy', 'member', 'event'] },
        id: { type: 'string' },
        confirm: { type: 'boolean' },
      },
      required: ['kind', 'id', 'confirm'],
    },
  },
];

const HANDLERS = {
  jinkui_today: toolToday,
  jinkui_add: toolAdd,
  jinkui_log: toolLog,
  jinkui_query: toolQuery,
  jinkui_update: toolUpdate,
  jinkui_delete: toolDelete,
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

log('info', `jinkui mcp server v${SERVER_VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
