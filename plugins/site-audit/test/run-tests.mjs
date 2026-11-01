/**
 * 纯逻辑单测（零依赖）：node test/run-tests.mjs
 * 覆盖：URL 规范化 / robots 解析与最长匹配 / HTML 宽容扫描 / 字符集解码 /
 *       重定向链判定 / 检查项触发与评分 / 选项护栏 / sitemap 解析 / 报告构建
 * 退出码 0 = 全绿。
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = require(path.join(PLUGIN_ROOT, 'shared', 'audit-core.js'));

const results = [];
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

// ── URL 规范化 ───────────────────────────────────────────────────────────────
t('normalize: 小写 host + 去默认端口 + 去 hash', () => {
  const r = core.normalizeUrl('HTTP://Example.COM:80/a/?x=1#frag');
  assert.equal(r.ok, true);
  assert.equal(r.url, 'http://example.com/a/?x=1');
});
t('normalize: https 443 去端口', () => {
  const r = core.normalizeUrl('https://example.com:443/');
  assert.equal(r.url, 'https://example.com/');
});
t('normalize: 相对路径按 base 解析', () => {
  const r = core.normalizeUrl('/a/b', 'https://example.com/x/y');
  assert.equal(r.url, 'https://example.com/a/b');
});
t('normalize: 拒绝 javascript:/mailto: 等协议', () => {
  for (const bad of ['javascript:void(0)', 'mailto:a@b.c', 'data:text/html,x', 'tel:123', 'ftp://x/']) {
    assert.equal(core.normalizeUrl(bad).ok, false, bad);
  }
});
t('normalize: 拒绝带账号密码的 URL（不支持登录页）', () => {
  assert.equal(core.normalizeUrl('https://user:pass@example.com/').ok, false);
});
t('normalize: 尾部 ? 清理', () => {
  assert.equal(core.normalizeUrl('https://example.com/a?').url, 'https://example.com/a');
});
t('isCrawlableHref: 空串/锚点/脚本全拒', () => {
  for (const bad of ['', '#', 'javascript:', '  ', 'tel:1']) assert.equal(core.isCrawlableHref(bad), false, bad);
  assert.equal(core.isCrawlableHref('/ok'), true);
});
t('isMetadataTarget: 云元数据字面量全拦', () => {
  for (const u of ['http://169.254.169.254/latest', 'http://metadata.google.internal/', 'http://100.100.100.200/']) {
    assert.equal(core.isMetadataTarget(u), true, u);
  }
  assert.equal(core.isMetadataTarget('http://example.com/'), false);
});

// ── robots ──────────────────────────────────────────────────────────────────
const ROBOTS = core.parseRobots([
  '# 注释',
  'User-agent: *',
  'Disallow: /private',
  'Allow: /private/ok',
  'Crawl-delay: 1.5',
  'Sitemap: https://x.com/sitemap.xml',
  '',
  'User-agent: BadBot',
  'Disallow: /',
].join('\n'));

t('robots: 基本前缀匹配', () => {
  const r = core.robotsAllows(ROBOTS, 'https://x.com/private/nope');
  assert.equal(r.allowed, false);
  assert.equal(r.rule, '/private');
});
t('robots: 最长匹配 Allow 胜出 Disallow', () => {
  assert.equal(core.robotsAllows(ROBOTS, 'https://x.com/private/ok/more').allowed, true);
  // /private/okyy 同时命中 Allow:/private/ok（更长，胜）与 Disallow:/private → 放行（Google 语义）
  assert.equal(core.robotsAllows(ROBOTS, 'https://x.com/private/okyy').allowed, true);
  // 只命中 Disallow 的路径 → 拒绝
  assert.equal(core.robotsAllows(ROBOTS, 'https://x.com/private/other').allowed, false);
});
t('robots: 未命中规则放行', () => {
  assert.equal(core.robotsAllows(ROBOTS, 'https://x.com/other/page').allowed, true);
});
t('robots: Crawl-delay 解析（秒→毫秒）', () => {
  assert.equal(core.robotsAllows(ROBOTS, 'https://x.com/a').crawlDelayMs, 1500);
});
t('robots: Sitemap 收集', () => {
  assert.deepEqual(ROBOTS.sitemaps, ['https://x.com/sitemap.xml']);
});
t('robots: 专属 UA 组优先于 *', () => {
  const robots = core.parseRobots('User-agent: *\nDisallow: /a\n\nUser-agent: site-audit\nDisallow: /b');
  assert.equal(core.robotsAllows(robots, 'https://x.com/a').allowed, true); // 专属组没有 /a 规则
  assert.equal(core.robotsAllows(robots, 'https://x.com/b').allowed, false);
});
t('robots: 空 Disallow = 全放行', () => {
  const robots = core.parseRobots('User-agent: *\nDisallow:');
  assert.equal(core.robotsAllows(robots, 'https://x.com/anything').allowed, true);
});
t('robots: 通配符与 $ 锚点', () => {
  const robots = core.parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp/*');
  assert.equal(core.robotsAllows(robots, 'https://x.com/files/doc.pdf').allowed, false);
  assert.equal(core.robotsAllows(robots, 'https://x.com/files/doc.pdf?download=1').allowed, true);
  assert.equal(core.robotsAllows(robots, 'https://x.com/tmp/x/1').allowed, false);
});
t('robots: robots=null 放行', () => {
  assert.equal(core.robotsAllows(null, 'https://x.com/').allowed, true);
});

// ── HTML 扫描 ───────────────────────────────────────────────────────────────
t('scan: title/meta/link/img/a 基本抽取 + 大小写 + 单引号', () => {
  const s = core.scanHtml([
    '<!DOCTYPE html>',
    "<HTML LANG='zh-CN'>",
    '<HEAD><TITLE>你好 &amp; 世界</TITLE>',
    '<META NAME="Description" CONTENT="一 段 描述">',
    "<link REL='CANONICAL' href='https://x.com/self'>",
    '</HEAD>',
    "<BODY><A HREF='/a'>内链</A><a href=\"https://ext.com/x\" rel=\"nofollow\">外链</a>",
    '<img src="/1.png"><img src=\'/2.png\' alt="有alt">',
    '<script src="/app.js"></script><link rel="stylesheet" href="/s.css">',
    '<script>var s = "<a href=\'/fake\'>js字符串里的假链接</a>";</script>',
    '<!-- <a href="/comment">注释里的假链接</a> -->',
    '<h1>唯一标题</h1>',
    '</BODY></HTML>',
  ].join('\n'));
  assert.equal(s.title, '你好 & 世界');
  assert.equal(s.description, '一 段 描述');
  assert.equal(s.lang, 'zh-CN');
  assert.equal(s.canonical, 'https://x.com/self');
  assert.equal(s.canonicalCount, 1);
  assert.equal(s.links.length, 2);
  assert.equal(s.links[0].href, '/a');
  assert.equal(s.links[1].nofollow, true);
  assert.deepEqual(s.images.map((i) => i.hasAltAttr), [false, true]);
  assert.equal(s.resources.some((r) => r.url === '/app.js' && r.kind === 'script'), true);
  assert.equal(s.resources.some((r) => r.url === '/s.css' && r.kind === 'style'), true);
  assert.equal(s.h1Count, 1);
  // script/注释内假链接不出现
  assert.equal(s.links.some((l) => l.href === '/fake'), false);
  assert.equal(s.links.some((l) => l.href === '/comment'), false);
});
t('scan: script 体内 < 被抹掉后不干扰', () => {
  const s = core.scanHtml('<body><script>if (a<b) { x("</div>"); }</script><a href="/ok">a</a></body>');
  assert.equal(s.links.length, 1);
});
t('scan: base href 记录；多 canonical 计数', () => {
  const s = core.scanHtml('<head><base href="/sub/"><link rel="canonical" href="/a"><link rel="canonical" href="/b"></head><body>x</body>');
  assert.equal(s.baseHref, '/sub/');
  assert.equal(s.canonicalCount, 2);
  assert.equal(s.canonical, '/a');
});
t('scan: noindex/nofollow 全站 meta 与 meta refresh', () => {
  const s = core.scanHtml('<head><meta name="robots" content="Noindex, NOFOLLOW"><meta http-equiv="refresh" content="5; url=/next"></head>');
  assert.equal(s.noindex, true);
  assert.equal(s.nofollowAll, true);
  assert.equal(s.metaRefreshUrl, '/next');
});
t('scan: charset meta（新旧两种写法）', () => {
  assert.equal(core.scanHtml('<meta charset="GBK">').charsetMeta, 'gbk');
  assert.equal(core.scanHtml('<meta http-equiv="Content-Type" content="text/html; charset=GB2312">').charsetMeta, 'gb2312');
});
t('scan: 无值 alt 属性也算有 alt', () => {
  const s = core.scanHtml('<img src="/a.png" alt="">');
  assert.equal(s.images[0].hasAltAttr, true);
});

// ── 字符集解码 ───────────────────────────────────────────────────────────────
t('decode: gbk 老页面按 header 解码不乱码', () => {
  const iconv = null; // 零依赖：用 Node 内置 TextDecoder（full-icu 默认可用）
  const buf = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]); // GBK「中文」
  const d = core.decodeHtml(buf, 'text/html; charset=GBK');
  assert.equal(d.text, '中文');
});
t('decode: 无 header 时嗅探 meta charset', () => {
  const buf = Buffer.concat([Buffer.from('<meta charset="gbk">'), Buffer.from([0xd6, 0xd0, 0xce, 0xc4])]);
  const d = core.decodeHtml(buf, 'text/html');
  assert.equal(d.text.includes('中文'), true);
});
t('decode: utf-8 兜底', () => {
  const d = core.decodeHtml(Buffer.from('中文', 'utf8'), 'text/html');
  assert.equal(d.text, '中文');
});

// ── 重定向链 ────────────────────────────────────────────────────────────────
t('chain: 两跳计数正确', () => {
  const r = core.evalRedirectChain([
    { url: 'http://a/x', status: 302, location: '/y' },
    { url: 'http://a/y', status: 301, location: '/z' },
    { url: 'http://a/z', status: 200 },
  ], ['a']);
  assert.equal(r.count, 2);
  assert.equal(r.loop, false);
  assert.equal(r.escaped, false);
});
t('chain: 成环检测', () => {
  const r = core.evalRedirectChain([
    { url: 'http://a/x', status: 301, location: '/y' },
    { url: 'http://a/y', status: 301, location: '/x' },
    { url: 'http://a/x', status: 301 },
  ], ['a']);
  assert.equal(r.loop, true);
});
t('chain: 跳离 scope 检测', () => {
  const r = core.evalRedirectChain([
    { url: 'http://a/x', status: 301, location: 'http://b/y' },
    { url: 'http://b/y', status: 200 },
  ], ['a']);
  assert.equal(r.escaped, true);
});

// ── 检查项与评分 ────────────────────────────────────────────────────────────
function mkPage(over) {
  return {
    url: 'http://a/', status: 200, ms: 100, bytes: 1000, contentType: 'text/html; charset=utf-8',
    title: '标题标题标题标题标题', titleLen: 10, description: 'x'.repeat(60), descLen: 60,
    lang: 'zh', h1Count: 1, noindex: false, imgNoAlt: 0, linkCount: 3, mixedRefs: [], hops: [],
    ...over,
  };
}

t('issues: 全健康页零问题满分', () => {
  const { issues, score } = core.buildIssues({ pages: [mkPage({})], options: { scopeHosts: ['a'] } });
  assert.deepEqual(issues, []);
  assert.equal(score, 100);
});
t('issues: 各检查项按预期触发', () => {
  const pages = [
    mkPage({ url: 'http://a/404', status: 404 }),                       // broken_page
    mkPage({ url: 'http://a/slow', ms: 3000 }),                          // slow_page（默认阈值 2000）
    mkPage({ url: 'http://a/notitle', title: '', titleLen: 0, description: null, lang: null, h1Count: 0, imgNoAlt: 2 }), // 一页多错
    mkPage({ url: 'http://a/mixed', mixedRefs: ['http://cdn/x.png'] }),  // mixed_content
    mkPage({ url: 'http://a/loop', hops: [{ url: 'http://a/loop', status: 301, location: '/loop' }, { url: 'http://a/loop', status: 301 }] }), // loop
  ];
  const assets = [{ url: 'http://a/lost.png', kind: 'img', status: 404, ms: 10 }];
  const externals = [{ url: 'http://ext.com/x', status: 500, sources: ['http://a/'] }];
  const { issues } = core.buildIssues({ pages, assets, externals, options: { scopeHosts: ['a'] } });
  const types = Object.fromEntries(issues.map((i) => [i.type, i]));
  assert.ok(types.broken_page, 'broken_page 缺失');
  assert.equal(types.broken_page.count, 1);
  assert.ok(types.broken_asset && types.broken_asset.count === 1);
  assert.ok(types.broken_external && types.broken_external.count === 1);
  assert.ok(types.slow_page && types.slow_page.count === 1);
  assert.ok(types.missing_title && types.missing_description && types.missing_lang && types.h1_issues);
  assert.equal(types.missing_alt.count, 1);
  assert.ok(types.mixed_content && types.mixed_content.count === 1);
  assert.ok(types.redirect_loop && types.redirect_loop.count === 1);
  assert.equal(types.missing_title.severity, 'error');
  assert.equal(types.mixed_content.severity, 'error');
});
t('issues: 404 页不做页面级检查（不双重惩罚）', () => {
  const { issues } = core.buildIssues({
    pages: [mkPage({ url: 'http://a/404', status: 404, title: '', description: null })],
    options: { scopeHosts: ['a'] },
  });
  assert.equal(issues.filter((i) => i.type === 'missing_title').length, 0);
});
t('issues: 重复标题/描述分组', () => {
  const pages = [
    mkPage({ url: 'http://a/1' }),
    mkPage({ url: 'http://a/2', description: 'z'.repeat(60), descLen: 60 }),
    mkPage({ url: 'http://a/3', title: '另一标题另一标题另一标题', titleLen: 12, description: 'y'.repeat(60), descLen: 60 }),
  ];
  const { issues } = core.buildIssues({ pages, options: { scopeHosts: ['a'] } });
  const dup = issues.find((i) => i.type === 'duplicate_title');
  assert.ok(dup);
  assert.equal(dup.count, 1);
  assert.equal(dup.items[0].dupUrls.length, 2);
  assert.equal(issues.some((i) => i.type === 'duplicate_description'), false); // 描述各不相同
});
t('issues: robots_blocked 与 sitemap_gap', () => {
  const { issues } = core.buildIssues({
    pages: [mkPage({ url: 'http://a/' }), mkPage({ url: 'http://a/private', robotsBlocked: true })],
    sitemap: { fetched: true, urls: ['http://a/', 'http://a/orphan'] },
    options: { scopeHosts: ['a'] },
  });
  assert.ok(issues.find((i) => i.type === 'robots_blocked'));
  const gap = issues.find((i) => i.type === 'sitemap_gap');
  assert.ok(gap);
  assert.equal(gap.items.length, 1);
  assert.equal(gap.items[0].url, 'http://a/orphan');
});
t('issues: 重定向链两跳触发 redirect_chain', () => {
  const { issues } = core.buildIssues({
    pages: [mkPage({ url: 'http://a/r1', hops: [{ url: 'http://a/r1', status: 302 }, { url: 'http://a/r2', status: 301 }, { url: 'http://a/ok', status: 200 }] })],
    options: { scopeHosts: ['a'] },
  });
  const chain = issues.find((i) => i.type === 'redirect_chain');
  assert.ok(chain);
  assert.ok(chain.items[0].detail.includes('2 跳'));
});
t('issues: 评分扣减方向正确且有下限', () => {
  const bad = Array.from({ length: 30 }, (_, i) => mkPage({ url: `http://a/404-${i}`, status: 404 }));
  const { score } = core.buildIssues({ pages: bad, options: { scopeHosts: ['a'] } });
  // broken_page cap=10 weight=5 → 最多扣 50
  assert.equal(score, 50);
  const worse = core.buildIssues({
    pages: [...bad, ...Array.from({ length: 30 }, (_, i) => mkPage({ url: `http://a/mix-${i}`, mixedRefs: ['http://x/y'] }))],
    options: { scopeHosts: ['a'] },
  });
  assert.ok(worse.score < score);
  assert.ok(worse.score >= 0);
});
t('issues: 明细截断到 100 条但 count 保留真实值', () => {
  const pages = Array.from({ length: 130 }, (_, i) => mkPage({ url: `http://a/404-${i}`, status: 404 }));
  const { issues } = core.buildIssues({ pages, options: { scopeHosts: ['a'] } });
  const g = issues.find((i) => i.type === 'broken_page');
  assert.equal(g.count, 130);
  assert.equal(g.items.length, 100);
  assert.equal(g.truncated, true);
});

// ── 选项护栏 ────────────────────────────────────────────────────────────────
t('sanitize: 全字段 clamp 到 LIMITS', () => {
  const r = core.sanitizeOptions({ url: 'http://x/', maxPages: 99999, delayMs: -5, timeoutS: 999, concurrency: 100, slowMs: 1, auditTimeoutS: 99999, externalCap: 99999 });
  assert.equal(r.ok, true);
  assert.equal(r.value.options.maxPages, 5000);
  assert.equal(r.value.options.delayMs, 0);
  assert.equal(r.value.options.timeoutS, 30);
  assert.equal(r.value.options.concurrency, 12);
  assert.equal(r.value.options.slowMs, 200);
  assert.equal(r.value.options.auditTimeoutS, 1800);
  assert.equal(r.value.options.externalCap, 2000);
});
t('sanitize: 默认值与布尔语义', () => {
  const r = core.sanitizeOptions({ url: 'http://x/' });
  assert.equal(r.value.options.maxPages, 500);
  assert.equal(r.value.options.respectRobots, true);
  const r2 = core.sanitizeOptions({ url: 'http://x/', respectRobots: false, checkExternal: false });
  assert.equal(r2.value.options.respectRobots, false);
  assert.equal(r2.value.options.checkExternal, false);
});
t('sanitize: 坏 URL 与元数据目标拒绝', () => {
  assert.equal(core.sanitizeOptions({ url: 'not a url' }).ok, false);
  assert.equal(core.sanitizeOptions({ url: '' }).ok, false);
  assert.equal(core.sanitizeOptions({ url: 'http://169.254.169.254/' }).ok, false);
  assert.equal(core.sanitizeOptions({}).ok, false);
});

// ── sitemap ────────────────────────────────────────────────────────────────
t('sitemap: urlset 提取与 index 识别', () => {
  const s = core.parseSitemap('<urlset><url><loc> http://a/1 </loc></url><url><loc>http://a/2</loc></url></urlset>');
  assert.equal(s.kind, 'urlset');
  assert.deepEqual(s.locs, ['http://a/1', 'http://a/2']);
  const idx = core.parseSitemap('<sitemapindex><sitemap><loc>http://a/s1.xml</loc></sitemap></sitemapindex>');
  assert.equal(idx.kind, 'index');
});
t('sitemap: 实体与脏数据', () => {
  const s = core.parseSitemap('<urlset><url><loc>http://a/x?a=1&amp;b=2</loc></url><url><loc>javascript:</loc></url></urlset>');
  assert.deepEqual(s.locs, ['http://a/x?a=1&b=2']);
});

// ── 报告构建与渲染 ──────────────────────────────────────────────────────────
t('buildReport: 完整报告结构与 SPA 疑似标注', () => {
  const rep = core.buildReport({
    auditId: 't1', seed: 'http://a/', scopeHosts: ['a'],
    options: core.sanitizeOptions({ url: 'http://a/' }).value.options,
    pages: [
      mkPage({ linkCount: 0 }),
      mkPage({ url: 'http://a/2', linkCount: 0, title: '第二页标题长度足够哦', titleLen: 10, description: 'y'.repeat(60), descLen: 60 }),
      mkPage({ url: 'http://a/3', linkCount: 0, title: '第三页标题长度也足够哦', titleLen: 11, description: 'z'.repeat(60), descLen: 60 }),
    ],
    assets: [], externals: [], robots: { fetched: true, disallowCount: 2, sitemaps: [] }, sitemap: { fetched: false, urls: [] },
    durationMs: 5000,
  });
  assert.equal(rep.auditId, 't1');
  assert.equal(rep.stats.pagesCrawled, 3);
  assert.equal(rep.stats.spaSuspect, true);
  assert.ok(rep.score.verdict.notes.some((n) => n.includes('JS 渲染')));
  assert.equal(rep.score.verdict.oneLine.includes('100/100'), true);
});
t('renderReportText: 报告文本含关键区块', () => {
  const rep = core.buildReport({
    auditId: 't2', seed: 'http://a/', scopeHosts: ['a'],
    options: core.sanitizeOptions({ url: 'http://a/' }).value.options,
    pages: [mkPage({ url: 'http://a/x', status: 404 }), mkPage({})],
    assets: [{ url: 'http://a/p.png', kind: 'img', status: 404, ms: 5 }],
    externals: [{ url: 'http://ext.com/', status: 503, sources: ['http://a/'] }],
    robots: { fetched: true, disallowCount: 1, sitemaps: [] }, sitemap: { fetched: true, url: 'http://a/s.xml', urls: ['http://a/', 'http://a/orphan'] },
    durationMs: 1200,
  });
  const text = core.renderReportText(rep);
  assert.ok(text.includes('站点体检报告'));
  assert.ok(text.includes('健康分'));
  assert.ok(text.includes('站内页面打不开'));
  assert.ok(text.includes('site_audit_issues'));
  const csv = core.issuesToCsv(rep);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"http://a/x"'));
});

// ── 汇总输出 ────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '  ✔' : '  ✖'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`);
console.log(`\ncore 单测：${results.length - failed.length}/${results.length} 通过`);
if (failed.length) process.exit(1);
