'use strict';
/**
 * shared/contract.js 单元测试
 * 运行：node test/contract.test.js
 *
 * 覆盖：键空间、normalizePaper/normalizeTopic、评分核心（标题 3x/摘要 1x）、
 * 一句话解读、mergeAndRank 去重排序。
 * 不依赖 Polaris、无网络——纯逻辑验证。
 */
const assert = require('assert');
const path = require('path');
const contract = require(path.join(__dirname, '..', 'shared', 'contract.js'));

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; }
}

// ── 键空间 ──
test('键空间前缀为 paper.', () => {
  assert.strictEqual(contract.K.settings, 'paper.settings');
  assert.strictEqual(contract.K.topics, 'paper.topics');
  assert.strictEqual(contract.K.feed('2026-10-27'), 'paper.feed.2026-10-27');
  assert.strictEqual(contract.K.fav('2601.12345'), 'paper.fav.2601.12345');
  assert.strictEqual(contract.K.isFeed('paper.feed.2026-10-27'), true);
  assert.strictEqual(contract.K.isFeed('paper.topics'), false);
  assert.strictEqual(contract.K.isFav('paper.fav.1234'), true);
});

// ── normalizePaper ──
test('normalizePaper 规范化标题/补默认链接', () => {
  const p = contract.normalizePaper({
    id: '2601.44556',
    title: '  A\n Study   of Agents ',
    abstract: 'We study agents.',
    authors: ['A', 'B'],
    categories: ['cs.AI'],
    published: 1000,
  });
  assert.strictEqual(p.title, 'A Study of Agents');
  assert.strictEqual(p.url, 'https://arxiv.org/abs/2601.44556');
  assert.strictEqual(p.pdfUrl, 'https://arxiv.org/pdf/2601.44556');
  assert.strictEqual(p.score, 0);
  assert.ok(Array.isArray(p.topMatches));
});

test('normalizePaper 拒绝缺 title 或 id', () => {
  assert.strictEqual(contract.normalizePaper({ id: '1' }), null);
  assert.strictEqual(contract.normalizePaper({ title: 'x' }), null);
  assert.strictEqual(contract.normalizePaper(null), null);
});

// ── normalizeTopic ──
test('normalizeTopic 小写关键词并过滤空', () => {
  const t = contract.normalizeTopic({ id: 'a', name: 'Agent', keywords: ['LLM', '  ', 'ReAsOnInG'] });
  assert.deepStrictEqual(t.keywords, ['llm', 'reasoning']);
  assert.strictEqual(t.name, 'Agent');
  assert.strictEqual(t.enabled, true);
});

test('normalizeTopic 拒绝无有效关键词', () => {
  assert.strictEqual(contract.normalizeTopic({ id: 'b', keywords: ['' ]}), null);
});

// ── 评分核心 ──
test('标题命中权重 3，摘要命中权重 1', () => {
  const topics = [contract.normalizeTopic({ id: 't', keywords: ['agent'] })];
  const p1 = contract.normalizePaper({ id: '1', title: 'Agent-based RL', abstract: 'nothing here' });
  const p2 = contract.normalizePaper({ id: '2', title: 'Unrelated', abstract: 'we study the agent' });
  const s1 = contract.scorePaper(p1, topics);
  const s2 = contract.scorePaper(p2, topics);
  assert.strictEqual(s1.score, 3);
  assert.strictEqual(s2.score, 1);
  assert.strictEqual(s1.matches[0].hit, 'title');
  assert.strictEqual(s2.matches[0].hit, 'abstract');
});

test('禁用主题不参与评分', () => {
  const topics = [contract.normalizeTopic({ id: 't', keywords: ['agent'], enabled: false })];
  const p = contract.normalizePaper({ id: '1', title: 'Agent notation', abstract: '' });
  assert.strictEqual(contract.scorePaper(p, topics).score, 0);
});

// ── 一句话解读 ──
test('buildVerdict 标题命中给精读建议', () => {
  const topics = [contract.normalizeTopic({ id: 't', name: 'LLM Agent', keywords: ['agent'] })];
  const p = contract.normalizePaper({ id: '1', title: 'Agent based X', abstract: '' });
  const { matches } = contract.scorePaper(p, topics);
  const v = contract.buildVerdict(p, matches, topics);
  assert.ok(v.includes('精读') || v.includes('高度相关'), `意外解读: ${v}`);
});

test('buildVerdict 无命中给中性建议', () => {
  const topics = [contract.normalizeTopic({ id: 't', keywords: ['agent'] })];
  const p = contract.normalizePaper({ id: '1', title: 'X', abstract: 'nothing' });
  const v = contract.buildVerdict(p, [], topics);
  assert.ok(v.includes('无明显重叠'));
});

// ── mergeAndRank ──
test('mergeAndRank 去重并按分排序截取', () => {
  const topics = [contract.normalizeTopic({ id: 't', keywords: ['agent'] })];
  const base = [
    { id: '1', title: 'Agent X', abstract: '' },
    { id: '1', title: 'Agent X d', abstract: '' }, // 重复（同 id）
    { id: '2', title: 'Unrelated', abstract: 'has agent word' },
    { id: '3', title: 'Other', abstract: 'nothing' },
  ];
  const out = contract.mergeAndRank(base, topics, 2);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].id, '1'); // 3 分
  assert.strictEqual(out[1].id, '2'); // 1 分
  assert.ok(out[0].verdict.length > 0);
});

test('mergeAndRank top<0 不截断', () => {
  const topics = [];
  const out = contract.mergeAndRank([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], topics, -1);
  assert.strictEqual(out.length, 2);
});

// ── 默认主题 ──
test('默认主题均有效且启用', () => {
  assert.ok(contract.DEFAULT_TOPICS.length >= 3);
  for (const t of contract.DEFAULT_TOPICS) {
    assert.ok(t.id && t.keywords.length, `bad default topic ${JSON.stringify(t)}`);
  }
});

console.log(`\n通过 ${passed} 项测试${process.exitCode ? '（有失败）' : ''}`);