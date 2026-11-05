'use strict';
/**
 * i18n-core.js —— 多语言键同步台单一权威引擎（零依赖）
 *
 * 三方（面板 / service / MCP）共用本文件，结论永远一致。
 * 解析基座：JSON / JSONC 内置（自研状态机剥注释与尾逗号）；
 * YAML 由调用方注入 yamlLoad（service 与 MCP 把 js-yaml 打进 bundle，
 * 见 yaml-lens 同款模式——core 本身不 require 任何解析器）。
 *
 * 关键契约：
 *   - parseLocaleText 抛错=结构化 Error（含 line/message），调用方直接展示
 *   - flatten 只对普通对象递归；键名字面量永不拆分（"a.b" 就是 "a.b"）；
 *     嵌套路径与字面键相撞 → 记入 conflicts 并从比对中剔除（不静默）
 *   - apply 前先 plan：unknown 键一律拒绝、占位符不一致默认拦截，
 *     全部通过才生成 newDoc；写盘由宿主层执行（core 不碰 fs）
 */

const MAX_DEPTH = 16;
const MAX_WORKSHEET_ITEMS = 500;
const SCAN_MAX_FILES = 200;
const SCAN_MAX_FILE_BYTES = 2 * 1024 * 1024;
const SCAN_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

// ────────────────────────── JSONC 剥离（状态机） ──────────────────────────

/**
 * 剥除 // 与 [块注释]。字符串内的 // 不剥（http:// 场景）。
 * @returns {{ code: string, hasComments: boolean }}
 */
function stripJsonComments(text) {
  let out = '';
  let hasComments = false;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === '/' && text[i + 1] === '/') {
      hasComments = true;
      while (i < text.length && text[i] !== '\n') i++;
      if (i < text.length) { out += '\n'; } // 保留换行，行号不漂移
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      hasComments = true;
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') out += '\n'; // 同上：保换行
        i++;
      }
      i++; // 跳过结尾 '/'
      continue;
    }
    out += ch;
  }
  return { code: out, hasComments };
}

/**
 * 剥除对象/数组字面量内的尾逗号（JSONC 允许）。
 * 状态机：逗号先暂存（pending），遇到 }/] 且期间无任何内容 token → 删；
 * 遇到任何内容 token（含字符串起始引号）→ 逗号是合法分隔符，放行。
 */
function stripTrailingCommas(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  let pending = -1; // out 中待定逗号的下标
  for (const ch of text) {
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { pending = -1; inString = true; out += ch; continue; }
    if (ch === ',') { out += ch; pending = out.length - 1; continue; }
    if (ch === '}' || ch === ']') {
      if (pending >= 0) out = out.slice(0, pending) + ' ' + out.slice(pending + 1);
      pending = -1;
      out += ch;
      continue;
    }
    if (/\s/.test(ch)) { out += ch; continue; }
    pending = -1;
    out += ch;
  }
  return out;
}

// ────────────────────────── 解析 ──────────────────────────

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** 从缩进行探测缩进（首个以空白开头的行）；tab 识别为 'tab' */
function detectIndent(text) {
  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(/^([ \t]+)\S/);
    if (m) return m[1][0] === '\t' ? 'tab' : m[1].length;
  }
  return 2;
}

/** JSON.parse 错误 position → 1 基行列（V8: "... at position N"） */
function jsonErrorPositionToLine(text, message) {
  const m = /position (\d+)/i.exec(message);
  if (!m) return null;
  const pos = Math.min(parseInt(m[1], 10), text.length);
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');
  return { line, column: col };
}

/** YAML 行级注释保守探测：整行注释 + 引号外 # */
function yamlHasComments(text) {
  let inSingle = false;
  let inDouble = false;
  for (const rawLine of text.split('\n')) {
    inSingle = false; inDouble = false;
    for (let i = 0; i < rawLine.length; i++) {
      const ch = rawLine[i];
      if (inSingle) { if (ch === "'") inSingle = false; continue; }
      if (inDouble) { if (ch === '\\') { i++; continue; } if (ch === '"') inDouble = false; continue; }
      if (ch === "'") { inSingle = true; continue; }
      if (ch === '"') { inDouble = true; continue; }
      if (ch === '#' && (i === 0 || /\s/.test(rawLine[i - 1]))) return true;
    }
  }
  return false;
}

