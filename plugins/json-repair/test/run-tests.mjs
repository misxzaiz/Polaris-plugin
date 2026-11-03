/**
 * LLM JSON 修复器 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 覆盖：快速通道 / 围栏剥离 / 装饰文本 / 注释 / 单引号 / 尾逗号 / 控制字符 /
 * 非法字面量 / 未闭合补全 / 组合坏样本 / 不可修如实失败 / 修复产物必合法。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/repair-core.js'

function parse(r) {
  assert.equal(r.ok, true, `修复应成功: ${JSON.stringify(r.error || r.fixes)}`)
  return JSON.parse(r.json)
}

test('快速通道：原样合法 JSON 零修改', () => {
  const r = core.repair('{"a": 1, "b": [true, null]}')
  assert.equal(r.ok, true)
  assert.equal(r.changed, false)
  assert.equal(r.fixes.length, 0)
})

test('markdown 围栏剥离', () => {
  const r = core.repair('```json\n{"a": 1}\n```')
  assert.deepEqual(parse(r), { a: 1 })
  assert.ok(r.fixes.some((f) => f.type === 'fence'))
  const r2 = core.repair('```\n{"b": 2}\n```')
  assert.deepEqual(parse(r2), { b: 2 })
})

test('围栏外装饰文本剥离（LLM 前后废话）', () => {
  const r = core.repair('好的，这是结果：\n{"answer": 42}\n希望有帮助。')
  assert.deepEqual(parse(r), { answer: 42 })
  assert.ok(r.fixes.some((f) => f.type === 'preamble'))
})

test('单引号 → 双引号（键与值）', () => {
  const r = core.repair("{'name': 'Tom', 'age': 5}")
  assert.deepEqual(parse(r), { name: 'Tom', age: 5 })
  assert.ok(r.fixes.every((f) => f.type === 'quote'))
})

test('单引号字符串内含双引号：自动转义', () => {
  const r = core.repair("{'say': 'he said \"hi\"'}")
  assert.deepEqual(parse(r), { say: 'he said "hi"' })
})

test('尾逗号：对象与数组', () => {
  const r = core.repair('{"a": 1, "b": 2,}')
  assert.deepEqual(parse(r), { a: 1, b: 2 })
  const r2 = core.repair('[1, 2, 3,]')
  assert.deepEqual(parse(r2), [1, 2, 3])
})

test('字符串内裸换行/制表符转义', () => {
  const r = core.repair('{"text": "line1\nline2\tend"}')
  const v = parse(r)
  assert.equal(v.text, 'line1\nline2\tend')
  assert.ok(r.fixes.some((f) => f.type === 'control'))
})

test('注释剥离：// 行注释与 /* 块注释（字符串内不动）', () => {
  const r = core.repair('{\n  // 这是注释\n  "a": 1, /* 块注释 */\n  "url": "http://x.com/real"\n}')
  const v = parse(r)
  assert.equal(v.a, 1)
  assert.equal(v.url, 'http://x.com/real') // 字符串内 // 不动
  assert.ok(r.fixes.some((f) => f.type === 'comment'))
})

test('非法字面量：NaN/Infinity/None/undefined → null', () => {
  const r = core.repair('{"x": NaN, "y": Infinity, "z": None, "w": undefined}')
  const v = parse(r)
  assert.equal(v.x, null)
  assert.equal(v.y, null)
  assert.equal(v.z, null)
  assert.equal(v.w, null)
  assert.ok(r.fixes.some((f) => f.type === 'literal'))
})

test('未闭合括号补全（含补全前清尾逗号）', () => {
  const r = core.repair('{"a": {"b": [1, 2')
  const v = parse(r)
  assert.deepEqual(v, { a: { b: [1, 2] } })
  assert.ok(r.fixes.some((f) => f.type === 'close'))
})

test('未闭合字符串补全', () => {
  const r = core.repair('{"text": "未闭合的值')
  const v = parse(r)
  assert.equal(v.text, '未闭合的值')
  assert.ok(r.fixes.some((f) => f.type === 'close'))
})

test('组合坏样本：围栏+单引号+尾逗号+注释一次修好', () => {
  const bad = '```json\n{\n  // config\n  \'name\': \'app\',\n  \'tags\': [\'a\', \'b\',],\n}\n```'
  const r = core.repair(bad)
  const v = parse(r)
  assert.deepEqual(v, { name: 'app', tags: ['a', 'b'] })
  const types = new Set(r.fixes.map((f) => f.type))
  assert.ok(types.has('fence') && types.has('comment') && types.has('quote') && types.has('trailing'))
})

test('裸词键加引号（LLM 无引号键）', () => {
  const r = core.repair('{name: 1, flag: true}')
  const v = parse(r)
  assert.deepEqual(v, { name: 1, flag: true })
  assert.ok(r.fixes.some((f) => f.type === 'quote' && f.excerpt.includes('name')))
})

test('不可修如实失败：不输出半成品', () => {
  // 完全不是 JSON 的散文
  const r = core.repair('这是完全的一段话，没有任何 JSON 结构可言啊')
  assert.equal(r.ok, false)
  assert.ok(r.error && r.error.length > 0)
})

test('修复产物必合法（不变式）：多策略叠加后仍 JSON.parse 通过', () => {
  const cases = [
    "{'a': [1,, 2}",
    '```json\n{"x": "y",}\n```',
    '{"t": "multi\nline", "n": NaN}',
    '[true, false, None, 3,]',
    "{'m': '含\"内嵌\"引号'}",
  ]
  for (const c of cases) {
    const r = core.repair(c)
    if (r.ok) {
      assert.doesNotThrow(() => JSON.parse(r.json), `修复产物应合法: ${r.json}`)
    } else {
      assert.ok(r.error, '失败时必须有 error')
    }
  }
})

test('修复报告渲染：修改点列出与快速通道文案', () => {
  const fast = core.repair('{"ok": 1}')
  assert.ok(core.renderReport(fast).includes('零修改'))
  const fixed = core.repair("{'a': 1,}")
  const report = core.renderReport(fixed)
  assert.ok(report.includes('修改点'))
  assert.ok(report.includes('[pos'))
})

// ── 工具链闭环（与 036 schema-check 组合：repair → validate）────────────────
import * as schemaCore from '../../schema-check/shared/schema-core.js'

test('工具链闭环：repair 产物经 schema-check validate 通过', () => {
  const schema = {
    type: 'object',
    required: ['name', 'tags'],
    properties: {
      name: { type: 'string', minLength: 2 },
      tags: { type: 'array', items: { type: 'string' }, minItems: 1 },
      level: { enum: ['low', 'high'] },
    },
  }
  const bad = "```json\n{'name': 'app', 'tags': ['core',], 'level': low}\n```"
  const r = core.repair(bad)
  assert.equal(r.ok, true, r.error || '修复应成功')
  const v = schemaCore.validate(JSON.parse(r.json), schema)
  assert.equal(v.valid, true, JSON.stringify(v.errors))
})

test('工具链闭环：repair 不动语义，坏值仍被 schema 检出（不假绿）', () => {
  const schema = { type: 'object', properties: { age: { type: 'integer', minimum: 0 } }, required: ['age'] }
  const r = core.repair("{'age': -5}")
  assert.equal(r.ok, true)
  const v = schemaCore.validate(JSON.parse(r.json), schema)
  assert.equal(v.valid, false, '语法修复不改变语义——age=-5 应被 schema 检出')
})
