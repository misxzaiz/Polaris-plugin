'use strict';
/**
 * tether-core.js —— 人情账本共享核心（单一权威，零依赖）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 bundle）共用：
 * 键空间、人物/往来/承诺归一化、模糊找人、失联分级、生日推算、
 * 承诺分期、往来趋势、人情天平、见面简报。
 * 所有"计算"必须放这里，两侧只做 IO（cap.kv 读写），防止口径漂移。
 *
 * 数据契约（cap.kv `tether.*` 键空间，权威描述见 README）：
 *   tether.settings  → Settings
 *   tether.people    → { v:1, order:[id], byId:{id:Person} }        单对象原子换写
 *   tether.promises  → { v:1, byId:{id:Promise} }                  单对象原子换写
 *   tether.journal   → { v:1, events:[Event] }                     多写者追加，尽力而为
 */

// ── 键空间 ─────────────────────────────────────────────────────────────────
const K = {
  settings: 'tether.settings',
  people: 'tether.people',
  promises: 'tether.promises',
  journal: 'tether.journal',
};

const RELATIONS = ['家人', '伴侣', '朋友', '同事', '客户', '导师', '同学', '其他'];
const CHANNELS = ['见面', '电话', '微信', '视频', '邮件', '其他'];
const EVENT_TYPES = ['contact', 'note', 'favor'];
const FAVOR_DIRECTIONS = ['gave', 'got']; // gave=我帮了他 / got=他帮了我
const PROMISE_DIRECTIONS = ['iowe', 'owedme']; // iowe=我许的 / owedme=我等的
const PROMISE_STATUS = ['open', 'done', 'cancelled'];
const ARCHIVED_FILTERS = ['no', 'only', 'include'];

const MAX_PEOPLE = 500;
const MAX_EVENTS = 2000; // journal FIFO 上限（保最新）
const MAX_OPEN_PROMISES = 200;
const MAX_CLOSED_PROMISES = 500; // 闭环存档上限（裁最旧）

const DEFAULT_SETTINGS = {
  v: 1,
  defaultCadenceDays: 30, // 未单独设置节奏的人按此频率提醒联系
  driftGraceDays: 14, // 超出节奏多少天进红榜（之前是黄榜）
  birthdayDays: 14, // 生日预告窗口
  dueWarnDays: 3, // 承诺临期窗口
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ── 日期（本地时区）────────────────────────────────────────────────────────
const DAY_MS = 24 * 3600 * 1000;
const pad2 = (n) => String(n).padStart(2, '0');

/** epoch ms → 本地 'YYYY-MM-DD' */
function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 当地今天 0 点的 epoch ms */
function midnightOf(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 'today'|'今天'|'yesterday'|'昨天'|'YYYY-MM-DD' → epoch ms（非法 null） */
function resolveDateInput(input, now) {
  const n = typeof now === 'number' ? now : Date.now();
  if (input == null || input === '' || input === 'today' || input === '今天') return n;
  if (input === 'yesterday' || input === '昨天') return n - DAY_MS;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input).trim());
  if (!m) return null;
  const d = new Date(n);
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), d.getHours(), d.getMinutes(), d.getSeconds());
  // 真实日历校验（2026-02-31 会被 JS 滚到 3 月，须拒绝）
  if (Number.isNaN(target.getTime()) || target.getMonth() !== Number(m[2]) - 1) return null;
  return target.getTime();
}

/** 校验生日串：'MM-DD' 或 'YYYY-MM-DD'（闰年 02-29 合法）；合法返回 {month,day,year?} */
function parseBirthday(s) {
  const str = String(s || '').trim();
  let year = null;
  let mmdd = null;
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (full) {
    year = Number(full[1]);
    mmdd = `${full[2]}-${full[3]}`;
  } else if (/^(\d{2})-(\d{2})$/.test(str)) {
    mmdd = str;
  } else {
    return null;
  }
  const [mo, da] = mmdd.split('-').map(Number);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  // 真实日历校验：用 2024（闰年）探 02-29 的合法性
  const probe = new Date(2024, mo - 1, da);
  if (probe.getMonth() !== mo - 1 || probe.getDate() !== da) return null;
  if (year != null && (year < 1900 || year > 2100)) return null;
  return { month: mo, day: da, year };
}

