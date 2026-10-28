/**
 * 详情抽屉：一个想法的完整卡片（星图/池子/回访共用入口）。
 * 动作与 MCP 同一语义（core 权威）：深化 / 推进 / 再等等 / 归档-恢复 / 改题。
 * 「让 AI 深化」经宿主 onSendToChat 唤起对话。
 */
import { useEffect, useState } from 'react'
import {
  getIdea, deepenIdea, promoteIdea, applyRevisitOutcome, archiveIdea, restoreIdea, retitleIdea,
  kindLabel, matLabel, fmtDateTime, fmtDueRelative, fmtIdeaLine, timeAgo,
  MATURITIES, type Idea,
} from './model'

const MATURITIES_DESC: Record<number, string> = Object.fromEntries(
  MATURITIES.map((m, i) => [i, m.desc]),
)

const EVENT_LABELS: Record<string, string> = {
  catch: '捕获', question: '追问', deepen: '深化', promote: '推进',
  revisit: '回访', archive: '归档', restore: '恢复', edit: '改题', collide: '碰撞',
}

interface Props {
  id: string
  reload: () => Promise<Idea[]>
  showToast: (msg: string, kind?: 'bad' | 'good') => void
  onClose: () => void
  onSendToChat: (msg: string) => void | Promise<void>
}

