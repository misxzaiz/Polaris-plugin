/**
 * 离线单元测试（node test/run-tests.mjs，不需要 Polaris 在跑）
 *
 * 覆盖 service/lib.js 全部纯逻辑：URL 识别、SSRF 守卫、条目规范化、
 * enrich 回写合并、设置夹取、保留策略（条数/天数/置顶永留）、HTML 元数据抽取。
 */
import assert from 'node:assert/strict';
import lib from '../service/lib.js';

const results = [];
const record = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};
const t = (name, fn) => {
  try { fn(); record(name, true); } catch (e) { record(name, false, e.message); }
};

// ── detectKind ─────────────────────────────────────────────────────────────
t('detectKind: 纯 URL 识别为链接', () => {
  assert.equal(lib.detectKind('https://github.com/misxzaiz/Polaris'), 'url');
  assert.equal(lib.detectKind('  http://example.com/a?b=1#c  '), 'url');
});
t('detectKind: 混合文本/空串/非 http 判为文本', () => {
  assert.equal(lib.detectKind('看这个 https://example.com 很不错'), 'text');
  assert.equal(lib.detectKind(''), 'text');
  assert.equal(lib.detectKind('ftp://example.com/f'), 'text');
  assert.equal(lib.detectKind('普通文本'), 'text');
});

// ── isFetchableUrl（SSRF 守卫）──────────────────────────────────────────────
t('isFetchableUrl: 公网 http(s) 放行', () => {
  assert.equal(lib.isFetchableUrl('https://github.com/x'), true);
  assert.equal(lib.isFetchableUrl('http://example.com'), true);
});
t('isFetchableUrl: 环回/内网/链路本地/元数据端口全拒', () => {
  for (const u of [
    'http://localhost:9829/x', 'http://127.0.0.1/x', 'http://127.3.4.5/x',
    'http://10.0.0.1/x', 'http://192.168.1.2/x', 'http://172.16.0.1/x', 'http://172.31.9.9/x',
    'http://169.254.169.254/latest/meta-data', 'http://0.0.0.0/x',
    'file:///etc/passwd', 'javascript:alert(1)', 'ftp://example.com', 'not a url',
  ]) {
    assert.equal(lib.isFetchableUrl(u), false, u);
  }
});
t('isFetchableUrl: 172.32 等边界放行', () => {
  assert.equal(lib.isFetchableUrl('http://172.32.0.1/x'), true);
  assert.equal(lib.isFetchableUrl('http://8.8.8.8/x'), true);
});

// ── normalizeItem ──────────────────────────────────────────────────────────
t('normalizeItem: 正常文本与 URL 条目', () => {
  const a = lib.normalizeItem({ text: '你好世界', from: '桌面', id: 'iabc12345678' });
  assert.equal(a.error, undefined);
  assert.equal(a.item.kind, 'text');
  assert.equal(a.item.from, '桌面');
  assert.equal(a.item.enriched, false);
  const b = lib.normalizeItem({ text: 'https://example.com', from: 'AI', id: 'ibcd12345678' });
  assert.equal(b.item.kind, 'url');
  assert.equal(b.item.url, 'https://example.com');
});
t('normalizeItem: 空内容拒、超长拒、from 截断', () => {
  assert.match(lib.normalizeItem({ text: '   ' }).error, /内容为空/);
  assert.match(lib.normalizeItem({ text: 'x'.repeat(8001) }).error, /过长/);
  const r = lib.normalizeItem({ text: 'ok', from: 'x'.repeat(100), id: 'ixyz12345678' });
  assert.equal(r.item.from.length, 24);
});
t('normalizeItem: 非法 id 被替换生成', () => {
  const r = lib.normalizeItem({ text: 'ok', id: '../evil', from: '桌面' });
  assert.match(r.item.id, /^i[a-z0-9]+$/);
});

