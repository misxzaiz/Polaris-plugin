'use strict';
/**
 * feedparse.js —— RSS 2.0 / Atom / RSS 1.0(RDF) → 规范条目（零依赖）
 *
 * 目标是"parser 之上的一层结构翻译"：不管订阅方给的是哪种方言，
 * 输出统一的 items[].{title, link, guid, publishedAt, excerpt, author}。
 * 摘要一律 htmlToText（存储里不养 HTML，阅读视图直接可用）。
 */
const lib = require('./lib');
const xml = require('./xml');

const { first, all, textOf } = xml;

/**
 * @param {string|Buffer} src 原始响应体
 * @returns {{ok: true, kind: 'rss'|'atom', title: string, siteUrl: string, items: object[]}
 *           |{ok: false, error: string}}
 */
function parseFeed(src) {
  const text = String(src || '');
  if (!text || !text.includes('<')) return { ok: false, error: '响应不是 XML 内容' };
  let root;
  try { root = xml.parseXml(text); } catch (e) { return { ok: false, error: `XML 解析失败：${e.message}` }; }

  // 顶层是容错 #root；真正的根元素开箱即见
  const top = root.c[0];
  if (!top) return { ok: false, error: '空 XML 文档' };

  if (top.n === 'rss') return parseRss2(root, top);
  if (top.n === 'feed') return parseAtom(root, top);
  if (top.n === 'rdf') return parseRss1(root, top); // rdf:RDF → 本地名 rdf
  return { ok: false, error: `不支持的订阅格式（根元素 <${top.n}>，只认 RSS/Atom）` };
}

// ── RSS 2.0 ────────────────────────────────────────────────────────────────
function parseRss2(root, top) {
  const ch = first(top, 'channel');
  if (!ch) return { ok: false, error: 'RSS 缺少 <channel>' };
  const items = all(ch, 'item'); // 旧站偶见 item 漏出 channel 的脏数据，下面兜底
  if (!items.length) items.push(...all(root, 'item'));
  if (!items.length) return { ok: false, error: 'RSS 中没有任何条目' };
  const feedMeta = {
    title: lib.clip(textOf(first(ch, 'title')), lib.TITLE_CAP),
    siteUrl: all(ch, 'link').map((n) => textOf(n)).find((v) => /^https?:/i.test(v)) || '',
  };
  return { ok: true, kind: 'rss', ...feedMeta, items: items.map(rssItem) };
}

function rssItem(it) {
  // link：文本子节点为准；空/坏 → guid(isPermaLink) 兜底
  let link = all(it, 'link').map((n) => textOf(n)).find((v) => /^https?:/i.test(v)) || '';
  if (!link) {
    const g = first(it, 'guid');
    if (g && (g.a.ispermalink === undefined || g.a.ispermalink !== 'false') && /^https?:/i.test(textOf(g))) {
      link = textOf(g);
    }
  }
  const guid = textOf(first(it, 'guid')) || textOf(first(it, 'atomid')) || textOf(first(it, 'id'));
  // 摘要：content:encoded（本地名 encoded）优先，比 description 完整
  const rich = textOf(first(it, 'encoded'));
  const descHtml = textOf(first(it, 'description'));
  return {
    title: lib.clip(textOf(first(it, 'title')), lib.TITLE_CAP),
    link,
    guid: guid || link,
    publishedAt: lib.parseFeedDate(textOf(first(it, 'pubdate')) || textOf(first(it, 'date'))),
    excerpt: lib.clip(htmlToPlain(rich || descHtml), lib.EXCERPT_CAP),
    author: lib.clip(textOf(first(it, 'author')) || textOf(first(it, 'creator')), lib.AUTHOR_CAP),
  };
}

// ── Atom ──────────────────────────────────────────────────────────────────
function parseAtom(root, top) {
  const items = all(top, 'entry');
  if (!items.length) return { ok: false, error: 'Atom 中没有任何条目' };
  // feed 站点链接：rel=alternate 的 <link href>
  const feedMeta = {
    title: lib.clip(textOf(first(top, 'title')), lib.TITLE_CAP),
    siteUrl: atomAlternateHref(top),
  };
  return { ok: true, kind: 'atom', ...feedMeta, items: items.map(atomItem) };
}

function atomAlternateHref(node) {
  const links = all(node, 'link');
  const alt = links.find((l) => l.a.rel === 'alternate' || !l.a.rel);
  return (alt && (alt.a.href || '').trim()) || links.map((l) => (l.a.href || '').trim()).find(Boolean) || '';
}

function atomItem(it) {
  const link = atomAlternateHref(it);
  const guid = textOf(first(it, 'id'));
  const contentHtml = textOf(first(it, 'content'));
  const summaryHtml = textOf(first(it, 'summary'));
  return {
    title: lib.clip(textOf(first(it, 'title')), lib.TITLE_CAP),
    link: link || (guid.startsWith('http') ? guid : ''),
    guid: guid || link,
    publishedAt: lib.parseFeedDate(
      textOf(first(it, 'published')) || textOf(first(it, 'updated')),
    ),
    excerpt: lib.clip(htmlToPlain(contentHtml || summaryHtml), lib.EXCERPT_CAP),
    author: lib.clip(
      (() => { const a = first(it, 'author'); return a ? textOf(first(a, 'name')) || textOf(a) : textOf(first(it, 'creator')); })(),
      lib.AUTHOR_CAP,
    ),
  };
}

// ── RSS 1.0（RDF）─────────────────────────────────────────────────────────
function parseRss1(root, top) {
  const items = all(root, 'item').length ? all(root, 'item') : all(top, 'item');
  if (!items.length) return { ok: false, error: 'RDF 中没有任何条目' };
  const ch = first(top, 'channel');
  const feedMeta = {
    title: ch ? lib.clip(textOf(first(ch, 'title')), lib.TITLE_CAP) : '',
    siteUrl: ch ? all(ch, 'link').map((n) => textOf(n)).find((v) => /^https?:/i.test(v)) || '' : '',
  };
  return { ok: true, kind: 'rdf', ...feedMeta, items: items.map(rssItem) };
}

/**
 * HTML → 纯文本一行（摘要专用）：剥标签 + 实体解码 + 空白折叠。
 * 与 extract.extractReadable 不同：这里不为"可读全文"服务，只求短摘要干净。
 */
function htmlToPlain(html) {
  // 两轮「解码→剥标签」：CDATA 真标签与 &lt;p&gt; 转义写法都归一为纯文本。
  // 解码必须先于剥标签，否则转义标签会漏成字面文本；第二轮收双转义（&amp;lt;）。
  // 剥标签用「像标签」的正则（< 后跟字母/斜杠/!），避免误吃正文里的 "a < b"。
  let s = String(html || '');
  for (let round = 0; round < 2; round++) {
    s = s
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
        const code = parseInt(h, 16);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
      })
      .replace(/&#(\d+);/g, (_, n) => {
        const code = parseInt(n, 10);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
      })
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&amp;/gi, '&')
      .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(p|br|div|li|tr)\b[^>]*>/gi, ' ')
      .replace(/<(\/?[a-zA-Z][^>]*)>/g, '');
  }
  return s.replace(/\s+/g, ' ').trim();
}

module.exports = { parseFeed, htmlToPlain };
