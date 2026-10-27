'use strict';
/**
 * extract.js —— 零依赖内容抽取层（网页哨兵服务专用）
 *
 * 三件事：
 *   1. 迷你容错 HTML 解析器（标签/属性/注释/raw text/实体解码）→ 轻量 DOM 树
 *   2. CSS 选择器子集引擎（tag/.class/#id/[attr op]/后代/子代/逗号分组/@attr 后缀）
 *   3. 按模式抽取：text | selector | regex | json | headers
 *
 * 为什么不用 cheerio/jsdom：插件 zip 打包排除 node_modules（.pluginignore），
 * 服务必须只依赖 Node 内置能力。本文件覆盖盯价格/库存/标题/链接列表所需的
 * 90% 选择器用法；复杂 SPA 页面建议盯其 JSON 接口（mode=json）。
 */

// ── 实体解码 ────────────────────────────────────────────────────────────────
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·', bull: '•',
  deg: '°', plusmn: '±', times: '×', divide: '÷', laquo: '«', raquo: '»',
  yen: '¥', euro: '€', pound: '£', cent: '¢', sect: '§', para: '¶',
};

function decodeEntities(s) {
  if (!s || s.indexOf('&') === -1) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);?/g, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return m;
      try { return String.fromCodePoint(code); } catch (_) { return m; }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named !== undefined ? named : m;
  });
}

// ── 迷你 HTML 解析器 ────────────────────────────────────────────────────────
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr', '!doctype']);
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

function makeNode(type, tag, attrs) {
  // root 与元素都要 children 数组；只有文本节点没有
  return { type, tag: tag || '', attrs: attrs || null, children: type === 'text' ? null : [], text: type === 'text' ? '' : undefined };
}

function appendChild(stack, node) {
  stack[stack.length - 1].children.push(node);
}

/** 解析 HTML 为树：root 节点 type='root'，元素 type='el'，文本 type='text'。容错：不抛错。 */
function parseHtml(html) {
  const root = makeNode('root', '#root');
  const stack = [root];
  if (typeof html !== 'string' || !html) return root;
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { appendText(stack, html.slice(i), true); break; }
    if (lt > i) appendText(stack, html.slice(i, lt), true);
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (html.startsWith('</', lt)) {
      const gt = html.indexOf('>', lt);
      const tag = html.slice(lt + 2, gt === -1 ? n : gt).trim().toLowerCase();
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tag === tag) { stack.length = s; break; }
      }
      i = gt === -1 ? n : gt + 1;
      continue;
    }
    // open tag：<name attrs...> 或 <name .../>
    const nameM = /^<([a-zA-Z][a-zA-Z0-9:_.-]*)/.exec(html.slice(lt, Math.min(lt + 120, n)));
    if (!nameM) {
      // 非法 '<'，当文本处理
      appendText(stack, '<', true);
      i = lt + 1;
      continue;
    }
    const tag = nameM[1].toLowerCase();
    const { attrs, selfClosing, end } = parseAttrs(html, lt + 1 + nameM[1].length, n);
    const node = makeNode('el', tag, attrs);
    node.parent = stack[stack.length - 1];
    appendChild(stack, node);
    i = end;
    if (selfClosing || VOID_TAGS.has(tag)) continue;
    if (RAW_TEXT_TAGS.has(tag)) {
      // 原始文本：直取到对应闭合标签（大小写不敏感）
      const closeRe = new RegExp('</' + tag + '\\s*>', 'i');
      const rest = html.slice(i);
      const m = closeRe.exec(rest);
      const raw = m ? rest.slice(0, m.index) : rest;
      if (raw) {
        const t = makeNode('text', '', null);
        t.text = tag === 'script' || tag === 'style' ? '' : decodeEntities(raw);
        appendChild(stack, t);
      }
      i += m ? m.index + m[0].length : rest.length;
      continue;
    }
    stack.push(node);
  }
  return root;
}

function appendText(stack, raw, decode) {
  if (!raw) return;
  const top = stack[stack.length - 1];
  // 文本并入栈顶（script/style 的内容已在 raw text 分支丢弃/保留）
  const last = top.children[top.children.length - 1];
  const text = decode ? decodeEntities(raw) : raw;
  if (last && last.type === 'text') last.text += text;
  else {
    const t = makeNode('text', '', null);
    t.text = text;
    top.children.push(t);
  }
}

