/**
 * 离线单测（零依赖零 mock）：node test/run-tests.mjs
 * 覆盖 core.js 全部业务规则——settings 归一化、body 分类截断、hop-by-hop、
 * 环形缓冲分块、cURL、统计、搜索、JSONL 解析。
 */
import assert from 'node:assert'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const core = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'core.js'))

const results = []
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }) } catch (e) { results.push({ name, pass: false, detail: e.message }) }
}
const tA = (name, fn) => t(name, fn) // 同步即可，全部纯函数

// ── id / secret ───────────────────────────────────────────────────────────
tA('newId 形如时间-随机且唯一', () => {
  const a = core.newId(), b = core.newId()
  assert.match(a, /^[0-9a-z]+-[0-9a-f]{10}$/)
  assert.notStrictEqual(a, b)
})
tA('newSecret 为 12 位 hex 且通过校验', () => {
  const s = core.newSecret()
  assert.ok(core.isValidSecret(s))
  assert.ok(!core.isValidSecret('zzzz'))
})

// ── validateForwardUrl ────────────────────────────────────────────────────
tA('validateForwardUrl：空=ok，http/内网/localhost 放行，非 http 拒绝', () => {
  assert.ok(core.validateForwardUrl('').ok)
  assert.ok(core.validateForwardUrl('http://127.0.0.1:3000/pay/notify').ok)
  assert.ok(core.validateForwardUrl('https://api.example.com/hook').ok)
  assert.ok(!core.validateForwardUrl('file:///etc/passwd').ok)
  assert.ok(!core.validateForwardUrl('javascript:alert(1)').ok)
  assert.ok(!core.validateForwardUrl('ftp://x').ok)
  assert.ok(!core.validateForwardUrl('not a url').ok)
})

// ── settings / 桶 ─────────────────────────────────────────────────────────
tA('normalizeSettings(null) 返回空默认', () => {
  const s = core.normalizeSettings(null)
  assert.strictEqual(s.version, 1)
  assert.deepStrictEqual(s.buckets, [])
  assert.strictEqual(s.retention.maxPerBucket, 200)
})
tA('normalizeSettings：非法桶被剔除、重复 secret 剔除、保留合法桶', () => {
  const s = core.normalizeSettings({
    buckets: [
      { id: 'pay', name: '支付', secret: core.newSecret(), createdAt: 1, responseMode: 'fixed', fixedStatus: 200, forwardUrl: '' },
      { id: 'BAD ID!', secret: core.newSecret() },
      { id: 'dup', secret: 'aaaaaaaaaaaa' },
      { id: 'dup2', secret: 'aaaaaaaaaaaa' },
      null,
    ],
  })
  assert.strictEqual(s.buckets.length, 2)
  assert.strictEqual(s.buckets[0].id, 'pay')
  assert.strictEqual(s.buckets[0].name, '支付')
})
tA('normalizeSettings：forward 模式无 URL 自动降级 fixed', () => {
  const s = core.normalizeSettings({ buckets: [{ id: 'a', secret: core.newSecret(), responseMode: 'forward', forwardUrl: '' }] })
  assert.strictEqual(s.buckets[0].responseMode, 'fixed')
})
tA('normalizeSettings：非法 forwardUrl 宽容纠正（不丢整桶），合法 URL 保留', () => {
  const sec = core.newSecret()
  const s = core.normalizeSettings({ buckets: [{ id: 'a', secret: sec, responseMode: 'forward', forwardUrl: 'javascript:alert(1)' }] })
  assert.strictEqual(s.buckets.length, 1)
  assert.strictEqual(s.buckets[0].responseMode, 'fixed')
  assert.strictEqual(s.buckets[0].forwardUrl, '')
  const s2 = core.normalizeSettings({ buckets: [{ id: 'a', secret: sec, responseMode: 'forward', forwardUrl: 'http://127.0.0.1:3000/x' }] })
  assert.strictEqual(s2.buckets[0].responseMode, 'forward')
  assert.strictEqual(s2.buckets[0].forwardUrl, 'http://127.0.0.1:3000/x')
})
tA('normalizeSettings：retention 数值夹取（上限/下限/非法回默认）', () => {
  assert.strictEqual(core.normalizeSettings({ retention: { maxPerBucket: 99999 } }).retention.maxPerBucket, core.MAX_PER_BUCKET_HARD)
  assert.strictEqual(core.normalizeSettings({ retention: { maxPerBucket: 1 } }).retention.maxPerBucket, 10)
  assert.strictEqual(core.normalizeSettings({ retention: { maxPerBucket: 'abc' } }).retention.maxPerBucket, 200)
  assert.strictEqual(core.normalizeSettings({ retention: { bodyCapKb: 999999 } }).retention.bodyCapKb, core.FILE_BODY_MAX_KB)
})
tA('normalizeSettings：fixedStatus 越界回 200，fixedBody 截断 4KB', () => {
  const s = core.normalizeSettings({ buckets: [{ id: 'a', secret: core.newSecret(), fixedStatus: 999, fixedBody: 'x'.repeat(9999) }] })
  assert.strictEqual(s.buckets[0].fixedStatus, 200)
  assert.strictEqual(s.buckets[0].fixedBody.length, 4096)
})
tA('bootstrapSettings：空则补默认桶（secret 合法），已有则保留且不再加', () => {
  const a = core.bootstrapSettings(null)
  assert.strictEqual(a.buckets.length, 1)
  assert.strictEqual(a.buckets[0].id, 'default')
  assert.ok(core.isValidSecret(a.buckets[0].secret))
  const b = core.bootstrapSettings(a)
  assert.strictEqual(b.buckets.length, 1)
  assert.strictEqual(b.buckets[0].secret, a.buckets[0].secret)
})