/**
 * 解析单个 locale 文件文本。
 * @param {string} text 文件原文
 * @param {string} ext 扩展名（.json/.jsonc/.yaml/.yml，大小写不敏感）
 * @param {{ yamlLoad?: (s: string) => unknown, yamlDump?: (obj: unknown, opts: object) => string }} opts
 */
function parseLocaleText(text, ext, opts = {}) {
  const e = String(ext || '').toLowerCase();
  const trailingNewline = /\n\s*$/.test(text) || text.endsWith('\n');
  if (e === '.json') {
    let data;
    try { data = JSON.parse(text); } catch (err) {
      const at = jsonErrorPositionToLine(text, String(err && err.message));
      const e2 = new Error('JSON 解析失败：' + String(err && err.message).replace(/^JSON\.parse: /, '') + (at ? `（第 ${at.line} 行第 ${at.column} 列附近）` : ''));
      e2.line = at && at.line;
      throw e2;
    }
    if (!isPlainObject(data)) throw new Error('locale 根必须是对象（得到 ' + (Array.isArray(data) ? '数组' : typeof data) + '）');
    return { data, format: 'json', indent: detectIndent(text), trailingNewline, hasComments: false };
  }
  if (e === '.jsonc') {
    const stripped = stripJsonComments(text);
    const code = stripTrailingCommas(stripped.code);
    let data;
    try { data = JSON.parse(code); } catch (err) {
      const at = jsonErrorPositionToLine(code, String(err && err.message));
      throw new Error('JSONC 解析失败：' + String(err && err.message) + (at ? `（第 ${at.line} 行附近）` : '') + '（注释/尾逗号已剥除后解析）');
    }
    if (!isPlainObject(data)) throw new Error('locale 根必须是对象（得到 ' + (Array.isArray(data) ? '数组' : typeof data) + '）');
    return { data, format: 'jsonc', indent: detectIndent(text), trailingNewline, hasComments: stripped.hasComments };
  }
  if (e === '.yaml' || e === '.yml') {
    if (typeof opts.yamlLoad !== 'function') throw new Error('YAML 解析器未注入（service/MCP 已内置 js-yaml；纯前端环境请用 JSON）');
    let data;
    try { data = opts.yamlLoad(text); } catch (err) {
      const mark = err && err.mark;
      throw new Error('YAML 解析失败：' + String(err && err.reason || err && err.message || err) + (mark ? `（第 ${(mark.line || 0) + 1} 行附近）` : ''));
    }
    if (!isPlainObject(data)) throw new Error('locale 根必须是对象（得到 ' + (Array.isArray(data) ? '数组' : typeof data) + '）');
    return { data, format: 'yaml', indent: 2, trailingNewline, hasComments: yamlHasComments(text) };
  }
  throw new Error(`不支持的格式：${ext}（支持 .json/.jsonc/.yaml/.yml）`);
}

/** 序列化回文本（apply 落盘用）。jsonc 按标准 JSON 输出（注释不可保留，调用方须先经 hasComments 门）。 */
function serializeLocale(data, meta, opts = {}) {
  const newline = meta && meta.trailingNewline ? '\n' : '';
  if (meta && meta.format === 'yaml') {
    if (typeof opts.yamlDump !== 'function') throw new Error('YAML 序列化器未注入');
    return opts.yamlDump(data, { indent: typeof meta.indent === 'number' ? meta.indent : 2, lineWidth: -1, noRefs: true }) + newline;
  }
  const indent = meta && meta.indent === 'tab' ? '\t' : (typeof (meta && meta.indent) === 'number' ? meta.indent : 2);
  return JSON.stringify(data, null, indent) + newline;
}

// ────────────────────────── 扁平化 ──────────────────────────

