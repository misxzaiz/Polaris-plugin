// 哈希与 HMAC —— MD5 为纯 JS 实现（RFC 1321，常量表硬编码保证跨引擎一致）；
// SHA-1/256/384/512 与 HMAC 走 WebCrypto（浏览器面板与 node ≥18 的 MCP 进程都有 globalThis.crypto）

export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512'
export const HASH_ALGORITHMS: HashAlgorithm[] = ['md5', 'sha1', 'sha256', 'sha384', 'sha512']

const MD5_K = new Int32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
])
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

function rotl(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c))
}

/** 纯 JS MD5（RFC 1321）。输入字节，输出小写 hex。 */
export function md5Bytes(input: Uint8Array): string {
  // 消息填充：0x80 + 0…0 至 ≡56 (mod 64) + 64 位小端比特长度
  const bitLen = input.length * 8
  const paddedLen = (((input.length + 8) >> 6) + 1) << 6
  const m = new Uint8Array(paddedLen)
  m.set(input)
  m[input.length] = 0x80
  const view = new DataView(m.buffer)
  view.setUint32(paddedLen - 8, bitLen >>> 0, true)
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    const M = new Int32Array(16)
    for (let i = 0; i < 16; i++) M[i] = view.getInt32(chunk + i * 4, true)
    let A = a0
    let B = b0
    let C = c0
    let D = d0
    for (let i = 0; i < 64; i++) {
      let F: number
      let g: number
      if (i < 16) {
        F = (B & C) | (~B & D)
        g = i
      } else if (i < 32) {
        F = (D & B) | (~D & C)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) % 16
      }
      F = (F + A + MD5_K[i] + M[g]) | 0
      A = D
      D = C
      C = B
      B = (B + rotl(F, MD5_S[i])) | 0
    }
    a0 = (a0 + A) | 0
    b0 = (b0 + B) | 0
    c0 = (c0 + C) | 0
    d0 = (d0 + D) | 0
  }

  const out = new DataView(new ArrayBuffer(16))
  out.setInt32(0, a0, true)
  out.setInt32(4, b0, true)
  out.setInt32(8, c0, true)
  out.setInt32(12, d0, true)
  const hex: string[] = []
  for (let i = 0; i < 16; i++) hex.push(out.getUint8(i).toString(16).padStart(2, '0'))
  return hex.join('')
}

export function md5(text: string): string {
  return md5Bytes(new TextEncoder().encode(text))
}

// WebCrypto 算法名必须带连字符（SHA-256）；'sha256'.toUpperCase() 是 SHA256，会被拒
const SUBTLE_NAMES: Record<Exclude<HashAlgorithm, 'md5'>, 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'> = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
}

function subtleHashName(algorithm: Exclude<HashAlgorithm, 'md5'>): 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' {
  return SUBTLE_NAMES[algorithm]
}

function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

/** SHA 系列摘要（小写 hex）。文本按 UTF-8 编码后计算。 */
export async function shaHex(algorithm: Exclude<HashAlgorithm, 'md5'>, text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest(subtleHashName(algorithm), data)
  return bytesToHex(new Uint8Array(digest))
}

/** HMAC（小写 hex）。密钥与消息均按 UTF-8 编码。 */
export async function hmacHex(
  algorithm: Exclude<HashAlgorithm, 'md5'>,
  text: string,
  secret: string,
): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: subtleHashName(algorithm) },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text))
  return bytesToHex(new Uint8Array(sig))
}

/** 统一入口：hashText('md5'|'sha…', text, hmacSecret?) */
export async function hashText(algorithm: HashAlgorithm, text: string, hmacSecret?: string): Promise<string> {
  if (hmacSecret !== undefined && hmacSecret !== '') {
    if (algorithm === 'md5') throw new Error('HMAC 不支持 MD5（WebCrypto 限制）')
    return hmacHex(algorithm, text, hmacSecret)
  }
  if (algorithm === 'md5') return md5(text)
  return shaHex(algorithm, text)
}
