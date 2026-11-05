/**
 * Shell 转义对照台 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 覆盖：三 shell 引用策略 + 特殊字符语义表 + 分词解析还原 +
 * bash round-trip 实测（本机 bash spawn 对照，危险样本 ≥10 组全对齐）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as core from '../shared/escape-core.js'

test('quoteBash: POSIX 单引号安全策略（含单引号续接）', () => {
  assert.equal(core.quoteBash('plain'), "'plain'")
  assert.equal(core.quoteBash("it's"), "'it'\\''s'")
  assert.equal(core.quoteBash('a$b `c` "d"'), "'a$b `c` \"d\"'") // 单引号内全部字面
})

test('quoteBashDouble: 双引号策略转义 $ ` " \\', () => {
  const r = core.quoteBashDouble('a$b`c"d\\e')
  assert.ok(r.startsWith('"') && r.endsWith('"'))
  // 手工核对每个特殊字符前有反斜杠
  assert.ok(r.includes('\\$b') && r.includes('\\`c') && r.includes('\\"d') && r.includes('\\\\e'))
})

test('quotePowerShell: 单引号翻倍', () => {
  assert.equal(core.quotePowerShell("it's"), "'it''s'")
  assert.equal(core.quotePowerShell('a$b`c'), "'a$b`c'") // 单引号内全字面
})

test('quotePowerShellDouble: 反引号转义 $ ` "', () => {
  const r = core.quotePowerShellDouble('a$b`c"d')
  assert.ok(r.includes('`$b') && r.includes('``c') && r.includes('`"d'))
})

test('quoteCmd: 双引号包裹；含双引号文本带 caveat', () => {
  const r1 = core.quoteCmd('plain text')
  assert.equal(r1.text, '"plain text"')
  const r2 = core.quoteCmd('has "quote"')
  assert.ok(r2.text.includes('""'))
  assert.ok(r2.caveat.length > 10, '双引号 caveat 必须提示模糊区')
})

test('specialCharTable: 危险字符逐个给出三 shell 语义', () => {
  const t = core.specialCharTable("a$b`c'd\"e%|&^f")
  const byChar = Object.fromEntries(t.map((x) => [x.char, x]))
  assert.ok(byChar.$ && byChar['`'] && byChar['"'] && byChar["'"] && byChar['%'] && byChar['|'] && byChar['&'] && byChar['^'])
  assert.ok(byChar['$'].bash.includes('变量展开'))
})

test('parseBash: 引号/转义还原为 argv', () => {
  assert.deepEqual(core.parseBash('echo "hello world"').argv, ['echo', 'hello world'])
  assert.deepEqual(core.parseBash("echo 'it'\\''s'").argv, ["echo", "it's"])
  assert.deepEqual(core.parseBash('cmd a\\ b c').argv, ['cmd', 'a b', 'c'])
  assert.equal(core.parseBash("echo 'unclosed").ok, false)
})

test('parsePowerShell: 单引号翻倍与反引号转义还原', () => {
  assert.deepEqual(core.parsePowerShell("echo 'it''s'").argv, ['echo', "it's"])
  assert.deepEqual(core.parsePowerShell('echo "a`$b"').argv, ['echo', 'a$b'])
  assert.equal(core.parsePowerShell("echo 'x").ok, false)
})

test('parseCmd: 双引号与 ^ 转义（近似子集）', () => {
  assert.deepEqual(core.parseCmd('prog "a b" c').argv, ['prog', 'a b', 'c'])
  assert.deepEqual(core.parseCmd('prog ^&next "x"').argv, ['prog', '&next', 'x'])
  assert.equal(core.parseCmd('prog "unclosed').ok, false)
})

test('renderQuoteReport: 对照表含三 shell 与特殊字符节', () => {
  const report = core.renderQuoteReport('a$b c')
  assert.ok(report.includes('bash:') && report.includes('powershell:') && report.includes('cmd:'))
  assert.ok(report.includes('$'))
})

// ── bash round-trip 实测（本机 bash spawn 对照，危险样本 ≥10 组）───────────
const SAMPLES = [
  'plain',
  'with space',
  "it's got quotes",
  'dollar $SIGN',
  'backtick `cmd`',
  'double "quotes"',
  'pipe | amp & sem ;',
  'redirect > out < in',
  'paren (group) [bracket]',
  'slash \\ back',
  'mixed $a "b" `c` \'d\' e',
  'tab\tand newline\nliteral? no',
]

test('bash round-trip 实测：quoteBash 产物 echo 还原=原文（12 组样本）', () => {
  // 环境检查：bash 可用才跑（Windows 纯 cmd 环境优雅降级跳过——但如实标注）
  const probe = spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' })
  if (probe.status !== 0 || probe.stdout.trim() !== 'ok') {
    console.log('  ~ bash 不可用，round-trip 对照跳过（环境受限，如实标注）')
    return
  }
  for (const sample of SAMPLES) {
    const quoted = core.quoteBash(sample)
    const res = spawnSync('bash', ['-c', `printf '%s' ${quoted}`], { encoding: 'utf8' })
    assert.equal(res.status, 0, `bash 执行失败: ${quoted}`)
    assert.equal(res.stdout, sample, `round-trip 不一致: 样本=${JSON.stringify(sample)} 还原=${JSON.stringify(res.stdout)} 产物=${quoted}`)
  }
})

test('bash round-trip 实测：quoteBashDouble 产物（双引号策略）', () => {
  const probe = spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' })
  if (probe.status !== 0) { console.log('  ~ bash 不可用，跳过'); return }
  // 双引号策略对 ! 与空样本等边缘仍需还原（脚本内 ! 无历史展开）
  const samples = SAMPLES.filter((s) => !s.includes('\n')) // 双引号内换行字面 echo 可还原，但 printf 单参安全起见过滤
  for (const sample of samples) {
    const quoted = core.quoteBashDouble(sample)
    const res = spawnSync('bash', ['-c', `printf '%s' ${quoted}`], { encoding: 'utf8' })
    assert.equal(res.status, 0, `bash 执行失败: ${quoted}`)
    assert.equal(res.stdout, sample, `双引号 round-trip 不一致: ${JSON.stringify(sample)} → ${JSON.stringify(res.stdout)}（产物 ${quoted}）`)
  }
})

test('parseBash: 引号/转义还原为 argv', () => {
  assert.deepEqual(core.parseBash('echo "hello world"').argv, ['echo', 'hello world'])
  assert.deepEqual(core.parseBash("echo 'it'\\''s'").argv, ["echo", "it's"])
  assert.deepEqual(core.parseBash('cmd a\\ b c').argv, ['cmd', 'a b', 'c'])
  assert.equal(core.parseBash("echo 'unclosed").ok, false)
})

test('parsePowerShell: 单引号翻倍与反引号转义还原', () => {
  assert.deepEqual(core.parsePowerShell("echo 'it''s'").argv, ['echo', "it's"])
  assert.deepEqual(core.parsePowerShell('echo "a`$b"').argv, ['echo', 'a$b'])
  assert.equal(core.parsePowerShell("echo 'x").ok, false)
})

test('parseCmd: 双引号与 ^ 转义（近似子集）', () => {
  assert.deepEqual(core.parseCmd('prog "a b" c').argv, ['prog', 'a b', 'c'])
  assert.deepEqual(core.parseCmd('prog ^&next "x"').argv, ['prog', '&next', 'x'])
  assert.equal(core.parseCmd('prog "unclosed').ok, false)
})

test('renderQuoteReport: 对照表含三 shell 与特殊字符节', () => {
  const report = core.renderQuoteReport('a$b c')
  assert.ok(report.includes('bash:') && report.includes('powershell:') && report.includes('cmd:'))
  assert.ok(report.includes('$'))
})


test('bash round-trip 实测：quoteBash 产物 echo 还原=原文（12 组样本）', () => {
  // 环境检查：bash 可用才跑（Windows 纯 cmd 环境优雅降级跳过——但如实标注）
  const probe = spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' })
  if (probe.status !== 0 || probe.stdout.trim() !== 'ok') {
    console.log('  ~ bash 不可用，round-trip 对照跳过（环境受限，如实标注）')
    return
  }
  for (const sample of SAMPLES) {
    const quoted = core.quoteBash(sample)
    const res = spawnSync('bash', ['-c', `printf '%s' ${quoted}`], { encoding: 'utf8' })
    assert.equal(res.status, 0, `bash 执行失败: ${quoted}`)
    assert.equal(res.stdout, sample, `round-trip 不一致: 样本=${JSON.stringify(sample)} 还原=${JSON.stringify(res.stdout)} 产物=${quoted}`)
  }
})

test('bash round-trip 实测：quoteBashDouble 产物（双引号策略）', () => {
  const probe = spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' })
  if (probe.status !== 0) { console.log('  ~ bash 不可用，跳过'); return }
  // 双引号策略对 ! 与空样本等边缘仍需还原（脚本内 ! 无历史展开）
  const samples = SAMPLES.filter((s) => !s.includes('\n')) // 双引号内换行字面 echo 可还原，但 printf 单参安全起见过滤
  for (const sample of samples) {
    const quoted = core.quoteBashDouble(sample)
    const res = spawnSync('bash', ['-c', `printf '%s' ${quoted}`], { encoding: 'utf8' })
    assert.equal(res.status, 0, `bash 执行失败: ${quoted}`)
    assert.equal(res.stdout, sample, `双引号 round-trip 不一致: ${JSON.stringify(sample)} → ${JSON.stringify(res.stdout)}（产物 ${quoted}）`)
  }
})
