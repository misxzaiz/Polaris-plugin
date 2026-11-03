'use strict';
/**
 * triage-core.js —— 文本分流引擎（单一权威，CJS 零依赖零 require）
 *
 * 「非结构化文本 → 分类 → 抽取 → 决策」三段流水，全程 trace 证据链。
 * 被 MCP server（node）与面板（esbuild browser bundle）双端复用：
 * 顶层禁止 require 任何 node 内置模块（exec-sandbox 实证坑）。
 *
 * 模板（pipeline）结构：
 *   {
 *     classes: [ { id, name?, anyOf: [pattern, ...] } ],      // 按序首中即决
 *     extract: { [classId|'*']: { [field]: { pattern, group?, type?, required?, default? } } },
 *     decide:  { [classId|'*']: [ { when: { field, op, value? }, then: { verdict, severity?, label?, route?, note? } } ] },
 *     fallback?: { verdict, severity?, label?, route?, note? }
 *   }
 * pattern 形态："re:<source>" = JS 正则（无内联 flags，大小写敏感）；
 *              其他任意字符串 = 字面子串（不区分大小写）。
 * type：string|int|float|bool|duration(→ms)|bytes(→B)|date(→ISO)；duration/bytes
 *       裸数字分别按毫秒/字节解释；date 无时区字样按本机时区解释（输出如实注明）。
 * op：exists|missing|eq|ne|gt|gte|lt|lte|contains|matches|in；
 *     gt/gte/lt/lte 仅数值可比（任一侧非数值 → 该规则不命中并记入 trace）。
 */

const TYPES = ['string', 'int', 'float', 'bool', 'duration', 'bytes', 'date'];
const OPS = ['exists', 'missing', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'matches', 'in'];
const VALUE_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'matches', 'in']; // 需要 value 的算子
const UNCLASSIFIED_ID = '__unclassified__';
const UNCLASSIFIED_NAME = '未分类';

