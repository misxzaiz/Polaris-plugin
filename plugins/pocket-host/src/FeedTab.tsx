/**
 * 动态 Tab：阈值告警事件流（CPU/内存/磁盘的告警与恢复），可一键发 AI 分析
 */
import { useCallback, useEffect, useState } from 'react'
import { EVENT_TYPE_META, loadEvents, type HostEvent } from './model'
import type { Toast } from './Panel'

function timeStr(at: number): string {
  return new Date(at).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function FeedTab({ onSendToChat, showToast, markRead, unread, reload }: {
  onSendToChat?: (message: string) => void | Promise<void>
  showToast: Toast
  markRead: () => Promise<void>
  unread: number
  reload: () => Promise<unknown>
}) {
  const [events, setEvents] = useState<HostEvent[] | null>(null)

  const reloadEvents = useCallback(async () => {
    try {
      setEvents(await loadEvents(40))
    } catch (e) {
      showToast(`事件加载失败：${(e as Error).message}`, true)
    }
  }, [showToast])

  useEffect(() => { reloadEvents() }, [reloadEvents])

  const sendToAi = useCallback(async () => {
    if (!onSendToChat) {
      showToast('当前宿主不支持发送到聊天', true)
      return
    }
    const list = (events || []).slice(0, 10)
    if (!list.length) {
      showToast('暂无告警事件可发送', true)
      return
    }
    const text = `【口袋主机】最近 ${list.length} 条主机告警事件，帮我分析一下原因和需要采取的动作：\n${list
      .map((e) => `- [${timeStr(e.at)}] ${e.summary}`)
      .join('\n')}`
    await onSendToChat(text)
    showToast('已发送到聊天')
    await markRead()
    await reload()
  }, [events, onSendToChat, showToast, markRead, reload])

  const onOpen = useCallback(async () => {
    if (unread > 0) await markRead()
  }, [unread, markRead])

  useEffect(() => { onOpen() }, [onOpen])

  return (
    <div>
      <div className="ph-sec" style={{ paddingTop: 10 }}>
        <i className="ph-bar" />告警动态
        <small className="ph-hint">
          {onSendToChat && <button className="ph-btn ghost sm" onClick={sendToAi}>发给 AI 分析</button>}
        </small>
      </div>
      {events === null && <div className="ph-empty">加载中…</div>}
      {events !== null && events.length === 0 && (
        <div className="ph-empty">
          还没有告警事件。<br />
          服务运行期间 CPU/内存/磁盘触发阈值时（持续超限才报，恢复也会记录）会出现在这里。
        </div>
      )}
      {(events || []).map((ev) => {
        const meta = EVENT_TYPE_META[ev.type] || { label: ev.type, color: '#8B95A7' }
        return (
          <div className="ph-ev" key={ev.at} style={{ borderLeftColor: meta.color }}>
            <div className="ph-ev-h">
              <b style={{ color: meta.color }}>{meta.label}</b>
              <span>{timeStr(ev.at)}</span>
            </div>
            <div className="ph-ev-sum">{ev.summary}</div>
          </div>
        )
      })}
    </div>
  )
}
