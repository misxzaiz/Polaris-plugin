'use strict';
/**
 * extract.js —— 网页封存化正文抽取（零依赖 readability）
 *
 * 为什么不用 feed-radar 的 extractReadable：订阅流「宁可全量」——article→main→body
 * 硬切片，混进导航/推荐也不伤大雅。网页封存是收藏库，**抽错容器 = 永久封错**，
 * 所以做候选打分（Readability 思路的简化版）：
 *   1. 按标签剥噪声子树（script/style/nav/aside/footer/form/…）
 *   2. 收集候选段落（p/pre/blockquote），向 parent/grandparent 记分
 *      （段长 + 标点密度），链接密度惩罚；噪声 class（sidebar/share/…）熄灭
 *   3. 取最高分容器并向上收并（父级得分接近则吞并，保住容器内的标题）
 *   4. 从容器收集块级结构 → Markdown-lite（# 标题 / - 列表 / > 引用 / ``` pre）
 *   5. 兜底链：评分容器 <400 字 → article/main/body 硬切片 → 择长 →
 *      <80 有效字符报「JS 渲染空壳」
 *   6. 元数据：title / byline / publishedAt / 配图（og/meta/time/JSON-LD）
 *
 * 实体解码沿用 feed-radar 实证结论：解码先行→剥标签、双轮收转义写法；
 * 剥标签用「像标签」正则避免误吃正文 "a < b"。本文件走 DOM 树，文本来自
 * 解析期已解码的 text 节点，天然规避该坑。
 */

const { parseHtml, textContent, normalizeText, walkElements, isNoisyClass } = require('./html');
const lib = require('./lib');

const MIN_OK = 400;      // 评分容器结果的可信下限（低于则跑兜底并择长）
const MIN_VALID = 80;    // 全部路径都低于此有效字符数 → 报错
const PARA_MIN = 20;     // 参与记分的段落最短长度
const LINK_CRUMB = 60;   // 短于该长度且几乎全是链接的段落 = 导航碎屑，丢弃

// 整树剥除的标签（结构性噪声；header 不剥——文章标题常在里面，靠打分淘汰站点头）
const NOISE_TAGS = new Set([
  'script', 'style', 'noscript', 'template', 'svg', 'iframe', 'form', 'nav',
  'aside', 'footer', 'button', 'select', 'label', 'object', 'embed', 'video',
  'audio', 'canvas', 'map', 'dialog', 'input', 'img', 'picture', 'source',
  'hr', 'link', 'meta', 'ins',
]);

// 候选记分时熄灭的 class/id 词根（只影响选容器，不做整树剥除——防误伤）
const NOISE_CLASS_RE = /(comment|promo|advert|ads?\b|ads[-_]|sidebar|share|social|nav|menu|footer|breadcrumb|pagination|banner|newsletter|subscribe|popup|modal|cookie|tooltip|widget|related|recommend|sponsor|signup|login|paywall|metered)/i;

const PAR_TAGS = new Set(['p', 'pre', 'blockquote']);
const PUNCT_RE = /[,，。;；:：!！?？]/g;

function addScore(map, el, delta) {
  map.set(el, (map.get(el) || 0) + delta);
}

function linkDensity(el) {
  let total = 0;
  let link = 0;
  for (const sub of walkElements(el, [])) {
    const t = textContent(sub);
    total += t.length;
    if (sub.tag === 'a') link += t.length;
  }
  if (total <= 0) return 0;
  return link / total;
}

/** 段落净化：去导航碎屑；返回 Markdown-lite 的纯文本段 */
function paraText(el) {
  const t = normalizeText(textContent(el));
  if (t.length < 2) return '';
  if (t.length < LINK_CRUMB && linkDensity(el) > 0.8) return '';
  return t;
}

/** 按标签剥噪声子树；顺带修正 parent 引用（供向上记分用） */
function pruneNoise(node) {
  const kept = [];
  for (const c of node.children || []) {
    if (c.type !== 'el') { c.parent = node; kept.push(c); continue; }
    if (NOISE_TAGS.has(c.tag)) continue;
    pruneNoise(c);
    c.parent = node;
    kept.push(c);
  }
  node.children = kept;
}

/**
 * 候选容器打分：返回 {el, final, raw, ld, score} | null。
 * final 已含链接密度惩罚；score 为原始分表（absorbUp 向上收并时对照用）。
 */