const KNOWN_KEYS = {
  pipeline: ['name', 'description', 'classes', 'extract', 'decide', 'fallback'],
  classDef: ['id', 'name', 'anyOf'],
  fieldDef: ['pattern', 'group', 'type', 'required', 'default'],
  rule: ['when', 'then'],
  when: ['field', 'op', 'value'],
  then: ['verdict', 'severity', 'label', 'route', 'note'],
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function compilePattern(pattern) {
  if (typeof pattern === 'string' && pattern.startsWith('re:')) {
    const source = pattern.slice(3);
    let re;
    try { re = new RegExp(source); } catch (e) { return { error: `正则编译失败 /${source}/：${e.message}` }; }
    return { re, kind: 're', source };
  }
  return { kind: 'literal', needle: String(pattern).toLowerCase() };
}

/** 单模式匹配；返回 { hit, evidence }（evidence=原文命中的子串，未命中为 null） */
function matchPattern(compiled, text) {
  if (compiled.kind === 're') {
    const m = compiled.re.exec(text);
    return m ? { hit: true, evidence: m[0] } : { hit: false, evidence: null };
  }
  const idx = text.toLowerCase().indexOf(compiled.needle);
  if (idx === -1) return { hit: false, evidence: null };
  return { hit: true, evidence: text.slice(idx, idx + compiled.needle.length) };
}

function fmtPath(parts) { return parts.join(''); }

// ── 模板校验 ────────────────────────────────────────────────────────────────
// 返回 { ok, error?, warnings? }；ok 时 warnings 为 info 级提示（未知键等）。

function validatePipeline(p) {
  if (!isPlainObject(p)) return { ok: false, error: '模板须为对象' };
  const warnings = [];
  const unknownTop = Object.keys(p).filter((k) => !KNOWN_KEYS.pipeline.includes(k));
  if (unknownTop.length) warnings.push({ level: 'info', msg: `模板存在未知顶层键（可能拼写错误）：${unknownTop.join(', ')}（已忽略）` });
  if (p.classes !== undefined && !Array.isArray(p.classes)) return { ok: false, error: 'classes 须为数组' };
  const classes = Array.isArray(p.classes) ? p.classes : [];
  const classIds = new Set();
  for (let i = 0; i < classes.length; i++) {
    const c = classes[i];
    const at = fmtPath(['classes[', String(i), ']']);
    if (!isPlainObject(c)) return { ok: false, error: `${at} 须为对象` };
    if (typeof c.id !== 'string' || !c.id.trim()) return { ok: false, error: `${at}.id 须为非空字符串` };
    if (classIds.has(c.id)) return { ok: false, error: `${at}.id 重复：${c.id}` };
    classIds.add(c.id);
    if (!Array.isArray(c.anyOf) || c.anyOf.length === 0) return { ok: false, error: `${at}.anyOf 须为非空模式数组` };
    for (let j = 0; j < c.anyOf.length; j++) {
      if (typeof c.anyOf[j] !== 'string') return { ok: false, error: `${at}.anyOf[${j}] 须为字符串` };
      const compiled = compilePattern(c.anyOf[j]);
      if (compiled.error) return { ok: false, error: `${at}.anyOf[${j}] ${compiled.error}` };
    }
  }
  // extract：字段定义逐个校验（正则可编译 / 类型合法 / 类别引用存在）
  if (p.extract !== undefined) {
    if (!isPlainObject(p.extract)) return { ok: false, error: 'extract 须为对象（键=类别 id 或 *）' };
    for (const cid of Object.keys(p.extract)) {
      const at = fmtPath(['extract.', cid]);
      if (cid !== '*' && !classIds.has(cid)) return { ok: false, error: `${at} 引用了未定义的类别 id「${cid}」` };
      const fields = p.extract[cid];
      if (!isPlainObject(fields)) return { ok: false, error: `${at} 须为对象（键=字段名）` };
      for (const fname of Object.keys(fields)) {
        const f = fields[fname];
        const fat = fmtPath([at, '.', fname]);
        if (!isPlainObject(f)) return { ok: false, error: `${fat} 须为对象` };
        if (typeof f.pattern !== 'string') return { ok: false, error: `${fat}.pattern 须为字符串` };
        const compiled = compilePattern(f.pattern);
        if (compiled.error) return { ok: false, error: `${fat}.pattern ${compiled.error}` };
        if (f.group !== undefined) {
          if (typeof f.group === 'number') {
            if (!Number.isInteger(f.group) || f.group < 0) return { ok: false, error: `${fat}.group 须为非负整数` };
            if (compiled.kind === 'literal') return { ok: false, error: `${fat}.group 仅 re: 正则形态支持（字面量模式无捕获组）` };
          } else if (typeof f.group !== 'string') {
            return { ok: false, error: `${fat}.group 须为非负整数或命名组字符串` };
          }
        }
        if (f.type !== undefined && !TYPES.includes(f.type)) return { ok: false, error: `${fat}.type 须为 ${TYPES.join('/')}` };
        if (f.required !== undefined && typeof f.required !== 'boolean') return { ok: false, error: `${fat}.required 须为布尔` };
      }
    }
  }
  // decide：条件与动作逐条校验
  if (p.decide !== undefined) {
    if (!isPlainObject(p.decide)) return { ok: false, error: 'decide 须为对象（键=类别 id 或 *）' };
    for (const cid of Object.keys(p.decide)) {
      const at = fmtPath(['decide.', cid]);
      if (cid !== '*' && !classIds.has(cid)) return { ok: false, error: `${at} 引用了未定义的类别 id「${cid}」` };
      const rules = p.decide[cid];
      if (!Array.isArray(rules)) return { ok: false, error: `${at} 须为规则数组` };
      for (let i = 0; i < rules.length; i++) {
        const r = rules[i];
        const rat = fmtPath([at, '[', String(i), ']']);
        if (!isPlainObject(r)) return { ok: false, error: `${rat} 须为对象` };
        if (!isPlainObject(r.when)) return { ok: false, error: `${rat}.when 须为对象 { field, op, value? }` };
        if (typeof r.when.field !== 'string' || !r.when.field.trim()) return { ok: false, error: `${rat}.when.field 须为非空字符串` };
        if (!OPS.includes(r.when.op)) return { ok: false, error: `${rat}.when.op 须为 ${OPS.join('/')}` };
        if (VALUE_OPS.includes(r.when.op) && r.when.value === undefined) return { ok: false, error: `${rat}.when.value 缺失（算子 ${r.when.op} 需要 value）` };
        if (r.when.op === 'matches') {
          if (typeof r.when.value !== 'string') return { ok: false, error: `${rat}.when.value 须为正则字符串（matches）` };
          try { new RegExp(r.when.value); } catch (e) { return { ok: false, error: `${rat}.when.value 正则编译失败：${e.message}` }; }
        }
        if (r.when.op === 'in' && !Array.isArray(r.when.value)) return { ok: false, error: `${rat}.when.value 须为数组（in）` };
        if (!isPlainObject(r.then)) return { ok: false, error: `${rat}.then 须为对象` };
        if (typeof r.then.verdict !== 'string' || !r.then.verdict.trim()) return { ok: false, error: `${rat}.then.verdict 须为非空字符串` };
      }
    }
  }
  if (p.fallback !== undefined) {
    if (!isPlainObject(p.fallback)) return { ok: false, error: 'fallback 须为对象 { verdict, ... }' };
    if (typeof p.fallback.verdict !== 'string' || !p.fallback.verdict.trim()) return { ok: false, error: 'fallback.verdict 须为非空字符串' };
  }
  return { ok: true, warnings };
}

// ── 类型归一 ────────────────────────────────────────────────────────────────

function toInt(raw) {
  const s = String(raw).trim();
  if (!/^[+-]?\d+$/.test(s)) return { error: `「${raw}」不是整数` };
  const n = Number(s);
  return !Number.isSafeInteger(n) ? { error: `「${raw}」超出安全整数范围` } : { value: n };
}

function toFloat(raw) {
  const s = String(raw).trim();
  if (s === '' || !Number.isFinite(Number(s))) return { error: `「${raw}」不是有限数` };
  return { value: Number(s) };
}

function toBool(raw) {
  const s = String(raw).trim().toLowerCase();
  if (['true', 'yes', 'on', '1'].includes(s)) return { value: true };
  if (['false', 'no', 'off', '0'].includes(s)) return { value: false };
  return { error: `「${raw}」不是布尔（true/false/yes/no/on/off/1/0）` };
}

const DUR_UNIT_MS = { d: 86400000, h: 3600000, m: 60000, s: 1000, ms: 1 };

/** duration："<n><unit>" 序列（如 2m30s / 1.5h / 800ms）；裸数字按毫秒 */
function toDuration(raw) {
  const s = String(raw).trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(s)) return { value: Number(s) };
  const re = /(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/g;
  let total = 0; let m; let matched = false; let lastEnd = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index !== lastEnd) return { error: `「${raw}」时长格式无法整段解析（位置 ${m.index} 处断开）` };
    matched = true;
    total += Number(m[1]) * DUR_UNIT_MS[m[2]];
    lastEnd = re.lastIndex;
  }
  if (!matched || lastEnd !== s.length) return { error: `「${raw}」时长格式无法整段解析（单位：d/h/m/s/ms）` };
  return { value: total };
}

