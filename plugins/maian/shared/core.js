'use strict';
/**
 * 脉案 shared core —— 纯函数单一权威（面板 / MCP / 未来服务 三方同源）
 *
 * 只做：成员与记录的规范化（唯一写入口径）、通用参考分带（红黄绿，非医疗建议）、
 * 区间统计、趋势点列、就诊小结生成、日键数组操作（插入/移除/迁移）。
 * 不做：任何 IO（cap.kv 由调用方持有）、任何医疗推断。
 *
 * 键空间契约（权威表见 README）：
 *   maian.member.<id>          成员档案
 *   maian.day.YYYY-MM-DD       该日全部记录数组（按 ts 升序，同 id 覆盖）
 */

const DAY_MS = 86400000;

// ── 日期/时刻工具（U=UTC 基准毫秒转本地，L=本地分量；月份一律 1 起）────────────
function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDayKey(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1) return null;
  const dim = new Date(y, mo, 0).getDate();
  if (d > dim) return null;
  return new Date(y, mo - 1, d).getTime();
}
function dayMinTs(date, minutes) {
  const base = parseDayKey(date);
  if (base === null) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) return null;
  return base + minutes * 60000;
}
function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function dayDiff(a, b) {
  const ta = parseDayKey(a), tb = parseDayKey(b);
  if (ta === null || tb === null) return null;
  return Math.round((ta - tb) / DAY_MS);
}
/** from/to（含两端）→ 日期键数组；非法或跨度 >400 天返回 null（防误扫全库） */
function rangeDays(from, to) {
  const a = parseDayKey(from), b = parseDayKey(to);
  if (a === null || b === null || b < a) return null;
  const n = Math.round((b - a) / DAY_MS) + 1;
  if (n > 400) return null;
  const out = [];
  for (let i = 0; i < n; i++) out.push(dayKey(a + i * DAY_MS));
  return out;
}

