#!/usr/bin/env node
'use strict';
/**
 * maian MCP Server —— 脉案（家庭体征台账）的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现，
 * 与面板同读同一份事实库）中 maian.* 键空间的读写。零外网请求、零服务进程。
 *
 * 工具一览（AI 侧约定：这是「家庭体征记录」，不是医疗诊断——分带为通用参考
 * 区间，输出文本均携带「请遵医嘱」；不推断病情、不推荐用药）：
 *   maian_log      记一笔体征（血压/血糖/体重/体温；按名自动配成员；id 幂等覆盖）
 *   maian_query    查询：recent 近期记录 / stats 区间统计 / flags 红黄榜 / members 成员
 *   maian_member   成员建档/列表/改档案（身高用于 BMI 分带）
 *   maian_update   按 id 修改一笔（值/时间/备注/成员；跨日自动迁移日键）
 *   maian_delete   删一笔（confirm 门）
 *   maian_summary  就诊小结（成员+时间段 → 结构化 markdown，复诊可直接给医生）
 *
 * 写幂等：maian_log 传 id 时覆盖同 id 记录（AI 重试不双写）；normalizeRecord 为
 * 唯一写入口径（与面板同源 core）。
 */
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const SERVER_NAME = 'maian';
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
  member: (id) => `maian.member.${id}`,
  memberPrefix: 'maian.member.',
  day: (date) => `maian.day.${date}`,
  dayPrefix: 'maian.day.',
};

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

// ── 数据访问（家庭量级：日键千级/年以内，全扫可接受）────────────────────────
async function listMembers() {
  const keys = await kv.kvKeys();
  const mine = keys.filter((k) => k.startsWith(K.memberPrefix));
  const out = await Promise.all(mine.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' && v.id ? v : null;
  }));
  return out.filter(Boolean);
}
function dayDateOf(key) { return key.slice(K.dayPrefix.length); }
function isValidDayKey(key) { return core.parseDayKey(dayDateOf(key)) !== null; }

async function readDay(date) {
  const v = await kv.kvGet(K.day(date)).catch(() => null);
  return Array.isArray(v) ? v : [];
}
/** 全部记录（跨日键；自动跳过非法日期键） */
async function readAllRecords() {
  const keys = await kv.kvKeys();
  const days = keys.filter((k) => k.startsWith(K.dayPrefix) && isValidDayKey(k));
  const out = [];
  for (const k of days) {
    const arr = await readDay(dayDateOf(k));
    for (const r of arr) if (r && typeof r === 'object' && r.id) out.push(r);
  }
  return out;
}

/** 按名/id 只查不建（query/summary 用——打错字不该长出垃圾成员） */
function lookupMember(input, members) {
  const pid = core.clip(input.profileId || '', 64);
  if (pid) {
    const hit = members.find((m) => m.id === pid);
    if (!hit) return { error: `找不到成员 ${pid}` };
    return { member: hit };
  }
  const name = core.clip(input.profileName || input.name || '', 40);
  if (!name) return { error: '需提供 profileId 或 profileName' };
  const hit = members.find((m) => m.name === name);
  if (!hit) return { error: `找不到成员「${name}」（先 maian_member action=add 建档，或确认名字）` };
  return { member: hit };
}

/** 按名自动配成员（仅记录场景；与青囊 resolveProfile 同模式） */
async function resolveMember(input, members) {
  const hit = lookupMember(input, members);
  if (hit.member || (input.profileId && hit.error)) return hit;
  if (input.profileId) return hit; // 指定 id 时不自动建档
  const name = core.clip(input.profileName || input.name || '', 40);
  const r = core.normalizeMember({ name }, null);
  if (r.error) return { error: r.error };
  await kv.kvSet(K.member(r.member.id), r.member);
  return { member: r.member, created: true };
}

/** 按成员+区间过滤记录 */
function filterRecords(records, { member, kind, from, to }) {
  let rs = records;
  if (member) rs = rs.filter((r) => r.profileId === member.id);
  if (kind) rs = rs.filter((r) => r.kind === kind);
  if (from) {
    const t = core.parseDayKey(from);
    if (t === null) return { error: `起始日期 ${JSON.stringify(from)} 无法识别` };
    rs = rs.filter((r) => r.ts >= t);
  }
  if (to) {
    const t = core.parseDayKey(to);
    if (t === null) return { error: `截止日期 ${JSON.stringify(to)} 无法识别` };
    rs = rs.filter((r) => r.ts < t + core.DAY_MS);
  }
  return { records: rs };
}

