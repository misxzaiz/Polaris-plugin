/**
 * 离线单测（node test/run-tests.mjs）—— dig-core 纯函数直测。
 * 服务引擎的 tick/命令循环由真实桥冒烟覆盖（smoke-real.mjs）。
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const core = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'dig-core.js'));

const results = [];
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

// ── 哈希 ────────────────────────────────────────────────────────────────────
t('hashKey: 确定性 + 16 位 hex', () => {
  const a = core.hashKey('https://example.com/');
  const b = core.hashKey('https://example.com/');
  assert.strictEqual(a, b);
  assert.ok(/^[0-9a-f]{16}$/.test(a));
  assert.notStrictEqual(a, core.hashKey('https://example.com/x'));
});

// ── URL 规范化 ──────────────────────────────────────────────────────────────
t('normalize: 去跟踪参数/碎片/尾斜杠/大写host/默认端口', () => {
  const r = core.normalizeUrl('https://EXAMPLE.com:443/docs/Guide/?utm_source=x&fbclid=abc&id=2#top/');
  assert.strictEqual(r.url, 'https://example.com/docs/Guide?id=2');
  assert.strictEqual(r.normKey, 'https://example.com/docs/Guide?id=2');
});
t('normalize: query 参数排序后可比', () => {
  const a = core.normalizeUrl('https://x.com/?b=1&a=2');
  const b = core.normalizeUrl('https://x.com/?a=2&b=1');
  assert.strictEqual(a.normKey, b.normKey);
});
t('normalize: http 默认 80 端口归一', () => {
  assert.strictEqual(core.normalizeUrl('http://x.com:80/').normKey, 'http://x.com/');
});
t('normalize: 拒绝非 http(s) 与非法', () => {
  assert.ok(core.normalizeUrl('ftp://x.com/').error);
  assert.ok(core.normalizeUrl('javascript:alert(1)').error);
  assert.ok(core.normalizeUrl('').error);
});
t('normalize: 保留非常规端口', () => {
  assert.strictEqual(core.normalizeUrl('https://x.com:8443/p').normKey, 'https://x.com:8443/p');
});

// ── Netscape 解析 ───────────────────────────────────────────────────────────
const NETSCAPE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1690000000" LAST_MODIFIED="1700000000">开发</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1690000000">前端</H3>
        <DL><p>
            <DT><A HREF="https://react.dev/" ADD_DATE="1690000100" ICON="data:image/png;base64,AAAA">React 文档 &amp; 指南</A>
            <DT><A HREF="http://localhost:3000/dev" ADD_DATE="1690000200">本地调试</A>
        </DL><p>
        <DT><A HREF="https://github.com/facebook/react" ADD_DATE="1690000300">React 仓库</A>
    </DL><p>
    <DT><A HREF="https://example.com?a=1" ADD_DATE="1690000400">示例</A>
    <DT><A HREF="javascript:void(0)">坏条目</A>
</DL><p>`;

t('parse: 嵌套文件夹/标题实体/秒级时间戳/ICON 忽略', () => {
  const { records, skipped } = core.parseNetscapeHtml(NETSCAPE);
  assert.strictEqual(skipped, 1); // javascript: 跳过
  assert.strictEqual(records.length, 4); // localhost 也是合法导入（检查时由 SSRF 守卫标 blocked）
  const react = records.find((r) => r.url === 'https://react.dev/');
  assert.strictEqual(react.title, 'React 文档 & 指南');
  assert.strictEqual(react.folder, '开发 / 前端');
  assert.strictEqual(react.addedAt, 1690000100000);
  const gh = records.find((r) => r.url.includes('github.com'));
  assert.strictEqual(gh.folder, '开发');
});
t('parse: 空输入返回空', () => {
  assert.deepStrictEqual(core.parseNetscapeHtml('').records, []);
  assert.deepStrictEqual(core.parseNetscapeHtml('<p>not html</p>').records, []);
});

// ── 记录与合并 ──────────────────────────────────────────────────────────────
const NOW = 1700000000000;
t('merge: 去重 + 保早 addedAt + 长标题优先 + 标签并集', () => {
  const existing = [core.makeRecord({ url: 'https://x.com/a?utm_source=z', title: '短', addedAt: 1600000000000, tags: ['代码'] }, NOW)];
  const incoming = [
    { url: 'https://x.com/a', title: '更长的标题哦', addedAt: 1500000000000, tags: ['代码', '必读'], folder: '新文件夹' },
    { url: 'https://x.com/new', title: '新条目', addedAt: 1550000000000 },
    { url: 'ftp://bad', title: '无效' },
  ];
  const m = core.mergeRecords(existing, incoming, NOW);
  assert.strictEqual(m.invalid, 1);
  assert.strictEqual(m.added, 1);
  assert.strictEqual(m.updated, 1);
  assert.strictEqual(m.duplicateIds.length, 1);
  const kept = m.toUpsert.find((r) => r.normKey === 'https://x.com/a');
  assert.strictEqual(kept.addedAt, 1500000000000);   // 保早
  assert.strictEqual(kept.title, '更长的标题哦');      // 长标题
  assert.strictEqual(kept.folder, '新文件夹');         // folder 补缺
  assert.deepStrictEqual([...kept.tags].sort(), ['代码', '必读']); // 按码点排序
});
t('merge: 全新导入 added 计数', () => {
  const m = core.mergeRecords([], [{ url: 'https://a.com/' }, { url: 'https://b.com/' }], NOW);
  assert.strictEqual(m.added, 2);
  assert.strictEqual(m.toUpsert.length, 2);
});

// ── 检查计划 ────────────────────────────────────────────────────────────────
function rec(id, over) {
  return core.makeRecord({ url: `https://s${id}.com/`, title: id, addedAt: NOW }, NOW) && {
    ...{ id, url: `https://s${id}.com/`, normKey: `https://s${id}.com/`, host: `s${id}.com`, title: id, folder: '', addedAt: NOW, importedAt: NOW, source: 't', tags: [], status: 'pending', lastCheckedAt: 0, lastOkAt: 0, lastVisitAt: 0, lastResurfaceAt: 0, httpStatus: 0, finalUrl: '', latencyMs: 0, failReason: '', tries: 0 },
    ...over,
  };
}
t('planCheckQueue: 未检查优先（按导入序），再按最久未查', () => {
  const recs = [
    rec('a', { lastCheckedAt: 100 }), rec('b', { lastCheckedAt: 300 }), rec('c'), rec('d'),
  ];
  // c,d 从未检查；importedAt 同 → 保持稳定序；未检查在前
  const q = core.planCheckQueue(recs, { limit: 3 });
  assert.deepStrictEqual(q, ['c', 'd', 'a']); // a 比 b 更久未查
});
t('planCheckQueue: deadOnly 只选死链且 tries<5', () => {
  const recs = [rec('a', { status: 'dead4xx', lastCheckedAt: 1 }), rec('b', { status: 'ok', lastCheckedAt: 1 }), rec('c', { status: 'dns', lastCheckedAt: 1, tries: 5 })];
  const q = core.planCheckQueue(recs, { limit: 10, deadOnly: true });
  assert.deepStrictEqual(q, ['a']);
});

// ── SSRF 守卫 ───────────────────────────────────────────────────────────────
t('isFetchableUrl: 放行公网', () => {
  for (const u of ['https://example.com/', 'http://8.8.8.8/x', 'https://github.com/a/b', 'http://93.184.216.34/']) {
    assert.ok(core.isFetchableUrl(u), u);
  }
});
t('isFetchableUrl: 拒绝环回/内网/链路本地/CGNAT/元数据/伪协议/凭证', () => {
  const deny = [
    'http://127.0.0.1:8080/', 'http://10.0.0.1/', 'http://172.16.0.1/', 'http://172.31.255.1/',
    'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/', 'http://0.0.0.0/',
    'http://100.64.0.1/', 'http://localhost/', 'http://foo.local/', 'https://x.internal/',
    'file:///C:/x', 'javascript:void(0)', 'ftp://x.com/', 'http://user:pass@x.com/',
    'http://[::1]/', 'http://[fc00::1]/', 'http://[fe80::1]/',
  ];
  for (const u of deny) assert.ok(!core.isFetchableUrl(u), `应拒绝 ${u}`);
});

// ── HTTP 分类 ───────────────────────────────────────────────────────────────
t('classifyHttp: 2xx/重定向/4xx/5xx', () => {
  assert.strictEqual(core.classifyHttp(200), 'ok');
  assert.strictEqual(core.classifyHttp(200, { redirected: true }), 'redirect');
  assert.strictEqual(core.classifyHttp(301, { redirected: true }), 'redirect');
  assert.strictEqual(core.classifyHttp(404), 'dead4xx');
  assert.strictEqual(core.classifyHttp(500), 'dead5xx');
});

// ── 统计与搜索 ──────────────────────────────────────────────────────────────
t('rollup: 计数/重复/死链域名排序', () => {
  const recs = [
    rec('a', { status: 'ok', normKey: 'k1', url: 'https://github.com/a', host: 'github.com' }),
    rec('b', { status: 'dead4xx', normKey: 'k2', url: 'https://old.blog/x', host: 'old.blog' }),
    rec('c', { status: 'dns', normKey: 'k3', url: 'https://old.blog/y', host: 'old.blog' }),
    rec('d', { normKey: 'k1', url: 'https://github.com/a', host: 'github.com' }), // 重复
  ];
  const roll = core.rollup(recs);
  assert.strictEqual(roll.total, 4);
  assert.strictEqual(roll.alive, 1);
  assert.strictEqual(roll.dead, 2);
  assert.strictEqual(roll.pending, 1);
  assert.strictEqual(roll.duplicates, 1);
  assert.strictEqual(roll.topDeadDomains[0].host, 'old.blog');
  assert.strictEqual(roll.topDeadDomains[0].count, 2);
});
t('searchRecords: 查询/状态/域名/分类过滤', () => {
  const recs = [
    rec('a', { title: 'Rust Book', url: 'https://doc.rust-lang.org/book/', normKey: 'k1', host: 'doc.rust-lang.org' }),
    rec('b', { title: 'Rust 死链', url: 'https://rust.example.org/', normKey: 'k2', status: 'dead4xx', host: 'rust.example.org' }),
    rec('c', { title: 'Java', url: 'https://java.com/', normKey: 'k3', host: 'java.com' }),
  ];
  assert.strictEqual(core.searchRecords(recs, 'rust', {}).length, 2);
  assert.strictEqual(core.searchRecords(recs, '', { status: 'dead' }).length, 1);
  assert.strictEqual(core.searchRecords(recs, '', { domain: 'rust-lang' }).length, 1);
  assert.strictEqual(core.searchRecords(recs, '', { category: '代码仓库' }).length, 0);
});

// ── 复活选点 ────────────────────────────────────────────────────────────────
t('pickResurface: 只从活书签挑 + avoid 生效 + 空池 null', () => {
  const rng = { random: () => 0.5 };
  const now = 1700000000000;
  const alive1 = rec('a', { status: 'ok', importedAt: now - 400 * 86400000 });
  const alive2 = rec('b', { status: 'redirect', importedAt: now - 10 * 86400000 });
  const dead = rec('c', { status: 'dead4xx' });
  const pick = core.pickResurface([alive1, alive2, dead], { rng, now });
  assert.strictEqual(pick.id, 'a'); // 沉睡更久 × 书龄加权
  const pick2 = core.pickResurface([alive1, alive2], { rng, now, avoidIds: ['a'] });
  assert.strictEqual(pick2.id, 'b');
  assert.strictEqual(core.pickResurface([dead], { rng, now }), null);
  assert.strictEqual(core.pickResurface([], { rng, now }), null);
});

// ── 导出与设置 ──────────────────────────────────────────────────────────────
t('toCsv: 转义引号 + BOM', () => {
  const csv = core.toCsv([rec('a', { title: '含"引号"' })]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('""引号""'));
});
t('normalizeSettings: 钳位与默认', () => {
  const s = core.normalizeSettings({ batchSize: 99999, concurrency: 0, timeoutMs: 1, recheckDays: -5 });
  assert.strictEqual(s.batchSize, 2000);
  assert.strictEqual(s.concurrency, 1);
  assert.strictEqual(s.timeoutMs, 3000);
  assert.strictEqual(s.recheckDays, 0);
  assert.strictEqual(core.normalizeSettings(null).autoCheckOnImport, true);
});
t('chunkRecords: 分块尺寸', () => {
  const items = Array.from({ length: 450 }, (_, i) => ({ id: String(i) }));
  const chunks = core.chunkRecords(items);
  assert.deepStrictEqual(chunks.map((c) => c.items.length), [200, 200, 50]);
  assert.deepStrictEqual(chunks.map((c) => c.n), [0, 1, 2]);
});
t('classifyUrl: 域名启发式', () => {
  assert.strictEqual(core.classifyUrl('https://github.com/facebook/react'), '代码仓库');
  assert.strictEqual(core.classifyUrl('https://developer.mozilla.org/x'), '文档');
  assert.strictEqual(core.classifyUrl('https://arxiv.org/abs/1234'), '论文');
  assert.strictEqual(core.classifyUrl('https://whatever.example.org/'), '其他');
});

const bad = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ' — ' + r.detail}`);
console.log(`\n${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