function pickContainer(root) {
  const score = new Map(); // el → 原始分
  const els = walkElements(root, []);
  for (const el of els) {
    if (!PAR_TAGS.has(el.tag)) continue;
    const t = textContent(el).replace(/\s+/g, ' ').trim();
    if (t.length < PARA_MIN) continue;
    const weight = Math.min(t.length / 100, 4) + Math.min((t.match(PUNCT_RE) || []).length, 8) * 0.25;
    const p1 = el.parent;
    const p2 = p1 && p1.type === 'el' ? p1.parent : null;
    if (p1 && p1.type === 'el') addScore(score, p1, weight);
    if (p2 && p2.type === 'el') addScore(score, p2, weight / 2);
  }
  let best = null;
  for (const [el, raw] of score) {
    if (raw <= 0) continue;
    if (isNoisyClass(el, NOISE_CLASS_RE)) continue;
    const ld = linkDensity(el);
    const final = raw * (1 - ld);
    if (final <= 0) continue;
    if (!best || final > best.final) best = { el, final, raw, ld, score };
  }
  return best;
}

/** 从最高分容器向上收并：父级原始分接近且链接密度不高则吞并（保住容器内标题） */
function absorbUp(best, score) {
  let cur = best.el;
  for (let hop = 0; hop < 2; hop++) {
    const p = cur.parent;
    if (!p || p.type !== 'el' || p.tag === '#root') break;
    if (isNoisyClass(p, NOISE_CLASS_RE)) break;
    const pScore = score.get(p) || 0;
    if (pScore < (score.get(cur) || 0) * 0.75) break;
    if (linkDensity(p) > 0.5) break;
    cur = p;
  }
  return cur;
}

/** table → 每行一行，单元格 ' ｜ ' 分隔 */
function tableText(el) {
  const rows = [];
  for (const tr of walkElements(el, [])) {
    if (tr.tag !== 'tr') continue;
    const cells = [];
    for (const c of walkElements(tr, [])) {
      if (c.tag === 'td' || c.tag === 'th') {
        const t = normalizeText(textContent(c));
        cells.push(t);
      }
    }
    if (cells.length) rows.push(cells.join(' ｜ '));
  }
  return rows.join('\n');
}

/** 从容器收集块级结构（保文档序；松散文本按容器聚段） */
function collectBlocksFrom(el, out) {
  let loose = '';
  const flush = () => {
    const t = normalizeText(loose);
    if (t) out.push(t);
    loose = '';
  };
  for (const c of el.children || []) {
    if (c.type === 'text') { loose += ' ' + c.text; continue; }
    if (c.type !== 'el') continue;
    const tag = c.tag;
    if (NOISE_TAGS.has(tag)) continue;
    if (tag === 'p') {
      flush();
      const t = paraText(c);
      if (t) out.push(t);
    } else if (/^h[1-6]$/.test(tag)) {
      flush();
      const t = normalizeText(textContent(c));
      if (t) out.push('#'.repeat(Number(tag[1])) + ' ' + t);
    } else if (tag === 'li') {
      flush();
      const t = paraText(c);
      if (t) out.push('- ' + t);
    } else if (tag === 'blockquote') {
      flush();
      const inner = [];
      collectBlocksFrom(c, inner);
      const t = inner.join('\n\n') || normalizeText(textContent(c));
      if (t) out.push(t.split('\n').map((l) => '> ' + l).join('\n'));
    } else if (tag === 'pre') {
      flush();
      const raw = (textContent(c) || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (raw) out.push('```\n' + raw.slice(0, 4000) + '\n```');
    } else if (tag === 'table') {
      flush();
      const rows = tableText(c);
      if (rows) out.push(rows);
    } else if (tag === 'figcaption') {
      flush();
      const t = normalizeText(textContent(c));
      if (t) out.push('〔图〕' + t);
    } else if (tag === 'dt' || tag === 'dd') {
      flush();
      const t = paraText(c);
      if (t) out.push(t);
    } else {
      // div/section/article/figure/ul 容器等：递归透传
      flush();
      collectBlocksFrom(c, out);
    }
  }
  flush();
}

/** 相邻重复段去重（cite 站点导航列常见）+ 空行压缩 */
function finalize(parts) {
  const out = [];
  for (const p of parts) {
    if (!p) continue;
    if (out.length && out[out.length - 1] === p) continue;
    out.push(p);
  }
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── 元数据 ─────────────────────────────────────────────────────────────────
function metaContent(root, names) {
  const want = new Set(names.map((n) => n.toLowerCase()));
  for (const el of walkElements(root, [])) {
    if (el.tag !== 'meta') continue;
    const key = String((el.attrs && (el.attrs.name || el.attrs.property)) || '').toLowerCase();
    if (want.has(key)) {
      const c = (el.attrs && el.attrs.content) || '';
      if (c) return c;
    }
  }
  return '';
}

/** 解析时间；解析不了返回 0；未来 >7 天视为脏数据返回 0 */
function parseTime(s) {
  if (!s) return 0;
  const t = new Date(String(s).trim());
  const ts = t.getTime();
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  if (ts > Date.now() + 7 * 86400000) return 0;
  if (ts < Date.now() - 120 * 365 * 86400000) return 0; // 早于 1906 年 = 解析错位
  return Math.floor(ts);
}

function metaFrom(root, html) {
  // 标题：og:title → twitter:title → <title>
  let title = metaContent(root, ['og:title', 'twitter:title']);
  if (!title) {
    for (const el of walkElements(root, [])) {
      if (el.tag === 'title') { title = textContent(el); break; }
    }
  }
  title = lib.clip(title, lib.TITLE_CAP);

  // 作者：meta author → [rel=author] 文本 → class 含 byline/author 的短元素
  let byline = metaContent(root, ['author', 'article:author', 'parsely-author', 'sailthru.author']);
  if (!byline) {
    for (const el of walkElements(root, [])) {
      if (el.tag === 'a' && String((el.attrs && el.attrs.rel) || '').toLowerCase().includes('author')) {
        byline = textContent(el);
        break;
      }
    }
  }
  if (!byline) {
    for (const el of walkElements(root, [])) {
      const hay = `${(el.attrs && el.attrs.class) || ''} ${(el.attrs && el.attrs.id) || ''}`.toLowerCase();
      if (/byline|author/.test(hay) && !NOISE_CLASS_RE.test(hay)) {
        const t = normalizeText(textContent(el));
        if (t && t.length <= lib.BYLINE_CAP) { byline = t; break; }
      }
    }
  }
  byline = lib.clip(byline, lib.BYLINE_CAP);

  // 发布时间：article:published_time → pubdate/date 类 meta → <time datetime> → JSON-LD
  let publishedAt = parseTime(metaContent(root, [
    'article:published_time', 'og:updated_time', 'pubdate', 'publish-date',
    'date', 'dc.date', 'dc.date.issued', 'parsely-pub-date', 'sailthru.date',
  ]));
  if (!publishedAt) {
    for (const el of walkElements(root, [])) {
      if (el.tag === 'time') {
        const dt = (el.attrs && el.attrs.datetime) || '';
        const ts = parseTime(dt);
        if (ts) { publishedAt = ts; break; }
      }
    }
  }
  if (!publishedAt) {
    const m = /"datePublished"\s*:\s*"([^"]+)"/i.exec(html.slice(0, 512 * 1024));
    if (m) publishedAt = parseTime(m[1]);
  }

  const img = lib.clip(metaContent(root, ['og:image', 'twitter:image', 'twitter:image:src']), lib.IMG_CAP);
  return { title, byline, publishedAt, img };
}