function nameOf(member) { return member ? member.name : '未知成员'; }

/** 一条记录的对话式呈现（含分带与建议留意文本） */
function lineOf(r, member) {
  const b = core.bandOf(r.kind, r, member && member.heightCm);
  return `${core.fmtDT(r.ts)} ${nameOf(member)} ${core.KIND_META[r.kind].label} ${core.fmtValue(r)}【${b.label}】${b.level !== 'green' && b.level !== 'none' ? `（${b.text}）` : ''}${r.note ? ` · ${r.note}` : ''}`;
}

function bandDigest(records, member) {
  const st = core.statsFor(records, () => member && member.heightCm);
  return `共 ${st.count} 条（绿 ${st.bands.green} / 黄 ${st.bands.yellow} / 红 ${st.bands.red} / 急 ${st.bands.urgent}）`;
}

// ── 工具实现 ──────────────────────────────────────────────────────────────────
async function toolLog(args) {
  const now = Date.now();
  const members = await listMembers();
  const rm = await resolveMember(args, members);
  if (rm.error) return err(rm.error);
  const member = rm.member;
  const nr = core.normalizeRecord({
    id: args.id,
    profileId: member.id,
    kind: args.kind,
    sys: args.sys, dia: args.dia, pulse: args.pulse,
    mmol: args.mmol, slot: args.slot,
    kg: args.kg, c: args.c,
    date: args.date, time: args.time,
    note: args.note, src: 'ai',
  }, now);
  if (nr.error) return err(nr.error);
  const record = nr.record;
  const date = core.dayKeyOfTs(record.ts);
  const dayArr = await readDay(date);
  const existed = Array.isArray(dayArr) && dayArr.some((r) => r && r.id === record.id);
  await kv.kvSet(K.day(date), core.upsertRecord(dayArr, record));

  // 反馈：分带 + 与该成员该指标上一次记录的对比
  const all = await readAllRecords();
  const mine = all.filter((r) => r.profileId === member.id && r.kind === record.kind && r.ts < record.ts);
  mine.sort((a, b) => a.ts - b.ts);
  const prev = mine[mine.length - 1] || null;
  const b = core.bandOf(record.kind, record, member.heightCm);
  let delta = '';
  if (prev) {
    const diffParts = [];
    if (record.kind === 'bp') {
      if (prev.sys !== undefined) diffParts.push(`收缩压 ${record.sys - prev.sys >= 0 ? '+' : ''}${record.sys - prev.sys}`);
      if (prev.dia !== undefined) diffParts.push(`舒张压 ${record.dia - prev.dia >= 0 ? '+' : ''}${record.dia - prev.dia}`);
    } else if (record.kind === 'bg') diffParts.push(`${record.mmol - prev.mmol >= 0 ? '+' : ''}${core.round1(record.mmol - prev.mmol)} mmol/L`);
    else if (record.kind === 'weight') diffParts.push(`${record.kg - prev.kg >= 0 ? '+' : ''}${core.round1(record.kg - prev.kg)} kg`);
    else diffParts.push(`${record.c - prev.c >= 0 ? '+' : ''}${core.round1(record.c - prev.c)} ℃`);
    if (diffParts.length) delta = `；较上次（${core.fmtDT(prev.ts)}）${diffParts.join('，')}`;
  }
  const today = all.filter((r) => r.profileId === member.id && core.dayKeyOfTs(r.ts) === core.dayKey(now));
  const lines = [
    `${existed ? '已覆盖更新' : '已记录'}：${lineOf(record, member)}`,
    `分带：${b.label}——${b.text}（${core.BAND_NOTE}）${delta}`,
    `今日该成员已有 ${today.length} 条记录：${today.map((r) => `${core.KIND_META[r.kind].label} ${core.fmtValue(r)}`).join('、') || '（本条为今日首条）'}`,
  ];
  if (rm.created) lines.push(`（成员「${member.name}」不存在，已自动建档${member.heightCm ? '' : '；可在 maian_member 里补身高以启用 BMI 分带'}）`);
  return ok(lines.join('\n'));
}

