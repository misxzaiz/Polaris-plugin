/**
 * URL 调试台 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 离线、零依赖。覆盖：结构分解 / query 全展开（重复键/空值）+ 与 %20 语义 /
 * 重建编码归一 / 各段解码对照 / 非法 URL / 重复键警告。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/url-core.js'

test('parseUrl: 结构分解逐项正确', () => {
  const r = core.parseUrl('https://api.example.com:8443/v1/users?tab=a&q=hello#top')
  assert.ok(r.ok)
  assert.equal(r.parts.protocol, 'https')
  assert.equal(r.parts.hostname, 'api.example.com')
  assert.equal(r.parts.port, '8443')
  assert.equal(r.parts.pathname, '/v1/users')
  assert.equal(r.parts.search, '?tab=a&q=hello')
  assert.equal(r.parts.hash, '#top')
  assert.equal(r.parts.origin, 'https://api.example.com:8443')
})

test('parseUrl: 默认端口标注', () => {
  const r = core.parseUrl('https://example.com/x')
  assert.equal(r.parts.port, '443(默认)')
  const r2 = core.parseUrl('http://example.com/x')
  assert.equal(r2.parts.port, '80(默认)')
})

test('parseUrl: query 参数全展开（重复键/空值）', () => {
  const r = core.parseUrl('https://x.com/?tag=a&tag=b&empty=&q=hello%20world')
  assert.ok(r.ok)
  assert.deepEqual(r.params, [
    { name: 'tag', value: 'a' },
    { name: 'tag', value: 'b' },
    { name: 'empty', value: '' },
    { name: 'q', value: 'hello world' }, // %20 解码
  ])
})

test('parseUrl: + 语义（query 里 + → 空格）', () => {
  const r = core.parseUrl('https://x.com/?q=a+b&path=/a+b')
  const q = r.params.find((p) => p.name === 'q')
  assert.equal(q.value, 'a b') // query 里 + → 空格
})

test('parseUrl: 重复键警告', () => {
  const r = core.parseUrl('https://x.com/?tag=a&tag=b&other=1')
  assert.deepEqual(core.findDuplicateNames(r.params), ['tag'])
  const report = core.renderReport(r)
  assert.ok(report.includes('重复键') && report.includes('tag'))
})

test('parseUrl: 非法 URL 如实报错', () => {
  assert.equal(core.parseUrl('').ok, false)
  assert.equal(core.parseUrl('not a url').ok, false)
  const r = core.parseUrl('http://')
  assert.equal(r.ok, false)
})

test('buildUrl: 基础重建 + 编码归一', () => {
  const r = core.buildUrl({
    protocol: 'https',
    hostname: 'api.example.com',
    pathname: '/v1/search',
    params: [
      { name: 'q', value: 'hello world&more' },
      { name: 'tag', value: 'a' },
      { name: 'tag', value: 'b' },
    ],
    hash: 'top',
  })
  assert.ok(r.ok, JSON.stringify(r))
  assert.ok(r.url.startsWith('https://api.example.com/v1/search?'))
  assert.ok(r.url.includes('q=hello+world%26more'), '值内 & 转义 + 空格转 +')
  assert.ok(r.url.includes('#top'))
  // 重建后 round-trip 解析参数一致
  const back = core.parseUrl(r.url)
  assert.deepEqual(back.params, [
    { name: 'q', value: 'hello world&more' },
    { name: 'tag', value: 'a' },
    { name: 'tag', value: 'b' },
  ])
})

test('buildUrl: 缺 hostname 报错；无名参数跳过', () => {
  assert.equal(core.buildUrl({ protocol: 'https' }).ok, false)
  const r = core.buildUrl({ hostname: 'x.com', params: [{ name: '', value: 'v' }, { name: 'ok', value: '1' }] })
  assert.ok(r.ok)
  assert.ok(r.url.includes('ok=1'))
  assert.ok(!r.url.includes('=v'))
})

test('decodeSegments: 各段 raw vs 解码对照 + 语义坑标注', () => {
  const r = core.decodeSegments('https://x.com/a%20b/c+d?q=1%2B2&s=x+y')
  assert.ok(r.ok)
  const pathRow = r.rows.find((row) => row.segment === 'pathname')
  assert.equal(pathRow.decoded, '/a b/c+d') // 路径里 + 是字面量
  assert.ok(pathRow.note.includes('+ 不转空格'))
  const qRow = r.rows.find((row) => row.segment === 'query[1] value')
  assert.equal(qRow.raw, '1%2B2') // raw 是编码原样
  assert.equal(qRow.decoded, '1+2') // decoded 是解码产物（%2B → + 字面量）
  const sRow = r.rows.find((row) => row.segment === 'query[2] value')
  assert.equal(sRow.raw, 'x+y') // raw 原样
  assert.equal(sRow.decoded, 'x y') // + → 空格（与 %2B 对照）
})

test('decodeSegments: 非法 % 序列宽容不抛错', () => {
  const r = core.decodeSegments('https://x.com/%E0%A4%A')
  assert.ok(r.ok) // 宽容：原样返回不炸
})

test('renderReport: 完整报告含参数表与空值标注', () => {
  const r = core.parseUrl('https://x.com/p?empty=&v=1')
  const report = core.renderReport(r)
  assert.ok(report.includes('empty = (空值)'))
  assert.ok(report.includes('v = 1'))
  assert.ok(report.includes('query 参数 2 项'))
})
