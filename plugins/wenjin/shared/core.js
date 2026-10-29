'use strict';
/**
 * wenjin-core.js —— 求职台账（求职投递与面试作战台账）纯函数核心
 *
 * 面板 / MCP 三方同源的唯一计算权威（同 qingnang/changqi 范式）：
 *   - 全部派生（管道/跟进/日程/漏斗/offer 年化/问题库/CSV）都是纯函数，
 *     不做 IO，不依赖 node 内建 —— esbuild 可原样打进面板 bundle。
 *   - id 一律 sha256 稳定派生（见 idFor），按名 find-or-create 幂等，
 *     面板与 AI 并发写同一实体不会产生双份（id 即键名，一致 = 不分裂）。
 *
 * 键空间契约（权威描述见 README）：
 *   wenjin.company.<id> / wenjin.app.<id> / wenjin.resume.<id>
 *   wenjin.event.<id>   / wenjin.offer.<id> / wenjin.settings / wenjin.meta
 */

const { sha256Hex } = require('./sha256');

// ── 常量与字典 ──────────────────────────────────────────────────────────

const SCHEMA_VERSION = 1;

const CHANNELS = ['boss', 'referral', 'website', 'liepin', 'lagou', 'linkedin', 'maimai', 'other'];
const CHANNEL_LABELS = {
  boss: 'BOSS直聘', referral: '内推', website: '官网', liepin: '猎聘',
  lagou: '拉勾', linkedin: 'LinkedIn', maimai: '脉脉', other: '其他',
};

const STATUSES = ['wish', 'applied', 'screening', 'written', 'interview', 'offered', 'accepted', 'rejected', 'withdrawn'];
const STATUS_LABELS = {
  wish: '想投', applied: '已投', screening: '沟通中', written: '笔试',
  interview: '面试中', offered: '已有offer', accepted: '已接受',
  rejected: '被拒', withdrawn: '主动放弃',
};
/** 跟进检测覆盖面：这些状态「没动静」才叫失联 */
const PIPE_STATUSES = ['applied', 'screening', 'written'];
/** 活跃（非终态）状态 */
const ACTIVE_STATUSES = ['wish', 'applied', 'screening', 'written', 'interview', 'offered'];

const EVENT_TYPES = ['applied', 'screen', 'written', 'interview', 'offer', 'result', 'note'];
const EVENT_LABELS = {
  applied: '投递', screen: '沟通', written: '笔试', interview: '面试',
  offer: 'offer', result: '结果', note: '备注',
};
const OUTCOMES = ['pass', 'fail'];
const OUTCOME_LABELS = { pass: '通过', fail: '未过' };

/** 事件类型 → 投递状态联动（log_event 时顺带推进状态） */
const EVENT_STATUS_MAP = {
  applied: 'applied', screen: 'screening', written: 'written',
  interview: 'interview', offer: 'offered',
};

const DEFAULT_SETTINGS = { schemaVersion: SCHEMA_VERSION, followUpDays: 5, remindLeadHours: 24 };
const DAY_MS = 86400000;

/** cap.kv 键空间（面板/MCP/未来服务三方必须一字不差，id 即键名） */
const K = {
  companyPrefix: 'wenjin.company.',
  appPrefix: 'wenjin.app.',
  resumePrefix: 'wenjin.resume.',
  eventPrefix: 'wenjin.event.',
  offerPrefix: 'wenjin.offer.',
  settings: 'wenjin.settings',
  meta: 'wenjin.meta',
  company: (id) => `wenjin.company.${id}`,
  app: (id) => `wenjin.app.${id}`,
  resume: (id) => `wenjin.resume.${id}`,
  event: (id) => `wenjin.event.${id}`,
  offer: (id) => `wenjin.offer.${id}`,
};

// ── 工具 ────────────────────────────────────────────────────────────────

function idFor(seed) { return 'w' + sha256Hex(String(seed)).slice(0, 12); }

function clip(s, n) {
  s = String(s == null ? '' : s);
  return s.length <= n ? s : s.slice(0, n);
}

/**
 * 判重键归一：trim + 去除全部空白 + 小写。
 * 岗位/公司名里的空格纯属输入噪音（'Java 开发' 与 'Java开发' 是同一岗位），
 * 判重一律按去空白口径；展示名（displayName）保留原写法。
 */