async function toolQuery(args) {
  const view = ['recent', 'stats', 'flags', 'members'].includes(args.view) ? args.view : 'recent';
  if (view === 'members') {
    const members = await listMembers();
    if (!members.length) return ok('还没有成员档案。用 maian_member action=add 建档，或直接 maian_log 用 profileName 自动建档。');
    const membersWithCount = await (async () => {
      const all = await readAllRecords();
      return members.map((m) => ({ m, n: all.filter((r) => r.profileId === m.id).length }));
    })();
    return ok(membersWithCount
      .sort((a, b) => b.n - a.n)
      .map(({ m, n }) => `${m.name}（${m.id}）${m.heightCm ? ` 身高${m.heightCm}cm` : ''}${m.note ? ` · ${m.note}` : ''} · 累计 ${n} 条`)
      .join('\n'));
  }
  const members = await listMembers();
  let member = null;
  if (args.profileId || args.profileName) {
    const rm = lookupMember(args, members); // 查询只查不建——打错字不该长出垃圾成员
    if (rm.error) return err(rm.error);
    member = rm.member;
  }
  const kind = core.KINDS.includes(args.kind) ? args.kind : undefined;
  const from = args.from || undefined;
  const to = args.to || undefined;
  const all = await readAllRecords();
  const fr = filterRecords(all, { member, kind, from, to });
  if (fr.error) return err(fr.error);
  let rs = fr.records;
  if (!member && view !== 'recent') {
    return err('stats/flags 视图需指定成员（profileId 或 profileName）——跨成员统计口径无意义');
  }
  rs.sort((a, b) => b.ts - a.ts);
  if (view === 'stats') {
    const st = core.statsFor(rs, (pid) => (member && pid === member.id ? member.heightCm : undefined));
    const f = Object.entries(st.fields).map(([k, v]) => `${k}: 均值 ${v.avg}（${v.min}~${v.max}，n=${v.n}）`).join('；');
    return ok([
      `${nameOf(member)}${kind ? ` ${core.KIND_META[kind].label}` : ''}（${from || '最早'} ~ ${to || '今天'}）`,
      `记录 ${st.count} 条；分带 绿${st.bands.green}/黄${st.bands.yellow}/红${st.bands.red}/急${st.bands.urgent}`,
      f || '（无数值统计）',
      st.latest ? `最近一次：${lineOf(st.latest, member)}` : '',
      core.BAND_NOTE,
    ].filter(Boolean).join('\n'));
  }
  if (view === 'flags') {
    const flagged = rs.filter((r) => {
      const b = core.bandOf(r.kind, r, member && member.heightCm);
      return b.level === 'yellow' || b.level === 'red' || b.level === 'urgent';
    });
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
    if (!flagged.length) return ok(`${nameOf(member)} 在该时间段没有黄/红分带的记录。（${core.BAND_NOTE}）`);
    return ok([
      `${nameOf(member)} 黄/红榜（最近 ${Math.min(flagged.length, limit)} 条，共 ${flagged.length} 条）：`,
      ...flagged.slice(0, limit).map((r) => lineOf(r, member)),
      core.BAND_NOTE,
    ].join('\n'));
  }
  // recent
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 200);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  if (!rs.length) {
    return ok(`没有符合条件的记录${member ? `（${member.name}）` : ''}${kind ? `（${core.KIND_META[kind].label}）` : ''}。`);
  }
  return ok([
    `近期记录（最近 ${Math.min(rs.length, limit)} 条，共 ${rs.length} 条）：`,
    ...rs.slice(0, limit).map((r) => lineOf(r, memberMap.get(r.profileId))),
    core.BAND_NOTE,
  ].join('\n'));
}