/**
 * 嵌套对象 → 点路径叶值映射。
 * - 键名字面量永不拆分：{"a.b":1} → "a.b"
 * - 嵌套路径与字面键相撞 → 双方剔除进 conflicts
 * - 数组视为叶值（i18n 数组值不支持逐项翻译，保留原样）
 * @returns {{ map: Record<string, string|number|boolean|null|Array>, order: string[], conflicts: string[] }}
 */
function flattenLocale(root) {
  const map = Object.create(null);
  const order = [];
  const conflicts = [];
  const insert = (path, value) => {
    if (Object.prototype.hasOwnProperty.call(map, path)) {
      // 嵌套推导路径撞上字面键：剔除双方
      conflicts.push(path);
      delete map[path];
      const idx = order.indexOf(path);
      if (idx >= 0) order.splice(idx, 1);
      return;
    }
    map[path] = value;
    order.push(path);
  };
  const walk = (node, prefix, depth) => {
    if (depth > MAX_DEPTH) return; // 超深结构放弃展开（防御异常数据）
    for (const key of Object.keys(node)) {
      const val = node[key];
      const path = prefix ? prefix + '.' + key : key;
      if (isPlainObject(val)) walk(val, path, depth + 1);
      else insert(path, val);
    }
  };
  walk(root, '', 0);
  // conflicts 的字面键一方也标记剔除（delete 只删了先到者；后到者未入 map，无需删）
  return { map, order, conflicts: [...new Set(conflicts)] };
}

// ────────────────────────── 占位符 ──────────────────────────

/**
 * 抽取占位符。支持：
 *   {{name}}（i18next/vue-i18n）、{name}/{0}[,icu...]（ICU 简单形/.NET/vue 复数变量）、
 *   %s %d %i %f %@ %1$s（printf 族，含序号）。
 *   %% 先剥除（字面百分号，不参与比对）。
 * @returns {{ named: string[], positionalCounts: Record<string, number> }}
 */
function extractPlaceholders(str) {
  if (typeof str !== 'string') return { named: [], positionalCounts: {} };
  const cleaned = str.replace(/%%/g, '');
  const named = new Set();
  const positional = Object.create(null);
  // {{name}}
  for (const m of cleaned.matchAll(/\{\{([^{}]+)\}\}/g)) {
    const name = m[1].trim();
    if (name) named.add(name);
  }
  // {name} / {0} / {count, plural, ...}（{{}} 已被上一条吃掉，不会重复匹配）
  for (const m of cleaned.matchAll(/\{([^{}\s][^{}]*?)\}/g)) {
    const head = m[1].split(',')[0].trim();
    if (!head) continue;
    if (/^\d+$/.test(head)) named.add('{' + head + '}');
    else named.add(head);
  }
  // printf 族
  for (const m of cleaned.matchAll(/%(?:\d+\$)?[sdif@]/g)) {
    positional[m[0]] = (positional[m[0]] || 0) + 1;
  }
  return { named: [...named], positionalCounts: positional };
}

/**
 * 基准值 vs 目标值占位符一致性。
 * 有序 %n$s（%1$s/%2$s）按序号集合比对（数量与序号都要对得上）。
 */
function comparePlaceholders(baseValue, targetValue) {
  const b = extractPlaceholders(baseValue);
  const t = extractPlaceholders(targetValue);
  const missingInTarget = b.named.filter((n) => !t.named.includes(n));
  const extraInTarget = t.named.filter((n) => !b.named.includes(n));
  const positionalIssues = [];
  const directives = new Set([...Object.keys(b.positionalCounts), ...Object.keys(t.positionalCounts)]);
  for (const d of directives) {
    const bc = b.positionalCounts[d] || 0;
    const tc = t.positionalCounts[d] || 0;
    if (bc !== tc) positionalIssues.push(`${d} 基准×${bc} 目标×${tc}`);
  }
  return {
    ok: missingInTarget.length === 0 && extraInTarget.length === 0 && positionalIssues.length === 0,
    missingInTarget,
    extraInTarget,
    positionalIssues,
  };
}

