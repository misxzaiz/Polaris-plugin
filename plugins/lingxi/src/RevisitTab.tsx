/**
 * 回访 Tab：今天到期的想法卡片流（逾期最久的在最上）。
 * 每张卡带捕获时 AI 留的「追问」作为重启思考的抓手；
 * 四动作：推进 / 深化 / 再等等 / 归档 —— 全部经 core 与 MCP 同一语义。
 */
import { useState } from 'react'
import {
  dueRevisits, nextRevisitAt, fmtDay, fmtDueRelative, applyRevisitOutcome,
  kindLabel, matLabel, timeAgo, REVISIT_BASE_DAYS,
  type Idea,
} from './model'

interface Props {
  ideas: Idea[]
  reload: () => Promise<Idea[]>
  showToast: (msg: string, kind?: 'bad' | 'good') => void
  onOpenIdea: (id: string) => void
  onGotoCapture: () => void
}

export default function RevisitTab({ ideas, reload, showToast, onOpenIdea, onGotoCapture }: Props) {
  const now = Date.now()
  const due = dueRevisits(ideas, now)
  const next = nextRevisitAt(ideas)
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const act = async (idea: Idea, outcome: 'deepen' | 'promote' | 'snooze' | 'archive', withNote?: string) => {
    setBusy(true)
    try {
      const res = await applyRevisitOutcome(idea.id, outcome, withNote)
      if (!res.ok) {
        showToast(res.error || '操作失败', 'bad')
        return
      }
      const verb = outcome === 'promote' ? '已推进' : outcome === 'deepen' ? '已深化' : outcome === 'archive' ? '已归档' : '再等等'
      showToast(`「${idea.title}」${verb}`)
      setNoteFor(null)
      setNote('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  if (!ideas.length) {
    return (
      <div className="lx-empty">
        回访队列干净，池子也空着。<br />
        捕获第一个念头，{REVISIT_BASE_DAYS} 天后它会回来见你。
      </div>
    )
  }

  if (!due.length) {
    return (
      <>
        <div className="lx-empty">
          今天没有到期的想法，队列干净。<br />
          {next ? `下一次回访：${fmtDay(next)}（${fmtDueRelative(next, now)}）` : ''}
        </div>
        <div className="lx-card">
          <div className="lx-card-b lx-row" style={{ justifyContent: 'space-between' }}>
            <span className="lx-sub">手痒想现在翻牌？去池子里随便点开一颗星。</span>
            <button className="lx-btn ghost sm" onClick={onGotoCapture}>去池子</button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="lx-sec">
        <span className="lx-bar" />
        今日回访 {due.length} 条
        <span className="lx-hint">推进→3天节奏 · 深化/再等等→间隔翻倍</span>
      </div>
      {due.map((idea) => {
        const q = (idea.timeline || []).find((e) => e.kind === 'question')
        const overdueDays = Math.max(0, Math.floor((now - idea.revisit.dueAt) / 86400000))
        return (
          <div className="lx-card" key={idea.id}>
            <div className="lx-due-head">
              <span
                className="lx-dot"
                style={{ background: idea.status === 'active' ? '#8B7CF6' : '#3a4152' }}
              />
              <b onClick={() => onOpenIdea(idea.id)} style={{ cursor: 'pointer' }}>{idea.title}</b>
              <span className="lx-badge mat">{kindLabel(idea.kind)}·{matLabel(idea.maturity)}</span>
              <span className={`lx-badge ${overdueDays > 0 ? 'over' : ''}`}>
                {overdueDays > 0 ? `逾期 ${overdueDays} 天` : '今日到期'}
              </span>
            </div>
            {q && <div className="lx-due-q">追问：{q.text}</div>}
            {idea.raw && (
              <div className="lx-due-raw">
                {idea.raw.slice(0, 110)}
                {idea.raw.length > 110 ? '…' : ''}
                <span className="lx-hint" style={{ marginLeft: 6 }}>捕获于 {timeAgo(idea.createdAt)}</span>
              </div>
            )}
            {noteFor === idea.id && (
              <div className="lx-note">
                <textarea
                  className="lx-inp lx-ta"
                  placeholder="深化：这段时间又想到了什么？（会沉淀进时间线，回访间隔翻倍）"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="lx-editrow">
                  <button
                    className="lx-btn sm"
                    disabled={busy || !note.trim()}
                    onClick={() => act(idea, 'deepen', note.trim())}
                  >
                    沉淀并翻篇
                  </button>
                  <button className="lx-btn ghost sm" onClick={() => { setNoteFor(null); setNote('') }}>取消</button>
                </div>
              </div>
            )}
            <div className="lx-due-actions">
              <button className="lx-btn sm" disabled={busy} onClick={() => act(idea, 'promote')}>推进</button>
              <button
                className="lx-btn ghost sm"
                disabled={busy}
                onClick={() => { setNoteFor(noteFor === idea.id ? null : idea.id); setNote('') }}
              >
                深化
              </button>
              <button className="lx-btn ghost sm" disabled={busy} onClick={() => act(idea, 'snooze')}>再等等</button>
              <button className="lx-btn danger sm" disabled={busy} onClick={() => act(idea, 'archive')}>归档</button>
            </div>
          </div>
        )
      })}
    </>
  )
}