async function toolMember(args) {
  const action = ['add', 'list', 'update'].includes(args.action) ? args.action : 'list';
  const members = await listMembers();
  if (action === 'list') {
    if (!members.length) return ok('还没有成员档案。用 maian_member action=add name=xx 建档，或直接 maian_log profileName=xx 自动建档。');
    const all = await readAllRecords();
    return ok(members.sort((a, b) => a.createdAt - b.createdAt).map((m) => {
      const n = all.filter((r) => r.profileId === m.id).length;
      return `${m.name}（${m.id}）${m.heightCm ? ` 身高${m.heightCm}cm` : ''}${m.note ? ` · ${m.note}` : ''} · 累计 ${n} 条`;
    }).join('\n'));
  }
  if (action === 'add') {
    const name = core.clip(args.name, 40);
    if (!name) return err('建档需提供 name');
    if (members.some((m) => m.name === name)) return err(`成员「${name}」已存在（直接记录即可，或用 action=update 改档案）`);
    const r = core.normalizeMember({ name, heightCm: args.heightCm, note: args.note }, null);
    if (r.error) return err(r.error);
    await kv.kvSet(K.member(r.member.id), r.member);
    return ok(`已建档：${r.member.name}（${r.member.id}）${r.member.heightCm ? `，身高 ${r.member.heightCm}cm（BMI 分带已启用）` : ''}`);
  }
  // update
  const pid = core.clip(args.profileId, 64);
  const hit = members.find((m) => m.id === pid) || members.find((m) => m.name === core.clip(args.name, 40));
  if (!hit) return err('未找到成员（提供 profileId 或准确的现有 name）');
  const r = core.normalizeMember({ name: args.name !== undefined ? args.name : hit.name, heightCm: args.heightCm, note: args.note }, hit);
  if (r.error) return err(r.error);
  await kv.kvSet(K.member(r.member.id), r.member);
  return ok(`已更新：${r.member.name}（${r.member.id}）${r.member.heightCm ? `，身高 ${r.member.heightCm}cm` : ''}`);
}

/** 定位一笔记录（跨全部日键扫描；家庭量级可接受） */
async function locateRecord(id) {
  const keys = await kv.kvKeys();
  const days = keys.filter((k) => k.startsWith(K.dayPrefix) && isValidDayKey(k));
  for (const k of days) {
    const arr = await readDay(dayDateOf(k));
    const hit = Array.isArray(arr) ? arr.find((r) => r && r.id === id) : null;
    if (hit) return { date: dayDateOf(k), dayArr: arr, record: hit };
  }
  return null;
}

async function toolUpdate(args) {
  const id = core.clip(args.id, 64);
  if (!id) return err('需提供要修改的记录 id（先 maian_query 查到）');
  const loc = await locateRecord(id);
  if (!loc) return err(`未找到记录 ${id}`);
  const members = await listMembers();
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const old = loc.record;
  const rm = await resolveMember({
    profileId: args.profileId || args.memberId,
    profileName: args.profileName || args.memberName,
  }, members);
  const member = rm.error ? memberMap.get(old.profileId) : rm.member;
  if (!member) return err('原记录所属成员缺失且未提供可解析的成员');
  if (rm.member && rm.created) return err('update 不会自动新建成员——请使用现有成员名或先建档');
  const nr = core.normalizeRecord({
    id: old.id,
    profileId: member.id,
    kind: args.kind !== undefined ? args.kind : old.kind,
    sys: args.sys !== undefined ? args.sys : old.sys,
    dia: args.dia !== undefined ? args.dia : old.dia,
    pulse: args.pulse !== undefined ? args.pulse : old.pulse,
    mmol: args.mmol !== undefined ? args.mmol : old.mmol,
    slot: args.slot !== undefined ? args.slot : old.slot,
    kg: args.kg !== undefined ? args.kg : old.kg,
    c: args.c !== undefined ? args.c : old.c,
    date: args.date, time: args.time,
    note: args.note !== undefined ? args.note : old.note,
    src: old.src,
  }, Date.now());
  if (nr.error) return err(nr.error);
  const record = nr.record;
  const newDate = core.dayKeyOfTs(record.ts);
  if (newDate === loc.date) {
    await kv.kvSet(K.day(loc.date), core.upsertRecord(loc.dayArr, record));
  } else {
    const removed = core.removeRecord(loc.dayArr, id);
    await kv.kvSet(K.day(loc.date), removed.arr);
    const targetArr = await readDay(newDate);
    await kv.kvSet(K.day(newDate), core.upsertRecord(targetArr, record));
  }
  const b = core.bandOf(record.kind, record, member.heightCm);
  return ok([
    newDate === loc.date ? '已修改' : `已修改并迁移到 ${newDate}`,
    lineOf(record, member),
    `分带：${b.label}——${b.text}（${core.BAND_NOTE}）`,
  ].join('\n'));
}

