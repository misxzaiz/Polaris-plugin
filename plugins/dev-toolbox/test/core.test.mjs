// dev-toolbox 核心纯函数单测（离线，不依赖宿主）
// 策略：esbuild 把 src/core/index.ts 打成临时 CJS 后 require；MD5/SHA/HMAC 用 node:crypto 交叉验证
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import crypto from 'node:crypto'

const tmp = mkdtempSync(join(tmpdir(), 'dtb-core-'))
buildSync({
  entryPoints: ['src/core/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: join(tmp, 'core.cjs'),
  logLevel: 'silent',
})
const core = createRequire(import.meta.url)(join(tmp, 'core.cjs'))

test.after?.(() => {
  try {
    rmSync(tmp, { recursive: true, force: true })
  } catch {}
})

// ---------- Base64 ----------
test('base64: RFC 4648 向量', () => {
  const cases = [
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ]
  for (const [plain, encoded] of cases) {
    assert.equal(core.utf8ToBase64(plain), encoded, plain)
    assert.equal(core.base64ToUtf8(encoded).text, plain, encoded)
  }
})

test('base64: UTF-8 多字节（中文/四字节生僻字/换行制表符）往返', () => {
  const samples = ['你好，世界', '\u{20000}\u{20001}田穌', '中文mix', 'a b', 'line\nbreak\ttab']
  for (const s of samples) {
    assert.equal(core.base64ToUtf8(core.utf8ToBase64(s)).text, s, JSON.stringify(s))
    assert.equal(core.base64ToUtf8(core.utf8ToBase64(s)).replacedChars, 0)
  }
})

test('base64: URL-safe 变体与填充容错', () => {
  const text = 'subjects?_il.legal+chars/here'
  const std = core.utf8ToBase64(text)
  const urlSafe = core.utf8ToBase64(text, true)
  assert.ok(!urlSafe.includes('+') && !urlSafe.includes('/'))
  assert.equal(core.base64ToUtf8(urlSafe).text, text)
  assert.equal(core.base64ToUtf8(std.replaceAll('=', '')).text, text)
  assert.equal(core.base64ToUtf8(std.slice(0, 4) + '\n' + std.slice(4)).text, text)
})

test('base64: 与 node:crypto 编码一致（200 例随机）+ 非法输入报错', () => {
  for (let i = 0; i < 200; i++) {
    const bytes = crypto.randomBytes(Math.floor(Math.random() * 100))
    assert.equal(core.bytesToBase64(new Uint8Array(bytes)), bytes.toString('base64'))
  }
  assert.throws(() => core.base64ToUtf8('A@C='), /非 Base64/)
  assert.throws(() => core.base64ToUtf8('ABCDE'), /长度非法/)
})

test('url: 严格解码与表单语义分离', () => {
  assert.equal(core.urlEncode('a b&c=中文'), 'a%20b%26c%3D%E4%B8%AD%E6%96%87')
  const r = core.urlDecode('a%20b%26c%3D%E4%B8%AD%E6%96%87')
  assert.equal(r.text, 'a b&c=中文')
  assert.equal(r.textForm, 'a b&c=中文')
  assert.equal(r.strictFailed, false)
  // RFC 3986 语义：+ 是字面加号；表单语义才当空格
  const plus = core.urlDecode('a+b%20c')
  assert.equal(plus.text, 'a+b c')
  assert.equal(plus.textForm, 'a b c')
  assert.throws(() => core.urlDecode('%E4%BD'), /URL 解码失败/)
})

// ---------- MD5 ----------
test('md5: RFC 1321 官方向量（abc 向量以 node:crypto 为准——RFC 1321 印刷版该向量有误）', () => {
  const vectors = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    // 注意：RFC 1321 文本里写的是 900150983246c8d0d1c2ff5ee4483fc8，与所有真实实现不符，属文档勘误
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a'],
  ]
  for (const [msg, digest] of vectors) {
    assert.equal(core.md5(msg), digest, msg)
    // 双保险：每个向量同时与 node:crypto 对齐
    assert.equal(core.md5(msg), crypto.createHash('md5').update(msg, 'utf8').digest('hex'), msg)
  }
})