/** 从 pos 开始解析属性串，直到 '>' 或 '/>'。返回 {attrs, selfClosing, end(> 之后)} */
function parseAttrs(html, pos, n) {
  const attrs = {};
  let i = pos;
  let selfClosing = false;
  let name = '';
  let value = null; // null=无=号（布尔属性），否则字符串
  const flush = () => {
    if (name) {
      const key = name.toLowerCase();
      if (key && attrs[key] === undefined) attrs[key] = value === null ? '' : value;
    }
    name = ''; value = null;
  };
  while (i < n) {
    const ch = html[i];
    if (ch === '>') { flush(); return { attrs, selfClosing, end: i + 1 }; }
    if (ch === '/' && html[i + 1] === '>') { flush(); return { attrs, selfClosing: true, end: i + 2 }; }
    if (ch === '/' ) { i++; continue; }
    if (/\s/.test(ch)) {
      if (name) flush();
      i++; continue;
    }
    if (ch === '=' && name) {
      i++;
      while (i < n && /\s/.test(html[i])) i++;
      let val = '';
      if (html[i] === '"' || html[i] === "'") {
        const q = html[i]; i++;
        const start = i;
        while (i < n && html[i] !== q) i++;
        val = html.slice(start, i);
        i++; // 跳过引号
      } else {
        const start = i;
        while (i < n && !/\s/.test(html[i]) && html[i] !== '>') i++;
        val = html.slice(start, i);
      }
      value = decodeEntities(val);
      flush();
      continue;
    }
    name += ch;
    i++;
  }
  flush();
  return { attrs, selfClosing: false, end: n };
}

// ── 树遍历与文本 ────────────────────────────────────────────────────────────
function walkElements(node, out) {
  for (const c of node.children || []) {
    if (c.type === 'el') {
      out.push(c);
      walkElements(c, out);
    }
  }
  return out;
}

function textContent(node) {
  if (node.type === 'text') return node.text || '';
  if (node.tag === 'script' || node.tag === 'style') return '';
  let s = '';
  for (const c of node.children || []) s += textContent(c);
  return s;
}

/** 规范化文本：行内空白折叠、去首尾空、合并 3+ 连续空行（供 hash/diff 用） */
function normalizeText(s) {
  if (!s) return '';
  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

// ── CSS 选择器子集 ──────────────────────────────────────────────────────────
/**
 * 支持：tag、*、.class、#id、[attr]、[attr=v]、[attr^=v]、[attr*=v]、[attr$=v]、
 *       复合（div.price#main[disabled]）、后代空格、子代 >、逗号分组。
 * 扩展后缀：`@attr`（组尾）返回该属性值，如 `a.item@href`。
 * 返回 { attrName?: string, groups: Array<Array<{comb:' '|'>'|null, parts: Part[]}>> }
 */
function parseSelector(selector) {
  let attrName = null;
  // 提取组尾 @attr（不在 [] 内的最后一个 @）
  let depth = 0, lastAt = -1;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === '@' && depth === 0) lastAt = i;
  }
  if (lastAt >= 0 && lastAt < selector.length - 1) {
    const cand = selector.slice(lastAt + 1).trim();
    if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(cand)) {
      attrName = cand.toLowerCase();
      selector = selector.slice(0, lastAt);
    }
  }
  const groups = splitTopLevel(selector, ',').map((g) => parseComplex(g.trim())).filter((g) => g.length);
  return { attrName, groups };
}

function splitTopLevel(s, sep) {
  const out = [];
  let depth = 0, quote = null, cur = '';
  for (const ch of s) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '[') depth++;
    if (ch === ']') depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

// 标识符字符（tag/.class/#id 共用）：不含 '.'——它必须是复合选择器的分隔符
const IDENT_RE = /[a-zA-Z0-9_:-]/;

/** 解析单组：`div.a > span.b .c` → [{comb:null,parts:[...]},{comb:'>',parts:[...]},{comb:' ',parts:[...]}] */
function parseComplex(s) {
  const seq = [];
  let i = 0;
  let pendingComb = null;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === '>') { pendingComb = '>'; i++; continue; }
    if (!pendingComb && seq.length) pendingComb = ' ';
    const { parts, next } = parseCompound(s, i);
    if (!parts.length) break;
    seq.push({ comb: pendingComb, parts });
    pendingComb = null;
    i = next;
  }
  return seq;
}

