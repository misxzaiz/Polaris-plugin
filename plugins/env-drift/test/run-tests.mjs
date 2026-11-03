/**
 * .env 漂移检查器 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 离线、零依赖。覆盖：解析器（引号/注释/export/空值/重复键/格式错误/行内注释）
 * + diff 三分类 + 脱敏红线（报告不含 actual 值原文）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/env-core.js'

test('parseEnv: 基础键值 + 首次出现顺序', () => {
  const p = core.parseEnv('A=1\n# 注释行\nB=two\nC=3')
  assert.deepEqual(p.order, ['A', 'B', 'C'])
  assert.deepEqual(p.vars, { A: '1', B: 'two', C: '3' })
  assert.equal(p.errors.length, 0)
})

test('parseEnv: 引号值剥离 + export 前缀 + 行内注释', () => {
  const p = core.parseEnv([
    'SINGLE=\'quoted value\'',
    'DOUBLE="double value"',
    'export EXPORTED=yes',
    'INLINE=value # trailing comment',
    'HASHVAL=val#notcomment',
    'KEY="quoted # keep"',
  ].join('\n'))
  assert.equal(p.vars.SINGLE, 'quoted value')
  assert.equal(p.vars.DOUBLE, 'double value')
  assert.equal(p.vars.EXPORTED, 'yes')
  assert.equal(p.vars.INLINE, 'value')
  assert.equal(p.vars.HASHVAL, 'val#notcomment') // # 前无空格不切
  assert.equal(p.vars.KEY, 'quoted # keep') // 引号内 # 保留
})

test('parseEnv: 重复键后值覆盖 + 记录事件', () => {
  const p = core.parseEnv('X=1\nX=2\nY=3\nX=4')
  assert.equal(p.vars.X, '4')
  assert.equal(p.order.filter((k) => k === 'X').length, 1) // order 只记首次
  assert.equal(p.duplicates.length, 2)
})

test('parseEnv: 格式错误行（缺 = / 键名非法）报行号不中断', () => {
  const p = core.parseEnv('GOOD=1\nno-equals-line\nBAD-KEY=x\nALSO=2\n123=bad')
  assert.deepEqual(p.vars, { GOOD: '1', ALSO: '2' })
  assert.equal(p.errors.length, 3)
  assert.equal(p.errors[0].line, 2)
  assert.equal(p.errors[0].reason, '缺少 =')
  assert.equal(p.errors[1].reason, '键名非法')
  assert.equal(p.errors[2].line, 5)
})

test('parseEnv: 空值键与等号两侧空白容忍', () => {
  const p = core.parseEnv('EMPTY=\n  SPACED  =  spaced value  ')
  assert.equal(p.vars.EMPTY, '')
  assert.equal(p.vars.SPACED, 'spaced value')
})

test('diffEnv: 缺失/多余/值差异三分类齐全', () => {
  const ex = core.parseEnv('A=alpha\nB=beta\nC=gamma')
  const ac = core.parseEnv('B=beta2\nC=gamma\nD=delta')
  const d = core.diffEnv(ex, ac)
  assert.deepEqual(d.missing, ['A'])
  assert.deepEqual(d.extra, ['D'])
  assert.deepEqual(d.valueDiff, [{ key: 'B', exampleValue: 'beta' }])
  assert.equal(d.summary.ok, false)
})

test('diffEnv: 无漂移时 ok=true', () => {
  const ex = core.parseEnv('A=1\nB=2')
  const ac = core.parseEnv('A=1\nB=2')
  const d = core.diffEnv(ex, ac)
  assert.equal(d.summary.ok, true)
  assert.equal(d.summary.missing, 0)
})

test('diffEnv: 空值键归类（同值也算空值集）', () => {
  const ex = core.parseEnv('A=placeholder')
  const ac = core.parseEnv('A=')
  const d = core.diffEnv(ex, ac)
  assert.deepEqual(d.valueDiff.map((v) => v.key), ['A']) // 空值也属值差异
  assert.deepEqual(d.emptyInActual, ['A'])
})

test('脱敏红线：renderReport 不含 actual 值原文', () => {
  const secretValue = 'sk-SUPER-SECRET-VALUE-1234567890'
  const ex = core.parseEnv('API_KEY=placeholder-key-here')
  const ac = core.parseEnv(`API_KEY=${secretValue}`)
  const report = core.renderReport(ex, ac, { example: ex, actual: ac })
  assert.ok(report.includes('API_KEY'), '报告含键名')
  assert.ok(!report.includes(secretValue), '报告绝不含实际值原文！')
  assert.ok(report.includes('(已隐藏)') || report.includes('已隐藏'))
})

test('renderReport: 三类漂移齐全 + 格式错误行 + 重复键', () => {
  const ex = core.parseEnv('A=alpha\nB=beta\nC=gamma\nD=d')
  const acText = 'B=betaX\nC=gamma\nE=\nB=again\nbadline\nD='
  const ac = core.parseEnv(acText)
  const report = core.renderReport(ex, ac, { example: ex, actual: ac })
  assert.ok(report.includes('缺失'), report.slice(0, 200))
  assert.ok(report.includes('A'))
  assert.ok(report.includes('值差异') && report.includes('B'), report.slice(0, 300))
  assert.ok(report.includes('多余') && report.includes('E'))
  assert.ok(report.includes('重复键'))
  assert.ok(report.includes('格式错误'))
})

test('renderReport: 无漂移输出 ✅', () => {
  const ex = core.parseEnv('A=1')
  const ac = core.parseEnv('A=1')
  const report = core.renderReport(ex, ac, { example: ex, actual: ac })
  assert.ok(report.includes('✅ 无漂移'))
})

test('truncate: 截尾带省略号', () => {
  assert.equal(core.truncate('abc', 10), 'abc')
  assert.equal(core.truncate('x'.repeat(70), 60).length, 61)
})
