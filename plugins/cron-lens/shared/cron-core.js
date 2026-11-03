/**
 * cron-lens 核心引擎 —— 单一权威（MCP 与面板共用；纯函数零依赖零 require）
 *
 * 语义基准：vixie/POSIX cron 五字段（分 时 日 月 周），可选拉长的六字段（首位=秒）。
 * 关键语义：日(dom) 与 周(dow) **同时受限**时按「或」匹配（vixie 手册原文：
 * "if both fields are restricted, the command will be run when either matches"）——
 * Quartz 恰好相反是「与」，这是迁移 cron 表达式最常见的坑，lint 必须警示。
 *
 * 时区模型：所有计算走「固定偏移墙钟」——调用方给 tzOffsetMinutes（东正西负，
 * UTC+8 = 480），内部把绝对时刻平移后用 getUTC* 读墙钟字段；不做 IANA/DST
 * 推算（如实标注局限）。这样 MCP 与面板、测试三方结果确定性一致。
 */
'use strict';

const ALIASES = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
};
const ALIAS_OF = {
  '0 * * * *': '@hourly',
  '0 0 * * *': '@daily',
  '0 0 * * 0': '@weekly',
  '0 0 1 * *': '@monthly',
  '0 0 1 1 *': '@yearly',
};

const MONTH_NAMES = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const DOW_NAMES = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
const DOW_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
// 各月最大天数（2 月按闰年 29 计，用于「永不触发」存在性判定）
const MAX_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const FIELD_DEFS = [
  { key: 'min', label: '分钟', min: 0, max: 59, unit: '分钟' },
  { key: 'hour', label: '小时', min: 0, max: 23, unit: '小时' },
  { key: 'dom', label: '日', min: 1, max: 31, unit: '日' },
  { key: 'month', label: '月', min: 1, max: 12, unit: '月' },
  { key: 'dow', label: '星期', min: 0, max: 7, unit: '星期' },
];

function pad2(n) { return String(n).padStart(2, '0'); }

function parseNameOrNum(tok, def, warnings) {
  // 返回 { num } 或 { error }
  if (/^\d+$/.test(tok)) {
    const n = parseInt(tok, 10);
    if (def.key === 'dow' && n === 7) {
      warnings.push({ level: 'info', msg: '星期字段的 7 已按 0（周日）处理（vixie 语义 0 与 7 均为周日）' });
      return { num: 0 };
    }
    if (n < def.min || (def.key === 'dow' ? n > 6 : n > def.max)) {
      return { error: `${def.label}值 ${n} 超界（允许 ${def.min}-${def.key === 'dow' ? 6 : def.max}${def.key === 'dow' ? '，7 会归一为 0' : ''}）` };
    }
    return { num: n };
  }
  const up = tok.toUpperCase();
  if (def.key === 'month' && MONTH_NAMES[up] !== undefined) return { num: MONTH_NAMES[up] };
  if (def.key === 'dow' && DOW_NAMES[up] !== undefined) return { num: DOW_NAMES[up] };
  return { error: `${def.label}字段无法识别「${tok}」` + (def.key === 'month' ? '（月份可用 1-12 或 JAN-DEC）' : def.key === 'dow' ? '（星期可用 0-6 或 SUN-SAT，0=周日）' : '（只接受数字）') };
}

