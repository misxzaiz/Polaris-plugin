/**
 * 动态 Tab：网络事件流（断网/恢复/失联/劣化）+ 未读水位 + 一键已读/清空
 */
import { useEffect, useState } from 'react'
import { clearEvents, loadEvents, EVENT_TYPE_META, type EventType, type NetEvent } from './model'

const css = `
.ns-feed-hint{display:flex;align-items:center;gap:8px;padding:4px 18px 10px;font-size:10.5px;color:#5C6678}
.ns-feed-hint button{margin-left:auto}
`

export default function FeedTab({ onSendToChat, showToast, markRead, unread, reload }: {
  onSendToChat?: (message: string) => void | Promise<void>
  showToast: (msg: string, bad?: boolean) => void
  markRead: () => Promise<void>
  unread: number
  reload: () => Promise<unknown>
}) {
  const [events, setEvents] = useState<NetEvent[] | null>(null)

  const refresh = async () => {
    try {
      setEvents(await loadEvents(60))
    } catch (e) {
      showToast(`事件加载失败：${(e as Error).message}`, true)
    }
  }

  useEffect(() => { refresh() }, [])

  const doClear = async () => {
    if (!window.confirm('清空全部网络事件记录？（不影响探测与历史桶）')) return
    const n = await clearEvents().catch(() => 0)
    showToast(`已清空 ${n} 条事件`)
    await refresh()
    await reload()
  }

  const doSend = (ev: NetEvent) => {
    if (!onSendToChat) return
    onSendToChat(`【网络哨兵事件】${new Date(ev.at).toLocaleString('zh-CN', { hour12: false })} ${ev.summary}`)
  }

  if (events === null) return <div className="ns-empty">加载中…</div>

  return (
    <>
      <div className="ns-feed-hint">
        最近 {events.length} 条事件（边沿触发，同类至少间隔 30 分钟）
        {unread > 0 && <button className="ns-btn sm" onClick={() => { markRead(); showToast('已全部标记已读') }}>标记已读({unread})</button>}
        {events.length > 0 && <button className="ns-btn sm danger" onClick={doClear}>清空</button>}
      </div>
      {events.length === 0 && (
        <div className="ns-empty">
          还没有网络事件——说明网络一直安稳。<br />
          <span style={{ fontSize: 10.5, color: '#5C6678' }}>断网、目标失联、延迟劣化发生时会记录在这里。</span>
        </div>
      )}
      {events.map((ev) => {
        const meta = EVENT_TYPE_META[ev.type as EventType] || { label: ev.type, color: '#8B95A7' }
        const bad = ev.type.endsWith('_down') || ev.type === 'latency_high'
        return (
          <div key={ev.at} className="ns-ev" style={{ borderLeftColor: meta.color }}>
            <div className="ns-ev-h">
              <b style={{ color: meta.color }}>{meta.label}</b>
              <span>{new Date(ev.at).toLocaleString('zh-CN', { hour12: false })}</span>
              {onSendToChat && <button className="ns-btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => doSend(ev)}>问 AI</button>}
            </div>
            <div className="ns-ev-sum">{ev.summary}</div>
          </div>
        )
      })}
    </>
  )
}
