'use strict';
/**
 * run-tests.mjs —— 译舟离线单测（纯函数行为级；零依赖 node:test）
 * 跑法：node --test test/run-tests.mjs
 * 覆盖：core（id/批次/合并幂等/代码段收编/进度/索引/分类/分块/语言/导出）、
 *       抽取器（噪声剥离/分段结构/GBK 字符集/JS 空壳/表格/长文截断）、
 *       SSRF 守卫与 URL 规范化。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');
const ex = require('../shared/extract.js');
const lib = require('../shared/lib.js');
const charset = require('../shared/charset.js');

function articleHtml(body, extraHead = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><title>测试文章标题</title>${extraHead}</head>`
    + `<body><nav><a href="/">首页</a><a href="/a">栏目</a><a href="/b">登录</a></nav>`
    + `<div class="sidebar">广告侧栏推荐内容不要进正文</div>`
    + `<article>${body}</article>`
    + `<footer>版权所有页脚导航</footer></body></html>`;
}

const PARA1 = '这是正文第一段，讲述一个完整的意思，包含标点符号。句子有长有短，但整体足够长，能参与容器打分。';
const PARA2 = 'The second paragraph is written in English and is long enough to take part in the container scoring algorithm like the first one does.';
const LONG_PARA = '长段落。'.repeat(200);

test('core.articleId：稳定且对不同 URL 分散', () => {
  const a = core.articleId('https://example.com/a');
  assert.equal(a, core.articleId('https://example.com/a'));
  assert.equal(a.length, 16);
  assert.notEqual(a, core.articleId('https://example.com/b'));
  assert.equal(core.articleId(''), core.articleId(''));
});

test('core.normalizeSegments：丢空块、段号连续', () => {
  const segs = core.normalizeSegments(['  有内容  ', '', null, '第二段']);
  assert.deepEqual(segs.map((s) => s.i), [0, 1]);
  assert.equal(segs[0].src, '有内容');
  assert.equal(segs[0].dst, '');
});

test('core.planBatches：预算装箱、单段超预算独占、空数组', () => {
  // 预算会被钳到 ≥2000（core 规则），用 2000 与 900 字符段构造跨批
  const segs = core.normalizeSegments(['a'.repeat(900), 'b'.repeat(900), 'c'.repeat(900)]);
  const b = core.planBatches(segs, 2000);
  assert.deepEqual(b.map((x) => [x.start, x.end]), [[0, 2], [2, 3]]);
  const single = core.planBatches(core.normalizeSegments(['x'.repeat(50000)]), 12000);
  assert.deepEqual(single.map((x) => [x.start, x.end]), [[0, 1]]);
  assert.deepEqual(core.planBatches([], 12000), []);
  assert.equal(core.planBatches(segs).length >= 1, true);
});

test('core.mergeTranslations：幂等覆盖、空译文拒收、未命中跳过', () => {
  const segs = core.normalizeSegments(['一', '二', '三']);
  const m1 = core.mergeTranslations(segs, [{ i: 0, dst: ' 甲 ' }, { i: 9, dst: '越界' }, { i: 1, dst: '' }]);
  assert.deepEqual({ applied: m1.applied, invalid: m1.invalid, skipped: m1.skipped }, { applied: 1, invalid: 1, skipped: 1 });
  assert.equal(m1.segs[0].dst, '甲');
  const m2 = core.mergeTranslations(m1.segs, [{ i: 0, dst: '重译' }, { i: 1, dst: '乙' }]);
  assert.deepEqual({ applied: m2.applied, invalid: m2.invalid, skipped: m2.skipped }, { applied: 2, invalid: 0, skipped: 0 });
  assert.equal(m2.segs[0].dst, '重译'); // 后写覆盖（幂等重试不炸）
  assert.equal(core.translatedCount(m2.segs), 2);
});

test('core.autoFillCodeSegs：只填代码段且幂等', () => {
  const segs = core.normalizeSegments(['```js\nconsole.log(1)\n```', '正文', '```\nplain\n```']);
  const n1 = core.autoFillCodeSegs(segs);
  assert.equal(n1, 2);
  assert.equal(segs[0].dst, segs[0].src);
  assert.equal(core.autoFillCodeSegs(segs), 0); // 第二次不再填
  assert.equal(segs[1].dst, ''); // 正文段不受影响
});

test('core.progressPct / isCodeSeg / translatableSegs', () => {
  const segs = core.normalizeSegments(['```x\n1\n```', 'A', 'B', 'C']);
  assert.equal(core.isCodeSeg(segs[0].src), true);
  core.mergeTranslations(segs, [{ i: 1, dst: '甲' }, { i: 2, dst: '乙' }]);
  core.autoFillCodeSegs(segs);
  assert.equal(core.translatedCount(segs), 3);
  assert.equal(core.progressPct(segs), 75); // C 未译
  core.mergeTranslations(segs, [{ i: 3, dst: '丙' }]);
  assert.equal(core.progressPct(segs), 100);
  assert.equal(core.translatableSegs(segs).length, 3);
});

test('core 索引：upsert 置顶、remove、find、idxEntry 归一', () => {
  const e1 = core.idxEntry({ id: 'a', url: 'u1', segCount: 5 });
  const e2 = core.idxEntry({ id: 'b', url: 'u2', segCount: 'x', totalChars: -3 });
  assert.equal(e2.segCount, 0);
  assert.equal(e2.totalChars, 0);
  assert.equal(typeof e2.addedAt, 'string');
  let idx = core.upsertIndex([], e1);
  idx = core.upsertIndex(idx, e2);
  assert.deepEqual(idx.map((x) => x.id), ['b', 'a']);
  idx = core.upsertIndex(idx, core.idxEntry({ id: 'a', url: 'u1', segCount: 7 }));
  assert.deepEqual(idx.map((x) => x.id), ['a', 'b']);
  assert.equal(idx[0].segCount, 7);
  assert.equal(core.findInIndex(idx, 'b').id, 'b');
  assert.equal(core.findInIndex(idx, 'zz'), null);
  idx = core.removeFromIndex(idx, 'a');
  assert.deepEqual(idx.map((x) => x.id), ['b']);
});

test('core.classifyBlock：标题/列表/引用/代码/普通', () => {
  assert.deepEqual([core.classifyBlock('## Hello').kind, core.classifyBlock('## Hello').level, core.classifyBlock('## Hello').body], ['h', 2, 'Hello']);
  assert.equal(core.classifyBlock('- 项目一').kind, 'li');
  assert.equal(core.classifyBlock('> 引用一句').kind, 'quote');
  assert.equal(core.classifyBlock('```\ncode\n```').kind, 'code');
  assert.equal(core.classifyBlock('普通正文').kind, 'para');
  assert.equal(core.classifyBlock('普通正文').body, '普通正文');
});

test('core 分块：splitChunks/assembleSegs 往返一致', () => {
  const segs = core.normalizeSegments(Array.from({ length: 250 }, (_, i) => `段${i}`));
  const map = core.splitChunks(segs);
  assert.deepEqual([...map.keys()], [0, 1, 2]);
  const back = core.assembleSegs([...map.values()].sort((a, b) => b[0].i - a[0].i));
  assert.deepEqual(back.map((s) => s.i), segs.map((s) => s.i));
  assert.equal(core.chunkCount(250), 3);
  assert.equal(core.chunkCount(1), 1);
  assert.equal(core.chunkKey('abc', 2), 'yz.art.abc.p.2');
});

test('core.detectSrcLang：中/英/日/韩', () => {
  assert.equal(core.detectSrcLang(LONG_PARA), 'zh');
  assert.equal(core.detectSrcLang('The quick brown fox jumps over the lazy dog again and again.'), 'en');
  assert.equal(core.detectSrcLang('これは日本語のテキストです。'), 'ja');
  assert.equal(core.detectSrcLang('한국어 텍스트입니다'), 'ko');
});

test('core.bilingualMarkdown：三形态与未译标注', () => {
  const entry = { title: 'T', url: 'https://x/y' };
  const segs = core.normalizeSegments(['## Head', 'Body text', '```c\nint a;\n```']);
  core.mergeTranslations(segs, [{ i: 0, dst: '## 标题' }, { i: 1, dst: '正文内容' }]);
  core.autoFillCodeSegs(segs);
  const bi = core.bilingualMarkdown(entry, segs, 'bilingual');
  assert.match(bi, /## Head/);
  assert.match(bi, /## 标题/);
  assert.match(bi, /int a;/);
  assert.ok(bi.indexOf('Body text') < bi.indexOf('正文内容'));
  const dst = core.bilingualMarkdown(entry, segs, 'dst');
  assert.ok(!dst.includes('Body text'));
  const src = core.bilingualMarkdown(entry, segs, 'src');
  assert.ok(!src.includes('正文内容'));
  const segs2 = core.normalizeSegments(['原文未译段，足够长。']);
  const bi2 = core.bilingualMarkdown(entry, segs2, 'bilingual');
  assert.match(bi2, /〔未翻译〕/);
});

test('core.sanitizeDst：去首尾、压空行、空串拒收', () => {
  assert.equal(core.sanitizeDst('  译文\n\n\n\n续  '), '译文\n\n续');
  assert.equal(core.sanitizeDst('   '), null);
  assert.equal(core.sanitizeDst(null), null);
});

test('extract.extractBlocks：噪声剥离与分段结构', () => {
  const body = `<h1>大标题</h1><p>${PARA1}</p><p>${PARA2}</p><ul><li>列表项一有足够长度通过门槛</li><li>列表项二也有足够长度通过门槛</li></ul><blockquote>引用的话足够长，也要能通过段落门槛才算数。</blockquote>`;
  const r = ex.extractBlocks(articleHtml(body));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.title, '测试文章标题');
  assert.equal(r.blocks[0], '# 大标题');
  assert.match(r.blocks[1], /^这是正文第一段/);
  assert.equal(r.blocks.filter((b) => b.startsWith('- ')).length, 2);
  assert.equal(r.blocks.filter((b) => b.startsWith('> ')).length, 1);
  const segs = core.normalizeSegments(r.blocks);
  assert.ok(segs.length >= 6);
  assert.ok(!r.blocks.some((b) => b.includes('广告侧栏')), '侧栏噪声不得进正文');
  assert.ok(!r.blocks.some((b) => b.includes('页脚导航')), '页脚不得进正文');
  assert.ok(!r.blocks.some((b) => b.includes('登录')), '导航碎屑不得进正文');
});

test('extract.extractBlocks：pre 代码块保留', () => {
  const body = `<p>${PARA1}</p><pre>const x = 1;\nif (x) { console.log(x); }</pre><p>${PARA2}</p>`;
  const r = ex.extractBlocks(articleHtml(body));
  assert.equal(r.ok, true, r.error);
  const code = r.blocks.find((b) => b.startsWith('```'));
  assert.ok(code && code.includes('console.log(x);'));
});

test('extract.extractBlocks：表格行保 ｜ 分隔', () => {
  const body = `<p>${PARA1}</p><table><tr><th>名称</th><th>数量</th></tr><tr><td>苹果</td><td>3</td></tr></table><p>${PARA2}</p>`;
  const r = ex.extractBlocks(articleHtml(body));
  assert.equal(r.ok, true, r.error);
  assert.ok(r.blocks.some((b) => b.includes('名称 ｜ 数量')), `实际块：${JSON.stringify(r.blocks)}`);
});

test('extract.extractBlocks：GBK 页面（meta 声明）不乱码', () => {
  // 两段不同正文（相邻重复段会被去重——琥珀语义）；合计有效字符过 MIN_VALID(80)
  const GBK1 = 'D5-E2-CA-C7-D2-BB-C6-AA-D6-D0-CE-C4-B2-E2-CA-D4-CE-C4-D5-C2-A3-AC-D3-C3-D3-DA-D1-E9-D6-A4-D7-D6-B7-FB-BC-AF-CC-BD-B2-E2-D3-EB-D5-FD-CE-C4-B3-E9-C8-A1-B9-A6-C4-DC-CA-C7-B7-F1-D5-FD-B3-A3-B9-A4-D7-F7-A1-A3-D5-E2-D2-BB-B6-CE-D0-E8-D2-AA-D7-E3-B9-BB-B5-C4-B3-A4-B6-C8-B2-C5-C4-DC-CD-A8-B9-FD-D7-EE-B5-CD-D3-D0-D0-A7-D7-D6-B7-FB-CA-FD-C3-C5-BC-F7-A3-AC-CB-F9-D2-D4-D4-D9-B2-B9-B3-E4-D2-BB-D0-A9-CE-C4-D7-D6-C8-C3-C4-DA-C8-DD-B1-E4-B5-C3-B8-FC-B3-A4-D2-BB-D0-A9-A1-A3'.replaceAll('-', '');
  const GBK2 = 'B5-DA-B6-FE-B6-CE-BB-BB-B8-F6-CB-B5-B7-A8-A3-BA-BC-D2-CD-A5-D7-D4-B2-E2-B5-C4-BD-A1-BF-B5-CA-FD-BE-DD-D3-A6-B8-C3-C1-F4-D4-DA-D7-D4-BC-BA-CA-D6-C0-EF-A3-AC-B7-AD-D2-EB-B9-FD-C0-B4-B5-C4-CD-E2-CE-C4-D7-CA-C1-CF-D2-B2-D2-BB-D1-F9-D6-B5-B5-C3-B4-E6-BD-F8-B1-BE-B5-D8-B5-C4-CA-E9-BC-DC-A1-A3'.replaceAll('-', '');
  const html = Buffer.concat([
    Buffer.from('<html><head><meta charset="gb2312"><title>t</title></head><body><article><p>', 'latin1'),
    Buffer.from(GBK1, 'hex'),
    Buffer.from('</p><p>', 'latin1'),
    Buffer.from(GBK2, 'hex'),
    Buffer.from('</p></article></body></html>', 'latin1'),
  ]);
  const dec = charset.decodeBuffer(html, 'text/html');
  assert.equal(dec.charset, 'gb18030');
  const r = ex.extractBlocks(dec.text);
  assert.equal(r.ok, true, r.error);
  assert.ok(r.blocks[0].includes('中文测试文章'), `实际：${r.blocks[0]}`);
  assert.ok(r.blocks[1].includes('家庭自测'), `实际：${r.blocks[1]}`);
});

test('extract.extractBlocks：JS 空壳如实报错', () => {
  const r = ex.extractBlocks('<html><head><title>spa</title></head><body><div id="root"></div></body></html>');
  assert.equal(r.ok, false);
  assert.match(r.error, /空壳|正文/);
});

test('extract.extractBlocks：长文截断如实标注', () => {
  // 100 段 × ~800 字 ≈ 8 万字符 > TEXT_CAP(60000)，必须触发截断
  const body = Array.from({ length: 100 }, (_, i) => `<p>第${i}段：${LONG_PARA}</p>`).join('');
  const r = ex.extractBlocks(articleHtml(body));
  assert.equal(r.ok, true);
  assert.equal(r.truncated, true);
  // 截断口径 = 块内容总长（不含 join 分隔符）
  const content = r.blocks.reduce((n, b) => n + b.length, 0);
  assert.ok(content <= lib.TEXT_CAP, `截断后内容总长 ${content} 应 ≤ ${lib.TEXT_CAP}`);
});

test('charset.decodeBuffer：BOM 与响应头声明', () => {
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('中文内容', 'utf8')]);
  assert.equal(charset.decodeBuffer(bom, '').charset, 'utf-8');
  const gbk = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]);
  assert.equal(charset.decodeBuffer(gbk, 'text/html; charset=GBK').charset, 'gb18030');
});

test('lib.isFetchableUrl：SSRF 守卫', () => {
  const good = ['https://example.com/a', 'http://example.com:8080/x', 'https://sub.domain.example.org/'];
  const bad = [
    'http://localhost/x', 'http://localhost:8080', 'http://a.localhost/', 'http://host.local/',
    'http://svc.internal/', 'http://127.0.0.1/', 'http://127.0.0.2:3000/', 'http://10.0.0.1/',
    'http://192.168.1.5/', 'http://172.16.0.9/', 'http://172.31.255.1/', 'http://169.254.169.254/latest/meta-data/',
    'http://0.0.0.0/', 'file:///etc/passwd', 'ftp://example.com/', 'javascript:alert(1)',
    'http://300.1.1.1/', 'http://[::1]/',
  ];
  for (const u of good) assert.equal(lib.isFetchableUrl(u), true, u);
  for (const u of bad) assert.equal(lib.isFetchableUrl(u), false, u);
});

test('lib.normalizeUrl：补协议与拒绝', () => {
  assert.equal(lib.normalizeUrl('example.com/a').url, 'https://example.com/a');
  assert.ok(lib.normalizeUrl('').error);
  assert.ok(lib.normalizeUrl('gopher://x/').error);
  assert.ok(lib.normalizeUrl(`https://e.com/${'a'.repeat(3000)}`).error);
});

test('core.clampInt：脏输入回落', () => {
  assert.equal(core.clampInt('7', 0, 10, 3), 7);
  assert.equal(core.clampInt('abc', 0, 10, 3), 3);
  assert.equal(core.clampInt(-5, 0, 10, 3), 0);
  assert.equal(core.clampInt(99, 0, 10, 3), 10);
});
