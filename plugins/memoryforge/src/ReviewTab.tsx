/**
 * 复习 Tab：SM-2 队列逐卡过（到期卡在前、新卡在后）。
 * 交互：点卡/空格翻面 → 1-4 或按钮评分；「重来」的卡在本组末尾再排一次（10 分钟后到期）。
 * 评分即写 cap.kv（调度 + 连击），本组状态本地推进，不打断节奏。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as core from '../shared/srs-core.js'
import {
  gradeCard, deckNameOf, fmtDue, fmtIvl, GRADE_LABELS,
  type Card, type Snapshot,
} from './model'

type Toast = (msg: string, kind?: 'bad' | 'good') => void

export default function ReviewTab({ snap, reload, showToast, loadedAt }: {
  snap: Snapshot | null
  reload: () => Promise<Snapshot | null>
  showToast: Toast
  loadedAt: number
}) {
  const [queue, setQueue] = useState<Card[]>([])
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sessionDone, setSessionDone] = useState(0)

  // 快照变化（加载/切页回来）→ 重置本组队列
  useEffect(() => {
    if (!snap) return
    setQueue(snap.queue.queue)
    setIdx(0)
    setRevealed(false)
    setSessionDone(0)
  }, [snap, loadedAt])

  const current = queue[idx] || null
  const predict = useCallback((card: Card | null, g: 0 | 1 | 2 | 3): string => {
    if (!card) return ''
    const r = core.gradeCard(card, g, Date.now())
    return r.card ? fmtIvl(r.card.intervalMin) : ''
  }, [])

  const doGrade = useCallback(async (g: 0 | 1 | 2 | 3) => {
    const card = queue[idx]
    if (!card || busy) return
    setBusy(true)
    try {
      const updated = await gradeCard(card.id, g)
      setQueue((q) => {
        const next = q.filter((c) => c.id !== card.id)
        if (g === 0) next.push(updated) // 重来：10 分钟后在本组再见
        return next
      })
      setRevealed(false)
      setSessionDone((n) => n + 1)
      showToast(`${GRADE_LABELS[g]} → ${fmtIvl(updated.intervalMin)}后再见`, 'good')
    } catch (e) {
      showToast(`评分失败：${(e as Error).message}`, 'bad')
    } finally {
      setBusy(false)
    }
  }, [queue, idx, busy, showToast])

  // 键盘：空格/回车翻面，1-4 评分
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!current) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!revealed) setRevealed(true)
        else void doGrade(2)
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        void doGrade((Number(e.key) - 1) as 0 | 1 | 2 | 3)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, revealed, doGrade])

  const queueInfo = useMemo(() => {
    if (!snap) return null
    const q = snap.queue
    return { dueTotal: q.dueTotal, newTotal: q.newTotal, today: q.today, newRemaining: q.newRemaining, reviewRemaining: q.reviewRemaining }
  }, [snap])

  if (!snap) return <div className="mf-empty">载入中…</div>

  // 下一张到期时间（队列空时提示）
  const nextDueAt = snap.cards
    .filter((c) => c.status !== 'new' && c.status !== 'suspended')
    .map((c) => c.due)
    .sort((a, b) => a - b)
    .find((d) => d > Date.now())

  if (!current) {
    const doneAll = (queueInfo?.dueTotal || 0) + Math.max(0, queueInfo?.newRemaining || 0) === 0
    return (
      <div>
        <div className="mf-sec"><i className="mf-bar" />今日队列<span className="mf-hint">本组已完成 {sessionDone} 张</span></div>
        <div className="mf-card">
          <div className="mf-card-b mf-empty">
            {doneAll ? '🎉 今日队列已完成' : '⏳ 限额或到期暂无待学卡片'}
            <br />
            <span className="mf-sub">
              到期 {queueInfo?.dueTotal ?? 0} · 新卡待学 {queueInfo?.newRemaining ?? 0}
              {nextDueAt ? `；下一张 ${fmtIvl((nextDueAt - Date.now()) / 60000)}后到期` : ''}
              <br />
              想加新卡：在聊天里把要记的内容发给 AI（如「把这段做成卡片」），
              <br />或到「卡库」页手动添加。
            </span>
          </div>
        </div>
        <SessionRecap snap={snap} sessionDone={sessionDone} onRefresh={() => void reload()} />
      </div>
    )
  }

  const overdue = current.status !== 'new' && current.due <= Date.now()

  return (
    <div>
      <div className="mf-sec">
        <i className="mf-bar" />复习<span className="mf-hint">{current.status === 'new' ? '新卡' : '到期卡'}</span>
      </div>
      <div className="mf-stage">
        <div className="mf-progress">
          <span>本组剩 {queue.length - idx}</span>
          <span className="track"><i style={{ width: `${queue.length ? ((queue.length - idx) / queue.length) * 100 : 0}%` }} /></span>
          <span>已过 {sessionDone}</span>
        </div>
        <div
          className="mf-flash"
          onClick={() => setRevealed(true)}
          role="button"
          tabIndex={0}
          onKeyDown={() => { /* 由全局键盘监听处理 */ }}
        >
          <div className="meta">
            <span className="mf-badge">{deckNameOf(snap.decks, current.deckId)}</span>
            {current.status === 'new' && <span className="mf-badge warn">新卡</span>}
            {current.status !== 'new' && (
              <span className={`mf-badge ${overdue ? 'over' : ''}`}>
                {overdue ? '已到期' : '到期卡'} · 间隔 {fmtIvl(current.intervalMin)}
              </span>
            )}
            {current.tags.map((t) => <span key={t} className="mf-badge">#{t}</span>)}
            {current.lapses > 0 && <span className="mf-badge">忘过 {current.lapses} 次</span>}
          </div>
          <div className="front">{current.front}</div>
          {revealed && <div className="back">{current.back}</div>}
          <div className="tap">{revealed ? '凭回忆质量评分（1 重来 · 2 困难 · 3 良好 · 4 轻松）' : '点击 / 空格 显示答案'}</div>
        </div>
        {revealed && (
          <div className="mf-grades">
            {([0, 1, 2, 3] as const).map((g) => (
              <button
                key={g}
                className={`mf-grade ${g === 0 ? 'again' : ''} ${g === 3 ? 'easy' : ''}`}
                disabled={busy}
                onClick={() => void doGrade(g)}
              >
                <b>{g + 1} {GRADE_LABELS[g]}</b>
                <small>{predict(current, g)}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** 队列空时的收尾卡：会话小结 + 手动刷新（AI 在聊天里导了新卡可点此同步） */
function SessionRecap({ snap, sessionDone, onRefresh }: { snap: Snapshot; sessionDone: number; onRefresh: () => void }) {
  const s = snap.stats
  return (
    <div className="mf-card">
      <div className="mf-card-b">
        <div className="mf-row" style={{ justifyContent: 'space-between' }}>
          <span className="mf-sub">
            卡库 {s.total} 张（新 {s.byStatus.new} · 学 {s.byStatus.learning} · 复 {s.byStatus.review}{s.byStatus.suspended ? ` · 停 ${s.byStatus.suspended}` : ''}）
            {s.retention30 != null ? ` · 30 天留存 ${s.retention30}%` : ''}
          </span>
          <button className="mf-btn sm ghost" onClick={onRefresh}>↻ 同步卡库</button>
        </div>
        {sessionDone > 0 && (
          <div className="mf-sub" style={{ marginTop: 6 }}>本次会话过了 {sessionDone} 张。评分已实时入账，连击 {s.streak} 天。</div>
        )}
      </div>
    </div>
  )
}
