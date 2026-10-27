#!/usr/bin/env node
'use strict';
/**
 * 拾光机离线单测：node test/run-tests.mjs（零依赖零 mock，直测 shared 核心）
 * 坑先在纯函数层暴露——改 sift-core.js 必跑。
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/sift-core.js');

const results = [];
const t = (name, fn) => {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, detail: e.message });
  }
};

// ── sid 与时间归一 ──────────────────────────────────────────────────────────
t('makeSid 稳定且源前缀正确', () => {
  const a = core.makeSid('polaris', 'simple-ai-1');
  const b = core.makeSid('polaris', 'simple-ai-1');
  const c = core.makeSid('claude', 'simple-ai-1');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a.startsWith('p'));
  assert.ok(c.startsWith('c'));
  assert.equal(a.length, 11);
});

t('normalizeTs 秒/毫秒/ISO 三态归一', () => {
  assert.equal(core.normalizeTs(1793127396), 1793127396000);
  assert.equal(core.normalizeTs(1793127396255), 1793127396255);
  assert.equal(core.normalizeTs('2026-09-27T03:34:37.982Z'), Date.parse('2026-09-27T03:34:37.982Z'));
  assert.equal(core.normalizeTs(''), null);
  assert.equal(core.normalizeTs(null), null);
  assert.equal(core.normalizeTs('garbage'), null);
});

t('localDayKey 本地时区落天', () => {
  const d = new Date(2026, 9, 28, 8, 0, 0).getTime(); // 本地 2026-10-28
  assert.equal(core.localDayKey(d), '2026-10-28');
  assert.equal(core.localDayKey(0), '');
  assert.equal(core.localDayKey(NaN), '');
});

// ── 分词 ────────────────────────────────────────────────────────────────────
t('tokenize CJK 双元 + 拉丁 token', () => {
  const terms = core.tokenize('忘记密码怎么办 react18');
  assert.ok(terms.includes('忘记'));
  assert.ok(terms.includes('记密'));
  assert.ok(terms.includes('密码'));
  assert.ok(terms.includes('react18'));
  assert.ok(!terms.includes('忘')); // 双字段不产单字
});
t('tokenize 单字 CJK 成段保留单字', () => {
  assert.deepEqual(core.tokenize('好'), ['好']);
});
t('tokenize 大小写归一', () => {
  assert.deepEqual(core.tokenize('React'), core.tokenize('react'));
});
t('tokenize 空输入安全', () => {
  assert.deepEqual(core.tokenize(''), []);
  assert.deepEqual(core.tokenize(null), []);
});
t('查询与索引同口径（交叉命中）', () => {
  const doc = core.tokenize('上次解决 JSONL 解析重复行的方案');
  const q = core.tokenize('JSONL 解析');
  assert.ok(q.every((t2) => doc.includes(t2)), `query terms ${q} 应全部在 doc terms 中`);
});

// ── 倒排 ────────────────────────────────────────────────────────────────────
t('index/unindex 对称', () => {
  const postings = new Map();
  const common = new Set();
  core.indexSessionTerms(postings, common, 'p1', ['忘记', '密码']);
  core.indexSessionTerms(postings, common, 'p2', ['密码']);
  assert.deepEqual(postings.get('密码'), ['p1', 'p2']);
  core.unindexSessionTerms(postings, common, 'p1', ['忘记', '密码']);
  assert.deepEqual(postings.get('密码'), ['p2']);
  assert.equal(postings.has('忘记'), false);
  core.unindexSessionTerms(postings, common, 'p2', ['密码']);
  assert.equal(postings.size, 0);
});
t('倒排超限晋级 commonTerms', () => {
  const postings = new Map();
  const common = new Set();
  for (let i = 0; i <= core.POSTINGS_CAP; i++) {
    core.indexSessionTerms(postings, common, `s${i}`, ['热词']);
  }
  assert.equal(common.has('热词'), true);
  assert.equal(postings.has('热词'), false);
});
t('queryCandidates AND 交集', () => {
  const postings = new Map();
  const common = new Set();
  core.indexSessionTerms(postings, common, 'a', ['忘记', '密码']);
  core.indexSessionTerms(postings, common, 'b', ['密码']);
  const r = core.queryCandidates(postings, common, ['忘记', '密码']);
  assert.equal(r.relaxed, false);
  assert.ok(r.candidates.has('a'));
  assert.equal(r.candidates.size, 1);
});
t('queryCandidates 交集空 → 放宽到最稀有列表', () => {
  const postings = new Map();
  const common = new Set();
  core.indexSessionTerms(postings, common, 'a', ['忘记']);
  core.indexSessionTerms(postings, common, 'b', ['密码']);
  const r = core.queryCandidates(postings, common, ['忘记', '密码']);
  assert.equal(r.relaxed, true);
  assert.equal(r.candidates.size, 1);
});
t('queryCandidates 全 common → null 全量验证', () => {
  const postings = new Map();
  const common = new Set(['的']);
  const r = core.queryCandidates(postings, common, ['的']);
  assert.equal(r.candidates, null);
});
t('queryCandidates 全 missing → 空集', () => {
  const r = core.queryCandidates(new Map(), new Set(), ['不存在的词']);
  assert.equal(r.candidates.size, 0);
});

// ── blob ────────────────────────────────────────────────────────────────────
t('blob 编解码往返（含 \\u0000 剥除与多行正文）', () => {
  const msgs = [
    { role: 'user', ts: 1790000000000, text: '第一问\n第二行' },
    { role: 'assistant', ts: 1790000001000, text: '回答含 NUL\u0000 字符与\t制表' },
  ];
  const blob = core.encodeBlob(msgs);
  const back = core.parseBlob(blob);
  assert.equal(back.length, 2);
  assert.equal(back[0].role, 'user');
  assert.equal(back[0].text, '第一问\n第二行');
  assert.equal(back[1].text, '回答含 NUL 字符与\t制表');
  assert.equal(back[1].i, 1);
});

// ── 片段 ────────────────────────────────────────────────────────────────────
t('makeSnippet 取最早命中并加省略号', () => {
  const long = 'x'.repeat(300) + '这里有关键词出现' + 'y'.repeat(300);
  const snip = core.makeSnippet(long, ['关键词'], 20);
  assert.equal(snip.hit, true);
  assert.ok(snip.text.startsWith('…'));
  assert.ok(snip.text.includes('关键词'));
});
t('makeSnippet 未命中给开头兜底', () => {
  const snip = core.makeSnippet('abcdef', ['不存在'], 3);
  assert.equal(snip.hit, false);
  assert.ok(snip.text.startsWith('abc'));
});

// ── 装配 ────────────────────────────────────────────────────────────────────
t('assembleSession 去重/截断/入口字段', () => {
  const { entry, blob } = core.assembleSession({
    sid: 'p123',
    source: 'polaris',
    title: '会话标题',
    engineId: 'simple-ai',
    workspace: 'D:\\x',
    createdAt: 1000,
    updatedAt: 2000,
    messages: [
      { id: 'm1', role: 'user', text: '重复消息', ts: 1 },
      { id: 'm1', role: 'user', text: '重复消息（应被去重）', ts: 2 },
      { id: 'm2', role: 'assistant', text: 'x'.repeat(5000), ts: 3 },
      { role: 'assistant', text: '   ', ts: 4 }, // 空白丢弃
    ],
    maxMsgChars: 4000,
  });
  assert.equal(entry.msgCount, 2);
  assert.equal(entry.title, '会话标题');
  const msgs = core.parseBlob(blob);
  assert.equal(msgs.length, 2);
  assert.ok(msgs[1].text.endsWith('…'));
  assert.equal(msgs[1].text.length, 4001);
  assert.ok(core.tokenize(blob).includes('会话标题') === false); // blob 不含标题（标题单独进分词）
});
t('assembleSession 空 title 落默认', () => {
  const { entry } = core.assembleSession({ sid: 'x', source: 'v2', title: '', messages: [] });
  assert.equal(entry.title, '(无标题)');
});
t('assembleSession tokens 全零不写字段', () => {
  const a = core.assembleSession({ sid: 'x', source: 'zcode', title: 't', messages: [], tokens: { input: 0, output: 0 } });
  const b = core.assembleSession({ sid: 'x', source: 'zcode', title: 't', messages: [], tokens: { input: 5, output: 1 } });
  assert.equal(a.entry.tokens, undefined);
  assert.equal(b.entry.tokens.input, 5);
});

// ── 四源解析器 ──────────────────────────────────────────────────────────────
t('polaris meta 行解析（含 tokenUsage）', () => {
  const meta = core.parsePolarisMetaLine(
    JSON.stringify({ v: 3, type: 'meta', externalId: 'e1', engineId: 'simple-ai', title: '你好', workspacePath: 'D:\\', createdAt: '2026-09-27T03:34:37.982Z', updatedAt: '2026-09-27T03:35:37.982Z', messageCount: 2, tokenUsage: { input: 10, output: 20, cacheCreation: 3, cacheRead: 4, costUsd: 0.5 } }),
  );
  assert.equal(meta.externalId, 'e1');
  assert.equal(meta.tokens.cacheWrite, 3);
  assert.equal(meta.costUsd, 0.5);
  assert.equal(core.parsePolarisMetaLine('{"type":"msg"}'), null);
  assert.equal(core.parsePolarisMetaLine('not json'), null);
});
t('polaris 消息行解析（content 字符串与 blocks 两态）', () => {
  const s = core.parsePolarisMsgLine(JSON.stringify({ type: 'msg', seq: 0, message: { id: 'm1', type: 'user', content: '你好', timestamp: '2026-09-27T03:34:37.615Z' } }));
  assert.equal(s.text, '你好');
  const b = core.parsePolarisMsgLine(JSON.stringify({ type: 'msg', seq: 1, message: { id: 'm2', type: 'assistant', content: [{ type: 'text', content: '回答' }, { type: 'tool_call', input: {} }], timestamp: '2026-09-27T03:35:00.000Z' } }));
  assert.equal(b.text, '回答');
  assert.equal(core.parsePolarisMsgLine(JSON.stringify({ type: 'msg', message: { id: 'm3', type: 'system', content: 'x' } })), null);
  assert.equal(core.parsePolarisMsgLine('bad'), null);
});
t('claude 行解析：text 块提取、sidechain/工具块/summary', () => {
  const user = core.parseClaudeLine(JSON.stringify({ type: 'user', uuid: 'u1', timestamp: '2026-10-15T11:36:31.574Z', message: { role: 'user', content: [{ type: 'text', text: '只回复四个字' }] } }));
  assert.equal(user.role, 'user');
  assert.equal(user.text, '只回复四个字');
  assert.equal(user.usage, null);
  const asst = core.parseClaudeLine(JSON.stringify({ type: 'assistant', uuid: 'a1', timestamp: '2026-10-15T11:36:40Z', message: { role: 'assistant', content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: '收到收到' }], usage: { input_tokens: 100, output_tokens: 5, cache_read_input_tokens: 900, cache_creation_input_tokens: 10 } } }));
  assert.equal(asst.text, '收到收到');
  assert.equal(asst.usage.input, 100);
  assert.equal(asst.usage.cacheRead, 900);
  assert.equal(core.parseClaudeLine(JSON.stringify({ type: 'user', isSidechain: true, message: { role: 'user', content: [{ type: 'text', text: '侧链' }] } })), null);
  assert.equal(core.parseClaudeLine(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: '输出' }] } })), null);
  const sum = core.parseClaudeLine(JSON.stringify({ type: 'summary', summary: '会话摘要' }));
  assert.equal(sum.kind, 'summary');
  assert.equal(core.parseClaudeLine(JSON.stringify({ type: 'user', message: { role: 'user', content: '<command-name>/clear</command-name>' } })), null);
});
t('claude Stop-hook 包装剥壳保留真实意图', () => {
  const hook = core.parseClaudeLine(JSON.stringify({ type: 'user', uuid: 'h1', timestamp: '2026-10-15T12:00:00Z', message: { role: 'user', content: 'A session-scoped Stop hook is now active with condition: "我想实现语音播报功能，直到用户说停止"' } }));
  assert.ok(hook, 'hook 包装消息应保留');
  assert.equal(hook.text, '我想实现语音播报功能，直到用户说停止');
  assert.ok(!hook.text.includes('session-scoped'), '包装文本不应残留');
});
t('v2 行解析与版本去重', () => {
  const row = { id: 'm1', version: 2, deleted_at: null, timestamp_ms: 1793121432940, role: 'assistant', content: JSON.stringify({ type: 'assistant', blocks: [{ type: 'text', content: '最新版' }] }) };
  assert.equal(core.parseV2Row(row).text, '最新版');
  const older = { ...row, version: 1, content: JSON.stringify({ type: 'assistant', blocks: [{ type: 'text', content: '旧版' }] }) };
  assert.equal(core.dedupeV2Rows([older, row]).length, 1);
  assert.equal(core.dedupeV2Rows([older, row])[0].version, 2);
  assert.equal(core.parseV2Row({ ...row, content: 'bad json' }), null);
});
t('zcode message/part 解析（hidden 与 reasoning 过滤）', () => {
  const msg = core.parseZcodeMessage(JSON.stringify({ role: 'assistant', time: { created: 1793127396255 }, semantics: { uiVisibility: 'visible' } }));
  assert.equal(msg.role, 'assistant');
  assert.equal(msg.hidden, false);
  assert.equal(core.parseZcodeMessage(JSON.stringify({ role: 'user', time: { created: 1 }, semantics: { uiVisibility: 'hidden' } })).hidden, true);
  assert.equal(core.parseZcodePart(JSON.stringify({ type: 'text', text: '正文' })), '正文');
  assert.equal(core.parseZcodePart(JSON.stringify({ type: 'reasoning', text: '思考' })), null);
  assert.equal(core.parseZcodePart(JSON.stringify({ type: 'step-start' })), null);
});

// ── 打分与排序 ──────────────────────────────────────────────────────────────
t('rankCandidates 新近优先', () => {
  const now = Date.now();
  const byId = new Map([
    ['old', { updatedAt: now - 400 * 86400000 }],
    ['new', { updatedAt: now - 3600000 }],
  ]);
  assert.deepEqual(core.rankCandidates(byId, ['old', 'new'], now), ['new', 'old']);
});
t('scoreHit 覆盖率与命中数主导', () => {
  const now = Date.now();
  const full = core.scoreHit(3, 2, 2, now - 86400000, now);
  const partial = core.scoreHit(1, 1, 2, now - 86400000, now);
  assert.ok(full > partial);
});

// ── 聚合 ────────────────────────────────────────────────────────────────────
t('buildDailyStats / buildTotals / groupTimeline', () => {
  const now = Date.now();
  const day = core.localDayKey(now);
  const entries = [
    { sid: 'a', source: 'polaris', title: 'A', updatedAt: now, msgCount: 3, proseChars: 100, tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 } },
    { sid: 'b', source: 'claude', title: 'B', updatedAt: now - 86400000, msgCount: 2, proseChars: 50, costUsd: 0.25 },
    { sid: 'c', source: 'polaris', title: 'C', updatedAt: now, msgCount: 1, proseChars: 10 },
  ];
  const daily = core.buildDailyStats(entries);
  assert.equal(daily[day].s, 2);
  assert.equal(daily[day].m, 4);
  const totals = core.buildTotals(entries);
  assert.equal(totals.sessions, 3);
  assert.equal(totals.messages, 6);
  assert.equal(totals.proseChars, 160);
  assert.equal(totals.activeDays, 2);
  assert.equal(totals.bySource.polaris.sessions, 2);
  assert.equal(totals.bySource.claude.messages, 2);
  assert.equal(totals.tokens.sessionsCovered, 2);
  assert.equal(totals.tokens.input, 10);
  assert.equal(totals.tokens.costUsd, 0.25);
  const tl = core.groupTimeline(entries);
  assert.equal(tl.length, 2);
  assert.equal(tl[0].day, day);
  assert.equal(tl[0].sessions.length, 2);
});
t('chunkCatalog / mergeCatalogChunks 往返', () => {
  const entries = Array.from({ length: 450 }, (_, i) => ({ sid: `s${i}`, source: 'polaris', title: `t${i}`, updatedAt: i, msgCount: 1, proseChars: 1 }));
  const chunks = core.chunkCatalog(entries);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, core.CAT_CHUNK);
  const byKey = {};
  chunks.forEach((c, i) => (byKey[`sift.cat.${i}`] = c));
  const merged = core.mergeCatalogChunks({ chunks: chunks.length }, byKey);
  assert.equal(merged.length, 450);
  assert.equal(merged[449].sid, 's449');
});

// ── 设置与排除 ──────────────────────────────────────────────────────────────
t('sanitizeSettings 落安全默认并钳制', () => {
  const s = core.sanitizeSettings({ sources: { claude: false }, excludeKeywords: [' 秘密 ', '', 42], maxMsgChars: 1, sqliteRefreshMin: 9999 });
  assert.equal(s.sources.claude, false);
  assert.equal(s.sources.polaris, true);
  assert.deepEqual(s.excludeKeywords, ['秘密']);
  assert.equal(s.maxMsgChars, 4000);
  assert.equal(s.sqliteRefreshMin, 10);
  assert.equal(core.sanitizeSettings(null).sources.zcode, true);
});
t('isExcluded 命中标题或工作区', () => {
  const e = { title: '我的简历', workspace: 'D:\\private' };
  assert.equal(core.isExcluded(e, ['简历']), true);
  assert.equal(core.isExcluded(e, ['PRIVATE']), true);
  assert.equal(core.isExcluded(e, ['无关']), false);
  assert.equal(core.isExcluded(e, []), false);
});

// ── 汇总 ────────────────────────────────────────────────────────────────────
const bad = results.filter((r) => !r.pass);
console.log(results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ' — ' + r.detail}`).join('\n'));
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