/**
 * 下一个生日：今天=0 天；平年 02-29 回退 03-01（契约见 README）。
 * 返回 { date:'YYYY-MM-DD', daysUntil, turningAge? } 或 null（生日串非法）
 */
function nextBirthday(birthday, now) {
  const p = parseBirthday(birthday);
  if (!p) return null;
  const nowD = new Date(now);
  const today = midnightOf(now);
  const build = (y) => {
    // 平年 02-29 → 03-01
    const probe = new Date(y, p.month - 1, p.day);
    const mo = probe.getMonth() === p.month - 1 && probe.getDate() === p.day ? p.month : p.month + 1;
    const da = probe.getMonth() === p.month - 1 && probe.getDate() === p.day ? p.day : 1;
    return new Date(y, mo - 1, da);
  };
  let cand = build(nowD.getFullYear());
  if (midnightOf(cand.getTime()) < today) cand = build(nowD.getFullYear() + 1);
  const daysUntil = Math.round((midnightOf(cand.getTime()) - today) / DAY_MS);
  const out = {
    date: `${cand.getFullYear()}-${pad2(cand.getMonth() + 1)}-${pad2(cand.getDate())}`,
    daysUntil,
  };
  if (p.year != null) out.turningAge = cand.getFullYear() - p.year;
  return out;
}

// ── id ─────────────────────────────────────────────────────────────────────
function makeId(now) {
  const t = typeof now === 'number' ? now : Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return 't' + t.toString(36) + rand;
}

const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const normText = (s) => {
  const t = String(s ?? '').trim();
  return t || undefined;
};

// ── 设置 ───────────────────────────────────────────────────────────────────
function normalizeSettings(raw) {
  if (raw == null) return { settings: { ...DEFAULT_SETTINGS } };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: '设置必须是对象' };
  const num = (v, lo, hi, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? clamp(Math.round(n), lo, hi) : dflt;
  };
  const settings = {
    v: 1,
    defaultCadenceDays: num(raw.defaultCadenceDays, 7, 365, DEFAULT_SETTINGS.defaultCadenceDays),
    driftGraceDays: num(raw.driftGraceDays, 3, 90, DEFAULT_SETTINGS.driftGraceDays),
    birthdayDays: num(raw.birthdayDays, 1, 90, DEFAULT_SETTINGS.birthdayDays),
    dueWarnDays: num(raw.dueWarnDays, 1, 30, DEFAULT_SETTINGS.dueWarnDays),
  };
  return { settings };
}

// ── 人物 ───────────────────────────────────────────────────────────────────
function normalizePerson(raw) {
  if (!raw || typeof raw !== 'object') return { error: '缺少人物数据' };
  const name = clip(raw.name, 40);
  if (!name) return { error: '名字不能为空' };
  const birthday = raw.birthday == null || raw.birthday === '' ? undefined : (() => {
    const p = parseBirthday(raw.birthday);
    if (!p) return { __invalid: true };
    return String(raw.birthday).trim();
  })();
  if (birthday && birthday.__invalid) return { error: '生日格式应为 MM-DD 或 YYYY-MM-DD（真实存在的日期）' };
  let cadenceDays = null;
  if (raw.cadenceDays != null) {
    const n = Number(raw.cadenceDays);
    if (!Number.isFinite(n)) return { error: `cadenceDays 应为 7..365 的天数（收到：${raw.cadenceDays}）` };
    cadenceDays = clamp(Math.round(n), 7, 365);
  }
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => clip(t, 12)).filter(Boolean).slice(0, 8)
    : undefined;
  const c = raw.contacts && typeof raw.contacts === 'object' ? raw.contacts : {};
  const contacts = {};
  for (const f of ['phone', 'wechat', 'email', 'other']) {
    if (c[f] != null && String(c[f]).trim()) contacts[f] = clip(c[f], 80);
  }
  const person = {
    id: clip(raw.id, 60) || makeId(),
    name,
    alias: normText(clip(raw.alias, 40)),
    relation: RELATIONS.includes(raw.relation) ? raw.relation : '其他',
    tags,
    howMet: normText(clip(raw.howMet, 200)),
    birthday,
    contacts,
    cadenceDays,
    note: normText(clip(raw.note, 500)),
    pinned: raw.pinned === true,
    archivedAt: raw.archivedAt != null ? raw.archivedAt : undefined,
    createdAt: Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Number(raw.createdAt) : Date.now(),
    updatedAt: Number.isFinite(Number(raw.updatedAt)) && Number(raw.updatedAt) > 0 ? Number(raw.updatedAt) : Date.now(),
  };
  return { person };
}

