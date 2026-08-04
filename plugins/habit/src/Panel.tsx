import { useState, useEffect, useCallback } from 'react'

interface Habit {
  id: string
  name: string
  frequency: string
  streak: number
  lastDone: number | null
  history: number[]
  createdAt: number
}
interface Stats { total: number; due: number; totalStreak: number; avgStreak: number }

export default function HabitPanel({ pluginId }: { pluginId: string }) {
  const [habits, setHabits] = useState<Habit[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [port, setPort] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const api = (window as unknown as { __POLARIS_PLUGIN_SERVICES__?: { getStatus: (pid: string, sid: string) => Promise<{ port?: number; state: string }> } }).__POLARIS_PLUGIN_SERVICES__
    if (!api) { setMsg('Service API 不可用'); return }
    api.getStatus(pluginId, 'habit-svc').then((s) => { if (s.port) setPort(s.port); else setMsg('Service 未运行: ' + s.state) }).catch((e) => setMsg('获取 Service 状态失败: ' + (e?.message || e)))
  }, [pluginId])

  const apiBase = port ? `http://localhost:${port}` : null
  const refresh = useCallback(async () => {
    if (!apiBase) return
    try {
      const [h, s] = await Promise.all([
        fetch(`${apiBase}/habits`).then(r => r.json()),
        fetch(`${apiBase}/stats`).then(r => r.json()),
      ])
      setHabits(h.habits || [])
      setStats(s)
    } catch (e) { setMsg('加载失败: ' + (e instanceof Error ? e.message : String(e))) }
  }, [apiBase])

  useEffect(() => { if (apiBase) refresh() }, [apiBase, refresh])

  const add = async () => {
    if (!apiBase) return
    const name = prompt('习惯名（如"喝水"）'); if (!name) return
    const freq = confirm('每日？取消=每周') ? 'daily' : 'weekly'
    await fetch(`${apiBase}/habits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, frequency: freq }) })
    refresh()
  }

  const done = async (id: string) => {
    if (!apiBase) return
    const res = await fetch(`${apiBase}/habits/${id}/done`, { method: 'POST' }).then(r => r.json())
    setMsg(`✓ ${res.name} 连续 ${res.streak} 天`)
    refresh()
  }

  const del = async (id: string) => {
    if (!apiBase || !confirm('删除？')) return
    await fetch(`${apiBase}/habits/${id}`, { method: 'DELETE' })
    refresh()
  }

  if (!apiBase) return <div style={{ padding: 24, color: '#8E8E93', fontSize: 13 }}>{msg || '启动习惯服务…'}</div>

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 12, padding: '10px 12px', borderBottom: '1px solid #3F3F46' }}>
        {stats ? (
          <>
            <Stat label="总数" value={stats.total} color="#8E8E93" />
            <Stat label="到期" value={stats.due} color="#F59E0B" />
            <Stat label="总连续" value={stats.totalStreak} color="#10B981" />
          </>
        ) : <span style={{ color: '#8E8E93' }}>加载…</span>}
        <div style={{ flex: 1 }} />
        <button onClick={add} style={btnStyle}>+</button>
        <button onClick={refresh} style={btnStyle}>↻</button>
      </div>

      {msg && <div style={{ padding: '6px 12px', color: msg.startsWith('✓') ? '#10B981' : '#EF4444', fontSize: 11 }}>{msg}</div>}

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {habits.length === 0 ? <div style={{ color: '#8E8E93', textAlign: 'center', padding: 24, fontSize: 11 }}>暂无习惯，点 + 添加</div> :
          habits.map(h => {
            const period = h.frequency === 'daily' ? 86400000 : 604800000
            const due = !h.lastDone || Date.now() - h.lastDone >= period
            return (
              <div key={h.id} style={{ padding: 12, marginBottom: 8, borderRadius: 8, background: '#25252B', border: '1px solid #3F3F46' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{h.name}</div>
                    <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{h.frequency === 'daily' ? '每日' : '每周'} · 连续 {h.streak} {h.frequency === 'daily' ? '天' : '周'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => done(h.id)} disabled={!due} style={{ ...btnStyle, background: due ? '#10B98122' : '#3F3F46', color: due ? '#10B981' : '#6B7280', borderColor: due ? '#10B981' : '#3F3F46', opacity: due ? 1 : 0.5 }}>{due ? '打卡' : '✓今日'}</button>
                    <button onClick={() => del(h.id)} style={{ ...btnStyle, padding: '2px 6px' }}>✕</button>
                  </div>
                </div>
              </div>
            )
          })
        }
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return <div><span style={{ fontSize: 18, fontWeight: 600, color }}>{value}</span><div style={{ fontSize: 10, color: '#8E8E93' }}>{label}</div></div>
}
const btnStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#F8F8F8', fontSize: 11, cursor: 'pointer' }