function parseFieldToken(raw, def, warnings) {
  // 返回 { values:[], restricted, notes:[] } 或 { error }
  // 文法：whole-token '*' | '?' | '*/n'（不受限）；逗号列表（受限），
  // 每个原子 = n | a-b | a-b/n | a/n（n/n 为部分实现缩写）。
  const notes = [];
  let tok = raw.trim();
  if (tok === '') return { error: `${def.label}字段为空` };
  if (tok === '?' ) {
    warnings.push({ level: 'info', msg: `「?」不是标准 vixie 语法（Quartz 惯用），已按 * 处理` });
    tok = '*';
  }
  const lo = def.min;
  const hi = def.key === 'dow' ? 6 : def.max;

  if (tok === '*') return { values: range(lo, hi), restricted: false, notes };

  if (tok.startsWith('*/')) {
    const stepPart = tok.slice(2);
    if (!/^\d+$/.test(stepPart) || parseInt(stepPart, 10) < 1) {
      return { error: `${def.label}字段步长「${stepPart || '(空)'}」无效（须为 ≥1 的整数）` };
    }
    const step = parseInt(stepPart, 10);
    const values = range(lo, hi).filter((v) => (v - lo) % step === 0);
    if ((hi - lo + 1) % step !== 0) {
      notes.push({ level: 'info', msg: `*/${step} 尾部不满一个步长：实际命中 ${summarize(values, def)}` });
    }
    return { values, restricted: false, notes };
  }

  // 逗号列表（受限）：逐原子解析后并集
  const atoms = tok.split(',');
  const collected = [];
  for (const atomRaw of atoms) {
    const atom = atomRaw.trim();
    if (atom === '') return { error: `${def.label}字段「${tok}」含空列表项（如「1,,3」或结尾逗号）` };
    // Quartz 专属语法显式拦截（注意别误杀含 L/W 字母的月/英文名，如 JUL）
    if (atom.includes('#') || /^(l|w|lw)([-/]|$)/i.test(atom) || /\d[lw]$/i.test(atom)) {
      return { error: `${def.label}字段「${atom}」含 L/W/#——这是 Quartz 扩展语法，标准 cron 不支持（本工具按 vixie/POSIX 语义解析；如需 Quartz 语义请用支持它的调度器）` };
    }
    const slash = atom.indexOf('/');
    let step = 1;
    let body = atom;
    if (slash !== -1) {
      body = atom.slice(0, slash);
      const stepPart = atom.slice(slash + 1);
      if (!/^\d+$/.test(stepPart) || parseInt(stepPart, 10) < 1) {
        return { error: `${def.label}字段步长「${stepPart || '(空)'}」无效（须为 ≥1 的整数）` };
      }
      step = parseInt(stepPart, 10);
      if (body === '*') {
        return { error: `${def.label}字段「${atom}」：*/ 步长只能单独使用，不能出现在逗号列表里` };
      }
    }
    const dash = body.indexOf('-');
    let a, b;
    if (dash === -1) {
      const r = parseNameOrNum(body, def, warnings);
      if (r.error) return { error: r.error };
      a = r.num;
      if (slash !== -1) {
        // 「5/15」缩写：按 5-最大值/15 解释（vixie 无此写法，部分实现支持）
        warnings.push({ level: 'info', msg: `${def.label}「${atom}」按 ${a}-${hi}/${step} 解释（「起点/步长」缩写是部分实现的惯用法，vixie 标准无此写法）` });
        b = hi;
      } else {
        collected.push(a);
        continue;
      }
    } else {
      const ra = parseNameOrNum(body.slice(0, dash), def, warnings);
      if (ra.error) return { error: ra.error };
      const rb = parseNameOrNum(body.slice(dash + 1), def, warnings);
      if (rb.error) return { error: rb.error };
      a = ra.num; b = rb.num;
      if (a > b) {
        return { error: `${def.label}范围 ${a}-${b} 起点大于终点（vixie 不支持环形范围；如需跨界请用列表，如 ${a},6,0,1,2）` };
      }
    }
    const vals = range(a, b).filter((v) => (v - a) % step === 0);
    if (step > 1 && a > lo) {
      notes.push({ level: 'info', msg: `范围起点 ${a} 不是字段下界 ${lo}，步长从 ${a} 起算：实际命中 ${summarize(vals, def)}` });
    }
    collected.push(...vals);
  }
  const values = [...new Set(collected)].sort((x, y) => x - y);
  return { values, restricted: true, notes };
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function summarize(values, def) {
  const strs = values.map((v) => (def.key === 'month' ? `${v}月` : def.key === 'dow' ? DOW_CN[v % 7] : String(v)));
  if (strs.length > 8) return `${strs.slice(0, 8).join('、')}…共 ${values.length} 个值`;
  return strs.join('、');
}

/** 解析 cron 表达式。ok 恒有；失败分支也带同形键（空值），便于 TS/调用方无脑取用 */
function parseCron(expr) {
  if (typeof expr !== 'string' || !expr.trim()) return { ok: false, error: '表达式为空', warnings: [], notes: [], fields: {}, normalized: '', useSec: false, aliasUsed: null, raw: '' };
  let raw = expr.trim();
  const warnings = [];
  let aliasUsed = null;
  const low = raw.toLowerCase();
  if (ALIASES[low]) {
    if (low === '@reboot') {
      return { ok: false, error: '@reboot 无时刻语义（触发时机=进程启动），无法计算未来触发时刻；请改用具体时间字段', warnings: [], notes: [], fields: {}, normalized: '', useSec: false, aliasUsed: null, raw: '' };
    }
    aliasUsed = low;
    warnings.push({ level: 'info', msg: `别名 ${low} 等价于 ${ALIASES[low]}` });
    raw = ALIASES[low];
  }
  const tokens = raw.split(/\s+/);
  let useSec = false;
  if (tokens.length === 6) {
    useSec = true;
    warnings.push({ level: 'warn', msg: '检测到 6 个字段：首位已按「秒」解析。标准 vixie cron 是 5 字段（分 时 日 月 周），秒级支持仅部分调度器提供——若本意是 5 字段，请检查是否多写了一段' });
  } else if (tokens.length !== 5) {
    return { ok: false, error: `字段数应为 5（标准）或 6（含秒），实际 ${tokens.length} 个：「${tokens.join(' ')}」。五字段顺序 = 分 时 日 月 周`, warnings: [], notes: [], fields: {}, normalized: '', useSec: false, aliasUsed: null, raw: '' };
  }

  const defs = useSec
    ? [{ key: 'sec', label: '秒', min: 0, max: 59, unit: '秒' }, ...FIELD_DEFS]
    : FIELD_DEFS;
  const fields = {};
  const notes = [];
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const r = parseFieldToken(tokens[i], def, warnings);
    if (r.error) return { ok: false, error: `第 ${i + 1} 段（${def.label}）解析失败：${r.error}`, warnings: [], notes: [], fields: {}, normalized: '', useSec: false, aliasUsed: null, raw: '' };
    r.values.sort((x, y) => x - y);
    fields[def.key] = { values: r.values, restricted: r.restricted, def };
    for (const n of r.notes) notes.push(n);
  }

  // dom/dow 的 restricted 以「显式写法」为准（* 或 ? = 不受限）
  const domR = fields.dom.restricted;
  const dowR = fields.dow.restricted;
  if (domR && dowR) {
    warnings.push({ level: 'warn', msg: '「日」与「星期」同时受限：vixie/POSIX cron 按「或」语义，二者任一命中即触发（如 0 0 1 * 1 = 每月 1 号或每个周一都会跑）；Quartz 相反是「与」。跨调度器迁移时这是最容易踩的语义差' });
  }

  // 永不触发 / 仅闰年触发检测：仅在 dom 受限且 dow 不受限时 dom 才单独决定日命中
  if (domR && !dowR) {
    const domValues = fields.dom.values;
    const validPairs = [];
    for (const m of fields.month.values) {
      for (const d of domValues) {
        if (d <= MAX_DAYS[m - 1]) validPairs.push({ m, d });
      }
    }
    if (validPairs.length === 0) {
      const detail = fields.month.values.map((m) => `${m}月最多 ${MAX_DAYS[m - 1]} 日`).join('、');
      warnings.push({ level: 'warn', msg: `永不触发：日字段限定 ${domValues.join('、')}，但 ${detail}，该日期不存在——表达式永远不会命中` });
    } else if (validPairs.every((p) => p.m === 2 && p.d === 29)) {
      warnings.push({ level: 'warn', msg: '仅闰年触发：2 月 29 日只在闰年存在（约每 4 年一次），其余年份该表达式整年不触发' });
    }
  }

  const secSet = useSec ? fields.sec.values : null;
  const normalized = (useSec ? [joinField(secSet, 0, 59), joinField(fields.min.values, 0, 59), joinField(fields.hour.values, 0, 23), joinField(fields.dom.values, 1, 31), joinField(fields.month.values, 1, 12), joinField(fields.dow.values, 0, 6)].join(' ') : [joinField(fields.min.values, 0, 59), joinField(fields.hour.values, 0, 23), joinField(fields.dom.values, 1, 31), joinField(fields.month.values, 1, 12), joinField(fields.dow.values, 0, 6)].join(' '));
  const aliasNote = !useSec && ALIAS_OF[normalized] && !aliasUsed ? { level: 'info', msg: `该表达式等价于别名 ${ALIAS_OF[normalized]}` } : null;
  if (aliasNote) warnings.push(aliasNote);

  return {
    ok: true,
    raw: expr.trim(),
    aliasUsed,
    useSec,
    fields,
    warnings,
    notes,
    normalized,
    domRestricted: domR,
    dowRestricted: dowR,
  };
}

