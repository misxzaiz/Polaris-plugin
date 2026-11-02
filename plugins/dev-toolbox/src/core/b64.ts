// Base64 / Base64URL / URL 编解码 —— UTF-8 安全（TextEncoder/Decoder），全本地计算
// 设计要点：
// - 编码输入是「文本」时先按 UTF-8 取字节，避免 btoa 对多字节字符抛 InvalidCharacterError
// - 解码容错：忽略空白、接受 URL-safe 字符（-_）、补齐缺失的 = 填充
// - 解码对非法 UTF-8 不抛错，返回 U+FFFD 替换符数量让 UI 明示「输入可能不是文本」

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function bytesToBase64(bytes: Uint8Array, urlSafe = false): string {
  const alphabet = urlSafe ? B64_URL_ALPHABET : B64_ALPHABET
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    const has1 = i + 1 < bytes.length
    const has2 = i + 2 < bytes.length
    out += alphabet[b0 >> 2]
    out += alphabet[((b0 & 0x03) << 4) | (b1 >> 4)]
    out += has1 ? alphabet[((b1 & 0x0f) << 2) | (b2 >> 6)] : '='
    out += has2 ? alphabet[b2 & 0x3f] : '='
  }
  return out
}

function base64ToBytesStrict(input: string): Uint8Array {
  // 预处理：去空白、URL-safe 归一、剥掉非字母表字符
  const clean = input.replace(/[\s=]+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (/[^A-Za-z0-9+/]/.test(clean)) throw new Error('包含非 Base64 字符')
  if (clean.length % 4 === 1) throw new Error('Base64 长度非法（去掉填充后余 1）')
  const padNeeded = (4 - (clean.length % 4)) % 4
  const padded = clean + '='.repeat(padNeeded)
  const out = new Uint8Array(Math.floor((padded.length / 4) * 3))
  let o = 0
  for (let i = 0; i < padded.length; i += 4) {
    const c0 = B64_ALPHABET.indexOf(padded[i])
    const c1 = B64_ALPHABET.indexOf(padded[i + 1])
    const c2 = padded[i + 2] === '=' ? 0 : B64_ALPHABET.indexOf(padded[i + 2])
    const c3 = padded[i + 3] === '=' ? 0 : B64_ALPHABET.indexOf(padded[i + 3])
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) throw new Error('包含非 Base64 字符')
    out[o++] = (c0 << 2) | (c1 >> 4)
    if (padded[i + 2] !== '=') out[o++] = ((c1 & 0x0f) << 4) | (c2 >> 2)
    if (padded[i + 3] !== '=') out[o++] = ((c2 & 0x03) << 6) | c3
  }
  return out.subarray(0, o)
}

export interface Base64DecodeResult {
  text: string
  /** 解码出的 UTF-8 中 U+FFFD 替换符数量——>0 说明原始字节可能不是文本 */
  replacedChars: number
  byteLength: number
}

export function base64ToUtf8(input: string): Base64DecodeResult {
  const bytes = base64ToBytesStrict(input)
  const decoder = new TextDecoder('utf-8')
  const text = decoder.decode(bytes)
  const replaced = (text.match(/\uFFFD/g) || []).length
  return { text, replacedChars: replaced, byteLength: bytes.length }
}

export function utf8ToBase64(text: string, urlSafe = false): string {
  return bytesToBase64(new TextEncoder().encode(text), urlSafe)
}

export interface UrlDecodeResult {
  /** 严格解码（RFC 3986：+ 是字面加号） */
  text: string
  /** 表单语义解码（application/x-www-form-urlencoded：+ 视为空格） */
  textForm: string
  /** 严格解码是否失败过（失败时 text 取表单解码结果） */
  strictFailed: boolean
}

/** URL 解码：严格优先，表单语义（+ → 空格）并行提供；严格失败时回落表单结果 */
export function urlDecode(input: string): UrlDecodeResult {
  let strictFailed = false
  let text: string
  try {
    text = decodeURIComponent(input)
  } catch {
    strictFailed = true
    text = ''
  }
  let textForm: string
  try {
    textForm = decodeURIComponent(input.replace(/\+/g, '%20'))
  } catch (e) {
    if (strictFailed) throw new Error(`URL 解码失败：${(e as Error).message}`)
    textForm = text
  }
  if (strictFailed) text = textForm
  return { text, textForm, strictFailed }
}

/** URL 编码（component 语义，即 encodeURIComponent） */
export function urlEncode(input: string): string {
  return encodeURIComponent(input)
}
