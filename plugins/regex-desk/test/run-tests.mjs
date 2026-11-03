/**
 * 正则调试台 core 逻辑测试（node test/run-tests.mjs）
 *
 * 离线、零依赖。覆盖：flags 校验 / tokenizer 结构 / 逐构造解释 /
 * ReDoS 静态必报清单（高危+caution）/ 常见合法模式不误报清单 /
 * 阶梯实测（真实计时，指数特征确认）/ 匹配与替换语义 / 渲染无 undefined 泄漏。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/regex-core.js'

// ── flags 校验 ──────────────────────────────────────────────────────────────

test('flags：非法字符/重复/u+v 互斥均报中文错误', () => {
  assert.match(core.checkFlags('gx'), /非法字符/)
  assert.match(core.checkFlags('gg'), /重复/)
  assert.match(core.checkFlags('uv'), /互斥/)
  assert.equal(core.checkFlags('gim'), null)
  assert.equal(core.checkFlags(''), null)
  assert.equal(core.checkFlags(null), null)
})

// ── tokenizer 结构 ──────────────────────────────────────────────────────────

test('tokenizer：命名组/嵌套深度/量词惰性切分正确', () => {
  const { tokens } = core.tokenize('(?<user>\\w+)@(?:(?:a+)b)?')
  const named = tokens.find((t) => t.kind === 'groupOpen' && t.groupKind === 'named')
  assert.equal(named.groupName, 'user')
  // \w+ 的量词
  const quants = tokens.filter((t) => t.kind === 'quant')
  assert.ok(quants.some((t) => t.raw === '+'))
  // 惰性量词 a+? 被合并为单个 token 且 lazy=true
  const lazy = core.tokenize('a+?').tokens
  const lq = lazy.find((t) => t.kind === 'quant')
  assert.equal(lq.raw, '+?')
  assert.equal(lq.lazy, true)
})

test('tokenizer：字符类扫描（取反/转义 ]/范围不误断）', () => {
  const { tokens } = core.tokenize('[^\\]]a-z]+')
  const cls = tokens.find((t) => t.kind === 'class')
  assert.equal(cls.negated, true)
  assert.equal(cls.raw, '[^\\]]')
  // 类后的 + 是量词
  assert.equal(tokens[tokens.length - 1].kind, 'quant')
})

// ── explain ─────────────────────────────────────────────────────────────────

test('explain：命名组/环视/量词中文解释到位', () => {
  const r = core.explain('(?<user>\\w+)@(?=com)', '')
  assert.ok(r.ok)
  const joined = r.items.map((i) => i.meaning).join(' | ')
  assert.ok(joined.includes('命名捕获组「user」'), joined)
  assert.ok(joined.includes('顺序环视'), joined)
  assert.ok(joined.includes('贪婪'), joined)
})

test('explain：类内 \\b 标注退格语义、锚点区分', () => {
  const r = core.explain('[\\b]^', '')
  const joined = r.items.map((i) => i.meaning).join(' | ')
  assert.ok(joined.includes('退格'), joined)
  assert.ok(joined.includes('行首锚点'), joined)
})

test('explain：语法错误如实报（tokenizer 宽容不背书）', () => {
  const r = core.explain('(?<unclosed', '')
  assert.equal(r.ok, false)
  assert.match(r.error, /语法错误/)
})

// ── ReDoS 静态检测：必报清单 ─────────────────────────────────────────────────

const MUST_HIGH = [
  ['(a+)+$', '裸嵌套无限量词'],
  ['(a|aa)+$', '分支可互相前缀延伸'],
  ['((a+)+b)?', '内层嵌套无限量词'],
  ['(.*)*$', '点星嵌套'],
  ['(a|a)+', '完全重复分支'],
]
for (const [p, why] of MUST_HIGH) {
  test(`ReDoS 必报 high：${p}（${why}）`, () => {
    const r = core.analyzeRedos(p, '')
    assert.ok(r.ok)
    assert.equal(r.verdict, 'high', `期望 high，实际 ${r.verdict}，规则: ${JSON.stringify(r.rules.map((x) => [x.id, x.level]))}`)
  })
}

test('ReDoS caution：定界嵌套（(?:\\w+:)+ / ((a+)b)+）提示需实测而非高危', () => {
  // 两者每轮迭代都有与量词字符集互斥的定界元素（':' / 'b'）——切分唯一，多项式而非指数，
  // 但静态规则无法证明互斥性，如实降级 caution 并触发阶梯实测复核
  for (const p of ['(?:\\w+:)+', '((a+)b)+']) {
    const r = core.analyzeRedos(p, '')
    assert.ok(r.ok)
    assert.equal(r.verdict, 'caution', `${p} → ${JSON.stringify(r.rules.map((x) => [x.id, x.level]))}`)
    assert.ok(r.timing, 'caution 也应触发阶梯实测')
  }
})

// ── ReDoS 误报防线：常见合法模式 ─────────────────────────────────────────────

const MUST_SAFE = [
  ['[\\w.-]+@[\\w.]+', 'email'],
  ['\\d{4}-\\d{2}-\\d{2}', '日期'],
  ['(\\d{1,3}\\.){3}\\d{1,3}', 'IPv4'],
  ['^(https?:\\/\\/)?[\\w.-]+\\.[a-z]{2,}(\\/\\S*)?$', 'URL'],
  ['1[3-9]\\d{9}', '手机号'],
  ['#[0-9a-fA-F]{6}\\b', '色值'],
]
for (const [p, why] of MUST_SAFE) {
  test(`合法模式不误报（无 high/caution）：${p}（${why}）`, () => {
    const r = core.analyzeRedos(p, '')
    assert.ok(r.ok)
    const noisy = r.rules.filter((x) => x.level === 'high' || x.level === 'caution')
    assert.equal(noisy.length, 0, JSON.stringify(noisy))
    assert.equal(r.verdict, 'safe')
    assert.equal(r.timing, null, 'safe 不做阶梯实测（同步引擎无法中断，只对可疑者实测）')
  })
}

// ── 阶梯实测（真实计时） ─────────────────────────────────────────────────────

test('阶梯实测：(a+)+$ 出现指数增长特征 confirmed=true，结构完整', () => {
  const r = core.analyzeRedos('(a+)+$', '')
  assert.ok(r.ok)
  assert.ok(r.timing, 'high 必有阶梯实测')
  assert.equal(r.timing.confirmed, true, `阶梯: ${JSON.stringify(r.timing.ladder)}`)
  for (const l of r.timing.ladder) {
    assert.ok(Number.isFinite(l.ms), '耗时是有限数')
    assert.ok(l.ran, '每档真实执行')
  }
})

test('now 注入口：阶梯可注入时钟（测试定格纪律）', () => {
  let fake = 0
  const r = core.ladderTiming(() => { fake += 5 }, { now: () => fake })
  assert.ok(r.ladder.length >= 3)
  assert.equal(r.ladder[0].ms, 5)
})

// ── runMatch ────────────────────────────────────────────────────────────────

test('runMatch：命名组/捕获组/索引正确', () => {
  const r = core.runMatch('(?<user>[\\w.-]+)@(?<host>[\\w.]+)', 'g', '联系 a@b.com 或 c.d@e.org')
  assert.ok(r.ok)
  assert.equal(r.matchCount, 2)
  assert.equal(r.matches[0].named.user, 'a')
  assert.equal(r.matches[0].named.host, 'b.com')
  assert.equal(r.matches[1].index, 13)
})

test('runMatch：无 g 只报第一个并如实注明（非截断）', () => {
  const r = core.runMatch('\\d+', '', 'a1b2c3')
  assert.ok(r.ok)
  assert.equal(r.matchCount, 1)
  assert.match(r.singleNote, /未加 g/)
})

test('runMatch：语法错误/flags 错误/文本超限均报', () => {
  assert.match(core.runMatch('(?<x', '', 's').error, /语法错误/)
  assert.match(core.runMatch('a', 'gg', 's').error, /重复/)
  assert.match(core.runMatch('a', '', 'x'.repeat(core.MAX_TEXT_LEN + 1)).error, /过大/)
})

test('runMatch：截断护栏 MAX_MATCHES', () => {
  const r = core.runMatch('a', 'g', 'a'.repeat(core.MAX_MATCHES + 50))
  assert.ok(r.ok)
  assert.equal(r.matchCount, core.MAX_MATCHES)
  assert.equal(r.truncated, true)
})

// ── runReplace ──────────────────────────────────────────────────────────────

test('runReplace：$1 与 $<name> 原生语义、计数正确', () => {
  // \w 不含点：'a@b.com' 中第二组只捕获 'b'，'.com' 留在原位（JS 原生语义如实）
  const r = core.runReplace('(\\w+)@(\\w+)', 'g', '$2@$1', 'a@b.com')
  assert.ok(r.ok)
  assert.equal(r.replaceCount, 1)
  assert.equal(r.result, 'b@a.com')
  const named = core.runReplace('(?<u>\\w+)@(?<h>\\w+)', 'g', '$<h>~$<u>', 'a@b')
  assert.equal(named.result, 'b~a')
})

test('runReplace：无 g 只换第一处（JS 原生语义如实）', () => {
  const r = core.runReplace('a', '', 'x', 'aaa')
  assert.equal(r.result, 'xaa')
  assert.equal(r.replaceCount, 1)
})

// ── 渲染：无 undefined/NaN 泄漏 ──────────────────────────────────────────────

test('渲染报告：无 undefined/NaN 泄漏（对抗输入）', () => {
  const texts = [
    core.renderRedosReport(core.analyzeRedos('(a+)+$', '').ok ? core.analyzeRedos('(a+)+$', '') : null),
    core.renderTestReport(core.runMatch('(a)|(b)', 'g', 'ab')),
    core.renderReplaceReport(core.runReplace('a', 'g', 'x', 'aaa')),
    core.renderExplainReport(core.explain('a+?', 'g')),
  ]
  for (const t of texts) {
    assert.ok(!/undefined|NaN/.test(t), `泄漏: ${t}`)
  }
})

test('级别中文标签口径统一', () => {
  assert.equal(core.VERDICT_LABELS.safe, '安全')
  assert.equal(core.VERDICT_LABELS.caution, '需注意')
  assert.equal(core.VERDICT_LABELS.high, '高危')
})