function joinField(values, lo, hi) {
  if (values.length === hi - lo + 1) return '*';
  // 等差步长还原（从 lo 起）：如 0,15,30,45 → */15。判据：下一个值会越过上界，
  // 否则还原成 */n 会凭空多出尾部命中（0,15,30 → 还原 */15 会多出 45，必须保持列表）
  if (values.length > 1 && values[0] === lo) {
    const step = values[1] - values[0];
    const isStep = values.every((v, i) => v === lo + i * step);
    if (isStep && lo + values.length * step > hi) return `*/${step}`;
  }
  return values.join(',');
}

/** 逐字段中文解释（返回行数组：{label, token, text}） */
function describeFields(parsed) {
  const defs = parsed.useSec ? ['sec', 'min', 'hour', 'dom', 'month', 'dow'] : ['min', 'hour', 'dom', 'month', 'dow'];
  return defs.map((key) => {
    const f = parsed.fields[key];
    return { label: f.def.label, token: key === 'dow' ? normalizeDowToken(f) : f.values.join(','), text: describeOne(key, f) };
  });
}

function normalizeDowToken(f) {
  return f.values.join(',');
}

function describeOne(key, f) {
  const { values, def, restricted } = f;
  const full = values.length === (def.key === 'dow' ? 7 : def.max - def.min + 1) && (key !== 'dow' || (values[0] === 0 && values[values.length - 1] === 6));
  if (!restricted && full) {
    if (key === 'dom') return '每天';
    if (key === 'dow') return '不限星期';
    return `每${def.unit}`;
  }
  if (values.length === 1) {
    if (key === 'sec') return `第 ${values[0]} 秒`;
    if (key === 'min') return `第 ${values[0]} 分`;
    if (key === 'hour') return `${values[0]} 点整`;
    if (key === 'dom') return `每月 ${values[0]} 日`;
    if (key === 'month') return `仅 ${values[0]} 月`;
    return `仅${DOW_CN[values[0]]}`;
  }
  // 等差步长：从首值起
  if (values.length > 2) {
    const step = values[1] - values[0];
    const even = values.every((v, i) => v === values[0] + i * step);
    if (even && step > 1) {
      const fromStart = values[0] === def.min;
      if (key === 'dow') return `${fromStart ? `每 ${step} 天` : `自${DOW_CN[values[0]]}起每 ${step} 天`}（${summarize(values, def)}）`;
      if (key === 'month') return `${fromStart ? `每 ${step} 个月` : `自 ${values[0]} 月起每 ${step} 个月`}（${summarize(values, def)}）`;
      return `${fromStart ? `每 ${step} ${def.unit}` : `自第 ${values[0]} ${def.unit}起每 ${step}`}（${summarize(values, def)}）`;
    }
  }
  return `指定：${summarize(values, def)}`;
}