// ────────────────────────── 值分类 ──────────────────────────

const NON_TRANSLATABLE_RE = /^[\s\d\p{P}\p{S}]+$/u;

/** 疑似未翻译：目标与基准逐字相同，且基准不是纯数字/标点/符号串 */
function looksUntranslated(baseValue, targetValue) {
  if (typeof baseValue !== 'string' || typeof targetValue !== 'string') return false;
  if (baseValue.length === 0 || baseValue !== targetValue) return false;
  return !NON_TRANSLATABLE_RE.test(baseValue);
}

// ────────────────────────── 奇偶比对 ──────────────────────────

/**
 * 单 ns 内 基准语言 vs 某目标语言 全量比对。
 * @returns {{ missing: {key,baseValue}[], extra: {key,value}[], emptyValues: {key,baseValue}[],
 *   sameAsBase: {key,baseValue}[], placeholderIssues: {key,detail}[] }}
 */
function compareLocaleSets(baseFlat, targetFlat) {
  const missing = [];
  const extra = [];
  const emptyValues = [];
  const sameAsBase = [];
  const placeholderIssues = [];
  for (const key of baseFlat.order) {
    const baseValue = baseFlat.map[key];
    if (!Object.prototype.hasOwnProperty.call(targetFlat.map, key)) {
      missing.push({ key, baseValue });
      continue;
    }
    const tv = targetFlat.map[key];
    if (tv === '' || tv === null) { emptyValues.push({ key, baseValue }); continue; }
    if (looksUntranslated(String(baseValue), String(tv))) { sameAsBase.push({ key, baseValue }); continue; }
    if (typeof baseValue === 'string' && typeof tv === 'string') {
      const ph = comparePlaceholders(baseValue, tv);
      if (!ph.ok) placeholderIssues.push({ key, detail: ph });
    }
  }
  for (const key of targetFlat.order) {
    if (!Object.prototype.hasOwnProperty.call(baseFlat.map, key)) extra.push({ key, value: targetFlat.map[key] });
  }
  return { missing, extra, emptyValues, sameAsBase, placeholderIssues };
}

// ────────────────────────── 工作表 ──────────────────────────

/**
 * 生成待翻译工作表（给 AI / 面板）。
 * 优先级：缺失 → 空值 →（可选）疑似未翻译；v 一律取基准语言源文案；只含字符串叶值。
 * @returns {{ items: {k,v}[], skipped: number }}
 */
function buildWorksheet(parity, { limit = 200, includeSame = false } = {}) {
  const items = [];
  let skipped = 0;
  const push = (key, baseValue) => {
    if (items.length >= Math.min(limit, MAX_WORKSHEET_ITEMS)) { skipped++; return; }
    if (typeof baseValue === 'string') items.push({ k: key, v: baseValue });
    else skipped++;
  };
  for (const m of parity.missing) push(m.key, m.baseValue);
  for (const m of parity.emptyValues) push(m.key, m.baseValue);
  if (includeSame) for (const m of parity.sameAsBase) push(m.key, m.baseValue);
  return { items, skipped };
}

// ────────────────────────── 应用计划 ──────────────────────────

function clonePlain(value) {
  if (isPlainObject(value)) {
    const out = {};
    for (const k of Object.keys(value)) out[k] = clonePlain(value[k]);
    return out;
  }
  return value;
}

/** 按 path 在 doc 中取值（不存在返回 undefined） */
function getByPath(doc, path) {
  let node = doc;
  for (const seg of String(path).split('.')) {
    if (!isPlainObject(node)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(node, seg)) return undefined;
    node = node[seg];
  }
  return node;
}

/** 按路径设值；中间层缺失时按 base 结构补对象。写路径=更新/新增通用。 */
function setByPath(doc, path, value) {
  const segs = String(path).split('.');
  let node = doc;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    if (!isPlainObject(node[seg])) node[seg] = {};
    node = node[seg];
  }
  node[segs[segs.length - 1]] = value;
}