/** 解析一个复合选择器，返回 {parts, next} */
function parseCompound(s, start) {
  const parts = [];
  let i = start;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch) || ch === '>' || ch === ',') break;
    if (ch === '*') { parts.push({ type: 'tag', value: '*' }); i++; continue; }
    if (ch === '.') {
      i++;
      const j = readIdent(s, i);
      parts.push({ type: 'class', value: s.slice(i, j) });
      i = j; continue;
    }
    if (ch === '#') {
      i++;
      const j = readIdent(s, i);
      parts.push({ type: 'id', value: s.slice(i, j) });
      i = j; continue;
    }
    if (ch === '[') {
      const close = findBracketClose(s, i);
      if (close === -1) break;
      const inner = s.slice(i + 1, close).trim();
      const attr = parseAttrPart(inner);
      if (attr) parts.push(attr);
      i = close + 1; continue;
    }
    if (IDENT_RE.test(ch)) {
      const j = readIdent(s, i);
      parts.push({ type: 'tag', value: s.slice(i, j).toLowerCase() });
      i = j; continue;
    }
    break; // 未知字符，停止
  }
  return { parts, next: i };
}

function readIdent(s, i) {
  while (i < s.length && IDENT_RE.test(s[i])) i++;
  return i;
}

function findBracketClose(s, i) {
  let quote = null;
  for (let j = i + 1; j < s.length; j++) {
    const ch = s[j];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === ']') return j;
  }
  return -1;
}

function parseAttrPart(inner) {
  const m = /^([a-zA-Z_][a-zA-Z0-9_.:-]*)\s*(\^=|\*=|\$=|=)?\s*(.*)$/.exec(inner);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const op = m[2] || null;
  let value = m[3] || '';
  value = value.trim();
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
    value = value.slice(1, -1);
  }
  return { type: 'attr', name, op, value };
}

function matchCompound(el, parts) {
  for (const p of parts) {
    if (p.type === 'tag') {
      if (p.value !== '*' && el.tag !== p.value) return false;
    } else if (p.type === 'class') {
      const cls = (el.attrs && el.attrs.class) || '';
      if (!cls.split(/\s+/).includes(p.value)) return false;
    } else if (p.type === 'id') {
      if (!el.attrs || el.attrs.id !== p.value) return false;
    } else if (p.type === 'attr') {
      const v = el.attrs ? el.attrs[p.name] : undefined;
      if (v === undefined) return false;
      if (p.op === '=') { if (v !== p.value) return false; }
      else if (p.op === '^=') { if (!v.startsWith(p.value)) return false; }
      else if (p.op === '$=') { if (!v.endsWith(p.value)) return false; }
      else if (p.op === '*=') { if (v.indexOf(p.value) === -1) return false; }
    }
  }
  return true;
}

function ancestors(el) {
  const out = [];
  let cur = el.parent;
  while (cur) { if (cur.type === 'el') out.push(cur); cur = cur.parent; }
  return out;
}

function matchComplex(el, seq, idx) {
  const step = seq[idx];
  if (!matchCompound(el, step.parts)) return false;
  if (idx === 0) return true;
  const comb = step.comb; // 与前一步的连接方式
  if (comb === '>') {
    // 父元素须匹配 seq[idx-1]
    const p = el.parent;
    if (!p || p.type !== 'el') return false;
    return matchComplex(p, seq, idx - 1);
  }
  // 后代：任一祖先匹配即可
  for (const anc of ancestors(el)) {
    if (matchComplex(anc, seq, idx - 1)) return true;
  }
  return false;
}

/** querySelectorAll 子集：返回按文档序的元素数组 */
function querySelectorAll(root, selector) {
  const parsed = parseSelector(selector);
  const out = [];
  const all = walkElements(root, []);
  for (const el of all) {
    for (const seq of parsed.groups) {
      if (seq.length && matchComplex(el, seq, seq.length - 1)) { out.push(el); break; }
    }
  }
  return { elements: out, attrName: parsed.attrName };
}

