/**
 * HTTP 头解析台 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 覆盖：头块解析（多值/续行/状态行剥离）/ Cache-Control 指令 / CSP 危险标注 /
 * Retry-After 双形态 / Link / Content-Disposition RFC5987 / Set-Cookie 分离。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/header-core.js'

test('parseHeaderBlock: 多值头保留 + 键小写规范化 + 状态行剥离', () => {
  const raw = 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nSet-Cookie: a=1\r\nSet-Cookie: b=2\r\nX-Multi: one\r\nX-Multi: two\r\n'
  const { headers, order } = core.parseHeaderBlock(core.stripStatusLine(raw))
  assert.equal(headers['content-type'][0], 'application/json')
  assert.equal(headers['set-cookie'].length, 2)
  assert.deepEqual(headers['x-multi'], ['one', 'two'])
  assert.ok(order.includes('set-cookie') && order.includes('content-type'))
})

test('parseHeaderBlock: 续行折叠', () => {
  const { headers } = core.parseHeaderBlock('X-Long: part1\r\n  part2\r\n')
  assert.equal(headers['x-long'][0], 'part1 part2')
})

test('parseCacheControl: 指令语义 + 组合提示', () => {
  const r = core.parseCacheControl('public, max-age=31536000, immutable')
  assert.ok(r.directives.some((d) => d.name === 'max-age' && d.value === '31536000'))
  assert.ok(r.notes.some((n) => n.includes('永久强缓存')))
  const r2 = core.parseCacheControl('no-store')
  assert.ok(r2.notes.some((n) => n.includes('敏感接口')))
})

test('parseCacheControl: 未知指令标注', () => {
  const r = core.parseCacheControl('x-custom-dir, max-age=10')
  const unknown = r.directives.find((d) => d.name === 'x-custom-dir')
  assert.ok(unknown && !unknown.known)
})

test('parseCsp: 方向分解 + 危险源标注 + 缺失提示', () => {
  const r = core.parseCsp("default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.example.com; img-src *")
  const script = r.directives.find((d) => d.name === 'script-src')
  assert.ok(script.dangerous.includes("'unsafe-inline'"))
  assert.ok(r.notes.some((n) => n.includes('危险源')))
  assert.ok(r.notes.some((n) => n.includes('base-uri')))
})

test('parseRetryAfter: 秒数与 HTTP-date 双形态', () => {
  const s = core.parseRetryAfter('120')
  assert.equal(s.kind, 'seconds')
  assert.equal(s.seconds, 120)
  const d = core.parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')
  assert.equal(d.kind, 'http-date')
  assert.ok(typeof d.secondsFromNow === 'number')
  const bad = core.parseRetryAfter('soon')
  assert.equal(bad.kind, 'invalid')
})

test('parseLink: rel 提取 + preload 识别', () => {
  const links = core.parseLink('</style.css>; rel=preload; as=style, </api>; rel=preconnect')
  assert.equal(links.length, 2)
  assert.equal(links[0].rel, 'preload')
  assert.equal(links[1].uri, '/api')
})

test('parseContentDisposition: filename* RFC5987 解码', () => {
  const r = core.parseContentDisposition("attachment; filename=\"fallback.txt\"; filename*=UTF-8''%E6%8A%A5%E5%91%8A.txt")
  assert.equal(r.type, 'attachment')
  assert.equal(r.filename, 'fallback.txt')
  assert.equal(r.filenameUtf8, '报告.txt')
  assert.ok(r.note.includes('RFC5987'))
})

test('splitSetCookie: 逐条分离 + 衔接提示', () => {
  const { headers } = core.parseHeaderBlock('Set-Cookie: sid=abc; HttpOnly\r\nSet-Cookie: pref=dark\r\n')
  const list = core.splitSetCookie(headers)
  assert.equal(list.length, 2)
  assert.equal(list[0].name, 'sid')
  assert.ok(list[0].hint.includes('cookie-lens'))
})