// ── 时刻计算（固定偏移墙钟） ─────────────────────────────────────────────

function shiftToWall(ms, tzOffsetMinutes) { return ms + tzOffsetMinutes * 60000; }
function wallToAbs(wallMs, tzOffsetMinutes) { return wallMs - tzOffsetMinutes * 60000; }

function dayMatchesWall(parsed, wallMs) {
  const d = new Date(wallMs);
  const dom = d.getUTCDate();
  const dow = d.getUTCDay();
  const domR = parsed.domRestricted;
  const dowR = parsed.dowRestricted;
  if (domR && dowR) return parsed.fields.dom.values.includes(dom) || parsed.fields.dow.values.includes(dow);
  if (domR) return parsed.fields.dom.values.includes(dom);
  if (dowR) return parsed.fields.dow.values.includes(dow);
  return true;
}

/** 在 dayMatchesWall 已确认的这一天里，找 ≥ wallMs 的下一个 (h,m[,s])；找不到返回 null */
function nextTimeInDay(parsed, wallMs) {
  const d = new Date(wallMs);
  const h0 = d.getUTCHours();
  const m0 = d.getUTCMinutes();
  const s0 = d.getUTCSeconds();
  const secSet = parsed.useSec ? parsed.fields.sec.values : [0];
  const y = d.getUTCFullYear(), mo = d.getUTCMonth(), da = d.getUTCDate();
  for (const h of parsed.fields.hour.values) {
    if (h < h0) continue;
    for (const m of parsed.fields.min.values) {
      if (h === h0 && m < m0) continue;
      for (const s of secSet) {
        if (h === h0 && m === m0 && s < s0) continue;
        return Date.UTC(y, mo, da, h, m, s);
      }
    }
  }
  return null;
}