// ── classifyBody ──────────────────────────────────────────────────────────
tA('classifyBody：JSON 文本解码为 bodyText', () => {
  const r = core.classifyBody('application/json', Buffer.from('{"a":1}', 'utf8'), 1024)
  assert.strictEqual(r.kind, 'text')
  assert.strictEqual(r.bodyText, '{"a":1}')
  assert.strictEqual(r.truncated, false)
  assert.strictEqual(r.size, 7)
})
tA('classifyBody：超出上限截断并标记', () => {
  const buf = Buffer.from('x'.repeat(100), 'utf8')
  const r = core.classifyBody('text/plain', buf, 40)
  assert.strictEqual(r.truncated, true)
  assert.strictEqual(r.bodyText.length, 40)
  assert.strictEqual(r.size, 100)
})
tA('classifyBody：二进制 content-type 走 base64', () => {
  const bin = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])
  const r = core.classifyBody('application/octet-stream', bin, 1024)
  assert.strictEqual(r.kind, 'binary')
  assert.strictEqual(Buffer.from(r.bodyBase64, 'base64').equals(bin), true)
})
tA('classifyBody：声明文本但解码稀烂判为二进制', () => {
  const junk = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0xff, 0xfd, 0x00, 0x02, 0xff, 0xfc])
  const r = core.classifyBody('text/plain', junk, 1024)
  assert.strictEqual(r.kind, 'binary')
})
tA('classifyBody：空体 kind=empty', () => {
  const r = core.classifyBody('application/json', Buffer.alloc(0), 1024)
  assert.strictEqual(r.kind, 'empty')
})

// ── 捕获归一化 ────────────────────────────────────────────────────────────
tA('normalizeCapture：method 大写、headers 小写合并数组、header 数量截断', () => {
  const headers = { 'X-Multi': ['a', 'b'] }
  for (let i = 0; i < 80; i++) headers[`X-H${i}`] = 'v'
  const r = core.normalizeCapture({ method: 'post', path: '/hook/x', headers, bucketId: 'default' })
  assert.strictEqual(r.method, 'POST')
  assert.strictEqual(r.headers['x-multi'], 'a, b')
  assert.ok(Object.keys(r.headers).length === 60) // 上限 60，先到先得
})
tA('normalizeCapture：path 超长截断到 PATH_CAP', () => {
  const r = core.normalizeCapture({ path: '/' + 'a'.repeat(9999) })
  assert.strictEqual(r.path.length, core.PATH_CAP)
})

// ── hop-by-hop ────────────────────────────────────────────────────────────
tA('filterForwardHeaders：剔除 hop-by-hop（大小写不敏感），保留业务头', () => {
  const out = core.filterForwardHeaders({
    Host: 'tunnel.example.com', 'Content-Length': '5', Connection: 'keep-alive',
    'Transfer-Encoding': 'chunked', 'Wechatpay-Signature': 'abc', 'Content-Type': 'application/json',
  })
  assert.deepStrictEqual(Object.keys(out).sort(), ['Wechatpay-Signature', 'Content-Type'].sort())
})

