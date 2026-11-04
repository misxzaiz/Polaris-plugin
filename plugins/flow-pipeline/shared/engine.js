'use strict';
/**
 * engine.js —— 自动化流水线核心引擎（零依赖，service / mcp / test 共享）
 *
 * 职责：
 *   - validatePipeline：流水线定义校验（逐字段点名，错误可被 AI 直接读懂修复）
 *   - resolveTemplate：{{path}} 插值（整串占位保持原值类型；部分嵌入转字符串）
 *   - getPath：JSONPath-lite（点路径 / 数组下标 / [*] / [?k=v] 简单过滤）
 *   - evaluateExpr：when 门控表达式（|| && ! 比较 contains matches exists，支持括号）
 *   - maskSecrets / MASK：出口掩码（前 4 后 2 + 哨兵值）
 *
 * 上下文（ctx）形状 —— 插值与表达式共用：
 *   { vars: {...流水线常量}, steps: { <saveAs>: 步骤输出 }, params: {...触发参数}, env: { now, today, runId, plId, plName } }
 *   路径首段命中 vars/steps/params/env 四个根作用域之一则严格取用；
 *   否则整体回落到 vars（{{apiHost}} 等价 {{vars.apiHost}}）。
 */
const crypto = require('crypto');

// ── 常量 ────────────────────────────────────────────────────────────────────
const MASK = '__FLOWPIPE_MASKED__';
const ROOT_SCOPES = ['vars', 'steps', 'params', 'env'];
const FORBIDDEN_SAVE_AS = ROOT_SCOPES.slice();
const STEP_TYPES = ['http', 'mcp', 'ai', 'extract', 'template', 'script', 'kv', 'file', 'notify'];
const TRIGGER_TYPES = ['manual', 'interval', 'daily', 'webhook'];
const MAX_STEPS = 30;
const MAX_NAME = 60;
const MAX_SCRIPT_BYTES = 8192;
const MAX_TEMPLATE_BYTES = 65536;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function genId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// ── 插值 ────────────────────────────────────────────────────────────────────
const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * 解析单个路径表达式到 ctx。返回 {found, value}。
 * 首段命中根作用域（vars/steps/params/env）则在其上严格取用（steps.resp.json）；
 * 否则按 vars → steps → params 顺序回落查找首个命中（{{host}}、{{resp.json}} 均可直写）。
 * 通配/过滤语义继承 getPath（聚合数组）。
 */
function lookupPath(ctx, rawPath) {
  const expr = String(rawPath || '').trim();
  if (!expr) return { found: false, value: undefined };
  const head = splitPath(expr)[0];
  if (ROOT_SCOPES.includes(head)) {
    const rest = expr.slice(head.length).replace(/^\./, '');
    if (!rest) return { found: true, value: ctx[head] };
    return getPath(ctx[head], rest);
  }
  for (const scope of ['vars', 'steps', 'params']) {
    if (!ctx[scope]) continue;
    const r = getPath(ctx[scope], expr);
    if (r.found) return r;
  }
  return { found: false, value: undefined };
}

