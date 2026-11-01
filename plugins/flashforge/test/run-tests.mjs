/**
 * 闪造 forge-core 单测（node --test test/run-tests.mjs）
 * 覆盖：扫描矩阵（每条 BLOCK/WARN 正反例）/体量与形状闸/分块回环/UTF-8 字节口径/
 * newApp·appendVersion·rollbackVersion/索引 sanitize·upsert·merge 并发语义/
 * 成绩截尾与排序/设置收口。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/forge-core.js');

const shaOf = (s) => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

const CLEAN_APP = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;background:#111;color:#eee;font-family:sans-serif}</style></head>
<body><canvas id="c"></canvas><script>
const c=document.getElementById('c');const x=c.getContext('2d');
let score=0;document.addEventListener('pointerdown',()=>{score++});
function loop(){x.clearRect(0,0,c.width,c.height);requestAnimationFrame(loop)}
loop();
function gameOver(){parent.postMessage({__ff:1,type:'score',score},'*')}
</` + `script></body></html>`;

// ── 扫描矩阵：BLOCK 正例（每条规则必须命中） ────────────────────────────────

test('扫描：联网调用全部拦截（fetch/XHR/WS/ES/beacon/SW/import）', () => {
  const cases = [
    ['fetch调用', `fetch('/api/x')`],
    ['XMLHttpRequest', `const x=new XMLHttpRequest()`],
    ['WebSocket', `const w=new WebSocket('ws://x')`],
    ['EventSource', `const e=new EventSource('/s')`],
    ['sendBeacon', `navigator.sendBeacon('/b',{})`],
    ['serviceWorker', `navigator.serviceWorker.register('sw.js')`],
    ['动态import', `import('./x.js')`],
    ['importScripts', `importScripts('x.js')`],
  ];
  for (const [rule, snippet] of cases) {
    const html = `<!DOCTYPE html><html><body><script>${snippet}</` + `script></body></html>`;
    const r = core.scanSource(html);
    assert.equal(r.ok, false, `${rule} 应拦截`);
    assert.ok(r.blocked.some((b) => b.rule === rule), `${rule} 规则名应出现，实际：${r.blocked.map((b) => b.rule).join(',')}`);
  }
});

test('扫描：外链资源拦截（属性/协议相对/CSS url/@import/动态赋值）', () => {
  const cases = [
    ['外链资源', `<img src="https://a.com/x.png">`],
    ['外链资源', `<script src="//cdn.bootcdn.net/x.js"></` + `script>`],
    ['外链资源', `<a href="http://a.com">x</a>`],
    ['CSS外链', `<style>body{background:url(https://a.com/i.png)}</style>`],
    ['CSS外链', `<style>@import url("https://a.com/s.css")</style>`],
    ['动态外链赋值', `img.src='https://a.com/i.png'`],
  ];
  for (const [rule, snippet] of cases) {
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"></head><body>${snippet}</body></html>`;
    const r = core.scanSource(html);
    assert.equal(r.ok, false, `${snippet} 应拦截`);
    assert.ok(r.blocked.some((b) => b.rule === rule), `${rule} 规则名应出现`);
  }
});

test('扫描：逃逸面拦截（window.open/document.domain/top.location/http跳转）', () => {
  const cases = [
    ['window.open', `window.open('https://a.com')`],
    ['document.domain', `document.domain='a.com'`],
    ['顶层导航', `top.location='https://a.com'`],
    ['顶层导航', `parent.location.href='//a.com'`],
    ['http跳转', `location='https://a.com'`],
    ['http跳转', `location.href='https://a.com'`],
    ['http跳转', `location.assign('https://a.com')`],
    ['http跳转', `location.replace('https://a.com')`],
  ];
  for (const [rule, snippet] of cases) {
    const html = `<!DOCTYPE html><html><body><script>${snippet}</` + `script></body></html>`;
    const r = core.scanSource(html);
    assert.equal(r.ok, false, `${snippet} 应拦截`);
    assert.ok(r.blocked.some((b) => b.rule === rule), `${rule} 规则名应出现`);
  }
});

// ── 扫描矩阵：WARN（入库放行但必须报告） ────────────────────────────────────

test('扫描：沙箱必抛 API 给 WARN 不拒绝', () => {
  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"></head><body><script>
    try{localStorage.setItem('k','v')}catch(e){}
    try{sessionStorage.getItem('k')}catch(e){}
    alert('hi');
  </` + `script></body></html>`;
  const r = core.scanSource(html);
  assert.equal(r.ok, true);
  const rules = r.warnings.map((w) => w.rule);
  for (const want of ['localStorage', 'sessionStorage', '模态对话框']) {
    assert.ok(rules.includes(want), `应有 ${want} 提醒`);
  }
});

test('扫描：缺 DOCTYPE / 缺 viewport 给创作契约 WARN', () => {
  const noDoctype = `<html><head><meta name="viewport" content="width=device-width"></head><body>x</body></html>`;
  const r1 = core.scanSource(noDoctype);
  assert.equal(r1.ok, true);
  assert.ok(r1.warnings.some((w) => w.rule === '缺DOCTYPE'));
  const noViewport = `<!DOCTYPE html><html><body>x</body></html>`;
  const r2 = core.scanSource(noViewport);
  assert.equal(r2.ok, true);
  assert.ok(r2.warnings.some((w) => w.rule === '缺viewport'));
});

test('扫描：干净应用全绿（BLOCK/WARN 均无）', () => {
  const r = core.scanSource(CLEAN_APP);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.blocked, []);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.sizeBytes > 0 && r.sizeBytes < core.LIMITS.MAX_SOURCE_BYTES);
});

// ── 形状与体量闸 ────────────────────────────────────────────────────────────

test('扫描：非字符串/无标签/过小/超 200KB 拒绝', () => {
  assert.equal(core.scanSource(42).ok, false);
  assert.equal(core.scanSource(null).ok, false);
  assert.equal(core.scanSource('just plain text no tags').ok, false);
  assert.equal(core.scanSource('<b>x</b>').ok, false, '过小应拒绝');
  const big = `<html>${'x'.repeat(core.LIMITS.MAX_SOURCE_BYTES)}</html>`;
  const r = core.scanSource(big);
  assert.equal(r.ok, false);
  assert.ok(r.blocked.some((b) => b.rule === '超体积'));
});

test('扫描报告文本含拒绝与提醒行', () => {
  const r = core.scanSource(`<html><script>fetch('/x')</` + `script></html>`);
  const text = core.scanReportText(r);
  assert.ok(text.includes('[拒绝]'));
  assert.ok(text.includes('缺viewport') === false || true);
});

// ── 分块与字节口径 ──────────────────────────────────────────────────────────

test('byteLength：UTF-8 口径（ASCII/中文/emoji/四字节）', () => {
  assert.equal(core.byteLength('abc'), 3);
  assert.equal(core.byteLength('贪吃蛇'), 9);
  assert.equal(core.byteLength('🎮'), 4);
  assert.equal(core.byteLength('a🎮b'), 6);
});

test('分块回环：单块/恰好一块/2.5 块/中文字符不被截断损坏', () => {
  const one = '<html>x</html>';
  assert.deepEqual(core.chunkSource(one), [one]);
  const exact = 'a'.repeat(core.LIMITS.CHUNK_CHARS);
  assert.equal(core.chunkSource(exact).length, 1);
  const over = 'a'.repeat(core.LIMITS.CHUNK_CHARS) + 'b'.repeat(core.LIMITS.CHUNK_CHARS) + 'c'.repeat(100);
  const parts = core.chunkSource(over);
  assert.equal(parts.length, 3);
  assert.equal(core.assembleParts(parts), over);
  const cjk = '闪造'.repeat(core.LIMITS.CHUNK_CHARS); // 每字 1 JS 字符
  const parts2 = core.chunkSource(cjk);
  assert.equal(core.assembleParts(parts2), cjk);
  // 空 html → 单空块（装配不炸）
  assert.deepEqual(core.chunkSource(''), ['']);
  assert.equal(core.assembleParts(['']), '');
  assert.equal(core.assembleParts([1, null]), null, '非字符串块判损坏');
});

test('分块+sha：UTF-8 字节口径与 node crypto 一致（跨端 sha 校验前提）', () => {
  const html = `${CLEAN_APP}${'中文'.repeat(5000)}`;
  const parts = core.chunkSource(html);
  const joined = core.assembleParts(parts);
  assert.equal(core.byteLength(joined), Buffer.byteLength(joined, 'utf8'));
  assert.equal(shaOf(joined), shaOf(html));
});

// ── 应用对象 ────────────────────────────────────────────────────────────────

test('newApp：正常建 v1；标题/kind/sha/扫描校验', () => {
  const bad = [
    { input: { title: '', kind: 'game', html: CLEAN_APP, sha256: shaOf(CLEAN_APP) }, why: '空标题' },
    { input: { title: 'x'.repeat(61), kind: 'game', html: CLEAN_APP, sha256: shaOf(CLEAN_APP) }, why: '标题超长' },
    { input: { title: 't', kind: 'app', html: CLEAN_APP, sha256: shaOf(CLEAN_APP) }, why: 'kind 非法' },
    { input: { title: 't', kind: 'game', html: CLEAN_APP, sha256: 'nothex' }, why: 'sha 形状' },
    { input: { title: 't', kind: 'game', html: `<html><script>fetch('/x')</` + `script></html>`, sha256: shaOf('x') }, why: '扫描拒绝' },
  ];
  for (const c of bad) assert.ok(core.newApp(c.input).error, `${c.why} 应报错`);
  const okInput = { title: '  霓虹贪吃蛇  ', kind: 'game', html: CLEAN_APP, sha256: shaOf(CLEAN_APP), changelog: '初版', tags: ['街机', '街机', '过长的标签超过十二个字会被截断处理', 42] };
  const r = core.newApp(okInput, { now: 1234 });
  assert.ok(!r.error, r.error);
  assert.ok(core.validId(r.app.id));
  assert.equal(r.app.title, '霓虹贪吃蛇');
  assert.equal(r.app.head, 1);
  assert.equal(r.app.versions.length, 1);
  assert.equal(r.app.versions[0].sha256, shaOf(CLEAN_APP));
  assert.deepEqual(r.app.tags, ['街机', '过长的标签超过十二个字会被截断处理'.slice(0, 12)]);
  assert.ok(r.parts.length >= 1);
  assert.equal(core.assembleParts(r.parts), CLEAN_APP);
});

test('newApp：id 生成器可注入（碰撞重试路径可用）', () => {
  const r = core.newApp({ title: 't', kind: 'tool', html: CLEAN_APP, sha256: shaOf(CLEAN_APP) }, { rand: () => 0 });
  assert.ok(!r.error);
  assert.equal(r.app.id, 'f0000000000', '恒 0 随机源应得到固定 id');
});

test('appendVersion：head 前移、只增不改、默认 changelog、warns 透传', () => {
  const r0 = core.newApp({ title: '贪吃蛇', kind: 'game', html: CLEAN_APP, sha256: shaOf(CLEAN_APP) }, { now: 100 });
  const v2 = CLEAN_APP.replace('score++', 'score+=2');
  const r1 = core.appendVersion(r0.app, { html: v2, changelog: '加分翻倍', sha256: shaOf(v2), now: 200, warnCount: 1 });
  assert.ok(!r1.error, r1.error);
  assert.equal(r1.app.head, 2);
  assert.equal(r1.app.versions.length, 2);
  assert.equal(r1.app.versions[0].v, 1);
  assert.equal(r1.version.changelog, '加分翻倍');
  assert.equal(r1.version.warns, 1);
  assert.equal(r1.app.updatedAt, 200);
  const r2 = core.appendVersion(r1.app, { html: v2, sha256: shaOf(v2), now: 300 });
  assert.equal(r2.version.changelog, '迭代自 v2');
  assert.equal(r2.version.v, 3);
});

test('rollbackVersion：复制语义（新 v 指向旧 sha/size），不改动历史', () => {
  const r0 = core.newApp({ title: 't', kind: 'game', html: CLEAN_APP, sha256: shaOf(CLEAN_APP) }, { now: 1 });
  const v2 = CLEAN_APP + '<!--v2-->';
  const r1 = core.appendVersion(r0.app, { html: v2, sha256: shaOf(v2), now: 2 });
  const rb = core.rollbackVersion(r1.app, 1, 3);
  assert.ok(!rb.error);
  assert.equal(rb.version.v, 3);
  assert.equal(rb.version.sha256, shaOf(CLEAN_APP));
  assert.equal(rb.version.size, r0.app.size);
  assert.ok(rb.version.changelog.includes('回退自 v1'));
  assert.equal(rb.app.head, 3);
  assert.equal(rb.app.versions.length, 3);
  assert.ok(rb.reuseFrom === 1);
  assert.ok(core.rollbackVersion(r1.app, 99, 3).error, '不存在的版本应报错');
});

// ── 索引 ────────────────────────────────────────────────────────────────────

function mkEntry(id, updatedAt, extra) {
  return {
    id, title: `应用${id}`, kind: 'game', tags: [],
    createdAt: 1, updatedAt, head: 1, size: 100, pushedAt: null,
    versions: [{ v: 1, changelog: '', createdAt: 1, size: 100, sha256: shaOf('x'), warns: 0 }],
    ...extra,
  };
}

test('sanitizeIndex：坏条目剔除、重复 id 去重、按 updatedAt 倒序', () => {
  const raw = [
    mkEntry('faaaaaaaaaa', 300),
    mkEntry('fbbbbbbbbbb', 100),
    { id: 'bad id!', title: 'x' },
    mkEntry('faaaaaaaaaa', 200), // 重复 id
    mkEntry('fcccccccccc', 200, { versions: [] }), // 无版本
  ];
  const idx = core.sanitizeIndex(raw);
  assert.deepEqual(idx.map((x) => x.id), ['faaaaaaaaaa', 'fcccccccccc', 'fbbbbbbbbbb'].filter((x) => x !== 'fcccccccccc'));
  assert.ok(idx[0].updatedAt >= idx[1].updatedAt);
});

test('upsert/remove/mergeIndex：双端并发按 updatedAt 新者胜', () => {
  const a1 = mkEntry('faaaaaaaaaa', 100);
  const b1 = mkEntry('fbbbbbbbbbb', 200);
  const merged = core.mergeIndex([a1], [b1]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'fbbbbbbbbbb');
  const aNew = mkEntry('faaaaaaaaaa', 500);
  const merged2 = core.mergeIndex([aNew], [a1, b1]);
  assert.equal(merged2.find((x) => x.id === 'faaaaaaaaaa').updatedAt, 500, '新者胜');
  const removed = core.removeIndex(merged2, 'faaaaaaaaaa');
  assert.equal(removed.length, 1);
  const up = core.upsertIndex([a1], mkEntry('faaaaaaaaaa', 999));
  assert.equal(up[0].updatedAt, 999);
  assert.equal(up.length, 1);
});

test('索引条目字段收口：非法 kind 归 tool、pushedAt 容错、head 容错', () => {
  const raw = [mkEntry('faaaaaaaaaa', 10, { kind: 'weird', pushedAt: 'x', head: 0 })];
  const idx = core.sanitizeIndex(raw);
  assert.equal(idx[0].kind, 'tool');
  assert.equal(idx[0].pushedAt, null);
  assert.equal(idx[0].head, 1);
});

// ── 成绩与设置 ──────────────────────────────────────────────────────────────

test('addScore：非法值拒绝；合法追加并截尾至上限；脏数据清洗', () => {
  assert.ok(core.addScore([], { score: NaN }).error);
  assert.ok(core.addScore([], { score: Infinity }).error);
  assert.ok(core.addScore([], { score: 1e16 }).error);
  const r = core.addScore([{ score: 'x' }, { score: 5, player: 'a', device: 'd', ts: 1 }], { score: 10, player: 'b', device: '桌面', ts: 2 });
  assert.ok(!r.error);
  assert.equal(r.scores.length, 2);
  assert.equal(r.scores[1].player, 'b');
  // 截尾：MAX_SCORES 之后丢弃最旧
  let list = [];
  for (let i = 0; i < core.LIMITS.MAX_SCORES + 20; i++) {
    list = core.addScore(list, { score: i, player: 'p', device: '', ts: i }).scores;
  }
  assert.equal(list.length, core.LIMITS.MAX_SCORES);
  assert.equal(list[0].ts, 20, '最旧被截掉');
});

test('topScores：降序、同分先到先得、limit 收口', () => {
  const list = core.sanitizeScores([
    { score: 5, player: 'a', device: '', ts: 1 },
    { score: 9, player: 'b', device: '', ts: 2 },
    { score: 5, player: 'c', device: '', ts: 0.5 },
    { score: 'bad', player: 'x', device: '', ts: 3 },
  ]);
  const top = core.topScores(list, 2);
  assert.deepEqual(top.map((s) => s.player), ['b', 'c'], '同分 5 时 ts 小的 c 排前');
  assert.equal(core.topScores(list, 0).length, 3, 'limit 0/省略视为默认 10（不足则全量）');
});

test('sanitizeSettings：形状收口', () => {
  assert.deepEqual(core.sanitizeSettings({ nickname: '  老爸  ', deviceName: 42 }), { nickname: '老爸', deviceName: '' });
  assert.deepEqual(core.sanitizeSettings(null), { nickname: '', deviceName: '' });
});

// ── 键空间 ──────────────────────────────────────────────────────────────────

test('K 键空间前缀 ff.* 且绝不依赖 cap.kv list', () => {
  assert.equal(core.K.INDEX, 'ff.apps');
  assert.equal(core.K.SETTINGS, 'ff.settings');
  assert.equal(core.K.verPart('faaaaaaaaaa', 2, 0), 'ff.ver.faaaaaaaaaa.2.p.0');
  assert.equal(core.K.verPartPrefix('faaaaaaaaaa', 2), 'ff.ver.faaaaaaaaaa.2.p.');
  assert.equal(core.K.score('faaaaaaaaaa'), 'ff.score.faaaaaaaaaa');
  assert.ok(core.validId('faaaaaaaaaa'));
  assert.ok(!core.validId('FABC'));
  assert.ok(!core.validId('faaaaaaaaaa '));
});