// ── 按模式抽取 ──────────────────────────────────────────────────────────────
const HEADER_EXPORT_KEYS = ['etag', 'last-modified', 'content-type', 'content-length', 'x-git-last-commit-date', 'date'];

/**
 * 按模式抽取正文。
 * @param spec {{mode?:string, selector?:string, regex?:string, jsonPath?:string}}
 * @param resp {{body:string, headers:Record<string,string>, status:number}}
 * @returns {{ok:boolean, text?:string, error?:string, mode:string}}
 */
function extractByMode(spec, resp) {
  const mode = spec && spec.mode ? spec.mode : 'text';
  const body = resp && typeof resp.body === 'string' ? resp.body : '';
  try {
    if (mode === 'text') {
      const root = parseHtml(body);
      return { ok: true, text: normalizeText(textContent(root)), mode };
    }
    if (mode === 'selector') {
      if (!spec.selector) return { ok: false, error: 'selector 模式需要填写选择器', mode };
      const root = parseHtml(body);
      const { elements, attrName } = querySelectorAll(root, spec.selector);
      if (!elements.length) return { ok: false, error: `选择器无匹配：${spec.selector}`, mode };
      const parts = elements.map((el) => (attrName ? ((el.attrs && el.attrs[attrName]) || '') : normalizeText(textContent(el))));
      return { ok: true, text: parts.filter(Boolean).join('\n'), mode };
    }
    if (mode === 'regex') {
      if (!spec.regex) return { ok: false, error: 'regex 模式需要填写正则', mode };
      let re;
      try { re = new RegExp(spec.regex, 'g'); } catch (e) { return { ok: false, error: `正则无效：${e.message}`, mode }; }
      const out = [];
      let m;
      let guard = 0;
      while ((m = re.exec(body)) !== null) {
        out.push(m[1] !== undefined ? m[1] : m[0]);
        if (m.index === re.lastIndex) re.lastIndex++;
        if (++guard > 500) break;
      }
      if (!out.length) return { ok: false, error: '正则无匹配', mode };
      return { ok: true, text: normalizeText(out.join('\n')), mode };
    }
    if (mode === 'json') {
      let data;
      try { data = JSON.parse(body); } catch (e) { return { ok: false, error: `响应不是合法 JSON：${e.message}`, mode }; }
      const picked = spec.jsonPath ? pickJsonPath(data, spec.jsonPath) : data;
      if (picked === undefined) return { ok: false, error: `JSON 路径无值：${spec.jsonPath}`, mode };
      const text = typeof picked === 'string' ? picked : JSON.stringify(picked);
      return { ok: true, text: normalizeText(text), mode };
    }
    if (mode === 'headers') {
      const h = (resp && resp.headers) || {};
      const lines = HEADER_EXPORT_KEYS.filter((k) => h[k] !== undefined).map((k) => `${k}: ${h[k]}`);
      return { ok: true, text: normalizeText(`status: ${resp.status}\n${lines.join('\n')}`), mode };
    }
    return { ok: false, error: `未知模式：${mode}`, mode };
  } catch (e) {
    return { ok: false, error: `抽取异常：${e && e.message}`, mode };
  }
}

/** 极简 JSON 路径：a.b[0].c，容忍 $ 前缀与 .[i] 写法 */
function pickJsonPath(data, path) {
  const parts = String(path).replace(/^\$\.?/, '').split('.');
  let cur = data;
  for (const raw of parts) {
    if (!raw) continue;
    const segs = raw.split(/[\[\]]+/).filter(Boolean); // items[0] → ['items','0']
    for (const seg of segs) {
      if (cur === null || cur === undefined) return undefined;
      if (/^\d+$/.test(seg)) cur = Array.isArray(cur) ? cur[Number(seg)] : undefined;
      else cur = cur[seg];
    }
  }
  return cur;
}

/** 从文本中提取第一个数值（容错千分位/货币符号），用于 lt/gt 条件 */
function parseNumber(text) {
  if (!text) return NaN;
  const m = /-?\d[\d,，]*(\.\d+)?/.exec(String(text).replace(/\s/g, ''));
  if (!m) return NaN;
  return parseFloat(m[0].replace(/[,，]/g, ''));
}

module.exports = {
  parseHtml, textContent, normalizeText, decodeEntities,
  querySelectorAll, parseSelector,
  extractByMode, pickJsonPath, parseNumber,
};
