/**
 * JSON Schema 校验器 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 离线、零依赖。覆盖：type/required/properties/items/enum/const/数值范围/
 * 字符串长度/pattern/format/array 约束/additionalProperties/组合关键字/
 * 错误路径定位（JSON Pointer）/不支持 $ref 如实报错/一次报全不短路。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/schema-core.js'

const S = (o) => o

test('type: 基础类型匹配与拒绝', () => {
  const s = S({ type: 'string' })
  assert.equal(core.validate('hi', s).valid, true)
  assert.equal(core.validate(42, s).valid, false)
  const n = S({ type: 'number' })
  assert.equal(core.validate(42, n).valid, true)
  assert.equal(core.validate(42.5, n).valid, true)
  const i = S({ type: 'integer' })
  assert.equal(core.validate(42, i).valid, true)
  assert.equal(core.validate(42.5, i).valid, false)
  const arr = S({ type: ['string', 'null'] })
  assert.equal(core.validate(null, arr).valid, true)
  assert.equal(core.validate('x', arr).valid, true)
  assert.equal(core.validate(1, arr).valid, false)
})

test('required + properties: 缺必填逐项检出且路径定位', () => {
  const s = S({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } }, required: ['a', 'b'] })
  const r = core.validate({ a: 'x' }, s)
  assert.equal(r.valid, false)
  const req = r.errors.find((e) => e.keyword === 'required')
  assert.ok(req && req.message.includes('"b"'), JSON.stringify(r.errors))
})

test('嵌套 properties: 错误路径为 JSON Pointer', () => {
  const s = S({ type: 'object', properties: { user: { type: 'object', properties: { age: { type: 'integer' } }, required: ['age'] } }, required: ['user'] })
  const r = core.validate({ user: { name: 'x' } }, s)
  assert.ok(r.errors.some((e) => e.pointer === '/user' && e.keyword === 'required'))
  const r2 = core.validate({ user: { age: 1.5 } }, s)
  assert.ok(r2.errors.some((e) => e.pointer === '/user/age' && e.keyword === 'type'))
})

test('array items: 元素校验 + 索引路径', () => {
  const s = S({ type: 'array', items: { type: 'integer' } })
  const r = core.validate([1, 2, 'x', 4, 'y'], s)
  assert.equal(r.valid, false)
  const pointers = r.errors.map((e) => e.pointer)
  assert.ok(pointers.includes('/2') && pointers.includes('/4'))
})

test('array 约束: minItems/maxItems/uniqueItems', () => {
  const s = S({ type: 'array', minItems: 2, maxItems: 3, uniqueItems: true })
  assert.equal(core.validate([1, 2], s).valid, true)
  const r = core.validate([1], s)
  assert.ok(r.errors.some((e) => e.keyword === 'minItems'))
  const r2 = core.validate([1, 1, 1, 1], s) // maxItems 4>3 且重复
  assert.ok(r2.errors.some((e) => e.keyword === 'maxItems'))
  assert.ok(r2.errors.some((e) => e.keyword === 'uniqueItems'))
})

test('enum/const: 枚举与常量', () => {
  const s = S({ enum: ['red', 'green', 'blue'] })
  assert.equal(core.validate('red', s).valid, true)
  assert.equal(core.validate('yellow', s).valid, false)
  const c = S({ const: 42 })
  assert.equal(core.validate(42, c).valid, true)
  assert.equal(core.validate(43, c).valid, false)
})

test('数值范围: minimum/maximum/exclusive/multipleOf', () => {
  const s = S({ type: 'number', minimum: 1, maximum: 10, exclusiveMinimum: 1, exclusiveMaximum: 10, multipleOf: 2 })
  const r = core.validate(2, s)
  assert.equal(r.valid, true, JSON.stringify(r.errors))
  const r2 = core.validate(1, s) // <= exclusiveMinimum
  assert.ok(r2.errors.some((e) => e.keyword === 'exclusiveMinimum'))
  const r3 = core.validate(10, s)
  assert.ok(r3.errors.some((e) => e.keyword === 'exclusiveMaximum'))
  const r4 = core.validate(3, s) // 不是 2 的倍数
  assert.ok(r4.errors.some((e) => e.keyword === 'multipleOf'))
})

test('字符串: minLength/maxLength/pattern/format', () => {
  const s = S({ type: 'string', minLength: 2, maxLength: 5, pattern: '^a', format: 'email' })
  const r = core.validate('a@b.c', s) // 长度5 ✓ ^a ✓ email ✓
  assert.equal(r.valid, true, JSON.stringify(r.errors))
  const r2 = core.validate('a', s) // 长度不足 + 非 email（pattern ^a 其实匹配）
  assert.ok(r2.errors.some((e) => e.keyword === 'minLength'))
  assert.ok(r2.errors.some((e) => e.keyword === 'format'))
  const r3 = core.validate('bcd@x.com', s) // pattern 不匹配 + 超长
  assert.ok(r3.errors.some((e) => e.keyword === 'pattern'))
  assert.ok(r3.errors.some((e) => e.keyword === 'maxLength'))
  const dt = S({ type: 'string', format: 'date-time' })
  assert.equal(core.validate('2026-11-04T10:00:00Z', dt).valid, true)
  assert.equal(core.validate('not-a-date', dt).valid, false)
})

test('additionalProperties: false 拒绝多余属性 / schema 校验额外属性', () => {
  const s = S({ type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false })
  const r = core.validate({ a: 'x', extra: 1 }, s)
  assert.ok(r.errors.some((e) => e.keyword === 'additionalProperties' && e.message.includes('extra')))
  const s2 = S({ type: 'object', additionalProperties: { type: 'integer' } })
  const r2 = core.validate({ n: 1 }, s2)
  assert.equal(r2.valid, true)
  const r3 = core.validate({ n: 'str' }, s2)
  assert.ok(r3.errors.some((e) => e.pointer === '/n'))
})

test('组合关键字: allOf/anyOf/oneOf/not', () => {
  const all = S({ allOf: [{ type: 'string' }, { maxLength: 3 }] })
  assert.equal(core.validate('ab', all).valid, true)
  assert.equal(core.validate('abcd', all).valid, false)
  const any = S({ anyOf: [{ type: 'string' }, { type: 'integer' }] })
  assert.equal(core.validate('x', any).valid, true)
  assert.equal(core.validate(true, any).valid, false)
  const one = S({ oneOf: [{ type: 'integer' }, { type: 'number', minimum: 100 }] })
  assert.equal(core.validate(5, one).valid, true) // 只匹配 integer
  const r1 = core.validate(200, one) // integer 与 number(min100) 都匹配 → 2 个 → 失败
  assert.ok(r1.errors.some((e) => e.keyword === 'oneOf'))
  const not = S({ not: { type: 'string' } })
  assert.equal(core.validate(1, not).valid, true)
  assert.equal(core.validate('x', not).valid, false)
})

test('错误不短路：多类错误一次报全', () => {
  const s = S({
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 3 },
      age: { type: 'integer', minimum: 0 },
    },
    required: ['name', 'age', 'email'],
  })
  const r = core.validate({ name: 'a', age: -1 }, s)
  // name 长度 + email 缺失 + age 其实合法（-1 >= 0? 不，-1 < 0 → minimum）
  assert.ok(r.errors.length >= 3, JSON.stringify(r.errors))
  assert.ok(r.errors.some((e) => e.pointer === '/' && e.keyword === 'required' && e.message.includes('email')))
  assert.ok(r.errors.some((e) => e.pointer === '/name' && e.keyword === 'minLength'))
})

test('$ref: 明确不支持并如实报错（不静默跳过）', () => {
  const s = S({ type: 'object', properties: { x: { $ref: '#/definitions/y' } } })
  const r = core.validate({ x: 1 }, s)
  assert.equal(r.valid, false)
  assert.ok(r.errors.some((e) => e.keyword === '$ref'), JSON.stringify(r.errors))
})

test('schema 本身非法：数组 schema 如实报错', () => {
  const r = core.validate(1, [1, 2])
  assert.equal(r.valid, false)
  assert.ok(r.errors.some((e) => e.keyword === 'schema'))
})

test('escapePointer: RFC 6901 转义（~/ ）', () => {
  assert.equal(core.escapePointer('a/b'), 'a~1b')
  assert.equal(core.escapePointer('a~b'), 'a~0b')
})

test('explainSchema: 树形摘要含必填/枚举/范围', () => {
  const s = S({
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'integer', minimum: 1, description: '用户 ID' },
      role: { enum: ['admin', 'user'] },
      tags: { type: 'array', items: { type: 'string' } },
    },
  })
  const out = core.explainSchema(s)
  assert.ok(out.includes('必填 [id]'))
  assert.ok(out.includes('/id'))
  assert.ok(out.includes('枚举'))
  assert.ok(out.includes('用户 ID'))
  assert.ok(out.includes('[]'))
})

test('JSON 字符串形态参数由 server 层 asJson 处理（core 直接收对象）', () => {
  // core 不做字符串解析——边界确认
  const r = core.validate('{"a":1}', S({ type: 'object' }))
  assert.equal(r.valid, false) // 字符串本身不是 object
  assert.ok(r.errors.some((e) => e.keyword === 'type'))
})