/** 删除路径（undo/多余键不删，但 mirror 重建可能需要）——本引擎仅内部使用 */
function deleteByPath(doc, path) {
  const segs = String(path).split('.');
  let node = doc;
  for (let i = 0; i < segs.length - 1; i++) {
    if (!isPlainObject(node)) return;
    node = node[segs[i]];
  }
  if (isPlainObject(node)) delete node[segs[segs.length - 1]];
}

/**
 * 生成应用计划（不落盘；落盘由宿主层 serializeLocale 后写）。
 * @param {object} p
 * @param {object} p.targetDoc 目标语言文件解析后的对象（原样，会被克隆）
 * @param {object} p.baseFlat 基准语言扁平 map（含 order）
 * @param {Record<string,string>} p.translations key→译文
 * @param {'preserve'|'mirror'} p.mode preserve=新键追加到父级末尾；mirror=按基准语言键序重建
 * @param {string[]} p.targetConflicts 目标文件结构冲突路径（这些键拒绝写入）
 * @returns {{ newDoc: object, plan: {insert: string[], update: string[], noop: string[], unknown: string[], errors: {key,reason}[] } }}
 */
function planApply({ targetDoc, baseFlat, translations, mode = 'preserve', targetConflicts = [] }) {
  const conflictSet = new Set(targetConflicts);
  const plan = { insert: [], update: [], noop: [], unknown: [], errors: [] };
  const clean = Object.create(null);
  for (const [rawKey, rawValue] of Object.entries(translations || {})) {
    const key = String(rawKey).trim();
    if (!key) continue;
    if (conflictSet.has(key)) { plan.errors.push({ key, reason: '结构冲突键（嵌套路径与字面键相撞），拒绝写入' }); continue; }
    const inBase = Object.prototype.hasOwnProperty.call(baseFlat.map, key);
    const inTarget = getByPath(targetDoc, key) !== undefined;
    if (!inBase && !inTarget) { plan.unknown.push(key); continue; }
    if (inBase) {
      const baseValue = baseFlat.map[key];
      if (typeof rawValue !== 'string') {
        plan.errors.push({ key, reason: '译文必须是字符串（非字符串键不参与翻译）' });
        continue;
      }
      if (typeof baseValue === 'string') {
        const ph = comparePlaceholders(baseValue, rawValue);
        if (!ph.ok) {
          const why = [
            ph.missingInTarget.length ? `缺少 ${ph.missingInTarget.join(' ')}` : '',
            ph.extraInTarget.length ? `多出 ${ph.extraInTarget.join(' ')}` : '',
            ph.positionalIssues.length ? ph.positionalIssues.join('; ') : '',
          ].filter(Boolean).join('；');
          plan.errors.push({ key, reason: `占位符不一致：${why}` });
          continue;
        }
      }
      clean[key] = rawValue;
    } else {
      // 目标文件存在、基准没有：只允许 update 为字符串（补基准缺键场景之外的人工修正）
      if (typeof rawValue !== 'string') { plan.errors.push({ key, reason: '译文必须是字符串' }); continue; }
      clean[key] = rawValue;
    }
  }

  const newDoc = clonePlain(targetDoc);
  for (const [key, value] of Object.entries(clean)) {
    const cur = getByPath(newDoc, key);
    if (cur === undefined) {
      setByPath(newDoc, key, value);
      plan.insert.push(key);
    } else if (cur === value) {
      plan.noop.push(key);
    } else {
      setByPath(newDoc, key, value);
      plan.update.push(key);
    }
  }

  if (mode === 'mirror') rebuildMirrorDoc(newDoc, baseFlat);
  return { newDoc, plan };
}

/** 按路径版 mirror 重排：对每个对象节点，子键按「基准中该子树首个叶路径 rank」稳定排序，基准外键按原相对顺序跟在后面 */
let _rankIndex = [];