function nextAllowedMonthStart(parsed, wallMs) {
  const d = new Date(wallMs);
  const y = d.getUTCFullYear(), mo = d.getUTCMonth();
  for (let k = 1; k <= 12; k++) {
    const m2 = mo + k; // Date.UTC 自动滚年
    const mm = (m2 % 12) + 1;
    if (parsed.fields.month.values.includes(mm)) {
      return Date.UTC(y, m2, 1, 0, 0, 0);
    }
  }
  return null;
}

const MAX_DAY_STEPS = 366 * 9; // 9 年足够跨闰年周期；永不触发的表达式由 lint 提前拦截

/**
 * 从 fromMs（绝对 epoch ms，严格大于）起找未来 count 次触发。
 * 返回 { ok:true, fires:[{at, wallText, dow}], neverReason?, horizonReached? }
 */
function nextFires(parsed, fromMs, count, tzOffsetMinutes) {
  count = Math.max(1, Math.min(50, count || 5));
  // lint 已判定的永不触发直接短路
  const never = findNeverReason(parsed);
  if (never) return { ok: true, fires: [], neverReason: never, horizonReached: false };

  const stepUnit = parsed.useSec ? 1000 : 60000;
  let wall = shiftToWall(fromMs, tzOffsetMinutes);
  // 对齐到下一个候选刻度（严格大于 fromMs）
  wall = Math.floor(wall / stepUnit) * stepUnit + stepUnit;

  const fires = [];
  let daySteps = 0;
  let horizonReached = false;
  while (fires.length < count) {
    if (!parsed.fields.month.values.includes(new Date(wall).getUTCMonth() + 1)) {
      const next = nextAllowedMonthStart(parsed, wall);
      if (next === null) { horizonReached = true; break; }
      wall = next;
      continue;
    }
    if (!dayMatchesWall(parsed, wall)) {
      const d = new Date(wall);
      wall = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0);
      daySteps++;
      if (daySteps > MAX_DAY_STEPS) { horizonReached = true; break; }
      continue;
    }
    const hit = nextTimeInDay(parsed, wall);
    if (hit === null) {
      const d = new Date(wall);
      wall = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0);
      daySteps++;
      if (daySteps > MAX_DAY_STEPS) { horizonReached = true; break; }
      continue;
    }
    fires.push({
      at: wallToAbs(hit, tzOffsetMinutes),
      wallText: formatWallAt(hit, parsed.useSec),
    });
    wall = hit + stepUnit;
  }
  return { ok: true, fires, neverReason: null, horizonReached };
}

function findNeverReason(parsed) {
  if (!parsed.domRestricted || parsed.dowRestricted) return null;
  const domValues = parsed.fields.dom.values;
  for (const m of parsed.fields.month.values) {
    for (const d of domValues) {
      if (d <= MAX_DAYS[m - 1]) return null;
    }
  }
  return '日字段限定值在这些月份中不存在（如 2 月无 30 日）';
}

