import { useState, useEffect, useCallback } from 'react'

/**
 * Recall Cards Panel
 *
 * 复习界面：列出到期卡片 → 翻面 → 4 档评分。
 * 通过 window.__POLARIS_PLUGIN_SERVICES__ 获取 Service 状态与端口，
 * 再用 fetch 调用 Service REST API。
 */

interface Card {
  id: string
  deck: string
  front: string
  back: string
  tags: string[]
  reps: number
  interval: number
  due: number
  lastReview?: number
  grade?: string
  createdAt: number
}

interface Stats {
  total: number
  due: number
  reviewedToday: number
  decks: string[]
}

const GRADES = [
  { key: 'again', label: '重来', color: '#EF4444', hint: '0天' },
  { key: 'hard', label: '困难', color: '#F59E0B', hint: '1天' },
  { key: 'good', label: '良好', color: '#10B981', hint: '3天' },
  { key: 'easy', label: '简单', color: '#3B82F6', hint: '7天' },
] as const

export default function RecallPanel({ pluginId }: { pluginId: string }) {
  const [cards, setCards] = useState<Card[]>([])
  const [current, setCurrent] = useState<Card | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [port, setPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [view, setView] = useState<'review' | 'all'>('review')

  // 获取 Service 端口
  useEffect(() => {
    const api = (window as unknown as { __POLARIS_PLUGIN_SERVICES__?: { getStatus: (pid: string, sid: string) => Promise<{ port?: number; state: string }> } }).__POLARIS_PLUGIN_SERVICES__
    if (!api) { setMsg('Service API 不可用'); return }
    api.getStatus(pluginId, 'recall-svc').then((s) => {
      if (s.port) setPort(s.port)
      else setMsg('Service 未运行: ' + s.state)
    }).catch((e) => setMsg('获取 Service 状态失败: ' + (e?.message || e)))
  }, [pluginId])

  const apiBase = port ? `http://localhost:${port}` : null

  const refresh = useCallback(async () => {
    if (!apiBase) return
    setLoading(true)
    try {
      const [dueRes, statsRes] = await Promise.all([
        fetch(`${apiBase}/cards/due`).then(r => r.json()),
        fetch(`${apiBase}/stats`).then(r => r.json()),
      ])
      setCards(dueRes.cards || [])
      setStats(statsRes)
      setCurrent(null)
      setRevealed(false)
    } catch (e) {
      setMsg('加载失败: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setLoading(false) }
  }, [apiBase])

  useEffect(() => { if (apiBase) refresh() }, [apiBase, refresh])

  const startReview = () => {
    if (cards.length === 0) return
    setCurrent(cards[0])
    setRevealed(false)
  }

  const grade = async (g: string) => {
    if (!current || !apiBase) return
    try {
      await fetch(`${apiBase}/cards/${encodeURIComponent(current.id)}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: g }),
      })
    } catch (e) { setMsg('评分失败: ' + (e instanceof Error ? e.message : String(e))) }
    const next = cards.filter(c => c.id !== current.id)
    setCards(next)
    setCurrent(next[0] || null)
    setRevealed(false)
  }

  const addCard = async () => {
    if (!apiBase) return
    const front = prompt('正面（问题）')
    if (!front) return
    const back = prompt('反面（答案）')
    if (!back) return
    await fetch(`${apiBase}/cards`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ front, back, deck: 'manual' }),
    })
    refresh()
  }

  if (!apiBase) {
    return <div style={{ padding: 24, color: '#8E8E93', fontSize: 13 }}>{msg || '正在启动复习服务…'}</div>
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13 }}>
      {/* 统计栏 */}
      <div style={{ display: 'flex', gap: 12, padding: '10px 12px', borderBottom: '1px solid #3F3F46' }}>
        {stats ? (
          <>
            <Stat label="总数" value={stats.total} color="#8E8E93" />
            <Stat label="待复习" value={stats.due} color="#F59E0B" />
            <Stat label="今日已复习" value={stats.reviewedToday} color="#10B981" />
          </>
        ) : <span style={{ color: '#8E8E93' }}>加载统计…</span>}
      </div>

      {/* 视图切换 */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px' }}>
        <button onClick={() => setView('review')} style={view === 'review' ? activeTab : tab}>复习</button>
        <button onClick={() => setView('all')} style={view === 'all' ? activeTab : tab}>全部</button>
        <div style={{ flex: 1 }} />
        <button onClick={refresh} style={btnStyle}>↻</button>
        <button onClick={addCard} style={btnStyle}>+ 卡片</button>
      </div>

      {msg && <div style={{ padding: '6px 12px', color: '#EF4444', fontSize: 11 }}>{msg}</div>}

      {/* 主体 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {view === 'review' ? (
          current ? (
            <CardView card={current} revealed={revealed} onReveal={() => setRevealed(true)} onGrade={grade} />
          ) : (
            <div style={{ textAlign: 'center', color: '#8E8E93', padding: 32 }}>
              {loading ? '加载中…' : cards.length === 0 ? '🎉 暂无到期卡片' : (
                <button onClick={startReview} style={{ ...btnStyle, fontSize: 14, padding: '10px 20px' }}>开始复习 ({cards.length})</button>
              )}
            </div>
          )
        ) : (
          cards.length === 0 ? <div style={{ color: '#8E8E93', textAlign: 'center', padding: 24 }}>暂无卡片</div> :
          <div>{cards.map(c => (
            <div key={c.id} style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: '#25252B', border: '1px solid #3F3F46' }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{c.front}</div>
              <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 4 }}>{c.back}</div>
              <div style={{ fontSize: 10, color: '#6B7280', marginTop: 4 }}>{c.deck} · 复习 {c.reps} 次 · 间隔 {c.interval}天</div>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  )
}

function CardView({ card, revealed, onReveal, onGrade }: {
  card: Card
  revealed: boolean
  onReveal: () => void
  onGrade: (g: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ fontSize: 10, color: '#6B7280' }}>{card.deck} · 复习 {card.reps} 次</div>
      <div style={{ flex: 1, padding: 16, borderRadius: 10, background: '#25252B', border: '1px solid #3F3F46', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 500, textAlign: 'center' }}>{card.front}</div>
      </div>
      {revealed ? (
        <>
          <div style={{ padding: 16, borderRadius: 10, background: '#1F2A1F', border: '1px solid #10B98144', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 14, color: '#10B981', textAlign: 'center', whiteSpace: 'pre-wrap' }}>{card.back}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {GRADES.map(g => (
              <button key={g.key} onClick={() => onGrade(g.key)} style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: `1px solid ${g.color}55`, background: g.color + '22', color: g.color, fontSize: 12, cursor: 'pointer' }}>
                {g.label}<div style={{ fontSize: 9, opacity: 0.7 }}>{g.hint}</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button onClick={onReveal} style={{ padding: '12px 0', borderRadius: 8, border: '1px solid #3F3F46', background: '#2D2D33', color: '#F8F8F8', fontSize: 13, cursor: 'pointer' }}>显示答案</button>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 18, fontWeight: 600, color }}>{value}</span>
      <span style={{ fontSize: 10, color: '#8E8E93' }}>{label}</span>
    </div>
  )
}

const btnStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#F8F8F8', fontSize: 11, cursor: 'pointer' }
const tab: React.CSSProperties = { padding: '4px 12px', borderRadius: 6, border: '1px solid #3F3F46', background: 'transparent', color: '#8E8E93', fontSize: 11, cursor: 'pointer' }
const activeTab: React.CSSProperties = { ...tab, background: '#3B82F622', color: '#3B82F6', borderColor: '#3B82F6' }