function rebuildMirrorAt(node, prefix) {
  if (!isPlainObject(node)) return;
  const rankOf = (childKey) => {
    const p = prefix ? prefix + '.' + childKey : childKey;
    let best = Infinity;
    for (const [k, i] of _rankIndex) {
      if (k === p || k.startsWith(p + '.')) { if (i < best) best = i; }
    }
    return best;
  };
  const keys = Object.keys(node);
  const unknownSeq = keys.filter((k) => rankOf(k) === Infinity);
  const unknownRank = new Map(unknownSeq.map((k, i) => [k, _rankIndex.length + i]));
  const decorated = keys.map((k) => ({ k, r: rankOf(k) === Infinity ? unknownRank.get(k) : rankOf(k) }));
  decorated.sort((a, b) => a.r - b.r); // Array.prototype.sort 稳定（ES2019+）
  const rebuilt = {};
  for (const d of decorated) rebuilt[d.k] = node[d.k];
  for (const k of Object.keys(rebuilt)) {
    if (isPlainObject(rebuilt[k])) rebuildMirrorAt(rebuilt[k], prefix ? prefix + '.' + k : k);
  }
  for (const k of keys) delete node[k];
  Object.assign(node, rebuilt);
}

/**
 * mirror 模式入口：整棵树按基准键序重建（基准没有的键保持原相对顺序缀在每层末尾）。
 */
function rebuildMirrorDoc(doc, baseFlat) {
  _rankIndex = baseFlat.order.map((k, i) => [k, i]);
  rebuildMirrorAt(doc, '');
}

// ────────────────────────── 布局识别 ──────────────────────────

/** 规范化 locale 标签：en_US → en-us */
function normalizeLocaleTag(s) {
  return String(s || '').trim().replace(/_/g, '-').toLowerCase();
}

/** 是否像 locale 标签：en / zh-cn / pt-br / fil-ph …… */
function isLocaleTag(s) {
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(normalizeLocaleTag(s));
}

const LOCALE_EXTS = new Set(['.json', '.jsonc', '.yaml', '.yml']);

/**
 * 把相对路径列表分类成 locale 文件组。
 * @param {string[]} relPaths posix 风格相对路径（已过滤扩展名）
 * @returns {{ layout: 'file-per-locale'|'dir-per-locale'|'mixed'|'none',
 *   files: {relPath, locale, ns, ext}[], locales: string[], nsList: string[], ambiguous: string[] }}
 */
