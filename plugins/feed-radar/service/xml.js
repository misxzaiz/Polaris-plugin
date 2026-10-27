'use strict';
/**
 * xml.js —— 订阅雷达用极小 XML 树解析器（零依赖，容错优先）
 *
 * 为什么手写而不用正则一把梭：RSS/Atom 里标题、正文常含 CDATA 与实体、
 * 属性值里会有 ">"、标签名带命名空间前缀（content:encoded / atom:link /
 * dc:creator），正则方案在这些真实脏数据上必然碎。这里用字符级扫描器：
 *
 *   - 标签内引号感知（属性值里的 ">" 不会再提前截断标签）
 *   - CDATA 字面进入正文（ <![CDATA[<p>x</p>]]> 不再被当标签拆掉 ）
 *   - 命名空间取本地名：content:encoded → encoded，atom:link → link，
 *     原始名保留在 node.q 上（需要区分 namespace 的地方用它）
 *   - 闭合/自闭合/注释/doctype/PI 处理；闭合标签名不匹配时宽松弹栈
 *     （真实世界里 feed 偶见脏闭合，结构大于严格性）
 *
 * 节点形状：{ n: 本地名(小写), q: 原始名(可选), a: 属性map(小写键), c: 子节点[], t: 直属文本 }
 * 顶层总是 { n:'#root', ... }，真正的 XML 根元素是它的第一个子节点。
 */

/** 找标签结尾的 '>'（跳过引号内的 '>'） */
function findTagEnd(src, from) {
  let q = '';
  for (let i = from + 1; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === q) q = ''; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '>') return i;
  }
  return -1;
}

function decodeAttr(s) {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const code = parseInt(h, 16);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    })
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    // &amp; 最后解，防 &amp;lt; 二次解码
    .replace(/&amp;/gi, '&');
}

function splitName(raw) {
  const name = String(raw || '').trim().toLowerCase();
  const i = name.indexOf(':');
  if (i > 0) return { n: name.slice(i + 1), q: name };
  return { n: name, q: '' };
}

function parseXml(src) {
  const root = { n: '#root', q: '', a: {}, c: [], _t: '' };
  const stack = [root];
  const cur = () => stack[stack.length - 1];
  const addText = (s) => { if (s) cur()._t = (cur()._t || '') + s; };

  const len = src.length;
  let i = 0;
  while (i < len) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { addText(src.slice(i)); break; }
    if (lt > i) addText(src.slice(i, lt));

    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      i = e < 0 ? len : e + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      addText(e < 0 ? src.slice(lt + 9) : src.slice(lt + 9, e));
      i = e < 0 ? len : e + 3;
      continue;
    }
    if (src.startsWith('<?', lt) || src.startsWith('<!', lt)) {
      // 声明/doctype（含内部子集 [ ] 平衡扫描）
      let j = lt + 2;
      let depth = 0;
      for (; j < len; j++) {
        const ch = src[j];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth <= 0) break;
      }
      i = j < len ? j + 1 : len;
      continue;
    }
    if (src.startsWith('</', lt)) {
      const e = findTagEnd(src, lt);
      i = e < 0 ? len : e + 1;
      if (stack.length > 1) stack.pop(); // 宽松：不校验名字，脏闭合不炸树
      continue;
    }

    const e = findTagEnd(src, lt);
    if (e < 0) { addText(src.slice(lt)); break; }
    const inner = src.slice(lt + 1, e);
    i = e + 1;

    const selfClose = /\/\s*$/.test(inner);
    const nameStart = inner.match(/^([^\s/]+)/);
    if (!nameStart) continue; // "<>" 级别的碎片直接丢弃
    const { n, q } = splitName(nameStart[1]);
    const node = { n, a: {}, c: [], _t: '' };
    if (q) node.q = q;
    const attrRe = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = attrRe.exec(inner))) {
      // 取引号内层（m[3]/m[4]）而非 m[2]——否则属性值带引号入库，href/rel 匹配全被污染
      node.a[m[1].toLowerCase()] = decodeAttr(m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
    }
    cur().c.push(node);
    if (!selfClose) stack.push(node);
  }

  finalize(root);
  return root;
}

/** 把扫描期缓冲 _t 归位成 t（直属文本），递归 */
function finalize(node) {
  node.t = node._t || '';
  delete node._t;
  for (const c of node.c) finalize(c);
}

// ── 取数辅助（feedparse/测试共用）─────────────────────────────────────────
/** node 下第一个指定本地名的直接子节点 */
function first(node, name) {
  if (!node || !Array.isArray(node.c)) return null;
  return node.c.find((c) => c.n === String(name).toLowerCase()) || null;
}

/** node 下所有指定本地名的直接子节点 */
function all(node, name) {
  if (!node || !Array.isArray(node.c)) return [];
  return node.c.filter((c) => c.n === String(name).toLowerCase());
}

/** 深度优先找第一个本地名匹配的节点（feed 根层级兜底：items 可能不在 channel 下） */
function deepFirst(node, name, stopAt) {
  if (!node) return null;
  if (stopAt && node !== stopAt && node.n === stopAt) return null;
  for (const c of node.c || []) {
    if (c.n === String(name).toLowerCase()) return c;
    const found = deepFirst(c, name, stopAt);
    if (found) return found;
  }
  return null;
}

/** 节点直属文本（不进子节点），实体已解码 */
function textOf(node) {
  if (!node) return '';
  return String(node.t || '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { parseXml, first, all, deepFirst, textOf, decodeAttr };