/** 往来事件归一化；favor 必带 direction，contact 的 channel 收编进枚举 */
function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return { error: '缺少往来数据' };
  const personId = clip(raw.personId, 60);
  if (!personId) return { error: '缺少 personId（先 ren_person_list 找人）' };
  const text = clip(raw.text, 300);
  if (!text) return { error: '内容不能为空（发生了什么总得记一句）' };
  const type = EVENT_TYPES.includes(raw.type) ? raw.type : 'contact';
  const at = Number.isFinite(Number(raw.at)) && Number(raw.at) > 0 ? Number(raw.at) : Date.now();
  const ev = { id: clip(raw.id, 60) || makeId(at), at, personId, type, text };
  if (type === 'contact') {
    ev.channel = CHANNELS.includes(raw.channel) ? raw.channel : '其他';
  } else if (type === 'favor') {
    if (!FAVOR_DIRECTIONS.includes(raw.direction)) {
      return { error: "人情往来须指明 direction：'gave'（我帮了他）或 'got'（他帮了我）" };
    }
    ev.direction = raw.direction;
  }
  return { event: ev };
}

/** 承诺归一化 */
function normalizePromise(raw) {
  if (!raw || typeof raw !== 'object') return { error: '缺少承诺数据' };
  const personId = clip(raw.personId, 60);
  if (!personId) return { error: '缺少 personId（承诺总要有个对象）' };
  const text = clip(raw.text, 200);
  if (!text) return { error: '内容不能为空（答应了什么）' };
  if (!PROMISE_DIRECTIONS.includes(raw.direction)) {
    return { error: "direction 必须是 'iowe'（我许的）或 'owedme'（我等的）" };
  }
  let due;
  if (raw.due != null && raw.due !== '') {
    const t = resolveDateInput(raw.due, Date.now());
    if (t == null) return { error: '期限格式应为 YYYY-MM-DD' };
    due = dayKeyOf(t);
  }
  const p = {
    id: clip(raw.id, 60) || makeId(),
    personId,
    direction: raw.direction,
    text,
    createdAt: Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Number(raw.createdAt) : Date.now(),
    due,
    status: PROMISE_STATUS.includes(raw.status) ? raw.status : 'open',
  };
  if (p.status !== 'open') {
    p.closedAt = Number.isFinite(Number(raw.closedAt)) && Number(raw.closedAt) > 0 ? Number(raw.closedAt) : Date.now();
    p.closeNote = normText(clip(raw.closeNote, 200));
  } else {
    if (raw.closeNote != null) p.closeNote = normText(clip(raw.closeNote, 200));
  }
  return { promise: p };
}

// ── 集合操作 ───────────────────────────────────────────────────────────────
/** 往来追加（按 id 幂等去重）+ 按 at 排序 + FIFO 裁剪（保最新） */
function appendEvents(existing, events, cap = MAX_EVENTS) {
  const map = new Map();
  for (const e of existing || []) if (e && typeof e === 'object' && e.id) map.set(e.id, e);
  for (const e of events || []) if (e && e.id) map.set(e.id, e);
  return [...map.values()].sort((a, b) => a.at - b.at).slice(-cap);
}

