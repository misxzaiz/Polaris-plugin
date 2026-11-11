// 搬迁改造自主仓 src/components/Scheduler/TaskCard.tsx（2026-11 Scheduler 域插件化迁移）
// 差异：数据从 useSchedulerStore selector 改 props 直传（父层 useAiSchedulerData）。
import { Clock, Play, Pause, Pencil, Trash2, FileText, Terminal, Globe, MessageSquare } from 'lucide-react'
import { t } from './i18n'
import type { ScheduledTask } from './types'

interface TaskCardProps {
  task: ScheduledTask
  running: boolean
  onRun: () => void
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onShowLog: () => void
}

function formatTime(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '-'
  const d = new Date(sec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function statusColor(status: string | null): string {
  switch (status) {
    case 'running': return 'bg-primary/15 text-primary'
    case 'success': return 'bg-success/15 text-success'
    case 'failed': return 'bg-danger/15 text-danger'
    default: return 'bg-background-hover text-text-tertiary'
  }
}

function executorIcon(task: ScheduledTask) {
  const et = task.executorType || 'chat'
  if (et === 'command' || et === 'cli') return <Terminal size={11} />
  if (et === 'http' || et === 'webhook') return <Globe size={11} />
  return <MessageSquare size={11} />
}

export function TaskCard({ task, running, onRun, onToggle, onEdit, onDelete, onShowLog }: TaskCardProps) {
  const lastStatus: string | null = task.lastRunStatus ?? null
  const statusLabel = lastStatus
    ? t(`status.${lastStatus}`, lastStatus)
    : t('status.notExecuted', '未执行')

  return (
    <div className="px-2.5 py-2 rounded-lg bg-background-base border border-border hover:border-border-strong transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full shrink-0 text-text-tertiary`}>
              {executorIcon(task)}
            </span>
            <span className={`text-xs font-medium truncate ${task.enabled ? 'text-text-primary' : 'text-text-tertiary line-through'}`}>
              {task.name}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${statusColor(lastStatus)}`}>
              {statusLabel}
            </span>
            {task.mode === 'protocol' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent shrink-0">
                <FileText size={10} className="inline mr-0.5" />{t('taskMode.protocol', '协议模式')}
              </span>
            )}
            {task.unsupportedExecutor && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger/15 text-danger shrink-0">
                {t('editor.executorUnsupported', '不支持')}
              </span>
            )}
          </div>
          {task.description && (
            <div className="text-[11px] text-text-tertiary truncate mt-0.5">{task.description}</div>
          )}
          <div className="flex items-center gap-3 text-[10px] text-text-tertiary mt-1">
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {t(`triggerTypes.${task.triggerType}`, task.triggerType)} · {task.triggerValue}
            </span>
            <span>{t('card.nextRun', '下次')}: {formatTime(task.nextRunAt)}</span>
            <span>{t('card.lastRun', '上次')}: {formatTime(task.lastRunAt)}</span>
            {(task.runCount ?? 0) > 0 && <span>{t('card.runCount', '{{count}} 次', { count: task.runCount ?? 0 })}</span>}
          </div>
        </div>
        {/* 动作区 */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onRun}
            disabled={running || task.unsupportedExecutor}
            className="p-1 rounded-md hover:bg-background-hover text-text-tertiary hover:text-primary disabled:opacity-40"
            title={t('card.run', '立即执行')}
          >
            <Play size={13} />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className={`p-1 rounded-md hover:bg-background-hover ${task.enabled ? 'text-text-tertiary' : 'text-success'}`}
            title={task.enabled ? t('card.disable', '禁用') : t('card.enable', '启用')}
          >
            {task.enabled ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button
            type="button"
            onClick={onShowLog}
            className="p-1 rounded-md hover:bg-background-hover text-text-tertiary"
            title={t('card.log', '执行日志')}
          >
            <Clock size={13} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="p-1 rounded-md hover:bg-background-hover text-text-tertiary"
            title={t('card.edit', '编辑')}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded-md hover:bg-background-hover text-text-tertiary hover:text-danger"
            title={t('card.delete', '删除')}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {task.lastError && (
        <div className="mt-1.5 text-[10px] text-danger truncate px-1" title={task.lastError}>
          {t('card.lastError', '上次错误')}: {task.lastError}
        </div>
      )}
    </div>
  )
}