let idSeed = 0;
function rid() {
  idSeed = (idSeed + 1) % 1296;
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${idSeed.toString(36)}`;
}

function clip(s, n) {
  return String(s === undefined || s === null ? '' : s).trim().slice(0, n);
}
function round1(x) {
  return Math.round(x * 10) / 10;
}

// ── 指标种类元数据 ─────────────────────────────────────────────────────────────
const KINDS = ['bp', 'bg', 'weight', 'temp'];
const KIND_META = {
  bp: { label: '血压', unit: 'mmHg' },
  bg: { label: '血糖', unit: 'mmol/L' },
  weight: { label: '体重', unit: 'kg' },
  temp: { label: '体温', unit: '℃' },
};
const BG_SLOTS = ['fasting', 'after2h', 'random', 'bedtime'];
const BG_SLOT_META = {
  fasting: { label: '空腹' },
  after2h: { label: '餐后2h' },
  random: { label: '随机' },
  bedtime: { label: '睡前' },
};

// ── 成员 ──────────────────────────────────────────────────────────────────────
function normalizeMember(input, existing) {
  const src = input && typeof input === 'object' ? input : {};
  const name = clip(src.name !== undefined ? src.name : (existing && existing.name), 40);
  if (!name) return { error: '成员名称不能为空' };
  const base = existing && typeof existing === 'object' ? existing : {};
  const id = clip(src.id || base.id || '', 64) || rid();
  let heightCm = src.heightCm !== undefined ? src.heightCm : base.heightCm;
  if (heightCm === '' || heightCm === null) heightCm = undefined;
  if (heightCm !== undefined) {
    const h = Number(heightCm);
    if (!Number.isFinite(h) || h < 40 || h > 250) return { error: '身高需在 40-250 cm 之间' };
    heightCm = Math.round(h);
  }
  const member = {
    id,
    name,
    heightCm,
    note: clip(src.note !== undefined ? src.note : base.note, 200),
    createdAt: base.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  return { member };
}

// ── 分带（通用参考区间；输出文本一律非医疗建议）────────────────────────────────
const BAND_NOTE = '通用参考区间，仅供留意，请遵医嘱';
/**
 * bandOf(kind, values) → {level:'green'|'yellow'|'red'|'urgent'|'none', label, text}
 * blood pressure（家庭自测口径）：
 *   绿 <130/85；黄 130-139/85-89；红 ≥140/90；急 ≥180/120；偏低（<90/60）记黄。
 * blood glucose（指尖 mmol/L）：空腹 绿 3.9-6.1 / 黄 6.1-7.0 / 红 ≥7.0 或 <3.9；
 *   餐后2h/随机/睡前 绿 <7.8 / 黄 7.8-11.1 / 红 ≥11.1。
 * 体温：绿 36.0-37.2 / 黄 37.3-38.0 / 红 ≥38.1 或 <35.0。
 * 体重：有身高按中国 BMI 标准（<18.5 黄 / 24-27.9 黄 / ≥28 红），无身高不分带。
 */
function bandOf(kind, v, heightCm) {
  if (kind === 'bp') {
    const sys = v.sys, dia = v.dia;
    if (sys >= 180 || dia >= 120) return { level: 'urgent', label: '急', text: `收缩压 ${sys} 或舒张压 ${dia} 达 180/120 及以上区间，建议尽快就医` };
    if (sys >= 140 || dia >= 90) return { level: 'red', label: '红', text: `达到 ≥140/90 参考线（家庭自测 ≥135/85 建议就诊评估）` };
    if (sys < 90 || dia < 60) return { level: 'yellow', label: '黄', text: '低于 90/60 参考线，留意头晕乏力等症状' };
    if (sys >= 130 || dia >= 85) return { level: 'yellow', label: '黄', text: '处于 130-139/85-89 关注区间' };
    return { level: 'green', label: '绿', text: '在 <130/85 参考区间内' };
  }
  if (kind === 'bg') {
    const x = v.mmol, slot = BG_SLOTS.includes(v.slot) ? v.slot : 'random';
    if (x < 3.9) return { level: 'red', label: '红', text: '低于 3.9 参考线（偏低），请遵医嘱处理' };
    const fasting = slot === 'fasting';
    if (fasting) {
      if (x >= 7.0) return { level: 'red', label: '红', text: '空腹 ≥7.0 参考线' };
      if (x > 6.1) return { level: 'yellow', label: '黄', text: '空腹处于 6.1-7.0 关注区间' };
    } else {
      if (x >= 11.1) return { level: 'red', label: '红', text: '餐后/随机 ≥11.1 参考线' };
      if (x >= 7.8) return { level: 'yellow', label: '黄', text: '餐后/随机处于 7.8-11.1 关注区间' };
    }
    return { level: 'green', label: '绿', text: '在参考区间内' };
  }
  if (kind === 'temp') {
    const c = v.c;
    if (c >= 38.1) return { level: 'red', label: '红', text: '≥38.1℃ 参考线（发热）' };
    if (c < 35.0) return { level: 'red', label: '红', text: '<35.0℃ 参考线（偏低）' };
    if (c >= 37.3) return { level: 'yellow', label: '黄', text: '37.3-38.0℃ 关注区间（低热）' };
    return { level: 'green', label: '绿', text: '在 36.0-37.2℃ 参考区间内' };
  }
  if (kind === 'weight') {
    if (!heightCm) return { level: 'none', label: '—', text: '未登记身高，不做 BMI 分带（可在成员档案补身高）' };
    const bmi = v.kg / Math.pow(heightCm / 100, 2);
    const b = round1(bmi);
    if (bmi >= 28) return { level: 'red', label: '红', text: `BMI ${b}（≥28）`, bmi: b };
    if (bmi >= 24 || bmi < 18.5) return { level: 'yellow', label: '黄', text: `BMI ${b}（<18.5 或 24-27.9）`, bmi: b };
    return { level: 'green', label: '绿', text: `BMI ${b}（18.5-23.9）`, bmi: b };
  }
  return { level: 'none', label: '—', text: '' };
}

// ── 记录规范化（唯一写入口径）─────────────────────────────────────────────────
function intIn(x, lo, hi) {
  if (!Number.isInteger(x) || x < lo || x > hi) return null;
  return x;
}
function num1(x, lo, hi) {
  const n = Number(x);
  if (!Number.isFinite(n) || n < lo || n > hi) return null;
  return round1(n);
}
/**
 * normalizeRecord(input, now) → {record} | {error}
 * input: { id?, profileId, kind, sys?, dia?, pulse?, mmol?, slot?, kg?, c?,
 *          date?('today'|'yesterday'|'YYYY-MM-DD'), time?('HH:MM'), note?, src? }
 */
function normalizeRecord(input, now) {
  const src = input && typeof input === 'object' ? input : {};
  const profileId = clip(src.profileId, 64);
  if (!profileId) return { error: '缺少成员（profileId）' };
  const kind = src.kind;
  if (!KINDS.includes(kind)) return { error: `kind 须为 ${KINDS.join('/')}` };
  let values;
  if (kind === 'bp') {
    const sys = intIn(Math.trunc(Number(src.sys)), 60, 260);
    if (sys === null) return { error: '收缩压须为 60-260 的整数 mmHg' };
    const dia = intIn(Math.trunc(Number(src.dia)), 30, 160);
    if (dia === null) return { error: '舒张压须为 30-160 的整数 mmHg' };
    if (sys <= dia) return { error: `收缩压（${sys}）须大于舒张压（${dia}）` };
    let pulse;
    if (src.pulse !== undefined && src.pulse !== null && src.pulse !== '') {
      pulse = intIn(Math.trunc(Number(src.pulse)), 30, 220);
      if (pulse === null) return { error: '心率须为 30-220 的整数' };
    }
    values = { sys, dia, pulse };
  } else if (kind === 'bg') {
    const mmol = num1(src.mmol, 1.0, 40.0);
    if (mmol === null) return { error: '血糖须为 1.0-40.0 mmol/L' };
    const slot = BG_SLOTS.includes(src.slot) ? src.slot : 'random';
    values = { mmol, slot };
  } else if (kind === 'weight') {
    const kg = num1(src.kg, 2.0, 300.0);
    if (kg === null) return { error: '体重须为 2.0-300.0 kg' };
    values = { kg };
  } else {
    const c = num1(src.c, 33.0, 43.0);
    if (c === null) return { error: '体温须为 33.0-43.0 ℃' };
    values = { c };
  }
  // 时间：date（缺省今天）+ time（缺省当前时刻）
  let date = src.date === undefined || src.date === null || src.date === '' ? 'today' : src.date;
  if (date === 'today') date = dayKey(now);
  else if (date === 'yesterday') date = dayKey(now - DAY_MS);
  if (parseDayKey(date) === null) return { error: `日期 ${JSON.stringify(src.date)} 无法识别（today/yesterday/YYYY-MM-DD）` };
  let minutes;
  const time = src.time;
  if (time === undefined || time === null || time === '') {
    const d = new Date(date === dayKey(now) ? now : parseDayKey(date) + 12 * 3600000);
    minutes = d.getHours() * 60 + d.getMinutes();
    if (date !== dayKey(now)) minutes = 12 * 60;
  } else {
    const m = /^([01]\d|2[0-3]):[0-5]\d$/.exec(String(time));
    if (!m) return { error: `时刻 ${JSON.stringify(time)} 须为 HH:MM（24 小时制）` };
    minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  }
  const ts = dayMinTs(date, minutes);
  const record = {
    id: clip(src.id, 64) || rid(),
    profileId,
    kind,
    ts,
    ...values,
    note: clip(src.note, 200),
    src: src.src === 'panel' ? 'panel' : 'ai',
    at: now,
  };
  return { record };
}

/** 记录展示值（如「152/95 · 心率78」），统一口径 */
function fmtValue(r) {
  if (r.kind === 'bp') return `${r.sys}/${r.dia}${r.pulse ? ` · 心率${r.pulse}` : ''}`;
  if (r.kind === 'bg') return `${r.mmol}（${BG_SLOT_META[r.slot] ? BG_SLOT_META[r.slot].label : '随机'}）`;
  if (r.kind === 'weight') return `${r.kg} kg`;
  return `${r.c} ℃`;
}

// ── 日键数组操作 ───────────────────────────────────────────────────────────────
/** 插入或按 id 覆盖，按 ts 升序；返回新数组（不改动入参） */
function upsertRecord(dayArr, record) {
  const arr = Array.isArray(dayArr) ? dayArr.filter((r) => r && r.id !== record.id) : [];
  arr.push(record);
  arr.sort((a, b) => (a.ts - b.ts) || (a.id < b.id ? -1 : 1));
  return arr;
}
/** 按 id 移除 → {arr, found} */
function removeRecord(dayArr, id) {
  const arr = Array.isArray(dayArr) ? dayArr : [];
  const next = arr.filter((r) => r && r.id !== id);
  return { arr: next, found: next.length !== arr.length };
}
function dayKeyOfTs(ts) { return dayKey(ts); }
function dayKeyFor(dateStr) { return `maian.day.${dateStr}`; }

// ── 统计与趋势 ────────────────────────────────────────────────────────────────
const LEVELS = ['urgent', 'red', 'yellow', 'green'];
/**
 * statsFor(records, heightCmOf) →
 * { count, bands:{green,yellow,red,urgent}, fields:{sys?:{min,max,avg},dia?:...,pulse?:...,mmol?:...,kg?:...,c?:...}, latest, prev }
 */
function statsFor(records, heightCmOf) {
  const rs = Array.isArray(records) ? records.filter((r) => r && KINDS.includes(r.kind)) : [];
  rs.sort((a, b) => a.ts - b.ts);
  const bands = { green: 0, yellow: 0, red: 0, urgent: 0, none: 0 };
  const fields = {};
  const push = (key, v) => {
    if (!fields[key]) fields[key] = { min: v, max: v, sum: 0, n: 0 };
    const f = fields[key];
    if (v < f.min) f.min = v;
    if (v > f.max) f.max = v;
    f.sum += v; f.n += 1;
  };
  for (const r of rs) {
    const hc = heightCmOf ? heightCmOf(r.profileId) : undefined;
    const b = bandOf(r.kind, r, hc);
    bands[b.level] += 1;
    if (r.kind === 'bp') { push('sys', r.sys); push('dia', r.dia); if (r.pulse) push('pulse', r.pulse); }
    else if (r.kind === 'bg') push('mmol', r.mmol);
    else if (r.kind === 'weight') push('kg', r.kg);
    else push('c', r.c);
  }
  const out = { count: rs.length, bands, fields: {}, latest: rs[rs.length - 1] || null, prev: rs[rs.length - 2] || null };
  for (const [k, f] of Object.entries(fields)) {
    out.fields[k] = { min: f.min, max: f.max, avg: round1(f.sum / f.n), n: f.n };
  }
  return out;
}
/** 趋势点列（升序）：bp → [{ts,sys,dia,level}]；其余 → [{ts,value,level}] */
function trendPoints(records, heightCmOf) {
  const rs = Array.isArray(records) ? records.filter((r) => r && KINDS.includes(r.kind)) : [];
  rs.sort((a, b) => a.ts - b.ts);
  return rs.map((r) => {
    const b = bandOf(r.kind, r, heightCmOf ? heightCmOf(r.profileId) : undefined);
    if (r.kind === 'bp') return { ts: r.ts, sys: r.sys, dia: r.dia, level: b.level };
    const value = r.kind === 'bg' ? r.mmol : r.kind === 'weight' ? r.kg : r.c;
    return { ts: r.ts, value, level: b.level };
  });
}

// ── 就诊小结（复诊可直接给医生；纯记录呈现，非医疗建议）────────────────────────
function fmtDT(ts) {
  return `${dayKey(ts)} ${fmtTime(ts)}`;
}
/**
 * buildSummary({ member, from, to, records, now }) → markdown
 * records 需已过滤到该成员与时间段（调用方职责；此处仅再按 kind 分组）。
 */
function buildSummary({ member, from, to, records }) {
  const ms = records.filter((r) => r && r.profileId === member.id);
  ms.sort((a, b) => a.ts - b.ts);
  const lines = [];
  lines.push(`# 体征记录小结（${from} 至 ${to}）`);
  lines.push('');
  lines.push(`- 成员：${member.name}${member.note ? `（${member.note}）` : ''}${member.heightCm ? `，身高 ${member.heightCm}cm` : ''}`);
  lines.push(`- 记录条数：${ms.length}`);
  lines.push(`- 导出时间：${fmtDT(Date.now())}`);
  lines.push('');
  if (!ms.length) {
    lines.push('该时间段暂无记录。');
    lines.push('');
    lines.push('> 本小结为家庭自测记录整理，不构成医疗建议；解读请遵医嘱。');
    return lines.join('\n');
  }
  const heightOf = () => member.heightCm;
  for (const kind of KINDS) {
    const rs = ms.filter((r) => r.kind === kind);
    if (!rs.length) continue;
    const meta = KIND_META[kind];
    const st = statsFor(rs, heightOf);
    lines.push(`## ${meta.label}（${meta.unit}）`);
    const f = st.fields;
    const agg = kind === 'bp'
      ? `收缩压均值 ${f.sys ? f.sys.avg : '—'}（${f.sys ? f.sys.min : '—'}~${f.sys ? f.sys.max : '—'}），舒张压均值 ${f.dia ? f.dia.avg : '—'}（${f.dia ? f.dia.min : '—'}~${f.dia ? f.dia.max : '—'}）${f.pulse ? `，心率均值 ${f.pulse.avg}` : ''}`
      : Object.values(f)[0]
        ? `均值 ${Object.values(f)[0].avg}（${Object.values(f)[0].min}~${Object.values(f)[0].max}）`
        : '—';
    lines.push(`- 共 ${rs.length} 次；${agg}`);
    lines.push(`- 分带：绿 ${st.bands.green} / 黄 ${st.bands.yellow} / 红 ${st.bands.red} / 急 ${st.bands.urgent}`);
    lines.push('');
    lines.push('| 时间 | 数值 | 分带 | 备注 |');
    lines.push('|---|---|---|---|');
    for (const r of rs) {
      const b = bandOf(r.kind, r, member.heightCm);
      lines.push(`| ${fmtDT(r.ts)} | ${fmtValue(r)} | ${b.label} | ${r.note || ''} |`);
    }
    lines.push('');
  }
  lines.push('> 本小结为家庭自测记录整理，不构成医疗建议；解读请遵医嘱。');
  return lines.join('\n');
}

/** 全量导出（数据所有权；JSON 文本） */
function exportAllText({ members, dayMap }) {
  return JSON.stringify({
    app: 'maian', version: 1, exportedAt: new Date().toISOString(),
    members: members || [],
    days: dayMap || {},
  }, null, 2);
}

module.exports = {
  DAY_MS, KINDS, KIND_META, BG_SLOTS, BG_SLOT_META, LEVELS, BAND_NOTE,
  dayKey, parseDayKey, dayMinTs, fmtTime, fmtDT, dayDiff, rangeDays, rid, clip, round1,
  normalizeMember, normalizeRecord, bandOf, fmtValue,
  upsertRecord, removeRecord, dayKeyOfTs, dayKeyFor,
  statsFor, trendPoints, buildSummary, exportAllText,
};