/** 闭环承诺存档裁剪（closedAt 最旧的先裁） */
function trimClosedPromises(byId, cap = MAX_CLOSED_PROMISES) {
  const closed = Object.values(byId || {}).filter((p) => p && p.status !== 'open');
  if (closed.length <= cap) return byId;
  closed.sort((a, b) => (a.closedAt || 0) - (b.closedAt || 0));
  const drop = new Set(closed.slice(0, closed.length - cap).map((p) => p.id));
  const next = {};
  for (const [id, p] of Object.entries(byId || {})) if (!drop.has(id)) next[id] = p;
  return next;
}

/**
 * 模糊找人：名/备注精确 → 名+备注唯一包含（≥2 字符）。
 * 返回 { person } | { ambiguous:[{id,name,alias}] } | null（一个都没有）
 */
function findPerson(name, people) {
  const q = String(name || '').trim().toLowerCase();
  if (!q) return null;
  const list = Object.values(people || {});
  const exact = list.filter((p) => p && (p.name.toLowerCase() === q || String(p.alias || '').toLowerCase() === q));
  if (exact.length === 1) return { person: exact[0] };
  if (exact.length > 1) return { ambiguous: exact.map((p) => ({ id: p.id, name: p.name, alias: p.alias })) };
  if (q.length < 2) return null;
  const partial = list.filter(
    (p) => p && (p.name.toLowerCase().includes(q) || String(p.alias || '').toLowerCase().includes(q)),
  );
  if (partial.length === 1) return { person: partial[0] };
  if (partial.length > 1) return { ambiguous: partial.map((p) => ({ id: p.id, name: p.name, alias: p.alias })) };
  return null;
}

/** 某人最近一次 contact 事件的 epoch；无往来返回 null */
function lastContactAt(personId, events) {
  let last = null;
  for (const e of events || []) {
    if (e && e.personId === personId && e.type === 'contact' && (last == null || e.at > last)) last = e.at;
  }
  return last;
}

/** 任意事件（含便签/人情）的最近 epoch；无返回 null */
function lastEventAt(personId, events) {
  let last = null;
  for (const e of events || []) {
    if (e && e.personId === personId && (last == null || e.at > last)) last = e.at;
  }
  return last;
}

/**
 * 失联分级（可解释）：daysSince = now - 最近 contact（无 contact 回退建档时间）；
 * overdue = daysSince - cadence（节奏）；≤0 ok，≤grace warn，>grace lost。
 * 归档者剔除；置顶者照常参与（置顶恰说明重要，失联更该知道）。
 * 排序：lost > warn > ok，同级别 overdue 大者先。
 */
function driftList(people, events, settings, now) {
  const s = settings || DEFAULT_SETTINGS;
  const grace = s.driftGraceDays ?? DEFAULT_SETTINGS.driftGraceDays;
  const out = [];
  for (const p of Object.values(people || {})) {
    if (!p || p.archivedAt) continue;
    const cadence = p.cadenceDays || s.defaultCadenceDays || DEFAULT_SETTINGS.defaultCadenceDays;
    const last = lastContactAt(p.id, events);
    const baseline = last != null ? last : p.createdAt || now;
    const daysSince = Math.max(0, Math.floor((now - baseline) / DAY_MS));
    const overdue = daysSince - cadence;
    const level = overdue <= 0 ? 'ok' : overdue <= grace ? 'warn' : 'lost';
    out.push({
      personId: p.id,
      name: p.name,
      alias: p.alias,
      relation: p.relation,
      daysSince,
      cadence,
      overdue,
      level,
      lastAt: last,
      neverContacted: last == null,
      text: last == null
        ? `从未记过往来（建档 ${daysSince} 天，节奏 ${cadence} 天）`
        : `${daysSince} 天未联系（节奏 ${cadence} 天）`,
    });
  }
  const rank = { lost: 0, warn: 1, ok: 2 };
  out.sort((a, b) => rank[a.level] - rank[b.level] || b.overdue - a.overdue);
  return out;
}