test('md5: 与 node:crypto 交叉验证（填充边界长度与 UTF-8）', () => {
  const boundaryLens = [0, 1, 2, 3, 31, 32, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 255, 1000]
  for (const len of boundaryLens) {
    const s = 'x'.repeat(len)
    assert.equal(core.md5(s), crypto.createHash('md5').update(s, 'utf8').digest('hex'), 'len=' + len)
  }
  for (let i = 0; i < 60; i++) {
    const s = crypto.randomBytes(Math.floor(Math.random() * 300)).toString('hex') + (i % 2 ? '你好中' : '')
    assert.equal(core.md5(s), crypto.createHash('md5').update(s, 'utf8').digest('hex'))
  }
})

// ---------- SHA / HMAC ----------
test('sha: 与 node:crypto 交叉验证', async () => {
  const samples = ['', 'abc', '中文内容 mixed 中文', 'x'.repeat(1000)]
  for (const alg of ['sha1', 'sha256', 'sha384', 'sha512']) {
    for (const s of samples) {
      assert.equal(
        await core.shaHex(alg, s),
        crypto.createHash(alg).update(s, 'utf8').digest('hex'),
        alg + ' ' + s.slice(0, 12),
      )
    }
  }
})

test('hmac: RFC 4231 向量 + node:crypto 交叉验证', async () => {
  assert.equal(
    // RFC 4231 TC1 的密钥是 0x0B 重复 20 字节（不是字符串 key）；U+000B 的 UTF-8 编码即 0x0B
    await core.hmacHex('sha256', 'Hi There', String.fromCharCode(0x0b).repeat(20)),
    'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
  )
  assert.equal(
    await core.hmacHex('sha256', 'what do ya want for nothing?', 'Jefe'),
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
  )
  for (let i = 0; i < 20; i++) {
    const msg = crypto.randomBytes(64).toString('hex')
    const key = crypto.randomBytes(32).toString('hex')
    assert.equal(
      await core.hmacHex('sha256', msg, key),
      crypto.createHmac('sha256', key).update(msg, 'utf8').digest('hex'),
    )
  }
})

// ---------- UUID ----------
test('uuid: v4 格式与版本/变体位、10k 唯一性', () => {
  const seen = new Set()
  for (let i = 0; i < 10000; i++) {
    const u = core.uuidV4()
    assert.match(u, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, u)
    seen.add(u)
  }
  assert.equal(seen.size, 10000)
})

test('uuid: v7 时间戳编码正确且同毫秒单调', () => {
  const before = Date.now()
  const list = Array.from({ length: 200 }, () => core.uuidV7())
  const after = Date.now()
  for (const u of list) {
    assert.match(u, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, u)
    const ts = parseInt(u.slice(0, 8) + u.slice(9, 13), 16)
    assert.ok(ts >= before - 1 && ts <= after + 1, 'ts=' + ts + ' 窗口 [' + before + ', ' + after + ']')
  }
  const sorted = [...list].sort()
  assert.deepEqual(list, sorted, '同毫秒生成的 v7 应按时间序单调')
  const u = core.uuidV7(1700000000000)
  assert.equal(parseInt(u.slice(0, 8) + u.slice(9, 13), 16), 1700000000000)
})

test('uuid: parseUuid 与 NIL', () => {
  assert.equal(core.NIL_UUID, '00000000-0000-0000-0000-000000000000')
  const p = core.parseUuid(core.uuidV4())
  assert.equal(p.ok, true)
  assert.equal(p.version, 4)
  assert.equal(core.parseUuid('not-a-uuid').ok, false)
  assert.equal(core.parseUuid('{' + core.uuidV4() + '}').ok, true, '花括号形式应可解析')
})

// ---------- JWT ----------
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')
}
function makeJwt(header, payload, signature = 'sig') {
  return b64url(header) + '.' + b64url(payload) + '.' + signature
}

test('jwt: 解码 claims 与过期态', () => {
  const now = Math.floor(Date.now() / 1000)
  const token = makeJwt(
    { alg: 'HS256', typ: 'JWT' },
    { sub: 'user-1', name: '张三', iat: now - 3600, exp: now + 3600 },
  )
  const d = core.decodeJwt(token)
  assert.equal(d.header.alg, 'HS256')
  assert.equal(d.payload.sub, 'user-1')
  assert.equal(d.payload.name, '张三')
  assert.equal(d.expiryState, 'valid')
  assert.match(d.expiryDetail, /还有/)
  const expired = core.decodeJwt(makeJwt({ alg: 'HS256' }, { exp: now - 86400 * 3 }))
  assert.equal(expired.expiryState, 'expired')
  assert.match(expired.expiryDetail, /已过期/)
  const noExp = core.decodeJwt(makeJwt({}, {}))
  assert.equal(noExp.expiryState, 'no-exp')
  assert.equal(core.decodeJwt(makeJwt({}, { exp: 'not-a-number' })).expiryState, 'no-exp')
})

