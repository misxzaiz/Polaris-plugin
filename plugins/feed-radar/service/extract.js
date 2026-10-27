'use strict';
/**
 * extract.js —— 订阅雷达正文抽取（零依赖 readability-lite）
 *
 * 用途：面板「阅读视图」与 AI 工具 radar_read_article 拉取文章正文时，
 * 服务端把 HTML 变成干净的分段文本。为什么要下沉到服务做：
 * 面板（webview）抓任意第三方页面会被同源策略拦死——服务端原生 fetch
 * 没有这堵墙（本插件跨域问题的根治点，与 page-sentinel 同一铁律）。
 *
 * 策略（宁可全量不臆造）：
 *   1. 剥 script/style/noscript/svg/comment
 *   2. 内容容器：<article> → <main> → <body>（article 嵌套按深度配对切片）
 *   3. 分块收集：块级标签结尾切块；块内剥标签 + 实体解码 + 空白折叠；
 *      h1-h6 保留为 "# ## ###" 标记行（Markdown-lite，AI 与面板都好读）
 *   4. 过短回退：抽取 < 400 字符 → 全文去噪兜底；仍 < 80 字符 → 报错
 */

const lib = require('./lib');

const MIN_FALLBACK = 400;

/** HTML → 纯文本（任意用途）：剥 script/style/comment、标签转空格 */
function htmlToText(html) {
  let s = String(html || '');
  // 两轮「解码→剥标签」：真标签与 &lt;p&gt; 转义写法都归一为纯文本。
  // 解码必须先于剥标签，否则转义标签会漏成字面文本；第二轮收双转义（&amp;lt;）。
  // 剥标签用「像标签」的正则（< 后跟字母/斜杠/!），避免误吃正文里的 "a < b"。
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
      .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&amp;/gi, '&')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, ' ')
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(p|br|div|li|tr|h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<(\/?[a-zA-Z!][^>]*)>/g, ' ');
  }
  return s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** 数出容器标签的配对切片：第一个 <tag> 到它配对 </tag>（嵌套深度法） */
function sliceContainer(html, tag) {
  const openRe = new RegExp(`<${tag}(\\s|>)[^>]*>`, 'gi');
  const closeRe = new RegExp(`</${tag}\\s*>`, 'gi');
  const gate = [];
  let m;
  while ((m = openRe.exec(html))) gate.push({ i: m.index, open: true });
  const closes = [];
  while ((m = closeRe.exec(html))) closes.push({ i: m.index, open: false });
  const marks = [...gate, ...closes].sort((a, b) => a.i - b.i);
  let depth = 0;
  let start = -1;
  for (const mk of marks) {
    if (mk.open) {
      if (depth === 0) start = mk.i;
      depth++;
    } else {
      depth--;
      if (depth === 0 && start >= 0) return { start, end: mk.i + 3 + tag.length };
    }
  }
  return null;
}

/** 取标题：og:title → <title> */
function pageTitle(html) {
  const head = html.slice(0, 256 * 1024);
  const og = head.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i)
    || head.match(/<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i);
  const t = og
    ? lib.decodeEntities(og[1])
    : (head.match(/<title[^>]*>([\s\S]{0,600}?)<\/title>/i) || ['', ''])[1].replace(/<[^>]+>/g, '');
  return lib.decodeEntities(t).trim().slice(0, 200);
}

/**
 * 正文抽取主入口。
 * @returns {{ok: true, title: string, text: string}|{ok: false, error: string}}
 */
function extractReadable(html) {
  const src = String(html || '');
  if (!src) return { ok: false, error: '空响应' };

  // 1) 去噪：script/style/noscript/template/svg/comment/iframe
  let s = src
    .replace(/<!(?:doctype|DOCTYPE)[^>]*>/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // 2) 内容容器切片（article → main → body → 全文）
  let scope = s;
  for (const tag of ['article', 'main', 'body']) {
    const cut = sliceContainer(s, tag);
    if (cut) { scope = s.slice(cut.start, cut.end); break; }
  }

  // 3) 分块：在块级闭合处断句
  const text = collectBlocks(scope);
  if (text.length < MIN_FALLBACK) {
    const whole = collectBlocks(s);
    if (whole.length < 80) return { ok: false, error: '页面过于接近空壳（JS 渲染？），试着盯它的 RSS/JSON 接口' };
    return { ok: true, title: pageTitle(src), text: whole.slice(0, lib.TEXT_CAP) };
  }
  return { ok: true, title: pageTitle(src), text: text.slice(0, lib.TEXT_CAP) };
}

/** 分块收集：块级闭合切块 → 剥标签 → 有效段落；标题行加 # 标记 */
function collectBlocks(scope) {
  const parts = scope
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|blockquote|pre|figcaption|h[1-6]|section|article|dd|dt)>/gi, '\u0000BLOCK\u0000')
    .split(/\u0000BLOCK\u0000/);
  const out = [];
  for (const part of parts) {
    // 该块是否以标题开头：捕获块内第一个标题起点，把标题行独放
    let rest = part;
    const hM = rest.match(/^([\s\S]{0,400}?)<h([1-6])\b[^>]*>([\s\S]*?)<\/h\2[\s\S>]*>/i);
    let headLine = '';
    if (hM) {
      const before = plain(hM[1]);
      const head = plain(hM[3]);
      if (head) headLine = `${'#'.repeat(Number(hM[2]))} ${head}`;
      rest = rest.slice(hM.index + hM[0].length);
      if (before) out.push(before);
    }
    const body = plain(rest);
    if (headLine) out.push(headLine);
    if (body) out.push(body);
  }
  // 相邻重复行去重 + 空行压缩：cite 站点导航重复列常见
  const dedup = [];
  for (const line of out) {
    if (dedup.length && dedup[dedup.length - 1] === line) continue;
    dedup.push(line);
  }
  return dedup.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 块内纯化：解码 → 剥标签（两轮，收转义写法的标签）+ 折叠（保留单换行，供 pre/多行引用） */
function plain(chunk) {
  let t = String(chunk || '');
  // 解码必须先于剥标签，否则 &lt;b&gt; 这类转义标签会漏成字面文本；第二轮收双转义
  for (let round = 0; round < 2; round++) {
    t = t
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
        const code = parseInt(h, 16);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
      })
      .replace(/&#(\d+);/g, (_, n) => {
        const code = parseInt(n, 10);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
      })
      .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&amp;/gi, '&')
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(\/?[a-zA-Z!][^>]*)>/g, ' ');
  }
  const lines = [];
  for (const line of t.split('\n')) {
    const c = line.replace(/[ \t]+/g, ' ').trim();
    if (c) lines.push(c);
  }
  return lines.join(' ').trim();
}

// 阈值常量导出给测试
const MIN_TEXT_OK = MIN_FALLBACK;

module.exports = { htmlToText, extractReadable, pageTitle, sliceContainer, MIN_TEXT_OK };