// ── applyEnrich ────────────────────────────────────────────────────────────
t('applyEnrich: 白名单回写 + enriched 置位', () => {
  const it = lib.normalizeItem({ text: 'https://example.com', from: 'AI', id: 'ienr12345678' }).item;
  const out = lib.applyEnrich(it, { title: 'T'.repeat(500), desc: 'D', fail: undefined });
  assert.equal(out.enriched, true);
  assert.equal(out.title.length, 300);
  assert.equal(out.desc, 'D');
  const bad = lib.applyEnrich(it, { fail: 'HTTP 404' });
  assert.equal(bad.enriched, true);
  assert.equal(bad.enrichFail, 'HTTP 404');
});

// ── normalizeSettings ──────────────────────────────────────────────────────
t('normalizeSettings: 越界夹取 + 脏数据回落默认', () => {
  assert.deepEqual(lib.normalizeSettings({ maxItems: 1, retentionDays: 9999, urlEnrich: 'no' }), {
    maxItems: 20, retentionDays: 365, sweepMs: 600000, urlEnrich: true,
  });
  assert.deepEqual(lib.normalizeSettings('junk'), lib.normalizeSettings(null));
  assert.equal(lib.normalizeSettings({ urlEnrich: false }).urlEnrich, false);
});

// ── planRetention ──────────────────────────────────────────────────────────
const NOW = 1700000000000;
const mk = (id, ageDays, pinned = false) => ({ id, createdAt: NOW - ageDays * 86400000, pinned });
t('planRetention: 超天数未置顶删除、置顶永留', () => {
  const del = lib.planRetention([mk('a', 1), mk('b', 30), mk('c', 30, true), mk('d', 100, true)], { retentionDays: 14 }, NOW);
  assert.deepEqual(del, ['b']);
});
t('planRetention: 超条数删最旧，置顶不占名额', () => {
  const items = [];
  for (let i = 0; i < 30; i++) items.push(mk(`n${i}`, 1));
  items.push(mk('p1', 100, true)); // 很老但置顶 → 永留且不占名额
  // maxItems 未传 → 默认 100？不，normalizeSettings 默认 100 不会裁 30 条；显式传 20（clamp 下限）
  const del = lib.planRetention(items, { maxItems: 20 }, NOW);
  assert.equal(del.length, 10);
  assert.deepEqual(del, ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9']);
  assert.equal(del.includes('p1'), false);
});
t('planRetention: 无需清理时空名单 + 脏数据容错', () => {
  assert.deepEqual(lib.planRetention([mk('a', 1)], {}, NOW), []);
  assert.deepEqual(lib.planRetention(null, null, NOW), []);
  assert.deepEqual(lib.planRetention([null, {}, { id: 'x' }], { maxItems: 5 }, NOW), []);
});

// ── extractMeta / decodeEntities ───────────────────────────────────────────
t('extractMeta: og:title 优先、title 兜底、og:description', () => {
  const html = '<html><head><title>兜底标题</title><meta property="og:title" content="OG 标题"><meta property="og:description" content="OG 摘要"></head></html>';
  assert.deepEqual(lib.extractMeta(html), { title: 'OG 标题', desc: 'OG 摘要' });
  const html2 = '<html><head><title>  只有 title </title></head></html>';
  assert.equal(lib.extractMeta(html2).title, '只有 title');
});
t('extractMeta: 属性顺序颠倒与实体解码', () => {
  const html = '<meta content="A&amp;B &#39;q&#39;" property="og:title"><meta name="description" content="d&quot;d">';
  const m = lib.extractMeta(html);
  assert.equal(m.title, "A&B 'q'");
  assert.equal(m.desc, 'd"d');
});
t('extractMeta: 无元数据/超大页面安全', () => {
  assert.deepEqual(lib.extractMeta(''), { title: '', desc: '' });
  assert.deepEqual(lib.extractMeta('<html>'.repeat(500000)).title, '');
});
t('decodeEntities: 数字实体', () => {
  assert.equal(lib.decodeEntities('&#20013;&#25991;'), '中文');
});

// 汇总
const bad = results.filter((r) => !r.pass);
console.log(`\n[lib] 结果：${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