test('jwt: 非法输入报错清晰', () => {
  assert.throws(() => core.decodeJwt('abc.def'), /3 段/)
  assert.throws(() => core.decodeJwt('a.b.c.d'), /3 段/)
  assert.throws(() => core.decodeJwt('!!!.e30.x'), /base64url/)
  assert.throws(() => core.decodeJwt(''), /为空/)
  const arrPayload = Buffer.from('[1,2]', 'utf8').toString('base64url')
  assert.throws(() => core.decodeJwt('e30.' + arrPayload + '.x'), /JSON 对象/)
})

test('jwt: HS256 验签正确与篡改检出（node:crypto 做真值）', async () => {
  const secret = 'shhh-secret'
  const header = b64url({ alg: 'HS256', typ: 'JWT' })
  const payload = b64url({ sub: 'a', exp: Math.floor(Date.now() / 1000) + 600 })
  const signingInput = header + '.' + payload
  const sig = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url')
  const ok = await core.verifyJwtHs(signingInput + '.' + sig, secret)
  assert.deepEqual(ok, { ok: true, detail: 'HS256 验签通过' })
  const tampered = await core.verifyJwtHs(signingInput + '.' + sig, 'wrong-secret')
  assert.equal(tampered.ok, false)
  const flipped = await core.verifyJwtHs(header + '.' + b64url({ sub: 'a', exp: 1 }) + '.' + sig, secret)
  assert.equal(flipped.ok, false)
  const rs256 = await core.verifyJwtHs(makeJwt({ alg: 'RS256' }, {}), secret)
  assert.equal(rs256.ok, false)
  assert.match(rs256.detail, /只支持 HS/)
})

// ---------- 时间戳 ----------
test('time: 单位自动识别与格式化', () => {
  const info = core.analyzeTimestamp('1700000000')
  assert.equal(info.unit, 's')
  assert.equal(info.epochMs, 1700000000000)
  assert.equal(info.isoUtc, '2023-11-14T22:13:20.000Z')
  const msInfo = core.analyzeTimestamp('1700000000123')
  assert.equal(msInfo.unit, 'ms')
  assert.equal(msInfo.epochMs, 1700000000123)
  const usInfo = core.analyzeTimestamp('1700000000123456')
  assert.equal(usInfo.unit, 'us')
  assert.equal(usInfo.epochMs, 1700000000123)
  const forced = core.analyzeTimestamp('1700000000', 'ms')
  assert.equal(forced.unit, 'ms')
  assert.equal(forced.epochMs, 1700000000)
  assert.equal(core.analyzeTimestamp('abc').ok, false)
  assert.equal(core.analyzeTimestamp('').ok, false)
})

test('time: 相对时间（显式传 now 避免时钟竞态）与日期选择器往返', () => {
  const now = 1700000000000
  assert.match(core.relativeTime(now - 3600e3, now), /1 小时前/)
  assert.match(core.relativeTime(now + 86400e3, now), /1 天后/)
  assert.match(core.relativeTime(now + 86400e3 * 7, now), /1 周后/)
  assert.match(core.relativeTime(now, now), /刚刚/)
  assert.match(core.relativeTime(now - 86400e3 * 400, now), /年前/)
  const ms = 1700000000123
  const input = core.epochMsToDateInput(ms)
  assert.equal(core.dateInputToEpochMs(input), ms)
  assert.equal(core.dateInputToEpochMs('garbage'), null)
})

// ---------- JSON ----------
test('json: 格式化/压缩/键排序/错误定位', () => {
  const pretty = core.formatJson('{"b":1,"a":{"d":2,"c":[3,1]}}')
  assert.equal(pretty.ok, true)
  assert.equal(pretty.output, '{\n  "b": 1,\n  "a": {\n    "d": 2,\n    "c": [\n      3,\n      1\n    ]\n  }\n}')
  const sorted = core.formatJson('{"b":1,"a":{"d":2,"c":[3,1]}}', { sortKeys: true })
  assert.equal(sorted.output, '{\n  "a": {\n    "c": [\n      3,\n      1\n    ],\n    "d": 2\n  },\n  "b": 1\n}')
  const min = core.formatJson('{\n  "a" : 1\n}', { minify: true })
  assert.equal(min.output, '{"a":1}')
  // 单行错误带 position → 应换算出行列
  const bad2 = core.formatJson('{"a":1,,}')
  assert.equal(bad2.ok, false)
  assert.ok(bad2.error)
  assert.equal(bad2.errorLine, 1)
  assert.ok(bad2.errorColumn >= 7 && bad2.errorColumn <= 9, 'col=' + bad2.errorColumn)
  // 多行报错：V8 某些消息形态不含 position——有定位就校验，无定位也必须给出错误信息
  const badMulti = core.formatJson('{\n  "a": 1,\n  "b": ,\n}')
  assert.equal(badMulti.ok, false)
  assert.ok(badMulti.error)
  if (badMulti.errorLine !== undefined) {
    assert.ok(badMulti.errorLine >= 2 && badMulti.errorLine <= 4, 'line=' + badMulti.errorLine)
  }
})

