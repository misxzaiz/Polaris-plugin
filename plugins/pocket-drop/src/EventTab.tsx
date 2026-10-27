/**
 * 动态 Tab：事件流（服务写入 kv 的 pdrop.event.*，保留 50 条）
 */
import { useEffect, useState } from 'react'
import { getEvents, timeAgo, type DropEvent } from './model'
import type { Toast } from './Panel'

const TYPE_STYLE: Record<string, { label: string; color: string }> = {
  recv: { label: '收到', color: '#93c5fd' },
  send: { label: '投递', color: '#fbbf24' },
  save: { label: '保存', color: '#6ee7a0' },
  del: { label: '删除', color: '#a1a1aa' },
  clean: { label: '清理', color: '#a1a1aa' },
  clear: { label: '清空', color: '#f87171' },
  pin_changed: { label: 'PIN', color: '#c084fc' },
  pin_fail: { label: 'PIN', color: '#f87171' },
  boot: { label: '启动', color: '#6ee7a0' },
}

export default function EventTab({ showToast }: { showToast: Toast }) {
  const [events, setEvents] = useState<DropEvent[] | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const list = await getEvents()
        if (alive) setEvents(list)
      } catch (e) {
        if (alive) { setEvents([]); showToast(`读取动态失败：${(e as Error).message}`, 'bad') }
      }
    }
    void load()
    const timer = setInterval(() => { void load() }, 6000)
    return () => { alive = false; clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (events === null) return <div style={{ color: '#71717a', fontSize: 12 }}>载入中…</div>
  if (!events.length) {
    return (
      <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: '#71717a', lineHeight: 1.8 }}>
        还没有动态。<br />收发、清理、PIN 变更都会记录在这里。
      </div>
    )
  }
  return (
    <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, padding: 4 }}>
      {events.map((e, i) => {
        const st = TYPE_STYLE[e.type] || { label: e.type, color: '#a1a1aa' }
        return (
          <div key={`${e.at}-${i}`} style={{ display: 'flex', gap: 8, padding: '8px 10px', borderBottom: '1px solid #1f1f23', fontSize: 12 }}>
            <span style={{ color: st.color, fontSize: 10, flex: 'none', paddingTop: 2, minWidth: 34 }}>{st.label}</span>
            <span style={{ flex: 1, color: '#d4d4d8', lineHeight: 1.5 }}>{e.summary}</span>
            <span style={{ color: '#52525b', fontSize: 10, flex: 'none', paddingTop: 2 }}>{timeAgo(e.at)}</span>
          </div>
        )
      })}
    </div>
  )
}