/** 未来 N 天生日（含今天；按天数升序） */
function birthdayUpcoming(people, days, now) {
  const out = [];
  for (const p of Object.values(people || {})) {
    if (!p || p.archivedAt || !p.birthday) continue;
    const nb = nextBirthday(p.birthday, now);
    if (!nb || nb.daysUntil > days) continue;
    out.push({ personId: p.id, name: p.name, birthday: p.birthday, ...nb });
  }
  out.sort((a, b) => a.daysUntil - b.daysUntil);
  return out;
}

/** 承诺到期状态：overdue（红）/ dueSoon（黄）/ scheduled / none */
function dueState(due, now, warnDays) {
  if (!due) return { kind: 'none', label: '无期限' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
  if (!m) return { kind: 'none', label: '无期限' };
  const dueMid = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const days = Math.round((dueMid - midnightOf(now)) / DAY_MS);
  if (days < 0) return { kind: 'overdue', days: -days, label: `逾期 ${-days} 天` };
  if (days === 0) return { kind: 'dueSoon', days: 0, label: '今天到期' };
  if (days <= warnDays) return { kind: 'dueSoon', days, label: `${days} 天后到期` };
  return { kind: 'scheduled', days, label: `${days} 天后到期` };
}

/**
 * 承诺看板：open 分 overdue → dueSoon → scheduled → openNoDue；
 * closed 单列（closedAt 倒序）。条目附人员名与到期态。
 */
function promiseBoard(promises, people, now, settings) {
  const s = settings || DEFAULT_SETTINGS;
  const board = { overdue: [], dueSoon: [], scheduled: [], openNoDue: [], closed: [] };
  for (const p of Object.values(promises || {})) {
    if (!p) continue;
    const person = (people || {})[p.personId];
    const item = { ...p, personName: person ? person.name : '（已删除）', due: p.due || undefined };
    if (p.status === 'open') {
      const st = dueState(p.due, now, s.dueWarnDays ?? 3);
      item.dueState = st;
      if (st.kind === 'overdue') board.overdue.push(item);
      else if (st.kind === 'dueSoon') board.dueSoon.push(item);
      else if (st.kind === 'scheduled') board.scheduled.push(item);
      else board.openNoDue.push(item);
    } else {
      board.closed.push(item);
    }
  }
  const byDue = (a, b) => (a.dueState?.days ?? 0) - (b.dueState?.days ?? 0);
  board.overdue.sort(byDue);
  board.dueSoon.sort(byDue);
  board.scheduled.sort(byDue);
  board.closed.sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
  return board;
}

/** 近 N 个月联系事件月度计数（含当月） */
function contactTrend(events, months, now) {
  const n = clamp(Math.round(Number(months) || 12), 1, 24);
  const base = new Date(now);
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const e of events || []) {
    if (!e || e.type !== 'contact') continue;
    const d = new Date(e.at);
    const k = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    if (counts.has(k)) counts.set(k, counts.get(k) + 1);
  }
  return keys.map((k) => ({ month: k, count: counts.get(k) }));
}

/** 人情天平：按人 gave/got 计数（中性呈现，不折算钱） */
function favorBalance(events) {
  const byPerson = {};
  for (const e of events || []) {
    if (!e || e.type !== 'favor' || !FAVOR_DIRECTIONS.includes(e.direction)) continue;
    const rec = (byPerson[e.personId] = byPerson[e.personId] || { gave: 0, got: 0 });
    rec[e.direction] += 1;
  }
  return byPerson;
}

/**
 * 见面简报：档案 + 最近 5 笔往来 + 未闭环承诺 + 人情天平 + 状态提示。
 * 纯函数输出文本，面板与 MCP 共用同一份口径。
 */
