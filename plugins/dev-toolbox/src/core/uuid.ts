// UUID 生成 —— v4 用密码学随机（crypto.getRandomValues / randomUUID），
// v7 按草案实现：48bit 毫秒时间戳 + 单调序列号（同一毫秒内自增，保证时序单调）+ 62bit 随机位

export const NIL_UUID = '00000000-0000-0000-0000-000000000000'

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    throw new Error('运行环境缺少 crypto.getRandomValues（需要浏览器或 node ≥18）')
  }
  return bytes
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function uuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = randomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10
  return formatUuid(bytes)
}

// v7 同毫秒单调计数器：rand_a 12bit 作为序列号
let v7LastMs = -1
let v7Seq = 0

export function uuidV7(now: number = Date.now()): string {
  const bytes = randomBytes(16)
  if (now === v7LastMs) {
    v7Seq = (v7Seq + 1) & 0x0fff
  } else {
    v7LastMs = now
    const rnd = randomBytes(2)
    v7Seq = ((rnd[0] & 0x0f) << 8) | rnd[1]
  }
  bytes[0] = (now / 2 ** 40) & 0xff
  bytes[1] = (now / 2 ** 32) & 0xff
  bytes[2] = (now / 2 ** 24) & 0xff
  bytes[3] = (now / 2 ** 16) & 0xff
  bytes[4] = (now / 2 ** 8) & 0xff
  bytes[5] = now & 0xff
  bytes[6] = 0x70 | ((v7Seq >> 8) & 0x0f) // version 7 + seq 高 4bit
  bytes[7] = v7Seq & 0xff
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10
  return formatUuid(bytes)
}

export type UuidVersion = 'v4' | 'v7'

export function generateUuids(count: number, version: UuidVersion): string[] {
  const n = Math.max(1, Math.min(500, Math.floor(count) || 1))
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(version === 'v7' ? uuidV7() : uuidV4())
  return out
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 校验并解析 UUID 的版本位/变体位 */
export function parseUuid(input: string): { ok: boolean; error?: string; version?: number; variant?: string; canonical?: string } {
  const trimmed = input.trim().toLowerCase().replace(/[{}]/g, '')
  if (!UUID_RE.test(trimmed)) return { ok: false, error: '不是合法的 UUID 格式（8-4-4-4-12 十六进制）' }
  const version = parseInt(trimmed[14], 16)
  const variantBits = parseInt(trimmed[19], 16) >> 2
  let variant: string
  if (variantBits === 0) variant = 'NCS（保留，向后兼容）'
  else if (variantBits === 1) variant = 'RFC 4122（标准）'
  else if (variantBits === 2) variant = 'Microsoft（保留）'
  else variant = '保留（自定义）'
  return { ok: true, version, variant, canonical: trimmed }
}