// ---------- YAML ----------
test('yaml: yaml→json 与 json→yaml 往返', () => {
  const r1 = core.yamlToJson('name: 测试\nitems:\n  - 1\n  - two\ncount: 3')
  assert.equal(r1.ok, true)
  assert.deepEqual(JSON.parse(r1.output), { name: '测试', items: [1, 'two'], count: 3 })
  const r2 = core.jsonToYaml('{"nested":{"a":[1,2]},"ok":true}')
  assert.equal(r2.ok, true)
  const back = core.yamlToJson(r2.output)
  assert.deepEqual(JSON.parse(back.output), { nested: { a: [1, 2] }, ok: true })
  assert.equal(core.yamlToJson('a:\n b: 1\n  c: 2').ok, false, '缩进错误应报错')
  assert.equal(core.jsonToYaml('not json').ok, false)
  // js-yaml 4 默认 schema 是 YAML 1.2 core：yes 是字符串不是布尔（口径在 UI 明示）
  assert.equal(JSON.parse(core.yamlToJson('flag: yes').output).flag, 'yes')
})

// ---------- Cron ----------
test('cron: 下次执行与中文描述', () => {
  const r1 = core.analyzeCron('*/5 * * * *', 3)
  assert.equal(r1.ok, true)
  assert.equal(r1.next.length, 3)
  assert.equal(r1.description, '每 5 分钟')
  for (const t of r1.next) assert.match(t, /\d{2}:\d{2}:00/)
  const r2 = core.analyzeCron('30 8 * * 1-5', 5)
  assert.equal(r2.ok, true)
  assert.equal(r2.description, '每周一、周二、周三、周四、周五 08:30')
  for (const t of r2.next) {
    assert.match(t, /周[一二三四五]/)
    assert.match(t, / 08:30:00/)
  }
  const r3 = core.analyzeCron('0 0 1 * *', 2)
  assert.equal(r3.description, '每月 1 日 00:00')
  const rEveryMin = core.analyzeCron('* * * * *', 2)
  assert.equal(rEveryMin.description, '每分钟')
  const rList = core.analyzeCron('0,30 * * * *', 1)
  assert.equal(rList.description, '每小时第 00、30 分')
  const r6 = core.analyzeCron('*/10 * * * * *', 2)
  assert.equal(r6.ok, true)
  assert.equal(r6.hasSeconds, true)
  assert.equal(core.analyzeCron('not a cron').ok, false)
  assert.match(core.analyzeCron('* * * *').error ?? '', /5 段/)
})

// ---------- 正则 ----------
test('regex: 匹配/分组/高亮/替换', () => {
  const r1 = core.testRegex('(\\w+)@(\\w+)\\.com', '', 'mail: a@foo.com, b@bar.com')
  assert.equal(r1.matches.length, 2, '扫描始终列出全部潜在匹配')
  assert.deepEqual(r1.matches[0].groups, ['a', 'foo'])
  assert.ok(r1.segments.some((s) => s.isMatch && s.text === 'a@foo.com'))
  const r2 = core.testRegex('(?<year>\\d{4})-(?<month>\\d{2})', '', '2026-11-03')
  assert.deepEqual(r2.matches[0].namedGroups, { year: '2026', month: '11' })
  const r3 = core.testRegex('x', 'g', 'axbxc')
  assert.equal(r3.matches.length, 2)
  assert.equal(core.testRegex('a(b', '').ok, false)
  assert.match(core.testRegex('a', 'x', '').error ?? '', /非法标志/)
  const rep = core.previewReplace('(\\w+)-(\\w+)', 'g', 'foo-bar baz-qux', '$2/$1')
  assert.equal(rep.output, 'bar/foo qux/baz')
  const repNoG = core.previewReplace('(\\w+)-(\\w+)', '', 'foo-bar baz-qux', '$2/$1')
  assert.equal(repNoG.output, 'bar/foo baz-qux', '无 g 标志替换遵循 JS 真实语义')
  const zero = core.testRegex('a*', 'g', 'bbb')
  assert.ok(zero.ok && zero.matches.length >= 3, '零长匹配不死循环')
  assert.equal(core.testRegex('a.c', '', 'a\nc').matches.length, 0, 'JS 的 . 不匹配换行')
  assert.equal(core.testRegex('a.c', 's', 'a\nc').matches.length, 1)
  const many = core.testRegex('\\d', 'g', '1'.repeat(2000))
  assert.equal(many.matches.length, 500)
  assert.equal(many.truncated, true)
})

