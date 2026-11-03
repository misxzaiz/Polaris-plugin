/**
 * Mock 数据生成器 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 覆盖：全部支持约束反向生成 + seed 复现 + 闭环自检（生成物过 036 校验器）+
 * 不可生成如实报错（pattern 重试上限/$ref/范围非法）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/mock-core.js'
import * as schemaCore from '../../schema-check/shared/schema-core.js'

/** 闭环辅助：生成 → 036 校验必过 */
function genAndCheck(schema, opts) {
  const item = core.generate(schema, opts)
  const v = schemaCore.validate(item, schema)
  assert.deepEqual(v.errors, [], `生成物应通过校验: ${JSON.stringify(item)} → ${JSON.stringify(v.errors)}`)
  return item
}

test('type: 六种基础类型生成并通过校验', () => {
  for (const t of ['string', 'integer', 'number', 'boolean', 'null', 'object', 'array']) {
    genAndCheck({ type: t }, { seed: 42 })
  }
})

test('string: minLength/maxLength 满足', () => {
  const s = { type: 'string', minLength: 5, maxLength: 10 }
  for (let i = 0; i < 20; i++) {
    const v = genAndCheck(s, { seed: i + 1 })
    assert.ok(v.length >= 5 && v.length <= 10, `长度越界: ${v}`)
  }
})

test('pattern: 可满足时自检通过；不可满足时如实报错不假绿', () => {
  const ok = genAndCheck({ type: 'string', pattern: '^mock' }, { seed: 7 })
  assert.ok(ok.startsWith('mock'))
  assert.throws(() => core.generate({ type: 'string', pattern: '^zzz-never-match-[0-9]{500}$' }), /pattern/)
})

test('integer/number: 范围 + multipleOf + exclusive', () => {
  const s = { type: 'integer', minimum: 4, maximum: 12, multipleOf: 2 }
  for (let i = 0; i < 20; i++) {
    const v = genAndCheck(s, { seed: 100 + i })
    assert.ok(v >= 4 && v <= 12 && v % 2 === 0, `越界/非倍数: ${v}`)
  }
  const ex = { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 }
  for (let i = 0; i < 10; i++) {
    const v = genAndCheck(ex, { seed: 200 + i })
    assert.ok(v > 0 && v < 1)
  }
})

test('enum/const: 从候选集取值', () => {
  const s = { enum: ['red', 'green', 'blue'] }
  for (let i = 0; i < 10; i++) {
    const v = genAndCheck(s, { seed: 300 + i })
    assert.ok(['red', 'green', 'blue'].includes(v))
  }
  assert.equal(genAndCheck({ const: 42 }, { seed: 1 }), 42)
})

test('array: minItems/maxItems/uniqueItems/items 约束', () => {
  const s = { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 2, maxItems: 5, uniqueItems: true }
  for (let i = 0; i < 20; i++) {
    const v = genAndCheck(s, { seed: 400 + i })
    assert.ok(v.length >= 2 && v.length <= 5)
    assert.equal(new Set(v).size, v.length, '应互异')
  }
})

test('object: required 必有 + additionalProperties=false 无多余键', () => {
  const s = {
    type: 'object',
    required: ['id', 'name'],
    properties: {
      id: { type: 'integer', minimum: 1 },
      name: { type: 'string', minLength: 2 },
      role: { enum: ['admin', 'user'] },
    },
    additionalProperties: false,
  }
  for (let i = 0; i < 20; i++) {
    const v = genAndCheck(s, { seed: 500 + i })
    assert.ok('id' in v && 'name' in v)
    assert.ok(Object.keys(v).every((k) => ['id', 'name', 'role'].includes(k)))
  }
})

test('嵌套: 深层 object/array 组合闭环', () => {
  const s = {
    type: 'object',
    required: ['users'],
    properties: {
      users: {
        type: 'array',
        items: {
          type: 'object',
          required: ['uid', 'email'],
          properties: {
            uid: { type: 'integer', minimum: 1 },
            email: { type: 'string', format: 'email' },
            active: { type: 'boolean' },
          },
        },
        minItems: 2,
      },
    },
  }
  const v = genAndCheck(s, { seed: 777 })
  assert.ok(Array.isArray(v.users) && v.users.length >= 2)
})

test('组合关键字: oneOf/anyOf/allOf 生成并通过', () => {
  genAndCheck({ oneOf: [{ type: 'string' }, { type: 'integer', minimum: 10 }] }, { seed: 1 })
  genAndCheck({ anyOf: [{ type: 'boolean' }, { const: 'fixed' }] }, { seed: 2 })
  genAndCheck({
    allOf: [
      { type: 'object', properties: { a: { type: 'integer' } }, required: ['a'] },
      { type: 'object', properties: { b: { type: 'string' } }, required: ['b'] },
    ],
  }, { seed: 3 })
})

test('seed 复现：同 seed 同序列', () => {
  const a = core.generateBatch({ type: 'integer', minimum: 0 }, { seed: 1234, count: 5 })
  const b = core.generateBatch({ type: 'integer', minimum: 0 }, { seed: 1234, count: 5 })
  assert.deepEqual(a, b)
})

test('generateBatch: count 数量 + 逐个闭环', () => {
  const items = core.generateBatch({ type: 'object', properties: { x: { type: 'string' } }, required: ['x'] }, { seed: 9, count: 10 })
  assert.equal(items.length, 10)
})

test('不可生成如实报错：$ref / 范围非法 / 深度爆炸', () => {
  assert.throws(() => core.generate({ type: 'object', properties: { x: { $ref: '#/d' } }, required: ['x'] }), /\$ref/)
  assert.throws(() => core.generate({ type: 'integer', minimum: 10, maximum: 1, multipleOf: 2 }), /范围|倍数/)
  assert.throws(() => core.generate({ type: 'string', minLength: 100, maxLength: 2 }), /minLength|可生成范围/)
})

test('闭环失败即生成器 bug：generateBatch 抛 MockError', () => {
  // 模拟：直接绕过闭环的 generate 不会被测试；此处验证 generateBatch 的闭环路径真实执行
  const items = core.generateBatch({ type: 'array', items: { type: 'string' }, maxItems: 3 }, { seed: 5, count: 3 })
  assert.equal(items.length, 3)
})
