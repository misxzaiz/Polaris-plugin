// polaris-http 端到端测试（纯逻辑，无 DOM）
// 用 Node.js 运行：node test/e2e.test.js

import { strict as assert } from 'assert'

// === 从源码导入纯逻辑模块 ===
import { tryJSON, parseContentType, formatBytes, formatMs, resolveVars } from '../src/core/http.js'
import { parseCurl, detectImportType, parsePostmanCollection } from '../src/core/parser.js'
import { getByPath, collectPaths, parseFilter, cellMeta, tableCandidates } from '../src/core/json-view.js'
import { clone, store } from '../src/core/store.js'

let passed = 0, failed = 0

function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name) }
  catch (e) { failed++; console.error('  ✗ ' + name + ': ' + e.message) }
}

// === HTTP 客户端 ===
console.log('\n【HTTP 客户端】')
test('tryJSON 有效 JSON', () => { const r = tryJSON('{"a":1}'); assert.ok(r.ok); assert.equal(r.value.a, 1) })
test('tryJSON 无效 JSON', () => { assert.ok(!tryJSON('not json').ok) })
test('parseContentType 标准', () => { const c = parseContentType('application/json; charset=utf-8'); assert.equal(c.mime, 'application/json'); assert.equal(c.charset, 'utf-8') })
test('parseContentType 空', () => { const c = parseContentType(null); assert.equal(c.mime, 'application/octet-stream') })
test('formatBytes', () => { assert.equal(formatBytes(1024), '1.0 KB'); assert.equal(formatBytes(null), '—') })
test('formatMs', () => { assert.equal(formatMs(1000), '1.00 s'); assert.equal(formatMs(null), '—') })
test('resolveVars baseUrl', () => { const e = { baseUrl: 'http://api.test', vars: [] }; assert.equal(resolveVars('{{baseUrl}}/users', e), 'http://api.test/users') })
test('resolveVars variable', () => { const e = { baseUrl: '', vars: [{ enabled: true, key: 'token', value: 'abc' }] }; assert.equal(resolveVars('{{token}}', e), 'abc') })
test('resolveVars unknown', () => { const e = { baseUrl: '', vars: [] }; assert.equal(resolveVars('{{unknown}}', e), '{{unknown}}') })
test('resolveVars no vars', () => { assert.equal(resolveVars('plain text', null), 'plain text') })

// === 解析器 ===
console.log('\n【解析器】')
test('parseCurl GET', () => { const p = parseCurl("curl 'https://api.test/users'"); assert.equal(p.url, 'https://api.test/users'); assert.equal(p.method, 'GET') })
test('parseCurl POST', () => { const p = parseCurl("curl -X POST 'https://api.test' -d '{\"k\":\"v\"}' -H 'Content-Type: application/json'"); assert.equal(p.method, 'POST'); assert.equal(p.bodyType, 'json') })
test('parseCurl with headers', () => { const p = parseCurl("curl 'https://api.test' -H 'Authorization: Bearer x'"); assert.ok(p.headers.length > 0) })
test('detectImportType Postman', () => { assert.equal(detectImportType(JSON.stringify({ info: { name: 'T' }, item: [] })), 'postman') })
test('detectImportType OpenAPI', () => { assert.equal(detectImportType(JSON.stringify({ openapi: '3.0.0', paths: {} })), 'openapi') })
test('detectImportType unknown', () => { assert.equal(detectImportType('{}'), 'unknown') })
test('parsePostmanCollection', () => { const r = parsePostmanCollection({ info: { name: 'Test' }, item: [{ name: 'Req', request: { method: 'GET', url: { raw: 'https://test.com' } } }] }); assert.equal(r.name, 'Test'); assert.equal(r.items.length, 1); assert.equal(r.items[0].method, 'GET') })

// === JSON 视图 ===
console.log('\n【JSON 视图】')
const data = { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }], total: 2 }
test('getByPath root', () => { const r = getByPath(data, 'users'); assert.ok(r.ok); assert.ok(Array.isArray(r.value)) })
test('getByPath nested', () => { const r = getByPath(data, 'users[0].name'); assert.ok(r.ok); assert.equal(r.value, 'Alice') })
test('getByPath missing', () => { assert.ok(!getByPath(data, 'x').ok) })
test('collectPaths', () => { const p = collectPaths(data); assert.ok(p.length >= 3) })
test('parseFilter field:value', () => { const f = parseFilter('name:Alice').ast; assert.equal(f.length, 1); assert.equal(f[0].type, 'field') })
test('parseFilter free text', () => { const f = parseFilter('search text').ast; assert.equal(f.length, 2); assert.equal(f[0].type, 'text') })
test('parseFilter negate prefix', () => { const f = parseFilter('-status:err').ast; assert.equal(f.length, 1); assert.equal(f[0].type, 'field') }) // 被解析为 field "-status" 值 "err"
test('cellMeta number', () => { const c = cellMeta(42, 'count', true); assert.equal(c.kind, 'number') }) // 传数字，非字符串
test('cellMeta image', () => { const c = cellMeta('https://example.com/img.png', 'image', true); assert.ok(['image', 'link'].includes(c.kind)) })
test('tableCandidates array', () => { const c = tableCandidates([{ a: 1 }, { a: 2 }]); assert.ok(Array.isArray(c)); assert.ok(c.length > 0) })
test('tableCandidates object', () => { assert.equal(tableCandidates({ a: 1 }).length, 0) })

// === Store ===
console.log('\n【Store】')
test('clone deep', () => { const o = { a: { b: 1 } }; const c = clone(o); c.a.b = 2; assert.equal(o.a.b, 1) })
test('clone null/undefined', () => { assert.equal(clone(undefined), undefined) })
test('store get/set', () => { store.set('test', { x: 1 }); assert.equal(store.get('test').x, 1) })
test('store returns clone', () => { const v = store.get('test'); v.x = 2; assert.equal(store.get('test').x, 1) })

// === 汇总 ===
console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===`)
process.exit(failed > 0 ? 1 : 0)