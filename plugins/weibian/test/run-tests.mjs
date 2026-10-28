/**
 * 韦编 core 离线单测（node test/run-tests.mjs）
 * tokenize（CJK bigram+unigram / ASCII≥2 / mixed）/ BM25 排名 / snippet 高亮 /
 * pathRules（默认排除/隐藏/大小/白名单/containsPath）/ normalizeSettings / parseQuery。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

// ── 扩展名 ───────────────────────────────────────────────────────────────────
test('extOf/classifyExt：大小写归一与白名单', () => {
  assert.equal(core.extOf('a.MD'), 'md');
  assert.equal(core.extOf('noext'), '');
  assert.equal(core.extOf('.gitignore'), ''); // 点开头文件按无扩展名处理（不入索引）
  assert.equal(core.classifyExt('docx'), 'docx');
  assert.equal(core.classifyExt('md'), 'text');
  assert.equal(core.classifyExt('py'), 'code');
  assert.equal(core.classifyExt('log'), null);
  assert.equal(core.classifyExt('exe'), null);
});

// ── 设置归一 ─────────────────────────────────────────────────────────────────
test('normalizeSettings：默认值/钳制/roots 清洗', () => {
  const s = core.normalizeSettings(null);
  assert.equal(s.maxDocs, 5000);
  assert.equal(s.maxFileBytes, 20 * 1024 * 1024);
  assert.deepEqual(s.roots, []);
  const s2 = core.normalizeSettings({
    roots: ['D:\\notes', 'D:/notes/', 'relative/path', 'D:\\other', 42],
    maxDocs: 999999,
    maxFileMB: 0,
    includeHidden: 'yes',
    enabled: false,
  });
  // D:\notes 与 D:/notes/ 同路径去重；相对路径剔除；非字符串剔除
  assert.equal(s2.roots.length, 2);
  assert.equal(s2.maxDocs, 20000);
  assert.equal(s2.maxFileBytes, 1024 * 1024);
  assert.equal(s2.includeHidden, false); // 非布尔视为 false
  assert.equal(s2.enabled, false);
});

// ── 路径规则 ─────────────────────────────────────────────────────────────────
test('isIndexable：默认排除表/隐藏段/大小/扩展名', () => {
  const s = core.normalizeSettings(null);
  assert.equal(core.isIndexable('notes/a.md', 100, s).ok, true);
  assert.equal(core.isIndexable('node_modules/x/a.md', 100, s).ok, false);
  assert.equal(core.isIndexable('a/node_modules/b.md', 100, s).ok, false);
  assert.equal(core.isIndexable('.git/config', 100, s).ok, false);
  assert.equal(core.isIndexable('.hidden/笔记.md', 100, s).ok, false);
  assert.equal(core.isIndexable('a.md', 30 * 1024 * 1024, s).ok, false);
  assert.equal(core.isIndexable('a.exe', 100, s).ok, false);
  const s2 = core.normalizeSettings({ extraExcludes: ['隐私'], includeHidden: true });
  assert.equal(core.isIndexable('隐私/照片.md', 100, s2).ok, false);
  assert.equal(core.isIndexable('.config/设置.md', 100, s2).ok, true);
  // 目录层探测：只需 hidden/exclude 生效
  const probe = core.isIndexable('target/build/x.txt', 0, s);
  assert.equal(String(probe.reason).startsWith('exclude'), true);
});

test('containsPath：归属/逃逸/大小写/同路径', () => {
  assert.equal(core.containsPath('D:/space', 'D:/space/a.md'), true);
  assert.equal(core.containsPath('D:/space', 'D:/space/sub/a.md'), true);
  assert.equal(core.containsPath('D:/space', 'd:/SPACE/a.md'), true);
  assert.equal(core.containsPath('D:/space', 'D:/space-evil/a.md'), false);
  assert.equal(core.containsPath('D:/space', 'D:/other/a.md'), false);
  assert.equal(core.containsPath('D:/space', 'D:/space'), true); // 目录本身
  assert.equal(core.containsPath('', 'D:/x'), false);
});

// ── 分词 ─────────────────────────────────────────────────────────────────────
test('tokenize：CJK bigram+unigram 双层', () => {
  const tf = core.tokenize('缓存假象');
  assert.equal(tf.get('缓存'), 1);
  assert.equal(tf.get('存假'), 1);
  assert.equal(tf.get('假象'), 1);
  assert.equal(tf.get('缓'), 1); // unigram 同建（单字查询可用）
  const tf2 = core.tokenize('缓存。缓存');
  assert.equal(tf2.get('缓存'), 2);
});

test('tokenize：ASCII 词元 len≥2，单字符不入索引', () => {
  const tf = core.tokenize('The quick brown fox, a I 42 v2 cache_size c#');
  assert.equal(tf.get('the'), 1);
  assert.equal(tf.get('quick'), 1);
  assert.equal(tf.get('42'), 1);
  assert.equal(tf.get('v2'), 1);
  assert.equal(tf.get('cache_size'), 1);
  assert.equal(tf.get('c#'), 1);
  assert.equal(tf.has('a'), false);
  assert.equal(tf.has('i'), false);
});

test('tokenize：空串/空格/纯符号安全', () => {
  assert.equal(core.tokenize('').size, 0);
  assert.equal(core.tokenize('   ').size, 0);
  assert.equal(core.tokenize('!!!---___').size, 0); // 纯下划线 run 也是噪声
  assert.equal(core.tokenize(null).size, 0);
});

// ── 查询语法 ─────────────────────────────────────────────────────────────────
test('parseQuery：ext:/dir: 前缀剥离与容错', () => {
  const q = core.parseQuery('ext:pdf dir:plans 缓存 假象');
  assert.equal(q.ext, 'pdf');
  assert.equal(q.dir, 'plans');
  assert.equal(q.raw, '缓存 假象');
  const q2 = core.parseQuery('ext:.md hello');
  assert.equal(q2.ext, 'md');
  const q3 = core.parseQuery('no-prefix query');
  assert.equal(q3.ext, '');
  assert.equal(q3.raw, 'no-prefix query');
});

// ── BM25 排名 ────────────────────────────────────────────────────────────────
function mkDocs(defs) {
  const docs = new Map();
  const inverted = new Map();
  for (const d of defs) {
    const tf = core.tokenize(d.text);
    let len = 0; for (const [, n] of tf) len += n;
    const nameTf = core.tokenize(d.name || '');
    docs.set(d.id, { len, nameTf, pathLower: d.path.toLowerCase(), ext: d.ext, cat: d.cat });
    for (const [t, n] of tf) {
      if (!inverted.has(t)) inverted.set(t, new Map());
      inverted.get(t).set(d.id, n);
    }
  }
  return { docs, inverted };
}

test('rank：相关性与多词并集排序', () => {
  const { docs, inverted } = mkDocs([
    { id: 'a', text: '缓存命中率只有五成的假象，讨论缓存策略', name: '缓存.md', ext: 'md', cat: 'text', path: 'D:/n/缓存.md' },
    { id: 'b', text: '磁盘空间与文件系统', name: '磁盘.md', ext: 'md', cat: 'text', path: 'D:/n/磁盘.md' },
    { id: 'c', text: '缓存', name: 'c.txt', ext: 'txt', cat: 'text', path: 'D:/n/c.txt' },
  ]);
  const hits = core.rank('缓存 假象', inverted, docs, { limit: 10 });
  assert.ok(hits.length >= 2);
  assert.equal(hits[0].docId, 'a'); // 两词全命中+文件名加权 → 置顶
  assert.ok(!hits.find((h) => h.docId === 'b')); // 完全不沾边的不出现
});

test('rank：ext 精确与类别过滤、dir 过滤、空查询', () => {
  const { docs, inverted } = mkDocs([
    { id: 'md1', text: '缓存策略 discussions', name: 'a.md', ext: 'md', cat: 'text', path: 'D:/n/plans/a.md' },
    { id: 'py1', text: '缓存策略 discussions', name: 'b.py', ext: 'py', cat: 'code', path: 'D:/code/b.py' },
    { id: 'md2', text: '缓存策略 discussions', name: 'c.md', ext: 'md', cat: 'text', path: 'D:/other/c.md' },
  ]);
  const byExt = core.rank('ext:py 缓存', inverted, docs, { limit: 10 });
  assert.equal(byExt.length, 1);
  assert.equal(byExt[0].docId, 'py1');
  const byCat = core.rank('ext:code 缓存', inverted, docs, { limit: 10 });
  assert.equal(byCat.length, 1);
  assert.equal(byCat[0].docId, 'py1');
  const byDir = core.rank('dir:plans 缓存', inverted, docs, { limit: 10 });
  assert.equal(byDir.length, 1);
  assert.equal(byDir[0].docId, 'md1');
  assert.deepEqual(core.rank('', inverted, docs, { limit: 10 }), []);
  // 探针用索引中完全不存在的词元（注意 CJK unigram 会让「存」这类常用字命中——设计内）
  assert.deepEqual(core.rank('zzqq wwxx', inverted, docs, { limit: 10 }), []);
});

test('rank：空库与空倒排安全', () => {
  assert.deepEqual(core.rank('任意', new Map(), new Map(), { limit: 5 }), []);
});

// ── 片段 ─────────────────────────────────────────────────────────────────────
test('snippet：命中窗口与偏移', () => {
  const long = '开头没有用。'.repeat(20) + '这里讨论缓存假象的问题。' + '结尾填充。'.repeat(30);
  const sn = core.snippet(long, '缓存 假象', 120);
  assert.ok(sn.text.includes('缓存假象'));
  assert.ok(sn.hits.length >= 1);
  for (const h of sn.hits) {
    assert.equal(sn.text.slice(h.s, h.e).length, h.e - h.s);
  }
  // 至少一个命中切片确实是查询词本身（小写比对）
  assert.ok(sn.hits.some((h) => sn.text.slice(h.s, h.e).toLowerCase().includes('缓存')));
});

test('snippet：无命中回退开头、CJK 整串未命中逐字回退', () => {
  const sn = core.snippet('没有相关词的文本内容', '缓存假象', 100);
  assert.equal(sn.text, '没有相关词的文本内容');
  assert.equal(sn.hits.length, 0);
  // 「缓存假象」整串不存在但单字存在 → unigram 回退命中
  const sn2 = core.snippet('这里讲缓存，那里讲假象', '缓存假象', 100);
  assert.ok(sn2.hits.length >= 2);
});

// ── 展示 ─────────────────────────────────────────────────────────────────────
test('fmtBytes：各级单位', () => {
  assert.equal(core.fmtBytes(512), '512 B');
  assert.equal(core.fmtBytes(2048), '2.0 KB');
  assert.equal(core.fmtBytes(3 * 1024 * 1024), '3.0 MB');
});
