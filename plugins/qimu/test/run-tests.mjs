/**
 * 启幕 core 逻辑测试（node --test test/run-tests.mjs）
 * 覆盖：Deck 归一化（必填/主题回退/自动首尾页）、容量护栏（逐类超限报错）、
 *       几何布局（盒类型/页数/页码/主题 token 消费）、字号阶梯与估宽、
 *       文件名净化（目录穿越/非法字符）、大纲 DSL（全语法/错误行不中断/two 升级）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

function goodSpec(over = {}) {
  return {
    title: '季度经营汇报',
    theme: 'midnight',
    slides: [
      { type: 'section', title: '业务回顾' },
      { type: 'bullets', title: '核心成果', bullets: ['收入增长 30%', { h: '新客户', d: '新增 120 家' }] },
      { type: 'chart', title: '月度收入', chart: { kind: 'bar', labels: ['一', '二', '三'], series: [{ name: '收入', values: [1, 2, 3] }] } },
      { type: 'table', title: '分区数据', head: ['区域', '收入'], rows: [['华东', '120'], ['华北', '98']] },
      { type: 'two', title: '对比', left: { h: '上半年', points: ['a', 'b'] }, right: { h: '下半年', points: ['c', 'd'] } },
      { type: 'quote', text: '质量是最好的增长策略', author: '内部共识' },
    ],
    ...over,
  };
}

// ── 归一化 ─────────────────────────────────────────────────────────────────
test('normalizeDeck：必填/未知主题回退/自动首尾页/保留显式 cover', () => {
  assert.ok(core.normalizeDeck(null).error.includes('deck'));
  assert.ok(core.normalizeDeck({ title: 'x', slides: [] }).error.includes('slides'));
  const r1 = core.normalizeDeck({ title: 'x', slides: [{ type: 'section', title: 's' }] });
  assert.equal(r1.deck.slides[0].type, 'cover');       // 自动补封面
  assert.equal(r1.deck.slides.at(-1).type, 'end');     // 自动补结尾
  assert.equal(r1.deck.theme, 'midnight');
  const r2 = core.normalizeDeck(goodSpec({ theme: '不存在的' }));
  assert.equal(r2.deck.theme, 'midnight');
  assert.ok(r2.error === undefined); // 未知主题回退为警告不致命
  assert.ok(r2.warnings.length === 1 && r2.warnings[0].includes('midnight'));
  const r3 = core.normalizeDeck(goodSpec({ slides: [{ type: 'cover' }, { type: 'section', title: 's' }] }));
  assert.equal(r3.deck.slides[0].type, 'cover');
  assert.equal(r3.deck.slides.filter((s) => s.type === 'cover').length, 1); // 不重复补
  const r4 = core.normalizeDeck(goodSpec({ epilogue: '扫码交流' }));
  assert.equal(r4.deck.slides.at(-1).note, '扫码交流');
});

test('normalizeDeck：容量护栏逐类报错（可读错误引导拆页）', () => {
  const bullets = goodSpec({ slides: [{ type: 'bullets', title: '超限', bullets: Array.from({ length: 7 }, (_, i) => `要点${i}`) }] });
  const e1 = core.normalizeDeck(bullets).error;
  assert.ok(e1.includes('bullets') && e1.includes('拆'), e1);
  const two = goodSpec({ slides: [{ type: 'two', title: 't', left: { h: 'a', points: Array(6).fill('x') }, right: { h: 'b', points: ['x'] } }] });
  assert.ok(core.normalizeDeck(two).error.includes('points'));
  const chart = goodSpec({ slides: [{ type: 'chart', title: 't', chart: { kind: 'bar', labels: Array.from({ length: 9 }, (_, i) => `L${i}`), series: [{ name: 's', values: Array(9).fill(1) }] } }] });
  assert.ok(core.normalizeDeck(chart).error.includes('labels'));
  const chartBad = goodSpec({ slides: [{ type: 'chart', title: 't', chart: { kind: 'bar', labels: ['a', 'b'], series: [{ name: 's', values: [1] }] } }] });
  assert.ok(core.normalizeDeck(chartBad).error.includes('不一致'));
  const table = goodSpec({ slides: [{ type: 'table', title: 't', head: ['a', 'b'], rows: [['1', '2'], ['3']] }] });
  assert.ok(core.normalizeDeck(table).error.includes('列数'));
  const kind = goodSpec({ slides: [{ type: 'chart', title: 't', chart: { kind: 'radar', labels: ['a'], series: [{ name: 's', values: [1] }] } }] });
  assert.ok(core.normalizeDeck(kind).error.includes('kind'));
  const total = goodSpec({ slides: Array.from({ length: 61 }, () => ({ type: 'section', title: 's' })) });
  assert.ok(core.normalizeDeck(total).error.includes('上限'));
});

// ── 布局 ───────────────────────────────────────────────────────────────────
test('layout：页数=spec+自动首尾、盒类型正确、页码、主题 token', () => {
  const deck = core.normalizeDeck(goodSpec()).deck;
  const g = core.layout(deck);
  assert.equal(g.W, 13.333);
  assert.equal(g.pages.length, deck.slides.length);
  const cover = g.pages[0];
  assert.equal(cover.type, 'cover');
  assert.ok(cover.boxes.some((b) => b.k === 'rect' && b.fill === 'accent'));
  assert.ok(cover.boxes.some((b) => b.k === 'text' && b.text === '季度经营汇报' && b.fontSize >= 26));
  const bullets = g.pages[1]; // 自动补 cover 后，原 slides[0]=section 是 pages[1]
  assert.equal(bullets.type, 'section');
  const contentPage = g.pages[3];
  assert.ok(contentPage.boxes.some((b) => b.k === 'text' && b.text === String(3 + 1))); // 页码=页序
  // 主题 token 全部经 THEMES 解析（fill 只允许 token 名）
  for (const p of g.pages) {
    for (const b of p.boxes) {
      if (b.fill) assert.ok(['accent', 'accent2', 'card', 'sub', 'hairline', 'bgAlt'].includes(b.fill), `unknown fill ${b.fill}`);
      if (b.color) assert.ok(['text', 'sub', 'accent'].includes(b.color), `unknown color ${b.color}`);
    }
  }
  const chartBox = g.pages.find((p) => p.type === 'chart').boxes.find((b) => b.k === 'chart');
  assert.equal(chartBox.chart.kind, 'bar');
  assert.equal(chartBox.colors.length, 2); // 单系列也保底 2 色（色板冗余）
  assert.equal(chartBox.colors[0], '3E7BFA'); // midnight.accent
  const tableBox = g.pages.find((p) => p.type === 'table').boxes.find((b) => b.k === 'table');
  assert.equal(tableBox.table.head.length, 2);
  assert.equal(tableBox.table.rows.length, 2);
});

test('字号阶梯与估宽（确定性）', () => {
  assert.equal(core.titleFontSize('短标题', 40, 26), 40);
  assert.ok(core.titleFontSize('这是一个超过二十四个字的很长很长很长的标题确实很长', 40, 26) === 26);
  assert.ok(core.estChars('中文') > core.estChars('ab'));
  assert.equal(core.estChars('abcd'), 4 * 0.52);
});

test('safeFileName：剥非法字符与路径穿越、保留 CJK、带时间戳', () => {
  const r = core.safeFileName('../..\\坏:名字*?"<>|  测试 ', 1730000000000);
  assert.ok(!r.file.includes('..'));
  assert.ok(!/[\\/:*?"<>|]/.test(r.name));
  assert.ok(r.file.startsWith('qimu-') && r.file.endsWith('.pptx'));
  assert.ok(r.name.includes('坏名字'));
  assert.equal(core.safeFileName('', 0).name, '未命名');
  const long = core.safeFileName('x'.repeat(80), 0);
  assert.ok(long.name.length <= core.CAPS.fileName);
});

// ── 大纲 DSL ───────────────────────────────────────────────────────────────
test('parseOutline：全语法解析为 spec', () => {
  const dsl = `
@title 年度战略
@subtitle 2026 规划
@author 策略部
@theme ink

# 第一部分 | 现状

## 核心成果
- 收入增长 30%
- 新客户::新增 120 家

## 两栏对比
[L] 上半年
- 稳中求进
[R] 下半年
- 加速扩张

> 质量是最好的增长策略 | 内部共识

%bar|月度收入|一,二,三|收入:1,2,3|利润:0.5,0.8,1.1

|区域,收入
|华东,120
|华北,98

=== 感谢聆听
`;
  const r = core.parseOutline(dsl);
  assert.equal(r.errors, null, JSON.stringify(r.errors));
  const spec = r.spec;
  assert.equal(spec.title, '年度战略');
  assert.equal(spec.theme, 'ink');
  assert.equal(spec.author, '策略部');
  const types = spec.slides.map((s) => s.type);
  assert.deepEqual(types, ['section', 'bullets', 'two', 'quote', 'chart', 'table', 'end']);
  assert.equal(spec.slides[1].bullets[1].h, '新客户');
  assert.equal(spec.slides[2].left.points[0], '稳中求进');
  assert.equal(spec.slides[4].chart.series[1].name, '利润');
  assert.deepEqual(spec.slides[5].rows[0], ['华东', '120']);
  assert.equal(spec.slides[6].note, '感谢聆听');
});

test('parseOutline：错误行收集不中断；无页标题的 - 报错；渲染链路闭合', () => {
  const r = core.parseOutline('## 孤儿页\n===\n- 没有标题的要点\n%bad\n随便一行\n');
  assert.ok(r.errors.length >= 3, JSON.stringify(r.errors));
  assert.ok(r.errors.some((e) => e.includes('第 3 行')));
  assert.ok(r.errors.some((e) => e.includes('第 5 行')));
  // DSL → normalizeDeck → layout 全链闭合（面板本地构建走的就是这条）
  const ok = core.parseOutline('# 开场\n## 要点页\n- 第一条\n- 第二条::带说明\n');
  assert.equal(ok.errors, null);
  const deck = core.normalizeDeck(ok.spec);
  assert.equal(deck.error, undefined);
  const g = core.layout(deck.deck);
  assert.equal(g.pages.length, 4); // cover + section + bullets + end
  // two 升级路径：## 页先出现 - 再出现 [L]
  const r2 = core.parseOutline('## 升级页\n- 先有一条\n[L] 甲\n- 甲点\n[R] 乙\n- 乙点\n');
  assert.equal(r2.errors, null, JSON.stringify(r2.errors));
  assert.equal(r2.spec.slides[0].type, 'two');
  assert.deepEqual(r2.spec.slides[0].left.points, ['甲点']);
});