const BYTE_UNIT = { b: 1, kb: 1024, kib: 1024, mb: 1024 ** 2, mib: 1024 ** 2, gb: 1024 ** 3, gib: 1024 ** 3, tb: 1024 ** 4, tib: 1024 ** 4 };

/** bytes："512KB" / "1.5MB" / 裸数字按字节；一律 1024 进制（KB=KiB） */
function toBytes(raw) {
  const m = String(raw).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|kib|mb|mib|gb|gib|tb|tib)$/);
  if (!m) {
    if (/^\d+(\.\d+)?$/.test(String(raw).trim())) return { value: Number(String(raw).trim()) };
    return { error: `「${raw}」不是字节数（支持 B/KB/MB/GB/TB，1024 进制）` };
  }
  return { value: Number(m[1]) * BYTE_UNIT[m[2]] };
}

/** date：ISO 8601 直解；"YYYY-MM-DD HH:mm[:ss]" 一律按本机时区解释（显式替换空格为 T，
 *  不依赖引擎对空格格式的遗留行为，跨引擎一致）并注明；输出 ISO 字符串 */
function toDate(raw) {
  const s = String(raw).trim();
  let ms;
  let localAssumed = false;
  if (/^\d{4}-\d{2}-\d{2} \d{2}(:\d{2})?(:\d{2})?$/.test(s)) {
    ms = Date.parse(s.replace(' ', 'T'));
    localAssumed = true;
  } else {
    ms = Date.parse(s);
  }
  if (Number.isNaN(ms)) return { error: `「${raw}」不是可识别的时间（ISO 8601 或 YYYY-MM-DD HH:mm[:ss]）` };
  return { value: new Date(ms).toISOString(), localAssumed };
}

