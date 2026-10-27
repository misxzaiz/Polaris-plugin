#!/usr/bin/env node
'use strict';
/**
 * 订阅雷达离线单测（零依赖，node >= 18）：node test/run-tests.mjs
 * 覆盖：sha256 向量 / URL 门卫 / feed 规范化 / 文章 id 稳定性 / 日期解析 /
 *       合并计划幂等与回填 / 保留策略 / RSS2+Atom+RDF 解析 /
 *       实体解码链（转义标签、比较号、双转义）/ 正文抽取
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const assert = require('node:assert');
const { sha256Hex } = require('../shared/sha256');
const lib = require('../service/lib');
const { parseFeed, htmlToPlain } = require('../service/feedparse');
const { htmlToText, extractReadable, pageTitle } = require('../service/extract');

let pass = 0;
let fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok', name); }
  catch (e) { fail++; console.error('  FAIL', name, '\n     ', e.message); }
}

// ── shared/sha256 ───────────────────────────────────────────────────────────
t('sha256 标准向量', () => {
  assert.strictEqual(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.strictEqual(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

// ── lib.isFetchableUrl ─────────────────────────────────────────────────────
t('URL 门卫：公网 http(s) 放行', () => {
  assert.strictEqual(lib.isFetchableUrl('https://example.com/feed.xml'), true);
  assert.strictEqual(lib.isFetchableUrl('http://example.com/feed'), true);
});
t('URL 门卫：内网/环回/云元数据/非 http 拒绝', () => {
  for (const u of [
    'http://127.0.0.1/feed', 'http://localhost/feed', 'http://192.168.1.2/feed',
    'http://10.0.0.1/feed', 'http://172.16.0.1/feed', 'http://169.254.169.254/latest',
    'file:///etc/passwd', 'ftp://example.com/x', 'javascript:alert(1)',
  ]) assert.strictEqual(lib.isFetchableUrl(u), false, u);
});

// ── lib.normalizeFeed ──────────────────────────────────────────────────────
t('normalizeFeed：缺载荷/空 URL 报错', () => {
  assert.ok(lib.normalizeFeed(null).error);
  assert.ok(lib.normalizeFeed({ url: '  ' }).error);
});
t('normalizeFeed：裸域名补 https、feed:// 前缀规整', () => {
  assert.strictEqual(lib.normalizeFeed({ url: 'example.com/rss' }).feed.url, 'https://example.com/rss');
  assert.strictEqual(lib.normalizeFeed({ url: 'feed://example.com/rss' }).feed.url, 'https://example.com/rss');
});
t('normalizeFeed：内网地址拒绝', () => {
  assert.ok(lib.normalizeFeed({ url: 'http://127.0.0.1/rss' }).error);
});
t('normalizeFeed：intervalMin 钳制（0=跟随全局，5–240）', () => {
  const f = (raw) => lib.normalizeFeed(raw).feed.intervalMin;
  assert.strictEqual(f({ url: 'https://e.com/f' }), 0);
  assert.strictEqual(f({ url: 'https://e.com/f', intervalMin: 3 }), 5);
  assert.strictEqual(f({ url: 'https://e.com/f', intervalMin: 999 }), 240);
});
t('normalizeFeed：existing 保留运行态字段与 rev', () => {
  const prev = { id: 'fX', url: 'https://e.com/f', etag: 'W/"1"', lastFetchAt: 123, lastStatus: 'ok', itemCount: 9, unreadCount: 2, rev: 7, title: '旧名' };
  const r = lib.normalizeFeed({ url: 'https://e.com/f', title: '新名' }, prev).feed;
  assert.strictEqual(r.etag, 'W/"1"');
  assert.strictEqual(r.lastFetchAt, 123);
  assert.strictEqual(r.rev, 7);
  assert.strictEqual(r.title, '新名');
});

// ── lib.articleId / parseFeedDate ──────────────────────────────────────────
t('articleId：同 guid 稳定、异 guid 不同', () => {
  const item = { guid: 'g1', link: 'https://e.com/1', title: 'x' };
  assert.strictEqual(lib.articleId('fX', item), lib.articleId('fX', { guid: 'g1' }));
  assert.notStrictEqual(lib.articleId('fX', item), lib.articleId('fX', { guid: 'g2' }));
});
t('parseFeedDate：RFC822/ISO 可解析，垃圾返回 0', () => {
  assert.ok(lib.parseFeedDate('Wed, 15 Oct 2025 08:00:00 GMT') > 0);
  assert.ok(lib.parseFeedDate('2025-10-15T08:00:00Z') > 0);
  assert.strictEqual(lib.parseFeedDate('不是日期'), 0);
  assert.strictEqual(lib.parseFeedDate(''), 0);
});
t('parseFeedDate：未来超 7 天钳到 now', () => {
  const now = Date.parse('2025-10-15T00:00:00Z');
  assert.strictEqual(lib.parseFeedDate('2026-10-15T00:00:00Z', now), now);
});

// ── lib.planMerge ──────────────────────────────────────────────────────────
t('planMerge：新条目入库，重复抓取幂等（零新增）', () => {
  const items = [
    { guid: 'g1', link: 'https://e.com/1', title: '一', excerpt: 'e1', publishedAt: 1000 },
    { guid: 'g2', link: 'https://e.com/2', title: '二', excerpt: 'e2', publishedAt: 2000 },
  ];
  const r1 = lib.planMerge(new Map(), items, { id: 'fX' }, 9999, 120);
  assert.strictEqual(r1.adds.length, 2);
  assert.strictEqual(r1.total, 2);
  const byId = new Map(r1.adds.map((a) => [a.id, a]));
  const r2 = lib.planMerge(byId, items, { id: 'fX' }, 9999, 120);
  assert.strictEqual(r2.adds.length, 0);
  assert.strictEqual(r2.updates.length, 0);
  assert.strictEqual(r2.total, 2);
});
t('planMerge：旧条目只回填空字段，不碰 read/star', () => {
  const items = [{ guid: 'g1', link: 'https://e.com/1', title: '一', excerpt: '新摘要', publishedAt: 1000 }];
  const r1 = lib.planMerge(new Map(), [{ guid: 'g1', link: 'https://e.com/1', title: '', excerpt: '', publishedAt: 0 }], { id: 'fX' }, 9999, 120);
  const prev = { ...r1.adds[0], read: true, star: true };
  const byId = new Map([[prev.id, prev]]);
  const r2 = lib.planMerge(byId, items, { id: 'fX' }, 9999, 120);
  // 旧条目 title 已被 link 兜底占位（非空），回填只补空字段：excerpt + publishedAt
  assert.strictEqual(r2.updates.length, 1);
  assert.deepStrictEqual(Object.keys(r2.updates[0].patch).sort(), ['excerpt', 'publishedAt']);
});

// ── lib.planRetention / planContentRetention ───────────────────────────────
t('planRetention：星标永留，超期已读删，未读在保留期内留', () => {
  const now = Date.now();
  const D = 86400000;
  const mk = (id, feedId, over) => ({ id, feedId, publishedAt: now - over * D, createdAt: now - over * D, read: false, star: false, ...over });
  const arts = [
    { id: 'a-star', feedId: 'f1', publishedAt: now - 90 * D, read: true, star: true },
    { id: 'a-old-read', feedId: 'f1', publishedAt: now - 20 * D, createdAt: now - 20 * D, read: true, star: false },
    { id: 'a-old-unread', feedId: 'f1', publishedAt: now - 20 * D, createdAt: now - 20 * D, read: false, star: false },
    { id: 'a-new', feedId: 'f1', publishedAt: now - 1 * D, createdAt: now - 1 * D, read: false, star: false },
  ];
  const del = lib.planRetention(arts, { retentionDays: 30, readKeepDays: 14, maxPerFeed: 120 }, now);
  assert.deepStrictEqual(del.sort(), ['a-old-read']);
});
t('planRetention：单源超上限删最旧', () => {
  const now = Date.now();
  // maxPerFeed 平台下限 30（防御性钳制），用 32 条超限验证删最旧 2 条
  const arts = Array.from({ length: 32 }, (_, i) => ({
    id: 'a' + i, feedId: 'f1', publishedAt: now - (i + 1) * 1000, createdAt: now - (i + 1) * 1000, read: false, star: false,
  }));
  const del = lib.planRetention(arts, { retentionDays: 365, readKeepDays: 180, maxPerFeed: 30 }, now);
  assert.deepStrictEqual(del.sort(), ['a30', 'a31']);
});
t('planContentRetention：错误占位即删，星标放长到 ≥720h', () => {
  const now = Date.now();
  const H = 3600000;
  // 非星标 100h 超过 48h 限删除；星标 100h 在 720h 放长限内保留
  const del = lib.planContentRetention([
    { id: 'c-err', error: 'x', fetchedAt: now - 1000 },
    { id: 'c-old', fetchedAt: now - 100 * H },
    { id: 'c-star-100h', star: true, fetchedAt: now - 100 * H },
    { id: 'c-fresh', fetchedAt: now - 1 * H },
  ], { contentKeepHours: 48 }, now);
  assert.deepStrictEqual(del.sort(), ['c-err', 'c-old']);
});

// ── feedparse：RSS 2.0 ─────────────────────────────────────────────────────
const RSS2 = '<?xml version="1.0"?><rss version="2.0"><channel>'
  + '<title>A &amp; B 博客</title><link>https://blog.example.com/</link><description>d</description>'
  + '<item><title>第一篇</title><link>https://blog.example.com/1</link><guid>post-1</guid>'
  + '<pubDate>Wed, 15 Oct 2025 08:00:00 GMT</pubDate><description>&lt;p&gt;你好 &amp;amp; 欢迎&lt;/p&gt;</description></item>'
  + '<item><title>第二篇</title><guid isPermaLink="false">urn:2</guid>'
  + '<content:encoded><![CDATA[<p>富文本 &amp; 段落</p>]]></content:encoded></item>'
  + '</channel></rss>';
t('parseFeed RSS2：标题实体解码 + 摘要剥转义标签', () => {
  const r = parseFeed(RSS2);
  assert.ok(r.ok && r.kind === 'rss');
  assert.strictEqual(r.title, 'A & B 博客');
  assert.strictEqual(r.items.length, 2);
  assert.strictEqual(r.items[0].link, 'https://blog.example.com/1');
  assert.strictEqual(r.items[0].excerpt, '你好 & 欢迎');
  assert.ok(r.items[0].publishedAt > 0);
  assert.strictEqual(r.items[1].excerpt, '富文本 & 段落');
});
t('parseFeed RSS2：guid isPermaLink 兜底 link', () => {
  const r = parseFeed(RSS2);
  assert.strictEqual(r.items[1].guid, 'urn:2');
});

// ── feedparse：Atom / RDF / 错误 ───────────────────────────────────────────
const ATOM = '<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom &amp; 源</title>'
  + '<link rel="alternate" href="https://a.example.com/"/>'
  + '<entry><title>e1</title><id>urn:e1</id><link rel="alternate" href="https://a.example.com/1"/>'
  + '<updated>2025-10-15T08:00:00Z</updated><summary>摘要 &amp; 内容</summary></entry></feed>';
t('parseFeed Atom：alternate link + 标题解码', () => {
  const r = parseFeed(ATOM);
  assert.ok(r.ok && r.kind === 'atom');
  assert.strictEqual(r.title, 'Atom & 源');
  assert.strictEqual(r.items[0].link, 'https://a.example.com/1');
  assert.strictEqual(r.items[0].excerpt, '摘要 & 内容');
  assert.ok(r.items[0].publishedAt > 0);
});
t('parseFeed RDF(RSS1.0)：item 抽取', () => {
  const r = parseFeed('<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">'
    + '<channel><title>RDF 源</title></channel>'
    + '<item><title>r1</title><link>https://r.example.com/1</link></item></rdf:RDF>');
  assert.ok(r.ok && r.items.length === 1 && r.items[0].title === 'r1');
});
t('parseFeed：非 XML 与不支持格式报错', () => {
  assert.ok(parseFeed('纯文本，不是 XML').ok === false);
  assert.ok(parseFeed('<html><body>x</body></html>').ok === false);
  assert.ok(parseFeed('').ok === false);
});

// ── 实体解码链（本轮修复的核心回归）──────────────────────────────────────────
t('decodeEntities：命名实体 + 数字实体 + 二次解码保护', () => {
  assert.strictEqual(lib.decodeEntities('&lt;b&gt; &amp; &quot;x&quot; &#39;y&#39;'), '<b> & "x" \'y\'');
  assert.strictEqual(lib.decodeEntities('&amp;lt;keep&amp;gt;'), '&lt;keep&gt;');
});
t('htmlToPlain：转义写法的标签剥净、比较号保留', () => {
  assert.strictEqual(htmlToPlain('&lt;p&gt;你好 &amp;amp; 欢迎&lt;/p&gt;'), '你好 & 欢迎');
  assert.strictEqual(htmlToPlain('温度 5 &lt; 6 且 7 &gt; 3'), '温度 5 < 6 且 7 > 3');
  assert.strictEqual(htmlToPlain('<p>第一段</p><p>第二段</p>'), '第一段 第二段');
});
t('htmlToText：script/style 剥除 + 转义标签归一', () => {
  const out = htmlToText('<p>正文 &amp; 文本</p><script>evil()</script><style>.x{}</style>&lt;b&gt;加粗&lt;/b&gt;');
  assert.ok(out.includes('正文 & 文本'));
  assert.ok(!/script|evil|\.x\{/.test(out));
  assert.ok(!/[<>]/.test(out));
});

// ── extract.extractReadable ────────────────────────────────────────────────
const LONG_PARA = '这是一段足够长的正文内容，用来验证抽取器对真实文章的切片与纯文本化是否正常工作。'.repeat(8);
t('extractReadable：article 切片 + 标题解码 + 转义标签剥净', () => {
  const page = '<html><head><title>文章 &amp; 标题</title></head><body>'
    + `<article><h1>大标题</h1><p>${LONG_PARA}</p><p>第二段落，含 &lt;b&gt;转义标签&lt;/b&gt;。</p></article>`
    + '<footer>页脚噪音</footer></body></html>';
  const e = extractReadable(page);
  assert.ok(e.ok);
  assert.strictEqual(e.title, '文章 & 标题');
  assert.ok(e.text.includes('大标题'));
  assert.ok(e.text.includes('第二段落'));
  assert.ok(!/[<>]|&lt;|&amp;/.test(e.text));
});
t('extractReadable：空壳页诚实报错', () => {
  const e = extractReadable('<html><body><div id="app"></div></body></html>');
  assert.ok(!e.ok);
});
t('pageTitle：og:title 优先于 <title>', () => {
  assert.strictEqual(pageTitle('<meta property="og:title" content="OG 标题"><title>回退标题</title>'), 'OG 标题');
  assert.strictEqual(pageTitle('<title>回退 &amp; 标题</title>'), '回退 & 标题');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