/** 点路径切分（含 [n] / [*] / [?k=v] 片段归一化；通配/过滤段原样保留给 getPath 处理） */
function splitPath(raw) {
  return String(raw || '')
    .replace(/\[\s*"?([A-Za-z0-9_-]+)"?\s*\]/g, '.$1')
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * JSONPath-lite：支持 a.b.c / a.0.b / a[-1] / a[*] / a[?k=v]（数组元素字段等于值）。
 * 返回 {found, value}。含通配/过滤的路径 → 所有命中聚合成数组（零命中 → []，found:true）；
 * 无通配 → 首个命中。
 */
function getPath(value, rawExpr) {
  const expr = String(rawExpr || '').trim();
  if (!expr) return { found: true, value };
  // 归一化：a[0] / a[*] → a.0 / a.*；a[?k=v] → a.?k=v（点分段后按 ?k=v 识别过滤段）
  const normExpr = expr
    .replace(/([A-Za-z0-9_-]+)\[\?\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*([^\]]*?)\s*\]/g, '$1.?$2=$3')
    .replace(/([A-Za-z0-9_-]+)\[(-?\d+|\*)\]/g, '$1.$2');
  const tokens = normExpr
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);
  const norm = [];
  for (const t of tokens) {
    if (t === '*') { norm.push('*'); continue; }
    if (/^-?\d+$/.test(t)) { norm.push(Number(t)); continue; }
    const fm = /^\?([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*)$/.exec(t);
    if (fm) { norm.push(`?${fm[1]}=${fm[2]}`); continue; }
    const wm = /^(.+)\[(\*|-?\d+)\]$/.exec(t);
    if (wm) {
      norm.push(wm[1]);
      norm.push(wm[2] === '*' ? '*' : Number(wm[2]));
      continue;
    }
    norm.push(t);
  }
  if (!norm.length) return lookupPathInValue(value, splitPath(expr));
  let branches = [{ found: true, value }];
  for (const seg of norm) {
    const next = [];
    for (const item of branches) {
      if (!item.found) { next.push(item); continue; }
      next.push(...descendSeg(item.value, seg));
    }
    branches = next;
    if (!branches.length) branches = [{ found: false, value: undefined }];
  }
  const founds = branches.filter((b) => b.found);
  const hasWild = norm.some((s) => s === '*' || (typeof s === 'string' && s.startsWith('?')));
  if (hasWild) return { found: true, value: founds.map((b) => b.value) };
  if (founds.length) return { found: true, value: founds[0].value };
  return { found: false, value: undefined };
}

function descendSeg(v, seg) {
  if (seg === '*') {
    if (Array.isArray(v)) return v.map((el) => ({ found: true, value: el }));
    if (isPlainObject(v)) return Object.keys(v).map((k) => ({ found: true, value: v[k] }));
    return [{ found: false, value: undefined }];
  }
  if (typeof seg === 'number') {
    if (Array.isArray(v)) {
      const idx = seg < 0 ? v.length + seg : seg;
      if (idx >= 0 && idx < v.length) return [{ found: true, value: v[idx] }];
      return [{ found: false, value: undefined }];
    }
    return [{ found: false, value: undefined }];
  }
  if (typeof seg === 'string' && seg.startsWith('?')) {
    const eq = seg.indexOf('=');
    const key = seg.slice(1, eq);
    let expect = seg.slice(eq + 1).trim();
    expect = expect.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    if (Array.isArray(v)) {
      return v
        .filter((el) => isPlainObject(el) && stringifyValue(el[key]) === expect)
        .map((el) => ({ found: true, value: el }));
    }
    return [{ found: false, value: undefined }];
  }
  return [lookupPathInValue(v, [seg])];
}

function lookupPathInValue(value, parts) {
  let cur = value;
  for (const key of parts) {
    if (cur === null || cur === undefined) return { found: false, value: undefined };
    if (Array.isArray(cur)) {
      const idx = key === 'length' ? cur.length : Number(key);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return { found: false, value: undefined };
      cur = cur[idx];
    } else if (typeof cur === 'object') {
      if (!Object.prototype.hasOwnProperty.call(cur, key)) return { found: false, value: undefined };
      cur = cur[key];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: cur };
}

/**
 * 模板插值。整串恰为一个占位符且命中 → 返回原值（保持对象/数组/数字类型）；
 * 命中失败 → 返回 ''（补 warning）。部分嵌入 → 各命中值 String() 化拼接。
 * 非 string 输入原样返回。返回 {value, warnings[]}。
 */
function resolveTemplate(input, ctx) {
  if (input === null || input === undefined || typeof input !== 'string') {
    return { value: input, warnings: [] };
  }
  const warnings = [];
  const whole = /^\{\{\s*([^{}]+?)\s*\}\}$/.exec(input.trim());
  if (whole) {
    const r = lookupPath(ctx, whole[1]);
    if (r.found) return { value: r.value, warnings };
    warnings.push(`占位符 {{${whole[1].trim()}}} 未命中，已替换为空串`);
    return { value: '', warnings };
  }
  let out = '';
  let last = 0;
  PLACEHOLDER_RE.lastIndex = 0;
  let m;
  while ((m = PLACEHOLDER_RE.exec(input))) {
    out += input.slice(last, m.index);
    last = m.index + m[0].length;
    const r = lookupPath(ctx, m[1]);
    if (r.found) out += stringifyValue(r.value);
    else warnings.push(`占位符 {{${m[1].trim()}}} 未命中，已替换为空串`);
  }
  out += input.slice(last);
  return { value: out, warnings };
}

function stringifyValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  }
  return String(v);
}

