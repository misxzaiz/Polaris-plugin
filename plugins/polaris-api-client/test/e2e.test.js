import { strict as assert } from 'assert'
import { parseCurl, toCurl, generateCode, detectImportType } from '../src/core/parser.js'
import { tryJSON, BINARY } from '../src/core/http.js'
import { clone, store } from '../src/core/store.js'

let passed = 0, failed = 0

function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name) } catch (e) { failed++; console.error('  ✗ ' + name + ': ' + e.message) } }

console.log('\n【HTTP 客户端】')
test('tryJSON 有效', () => { const r = tryJSON('{"a":1}'); assert.ok(r.ok); assert.equal(r.value.a, 1) })
test('tryJSON 无效', () => { assert.ok(!tryJSON('not json').ok) })
test('BINARY 检测', () => { assert.ok(BINARY.test('image/png')) })

console.log('\n【解析器】')
test('parseCurl GET', () => { const p = parseCurl("curl 'https://api.test/users'"); assert.equal(p.method, 'GET') })
test('parseCurl POST', () => { const p = parseCurl("curl -X POST 'https://api.test' -d '{\"k\":\"v\"}' -H 'Content-Type: application/json'"); assert.equal(p.method, 'POST'); assert.equal(p.bodyType, 'json') })
test('parseCurl POST without -X', () => { const p = parseCurl("curl 'https://api.test' -d '{\"k\":\"v\"}'"); assert.equal(p.method, 'POST') })
test('detectImportType Postman', () => { assert.equal(detectImportType(JSON.stringify({ info: { name: 'T' }, item: [] })), 'postman') })
test('detectImportType OpenAPI', () => { assert.equal(detectImportType(JSON.stringify({ openapi: '3.0.0', paths: {} })), 'openapi') })
test('parseCurl with data before URL', () => { const p = parseCurl("curl -d '{\"a\":1}' http://api.example.com"); assert.equal(p.method, 'POST') })

console.log('\n【Store】')
test('clone', () => { const o = { a: { b: 1 } }; const c = clone(o); c.a.b = 2; assert.equal(o.a.b, 1) })
test('store get/set', () => { store.set('test', { x: 1 }); assert.equal(store.get('test').x, 1) })
test('store returns clone', () => { store.set('test2', { x: 1 }); const v = store.get('test2'); v.x = 2; assert.equal(store.get('test2').x, 1) })

console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===`)
process.exit(failed > 0 ? 1 : 0)