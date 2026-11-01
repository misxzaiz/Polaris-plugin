'use strict';
/**
 * html.js —— 零依赖容错 HTML 解析器（网页封存服务专用）
 *
 * 与 page-sentinel 的解析器同源（实测可靠），只保留 DOM 解析与文本部分——
 * 网页封存不需要 CSS 选择器引擎（容器选择靠 extract.js 的打分算法）。
 * 为什么不用 cheerio/jsdom：插件 zip 打包排除 node_modules（.pluginignore），
 * 服务必须只依赖 Node 内置能力。
 *
 * 容错语义：解析过程不抛错；未闭合标签按栈自动配对；注释/doctype 丢弃；
 * script/style/title 为 raw text（script/style 内容直接丢弃，title 保留）。
 */

// ── 实体解码 ───────────────────────────────────────────────────────────────
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·', bull: '•',
  deg: '°', plusmn: '±', times: '×', divide: '÷', laquo: '«', raquo: '»',
  yen: '¥', euro: '€', pound: '£', cent: '¢', sect: '§', para: '¶',
  times2: '×', ensp: ' ', emsp: ' ', thinsp: ' ', zwj: '', shy: '',
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
      // 原始文本：直取到对应闭合标签（大小写不敏感）。
      // 文本挂到 node 自己——此时 node 尚未入栈，挂栈顶会错挂到父元素（title 取不到文本的根因）
      const closeRe = new RegExp('</' + tag + '\\s*>', 'i');
      const rest = html.slice(i);
      const m = closeRe.exec(rest);
      const raw = m ? rest.slice(0, m.index) : rest;
      if (raw) {
        const t = makeNode('text', '', null);
        t.text = tag === 'script' || tag === 'style' ? '' : decodeEntities(raw);
        node.children.push(t);
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
    if (ch === '/') { i++; continue; }
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

/** 规范化文本：行内空白折叠、去首尾空、合并 3+ 连续空行 */
function normalizeText(s) {
  if (!s) return '';
  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 元素自身的 class 列表 */
function classesOf(el) {
  const cls = (el.attrs && el.attrs.class) || '';
  return cls.toLowerCase().split(/\s+/).filter(Boolean);
}

/** class/id 是否命中噪声词（sidebar/share/comment/promo…） */
function isNoisyClass(el, re) {
  const hay = `${(el.attrs && el.attrs.class) || ''} ${(el.attrs && el.attrs.id) || ''}`.toLowerCase();
  return re ? re.test(hay) : false;
}

module.exports = {
  decodeEntities, parseHtml, textContent, normalizeText,
  walkElements, classesOf, isNoisyClass,
};