/** 深度插值对象/数组（字符串逐个处理），返回 {value, warnings[]} */
function resolveDeep(input, ctx) {
  if (typeof input === 'string') return resolveTemplate(input, ctx);
  if (Array.isArray(input)) {
    const warnings = [];
    const value = input.map((el) => {
      const r = resolveDeep(el, ctx);
      warnings.push(...r.warnings);
      return r.value;
    });
    return { value, warnings };
  }
  if (isPlainObject(input)) {
    const warnings = [];
    const value = {};
    for (const k of Object.keys(input)) {
      const r = resolveDeep(input[k], ctx);
      value[k] = r.value;
      warnings.push(...r.warnings);
    }
    return { value, warnings };
  }
  return { value: input, warnings: [] };
}

// ── when 表达式求值 ──────────────────────────────────────────────────────────
/**
 * 语法：or := and ('||' and)*；and := cmp ('&&' cmp)*；cmp := operand [op operand]
 * op ∈ == != > >= < < contains !contains startswith endswith matches；支持 exists path / ! / 括号。
 * operand := 数字 | '串' | "串" | true/false/null | {{path}} | 裸路径
 * 空表达式 → true。语法错误 throw Error（消息含原文位置）。
 */
function evaluateExpr(raw, ctx) {
  const expr = String(raw || '').trim();
  if (!expr) return true;
  const tokens = tokenizeExpr(expr);
  const p = new Parser(tokens, ctx);
  const v = p.parseOr();
  p.expectEnd();
  return truthy(v);
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v !== '' && v !== 'false' && v !== '0';
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

function tokenizeExpr(s) {
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (s.startsWith('&&', i)) { tokens.push({ t: 'op', v: '&&' }); i += 2; continue; }
    if (s.startsWith('||', i)) { tokens.push({ t: 'op', v: '||' }); i += 2; continue; }
    if (s.startsWith('==', i)) { tokens.push({ t: 'op', v: '==' }); i += 2; continue; }
    if (s.startsWith('!=', i)) { tokens.push({ t: 'op', v: '!=' }); i += 2; continue; }
    if (s.startsWith('>=', i)) { tokens.push({ t: 'op', v: '>=' }); i += 2; continue; }
    if (s.startsWith('<=', i)) { tokens.push({ t: 'op', v: '<=' }); i += 2; continue; }
    if (c === '>' || c === '<') { tokens.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(') { tokens.push({ t: 'lparen', v: c }); i++; continue; }
    if (c === ')') { tokens.push({ t: 'rparen', v: c }); i++; continue; }
    if (c === '!') {
      if (s.startsWith('!contains', i)) { tokens.push({ t: 'op', v: '!contains' }); i += '!contains'.length; continue; }
      tokens.push({ t: 'not', v: '!' }); i++; continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let buf = '';
      while (j < s.length && s[j] !== quote) {
        if (s[j] === '\\' && j + 1 < s.length) { buf += s[j + 1]; j += 2; continue; }
        buf += s[j]; j++;
      }
      if (j >= s.length) throw new Error(`表达式语法错误：第 ${i + 1} 字符处字符串引号未闭合`);
      tokens.push({ t: 'str', v: buf });
      i = j + 1;
      continue;
    }
    // 关键字
    const wordMatch = /^[A-Za-z_][A-Za-z0-9_.$\[\]*-]*/.exec(s.slice(i));
    if (wordMatch) {
      const word = wordMatch[0];
      if (word === 'true' || word === 'false' || word === 'null') { tokens.push({ t: 'lit', v: word === 'true' ? true : word === 'false' ? false : null }); i += word.length; continue; }
      if (['contains', 'startswith', 'endswith', 'matches', 'exists', 'and', 'or'].includes(word)) {
        if (word === 'and') { tokens.push({ t: 'op', v: '&&' }); }
        else if (word === 'or') { tokens.push({ t: 'op', v: '||' }); }
        else tokens.push({ t: 'op', v: word });
        i += word.length; continue;
      }
      // 裸路径（可能带 {{}}？不带，{{ 已在下方处理）——路径里允许点
      tokens.push({ t: 'path', v: word });
      i += word.length; continue;
    }
    if (s.startsWith('{{', i)) {
      const end = s.indexOf('}}', i);
      if (end < 0) throw new Error(`表达式语法错误：第 ${i + 1} 字符处 {{ 未闭合`);
      tokens.push({ t: 'path', v: s.slice(i + 2, end).trim() });
      i = end + 2;
      continue;
    }
    const numMatch = /^-?\d+(\.\d+)?/.exec(s.slice(i));
    if (numMatch) { tokens.push({ t: 'num', v: Number(numMatch[0]) }); i += numMatch[0].length; continue; }
    throw new Error(`表达式语法错误：第 ${i + 1} 字符附近无法识别「${s.slice(i, i + 12)}」`);
  }
  return tokens;
}

class Parser {
  constructor(tokens, ctx) {
    this.tokens = tokens;
    this.i = 0;
    this.ctx = ctx;
  }
  peek() { return this.tokens[this.i]; }
  next() { return this.tokens[this.i++]; }
  expectEnd() {
    if (this.i < this.tokens.length) throw new Error(`表达式语法错误：第 ${this.i + 1} 个 token「${JSON.stringify(this.tokens[this.i].v)}」多余`);
  }
  parseOr() {
    let left = this.parseAnd();
    while (this.peek() && this.peek().t === 'op' && this.peek().v === '||') {
      this.next();
      const right = this.parseAnd();
      left = truthy(left) || truthy(right) ? (truthy(left) ? left : right) : right;
    }
    return left;
  }
  parseAnd() {
    let left = this.parseUnary();
    while (this.peek() && this.peek().t === 'op' && this.peek().v === '&&') {
      this.next();
      const right = this.parseUnary();
      left = truthy(left) && truthy(right) ? (truthy(left) ? left : right) : right;
    }
    return left;
  }
  parseUnary() {
    const tk = this.peek();
    if (tk && tk.t === 'not') {
      this.next();
      return !truthy(this.parseUnary());
    }
    if (tk && tk.t === 'op' && tk.v === 'exists') {
      this.next();
      const r = this.parsePrimary(false);
      return r.found === true;
    }
    return this.parseCompare();
  }
  parseCompare() {
    const left = this.parsePrimary(true);
    const tk = this.peek();
    if (!tk || tk.t !== 'op') return left;
    const op = tk.v;
    if (!['==', '!=', '>', '>=', '<', '<=', 'contains', '!contains', 'startswith', 'endswith', 'matches'].includes(op)) {
      // || && 等交给上层
      return left;
    }
    this.next();
    const rightTk = this.parsePrimary(true);
    const lv = left.found ? left.value : undefined;
    const rv = rightTk.found ? rightTk.value : undefined;
    return applyCompare(op, lv, rv, left.found, rightTk.found);
  }
  /**
   * literalFallback：比较操作的裸单词操作数（无点、非关键字）查不到变量时按字符串字面量处理，
   * 让 `{{note}} contains error` 无需引号；exists 用原始查找避免把任何词都判成「存在」。
   */
  parsePrimary(literalFallback) {
    const tk = this.next();
    if (!tk) throw new Error('表达式语法错误：意外结束');
    if (tk.t === 'lparen') {
      const v = this.parseOr();
      const close = this.next();
      if (!close || close.t !== 'rparen') throw new Error('表达式语法错误：括号未闭合');
      return { found: true, value: v };
    }
    if (tk.t === 'lit') return { found: true, value: tk.v };
    if (tk.t === 'num') return { found: true, value: tk.v };
    if (tk.t === 'str') return { found: true, value: tk.v };
    if (tk.t === 'path') {
      const r = lookupPath(this.ctx, tk.v);
      if (r.found) return { found: true, value: r.value };
      if (literalFallback && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(tk.v)) {
        return { found: true, value: tk.v };
      }
      return { found: false, value: undefined };
    }
    throw new Error(`表达式语法错误：意外的 token「${JSON.stringify(tk.v)}」`);
  }
}

function applyCompare(op, lv, rv, lFound, rFound) {
  const ls = stringifyValue(lv);
  const rs = stringifyValue(rv);
  switch (op) {
    case '==': return looseEq(lv, rv, lFound, rFound);
    case '!=': return !looseEq(lv, rv, lFound, rFound);
    case '>': case '>=': case '<': case '<=': {
      const ln = Number(lv);
      const rn = Number(rv);
      if (Number.isFinite(ln) && Number.isFinite(rn) && ls !== '' && rs !== '') {
        if (op === '>') return ln > rn;
        if (op === '>=') return ln >= rn;
        if (op === '<') return ln < rn;
        return ln <= rn;
      }
      if (op === '>') return ls > rs;
      if (op === '>=') return ls >= rs;
      if (op === '<') return ls < rs;
      return ls <= rs;
    }
    case 'contains':
      if (Array.isArray(lv)) return lv.some((el) => stringifyValue(el) === rs);
      return ls.includes(rs);
    case '!contains':
      if (Array.isArray(lv)) return !lv.some((el) => stringifyValue(el) === rs);
      return !ls.includes(rs);
    case 'startswith': return ls.startsWith(rs);
    case 'endswith': return ls.endsWith(rs);
    case 'matches': {
      // 上限保护：模式串 ≤128 字符，防灾难回溯超长模式
      const pattern = rs.slice(0, 128);
      try {
        return new RegExp(pattern).test(ls.slice(0, 4096));
      } catch (_) {
        throw new Error(`表达式 matches 的正则不合法：「${pattern}」`);
      }
    }
    default:
      throw new Error(`表达式不支持的运算符：${op}`);
  }
}

function looseEq(lv, rv, lFound, rFound) {
  if (!lFound || !rFound) {
    // 未命中视为 null/undefined：与 null 字面量相等，其余不等
    const lNull = !lFound || lv === null || lv === undefined;
    const rNull = !rFound || rv === null || rv === undefined;
    return lNull && rNull;
  }
  if (lv === rv) return true;
  const ln = Number(lv);
  const rn = Number(rv);
  if (ls_num(lv) && ls_num(rv)) return ln === rn;
  return stringifyValue(lv) === stringifyValue(rv);
}

function ls_num(v) {
  return v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && typeof v !== 'boolean' && !(typeof v === 'string' && !/^-?\d+(\.\d+)?$/.test(v.trim()));
}

// ── 出口掩码 ────────────────────────────────────────────────────────────────
function maskOne(s) {
  const str = String(s);
  if (!str) return str;
  if (str.length <= 6) return '***';
  return `${str.slice(0, 4)}***${str.slice(-2)}`;
}

/** 出口掩码：把出现过的 secret 值整体替换为「前4***后2」。secrets 为原始值数组。 */
function maskString(s, secrets) {
  let out = String(s);
  for (const sec of secrets || []) {
    const v = String(sec || '');
    if (v.length >= 4) out = out.split(v).join(maskOne(v));
  }
  return out;
}

function maskDeep(value, secrets) {
  if (typeof value === 'string') return maskString(value, secrets);
  if (Array.isArray(value)) return value.map((el) => maskDeep(el, secrets));
  if (isPlainObject(value)) {
    const out = {};
    for (const k of Object.keys(value)) out[k] = maskDeep(value[k], secrets);
    return out;
  }
  return value;
}

// ── 校验 ────────────────────────────────────────────────────────────────────
/**
 * 校验流水线定义。返回 {ok, errors: string[], def?: 归一化后的定义}。
 * 校验失败的错误逐条人话点名，供面板与 AI 直接修复。
 */
function validatePipeline(raw) {
  const errors = [];
  if (!isPlainObject(raw)) return { ok: false, errors: ['流水线定义必须是对象'] };
  const def = {};
  // name
  const name = String(raw.name || '').trim();
  if (!name) errors.push('name 必填：流水线名称（1-60 字）');
  else if (name.length > MAX_NAME) errors.push(`name 过长（${name.length} > ${MAX_NAME}）`);
  def.name = name;
  def.enabled = raw.enabled === undefined ? true : Boolean(raw.enabled);
  // trigger
  const tg = isPlainObject(raw.trigger) ? raw.trigger : {};
  const ttype = TRIGGER_TYPES.includes(tg.type) ? tg.type : 'manual';
  def.trigger = { type: ttype };
  if (ttype === 'interval') {
    const m = clampInt(tg.everyMinutes, 5, 10080, NaN);
    if (!Number.isFinite(Number(tg.everyMinutes)) || Number(tg.everyMinutes) < 5) {
      errors.push('trigger.everyMinutes 必须为 ≥5 的整数（分钟），防止误配成秒级风暴');
    }
    def.trigger.everyMinutes = Number.isFinite(m) ? m : 5;
  }
  if (ttype === 'daily') {
    const at = String(tg.at || '').trim();
    if (!/^\d{2}:\d{2}$/.test(at) || Number(at.slice(0, 2)) > 23 || Number(at.slice(3)) > 59) {
      errors.push('trigger.at 必须为 HH:MM（24 小时制），如 "08:30"');
    }
    def.trigger.at = at;
  }
  if (ttype === 'webhook') {
    def.trigger.token = String(tg.token || '').trim();
  }
  // vars / secrets
  def.vars = {};
  if (raw.vars !== undefined && !isPlainObject(raw.vars)) errors.push('vars 必须是对象（键为变量名，值为字符串/数字/布尔）');
  else {
    for (const k of Object.keys(raw.vars || {})) {
      if (!IDENT_RE.test(k)) { errors.push(`vars 键「${k}」不合法：须以字母/下划线开头，仅含字母数字下划线`); continue; }
      const v = raw.vars[k];
      if (typeof v === 'string' && v.length > MAX_TEMPLATE_BYTES) { errors.push(`vars.${k} 过长（> ${MAX_TEMPLATE_BYTES}）`); continue; }
      def.vars[k] = v;
    }
  }
  def.secrets = Array.isArray(raw.secrets) ? raw.secrets.map(String).filter((k) => IDENT_RE.test(k) && Object.prototype.hasOwnProperty.call(def.vars, k)) : [];
  def.allowLocal = Boolean(raw.allowLocal);
  // steps
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    errors.push('steps 必填：至少 1 个步骤（数组）');
  } else if (raw.steps.length > MAX_STEPS) {
    errors.push(`steps 过多：${raw.steps.length} > ${MAX_STEPS}（拆成多条流水线更清晰）`);
  } else {
    def.steps = [];
    const saveAsSeen = new Set();
    raw.steps.forEach((s, i) => {
      const errs = validateStep(s, i, saveAsSeen);
      if (errs.length) errors.push(...errs);
      else def.steps.push(normalizeStep(s, i));
    });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], def };
}

