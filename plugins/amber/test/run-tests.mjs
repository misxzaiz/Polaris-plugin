#!/usr/bin/env node
'use strict';
/**
 * 琥珀离线单测（零依赖，node >= 18）：node test/run-tests.mjs
 * 覆盖：sha256 向量 / SSRF 门卫 / URL 规范化与稳定 id / 标签规范化 /
 *       条目规范化与封存层积 / 清扫计划 / HTML 解析 / 字符集探测（BOM/头/meta+GBK 字节向量）/
 *       打分容器抽取（标题列表引用代码表格/噪声抑制/兜底链/JS 空壳）/ 元数据 /
 *       BM25 检索与摘要
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const assert = require('node:assert');
const { sha256Hex } = require('../shared/sha256');
const lib = require('../service/lib');
const html = require('../service/html');
const charset = require('../service/charset');
const extract = require('../service/extract');
const searcher = require('../service/searcher');

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
  assert.strictEqual(lib.isFetchableUrl('https://example.com/post/1'), true);
  assert.strictEqual(lib.isFetchableUrl('http://example.com/post'), true);
});
t('URL 门卫：内网/环回/云元数据/非 http 拒绝', () => {
  for (const u of [
    'http://127.0.0.1/post', 'http://localhost/post', 'http://192.168.1.2/post',
    'http://10.0.0.1/post', 'http://172.16.0.1/post', 'http://169.254.169.254/latest',
    'file:///etc/passwd', 'ftp://example.com/x', 'javascript:alert(1)',
  ]) assert.strictEqual(lib.isFetchableUrl(u), false, u);
});

// ── lib.normalizeUrl / itemIdFor ───────────────────────────────────────────
t('normalizeUrl：裸域名补 https、trim、非法拒绝', () => {
  assert.strictEqual(lib.normalizeUrl('  example.com/post ').url, 'https://example.com/post');
  assert.ok(lib.normalizeUrl('').error);
  assert.ok(lib.normalizeUrl('x'.repeat(900)).error);
  assert.ok(lib.normalizeUrl('not a url//\\').error || lib.normalizeUrl(':::').error);
});
t('itemIdFor：同 URL 稳定、异 URL 不同、大小写敏感（路径语义）', () => {
  assert.strictEqual(lib.itemIdFor('https://a.com/X'), lib.itemIdFor(' https://a.com/X '));
  assert.notStrictEqual(lib.itemIdFor('https://a.com/X'), lib.itemIdFor('https://a.com/x'));
  assert.ok(lib.itemIdFor('https://a.com/x').startsWith('b'));
  assert.strictEqual(lib.itemIdFor('https://a.com/x').length, 13);
});

// ── lib.normalizeTags ──────────────────────────────────────────────────────
t('normalizeTags：字符串/数组收、去重、上限、空项丢', () => {
  assert.deepStrictEqual(lib.normalizeTags('技术, AI，，技术； 琥珀 '), ['技术', 'AI', '琥珀']);
  assert.deepStrictEqual(lib.normalizeTags(['a', 'b', 'a', '']), ['a', 'b']);
  assert.strictEqual(lib.normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, lib.MAX_TAGS);
});

// ── lib.normalizeItem ──────────────────────────────────────────────────────
t('normalizeItem：缺载荷/空 URL/内网拒绝', () => {
  assert.ok(lib.normalizeItem(null).error);
  assert.ok(lib.normalizeItem({ url: '' }).error);
  assert.ok(lib.normalizeItem({ url: 'http://127.0.0.1/x' }).error);
});
t('normalizeItem：默认 pending、host 归一、tags 生效', () => {
  const r = lib.normalizeItem({ url: 'Example.COM/Post/1', tags: '技术,琥珀' }).item;
  assert.strictEqual(r.url, 'https://Example.COM/Post/1');
  assert.strictEqual(r.host, 'example.com');
  assert.strictEqual(r.status, 'pending');
  assert.deepStrictEqual(r.tags, ['技术', '琥珀']);
  assert.strictEqual(r.sealCount, 0);
  assert.ok(r.createdAt > 0);
});
t('normalizeItem：existing 保留用户状态与 rev，不重置封存计数', () => {
  const prev = { id: 'bX', url: 'https://e.com/p', title: '旧题', star: true, read: true, tags: ['a'], status: 'ok', sealCount: 2, firstSealedAt: 111, sealedAt: 222, rev: 9, createdAt: 50 };
  const r = lib.normalizeItem({ url: 'https://e.com/p', title: '新题' }, prev).item;
  assert.strictEqual(r.star, true);
  assert.strictEqual(r.read, true);
  assert.deepStrictEqual(r.tags, ['a']);
  assert.strictEqual(r.sealCount, 2);
  assert.strictEqual(r.firstSealedAt, 111);
  assert.strictEqual(r.rev, 9);
  assert.strictEqual(r.title, '新题');
});
t('normalizeItem：raw.tags 未传时保留 existing tags', () => {
  const prev = { id: 'bX', url: 'https://e.com/p', tags: ['keep'], rev: 1 };
  const r = lib.normalizeItem({ url: 'https://e.com/p' }, prev).item;
  assert.deepStrictEqual(r.tags, ['keep']);
});

// ── lib.applySealResult（层积语义）──────────────────────────────────────────
t('applySealResult：成功 = sealCount+1、首封时间永留、rev+1', () => {
  const prev = { id: 'bX', url: 'https://e.com/p', title: '旧题', star: true, read: true, status: 'ok', sealCount: 2, firstSealedAt: 111, sealedAt: 222, rev: 3 };
  const now = 999;
  const r = lib.applySealResult(prev, { ok: true, title: '新题', wordCount: 500, excerpt: '摘要', publishedAt: 123 }, now);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.sealCount, 3);
  assert.strictEqual(r.firstSealedAt, 111);
  assert.strictEqual(r.sealedAt, now);
  assert.strictEqual(r.wordCount, 500);
  assert.strictEqual(r.rev, 4);
  assert.strictEqual(r.star, true); // 用户状态不重置
});
t('applySealResult：失败不动旧快照（sealCount/sealedAt 保留）、status=error', () => {
  const prev = { id: 'bX', url: 'https://e.com/p', status: 'ok', sealCount: 2, firstSealedAt: 111, sealedAt: 222, rev: 3 };
  const r = lib.applySealResult(prev, { ok: false, error: 'HTTP 500' }, 999);
  assert.strictEqual(r.status, 'error');
  assert.strictEqual(r.error, 'HTTP 500');
  assert.strictEqual(r.sealCount, 2);
  assert.strictEqual(r.sealedAt, 222);
  assert.strictEqual(r.rev, 4);
});
t('applySealResult：从未封存成功过的失败不产生假封存时间', () => {
  const prev = { id: 'bX', url: 'https://e.com/p', status: 'pending', sealCount: 0, sealedAt: 0 };
  const r = lib.applySealResult(prev, { ok: false, error: 'x' }, 999);
  assert.strictEqual(r.sealedAt, 0);
});

// ── lib.excerptOf ──────────────────────────────────────────────────────────
t('excerptOf：跳过标题行取首个有效段落；全短行拼接', () => {
  assert.strictEqual(lib.excerptOf('# 大标题\n\n这是第一个足够长的段落内容，用来做摘要展示与列表展示使用。'), '这是第一个足够长的段落内容，用来做摘要展示与列表展示使用。');
  assert.strictEqual(lib.excerptOf('- 短\n- 也短'), '短 也短');
  assert.strictEqual(lib.excerptOf(''), '');
});

// ── lib.normalizeSettings / planSweep ──────────────────────────────────────
t('settings：默认关清扫；越界回落', () => {
  const s = lib.normalizeSettings(null);
  assert.strictEqual(s.sweepEnabled, false);
  assert.strictEqual(lib.normalizeSettings({ keepDays: 1 }).keepDays, 7);
  assert.strictEqual(lib.normalizeSettings({ maxItems: 99999 }).maxItems, 5000);
});
t('planSweep：默认永不清理', () => {
  const items = [{ id: 'a', star: false, sealedAt: 1 }];
  assert.deepStrictEqual(lib.planSweep(items, lib.normalizeSettings(null), Date.now()), []);
});
t('planSweep：keepDays 清旧、星标豁免、maxItems 删最旧', () => {
  const now = Date.now();
  const s = lib.normalizeSettings({ sweepEnabled: true, keepDays: 30, maxItems: 2 });
  const items = [
    { id: 'old', star: false, sealedAt: now - 40 * 86400000 },
    { id: 'oldstar', star: true, sealedAt: now - 400 * 86400000 },
    { id: 'new1', star: false, sealedAt: now - 1 * 86400000 },
    { id: 'new2', star: false, sealedAt: now - 2 * 86400000 },
    { id: 'new3', star: false, sealedAt: now - 3 * 86400000 },
  ];
  const del = lib.planSweep(items, s, now);
  assert.ok(del.includes('old'));
  assert.ok(!del.includes('oldstar')); // 星标永豁免
  assert.ok(del.includes('new3'));     // 超额删最旧
  assert.ok(!del.includes('new1') && !del.includes('new2'));
});

// ── html 解析 ───────────────────────────────────────────────────────────────
t('parseHtml：嵌套/未闭合容错/文本保留', () => {
  const root = html.parseHtml('<div><p>第一段</p><p>第二段');
  const text = html.textContent(root);
  assert.ok(text.includes('第一段') && text.includes('第二段'));
});
t('parseHtml：script/style 内容丢弃、title 保留、注释丢弃', () => {
  const root = html.parseHtml('<title>页面题</title> <script>var x=1;</script> <style>.a{}</style><!-- 注释 --><p>正文</p>');
  assert.strictEqual(html.normalizeText(html.textContent(root)), '页面题 正文');
});
t('parseHtml：实体解码（命名+数字+双转义顺序）', () => {
  const root = html.parseHtml('<p>a &amp; b &lt;tag&gt; &#20013;</p>');
  assert.ok(html.textContent(root).includes('a & b <tag> 中'));
});

// ── charset ────────────────────────────────────────────────────────────────
t('charset：UTF-8 BOM 与无声明默认', () => {
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('琥珀')]);
  assert.strictEqual(charset.decodeBuffer(bom, '').text, '琥珀');
  assert.strictEqual(charset.decodeBuffer(Buffer.from('琥珀'), 'text/html').text, '琥珀');
});
t('charset：UTF-16LE/BE BOM', () => {
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('琥珀', 'utf16le')]);
  assert.strictEqual(charset.decodeBuffer(le, '').text, '琥珀');
  const leSwapped = Buffer.from('琥珀', 'utf16le'); leSwapped.swap16();
  const be = Buffer.concat([Buffer.from([0xfe, 0xff]), leSwapped]);
  assert.strictEqual(charset.decodeBuffer(be, '').text, '琥珀');
});
t('charset：响应头 charset 优先于 meta', () => {
  const buf = Buffer.from('<html><head><meta charset="utf-8"></head><body>ok</body></html>');
  assert.strictEqual(charset.decodeBuffer(buf, 'text/html; charset=GBK').charset, 'gb18030');
});
t('charset：meta gb2312 → gb18030 解码（手工 GBK 字节向量）', () => {
  // "中文内容测试" 的 GBK 字节
  const gbkBytes = Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0xc4, 0xda, 0xc8, 0xdd, 0xb2, 0xe2, 0xca, 0xd4]);
  const buf = Buffer.concat([
    Buffer.from('<html><head><meta charset="gb2312"></head><body><p>', 'latin1'),
    gbkBytes,
    Buffer.from('</p></body></html>', 'latin1'),
  ]);
  const r = charset.decodeBuffer(buf, '');
  assert.strictEqual(r.charset, 'gb18030');
  assert.ok(r.text.includes('中文内容测试'), r.text);
});
t('charset：未知标签回落 utf-8 不抛错', () => {
  const r = charset.decodeBuffer(Buffer.from('ok'), 'text/html; charset=nonexistent-936');
  assert.strictEqual(r.text, 'ok');
  assert.strictEqual(r.charset, 'utf-8');
});

// ── extract ────────────────────────────────────────────────────────────────
const TYPICAL = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta property="og:title" content="深入理解琥珀化">
<meta name="author" content="张三">
<meta property="article:published_time" content="2026-10-01T08:00:00Z">
<meta property="og:image" content="https://cdn.example.com/cover.jpg">
<title>深入理解琥珀化 - 示例站</title>
</head><body>
<nav><a href="/home">首页</a><a href="/tags">标签</a><a href="/about">关于</a></nav>
<article>
  <h1>深入理解琥珀化</h1>
  <div class="byline">张三 · 2026-10-01</div>
  <p>琥珀化是把网页封存为永久快照的过程。它需要抓取、解码、抽取三个步骤，缺一不可，任何一步出错都会让收藏变成乱码或碎片。</p>
  <p>抽取器要做候选容器的打分。段落越长、标点越多，分数越高；链接密度会被惩罚；噪声 class 直接熄灭。</p>
  <h2>为什么打分</h2>
  <p>因为硬切片会混进导航和推荐位。收藏库抽错容器就永久封错，所以宁可慢一点也要准，这是琥珀的底线。</p>
  <ul><li>第一，保住标题</li><li>第二，保住列表</li><li>第三，保住引用</li></ul>
  <blockquote>好的收藏是第二次阅读的开始。</blockquote>
  <pre>const x = seal(url)</pre>
  <table><tr><th>方案</th><th>成本</th></tr><tr><td>打分</td><td>低</td></tr></table>
  <div class="related-posts"><p><a href="/a">推荐一</a> <a href="/b">推荐二</a></p></div>
  <p>总之，琥珀化的核心是"宁准勿全"，这句话值得记住。</p>
</article>
<aside class="sidebar"><a href="/c">侧栏一</a><a href="/d">侧栏二</a></aside>
<footer>版权所有 示例站</footer>
</body></html>`;

t('extract：典型文章页——元数据四件套', () => {
  const r = extract.extractArticle(TYPICAL);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.title, '深入理解琥珀化'); // og:title 压过 <title>
  assert.strictEqual(r.byline, '张三');
  assert.ok(r.publishedAt > 0);
  assert.strictEqual(r.img, 'https://cdn.example.com/cover.jpg');
});
t('extract：典型文章页——Markdown-lite 结构保留', () => {
  const r = extract.extractArticle(TYPICAL);
  assert.ok(r.text.includes('# 深入理解琥珀化'), r.text.slice(0, 200));
  assert.ok(r.text.includes('## 为什么打分'));
  assert.ok(r.text.includes('- 第一，保住标题'));
  assert.ok(r.text.includes('> 好的收藏是第二次阅读的开始'));
  assert.ok(r.text.includes('const x = seal(url)'));
  assert.ok(r.text.includes('方案 ｜ 成本'));
  assert.ok(r.text.includes('宁准勿全'));
  assert.ok(r.wordCount > 100);
});
t('extract：噪声抑制——导航/侧栏/推荐/页脚不入正文', () => {
  const r = extract.extractArticle(TYPICAL);
  assert.ok(!r.text.includes('首页'));
  assert.ok(!r.text.includes('侧栏一'));
  assert.ok(!r.text.includes('推荐一'));
  assert.ok(!r.text.includes('版权所有'));
});
t('extract：<time datetime> 兜底发布时间', () => {
  const doc = '<html><body><article><h1>t</h1><p>这是一段足够长的正文内容，用来验证时间兜底逻辑是否正常工作。段落必须有足够的长度，才能越过打分器的最短段落阈值，进入候选容器的记分阶段，最终让文章主体被正确选中并抽取出来。</p><p>再来一段补充文字，让全文长度稳稳超过有效阈值，避免被误判为空壳页面，这样才能专注验证时间元素的兜底解析是否生效。</p><time datetime="2026-09-15T10:00:00Z">2026-09-15</time></article></body></html>';
  const r = extract.extractArticle(doc);
  assert.ok(r.ok && r.publishedAt > 0, JSON.stringify(r).slice(0, 200));
});
t('extract：脏时间（未来 >7 天）判 0', () => {
  assert.strictEqual(extract.parseTime('2099-01-01T00:00:00Z'), 0);
  assert.strictEqual(extract.parseTime('垃圾'), 0);
  assert.ok(extract.parseTime('2026-10-01T08:00:00Z') > 0);
});
t('extract：短文走硬切片兜底仍可抽出', () => {
  const doc = '<html><body><article><p>这是一篇很短的文章，只有两段话。第一段讲琥珀化的兜底路径设计原则：评分容器结果不可信时退回硬切片。</p><p>第二段补足长度，让总字数稳稳越过有效线，避免被误判成空壳页面，从而验证 article 硬切片兜底路径真的生效。</p></article><div class="promo"><a>广告位</a></div></body></html>';
  const r = extract.extractArticle(doc);
  assert.ok(r.ok, r.error);
  assert.ok(r.text.includes('兜底路径设计'));
  assert.ok(!r.text.includes('广告位'));
});
t('extract：JS 渲染空壳如实报错', () => {
  const r = extract.extractArticle('<html><head><title>App</title></head><body><div id="root"></div></body></html>');
  assert.ok(!r.ok && /空壳/.test(r.error));
});
t('extract：空响应报错', () => {
  assert.ok(!extract.extractArticle('').ok);
  assert.ok(!extract.extractArticle('   ').ok);
});

// ── searcher ───────────────────────────────────────────────────────────────
t('tokenize：CJK bigram + latin 整词 + 单字 latin 丢', () => {
  const toks = searcher.tokenize('琥珀化 Amber12 a');
  assert.ok(toks.includes('琥珀') && toks.includes('珀化'));
  assert.ok(toks.includes('amber12'));
  assert.ok(!toks.includes('a'));
});
t('search：相关度排序 + 无命中空 + snippet 上下文', () => {
  const docs = [
    searcher.buildDoc('d1', { title: '数据库索引原理', excerpt: '讲 B+ 树', text: '数据库索引是加速查询的数据结构。B+ 树把磁盘读放大降到最低，是数据库索引的主流实现。' }),
    searcher.buildDoc('d2', { title: '琥珀使用指南', excerpt: '', text: '琥珀是网页封藏工具。把网页封存成快照，日后全文检索。' }),
    searcher.buildDoc('d3', { title: '漫谈缓存', excerpt: '', text: '缓存失效是计算机科学两大难题之一。' }),
  ];
  const hits = searcher.search(docs, '数据库索引', { limit: 10 });
  assert.ok(hits.length >= 1);
  assert.strictEqual(hits[0].id, 'd1');
  assert.ok(hits[0].snippet.includes('数据库索引'), hits[0].snippet);
  assert.strictEqual(searcher.search(docs, '量子纠缠完全不存在于此').length, 0);
});
t('search：标题字段权重高于正文', () => {
  const docs = [
    searcher.buildDoc('a', { title: '无关', excerpt: '', text: '顺带提了一句琥珀。'.repeat(5) + '琥珀只是脚注。' }),
    searcher.buildDoc('b', { title: '琥珀专论', excerpt: '', text: '本文的主题就是琥珀本身，通篇围绕琥珀展开。' }),
  ];
  const hits = searcher.search(docs, '琥珀', { limit: 10 });
  assert.strictEqual(hits[0].id, 'b');
});
t('search：中文多词查询分词命中', () => {
  const docs = [searcher.buildDoc('x', { title: 't', excerpt: '', text: '字符集探测是琥珀化的第一道工序，gb18030 老页面也能正确解码。' })];
  const hits = searcher.search(docs, '字符集 解码', { limit: 5 });
  assert.strictEqual(hits.length, 1);
});

// ── lib 杂项 ───────────────────────────────────────────────────────────────
t('decodeEntities：&amp; 最后解（防双转义二次解码）', () => {
  assert.strictEqual(lib.decodeEntities('&amp;lt;'), '&lt;');
  assert.strictEqual(lib.decodeEntities('&lt;b&gt;'), '<b>');
});
t('clip：trim + decode + cap', () => {
  assert.strictEqual(lib.clip('  x  ', 10), 'x');
  assert.strictEqual(lib.clip('a&nbsp;b', 10), 'a b');
  assert.strictEqual(lib.clip('abcdef', 3), 'abc');
});
t('oneLine：折叠空白 + 截断加省略号', () => {
  assert.strictEqual(lib.oneLine('a  b\n c', 10), 'a b c');
  assert.strictEqual(lib.oneLine('abcdef', 3), 'abc…');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
