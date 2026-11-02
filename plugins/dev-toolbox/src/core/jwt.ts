// JWT 解码与 HS* 验签 —— 只做结构与时间窗分析；验签仅支持 HMAC 系（HS256/384/512）
// 安全纪律：解码不做任何网络请求；时间窗判断用本地时钟并明示这一前提

import { base64ToUtf8, bytesToBase64, type Base64DecodeResult } from './b64'

export interface JwtTimeClaim {
  /** 原始 epoch 秒 */
  epoch: number
  isoUtc: string
}

export interface JwtDecoded {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signatureRaw: string
  parts: { header: string; payload: string; signature: string }
  iat?: JwtTimeClaim
  nbf?: JwtTimeClaim
  exp?: JwtTimeClaim
  /** no-exp=无过期声明；valid=未过期；expired=已过期（相对本地时钟） */
  expiryState: 'no-exp' | 'valid' | 'expired'
  /** 例：「已过期 3 天」「还有 5 分钟」 */
  expiryDetail: string
}

function decodePart(part: string, label: string): Record<string, unknown> {
  if (part === '') throw new Error(`${label} 为空`)
  let decoded: Base64DecodeResult
  try {
    decoded = base64ToUtf8(part)
  } catch (e) {
    throw new Error(`${label} 不是合法的 base64url：${(e as Error).message}`)
  }
  if (decoded.replacedChars > 0) throw new Error(`${label} 解码后不是合法 UTF-8（可能不是 JWT）`)
  let obj: unknown
  try {
    obj = JSON.parse(decoded.text)
  } catch {
    throw new Error(`${label} 解码后不是合法 JSON`)
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new Error(`${label} 解码后不是 JSON 对象`)
  }
  return obj as Record<string, unknown>
}

function toTimeClaim(seconds: unknown): JwtTimeClaim | undefined {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return undefined
  return { epoch: Math.floor(seconds), isoUtc: new Date(Math.floor(seconds) * 1000).toISOString() }
}

function humanizeDuration(ms: number): string {
  const abs = Math.abs(ms)
  const units: Array<[number, string]> = [
    [365 * 24 * 3600e3, '年'],
    [30 * 24 * 3600e3, '个月'],
    [24 * 3600e3, '天'],
    [3600e3, '小时'],
    [60e3, '分钟'],
    [1000, '秒'],
  ]
  for (const [scale, unit] of units) {
    if (abs >= scale) {
      const v = Math.round(abs / scale)
      return `${v} ${unit}`
    }
  }
  return '不到 1 秒'
}

export function decodeJwt(token: string): JwtDecoded {
  const trimmed = token.trim()
  if (trimmed === '') throw new Error('JWT 为空')
  const parts = trimmed.split('.')
  if (parts.length !== 3) {
    throw new Error(`JWT 应为 3 段（header.payload.signature），实际 ${parts.length} 段`)
  }
  const header = decodePart(parts[0], 'header')
  const payload = decodePart(parts[1], 'payload')
  const iat = toTimeClaim(payload.iat)
  const nbf = toTimeClaim(payload.nbf)
  const exp = toTimeClaim(payload.exp)
  let expiryState: JwtDecoded['expiryState'] = 'no-exp'
  let expiryDetail = '无 exp 过期声明'
  if (exp) {
    const diff = exp.epoch * 1000 - Date.now()
    if (diff > 0) {
      expiryState = 'valid'
      expiryDetail = `还有 ${humanizeDuration(diff)}过期`
    } else {
      expiryState = 'expired'
      expiryDetail = `已过期 ${humanizeDuration(-diff)}`
    }
  }
  return {
    header,
    payload,
    signatureRaw: parts[2],
    parts: { header: parts[0], payload: parts[1], signature: parts[2] },
    iat,
    nbf,
    exp,
    expiryState,
    expiryDetail,
  }
}

const HS_HASH: Record<string, 'SHA-256' | 'SHA-384' | 'SHA-512'> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
}

export interface JwtVerifyResult {
  ok: boolean
  detail: string
}

/** HS256/384/512 验签：重算 HMAC 与 signature 段比对（异或累积，避免逐字符短路） */
export async function verifyJwtHs(token: string, secret: string): Promise<JwtVerifyResult> {
  let decoded: JwtDecoded
  try {
    decoded = decodeJwt(token)
  } catch (e) {
    return { ok: false, detail: (e as Error).message }
  }
  const alg = decoded.header.alg
  if (typeof alg !== 'string' || !(alg in HS_HASH)) {
    return { ok: false, detail: `本工具只支持 HS256/HS384/HS512 验签，当前 alg=${String(alg ?? '缺失')}` }
  }
  if (secret === '') return { ok: false, detail: '验签需要共享密钥（secret）' }
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: HS_HASH[alg] },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${decoded.parts.header}.${decoded.parts.payload}`))
  // signature 段是 base64url；把重算出的 HMAC 也 base64url 化后做等长异或比对
  const sigB64url = bytesToBase64(new Uint8Array(sig), true)
  let diff = 0
  const a = decoded.parts.signature.replace(/=+$/, '')
  const b = sigB64url.replace(/=+$/, '')
  if (a.length !== b.length) diff = 1
  else {
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
    ? { ok: true, detail: `${alg} 验签通过` }
    : { ok: false, detail: `${alg} 验签失败：签名不匹配（密钥错误或 payload 被改动）` }
}
