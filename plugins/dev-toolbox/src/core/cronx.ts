// Cron 表达式解析 —— 基于 cron-parser v4（支持 5 段标准 + 可选秒的 6 段），
// 中文描述从解析后的字段集推导，复杂组合回落到字段表展示

import { parseExpression } from 'cron-parser'

export interface CronFields {
  second?: string
  minute: string
  hour: string
  dayOfMonth: string
  month: string
  dayOfWeek: string
}

export interface CronInfo {
  ok: boolean
  error?: string
  hasSeconds: boolean
  fields?: CronFields
  /** 中文人类可读描述；复杂组合可能为空字符串（用字段表） */
  description?: string
  /** 未来执行时间（本地时区）「YYYY-MM-DD HH:mm:ss 周X」 */
  next?: string[]
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

/** dayOfWeek 归一化：cron-parser 可能给 0-7，0 与 7 都是周日，先 mod 7 去重 */
function normDow(values: number[]): number[] {
  return [...new Set(values.map((v) => v % 7))].sort((a, b) => a - b)
}

function fmtField(values: number[], all: number, labelMap?: (v: number) => string): string {
  if (values.length === all) return '*'
  return values.map((v) => (labelMap ? labelMap(v) : String(v))).join('、')
}

/** 把字段段渲染成紧凑中文列表（超过 4 个值保持原样，让 UI 回落字段表） */
function listCn(seg: string, labelMap?: (v: number) => string): string | null {
  if (seg === '*') return null
  const items = seg.split(',')
  if (items.length > 4) return null
  return items
    .map((it) => {
      const m = it.match(/^(\d+)-(\d+)$/)
      if (m) {
        const a = Number(m[1])
        const b = Number(m[2])
        if (b - a <= 7) {
          const arr: string[] = []
          for (let i = a; i <= b; i++) arr.push(labelMap ? labelMap(i) : String(i))
          return arr.join('、')
        }
      }
      return labelMap && /^\d+$/.test(it) ? labelMap(Number(it)) : it
    })
    .join('、')
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * 中文描述：按原始字段段推导（星号斜杠步进从展开值看不出来，必须看原始段）；
 * 组合过于复杂时返回空串，UI 回落到字段表
 */
function describe(segments: string[], hasSeconds: boolean): string {
  const parts = hasSeconds ? segments : [undefined, ...segments]
  const secSeg: string | undefined = parts[0]
  const minSeg: string = parts[1] ?? ''
  const hourSeg: string = parts[2] ?? ''
  const domSeg: string = parts[3] ?? ''
  const monSeg: string = parts[4] ?? ''
  const dowSeg: string = parts[5] ?? ''
  const restAll = [domSeg, monSeg, dowSeg].every((s) => s === '*')
  const isList = (s: string) => s !== '*' && /^\d+(,\d+)*$/.test(s)

  // 分钟级周期：* * * * * → 每分钟；*/N … → 每 N 分钟（仅纯步进，带范围的 5-50/10 不给描述）
  if (minSeg === '*' && hourSeg === '*' && restAll && (secSeg === undefined || secSeg === '0')) {
    return '每分钟'
  }
  if (/^\*\/\d+$/.test(minSeg ?? '') && hourSeg === '*' && restAll && (secSeg === undefined || secSeg === '0')) {
    const step = Number((minSeg as string).split('/')[1])
    return `每 ${step} 分钟`
  }
  // 每小时第 X 分：分固定短列表、时*
  if (isList(minSeg) && hourSeg === '*' && restAll && (secSeg === undefined || secSeg === '0')) {
    const mins = (minSeg as string).split(',')
    if (mins.length <= 4) return `每小时第 ${mins.map((m) => pad2(Number(m))).join('、')} 分`
  }
  const singleTime =
    isList(minSeg) &&
    minSeg.split(',').length === 1 &&
    isList(hourSeg) &&
    hourSeg.split(',').length === 1
  if (singleTime && (secSeg === undefined || secSeg === '0')) {
    const time = `${pad2(Number(hourSeg))}:${pad2(Number(minSeg))}`
    const dowCn = listCn(dowSeg ?? '*', (d) => WEEKDAYS[d % 7])
    if (domSeg === '*' && monSeg === '*' && dowCn) return `每${dowCn} ${time}`
    const domCn = listCn(domSeg ?? '*')
    if (domCn && monSeg === '*' && (dowSeg === '*' || dowSeg === '?')) return `每月 ${domCn} 日 ${time}`
    const monCn = listCn(monSeg ?? '*', (m) => MONTHS[m - 1])
    if (monCn && domCn && (dowSeg === '*' || dowSeg === '?')) return `每年 ${monCn}的 ${domCn} 日 ${time}`
    if (domSeg === '*' && monSeg === '*' && (dowSeg === '*' || dowSeg === '?')) return `每天 ${time}`
  }
  return ''
}

export function analyzeCron(expr: string, count = 5): CronInfo {
  const trimmed = expr.trim()
  if (trimmed === '') return { ok: false, error: '表达式为空', hasSeconds: false }
  const segs = trimmed.split(/\s+/)
  const hasSeconds = segs.length >= 6
  if (segs.length !== 5 && segs.length !== 6) {
    return {
      ok: false,
      error: `应为 5 段（分 时 日 月 周）或 6 段（秒 分 时 日 月 周），实际 ${segs.length} 段`,
      hasSeconds,
    }
  }
  try {
    const interval = parseExpression(trimmed, { currentDate: new Date() })
    const rawFields = interval.fields as {
      second: number[]
      minute: number[]
      hour: number[]
      dayOfMonth: number[]
      month: number[]
      dayOfWeek: number[]
    }
    const dow = normDow(rawFields.dayOfWeek)
    const next: string[] = []
    const n = Math.max(1, Math.min(20, Math.floor(count) || 5))
    const cursor = parseExpression(trimmed, { currentDate: new Date() })
    for (let i = 0; i < n; i++) {
      const d = cursor.next().toDate()
      next.push(
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
          `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${WEEKDAYS[d.getDay()]}`,
      )
    }
    return {
      ok: true,
      hasSeconds,
      fields: {
        second: hasSeconds ? fmtField(rawFields.second, 60) : undefined,
        minute: fmtField(rawFields.minute, 60),
        hour: fmtField(rawFields.hour, 24),
        dayOfMonth: fmtField(rawFields.dayOfMonth, 31),
        month: fmtField(rawFields.month, 12, (m) => MONTHS[m - 1]),
        dayOfWeek: fmtField(dow, 7, (d) => WEEKDAYS[d % 7]),
      },
      description: describe(segs, hasSeconds),
      next,
    }
  } catch (e) {
    return { ok: false, error: `表达式无法解析：${(e as Error).message}`, hasSeconds }
  }
}