function findFirstOf(root, tags) {
  const want = new Set(tags);
  for (const el of walkElements(root, [])) {
    if (want.has(el.tag)) return el;
  }
  return null;
}

/**
 * 正文抽取主入口。
 * @returns {{ok:true, title, byline, publishedAt, img, text, wordCount}
 *           |{ok:false, error:string}}
 */
function extractArticle(html) {
  const src = String(html || '');
  if (!src.trim()) return { ok: false, error: '空响应' };
  let root;
  try {
    root = parseHtml(src);
  } catch (e) {
    return { ok: false, error: `解析失败：${e && e.message}` };
  }
  // 元数据先取：剪枝会剥掉 meta/link（og:title、author 等都在被剥之列）
  const meta = metaFrom(root, src);
  pruneNoise(root);

  // 主路径：候选打分容器
  const scored = [];
  const pick = pickContainer(root);
  let containerTag = '';
  if (pick) {
    const el = absorbUp(pick, pick.score);
    containerTag = el.tag;
    collectBlocksFrom(el, scored);
  }
  const scoredText = finalize(scored);

  // 兜底：article → main → body 硬切片（按优先级逐个找，防祖先 body 抢先命中），与主路径择长
  let text = scoredText;
  if (scoredText.length < MIN_OK) {
    const fb = [];
    let scope = root;
    for (const tag of ['article', 'main', 'body']) {
      const el = findFirstOf(root, [tag]);
      if (el) { scope = el; break; }
    }
    collectBlocksFrom(scope, fb);
    const fbText = finalize(fb);
    if (fbText.length > scoredText.length) text = fbText;
  }

  const valid = text.replace(/\s+/g, '').length;
  if (valid < MIN_VALID) {
    return { ok: false, error: '页面像 JS 渲染空壳或没有可抽取的正文' };
  }
  const wordCount = (text.match(/[\u4e00-\u9fff]|\w+/g) || []).length;
  return {
    ok: true,
    title: meta.title,
    byline: meta.byline,
    publishedAt: meta.publishedAt,
    img: meta.img,
    text: text.slice(0, lib.TEXT_CAP),
    wordCount,
    container: containerTag,
  };
}

module.exports = { extractArticle, pickContainer, collectBlocksFrom, finalize, metaFrom, parseTime };