// ── preview ───────────────────────────────────────────────────────────────
tA('previewForKv：文本预览截断标记；二进制 base64 截断', () => {
  const long = 'y'.repeat(20000)
  const p = core.previewForKv(core.normalizeCapture({ kind: 'text', bodyText: long }), 1024)
  assert.strictEqual(p.bodyText.length, 1024)
  assert.strictEqual(p.previewTruncated, true)
  const bin = core.previewForKv(core.normalizeCapture({ kind: 'binary', bodyBase64: 'z'.repeat(20000) }), 1024)
  assert.strictEqual(bin.bodyBase64.length, 1024)
  assert.strictEqual(bin.previewTruncated, true)
})

// ── 环形缓冲与分块 ────────────────────────────────────────────────────────
tA('applyCapture：新条目在头；按桶限淘汰最旧；不同桶互不影响', () => {
  const mk = (id, bucketId) => core.normalizeCapture({ id, bucketId })
  let ring = []
  ring = core.applyCapture(ring, mk('a1', 'pay'), 2).ring
  ring = core.applyCapture(ring, mk('a2', 'iot'), 2).ring
  ring = core.applyCapture(ring, mk('a3', 'pay'), 2).ring
  ring = core.applyCapture(ring, mk('a4', 'pay'), 2).ring // pay 满 2，淘汰最旧 a1
  assert.deepStrictEqual(ring.map((r) => r.id), ['a4', 'a3', 'a2'])
  const r2 = core.applyCapture(ring, mk('a5', 'pay'), 2)
  assert.strictEqual(r2.evicted, 1)
})
tA('planChunkWrites：块边界正确、收缩时产出删除计划、rec.0 是最新块', () => {
  const mk = (i) => core.normalizeCapture({ id: `id-${String(i).padStart(4, '0')}`, bucketId: 'pay' })
  const ring = Array.from({ length: 45 }, (_, i) => mk(44 - i)) // 最新 id-0044
  const plan = core.planChunkWrites(ring, 1)
  const writes = plan.filter((p) => p.value !== null)
  const dels = plan.filter((p) => p.value === null)
  assert.strictEqual(writes.length, 3) // 45/20 → 3 块
  assert.strictEqual(dels.length, 0)
  assert.strictEqual(writes[0].key, 'whs.rec.0')
  assert.strictEqual(writes[0].value[0].id, 'id-0044')
  assert.strictEqual(writes[0].value.length, core.CHUNK_SIZE)
  assert.strictEqual(writes[2].value.length, 5)
  // 从 3 块收缩到 1 块 → 删 rec.1/rec.2
  const plan2 = core.planChunkWrites(ring.slice(0, 5), 3)
  assert.deepStrictEqual(plan2.filter((p) => p.value === null).map((p) => p.key), ['whs.rec.1', 'whs.rec.2'])
})
tA('readRing：合并分块并按 id 倒序（新在前）', () => {
  const ring = core.readRing({
    'whs.rec.0': [{ id: 'b-new' }, { id: 'b-mid' }],
    'whs.rec.1': [{ id: 'a-old' }],
    'whs.rec.2': 'corrupt',
  })
  assert.deepStrictEqual(ring.map((r) => r.id), ['b-new', 'b-mid', 'a-old'])
})