export default function DetailDrawer({ id, reload, showToast, onClose, onSendToChat }: Props) {
  const [idea, setIdea] = useState<Idea | null>(null)
  const [err, setErr] = useState('')
  const [deepenText, setDeepenText] = useState('')
  const [promoteNote, setPromoteNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    getIdea(id).then((v) => { if (alive) setIdea(v) }).catch((e) => { if (alive) setErr((e as Error).message) })
    return () => { alive = false }
  }, [id])

  const run = async (fn: () => Promise<{ ok: boolean; error?: string; idea?: Idea }>, okMsg: string) => {
    setBusy(true)
    try {
      const res = await fn()
      if (!res.ok) {
        showToast(res.error || '操作失败', 'bad')
        return
      }
      showToast(okMsg)
      const next = await reload()
      setIdea(next.find((i) => i.id === id) || null)
      setDeepenText(''); setPromoteNote('')
    } finally {
      setBusy(false)
    }
  }

  if (err) {
    return (
      <div className="lx-drawer" onClick={onClose}>
        <div className="lx-drawer-box" onClick={(e) => e.stopPropagation()}>
          <div className="lx-drawer-body"><div className="lx-empty">加载失败：{err}</div></div>
        </div>
      </div>
    )
  }
  if (!idea) {
    return (
      <div className="lx-drawer" onClick={onClose}>
        <div className="lx-drawer-box" onClick={(e) => e.stopPropagation()}>
          <div className="lx-drawer-body"><div className="lx-empty">载入中…</div></div>
        </div>
      </div>
    )
  }

  const matDesc = MATURITIES_DESC[idea.maturity] || ''

  return (
    <div className="lx-drawer" onClick={onClose}>
      <div className="lx-drawer-box" onClick={(e) => e.stopPropagation()}>
        <div className="lx-drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div className="lx-editrow" style={{ marginTop: 0 }}>
                <input
                  className="lx-inp"
                  value={titleDraft}
                  maxLength={60}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && titleDraft.trim()) {
                      run(() => retitleIdea(idea.id, titleDraft.trim()), '已改题')
                      setEditing(false)
                    }
                  }}
                />
                <button
                  className="lx-btn sm"
                  disabled={busy || !titleDraft.trim()}
                  onClick={() => { run(() => retitleIdea(idea.id, titleDraft.trim()), '已改题'); setEditing(false) }}
                >
                  存
                </button>
                <button className="lx-btn ghost sm" onClick={() => setEditing(false)}>取消</button>
              </div>
            ) : (
              <b onClick={() => { setEditing(true); setTitleDraft(idea.title) }} style={{ cursor: 'text' }} title="点击改题">
                {idea.title}
              </b>
            )}
            <div className="lx-sub" style={{ marginTop: 2 }}>
              {kindLabel(idea.kind)} · {matLabel(idea.maturity)}{matDesc ? `（${matDesc}）` : ''}
              {idea.status !== 'active' ? ` · ${idea.status === 'done' ? '已落地' : '归档中'}` : ''}
              {idea.status === 'active' && idea.revisit.dueAt > 0
                ? ` · 回访${fmtDueRelative(idea.revisit.dueAt, Date.now())}（间隔 ${idea.revisit.interval} 天）`
                : ''}
              {' · '}
              {timeAgo(idea.createdAt)}捕获
            </div>
          </div>
          <button className="lx-x" onClick={onClose}>✕</button>
        </div>
        <div className="lx-drawer-body">
          {idea.raw && <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{idea.raw}</div>}
          {idea.url && (
            <div className="lx-sub" style={{ marginTop: 6, wordBreak: 'break-all' }}>
              来源：<a href={idea.url} target="_blank" rel="noreferrer" style={{ color: '#9FB6DD' }}>{idea.url}</a>
            </div>
          )}
          {(idea.tags || []).length > 0 && (
            <div className="lx-row" style={{ marginTop: 8 }}>
              {idea.tags.map((t) => <span key={t} className="lx-chip">#{t}</span>)}
            </div>
          )}

          <div className="lx-lbl">动作</div>
          <textarea
            className="lx-inp lx-ta"
            placeholder="深化：写下新的理解/方案/反驳（沉淀进时间线，回访间隔翻倍）"
            value={deepenText}
            onChange={(e) => setDeepenText(e.target.value)}
          />
          <div className="lx-editrow">
            <button
              className="lx-btn sm"
              disabled={busy || idea.status !== 'active' || !deepenText.trim()}
              onClick={() => run(() => deepenIdea(idea.id, deepenText.trim()), '已沉淀')}
            >
              沉淀
            </button>
            <input
              className="lx-inp"
              style={{ flex: 1, minWidth: 0 }}
              placeholder="推进依据（可空）"
              value={promoteNote}
              onChange={(e) => setPromoteNote(e.target.value)}
            />
            <button
              className="lx-btn gold sm"
              disabled={busy || idea.status !== 'active' || idea.maturity >= 4}
              onClick={() => run(() => promoteIdea(idea.id, promoteNote.trim() || undefined), '已推进')}
            >
              推进 →
            </button>
          </div>
          <div className="lx-editrow">
            <button
              className="lx-btn ghost sm"
              disabled={busy || idea.status !== 'active'}
              onClick={() => run(() => applyRevisitOutcome(idea.id, 'snooze'), '再等等：间隔已翻倍')}
            >
              再等等
            </button>
            {idea.status === 'archived' ? (
              <button className="lx-btn ghost sm" disabled={busy} onClick={() => run(() => restoreIdea(idea.id), '已恢复入池')}>
                恢复入池
              </button>
            ) : (
              <button className="lx-btn danger sm" disabled={busy || idea.status !== 'active'} onClick={() => run(() => archiveIdea(idea.id), '已归档')}>
                归档
              </button>
            )}
            <button
              className="lx-btn ghost sm"
              onClick={() => onSendToChat(`灵犀，帮我深化这个想法：${fmtIdeaLine(idea, Date.now())}。先给我三个追问，再一起把轮廓聊出来。`)}
            >
              让 AI 深化
            </button>
          </div>

          <div className="lx-lbl">时间线</div>
          <div className="lx-timeline">
            {(idea.timeline || []).map((e, idx) => (
              <div className="lx-tl-item" key={`${e.at}-${idx}`}>
                <span className="k">{EVENT_LABELS[e.kind] || e.kind}</span>
                <span className="t" style={{ whiteSpace: 'pre-wrap' }}>{e.text}</span>
                <span className="d">{fmtDateTime(e.at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
