// 时间戳转换 —— 自动识别 s/ms/μs/ns（按量级启发，业界通用口径），显式单位可覆盖

export type TimeUnit = 'auto' | 's' | 'ms'

export interface TimestampInfo {
  ok: boolean
  error?: string
  input: string
  /** 判定/指定的输入单位 */
  unit?: 's' | 'ms' | 'us' | 'ns'
  epochMs?: number
  isoUtc?: string
  /** 本地时区 ISO（含偏移） */
  isoLocal?: string
  /** 本地时区可读格式 */
  localReadable?: string
  weekday?: string
  relative?: string
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function relativeTime(epochMs: number, now: number = Date.now()): string {
  const diff = epochMs - now
  const abs = Math.abs(diff)
  const units: Array<[number, string]> = [
    [365 * 24 * 3600e3, '年'],
    [30 * 24 * 3600e3, '个月'],
    [7 * 24 * 3600e3, '周'],
    [24 * 3600e3, '天'],
    [3600e3, '小时'],
    [60e3, '分钟'],
    [1000, '秒'],
  ]
  for (const [scale, unit] of units) {
    if (abs >= scale) {
      const v = Math.round(abs / scale)
      return diff > 0 ? `${v} ${unit}后` : `${v} ${unit}前`
    }
  }
  return diff > 0 ? '刚刚（未来）' : '刚刚'
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0')
}

function toLocalIso(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${pad(d.getMilliseconds(), 3)}`
  )
}

export function analyzeTimestamp(raw: string, forceUnit: TimeUnit = 'auto'): TimestampInfo {
  const input = raw.trim()
  if (input === '') return { ok: false, error: '输入为空', input }
  if (!/^-?\d+$/.test(input)) return { ok: false, error: '不是纯数字时间戳（支持负数），日期文本请用下面的日期选择器', input }
  const value = Number(input)
  if (!Number.isSafeInteger(value)) return { ok: false, error: '超出安全整数范围', input }
  const abs = Math.abs(value)
  let unit: 's' | 'ms' | 'us' | 'ns'
  if (forceUnit === 's') unit = 's'
  else if (forceUnit === 'ms') unit = 'ms'
  else if (abs < 1e11) unit = 's' // 到 5138 年的秒级
  else if (abs < 1e14) unit = 'ms' // 到 5138 年的毫秒级
  else if (abs < 1e17) unit = 'us'
  else unit = 'ns'
  let epochMs: number
  if (unit === 's') epochMs = value * 1000
  else if (unit === 'ms') epochMs = value
  else if (unit === 'us') epochMs = Math.round(value / 1000)
  else epochMs = Math.round(value / 1e6)
  const d = new Date(epochMs)
  if (Number.isNaN(d.getTime())) return { ok: false, error: '无法表示为有效日期', input }
  return {
    ok: true,
    input,
    unit,
    epochMs,
    isoUtc: d.toISOString(),
    isoLocal: toLocalIso(d),
    localReadable: `${toLocalIso(d)} ${WEEKDAYS[d.getDay()]}`,
    weekday: WEEKDAYS[d.getDay()],
    relative: relativeTime(epochMs),
  }
}

/** datetime-local 输入值（本地时区）→ epoch ms */
export function dateInputToEpochMs(local: string): number | null {
  if (!local) return null
  const ms = new Date(local).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** epoch ms → datetime-local 输入值（本地时区，含毫秒保证往返无损） */
export function epochMsToDateInput(epochMs: number): string {
  const d = new Date(epochMs)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${pad(d.getMilliseconds(), 3)}`
  )
}

export function nowInfo(): { seconds: number; millis: number; isoUtc: string; localReadable: string } {
  const ms = Date.now()
  const d = new Date(ms)
  return {
    seconds: Math.floor(ms / 1000),
    millis: ms,
    isoUtc: d.toISOString(),
    localReadable: `${toLocalIso(d)} ${WEEKDAYS[d.getDay()]}`,
  }
}
