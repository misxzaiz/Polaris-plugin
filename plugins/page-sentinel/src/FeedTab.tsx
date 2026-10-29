/**
 * 动态 Tab：事件流（变化/命中/解除/错误/恢复）+ diff 渲染 + 发送到聊天
 */
import { useCallback, useEffect, useState } from 'react'
import {
  loadEvents, timeAgo,
  EVENT_TYPE_META,
  type SentinelEvent,
} from './model'

export default function FeedTab({ onSendToChat, showToast, markRead, unread }: {
  onSendToChat?: (message: string) => void | Promise<void>
  showToast: (msg: string, bad?: boolean) => void
  markRead: () => Promise<void>
  unread: number
}) {
  const [events, setEvents] = useState<SentinelEvent[] | null>(null)
  const [filter, setFilter] = useState('')

  const reload = useCallback(async () => {
    try {
      setEvents(await loadEvents(80))
    } catch (e) {
      showToast(`事件加载失败：${(e as Error).message}`, true)
    }
  }, [showToast])

  useEffect(() => {
    reload()
  }, [reload])

  const targets = Array.from(new Set((events || []).map((e) => e.targetName || e.targetId)))
  const shown = filter ? (events || []).filter((e) => (e.targetName || e.targetId) === filter) : (events || [])

  const sendToChat = async (ev: SentinelEvent) => {
    const lines = [
      `【网页监测】监控「${ev.targetName || ev.targetId}」${EVENT_TYPE_META[ev.type]?.label || ev.type}：${ev.summary}`,
      `时间：${new Date(ev.at).toLocaleString('zh-CN', { hour12: false })}`,
    ]
    if (ev.diff && ev.diff.length) {
      lines.push('差异：', ...ev.diff.slice(0, 20).map((d) => `${d.kind} ${d.text}`))
    }
    if (ev.extract) lines.push(`当前抽取内容：${ev.extract.slice(0, 300)}`)
    lines.push('请帮我分析这次变化。')
    if (onSendToChat) {
      await onSendToChat(lines.join('\n'))
      showToast('已发送到聊天')
    } else {
      showToast('当前宿主不支持发送到聊天', true)
    }
  }

  return (
    <div>
      <div className="ps-sec">
        <i className="ps-bar" />
        动态
        <span className="ps-hint">
          {unread > 0 ? `${unread} 条未读` : '已全部阅读'}
        </span>
      </div>
      <div className="ps-row" style={{ padding: '0 16px 10px' }}>
        <select className="ps-sel" style={{ maxWidth: 200 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">全部目标</option>
          {targets.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="ps-btn ghost sm" onClick={reload}>刷新</button>
        {unread > 0 && <button className="ps-btn sm" onClick={() => { markRead(); showToast('已标记为已读') }}>全部已读</button>}
      </div>

      {!shown.length && (
        <div className="ps-empty">
          还没有事件。<br />服务检查出变化或条件命中时会出现在这里。
        </div>
      )}

      {shown.map((ev) => {
        const meta = EVENT_TYPE_META[ev.type] || { label: ev.type, color: '#8B95A7' }
        return (
          <div className="ps-ev" key={ev.id}>
            <div className="ps-ev-h">
              <span className="ps-badge-txt" style={{ background: 'rgba(255,255,255,.04)', color: meta.color, borderColor: 'rgba(255,255,255,.08)' }}>
                {meta.label}
              </span>
              <b>{ev.targetName || ev.targetId}</b>
              <span>{timeAgo(ev.at)}</span>
            </div>
            <div className="ps-ev-sum">{ev.summary}</div>
            {ev.diff && ev.diff.length > 0 && (
              <div className="ps-diff">
                {ev.diff.map((d, i) => (
                  <div key={i} className={`ps-dl ${d.kind === '+' ? 'add' : d.kind === '-' ? 'del' : d.kind === '…' ? 'fold' : d.kind === '±' ? 'fold' : 'ctx'}`}>
                    {d.kind === '±' ? '≈ ' : d.kind} {d.text}
                  </div>
                ))}
              </div>
            )}
            <div className="ps-actions">
              <button className="ps-btn sm ghost" onClick={() => sendToChat(ev)}>发到聊天分析</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