// ---------- 命名风格 ----------
test('case: 切词与各风格', () => {
  const r = core.convertCase('XMLHttpRequest')
  assert.deepEqual(r.words, ['XML', 'Http', 'Request'])
  assert.equal(r.snake, 'xml_http_request')
  assert.equal(r.camel, 'xmlHttpRequest')
  assert.equal(r.pascal, 'XmlHttpRequest')
  const r2 = core.convertCase('user_ID2')
  assert.deepEqual(r2.words, ['user', 'ID2'])
  assert.equal(r2.kebab, 'user-id2')
  const r3 = core.convertCase('foo2Bar-baz.qux')
  assert.deepEqual(r3.words, ['foo2', 'Bar', 'baz', 'qux'])
  assert.equal(r3.constant, 'FOO2_BAR_BAZ_QUX')
  const r4 = core.convertCase('hello world')
  assert.equal(r4.camel, 'helloWorld')
  assert.equal(core.convertCase('').words.length, 0)
})

// ---------- 进制 ----------
test('radix: 常规向量与大数（BigInt）', () => {
  const r = core.convertRadix('ff', 16)
  assert.equal(r.decimal, '255')
  assert.equal(r.binary, '11111111')
  assert.equal(r.octal, '377')
  assert.equal(r.hex, 'FF')
  assert.equal(r.bitLength, 8)
  const big = core.convertRadix('1180591620717411303424', 10) // 2^70
  assert.equal(big.binary, '1' + '0'.repeat(70))
  assert.equal(core.convertRadix('z', 36).decimal, '35')
  assert.equal(core.convertRadix('-10', 2).negative, true)
  assert.equal(core.convertRadix('-10', 2).decimal, '-2')
  assert.equal(core.convertRadix('2', 2).ok, false)
  assert.match(core.convertRadix('1g', 16).error ?? '', /超出/)
  assert.match(core.convertRadix('1@', 16).error ?? '', /不是合法数字字符/)
  assert.equal(core.convertRadix('FF', 16).decimal, '255', '大写也应接受')
  assert.equal(core.convertRadix('1010_1010', 2).decimal, '170', '下划线分隔应被容忍')
})

// ---------- 颜色 ----------
function cssHslSafe(r, g, b) {
  const c = core.parseColor('rgb(' + r + ', ' + g + ', ' + b + ')')
  return 'hsl(' + c.hsl.h + ', ' + c.hsl.s + '%, ' + c.hsl.l + '%)'
}

test('color: hex/rgb/hsl 三向转换', () => {
  const c1 = core.parseColor('#0369a1')
  assert.equal(c1.ok, true)
  assert.equal(c1.rgb.r, 3)
  assert.equal(c1.rgb.g, 105)
  assert.equal(c1.rgb.b, 161)
  assert.equal(c1.hex, '#0369a1')
  const c2 = core.parseColor('rgb(3, 105, 161)')
  assert.equal(c2.hex, '#0369a1')
  const c3 = core.parseColor('#abc')
  assert.equal(c3.rgb.r, 170)
  assert.equal(c3.rgb.g, 187)
  assert.equal(c3.rgb.b, 204)
  const c4 = core.parseColor(cssHslSafe(3, 105, 161))
  assert.ok(Math.abs(c4.rgb.b - 161) <= 1, 'hsl 往返允许 8-bit 量化漂移 ±1：' + c4.hex)
  assert.equal(core.parseColor('#12345').ok, false)
  assert.equal(core.parseColor('rgb(300,0,0)').ok, false)
  assert.equal(core.parseColor('nonsense').ok, false)
  assert.equal(core.parseColor('#ffffff').contrastText, '#000000')
  assert.equal(core.parseColor('#000000').contrastText, '#ffffff')
})
