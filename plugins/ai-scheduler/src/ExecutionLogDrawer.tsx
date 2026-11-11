// 搬迁改造自主仓 src/components/Scheduler/ExecutionLogDrawer.tsx（2026-11 Scheduler 域插件化迁移）
// 差异：数据源 schedulerStore.executions/事件订阅 → 服务进程写的历史块 aisched.hist.*
// （props 传入，父层 5s 轮询）；抽屉高度改本地 useState（viewStore 随域出仓）。
import { useEffect, useRef, useState } from 'react'
import { X, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { t } from './i18n'
import type { HistEntry, ScheduledTask } from './types'

interface Props {
  open: boolean
  task: ScheduledTask | null
  hist: HistEntry[]
  onClose: () => void
}

function statusIcon(status: string) {
  if (status === 'success') return <CheckCircle2 size={12} className="text-success shrink-0 mt-0.5" />
  if (status === 'running') return <Loader2 size={12} className="text-primary shrink-0 mt-0.5 animate-spin" />
  return <XCircle size={12} className="text-danger shrink-0 mt-0.5" />
}

function fmt(sec: number): string {
  const d = new Date(sec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function ExecutionLogDrawer({ open, task, hist, onClose }: Props) {
  const [height, setHeight] = useState(240)
  const dragging = useRef(false)

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return
      const h = window.innerHeight - e.clientY
      setHeight(Math.max(140, Math.min(window.innerHeight - 80, h)))
    }
    const up = () => { dragging.current = false }
    if (open) {
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    }
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [open])

  if (!open) return null

  const entries = task ? hist.filter((h) => h.taskId === task.id) : hist

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ pointerEvents: 'none' }}>
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative bg-background-base border-t border-border shadow-lg flex flex-col"
        style={{ height, pointerEvents: 'auto' }}
      >
        {/* 拖拽手柄 + 标题 */}
        <div
          className="flex items-center gap-2 px-3 h-8 border-b border-border cursor-ns-resize shrink-0"
          onMouseDown={() => { dragging.current = true }}
        >
          <span className="text-xs font-medium text-text-primary truncate flex-1">
            {task ? `${t('drawer.historyTitle', '执行日志')} · ${task.name}` : t('drawer.allHistory', '全部执行日志')}
          </span>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-background-hover text-text-tertiary">
            <X size={14} />
          </button>
        </div>
        {/* 历史列表（新→旧，父层已排序） */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {entries.length === 0 ? (
            <div className="py-6 text-center text-xs text-text-tertiary">{t('drawer.empty', '暂无执行记录')}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((e) => (
                <div key={e.id} className="text-[11px] leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    {statusIcon(e.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-text-tertiary">
                        <span className="tabular-nums">{fmt(e.startedAt)}</span>
                        {e.durationMs !== undefined && e.durationMs > 0 && (
                          <span>{(e.durationMs / 1000).toFixed(1)}s</span>
                        )}
                        <span className="text-text-tertiary/70">{e.trigger}</span>
                      </div>
                      {e.summary && <div className="text-text-secondary break-all mt-0.5">{e.summary}</div>}
                      {e.excerpt && (
                        <pre className="mt-1 p-1.5 rounded bg-background-hover text-[10px] whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{e.excerpt}</pre>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