function personPack(person, events, promises, now, settings) {
  const s = settings || DEFAULT_SETTINGS;
  const my = (events || []).filter((e) => e && e.personId === person.id).sort((a, b) => b.at - a.at);
  const myPromises = Object.values(promises || {}).filter((p) => p && p.personId === person.id && p.status === 'open');
  const lines = [];
  const rel = person.relation === '其他' ? '' : `（${person.relation}）`;
  lines.push(`【${person.name}】${rel}`);
  if (person.alias && person.alias !== person.name) lines.push(`称呼：${person.alias}`);
  if (person.tags && person.tags.length) lines.push(`标签：${person.tags.join('、')}`);
  if (person.howMet) lines.push(`怎么认识：${person.howMet}`);
  if (person.birthday) {
    const nb = nextBirthday(person.birthday, now);
    if (nb) {
      const ageTxt = nb.turningAge != null ? `，将满 ${nb.turningAge}` : '';
      lines.push(`生日：${person.birthday}（${nb.daysUntil === 0 ? '今天！' : `还有 ${nb.daysUntil} 天`}${ageTxt}）`);
    }
  }
  const cadence = person.cadenceDays || s.defaultCadenceDays;
  const ch = [];
  if (person.contacts) for (const [f, v] of Object.entries(person.contacts)) if (v) ch.push(`${f}:${v}`);
  if (ch.length) lines.push(`联系渠道：${ch.join(' / ')}`);
  if (person.note) lines.push(`备注：${person.note}`);

  if (my.length) {
    lines.push('最近往来：');
    for (const e of my.slice(0, 5)) {
      const tag = e.type === 'contact' ? (e.channel || '联系') : e.type === 'favor' ? (e.direction === 'gave' ? '帮了他' : '他帮我') : '便签';
      lines.push(`  ${dayKeyOf(e.at)} ${tag} · ${e.text}`);
    }
  } else {
    lines.push('最近往来：（还没有记录）');
  }
  if (myPromises.length) {
    lines.push('未闭环承诺：');
    for (const p of myPromises) {
      const dir = p.direction === 'iowe' ? '我许的' : '我等的';
      const st = dueState(p.due, now, s.dueWarnDays ?? 3);
      lines.push(`  [${dir}] ${p.text}（${st.label}）`);
    }
  }
  const bal = favorBalance(events)[person.id];
  if (bal && (bal.gave || bal.got)) lines.push(`人情天平：帮了他 ${bal.gave} 次 / 他帮我 ${bal.got} 次`);
  const last = lastContactAt(person.id, events);
  if (last != null) {
    const daysSince = Math.floor((now - last) / DAY_MS);
    const overdue = daysSince - cadence;
    lines.push(overdue > 0
      ? `状态：${daysSince} 天未联系（节奏 ${cadence} 天）${overdue > (s.driftGraceDays ?? 14) ? '，已在失联红榜' : '，该联系了'}`
      : `状态：联系节奏正常（最近 ${daysSince} 天前）`);
  }
  return lines.join('\n');
}

/** 全量导出（设置页/导出工具共用结构） */
function exportAll(settings, people, promises, journal) {
  return {
    app: 'tether',
    exportedAt: new Date().toISOString(),
    settings: settings || DEFAULT_SETTINGS,
    people: (people && people.byId) || {},
    promises: (promises && promises.byId) || {},
    journal: (journal && journal.events) || [],
  };
}

module.exports = {
  K, RELATIONS, CHANNELS, EVENT_TYPES, FAVOR_DIRECTIONS, PROMISE_DIRECTIONS, PROMISE_STATUS, ARCHIVED_FILTERS,
  MAX_PEOPLE, MAX_EVENTS, MAX_OPEN_PROMISES, MAX_CLOSED_PROMISES,
  DEFAULT_SETTINGS,
  DAY_MS, dayKeyOf, midnightOf, resolveDateInput, parseBirthday, nextBirthday,
  makeId, clamp,
  normalizeSettings, normalizePerson, normalizeEvent, normalizePromise,
  appendEvents, trimClosedPromises, findPerson,
  lastContactAt, lastEventAt, driftList, birthdayUpcoming, dueState, promiseBoard,
  contactTrend, favorBalance, personPack, exportAll,
};
