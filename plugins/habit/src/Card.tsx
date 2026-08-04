import { useState, useEffect } from 'react'

/**
 * Habit ChatCard — interaction 模式
 * AI 检查到期习惯后发起，用户确认打卡。
 */

interface DueData {
  dueHabits?: Array<{ id: string; name: string; streak: number; frequency: string }>
  prompt?: string
}

export default function HabitCard({ data, status, respond, onSendToChat }: {
  pluginId: string
  cardId: string
  toolName: string
  mode: 'result' | 'interaction'
  status: string
  data: unknown
  response?: unknown
  onSendToChat?: (msg: string) => void | Promise<void>
  respond?: (result: unknown) => Promise<void>
}) {
  const d = (data as DueData) || {}
  const due = d.dueHabits || []
  const [done, setDone] = useState<Set<string>>(new Set())
  const [submitted, setSubmitted] = useState(status === 'answered' || status === 'declined')

  useEffect(() => { if (status === 'answered' && response) setSubmitted(true) }, [status, response])

  if (due.length === 0) return <div style={{ padding: 12, color: '#8E8E93', fontSize: 12 }}>暂无到期习惯</div>

  const toggle = (id: string) => {
    const next = new Set(done)
    if (next.has(id)) next.delete(id); else next.add(id)
    setDone(next)
  }

  const submit = () => {
    setSubmitted(true)
    respond?.({ completed: [...done], declined: due.filter(h => !done.has(h.id)).map(h => h.id) })
  }

  const decline = () => { setSubmitted(true); respond?.({ declined: true, all: due.map(h => h.id) }) }

  return (
    <div style={{ borderRadius: 8, border: '1px solid #3F3F46', background: '#1F1F24', overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #3F3F46' }}>
        <span style={{ fontSize: 11, color: '#F59E0B' }}>⏰ 习惯打卡提醒 · {due.length} 项到期</span>
      </div>
      <div style={{ padding: 12 }}>
        {!submitted ? (
          <>
            {due.map(h => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: 8, borderRadius: 6, background: done.has(h.id) ? '#10B98122' : '#25252B', border: `1px solid ${done.has(h.id) ? '#10B981' : '#3F3F46'}`, cursor: 'pointer' }} onClick={() => toggle(h.id)}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${done.has(h.id) ? '#10B981' : '#6B7280'}`, background: done.has(h.id) ? '#10B981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>{done.has(h.id) ? '✓' : ''}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{h.name}</div>
                  <div style={{ fontSize: 10, color: '#8E8E93' }}>连续 {h.streak} {h.frequency === 'daily' ? '天' : '周'}</div>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={submit} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', background: done.size > 0 ? '#10B981' : '#3F3F46', color: '#fff', fontSize: 12, cursor: done.size > 0 ? 'pointer' : 'not-allowed' }}>提交打卡 ({done.size})</button>
              <button onClick={decline} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #3F3F46', background: 'transparent', color: '#8E8E93', fontSize: 12, cursor: 'pointer' }}>跳过</button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: done.size > 0 ? '#10B981' : '#8E8E93' }}>
            {done.size > 0 ? `✓ 已打卡 ${done.size} 项：${due.filter(h => done.has(h.id)).map(h => h.name).join('、')}` : '已跳过'}
          </div>
        )}
      </div>
    </div>
  )
}