// ── 展示 ──────────────────────────────────────────────────────────────────
tA('prettyBodyText：JSON 美化、非 JSON 原样、空安全', () => {
  assert.strictEqual(core.prettyBodyText('{"a":1}'), '{\n  "a": 1\n}')
  assert.strictEqual(core.prettyBodyText('plain'), 'plain')
  assert.strictEqual(core.prettyBodyText(''), '')
})
tA('toCurl：host/content-length/connection 被剔除，body 进 --data，单引号转义', () => {
  const rec = core.normalizeCapture({
    method: 'POST', path: '/hook/abc', query: 'a=1',
    headers: { Host: 'x', 'Content-Length': '9', Connection: 'close', 'Wechatpay-Timestamp': '123', 'X-Note': "it's" },
    kind: 'text', bodyText: '{"a":1}',
  })
  const cmd = core.toCurl(rec, '127.0.0.1:9869')
  assert.ok(cmd.includes(`'http://127.0.0.1:9869/hook/abc?a=1'`))
  assert.ok(!cmd.includes('Host:'))
  assert.ok(!cmd.includes('Content-Length'))
  assert.ok(cmd.includes(`-H 'wechatpay-timestamp: 123'`)) // 头键统一小写（语义等价）
  assert.ok(cmd.includes(`'\\''`)) // 单引号转义
  assert.ok(cmd.includes(`--data '{"a":1}'`))
})
tA('matchSearch：path/method/body 大小写不敏感；空串全匹配', () => {
  const rec = core.normalizeCapture({ path: '/hook/aaa', method: 'POST', kind: 'text', bodyText: 'out_trade_no=123' })
  assert.ok(core.matchSearch(rec, 'OUT_TRADE'))
  assert.ok(core.matchSearch(rec, 'post'))
  assert.ok(core.matchSearch(rec, '/hook/aa'))
  assert.ok(!core.matchSearch(rec, 'nothing-matches'))
  assert.ok(core.matchSearch(rec, ''))
})

// ── 统计 ──────────────────────────────────────────────────────────────────
tA('aggregateStats：状态/方法/桶/小时窗/topPaths 全对', () => {
  const now = Date.now()
  const mk = (id, at, status, method, bucketId, path) => core.normalizeCapture({
    id, receivedAt: at, method, bucketId, path,
    responded: status ? { status, mode: 'fixed' } : null,
  })
  const recs = [
    mk('1', now - 1000, 200, 'POST', 'pay', '/hook/aaa'),
    mk('2', now - 2 * 3600e3, 500, 'POST', 'pay', '/hook/aaa'),
    mk('3', now - 30 * 3600e3, 404, 'GET', 'iot', '/hook/bbb'),
    mk('4', now - 1000, null, 'HEAD', 'iot', '/hook/ccc'),
  ]
  const s = core.aggregateStats(recs, now)
  assert.strictEqual(s.total, 4)
  assert.deepStrictEqual(s.byStatus, { '2xx': 1, '3xx': 0, '4xx': 1, '5xx': 1, 其他: 1 })
  assert.strictEqual(s.byMethod.POST, 2)
  assert.strictEqual(s.byBucket.pay, 2)
  assert.strictEqual(s.byHour[23], 2)      // 当前小时 2 条
  assert.strictEqual(s.byHour[21], 1)      // 2h 前 1 条（索引 0=23h 前）
  assert.strictEqual(s.byHour[0], 0)       // 30h 前不计入
  assert.deepStrictEqual(s.topPaths[0], { path: '/hook/aaa', count: 2 })
})

// ── JSONL / 摘要 ──────────────────────────────────────────────────────────
tA('parseJsonlLine：合法/坏行/空行', () => {
  assert.strictEqual(core.parseJsonlLine('{"id":"a"}').id, 'a')
  assert.strictEqual(core.parseJsonlLine('{broken'), null)
  assert.strictEqual(core.parseJsonlLine('  '), null)
  assert.strictEqual(core.parseJsonlLine('{"noId":1}'), null)
})
tA('summarizeRec 含时间/方法/路径/桶/id', () => {
  const s = core.summarizeRec(core.normalizeCapture({ id: 'abc', method: 'POST', path: '/hook/x', bucketId: 'pay', responded: { status: 200, mode: 'fixed' } }))
  assert.ok(s.includes('POST') && s.includes('/hook/x') && s.includes('[pay]') && s.includes('id=abc') && s.includes('200'))
})
tA('pickLanIp：192.168 优先于 10.x，internal 排除', () => {
  const ip = core.pickLanIp({
    eth0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }, { family: 'IPv4', internal: false, address: '10.0.0.5' }],
    wlan0: [{ family: 'IPv4', internal: false, address: '192.168.1.7' }],
  })
  assert.strictEqual(ip, '192.168.1.7')
})

// ── 汇总 ──────────────────────────────────────────────────────────────────
const bad = results.filter((r) => !r.pass)
console.log(results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : `\n    ${r.detail}`}`).join('\n'))
console.log(`\n${results.length - bad.length}/${results.length} 通过`)
process.exit(bad.length ? 1 : 0)