function convertType(raw, type) {
  switch (type) {
    case 'int': return toInt(raw);
    case 'float': return toFloat(raw);
    case 'bool': return toBool(raw);
    case 'duration': return toDuration(raw);
    case 'bytes': return toBytes(raw);
    case 'date': return toDate(raw);
    default: return { value: String(raw) }; // string 及未知类型兜底为原文
  }
}

// ── 决策算子 ────────────────────────────────────────────────────────────────

function asNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.trim()))) return Number(v.trim());
  return null;
}

/** 求值单条 when；返回 { matched, reason }（reason 进 trace，中文） */
function evalWhen(when, fields) {
  const has = Object.prototype.hasOwnProperty.call(fields, when.field);
  const v = has ? fields[when.field] : undefined;
  const present = has && v !== null && v !== undefined;
  const op = when.op;
  if (op === 'exists') return { matched: present, reason: present ? `字段存在` : `字段不存在或为空` };
  if (op === 'missing') return { matched: !present, reason: present ? `字段存在（值 ${JSON.stringify(v)}）` : `字段不存在或为空` };
  if (!present) return { matched: false, reason: `字段不存在或为空，无法比较` };

  const numField = asNumber(v);
  const numValue = asNumber(when.value);
  switch (op) {
    case 'eq':
      if (numField !== null && numValue !== null) return { matched: numField === numValue, reason: `${v} ${numField === numValue ? '=' : '≠'} ${when.value}` };
      return { matched: String(v) === String(when.value), reason: `字符串比较 ${JSON.stringify(String(v))} ${String(v) === String(when.value) ? '=' : '≠'} ${JSON.stringify(String(when.value))}` };
    case 'ne': {
      if (numField !== null && numValue !== null) return { matched: numField !== numValue, reason: `${v} ${numField !== numValue ? '≠' : '='} ${when.value}` };
      const ne = String(v) !== String(when.value);
      return { matched: ne, reason: `字符串比较 ${JSON.stringify(String(v))} ${ne ? '≠' : '='} ${JSON.stringify(String(when.value))}` };
    }
    case 'gt': case 'gte': case 'lt': case 'lte': {
      if (numField === null || numValue === null) return { matched: false, reason: `非数值不可比（字段 ${JSON.stringify(v)}，阈值 ${JSON.stringify(when.value)}）——本规则不命中` };
      const sym = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[op];
      const cmp = { gt: numField > numValue, gte: numField >= numValue, lt: numField < numValue, lte: numField <= numValue }[op];
      return { matched: cmp, reason: `${numField} ${cmp ? sym : sym + '×'} ${numValue}` };
    }
    case 'contains': {
      const hit = String(v).includes(String(when.value));
      return { matched: hit, reason: `${JSON.stringify(String(v))} ${hit ? '含' : '不含'} ${JSON.stringify(String(when.value))}` };
    }
    case 'matches': {
      let re;
      try { re = new RegExp(when.value); } catch (e) { return { matched: false, reason: `阈值正则编译失败（校验漏网）：${e.message}` }; }
      const hit = re.test(String(v));
      return { matched: hit, reason: `${JSON.stringify(String(v))} ${hit ? '匹配' : '不匹配'} /${when.value}/` };
    }
    case 'in': {
      const hit = Array.isArray(when.value) && when.value.some((x) => (asNumber(x) !== null && numField !== null ? asNumber(x) === numField : String(x) === String(v)));
      return { matched: hit, reason: `${JSON.stringify(v)} ${hit ? '∈' : '∉'} [${(when.value || []).map((x) => JSON.stringify(x)).join(', ')}]` };
    }
    default:
      return { matched: false, reason: `未知算子 ${op}` };
  }
}

