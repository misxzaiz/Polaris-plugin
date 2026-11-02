// 进制转换 —— BigInt 全程，支持超出 Number.MAX_SAFE_INTEGER 的大整数；任意 2-36 进制

export interface RadixResult {
  ok: boolean
  error?: string
  negative?: boolean
  decimal?: string
  binary?: string
  octal?: string
  hex?: string
  base36?: string
  bitLength?: number
}

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'

function bigToBase(value: bigint, base: number): string {
  if (value === 0n) return '0'
  const b = BigInt(base)
  let v = value
  let out = ''
  while (v > 0n) {
    out = DIGITS[Number(v % b)] + out
    v = v / b
  }
  return out
}

export function convertRadix(input: string, fromBase: number): RadixResult {
  const raw = input.trim()
  if (raw === '') return { ok: false, error: '输入为空' }
  if (!Number.isInteger(fromBase) || fromBase < 2 || fromBase > 36) {
    return { ok: false, error: `源进制须为 2-36 的整数，当前 ${fromBase}` }
  }
  let negative = false
  let body = raw.toLowerCase().replace(/[\s_]/g, '')
  if (body.startsWith('-')) {
    negative = true
    body = body.slice(1)
  } else if (body.startsWith('+')) {
    body = body.slice(1)
  }
  if (body === '') return { ok: false, error: '没有数字位' }
  let acc = 0n
  const base = BigInt(fromBase)
  for (const ch of body) {
    const d = DIGITS.indexOf(ch)
    if (d < 0) return { ok: false, error: `字符「${ch}」不是合法数字字符（仅支持 0-9 a-z）` }
    if (d >= fromBase) return { ok: false, error: `字符「${ch}」超出 ${fromBase} 进制范围` }
    acc = acc * base + BigInt(d)
  }
  if (negative) acc = -acc
  const magnitude = negative ? -acc : acc
  return {
    ok: true,
    negative,
    decimal: acc.toString(10),
    binary: bigToBase(magnitude, 2),
    octal: bigToBase(magnitude, 8),
    hex: bigToBase(magnitude, 16).toUpperCase(),
    base36: bigToBase(magnitude, 36),
    bitLength: magnitude === 0n ? 1 : magnitude.toString(2).length,
  }
}

/** 十进制字符串 → 目标进制（供 UI 反向输出） */
export function decimalToBase(decimal: string, base: number): { ok: boolean; output?: string; error?: string } {
  if (!/^-?\d+$/.test(decimal.trim())) return { ok: false, error: '不是十进制整数' }
  const r = convertRadix(decimal, 10)
  if (!r.ok) return { ok: false, error: r.error }
  const map: Record<number, string | undefined> = { 2: r.binary, 8: r.octal, 16: r.hex, 36: r.base36 }
  const out = map[base]
  if (out === undefined) return { ok: false, error: `不支持目标进制 ${base}（支持 2/8/16/36）` }
  return { ok: true, output: out }
}
