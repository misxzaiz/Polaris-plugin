/**
 * core.test.mjs —— shared/core 纯函数层单测（node --test，零依赖）
 * 覆盖：SSE 解析器（规范用例 + CRLF + 多行 data + 注释心跳 + BOM + 坏输入宽容）、
 * 掩码、截断、间隔统计、关闭码表、会话/帧投影。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const core = require('../shared/core.js')

// ── SSE 解析器 ──────────────────────────────────────────────────────────────

test('SSE: 基本单事件（event + data + 结束空行）', () => {
  const p = core.createSseParser()
  const evs = p.push('event: msg\ndata: hello\n\n')
  assert.equal(evs.length, 1)
  assert.equal(evs[0].event, 'msg')
  assert.equal(evs[0].data, 'hello')
  assert.equal(evs[0].id, null)
})

test('SSE: 规范样例（多字段、id、retry、默认 event）', () => {
  // WHATWG 规范自带样例
  const p = core.createSseParser()
  const evs = p.push('data: YHOO\nid: 1\nevent: stock\nretry: 1000\n\n')
  assert.equal(evs.length, 1)
  assert.equal(evs[0].data, 'YHOO')
  assert.equal(evs[0].id, '1')
  assert.equal(evs[0].event, 'stock')
  assert.equal(evs[0].retry, 1000)
})

test('SSE: 多行 data 以 \\n join', () => {
  const p = core.createSseParser()
  const evs = p.push('data: line1\ndata:line2\ndata: line3\n\n')
  assert.equal(evs[0].data, 'line1\nline2\nline3')
})

test('SSE: CRLF 与裸 CR 规范化', () => {
  const p = core.createSseParser()
  const evs = p.push('data: a\r\ndata: b\r\n\r\n')
  assert.equal(evs.length, 1)
  assert.equal(evs[0].data, 'a\nb')
  const p2 = core.createSseParser()
  const evs2 = p2.push('data: x\r\rdata: y\r\r')
  assert.equal(evs2.length, 2)
  assert.equal(evs2[0].data, 'x')
  assert.equal(evs2[1].data, 'y')
})

test('SSE: 注释/心跳行忽略但计数（服务器活着没事件的诊断信号）', () => {
  const p = core.createSseParser()
  const evs = p.push(': ping\n: ping\ndata: real\n\n')
  assert.equal(evs.length, 1)
  assert.equal(evs[0].data, 'real')
  assert.equal(p.comments(), 2)
})

test('SSE: 跨 chunk 增量（事件被切断仍正确重组）', () => {
  const p = core.createSseParser()
  assert.equal(p.push('even').length, 0)
  assert.equal(p.push('t: split\nda').length, 0)
  assert.equal(p.push('ta: {"ok":').length, 0)
  const evs = p.push('true}\n\n')
  assert.equal(evs.length, 1)
  assert.equal(evs[0].event, 'split')
  assert.equal(evs[0].data, '{"ok":true}')
})

test('SSE: 无 data 行的完整事件块按规范不派发；未终止块由 flush 宽容派发并标 partial', () => {
  // 规范行为：有终结空行但无 data → 丢弃（WHATWG）
  const p = core.createSseParser()
  assert.equal(p.push('event: only\n\n').length, 0)
  // EOF 语义：块未终结（无空行）→ flush 派发为 partial（诊断价值优先）
  const p2 = core.createSseParser()
  assert.equal(p2.push('event: only\n').length, 0)
  const tail = p2.flush()
  assert.equal(tail.length, 1)
  assert.equal(tail[0].partial, true)
  assert.equal(tail[0].event, 'only')
})

test('SSE: 流结束时悬挂行/事件由 flush 派发（EOF 视为行终止）', () => {
  const p = core.createSseParser()
  assert.equal(p.push('data: dangling').length, 0) // 无结尾换行，仍在行缓冲
  const evs = p.flush()
  assert.equal(evs.length, 1)
  assert.equal(evs[0].data, 'dangling')
})

test('SSE: 前导 BOM 剥离', () => {
  const p = core.createSseParser()
  const evs = p.push('\uFEFFdata: bom\n\n')
  assert.equal(evs[0].data, 'bom')
})

test('SSE: 二进制垃圾输入不抛错（解析器不许成为故障点）', () => {
  const p = core.createSseParser()
  let evs = []
  assert.doesNotThrow(() => {
    evs = p.push('\u0000\u0001\u0002 garbage \n\n\n\ndata: ok\n\n')
  })
  assert.ok(evs.some((e) => e.data === 'ok'))
})

test('SSE: AI 流式接口真实形态（OpenAI 风格 data: [DONE] + JSON 行）', () => {
  const p = core.createSseParser()
  const chunk = 'data: {"id":"c1","choices":[{"delta":{"content":"你"}}]}\n\n'
    + 'data: {"id":"c1","choices":[{"delta":{"content":"好"}}]}\n\n'
    + 'data: [DONE]\n\n'
  const evs = p.push(chunk)
  assert.equal(evs.length, 3)
  assert.equal(JSON.parse(evs[0].data).choices[0].delta.content, '你')
  assert.equal(evs[2].data, '[DONE]')
})

// ── 掩码 ────────────────────────────────────────────────────────────────────

test('掩码: authorization/cookie 恒掩（即使关闭掩码开关）', () => {
  const h = { Authorization: 'Bearer sk-1234567890', Cookie: 'sid=abcdef', 'X-Custom': 'plain' }
  const maskedOff = core.maskHeaders(h, false)
  assert.equal(maskedOff.Authorization, '****7890')
  assert.equal(maskedOff.Cookie, '****cdef')
  assert.equal(maskedOff['X-Custom'], 'plain')
  const maskedOn = core.maskHeaders(h, true)
  assert.equal(maskedOn.Authorization, '****7890')
  assert.equal(maskedOn.Cookie, '****cdef')
  assert.equal(maskedOn['X-Custom'], 'plain')
})

test('掩码: 兜底正则抓住非常见命名（x-tenant-secret 等）', () => {
  const h = { 'X-Tenant-Secret': 'abcdefghijklmnop', 'X-Request-Id': 'abc', 'Client-Passwd': 'zzzz12345678' }
  const m = core.maskHeaders(h, true)
  assert.equal(m['X-Tenant-Secret'], '****mnop')
  assert.equal(m['X-Request-Id'], 'abc')
  assert.equal(m['Client-Passwd'], '****5678')
})

test('掩码: 短值全掩（≤4 位不漏尾）', () => {
  assert.equal(core.maskValue('abc'), '****')
  assert.equal(core.maskValue(''), '****')
  assert.equal(core.maskValue('abcd'), '****')
  assert.equal(core.maskValue('abcde'), '****bcde')
})

// ── 统计 / 截断 / 关闭码 ────────────────────────────────────────────────────

test('gapStats: min/median/p95/max 有序计算', () => {
  const s = core.gapStats([10, 20, 30, 40, 100, 1000, 5, 7])
  assert.equal(s.count, 8)
  assert.equal(s.min, 5)
  assert.equal(s.max, 1000)
  assert.ok(s.median >= 20 && s.median <= 40)
  assert.ok(s.p95 === 1000) // ceil(0.95*8)-1 = 7 → 最大值
})

test('gapStats: 空数组返回 null；单元素统计自洽', () => {
  assert.equal(core.gapStats([]), null)
  const s = core.gapStats([42])
  assert.equal(s.median, 42)
  assert.equal(s.p95, 42)
})

test('truncateText: 标注截断与原长', () => {
  const t = core.truncateText('a'.repeat(100), 10)
  assert.equal(t.truncated, true)
  assert.equal(t.size, 100)
  assert.ok(t.text.includes('截断'))
  const t2 = core.truncateText('short', 10)
  assert.equal(t2.truncated, false)
})

test('wsCloseCodeName: 1006 网络中断的中文诊断与私有段', () => {
  assert.ok(core.wsCloseCodeName(1006).includes('网络中断'))
  assert.ok(core.wsCloseCodeName(1008).includes('策略'))
  assert.ok(core.wsCloseCodeName(4999).includes('私有'))
  assert.equal(core.wsCloseCodeName(null), '未携带状态码')
})

// ── 投影 ────────────────────────────────────────────────────────────────────

test('projectFrame: 字段白名单 + 体截断', () => {
  const f = { seq: 3, ts: 1, gapMs: 2, dir: 'in', kind: 'text', text: 'x'.repeat(100), internal: '不该出现', size: 100 }
  const p = core.projectFrame(f, 20)
  assert.equal(p.text.length < 40, true)
  assert.equal(p.truncated, true)
  assert.equal('internal' in p, false)
  assert.equal(p.seq, 3)
})

test('projectSessionForKv: 请求头与握手头掩码、帧尾部保留、原 seq 对齐', () => {
  const session = {
    id: 'sd-x', kind: 'ws', url: 'ws://h/p', title: 't', state: 'closed',
    createdAt: 1, openAt: 2, closedAt: 3, closedReason: 'r',
    request: { headers: { Authorization: 'Bearer sk-9999999999' } },
    handshake: { ok: true, httpStatus: 101, headers: { 'set-cookie': 'sid=abcdefgh' } },
    counters: { in: 1 },
    stats: {},
    nextSeq: 3,
    frames: [
      { seq: 0, ts: 1, gapMs: 0, dir: 'note', kind: 'status', message: 'hi' },
      { seq: 1, ts: 2, gapMs: 1, dir: 'in', kind: 'text', text: 'hello' },
      { seq: 2, ts: 3, gapMs: 1, dir: 'out', kind: 'text', text: 'hi' },
    ],
  }
  const proj = core.projectSessionForKv(session, { bodyCap: 100, tail: 2 })
  assert.equal(proj.request.headers.Authorization, '****9999')
  assert.equal(proj.handshake.headers['set-cookie'], '****efgh') // maskValue=尾4
  assert.equal(proj.frames.length, 2)
  assert.equal(proj.frames[0].seq, 1) // 尾部 2 帧，seq 不重排
})

test('sessionSummary: 不含帧与头（索引轻量）', () => {
  const s = core.sessionSummary({ id: 'a', kind: 'sse', url: 'u', state: 'closed', createdAt: 1, counters: {}, nextSeq: 5, frames: [{ seq: 0 }], request: { headers: { Authorization: 'x'.repeat(40) } } })
  assert.equal(s.frameCount, 5)
  assert.equal('frames' in s, false)
  assert.equal('request' in s, false)
})

test('shortId: base36 时间戳 + 随机段，同毫秒不撞', () => {
  const a = core.shortId()
  const b = core.shortId()
  assert.match(a, /^[a-z0-9]+$/)
  assert.notEqual(a, b)
})