function sanitizeOutcome(o) {
  return {
    verdict: String(o.verdict),
    severity: o.severity === undefined ? undefined : String(o.severity),
    label: o.label === undefined ? undefined : String(o.label),
    route: o.route === undefined ? undefined : String(o.route),
    note: o.note === undefined ? undefined : String(o.note),
  };
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

/**
 * 运行分流。返回：
 * { ok, error?, warnings[], classId, className, classifyEvidence,
 *   fields{}, fieldMeta{ name:{raw,value,type,ok,warn} }, decision{...}, trace[] }
 * 抽取/决策永不抛错（错误进 warnings 与 ok:false 仅限模板非法）。
 */
function runPipeline(pipeline, text, opts) {
  const v = validatePipeline(pipeline);
  if (!v.ok) return { ok: false, error: v.error, warnings: [], trace: [] };
  const warnings = (v.warnings || []).map((w) => ({ ...w }));
  const trace = [];
  const input = typeof text === 'string' ? text : String(text == null ? '' : text);

  // ① 分类：按序首中即决
  const classes = Array.isArray(pipeline.classes) ? pipeline.classes : [];
  let hitClass = null; let hitPattern = null; let evidence = null;
  for (const c of classes) {
    for (const pat of c.anyOf) {
      const compiled = compilePattern(pat);
      const r = matchPattern(compiled, input);
      trace.push({ step: 'classify', classId: c.id, pattern: pat, hit: r.hit, evidence: r.evidence });
      if (r.hit && !hitClass) { hitClass = c; hitPattern = pat; evidence = r.evidence; }
    }
  }
  const classId = hitClass ? hitClass.id : UNCLASSIFIED_ID;
  const className = hitClass ? (hitClass.name || hitClass.id) : UNCLASSIFIED_NAME;
  if (!hitClass) warnings.push({ level: 'info', msg: '未命中任何分类规则，落入未分类（走 fallback）' });

  // ② 抽取：'*' 共享层 + 类别专属层（专属覆盖同名）
  const fields = {}; const fieldMeta = {};
  const extractSpec = isPlainObject(pipeline.extract) ? pipeline.extract : {};
  const fieldOrder = [];
  const layerSpecs = [];
  if (extractSpec['*']) layerSpecs.push({ from: '*', spec: extractSpec['*'] });
  if (extractSpec[classId]) layerSpecs.push({ from: classId, spec: extractSpec[classId] });
  for (const layer of layerSpecs) {
    for (const fname of Object.keys(layer.spec)) {
      // '*' 层在前、类别层在后；同名时类别层覆盖（后写胜出），不重复抽取
      const existing = fieldOrder.find((x) => x.name === fname);
      if (!existing) fieldOrder.push({ name: fname, def: layer.spec[fname], layer: layer.from });
      else { existing.def = layer.spec[fname]; existing.layer = layer.from; }
    }
  }
  for (const item of fieldOrder) {
    const fname = item.name; const def = item.def;
    const compiled = compilePattern(def.pattern);
    const m = compiled.kind === 're' ? compiled.re.exec(input) : matchPattern(compiled, input);
    let raw = null; let hit = false; let groupNote = '';
    if (compiled.kind === 'literal') {
      if (m && m.hit) { raw = m.evidence; hit = true; }
    } else if (m) {
      hit = true;
      let gi = 1;
      if (def.group !== undefined) gi = def.group;
      else if (m.length > 1) gi = 1; // 有捕获组默认取第 1 组
      else gi = 0;
      if (typeof gi === 'number') {
        if (gi >= m.length) { hit = false; groupNote = `捕获组 ${gi} 不存在（共 ${m.length - 1} 组）`; } else raw = m[gi];
      } else if (m.groups && gi in m.groups) {
        raw = m.groups[gi];
      } else { hit = false; groupNote = `命名组「${gi}」不存在`; }
    }
    const meta = { raw: hit ? raw : null, value: null, type: def.type || 'string', ok: false, warn: null, layer: item.layer };
    if (hit) {
      const conv = convertType(raw, def.type || 'string');
      if (conv.error) {
        meta.warn = conv.error;
        warnings.push({ level: def.required ? 'warn' : 'info', msg: `字段 ${fname}：${conv.error}（按未抽取处理）` });
      } else {
        meta.ok = true; meta.value = conv.value;
        if (conv.localAssumed) meta.warn = '时间无时区字样，按本机时区解释';
      }
    } else {
      meta.warn = groupNote || '未匹配到';
      warnings.push({ level: def.required ? 'warn' : 'info', msg: `字段 ${fname} 未抽取到${def.required ? '（必填）' : ''}${groupNote ? '：' + groupNote : ''}` });
    }
    if (!meta.ok && def.default !== undefined) { meta.value = def.default; meta.ok = true; meta.warn = (meta.warn ? meta.warn + '；' : '') + `已用 default=${JSON.stringify(def.default)}`; }
    fields[fname] = meta.value;
    fieldMeta[fname] = meta;
    trace.push({ step: 'extract', field: fname, pattern: def.pattern, ok: meta.ok, raw: meta.raw, value: meta.value, warn: meta.warn });
  }

  // ③ 决策：类别规则 → '*' 规则 → fallback → 内置默认（首中即决）
  const decideSpec = isPlainObject(pipeline.decide) ? pipeline.decide : {};
  const evalList = (list, listName) => {
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const ev = evalWhen(r.when, fields);
      trace.push({ step: 'decide', list: listName, index: i, when: r.when, matched: ev.matched, reason: ev.reason });
      if (ev.matched) return { outcome: sanitizeOutcome(r.then), source: `${listName}[${i}]`, reason: ev.reason };
    }
    return null;
  };
  let decision = null;
  if (Array.isArray(decideSpec[classId]) && decideSpec[classId].length) {
    decision = evalList(decideSpec[classId], `decide.${classId}`);
  }
  if (!decision && Array.isArray(decideSpec['*']) && decideSpec['*'].length) {
    decision = evalList(decideSpec['*'], 'decide.*');
  }
  if (!decision) {
    if (isPlainObject(pipeline.fallback)) {
      decision = { outcome: sanitizeOutcome(pipeline.fallback), source: 'fallback', reason: '无决策规则命中（或未分类），走模板 fallback' };
    } else {
      decision = {
        outcome: { verdict: classId === UNCLASSIFIED_ID ? '未分类' : '无处置规则命中', severity: classId === UNCLASSIFIED_ID ? undefined : 'P3' },
        source: 'default',
        reason: classId === UNCLASSIFIED_ID ? '未分类且模板未定义 fallback' : '该类别无命中规则且模板未定义 fallback',
      };
    }
    trace.push({ step: 'decide', list: decision.source, index: -1, matched: true, reason: decision.reason });
  }

  return {
    ok: true,
    warnings,
    classId,
    className,
    classifyEvidence: evidence,
    classifyPattern: hitClass ? hitPattern : null,
    fields,
    fieldMeta,
    decision: { ...decision.outcome, source: decision.source, reason: decision.reason },
    trace,
  };
}