function classifyLocalePaths(relPaths) {
  const files = [];
  const ambiguous = [];
  let countA = 0;
  let countB = 0;
  for (const rel of relPaths) {
    const norm = rel.replace(/\\/g, '/');
    const base = norm.slice(norm.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');
    if (dot <= 0) continue;
    const stem = base.slice(0, dot);
    const ext = base.slice(dot).toLowerCase();
    if (!LOCALE_EXTS.has(ext)) continue;
    const parent = norm.includes('/') ? norm.slice(0, norm.lastIndexOf('/')) : '';
    const parentStem = parent.includes('/') ? parent.slice(parent.lastIndexOf('/') + 1) : parent;
    if (parentStem && isLocaleTag(parentStem)) {
      files.push({ relPath: norm, locale: normalizeLocaleTag(parentStem), ns: stem, ext });
      countB++;
    } else if (isLocaleTag(stem)) {
      files.push({ relPath: norm, locale: normalizeLocaleTag(stem), ns: parent || '', ext });
      countA++;
    } else {
      ambiguous.push(norm);
    }
  }
  const layout = countA && countB ? 'mixed' : countA ? 'file-per-locale' : countB ? 'dir-per-locale' : 'none';
  const locales = [...new Set(files.map((f) => f.locale))].sort();
  const nsList = [...new Set(files.map((f) => f.ns))].sort();
  return { layout, files, locales, nsList, ambiguous };
}

/** 基准语言推断：zh* 优先，其次 en，再次字母序第一个 */
function inferBaseLocale(locales, explicit) {
  if (explicit) return normalizeLocaleTag(explicit);
  if (!locales.length) return '';
  const zh = locales.find((l) => l === 'zh' || l.startsWith('zh-'));
  if (zh) return zh;
  const en = locales.find((l) => l === 'en' || l.startsWith('en-'));
  if (en) return en;
  return locales[0];
}

// ────────────────────────── 扫描汇总 ──────────────────────────

/**
 * 由「已解析文件组」计算完整奇偶矩阵。
 * 目标语言在某个 ns 整个文件缺失时合成 fileMissing 单元格（缺失=全部基准键）——
 * 「login.json 整个没建」必须可见，而不是静默不可见。
 * @param {{ relPath, locale, ns, ext, parse }[]} parsedFiles parse=parseLocaleText 结果（含 data）
 * @param {string} baseLocale
 */
function buildParityMatrix(parsedFiles, baseLocale) {
  const byNs = new Map();
  const allLocales = new Set();
  for (const f of parsedFiles) {
    if (!byNs.has(f.ns)) byNs.set(f.ns, new Map());
    const localeMap = byNs.get(f.ns);
    const flat = f.parse && f.parse.data !== undefined ? flattenLocale(f.parse.data) : null;
    localeMap.set(f.locale, { file: f, flat });
    allLocales.add(f.locale);
  }
  const matrix = {};
  const totals = { missing: 0, extra: 0, empty: 0, sameAsBase: 0, placeholder: 0, parseErrors: 0, files: parsedFiles.length };
  for (const [ns, localeMap] of byNs) {
    const baseEntry = localeMap.get(baseLocale);
    matrix[ns] = {};
    if (!baseEntry || !baseEntry.flat) {
      matrix[ns]._error = `基准语言 ${baseLocale} 缺失或解析失败`;
      continue;
    }
    for (const locale of allLocales) {
      if (locale === baseLocale) continue;
      const entry = localeMap.get(locale);
      if (!entry) {
        // 该 ns 没有这个语言文件：整个文件缺失
        const missing = baseEntry.flat.order.map((key) => ({ key, baseValue: baseEntry.flat.map[key] }));
        matrix[ns][locale] = { fileMissing: true, missing, extra: [], emptyValues: [], sameAsBase: [], placeholderIssues: [] };
        totals.missing += missing.length;
        continue;
      }
      if (!entry.flat) {
        matrix[ns][locale] = { _parseError: true };
        totals.parseErrors++;
        continue;
      }
      const cmp = compareLocaleSets(baseEntry.flat, entry.flat);
      const conflicts = entry.flat.conflicts.length || baseEntry.flat.conflicts.length
        ? { structuralConflicts: [...new Set([...baseEntry.flat.conflicts, ...entry.flat.conflicts])] }
        : {};
      matrix[ns][locale] = {
        missing: cmp.missing,
        extra: cmp.extra,
        emptyValues: cmp.emptyValues,
        sameAsBase: cmp.sameAsBase,
        placeholderIssues: cmp.placeholderIssues,
        ...conflicts,
      };
      totals.missing += cmp.missing.length;
      totals.extra += cmp.extra.length;
      totals.empty += cmp.emptyValues.length;
      totals.sameAsBase += cmp.sameAsBase.length;
      totals.placeholder += cmp.placeholderIssues.length;
    }
  }
  return { matrix, totals, nsList: [...byNs.keys()].sort() };
}

// ────────────────────────── 报告渲染 ──────────────────────────

function oneLine(s, n = 120) {
  const str = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

/** MCP i18n_status 输出：中文概览 */
function renderStatusReport(root, baseLocale, layout, nsList, locales, matrix, totals, ambiguous) {
  const lines = [];
  lines.push(`i18n 体检：${root}`);
  lines.push(`布局：${layout} · 基准语言：${baseLocale} · 语言：${locales.join(', ') || '（无）'}`);
  lines.push(`命名空间：${nsList.length ? nsList.join(', ') : '（无）'} · 文件 ${totals.files} 个（解析失败 ${totals.parseErrors}）`);
  if (ambiguous && ambiguous.length) {
    lines.push(`⚠ ${ambiguous.length} 个文件无法识别语言归属（文件名与目录名都不像 locale 标签）：`);
    for (const a of ambiguous.slice(0, 5)) lines.push(`  - ${a}`);
    if (ambiguous.length > 5) lines.push(`  - …等 ${ambiguous.length} 个`);
  }
  let hasIssue = false;
  for (const ns of nsList) {
    const entry = matrix[ns];
    if (!entry || entry._error) { if (entry && entry._error) lines.push(`[${ns}] ${entry._error}`); continue; }
    for (const locale of Object.keys(entry)) {
      const c = entry[locale];
      if (!c || c._parseError) { lines.push(`[${ns}] ${locale}: 解析失败`); continue; }
      const n = c.missing.length + c.emptyValues.length + c.sameAsBase.length + c.placeholderIssues.length;
      if (!n) continue;
      hasIssue = true;
      lines.push(`[${ns}] ${locale}${c.fileMissing ? '（文件缺失）' : ''}: 缺失 ${c.missing.length} · 空值 ${c.emptyValues.length} · 疑似未翻译 ${c.sameAsBase.length} · 占位符不一致 ${c.placeholderIssues.length}${c.structuralConflicts ? ` · 结构冲突 ${c.structuralConflicts.length}` : ''}`);
      for (const m of c.missing.slice(0, 8)) lines.push(`    - ${m.key} = ${oneLine(JSON.stringify(m.baseValue), 80)}`);
      if (c.missing.length > 8) lines.push(`    - …等 ${c.missing.length} 个缺失键`);
    }
  }
  if (!hasIssue) lines.push('✅ 所有语言与基准对齐，未发现问题。');
  else lines.push(`合计：缺失 ${totals.missing} · 空值 ${totals.empty} · 疑似未翻译 ${totals.sameAsBase} · 占位符不一致 ${totals.placeholder}`);
  lines.push('下一步：i18n_missing {dir, locale} 获取某语言的待翻译清单（自动带术语表），翻译后 i18n_apply 落盘（需 confirm）。');
  return lines.join('\n');
}

/** MCP i18n_missing 输出：工作表 + 术语表 + 应用指引 */
function renderMissingWorksheet(root, baseLocale, locale, ns, worksheet, glossary) {
  const lines = [];
  lines.push(`待翻译工作表：${baseLocale} → ${locale}${ns ? `（ns=${ns}）` : '（全部 ns）'}，共 ${worksheet.items.length} 项${worksheet.skipped ? `（超限截断 ${worksheet.skipped} 项，分批处理）` : ''}`);
  if (glossary && Object.keys(glossary).length) {
    lines.push('术语表（译文必须遵守）：');
    for (const [k, v] of Object.entries(glossary).slice(0, 50)) lines.push(`  ${k} → ${v}`);
  } else {
    lines.push('术语表：未设置（i18n_glossary action=set 可配置，翻译前建议先维护术语）');
  }
  lines.push('```json');
  lines.push(JSON.stringify(worksheet.items));
  lines.push('```');
  lines.push(`翻译要求：目标语言=${locale}；占位符（{name}、{{name}}、{0}、%s、%1$s 等）必须原样保留且数量一致；不要发明清单之外的键。`);
  lines.push(`完成后调用 i18n_apply：dir="${root}", locale="${locale}"${ns ? `, ns="${ns}"` : ''}, translations={<key>: <译文>}, confirm=true`);
  return lines.join('\n');
}

module.exports = {
  MAX_DEPTH,
  MAX_WORKSHEET_ITEMS,
  SCAN_MAX_FILES,
  SCAN_MAX_FILE_BYTES,
  SCAN_MAX_TOTAL_BYTES,
  stripJsonComments,
  stripTrailingCommas,
  parseLocaleText,
  serializeLocale,
  isPlainObject,
  detectIndent,
  flattenLocale,
  extractPlaceholders,
  comparePlaceholders,
  looksUntranslated,
  compareLocaleSets,
  buildWorksheet,
  planApply,
  rebuildMirrorDoc,
  normalizeLocaleTag,
  isLocaleTag,
  classifyLocalePaths,
  inferBaseLocale,
  buildParityMatrix,
  renderStatusReport,
  renderMissingWorksheet,
  oneLine,
};