function normName(s) {
  return String(s == null ? '' : s).trim().replace(/\s+/g, '').toLowerCase();
}

/** 名字展示态：trim + 折叠空白，保留原大小写 */
function displayName(s) {
  return String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
}

function nowIso() { return new Date().toISOString(); }

/**
 * 宽容时间解析：接受 ISO / 'YYYY-MM-DD HH:mm' / 'YYYY-MM-DD' / 时间戳(ms)。
 * 只年月日时按本地时区。返回 ms，无法解析返回 null。
 */
function parseTs(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m1) {
    return new Date(+m1[1], +m1[2] - 1, +m1[3], +m1[4], +m1[5], m1[6] ? +m1[6] : 0).getTime();
  }
  const t = Date.parse(s);
  return isFinite(t) ? t : null;
}

/** 分钟精度（事件幂等键用：同刻同型同文 = 同一条） */
function minuteKey(ms) {
  if (ms == null) return '';
  return new Date(Math.floor(ms / 60000) * 60000).toISOString().slice(0, 16);
}

function fmtDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDateTime(ms) {
  const d = new Date(ms);
  return `${fmtDate(ms)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 今日零点起的 'YYYY-MM-DD HH:mm'（默认时间 09:00，避免 AI 只给日期时落到半夜） */
function tsOrNow(v, nowMs) {
  const t = parseTs(v);
  if (t != null) return t;
  return (nowMs != null ? nowMs : Date.now());
}

// ── normalize（写入侧唯一入口，旧数据向前兼容） ─────────────────────────

function normalizeCompany(raw, prev) {
  raw = raw || {};
  const name = displayName(raw.name);
  if (!name) throw new Error('公司名不能为空');
  const now = nowIso();
  return {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : idFor('company|' + normName(name))),
    name,
    industry: raw.industry != null ? clip(raw.industry, 40) : (prev && prev.industry) || '',
    note: raw.note != null ? clip(raw.note, 500) : (prev && prev.note) || '',
    createdAt: prev && prev.createdAt ? prev.createdAt : now,
    updatedAt: now,
  };
}

function normalizeApp(raw, prev, companyName) {
  raw = raw || {};
  const title = displayName(raw.title);
  if (!title) throw new Error('职位名称不能为空');
  const company = displayName(companyName || raw.companyName);
  if (!company) throw new Error('公司名不能为空');
  const now = nowIso();
  const companyId = (prev && prev.companyId) || idFor('company|' + normName(company));
  let status = raw.status != null ? String(raw.status) : (prev && prev.status) || 'wish';
  if (!STATUSES.includes(status)) status = 'wish';
  let channel = raw.channel != null ? String(raw.channel) : (prev && prev.channel) || 'other';
  if (!CHANNELS.includes(channel)) channel = 'other';
  const appliedMs = raw.appliedAt != null ? parseTs(raw.appliedAt) : (prev && prev.appliedAt ? parseTs(prev.appliedAt) : null);
  const base = {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : idFor('app|' + companyId + '|' + normName(title))),
    companyId,
    companyName: company,
    title,
    channel,
    status,
    jd: raw.jd != null ? clip(raw.jd, 20000) : (prev && prev.jd) || '',
    salaryPosted: raw.salaryPosted != null ? clip(raw.salaryPosted, 120) : (prev && prev.salaryPosted) || '',
    location: raw.location != null ? clip(raw.location, 120) : (prev && prev.location) || '',
    resumeId: raw.resumeId != null ? String(raw.resumeId).slice(0, 40) : (prev && prev.resumeId) || '',
    appliedAt: appliedMs != null ? new Date(appliedMs).toISOString() : '',
    archived: raw.archived != null ? !!raw.archived : !!(prev && prev.archived),
    note: raw.note != null ? clip(raw.note, 2000) : (prev && prev.note) || '',
    createdAt: prev && prev.createdAt ? prev.createdAt : now,
    updatedAt: now,
  };
  return base;
}

function normalizeResume(raw, prev) {
  raw = raw || {};
  const label = displayName(raw.label);
  if (!label) throw new Error('简历版本名不能为空');
  const now = nowIso();
  return {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : idFor('resume|' + normName(label))),
    label,
    content: raw.content != null ? clip(raw.content, 100000) : (prev && prev.content) || '',
    note: raw.note != null ? clip(raw.note, 500) : (prev && prev.note) || '',
    createdAt: prev && prev.createdAt ? prev.createdAt : now,
    updatedAt: now,
  };
}

function normalizeEvent(raw, prev, appId) {
  raw = raw || {};
  const aid = (prev && prev.appId) || (appId ? String(appId) : '');
  if (!aid) throw new Error('事件必须挂在某个投递上');
  let type = raw.type != null ? String(raw.type) : (prev && prev.type) || 'note';
  if (!EVENT_TYPES.includes(type)) type = 'note';
  const detail = raw.detail != null ? clip(raw.detail, 8000) : (prev && prev.detail) || '';
  const atMs = tsOrNow(raw.at != null ? raw.at : (prev && prev.at), Date.now());
  const now = nowIso();
  let questions = prev && prev.questions ? prev.questions : [];
  if (raw.questions != null) {
    questions = (Array.isArray(raw.questions) ? raw.questions : String(raw.questions).split(/\n+/))
      .map((q) => clip(String(q).trim(), 300))
      .filter((q) => q.length > 0)
      .slice(0, 50);
  }
  let outcome = raw.outcome != null ? String(raw.outcome) : (prev && prev.outcome) || '';
  if (outcome && !OUTCOMES.includes(outcome)) outcome = '';
  const remindMs = raw.remindAt != null ? parseTs(raw.remindAt) : (prev && prev.remindAt ? parseTs(prev.remindAt) : null);
  return {
    id: prev && prev.id ? String(prev.id)
      : (raw.id ? String(raw.id).slice(0, 40)
        : idFor('event|' + aid + '|' + type + '|' + minuteKey(atMs) + '|' + clip(detail, 80))),
    appId: aid,
    type,
    at: new Date(atMs).toISOString(),
    title: raw.title != null ? clip(raw.title, 120) : (prev && prev.title) || '',
    detail,
    questions,
    outcome,
    remindAt: remindMs != null ? new Date(remindMs).toISOString() : '',
    createdAt: prev && prev.createdAt ? prev.createdAt : now,
    updatedAt: now,
  };
}

function normalizeOffer(raw, prev, appId) {
  raw = raw || {};
  const aid = (prev && prev.appId) || (appId ? String(appId) : '');
  if (!aid) throw new Error('offer 必须挂在某个投递上');
  const num = (v, def, lo, hi) => {
    const n = Number(v);
    if (!isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  };
  const baseMonthly = num(raw.baseMonthly != null ? raw.baseMonthly : (prev && prev.baseMonthly), 0, 0, 10000000);
  if (!(baseMonthly > 0)) throw new Error('baseMonthly 必须是正数（元/月）');
  const now = nowIso();
  const deadlineMs = raw.deadline != null ? parseTs(raw.deadline) : (prev && prev.deadline ? parseTs(prev.deadline) : null);
  return {
    id: prev && prev.id ? String(prev.id) : (raw.id ? String(raw.id).slice(0, 40) : idFor('offer|' + aid)),
    appId: aid,
    baseMonthly,
    months: num(raw.months != null ? raw.months : (prev && prev.months), 12, 1, 24),
    bonusMonths: num(raw.bonusMonths != null ? raw.bonusMonths : (prev && prev.bonusMonths), 0, 0, 24),
    commuteMin: num(raw.commuteMin != null ? raw.commuteMin : (prev && prev.commuteMin), 0, 0, 600),
    remoteDays: num(raw.remoteDays != null ? raw.remoteDays : (prev && prev.remoteDays), 0, 0, 7),
    stockNote: raw.stockNote != null ? clip(raw.stockNote, 1000) : (prev && prev.stockNote) || '',
    deadline: deadlineMs != null ? new Date(deadlineMs).toISOString() : '',
    note: raw.note != null ? clip(raw.note, 2000) : (prev && prev.note) || '',
    createdAt: prev && prev.createdAt ? prev.createdAt : now,
    updatedAt: now,
  };
}

function normalizeSettings(raw, prev) {
  const r = raw || {};
  const base = prev || DEFAULT_SETTINGS;
  const int = (v, def, lo, hi) => {
    const n = Math.round(Number(v));
    return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    followUpDays: int(r.followUpDays != null ? r.followUpDays : base.followUpDays, 5, 1, 60),
    remindLeadHours: int(r.remindLeadHours != null ? r.remindLeadHours : base.remindLeadHours, 24, 1, 168),
  };
}

// ── 派生：管道 / 跟进 / 日程 ────────────────────────────────────────────

/** 状态计数 + 活跃排序列表（在投/面试在前，按更新时间倒序） */
function pipeline(apps) {
  const counts = {};
  for (const s of STATUSES) counts[s] = 0;
  let archived = 0;
  for (const a of apps || []) {
    if (counts[a.status] != null) counts[a.status] += 1; else counts[a.status] = 1;
    if (a.archived) archived += 1;
  }
  const order = { interview: 0, written: 1, offered: 2, screening: 3, applied: 4, wish: 5, accepted: 6, rejected: 7, withdrawn: 8 };
  const active = (apps || []).filter((a) => !a.archived)
    .slice()
    .sort((x, y) => (order[x.status] ?? 9) - (order[y.status] ?? 9)
      || String(y.updatedAt || '').localeCompare(String(x.updatedAt || '')));
  return { counts, archived, active };
}

/** 每个投递的最后事件时间 */
function lastEventAt(appId, events) {
  let last = 0;
  for (const e of events || []) {
    if (e.appId !== appId) continue;
    const t = parseTs(e.at);
    if (t != null && t > last) last = t;
  }
  return last;
}

/**
 * 跟进到期：状态 ∈ PIPE_STATUSES 且最后事件时间距今 ≥ followUpDays。
 * 返回按失联天数倒序；daysSince 用 floor（「已 N 天无进展」）。
 */
function followUps(apps, events, settings, nowMs) {
  const now = nowMs != null ? nowMs : Date.now();
  const lead = (settings && settings.followUpDays) || 5;
  const out = [];
  for (const a of apps || []) {
    if (a.archived || !PIPE_STATUSES.includes(a.status)) continue;
    const last = lastEventAt(a.id, events);
    const anchor = last || (a.appliedAt ? parseTs(a.appliedAt) : null) || (a.createdAt ? parseTs(a.createdAt) : null);
    if (!anchor) continue;
    const elapsed = now - anchor;
    if (elapsed >= lead * DAY_MS) {
      out.push({ app: a, lastAt: anchor, daysSince: Math.floor(elapsed / DAY_MS) });
    }
  }
  out.sort((x, y) => y.daysSince - x.daysSince);
  return out;
}

/**
 * 近期日程 + 到点提醒。
 * 日程：written/interview 且 at 在 (now−12h, +∞)，升序。
 * 提醒：remindAt 已到点（now ≥ remindAt−remindLeadHours）且过期不超过 48h。
 */
function upcoming(events, settings, nowMs) {
  const now = nowMs != null ? nowMs : Date.now();
  const leadH = ((settings && settings.remindLeadHours) || 24) * 3600000;
  const schedule = [];
  const reminders = [];
  for (const e of events || []) {
    const at = parseTs(e.at);
    if ((e.type === 'written' || e.type === 'interview') && at != null && at > now - 12 * 3600000) {
      schedule.push(e);
    }
    const r = parseTs(e.remindAt);
    if (r != null && now >= r - leadH && now <= r + 48 * 3600000) {
      reminders.push(e);
    }
  }
  schedule.sort((x, y) => parseTs(x.at) - parseTs(y.at));
  reminders.sort((x, y) => parseTs(x.remindAt) - parseTs(y.remindAt));
  return { schedule: schedule.slice(0, 10), reminders: reminders.slice(0, 10) };
}

// ── 派生：漏斗（渠道 / 简历版本） ───────────────────────────────────────

/**
 * 单个投递的漏斗级（取最深达级）：
 *   null（还在想投） < submitted < responded < interviewed < offered
 * 判据只看事实：applied 事件或 appliedAt 或非 wish 状态 = submitted；
 * screen/written/interview/offer/result 事件或对应状态 = responded；
 * interview/offer 事件或 interview 之后状态 = interviewed；
 * offer 事件或 offered/accepted = offered。
 * 终态不回退已达级（被拒也算「有过回音」——这正是转化率口径）。
 */
function stageOf(app, events) {
  let stage = null;
  const rank = { submitted: 1, responded: 2, interviewed: 3, offered: 4 };
  const bump = (s) => { if (s && rank[s] > (stage ? rank[stage] : 0)) stage = s; };
  const hasType = (t) => (events || []).some((e) => e.appId === app.id && e.type === t);
  if (app.status !== 'wish' || app.appliedAt || hasType('applied')) bump('submitted');
  if (hasType('screen') || hasType('written') || hasType('interview') || hasType('offer') || hasType('result')
    || ['screening', 'written', 'interview', 'offered', 'accepted', 'rejected'].includes(app.status)) bump('responded');
  if (hasType('interview') || hasType('offer')
    || ['interview', 'offered', 'accepted'].includes(app.status)) bump('interviewed');
  if (hasType('offer') || ['offered', 'accepted'].includes(app.status)) bump('offered');
  return stage;
}

/**
 * 按 apps[field] 分组的四级漏斗。样本 <5 的组只给计数不给百分比（诚实口径）。
 * field: 'channel' | 'resumeId'；resumeId 为空归 '(未标注)'。
 */
function funnelBy(apps, events, field) {
  const groups = new Map();
  for (const a of apps || []) {
    if (a.status === 'wish' && !a.appliedAt && !((events || []).some((e) => e.appId === a.id))) continue;
    const key = field === 'resumeId'
      ? (a.resumeId || '(未标注)')
      : (CHANNEL_LABELS[a.channel] || a.channel || '其他');
    if (!groups.has(key)) groups.set(key, { key, submitted: 0, responded: 0, interviewed: 0, offered: 0 });
    const g = groups.get(key);
    const st = stageOf(a, events);
    if (st) g.submitted += 1;
    if (st === 'responded' || st === 'interviewed' || st === 'offered') g.responded += 1;
    if (st === 'interviewed' || st === 'offered') g.interviewed += 1;
    if (st === 'offered') g.offered += 1;
  }
  const rows = [...groups.values()].sort((x, y) => y.submitted - x.submitted || y.responded - x.responded);
  const MIN_SAMPLE = 5;
  const pct = (n, d) => (d >= MIN_SAMPLE && d > 0 ? Math.round((n / d) * 100) + '%' : null);
  for (const g of rows) {
    g.respondedRate = pct(g.responded, g.submitted);
    g.interviewedRate = pct(g.interviewed, g.responded);
    g.offeredRate = pct(g.offered, g.interviewed);
  }
  return rows;
}

// ── 派生：offer 年化对比 ────────────────────────────────────────────────

/**
 * 年化包 = baseMonthly × (months + bonusMonths)。
 * 年通勤小时 = commuteMin × 2 × 250 ÷ 60（250 个工作日）。
 * 期权/股票只展示 stockNote 文本，不计价（不假装有精确系数）。
 * 返回按年化降序，附与最优的差额。
 */
function offerCompare(offers, apps) {
  const appById = new Map((apps || []).map((a) => [a.id, a]));
  const rows = (offers || []).map((o) => {
    const a = appById.get(o.appId);
    const totalMonths = (o.months || 12) + (o.bonusMonths || 0);
    const annual = Math.round((o.baseMonthly || 0) * totalMonths);
    return {
      offer: o,
      app: a || null,
      companyName: a ? a.companyName : '(已删投递)',
      title: a ? a.title : '',
      totalMonths,
      annual,
      commuteHoursPerYear: o.commuteMin > 0 ? Math.round((o.commuteMin * 2 * 250 / 60) * 10) / 10 : null,
    };
  }).sort((x, y) => y.annual - x.annual);
  const best = rows.length ? rows[0].annual : 0;
  for (const r of rows) r.deltaVsBest = r.annual - best;
  return rows;
}

// ── 派生：复盘问题库 ────────────────────────────────────────────────────

/** event.questions 聚合：同题（normName 归一）计数 + 来源公司去重列表 */
function questionBank(events, apps) {
  const appById = new Map((apps || []).map((a) => [a.id, a]));
  const map = new Map();
  for (const e of events || []) {
    if (!Array.isArray(e.questions)) continue;
    const a = appById.get(e.appId);
    for (const q of e.questions) {
      const key = normName(q);
      if (!key) continue;
      if (!map.has(key)) map.set(key, { q: String(q).trim(), count: 0, companies: [] });
      const item = map.get(key);
      item.count += 1;
      const c = a ? a.companyName : '?';
      if (!item.companies.includes(c)) item.companies.push(c);
    }
  }
  return [...map.values()].sort((x, y) => y.count - x.count || x.q.localeCompare(y.q));
}

// ── 导出 / 导入 ─────────────────────────────────────────────────────────

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** 导出 applications.csv（带 BOM，Excel 打开中文不乱码） */
function exportCSV(apps, events, resumes, offers) {
  const resumeById = new Map((resumes || []).map((r) => [r.id, r.label]));
  const offerByApp = new Map((offers || []).map((o) => [o.appId, o]));
  const head = ['公司', '职位', '渠道', '状态', '投递时间', '最新进展', '最新进展时间', '期望薪资', '地点', '简历版本', 'offer年化', '备注'];
  const lines = [head.join(',')];
  for (const a of (apps || []).slice().sort((x, y) => String(x.companyName).localeCompare(String(y.companyName)))) {
    let lastDesc = '';
    let lastAt = '';
    let lastT = 0;
    for (const e of events || []) {
      if (e.appId !== a.id) continue;
      const t = parseTs(e.at) || 0;
      if (t >= lastT) {
        lastT = t;
        lastAt = t ? fmtDateTime(t) : '';
        const label = EVENT_LABELS[e.type] || e.type;
        const tail = e.detail ? clip(e.detail.replace(/\s+/g, ' '), 60) : '';
        lastDesc = label + (e.outcome ? `(${OUTCOME_LABELS[e.outcome] || e.outcome})` : '') + (tail ? '：' + tail : '');
      }
    }
    const o = offerByApp.get(a.id);
    const annual = o ? Math.round(o.baseMonthly * ((o.months || 12) + (o.bonusMonths || 0))) : '';
    lines.push([
      a.companyName, a.title, CHANNEL_LABELS[a.channel] || a.channel, STATUS_LABELS[a.status] || a.status,
      a.appliedAt ? fmtDateTime(parseTs(a.appliedAt)) : '', lastDesc, lastAt,
      a.salaryPosted, a.location, a.resumeId ? (resumeById.get(a.resumeId) || '') : '',
      annual, a.note,
    ].map(csvEscape).join(','));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/** 解析 CSV（支持引号内逗号/换行/双引号转义）；返回二维数组 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  let s = String(text == null ? '' : text);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { inQ = true; i += 1; continue; }
    if (c === ',') { row.push(field); field = ''; i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += c; i += 1;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

const STATUS_LABEL_TO_KEY = {};
for (const k of STATUSES) STATUS_LABEL_TO_KEY[STATUS_LABELS[k]] = k;
const CHANNEL_LABEL_TO_KEY = {};
for (const k of CHANNELS) CHANNEL_LABEL_TO_KEY[CHANNEL_LABELS[k]] = k;

/**
 * 从 CSV 导入（按 公司+职位 判重，已存在即跳过）。
 * 未知渠道 → other，未知状态 → applied，并计入 warns（不静默吞）。
 * 返回 {companies, apps, noteEvents, created, skipped, warns}，纯函数不写库。
 */
function importCSV(text, existingApps, nowMs) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('CSV 为空');
  const head = rows[0].map((h) => String(h).trim());
  const idx = {};
  const want = ['公司', '职位', '渠道', '状态', '投递时间', '最新进展', '最新进展时间', '期望薪资', '地点', '简历版本', '备注'];
  for (const w of want) {
    const i = head.findIndex((h) => h.includes(w));
    if (i >= 0) idx[w] = i;
  }
  if (idx['公司'] == null || idx['职位'] == null) throw new Error('CSV 缺少「公司」或「职位」列');
  const known = new Set((existingApps || []).map((a) => normName(a.companyName) + '|' + normName(a.title)));
  const companies = [];
  const apps = [];
  const noteEvents = [];
  const warns = [];
  let created = 0;
  let skipped = 0;
  const now = nowMs != null ? nowMs : Date.now();
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r];
    const company = displayName(c[idx['公司']]);
    const title = displayName(c[idx['职位']]);
    if (!company || !title) { warns.push(`第 ${r + 1} 行缺公司或职位，跳过`); continue; }
    const dupKey = normName(company) + '|' + normName(title);
    if (known.has(dupKey)) { skipped += 1; continue; }
    known.add(dupKey);
    let channel = 'other';
    const chRaw = idx['渠道'] != null ? String(c[idx['渠道']] || '').trim() : '';
    if (chRaw) {
      if (CHANNEL_LABEL_TO_KEY[chRaw]) channel = CHANNEL_LABEL_TO_KEY[chRaw];
      else if (CHANNELS.includes(chRaw)) channel = chRaw;
      else { channel = 'other'; warns.push(`第 ${r + 1} 行未知渠道「${chRaw}」记为其他`); }
    }
    let status = 'applied';
    const stRaw = idx['状态'] != null ? String(c[idx['状态']] || '').trim() : '';
    if (stRaw) {
      if (STATUS_LABEL_TO_KEY[stRaw]) status = STATUS_LABEL_TO_KEY[stRaw];
      else if (STATUSES.includes(stRaw)) status = stRaw;
      else { status = 'applied'; warns.push(`第 ${r + 1} 行未知状态「${stRaw}」记为已投`); }
    }
    const appliedAtRaw = idx['投递时间'] != null ? c[idx['投递时间']] : '';
    const appliedMs = appliedAtRaw ? parseTs(appliedAtRaw) : null;
    const app = normalizeApp({
      companyName: company, title, channel, status,
      appliedAt: appliedMs != null ? new Date(appliedMs).toISOString() : '',
      salaryPosted: idx['期望薪资'] != null ? c[idx['期望薪资']] : '',
      location: idx['地点'] != null ? c[idx['地点']] : '',
      note: idx['备注'] != null ? c[idx['备注']] : '',
    }, null, company);
    companies.push(normalizeCompany({ name: company }, null));
    apps.push(app);
    created += 1;
    const prog = idx['最新进展'] != null ? String(c[idx['最新进展']] || '').trim() : '';
    if (prog) {
      const progMsRaw = idx['最新进展时间'] != null ? parseTs(c[idx['最新进展时间']]) : null;
      noteEvents.push(normalizeEvent({
        type: 'note', at: progMsRaw != null ? progMsRaw : (appliedMs != null ? appliedMs : now),
        detail: clip(prog, 500),
      }, null, app.id));
    }
  }
  return { companies, apps, noteEvents, created, skipped, warns };
}

// ── 全量导出/导入（JSON 备份语义） ─────────────────────────────────────

function exportAll(data) {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    kind: 'wenjin-backup',
    companies: data.companies || [],
    apps: data.apps || [],
    resumes: data.resumes || [],
    events: data.events || [],
    offers: data.offers || [],
    settings: data.settings || DEFAULT_SETTINGS,
  };
}

function describeStatus(s) { return STATUS_LABELS[s] || s || '?'; }
function describeChannel(c) { return CHANNEL_LABELS[c] || c || '?'; }
function describeEventType(t) { return EVENT_LABELS[t] || t || '?'; }

module.exports = {
  SCHEMA_VERSION, DEFAULT_SETTINGS, DAY_MS, K,
  CHANNELS, CHANNEL_LABELS, STATUSES, STATUS_LABELS, PIPE_STATUSES, ACTIVE_STATUSES,
  EVENT_TYPES, EVENT_LABELS, OUTCOMES, OUTCOME_LABELS, EVENT_STATUS_MAP,
  idFor, clip, normName, displayName, nowIso, parseTs, minuteKey,
  fmtDate, fmtDateTime, tsOrNow,
  normalizeCompany, normalizeApp, normalizeResume, normalizeEvent, normalizeOffer, normalizeSettings,
  pipeline, lastEventAt, followUps, upcoming,
  stageOf, funnelBy, offerCompare, questionBank,
  csvEscape, exportCSV, parseCSV, importCSV,
  exportAll, describeStatus, describeChannel, describeEventType,
};