function validateStep(s, i, saveAsSeen) {
  const at = (msg) => `步骤 #${i + 1}${s && s.name ? `「${s.name}」` : ''}：${msg}`;
  if (!isPlainObject(s)) return [`步骤 #${i + 1} 必须是对象`];
  const errors = [];
  if (!STEP_TYPES.includes(s.type)) {
    errors.push(at(`type 不合法：「${s.type}」。合法值：${STEP_TYPES.join(' / ')}`));
    return errors;
  }
  const saveAs = s.saveAs === undefined || s.saveAs === null || s.saveAs === '' ? '' : String(s.saveAs).trim();
  if (saveAs) {
    if (!IDENT_RE.test(saveAs)) errors.push(at(`saveAs「${saveAs}」不合法：须为标识符`));
    else if (FORBIDDEN_SAVE_AS.includes(saveAs)) errors.push(at(`saveAs「${saveAs}」与根作用域重名，换一个名字`));
    else if (saveAsSeen.has(saveAs)) errors.push(at(`saveAs「${saveAs}」重复：后面的会覆盖前面的，请改名（或确认需要覆盖）`));
    saveAsSeen.add(saveAs);
  }
  switch (s.type) {
    case 'http': {
      const url = String(s.url || '').trim();
      if (!url) errors.push(at('http 步骤必填 url'));
      else if (!/^https?:\/\//i.test(url)) errors.push(at(`url 必须以 http:// 或 https:// 开头：「${url.slice(0, 40)}」`));
      else { try { new URL(url); } catch (_) { errors.push(at(`url 无法解析：${url.slice(0, 60)}`)); } }
      const method = String(s.method || 'GET').toUpperCase();
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) errors.push(at(`method 不合法：${method}`));
      if (s.headers !== undefined && !isPlainObject(s.headers)) errors.push(at('headers 必须是对象'));
      if (s.timeoutSec !== undefined) {
        const t = Number(s.timeoutSec);
        if (!Number.isFinite(t) || t < 2 || t > 120) errors.push(at('timeoutSec 取值 2-120 秒'));
      }
      break;
    }
    case 'mcp': {
      if (!String(s.serverId || '').trim()) errors.push(at('mcp 步骤必填 serverId（cap.mcp 注册的 server 标识）'));
      if (!String(s.tool || '').trim()) errors.push(at('mcp 步骤必填 tool（工具名）'));
      if (s.arguments !== undefined && !isPlainObject(s.arguments) && typeof s.arguments !== 'string') {
        errors.push(at('arguments 必须是对象或 JSON 字符串'));
      }
      if (typeof s.arguments === 'string' && s.arguments.trim()) {
        try { JSON.parse(s.arguments); } catch (_) { errors.push(at('arguments 的 JSON 字符串无法解析')); }
      }
      break;
    }
    case 'ai': {
      if (!String(s.providerId || '').trim()) errors.push(at('ai 步骤必填 providerId（设置里的供应商 ID）'));
      if (!String(s.prompt || '').trim()) errors.push(at('ai 步骤必填 prompt'));
      break;
    }
    case 'extract': {
      if (!String(s.from || '').trim()) errors.push(at('extract 步骤必填 from（来源变量名，即某步骤的 saveAs）'));
      if (!isPlainObject(s.paths) || !Object.keys(s.paths || {}).length) errors.push(at('extract 步骤必填 paths：{ 输出名: 路径表达式 }'));
      else {
        for (const k of Object.keys(s.paths)) {
          if (!IDENT_RE.test(k)) errors.push(at(`paths 键「${k}」不合法：须为标识符`));
        }
      }
      if (!saveAs) errors.push(at('extract 步骤必填 saveAs（提取结果保存名）'));
      break;
    }
    case 'template': {
      const text = s.text;
      if (typeof text !== 'string' || !text.trim()) errors.push(at('template 步骤必填 text（模板串，支持 {{占位符}}）'));
      else if (Buffer.byteLength(text, 'utf8') > MAX_TEMPLATE_BYTES) errors.push(at(`text 过长（> ${MAX_TEMPLATE_BYTES} 字节）`));
      if (!saveAs) errors.push(at('template 步骤必填 saveAs'));
      break;
    }
    case 'script': {
      const code = String(s.code || '');
      if (!code.trim()) errors.push(at('script 步骤必填 code（JS 片段，最后用 return 返回对象）'));
      else if (Buffer.byteLength(code, 'utf8') > MAX_SCRIPT_BYTES) errors.push(at(`code 过长（${Buffer.byteLength(code, 'utf8')} > ${MAX_SCRIPT_BYTES} 字节）`));
      if (!saveAs) errors.push(at('script 步骤必填 saveAs（返回值保存名）'));
      break;
    }
    case 'kv': {
      const action = String(s.action || '');
      if (!['get', 'set', 'del'].includes(action)) errors.push(at('kv 步骤 action 必须是 get / set / del'));
      if (!String(s.key || '').trim()) errors.push(at('kv 步骤必填 key'));
      if (action === 'set' && s.value === undefined) errors.push(at('kv set 必填 value'));
      break;
    }
    case 'file': {
      const action = String(s.action || '');
      if (!['write', 'append'].includes(action)) errors.push(at('file 步骤 action 必须是 write / append'));
      if (!String(s.path || '').trim()) errors.push(at('file 步骤必填 path（输出文件路径，限白名单根目录）'));
      if (s.content === undefined) errors.push(at('file 步骤必填 content'));
      break;
    }
    case 'notify': {
      const url = String(s.url || '').trim();
      if (!url) errors.push(at('notify 步骤必填 url（钉钉/企微/飞书/Bark 等 webhook 地址）'));
      else if (!/^https?:\/\//i.test(url)) errors.push(at(`notify url 必须以 http(s):// 开头：「${url.slice(0, 40)}」`));
      if (s.payload !== undefined && typeof s.payload !== 'string' && !isPlainObject(s.payload)) errors.push(at('payload 必须是字符串或对象'));
      break;
    }
    default:
      break;
  }
  return errors;
}

function normalizeStep(s, i) {
  const out = {
    id: String(s.id || `s${i + 1}`).trim(),
    type: s.type,
    name: String(s.name || '').trim() || `${s.type} 步骤`,
    continueOnError: Boolean(s.continueOnError),
  };
  if (s.when !== undefined && String(s.when).trim()) out.when = String(s.when).trim();
  if (s.saveAs) out.saveAs = String(s.saveAs).trim();
  for (const k of ['method', 'url', 'headers', 'body', 'json', 'timeoutSec', 'followRedirects', 'serverId', 'tool', 'arguments', 'providerId', 'prompt', 'system', 'temperature', 'maxTokens', 'from', 'paths', 'text', 'code', 'action', 'key', 'value', 'path', 'content', 'payload', 'extractJson']) {
    if (s[k] !== undefined) out[k] = s[k];
  }
  return out;
}

/** 归一化定义（校验通过后调用）：补 id、webhook token 等 */
function finalizePipeline(def) {
  const out = JSON.parse(JSON.stringify(def));
  if (!out.id) out.id = genId('pl');
  if (out.trigger.type === 'webhook' && !out.trigger.token) {
    out.trigger.token = crypto.randomBytes(12).toString('hex');
  }
  out.createdAt = out.createdAt || new Date().toISOString();
  out.updatedAt = new Date().toISOString();
  return out;
}

module.exports = {
  MASK,
  ROOT_SCOPES,
  STEP_TYPES,
  TRIGGER_TYPES,
  MAX_STEPS,
  genId,
  validatePipeline,
  finalizePipeline,
  resolveTemplate,
  resolveDeep,
  getPath,
  lookupPath,
  evaluateExpr,
  maskString,
  maskDeep,
  maskOne,
  stringifyValue,
  clampInt,
};
