/**
 * 面板共享工具：数据形态 + 时间/调度文案（三个 Tab 与外壳共用，避免循环导入）
 */
import type { Job, Meta, RunRecord, Settings, AiProvider, Toast } from './model'

export type { Job, Meta, RunRecord, Settings, AiProvider, Toast }

export interface PanelData {
  meta: Meta | null
  jobs: Job[]
  runs: RunRecord[]
  settings: Settings | null
  providers: AiProvider[]
}

export type Notifier = (text: string, bad?: boolean) => void

export function fmtTime(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return '—'
  return new Date(ms).toLocaleString()
}

export function fmtCountdown(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '已停用'
  const diff = ms - Date.now()
  if (diff <= 0) return '即将触发'
  const m = Math.floor(diff / 60000)
  if (m >= 60 * 24) return `${Math.floor(m / 1440)} 天后`
  if (m >= 60) return `${Math.floor(m / 60)} 小时 ${m % 60} 分后`
  if (m >= 1) return `${m} 分后`
  return `${Math.floor(diff / 1000)} 秒后`
}

export function describeScheduleClient(s: Job['schedule']): string {
  if (!s) return '未知调度'
  if (s.type === 'interval') {
    const sec = Math.round((s.everyMs || 0) / 1000)
    if (sec > 0 && sec % 3600 === 0) return `每 ${sec / 3600} 小时`
    if (sec > 0 && sec % 60 === 0) return `每 ${sec / 60} 分钟`
    return `每 ${sec} 秒`
  }
  if (s.type === 'daily') return `每天 ${s.time || '?'}`
  if (s.type === 'weekly') {
    const names = ['日', '一', '二', '三', '四', '五', '六']
    return `每周${(s.dows || []).map((d) => names[d]).join('、') || '?'} ${s.time || '?'}`
  }
  return `cron(${s.expr || '?'})`
}