function formatWallAt(wallMs, withSec) {
  const d = new Date(wallMs);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}${withSec ? ':' + pad2(d.getUTCSeconds()) : ''}`;
}

function tzTag(tzOffsetMinutes) {
  if (!tzOffsetMinutes) return 'UTC';
  return `UTC${tzOffsetMinutes > 0 ? '+' : '-'}${Math.floor(Math.abs(tzOffsetMinutes) / 60)}${Math.abs(tzOffsetMinutes) % 60 ? ':' + pad2(Math.abs(tzOffsetMinutes) % 60) : ''}`;
}

function weekdayCn(wallMs) {
  return DOW_CN[new Date(wallMs).getUTCDay()];
}

/**
 * 检查绝对时刻 atMs 是否命中。返回
 * { match, checks:[{label, value, expect, ok, note}], firstMismatch? }
 */
function matchesAt(parsed, atMs, tzOffsetMinutes) {
  const wall = shiftToWall(atMs, tzOffsetMinutes);
  const d = new Date(wall);
  const sec = d.getUTCSeconds();
  const min = d.getUTCMinutes();
  const hour = d.getUTCHours();
  const dom = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  const dow = d.getUTCDay();
  const secSet = parsed.useSec ? parsed.fields.sec.values : [0];
  const domOk = parsed.fields.dom.values.includes(dom);
  const dowOk = parsed.fields.dow.values.includes(dow);
  const bothR = parsed.domRestricted && parsed.dowRestricted;
  const dayOk = bothR ? (domOk || dowOk) : parsed.domRestricted ? domOk : parsed.dowRestricted ? dowOk : true;
  const dayNote = bothR
    ? `日=${dom}（限定${domOk ? '命中' : '未中'}）、星期=${DOW_CN[dow]}（限定${dowOk ? '命中' : '未中'}）——vixie「或」语义：任一命中即可`
    : parsed.domRestricted ? `日限定 ${parsed.fields.dom.values.join('、')}` : parsed.dowRestricted ? `星期限定 ${parsed.fields.dow.values.map((v) => DOW_CN[v]).join('、')}` : '日/星期均不限';

  const rows = [];
  if (parsed.useSec) rows.push({ label: '秒', value: String(sec), expect: summarize(parsed.fields.sec.values, { key: 'sec' }), ok: secSet.includes(sec) });
  rows.push({ label: '分钟', value: String(min), expect: summarize(parsed.fields.min.values, { key: 'min' }), ok: parsed.fields.min.values.includes(min) });
  rows.push({ label: '小时', value: String(hour), expect: summarize(parsed.fields.hour.values, { key: 'hour' }), ok: parsed.fields.hour.values.includes(hour) });
  rows.push({ label: '日', value: String(dom), expect: parsed.domRestricted ? summarize(parsed.fields.dom.values, { key: 'dom' }) : '不限', ok: parsed.domRestricted ? domOk : true });
  rows.push({ label: '星期', value: DOW_CN[dow], expect: parsed.dowRestricted ? summarize(parsed.fields.dow.values, { key: 'dow' }) : '不限', ok: parsed.dowRestricted ? dowOk : true });
  rows.push({ label: '月', value: `${month}月`, expect: summarize(parsed.fields.month.values, { key: 'month' }), ok: parsed.fields.month.values.includes(month) });
  rows.push({ label: '日+星期综合', value: `日=${dom} 周${dow}`, expect: bothR ? '或（任一命中）' : '单边判定', ok: dayOk, note: dayNote });

  // match 由「日+星期综合」行与逐字段行共同决定；OR 语义下单项行未中不算数
  //（dom 未中但 dow 命中 → match=true 且 firstMismatch=null）。
  // bothR 且综合未中时，首因报综合行（其 note 携带「或」语义说明，比单报「日」更具诊断价值）。
  const match = dayOk && parsed.fields.min.values.includes(min) && parsed.fields.hour.values.includes(hour) && parsed.fields.month.values.includes(month) && secSet.includes(sec);
  const firstMiss = rows.find((r) => !r.ok);
  let firstMismatch = null;
  if (!match) {
    firstMismatch = (bothR && !dayOk) ? '日+星期综合' : (firstMiss ? firstMiss.label : null);
  }
  return { match, checks: rows, firstMismatch, wallText: formatWallAt(wall, parsed.useSec), tz: tzTag(tzOffsetMinutes) };
}

/** 解析 from 输入：数字=epoch ms；'YYYY-MM-DD HH:mm(:ss)'=按 tzOffset 墙钟；ISO 带 Z/偏移=按其字面时区 */
function parseFromInput(v, tzOffsetMinutes) {
  // 所有分支同形（ms/mode/error），error 恒有（失败时 string）——调用方按真值判断
  if (v === undefined || v === null || v === '') return { ms: Date.now(), mode: 'now', error: null };
  if (typeof v === 'number' && Number.isFinite(v)) return { ms: v, mode: 'epoch', error: null };
  const s = String(v).trim();
  if (/^\d{10,13}$/.test(s)) return { ms: parseInt(s, 10) < 1e12 ? parseInt(s, 10) * 1000 : parseInt(s, 10), mode: 'epoch', error: null };
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    // 无时区字样的墙钟时间：按调用方给定偏移解释（与预报计算同一时区口径，确定性）
    const wallMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
    return { ms: wallToAbs(wallMs, tzOffsetMinutes), mode: 'wall', error: null };
  }
  if (/[Zz]|[+-]\d{2}:\d{2}$/.test(s)) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return { ms: t, mode: 'iso', error: null };
  }
  return { ms: null, mode: 'invalid', error: `无法识别的时间「${s}」：支持 epoch 毫秒/秒、YYYY-MM-DD HH:mm(:ss)（按 tzOffsetMinutes 墙钟解释）、带 Z 或 ±HH:MM 的 ISO 8601` };
}

// ── MCP/面板文本渲染 ─────────────────────────────────────────────────────

function renderExplain(parsed) {
  const lines = [];
  lines.push(`表达式：${parsed.normalized}${parsed.raw !== parsed.normalized ? `（输入：${parsed.raw}）` : ''}`);
  lines.push(`形态：${parsed.useSec ? '6 字段（含秒）' : '5 字段（标准 vixie/POSIX）'}`);
  lines.push('字段解释：');
  for (const row of describeFields(parsed)) {
    lines.push(`  ${row.label}（${row.token}）：${row.text}`);
  }
  const warns = parsed.warnings.filter((w) => w.level === 'warn');
  const infos = parsed.warnings.filter((w) => w.level === 'info');
  if (warns.length || parsed.notes.length || infos.length) {
    lines.push('坑警示与提示：');
    for (const w of warns) lines.push(`  ⚠ ${w.msg}`);
    for (const n of parsed.notes) lines.push(`  ℹ ${n.msg}`);
    for (const w of infos) lines.push(`  ℹ ${w.msg}`);
  }
  return lines.join('\n');
}

function renderNext(parsed, fromMs, count, tzOffsetMinutes) {
  const r = nextFires(parsed, fromMs, count, tzOffsetMinutes);
  if (!r.ok) return r;
  const lines = [];
  if (r.neverReason) {
    lines.push(`未来不会触发：${r.neverReason}`);
    return { ok: true, text: lines.join('\n'), fires: [], neverReason: r.neverReason, horizonReached: false };
  }
  lines.push(`未来 ${r.fires.length} 次触发（${tzTag(tzOffsetMinutes)}，从 ${formatWallAt(shiftToWall(fromMs, tzOffsetMinutes), parsed.useSec)} 之后算起）：`);
  r.fires.forEach((f, i) => {
    lines.push(`  ${i + 1}. ${f.wallText}（${weekdayCn(shiftToWall(f.at, tzOffsetMinutes))}）  epoch=${f.at}`);
  });
  if (r.horizonReached) lines.push('⚠ 9 年窗口内未找齐目标次数——表达式可能只在极罕见的年份触发，请检查字段');
  return { ok: true, text: lines.join('\n'), fires: r.fires, neverReason: null, horizonReached: r.horizonReached };
}

module.exports = {
  parseCron,
  describeFields,
  nextFires,
  matchesAt,
  parseFromInput,
  renderExplain,
  renderNext,
  tzTag,
  formatWallAt,
  weekdayCn,
  DOW_CN,
};
