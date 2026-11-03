/**
 * JWT 调试台 core 逻辑测试（node test/run-tests.mjs）
 *
 * 离线、零依赖。覆盖：
 *   - RFC 7515 A.2 与 jwt.io 两个已知答案向量（独立于本实现的基准，node/WebCrypto 双适配层交叉验证）
 *   - alg=none 拒绝 / 篡改失败 / ES r||s↔DER 互转 / base64url 严格解码
 *   - 审计发现清单（nowMs 注入定格时钟——watchtower summarize 纪律）
 *   - node 适配层签 → WebCrypto 适配层验（跨运行时互操作证据），反之亦然
 *   - 渲染无 undefined/NaN 泄漏（对抗输入）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto, generateKeyPairSync } from 'node:crypto'
import { Buffer } from 'node:buffer'
import * as core from '../shared/jwt-core.js'
import * as nodeCrypto from '../shared/jwt-crypto-node.js'
import * as webCrypto from '../shared/jwt-crypto-web.js'

void webcrypto // node ≥18 自带 globalThis.crypto；import 仅示意 WebCrypto 适配层可跑于 node

// ── 已知答案向量 ────────────────────────────────────────────────────────────

// RFC 7515 Appendix A.2.1：HS256 + JWK（k 为 base64url 的 32 字节密钥）
const RFC7515_A2_TOKEN =
  'eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9' +
  '.' +
  'eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ' +
  '.' +
  'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const RFC7515_A2_JWK = {
  kty: 'oct',
  k: 'AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow',
}

// jwt.io 默认示例：HS256 + secret 字符串
const JWTIO_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.' +
  'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ' +
  '.' +
  'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
const JWTIO_SECRET = 'your-256-bit-secret'

test('KAT RFC 7515 A.2：node 适配层验签通过（oct JWK 的 k 即原始密钥字节）', async () => {
  const secretBytes = core.b64uDecode(RFC7515_A2_JWK.k)
  const r = await core.verifyToken(RFC7515_A2_TOKEN, { secret: secretBytes }, nodeCrypto)
  assert.ok(r.ok, r.error || '')
  assert.equal(r.verified, true, r.reason || '')
  assert.equal(r.alg, 'HS256')
})

test('KAT RFC 7515 A.2：WebCrypto 适配层验签通过（字节密钥）', async () => {
  // oct JWK 的 HMAC 密钥是原始 32 字节——经字符串会被 UTF-8 改写，直接传字节
  const secretBytes = core.b64uDecode(RFC7515_A2_JWK.k)
  const r = await core.verifyToken(RFC7515_A2_TOKEN, { secret: secretBytes }, webCrypto)
  assert.ok(r.ok, r.error || '')
  assert.equal(r.verified, true, r.reason || '')
})

test('KAT jwt.io 默认向量：双适配层验签均通过', async () => {
  for (const [name, ad] of [['node', nodeCrypto], ['web', webCrypto]]) {
    const r = await core.verifyToken(JWTIO_TOKEN, { secret: JWTIO_SECRET }, ad)
    assert.ok(r.ok, `${name}: ${r.error || ''}`)
    assert.equal(r.verified, true, `${name}: ${r.reason || ''}`)
  }
})

test('KAT 篡改 payload：双适配层均验签失败', async () => {
  const segs = JWTIO_TOKEN.split('.')
  // 把 name 值改成别的字符串但保持 base64 合法：换 payload 为 {"sub":"1","name":"Admin","iat":1516239022}
  const forgedPayload = core.b64uEncode(core.utf8Encode(JSON.stringify({ sub: '1234567890', name: 'Admin', iat: 1516239022 })))
  const forged = segs[0] + '.' + forgedPayload + '.' + segs[2]
  for (const ad of [nodeCrypto, webCrypto]) {
    const r = await core.verifyToken(forged, { secret: JWTIO_SECRET }, ad)
    assert.ok(r.ok)
    assert.equal(r.verified, false, '篡改必须失败')
  }
})

// ── alg=none / 结构损坏 ─────────────────────────────────────────────────────

const NONE_TOKEN =
  core.b64uEncode(core.utf8Encode(JSON.stringify({ alg: 'none', typ: 'JWT' }))) +
  '.' +
  core.b64uEncode(core.utf8Encode(JSON.stringify({ sub: 'attacker' }))) +
  '.'

test('alg=none：验签拒绝且原因中文可读', async () => {
  const r = await core.verifyToken(NONE_TOKEN, { secret: 'x' }, nodeCrypto)
  assert.ok(r.ok)
  assert.equal(r.verified, false)
  assert.match(r.reason, /none/)
})

test('alg=none：审计产出 alg_none 高危发现', () => {
  const p = core.parseToken(NONE_TOKEN)
  assert.ok(p.ok)
  const a = core.analyzeClaims(p.header, p.payload, 1700000000000)
  const f = a.findings.find((x) => x.id === 'alg_none')
  assert.ok(f, JSON.stringify(a.findings))
  assert.equal(f.level, 'high')
})

test('五段 JWE / 两段残缺 / 空 header：中文定位', () => {
  assert.match(core.parseToken('a.b.c.d.e').error, /JWE/)
  assert.match(core.parseToken('a.b').error, /三段/)
  assert.match(core.parseToken('.b.c').error, /header 段为空/)
  assert.match(core.parseToken('aaa.bbb.ccc').error, /base64url/)
})

test('payload 非对象 / 非 JSON：中文定位', () => {
  const bad = core.b64uEncode(core.utf8Encode('not-json'))
  assert.match(core.parseToken('e30.' + bad + '.c').error, /payload/)
  const arr = core.b64uEncode(core.utf8Encode('[1,2]'))
  assert.match(core.parseToken('e30.' + arr + '.c').error, /JSON 对象/)
})

// ── base64url 严格解码 ──────────────────────────────────────────────────────

test('base64url：中文 UTF-8 往返 / padding 容忍 / 非法字符与余 1 拒绝', () => {
  const s = '密钥测试 secret-token_123'
  const enc = core.b64uEncode(core.utf8Encode(s))
  assert.equal(core.utf8Decode(core.b64uDecode(enc)), s)
  assert.equal(core.utf8Decode(core.b64uDecode(enc + '=')), s) // 容忍 padding
  assert.throws(() => core.b64uDecode('a+b/'), /非法字符/) // +/ 不属于 base64url
  assert.throws(() => core.b64uDecode('abcde'), /长度非法/) // 余 1
})

test('b64sDecode：标准 base64（PEM 主体）含 +/ 与换行', () => {
  // 0xFB 0xFF 0xBE → 6bit 组 111110/111111/111110/111110 → "+/++"（62,63,62,62）
  const der = core.b64sDecode('+/++\n')
  assert.deepEqual(Array.from(der), [0xfb, 0xff, 0xbe])
})

// ── ES r||s ↔ DER ──────────────────────────────────────────────────────────

test('JOSE↔DER：往返恒等；高位补 0x00 与前导零剥离正确', () => {
  const r = new Uint8Array(64)
  r[0] = 0x00; r[1] = 0xff; r[31] = 0x80 // r 前导零 + s 高位为 1
  for (let i = 32; i < 64; i++) r[i] = 0x01
  const der = core.joseRawToDer(r)
  const back = core.derToJoseRaw(der, 32)
  assert.deepEqual(Array.from(back), Array.from(r))
  assert.equal(der[0], 0x30, 'DER 以 SEQUENCE 开头')
})

test('DER 损坏：中文报错', () => {
  assert.throws(() => core.derToJoseRaw(new Uint8Array([0x03, 0x04, 0, 0, 0, 0]), 32), /DER/)
})

// ── 签发（signToken） ───────────────────────────────────────────────────────

test('signToken：typ/alg 头、iat 自动补、exp 按 expiresInSeconds、nowMs 定格确定性', async () => {
  const now = 1700000000000
  const opts = { nowMs: now, expiresInSeconds: 60 }
  const a = await core.signToken('HS256', { secret: 'test-secret-1234567890' }, { sub: 'u1' }, opts, nodeCrypto)
  const b = await core.signToken('HS256', { secret: 'test-secret-1234567890' }, { sub: 'u1' }, opts, nodeCrypto)
  assert.ok(a.ok, a.error || '')
  assert.equal(a.token, b.token, 'nowMs 定格下签发必须确定')
  assert.deepEqual(a.payload, { sub: 'u1', exp: 1700000060, iat: 1700000000 })
  assert.equal(a.header.alg, 'HS256')
  assert.equal(a.header.typ, 'JWT')
  // 自洽：签出的 token 自己验签通过
  const v = await core.verifyToken(a.token, { secret: 'test-secret-1234567890' }, nodeCrypto)
  assert.equal(v.verified, true)
})

test('signToken：headerExtra 透传（kid）', async () => {
  const r = await core.signToken('HS256', { secret: 'k' }, {}, { headerExtra: { kid: 'k1' } }, nodeCrypto)
  const p = core.parseToken(r.token)
  assert.equal(p.header.kid, 'k1')
})

test('signToken：错误参数中文报错', async () => {
  assert.match((await core.signToken('XX256', { secret: 'k' }, {}, {}, nodeCrypto)).error, /不支持/)
  assert.match((await core.signToken('HS256', {}, {}, {}, nodeCrypto)).error, /secret/)
  assert.match((await core.signToken('HS256', { secret: 'k' }, null, {}, nodeCrypto)).error, /JSON 对象/)
  assert.match((await core.signToken('RS256', {}, {}, {}, nodeCrypto)).error, /私钥/)
})

// ── RS/PS/ES：node 签 → 双适配层验（跨运行时互操作） ─────────────────────────

function makeKeys() {
  return {
    rsa: generateKeyPairSync('rsa', { modulusLength: 2048 }),
    pss: generateKeyPairSync('rsa', { modulusLength: 2048 }),
    ec256: generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
    ec384: generateKeyPairSync('ec', { namedCurve: 'secp384r1' }),
    ec521: generateKeyPairSync('ec', { namedCurve: 'secp521r1' }),
  }
}
const K = makeKeys()

async function roundTrip(alg, pair, coordNote) {
  const privPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const pubPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const payload = { sub: 'cross-adapter', exp: 1900000000 }
  const s = await core.signToken(alg, { privateKeyPem: privPem }, payload, { nowMs: 1700000000000 }, nodeCrypto)
  assert.ok(s.ok, `${alg} 签发失败: ${s.error}`)
  // node 验
  const vNode = await core.verifyToken(s.token, { publicKeyPem: pubPem }, nodeCrypto)
  assert.equal(vNode.verified, true, `${alg} node 验签失败: ${vNode.reason || ''}${coordNote || ''}`)
  // WebCrypto 验（node 签 → web 验：跨运行时）
  const vWeb = await core.verifyToken(s.token, { publicKeyPem: pubPem }, webCrypto)
  assert.equal(vWeb.verified, true, `${alg} WebCrypto 验签失败: ${vWeb.reason || ''}`)
  // 篡改签名最后一字节 → 双层均失败
  const segs = s.token.split('.')
  const sig = core.b64uDecode(segs[2])
  sig[sig.length - 1] ^= 0x01
  const tampered = segs[0] + '.' + segs[1] + '.' + core.b64uEncode(sig)
  for (const [name, ad] of [['node', nodeCrypto], ['web', webCrypto]]) {
    const vt = await core.verifyToken(tampered, { publicKeyPem: pubPem }, ad)
    assert.equal(vt.verified, false, `${alg} 篡改后 ${name} 误判通过`)
  }
  // web 签 → node 验（反方向）
  const sWeb = await core.signToken(alg, { privateKeyPem: privPem }, payload, { nowMs: 1700000000000 }, webCrypto)
  assert.ok(sWeb.ok, `${alg} web 签发失败: ${sWeb.error}`)
  const vCross = await core.verifyToken(sWeb.token, { publicKeyPem: pubPem }, nodeCrypto)
  assert.equal(vCross.verified, true, `${alg} web签→node验 失败: ${vCross.reason || ''}`)
  return s.token
}

test('RS256/RS384/RS512：node签→双适配层验→篡改失败→web签→node验', async () => {
  await roundTrip('RS256', K.rsa)
  await roundTrip('RS384', K.rsa)
  await roundTrip('RS512', K.rsa)
})

test('PS256/PS384/PS512：PSS saltLength=哈希长度，跨适配层互通', async () => {
  await roundTrip('PS256', K.pss)
  await roundTrip('PS384', K.pss)
  await roundTrip('PS512', K.pss)
})

test('ES256/ES384/ES512：JOSE r||s 与 DER 互转正确，跨适配层互通', async () => {
  await roundTrip('ES256', K.ec256)
  await roundTrip('ES384', K.ec384)
  await roundTrip('ES512', K.ec521)
})

test('ES256 签名长度不符：中文定位（应为 64 字节 r||s）', async () => {
  const privPem = K.ec256.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const pubPem = K.ec256.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const s = await core.signToken('ES256', { privateKeyPem: privPem }, { sub: 'x' }, { nowMs: 1700000000000 }, nodeCrypto)
  const segs = s.token.split('.')
  const shortSig = core.b64uEncode(core.b64uDecode(segs[2]).slice(0, 40))
  const r = await core.verifyToken(segs[0] + '.' + segs[1] + '.' + shortSig, { publicKeyPem: pubPem }, nodeCrypto)
  assert.equal(r.verified, false)
  assert.match(r.reason, /64 字节/)
})

test('PEM 主体拆装：与 node 导出 DER 一致', () => {
  const der0 = K.rsa.publicKey.export({ type: 'spki', format: 'der' })
  const pem = K.rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const parsed = core.pemBodyToDer(pem)
  assert.equal(Buffer.from(parsed).equals(der0), true)
})

// ── 审计（nowMs 注入定格时钟） ───────────────────────────────────────────────

const T0 = 1700000000000

function makeToken(claims, header) {
  const h = header || { alg: 'HS256', typ: 'JWT' }
  return core.b64uEncode(core.utf8Encode(JSON.stringify(h))) +
    '.' + core.b64uEncode(core.utf8Encode(JSON.stringify(claims))) + '.c2ln'
}

function ids(a) { return a.findings.map((f) => f.id) }

test('审计：过期/即将过期/未来 iat 随注入时钟切换（定格纪律）', () => {
  const p = core.parseToken(makeToken({ sub: 'u', exp: T0 / 1000 + 120 }))
  const a1 = core.analyzeClaims(p.header, p.payload, T0)
  assert.ok(ids(a1).includes('exp_soon'))
  assert.ok(!ids(a1).includes('exp_expired'))
  const a2 = core.analyzeClaims(p.header, p.payload, T0 + 10 * 60 * 1000)
  assert.ok(ids(a2).includes('exp_expired'))
})

test('审计：exp 缺失 / exp 非数字 / 有效期超长 / iat 未来 / nbf 矛盾 / 外链 / 凭证字段', () => {
  const p1 = core.parseToken(makeToken({ sub: 'u' }))
  assert.ok(ids(core.analyzeClaims(p1.header, p1.payload, T0)).includes('exp_missing'))

  const p2 = core.parseToken(makeToken({ exp: 'tomorrow' }))
  const f2 = core.analyzeClaims(p2.header, p2.payload, T0)
  assert.ok(ids(f2).includes('claim_type'), JSON.stringify(ids(f2)))
  assert.equal(f2.findings.find((x) => x.id === 'claim_type').level, 'high')

  const p3 = core.parseToken(makeToken({ iat: T0 / 1000, exp: T0 / 1000 + 400 * 86400 }))
  assert.ok(ids(core.analyzeClaims(p3.header, p3.payload, T0)).includes('lifetime_long'))

  const p4 = core.parseToken(makeToken({ iat: T0 / 1000 + 3600 }))
  const f4 = core.analyzeClaims(p4.header, p4.payload, T0)
  assert.ok(ids(f4).includes('iat_future'))

  const p5 = core.parseToken(makeToken({ nbf: T0 / 1000 + 3600, exp: T0 / 1000 + 60 }))
  const f5 = core.analyzeClaims(p5.header, p5.payload, T0)
  assert.ok(ids(f5).includes('nbf_after_exp'))
  assert.ok(ids(f5).includes('nbf_not_yet'))

  const p6 = core.parseToken(makeToken({ sub: 'u' }, { alg: 'HS256', jku: 'https://evil.example/key.json' }))
  assert.ok(ids(core.analyzeClaims(p6.header, p6.payload, T0)).includes('jku_external'))

  const p7 = core.parseToken(makeToken({ password: 'hunter2', sub: 'u', exp: T0 / 1000 + 60 }))
  assert.ok(ids(core.analyzeClaims(p7.header, p7.payload, T0)).includes('credential_in_payload'))

  const p8 = core.parseToken(makeToken({ sub: 'u', exp: T0 / 1000 + 60 }, { alg: 'HS256', kid: 'key-1' }))
  assert.ok(ids(core.analyzeClaims(p8.header, p8.payload, T0)).includes('kid_present'))

  const p9 = core.parseToken(makeToken({ sub: 'u', exp: T0 / 1000 + 60 }, { alg: 'HS256', crit: ['bogus'] }))
  assert.ok(ids(core.analyzeClaims(p9.header, p9.payload, T0)).includes('crit_header'))
})

test('审计：发现按 高危→需注意→提示 排序，计数一致', () => {
  const p = core.parseToken(makeToken({ password: 'x', exp: T0 / 1000 - 60 }, { alg: 'none' }))
  const a = core.analyzeClaims(p.header, p.payload, T0)
  const order = a.findings.map((f) => f.level)
  const rank = { high: 0, caution: 1, info: 2 }
  for (let i = 1; i < order.length; i++) assert.ok(rank[order[i - 1]] <= rank[order[i]], JSON.stringify(order))
  const total = a.counts.high + a.counts.caution + a.counts.info
  assert.equal(total, a.findings.length)
})

test('时钟视角 tokenClock：过期/剩余/尚未生效', () => {
  const c1 = core.tokenClock({ exp: T0 / 1000 + 3600 }, T0)
  assert.equal(c1.expired, false)
  assert.ok(Math.abs(c1.remainingMs - 3600 * 1000) < 1000)
  const c2 = core.tokenClock({ exp: T0 / 1000 - 3600 }, T0)
  assert.equal(c2.expired, true)
  const c3 = core.tokenClock({}, T0)
  assert.equal(c3.expired, null)
})

// ── 渲染：无 undefined/NaN 泄漏（对抗输入） ─────────────────────────────────

test('渲染报告：对抗输入无 undefined/NaN 泄漏', () => {
  const weird = [
    makeToken({}),
    makeToken({ exp: 'abc', iat: null }),
    makeToken({ exp: Number.MAX_SAFE_INTEGER }),
    'garbage.token',
  ]
  const texts = []
  for (const t of weird) {
    const p = core.parseToken(t)
    if (p.ok) {
      texts.push(core.renderDecodeReport(p))
      texts.push(core.renderVerifyReport({ ok: true, verified: false, alg: p.header.alg, parsed: p, reason: 'x' }, T0))
      texts.push(core.renderAuditReport(core.analyzeClaims(p.header, p.payload, T0), T0))
      texts.push(core.renderClaimsTable(p.payload))
    } else {
      texts.push(core.renderVerifyReport(p, T0))
    }
  }
  for (const t of texts) assert.ok(!/undefined|NaN/.test(t), `泄漏: ${t.slice(0, 160)}`)
})

test('中文标签与时间工具口径', () => {
  assert.equal(core.LEVEL_LABELS.high, '高危')
  assert.equal(core.LEVEL_LABELS.caution, '需注意')
  assert.equal(core.LEVEL_LABELS.info, '提示')
  assert.equal(core.humanizeMs(90 * 1000), '1 分钟 30 秒')
  assert.match(core.tokenClock({ exp: T0 / 1000 }, T0).expIso, /^20\d\d-/)
})