// ── 文本渲染（MCP 输出用）─────────────────────────────────────────────────

function outcomeLine(o) {
  const parts = [`verdict=${o.verdict}`];
  if (o.severity !== undefined) parts.push(`severity=${o.severity}`);
  if (o.label !== undefined) parts.push(`label=${o.label}`);
  if (o.route !== undefined) parts.push(`route=${o.route}`);
  if (o.note !== undefined) parts.push(`note=${o.note}`);
  return parts.join(' ');
}

function renderRun(r) {
  if (!r.ok) return `模板非法：${r.error}`;
  const lines = [];
  lines.push(`分流结果：${r.decision.verdict}${r.decision.severity !== undefined ? `（${r.decision.severity}）` : ''}`);
  lines.push(`类别：${r.classId}（${r.className}）${r.classifyPattern !== null ? `｜命中模式：${r.classifyPattern}｜证据「${r.classifyEvidence}」` : ''}`);
  const names = Object.keys(r.fields);
  if (names.length) {
    lines.push('字段：');
    for (const n of names) {
      const m = r.fieldMeta[n];
      lines.push(`  ${n} = ${JSON.stringify(r.fields[n])}（${m.type}${m.ok ? '' : '，未抽取'}${m.warn ? `；${m.warn}` : ''}）`);
    }
  } else {
    lines.push('字段：（该类别无抽取定义）');
  }
  lines.push(`决策：${outcomeLine(r.decision)}`);
  lines.push(`  命中：${r.decision.source} —— ${r.decision.reason}`);
  if (r.warnings.length) {
    lines.push('警示：');
    for (const w of r.warnings) lines.push(`  ${w.level === 'warn' ? '⚠' : 'ℹ'} ${w.msg}`);
  }
  lines.push(`证据链 trace（${r.trace.length} 步）：`);
  for (const t of r.trace) {
    if (t.step === 'classify') lines.push(`  [分类] ${t.classId} ← ${t.pattern}：${t.hit ? `命中「${t.evidence}」` : '未命中'}`);
    else if (t.step === 'extract') lines.push(`  [抽取] ${t.field} ← ${t.pattern}：${t.ok ? `原文「${t.raw}」→ ${JSON.stringify(t.value)}` : `未抽取（${t.warn || ''}）`}`);
    else if (t.step === 'decide') lines.push(`  [决策] ${t.list}${t.index >= 0 ? `[${t.index}]` : ''} when(${JSON.stringify(t.when)})：${t.matched ? '命中' : '未命中'}（${t.reason}）`);
  }
  return lines.join('\n');
}

/** 规则的中文一句话描述（列表/编辑器用） */
function describePipeline(p) {
  const classes = Array.isArray(p.classes) ? p.classes : [];
  const classCount = classes.length;
  const extractKeys = isPlainObject(p.extract) ? Object.keys(p.extract) : [];
  const decideKeys = isPlainObject(p.decide) ? Object.keys(p.decide) : [];
  const fieldCount = new Set(extractKeys.flatMap((k) => Object.keys(isPlainObject(p.extract[k]) ? p.extract[k] : {}))).size;
  const ruleCount = decideKeys.reduce((acc, k) => acc + (Array.isArray(p.decide[k]) ? p.decide[k].length : 0), 0);
  return `类别 ${classCount} 个（${classes.map((c) => c.id).join('/') || '无'}）｜字段 ${fieldCount} 个｜决策规则 ${ruleCount} 条`;
}

module.exports = {
  TYPES,
  OPS,
  UNCLASSIFIED_ID,
  validatePipeline,
  runPipeline,
  renderRun,
  describePipeline,
};