async function toolDelete(args) {
  const id = core.clip(args.id, 64);
  if (!id) return err('需提供要删除的记录 id（先 maian_query 查到）');
  if (args.confirm !== true) return err('删除需显式 confirm:true（不可逆；建议先 maian_query 核对 id）');
  const loc = await locateRecord(id);
  if (!loc) return err(`未找到记录 ${id}`);
  const removed = core.removeRecord(loc.dayArr, id);
  await kv.kvSet(K.day(loc.date), removed.arr);
  const members = await listMembers();
  const member = members.find((m) => m.id === loc.record.profileId);
  return ok(`已删除：${lineOf(loc.record, member)}`);
}

async function toolSummary(args) {
  const members = await listMembers();
  if (!members.length) return err('还没有成员档案，先 maian_member action=add 或 maian_log profileName=xx');
  const rm = lookupMember(args, members); // 小结只查不建，同查询口径
  if (rm.error) return err(rm.error);
  const member = rm.member;
  const now = Date.now();
  const to = args.to || core.dayKey(now);
  const from = args.from || core.dayKey(now - 29 * core.DAY_MS);
  if (core.parseDayKey(from) === null || core.parseDayKey(to) === null) return err('from/to 须为 YYYY-MM-DD');
  if (core.parseDayKey(to) < core.parseDayKey(from)) return err('to 早于 from');
  if (core.dayDiff(to, from) !== null && core.dayDiff(to, from) > 400) return err('时间跨度请控制在 400 天以内');
  const all = await readAllRecords();
  const fr = filterRecords(all, { member, from, to });
  if (fr.error) return err(fr.error);
  const md = core.buildSummary({ member, from, to, records: fr.records });
  return ok(`${md}\n\n（${bandDigest(fr.records, member)}）`);
}

