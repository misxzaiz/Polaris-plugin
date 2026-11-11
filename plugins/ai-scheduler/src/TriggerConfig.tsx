// 搬迁改造自主仓 src/components/Scheduler/TriggerConfig.tsx（2026-11 Scheduler 域插件化迁移）
// 差异：schedulerValidateTrigger/parseInterval 后端命令 → 纯函数（shared/engine 金标移植）。
import { calculateNextRun } from '../shared/engine'
import { t } from './i18n'
import type { TriggerType } from './types'

export interface TriggerConfigValue {
  triggerType: TriggerType
  triggerValue: string
}

interface Props {
  value: TriggerConfigValue
  onChange: (v: TriggerConfigValue) => void
}

const PRESETS: Array<{ label: string; type: TriggerType; value: string }> = [
  { label: '1m', type: 'interval', value: '1m' },
  { label: '5m', type: 'interval', value: '5m' },
  { label: '1h', type: 'interval', value: '1h' },
  { label: '1d', type: 'interval', value: '1d' },
]

export function TriggerConfig({ value, onChange }: Props) {
  const validate = (type: TriggerType, raw: string): string | null => {
    const v = raw.trim()
    if (!v) return t('trigger.empty', '触发表达式不能为空')
    const next = calculateNextRun(type, v, Math.floor(Date.now() / 1000))
    if (next === null) {
      return t('trigger.invalid', '表达式无效：') + invalidHint(type)
    }
    return null
  }

  const invalidHint = (type: TriggerType): string => {
    switch (type) {
      case 'interval':
      case 'after_completion':
        return t('trigger.intervalHint', '间隔需为 30s / 5m / 2h / 1d 形式')
      case 'cron':
        return t('trigger.cronHint', 'Cron 需为 6 字段（秒 分 时 日 月 周）')
      default:
        return t('trigger.onceHint', '单次需为 RFC3339 时间（2026-11-11T09:00:00Z）')
    }
  }

  const err = validate(value.triggerType, value.triggerValue)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <select
          value={value.triggerType}
          onChange={(e) => onChange({ ...value, triggerType: e.target.value as TriggerType })}
          className="px-2 py-1.5 rounded-md bg-background-base border border-border text-xs shrink-0"
        >
          <option value="interval">{t('triggerTypes.interval', '间隔执行')}</option>
          <option value="cron">{t('triggerTypes.cron', 'Cron 表达式')}</option>
          <option value="once">{t('triggerTypes.once', '单次执行')}</option>
          <option value="after_completion">{t('triggerTypes.after_completion', '完成后间隔')}</option>
        </select>
        <input
          value={value.triggerValue}
          onChange={(e) => onChange({ ...value, triggerValue: e.target.value })}
          placeholder={placeholderOf(value.triggerType)}
          className="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-background-base border border-border text-xs outline-none focus:border-border-strong"
        />
      </div>
      {value.triggerType === 'interval' && (
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange({ triggerType: p.type, triggerValue: p.value })}
              className="px-1.5 py-0.5 rounded text-[10px] bg-background-hover hover:bg-border text-text-tertiary"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {err ? (
        <div className="text-[10px] text-danger">{err}</div>
      ) : (
        <div className="text-[10px] text-text-tertiary">
          {t('trigger.nextRunPreview', '下次执行')}: {preview(value.triggerType, value.triggerValue)}
        </div>
      )}
    </div>
  )
}

function placeholderOf(type: TriggerType): string {
  switch (type) {
    case 'cron': return '0 0 9 * * *'
    case 'once': return '2026-11-11T09:00:00Z'
    case 'after_completion': return '30m'
    default: return '5m / 2h / 1d'
  }
}

function preview(type: TriggerType, raw: string): string {
  const next = calculateNextRun(type, raw.trim(), Math.floor(Date.now() / 1000))
  if (next === null) return '-'
  const d = new Date(next * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
