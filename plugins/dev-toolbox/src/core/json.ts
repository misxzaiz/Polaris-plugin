// JSON 格式化/压缩/校验 —— 错误带行列定位；键排序为深度递归（数组保序）

export interface JsonFormatResult {
  ok: boolean
  output: string
  error?: string
  errorLine?: number
  errorColumn?: number
  inputChars: number
  outputChars: number
}

export function sortValueDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValueDeep)
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    const out: Record<string, unknown> = {}
    for (const k of keys) out[k] = sortValueDeep(obj[k])
    return out
  }
  return value
}

/** 从 V8 风格错误消息提取 position，换算行列（1-based） */
function locateError(message: string, input: string): { line?: number; column?: number } {
  const m = message.match(/\(line (\d+) column (\d+)\)/)
  if (m) return { line: Number(m[1]), column: Number(m[2]) }
  const p = message.match(/position (\d+)/)
  if (p) {
    const pos = Math.min(Number(p[1]), input.length)
    let line = 1
    let column = 1
    for (let i = 0; i < pos; i++) {
      if (input[i] === '\n') {
        line++
        column = 1
      } else {
        column++
      }
    }
    return { line, column }
  }
  return {}
}

export function formatJson(
  text: string,
  opts: { indent?: number; sortKeys?: boolean; minify?: boolean } = {},
): JsonFormatResult {
  const inputChars = text.length
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    const msg = (e as Error).message
    const loc = locateError(msg, text)
    return {
      ok: false,
      output: '',
      error: msg,
      errorLine: loc.line,
      errorColumn: loc.column,
      inputChars,
      outputChars: 0,
    }
  }
  if (opts.sortKeys) value = sortValueDeep(value)
  const output = opts.minify ? JSON.stringify(value) : JSON.stringify(value, null, opts.indent ?? 2)
  return { ok: true, output, inputChars, outputChars: output.length }
}