// ── 工具声明（schema 与实现一一对应；「一义一名」——字段名跨工具不换义）─────────
const TOOLS = [
  {
    name: 'maian_log',
    description: '脉案·记一笔家庭体征（血压/血糖/体重/体温）。成员不存在时按 profileName 自动建档。' +
      '血压给 sys/dia（可选 pulse）；血糖给 mmol + slot（fasting空腹/after2h餐后2h/random随机/bedtime睡前）；体重给 kg；体温给 c。' +
      'date 支持 today/yesterday/YYYY-MM-DD，time 为 HH:MM（缺省当前）。传 id 可幂等覆盖（AI 重试防双写）。' +
      '返回通用参考分带（非医疗建议）与较上次的变化。',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: '成员 id（与 profileName 二选一）' },
        profileName: { type: 'string', description: '成员名（不存在则自动建档）' },
        kind: { type: 'string', enum: core.KINDS, description: 'bp血压/bg血糖/weight体重/temp体温' },
        sys: { type: 'integer', description: '收缩压 mmHg（60-260，kind=bp 必填）' },
        dia: { type: 'integer', description: '舒张压 mmHg（30-160，须小于 sys）' },
        pulse: { type: 'integer', description: '心率（30-220，可选）' },
        mmol: { type: 'number', description: '血糖 mmol/L（1.0-40.0，kind=bg 必填）' },
        slot: { type: 'string', enum: core.BG_SLOTS, description: '血糖时点（缺省 random）' },
        kg: { type: 'number', description: '体重 kg（2.0-300.0，kind=weight 必填）' },
        c: { type: 'number', description: '体温 ℃（33.0-43.0，kind=temp 必填）' },
        date: { type: 'string', description: 'today/yesterday/YYYY-MM-DD（缺省今天）' },
        time: { type: 'string', description: 'HH:MM（缺省当前时刻）' },
        note: { type: 'string', description: '备注（如「服药前」「运动后」，≤200 字）' },
        id: { type: 'string', description: '幂等键：传已有 id 则覆盖该条' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'maian_query',
    description: '脉案·查询体征记录。view=recent 近期记录（默认）/ stats 指标统计（需成员）/ flags 黄红榜（需成员）/ members 成员一览。' +
      '可按成员、指标种类、日期区间过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['recent', 'stats', 'flags', 'members'] },
        profileId: { type: 'string' },
        profileName: { type: 'string' },
        kind: { type: 'string', enum: core.KINDS },
        from: { type: 'string', description: 'YYYY-MM-DD（含）' },
        to: { type: 'string', description: 'YYYY-MM-DD（含）' },
        limit: { type: 'integer', description: 'recent/flags 返回条数上限（默认 20）' },
      },
    },
  },
  {
    name: 'maian_member',
    description: '脉案·成员档案管理：action=add 建档（name 必填，heightCm 可选启用 BMI 分带）/ list 列表 / update 改档案（profileId 或现有 name 定位）。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list', 'update'] },
        profileId: { type: 'string', description: 'update 时定位用' },
        name: { type: 'string' },
        heightCm: { type: 'integer', description: '身高 40-250 cm（可选）' },
        note: { type: 'string' },
      },
    },
  },
  {
    name: 'maian_update',
    description: '脉案·修改一笔记录（按 id）。可改指标值/时间（date/time）/备注/所属成员；改日期跨日自动迁移日键。' +
      '只传需要改的字段，其余保持原值。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '记录 id（maian_query 获得）' },
        profileId: { type: 'string' }, profileName: { type: 'string' },
        kind: { type: 'string', enum: core.KINDS },
        sys: { type: 'integer' }, dia: { type: 'integer' }, pulse: { type: 'integer' },
        mmol: { type: 'number' }, slot: { type: 'string', enum: core.BG_SLOTS },
        kg: { type: 'number' }, c: { type: 'number' },
        date: { type: 'string' }, time: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'maian_delete',
    description: '脉案·删除一笔记录（按 id）。必须显式 confirm=true（不可逆）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        confirm: { type: 'boolean', description: '确认删除' },
      },
      required: ['id'],
    },
  },
  {
    name: 'maian_summary',
    description: '脉案·就诊小结：把某成员某时间段的体征记录整理成结构化 markdown（统计+分带+逐条明细表），复诊时可直接给医生看。' +
      'from/to 缺省最近 30 天。这是记录整理，不是诊断报告。',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string' }, profileName: { type: 'string' },
        from: { type: 'string' }, to: { type: 'string' },
      },
    },
  },
];

const IMPL = {
  maian_log: toolLog,
  maian_query: toolQuery,
  maian_member: toolMember,
  maian_update: toolUpdate,
  maian_delete: toolDelete,
  maian_summary: toolSummary,
};

// ── stdio JSON-RPC（零依赖；stdout 仅协议数据，日志走 stderr）─────────────────
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  // eslint-disable-next-line no-cond-assign
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) handleMessage(line).catch((e) => log('error', `handle: ${e.message}`));
  }
});
process.stdin.on('end', () => process.exit(0));

function writeMsg(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function handleMessage(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  const { id, method, params } = msg;
  try {
    if (method === 'initialize') {
      writeMsg({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      });
    } else if (method === 'notifications/initialized') {
      // 无需回应
    } else if (method === 'tools/list') {
      writeMsg({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      const name = params && params.name;
      const impl = IMPL[name];
      if (!impl) {
        writeMsg({ jsonrpc: '2.0', id, result: err(`未知工具 ${name}`) });
        return;
      }
      const res = await impl((params && params.arguments) || {});
      writeMsg({ jsonrpc: '2.0', id, result: res });
    } else if (method === 'ping') {
      writeMsg({ jsonrpc: '2.0', id, result: {} });
    } else if (id !== undefined) {
      writeMsg({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法 ${method}` } });
    }
  } catch (e) {
    log('error', `${method}: ${e.message}`);
    if (id !== undefined) {
      writeMsg({ jsonrpc: '2.0', id, result: err(`处理失败：${e.message}`) });
    }
  }
}
