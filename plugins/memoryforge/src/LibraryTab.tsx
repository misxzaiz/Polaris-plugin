/**
 * 卡库 Tab：检索/过滤 + 手动建卡 + 逐卡编辑/暂停/删除。
 * 列表排序：学习中/复习按到期升序 → 新卡按创建序 → 暂停殿后（librarySort）。
 */
import { useState } from 'react'
import {
  addCard, deleteCards, deckNameOf, ensureDeck, fmtDue, librarySort, searchCards,
  setSuspended, updateCardContent, STATUS_LABEL,
  type Card, type Snapshot,
} from './model'

type Toast = (msg: string, kind?: 'bad' | 'good') => void

export default function LibraryTab({ snap, reload, showToast }: {
  snap: Snapshot | null
  reload: () => Promise<Snapshot | null>
  showToast: Toast
}) {
  const [query, setQuery] = useState('')
  const [deckFilter, setDeckFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  if (!snap) return <div className="mf-empty">载入中…</div>

  // 每渲染直接重算（卡库规模百级，无 memo 必要；也避免 hooks 放在早退之后）
  const allTags = (() => {
    const set = new Set<string>()
    for (const c of snap.cards) for (const t of c.tags || []) set.add(t)
    return [...set].sort()
  })()

  const list = (() => {
    const filtered = searchCards(snap.cards, {
      query: query || undefined,
      deckId: deckFilter || undefined,
      tag: tagFilter || undefined,
      status: (statusFilter || undefined) as Card['status'] | undefined,
    })
    return filtered.sort(librarySort)
  })()

  return (
    <div>
      <div className="mf-sec">
        <i className="mf-bar" />卡库<span className="mf-hint">{snap.cards.length} 张 · 命中 {list.length}</span>
      </div>
      <AddForm snap={snap} open={addOpen} setOpen={setAddOpen} reload={reload} showToast={showToast} />
      <div style={{ padding: '0 16px 8px' }}>
        <input className="mf-inp" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索问题 / 答案 / 标签 / 来源…" />
        <div className="mf-row" style={{ marginTop: 7 }}>
          <select className="mf-sel" value={deckFilter} onChange={(e) => setDeckFilter(e.target.value)}>
            <option value="">全部牌组</option>
            {snap.decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="mf-sel" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部状态</option>
            {(['new', 'learning', 'review', 'suspended'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          {(query || deckFilter || tagFilter || statusFilter) && (
            <button className="mf-chip" onClick={() => { setQuery(''); setDeckFilter(''); setTagFilter(''); setStatusFilter('') }}>清空过滤</button>
          )}
        </div>
        {allTags.length > 0 && (
          <div className="mf-row" style={{ marginTop: 7 }}>
            {allTags.slice(0, 12).map((t) => (
              <button key={t} className={`mf-chip ${tagFilter === t ? 'on' : ''}`} onClick={() => setTagFilter(tagFilter === t ? '' : t)}>#{t}</button>
            ))}
          </div>
        )}
      </div>
      <div className="mf-card">
        <div className="mf-card-b">
          {list.length === 0 && <div className="mf-empty">没有匹配的卡片。<br />在聊天里让 AI 制卡，或点上方「＋ 新卡」手动添加。</div>}
          {list.slice(0, 200).map((c) => (
            <CardRow
              key={c.id}
              card={c}
              snap={snap}
              expanded={expanded === c.id}
              onToggle={() => setExpanded(expanded === c.id ? '' : c.id)}
              reload={reload}
              showToast={showToast}
            />
          ))}
          {list.length > 200 && <div className="mf-sub" style={{ padding: '8px 2px' }}>仅显示前 200 张，请用过滤缩小范围。</div>}
        </div>
      </div>
    </div>
  )
}

function CardRow({ card, snap, expanded, onToggle, reload, showToast }: {
  card: Card
  snap: Snapshot
  expanded: boolean
  onToggle: () => void
  reload: () => Promise<Snapshot | null>
  showToast: Toast
}) {
  const [front, setFront] = useState(card.front)
  const [back, setBack] = useState(card.back)
  const [tags, setTags] = useState((card.tags || []).join(', '))
  const [saving, setSaving] = useState(false)
  const overdue = card.status !== 'new' && card.due <= Date.now()
  const dirty = front !== card.front || back !== card.back || tags !== (card.tags || []).join(', ')

  const save = async () => {
    setSaving(true)
    try {
      const r = await updateCardContent(card.id, {
        front, back,
        tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      })
      if (!r.ok) { showToast(r.error || '保存失败', 'bad'); return }
      showToast('已保存', 'good')
      await reload()
    } finally {
      setSaving(false)
    }
  }

  const toggleSuspend = async () => {
    const toSusp = card.status !== 'suspended'
    await setSuspended(card.id, toSusp)
    showToast(toSusp ? '已暂停（不进复习队列）' : '已恢复（按新卡重新进入队列）', 'good')
    await reload()
  }

  const remove = async () => {
    if (!window.confirm(`永久删除卡片「${card.front.slice(0, 30)}」？不可恢复。`)) return
    await deleteCards([card.id])
    showToast('已删除', 'good')
    await reload()
  }

  return (
    <div className="mf-crow">
      <div className="head" onClick={onToggle}>
        <div className="main">
          <b>{card.front}</b>
          <small>{card.back.slice(0, 60)}{card.back.length > 60 ? '…' : ''}</small>
        </div>
        <span className={`due ${overdue ? 'over' : ''}`}>{STATUS_LABEL[card.status]} · {fmtDue(card)}</span>
      </div>
      {expanded && (
        <div className="detail">
          <span className="mf-lbl" style={{ margin: '0 0 3px' }}>问题面</span>
          <textarea className="mf-txa" value={front} onChange={(e) => setFront(e.target.value)} maxLength={500} />
          <span className="mf-lbl">答案面</span>
          <textarea className="mf-txa" value={back} onChange={(e) => setBack(e.target.value)} maxLength={2000} />
          <span className="mf-lbl">标签（逗号分隔）</span>
          <input className="mf-inp" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="如：算法, 记忆" />
          <div className="stats-line">
            牌组 {deckNameOf(snap.decks, card.deckId)} · ease {card.ease?.toFixed?.(2) ?? card.ease} · 复过 {card.reps} 次 · 忘 {card.lapses} 次
            {card.source ? ` · 来源：${card.source}` : ''}
            <br />建于 {new Date(card.createdAt).toLocaleString('zh-CN', { hour12: false })}
            {card.status !== 'new' ? ` · 到期 ${new Date(card.due).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}
          </div>
          <div className="mf-actions">
            {dirty && <button className="mf-btn sm" disabled={saving} onClick={() => void save()}>保存修改</button>}
            <button className="mf-btn sm ghost" onClick={() => void toggleSuspend()}>{card.status === 'suspended' ? '恢复' : '暂停'}</button>
            <button className="mf-btn sm danger" onClick={() => void remove()}>删除</button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddForm({ snap, open, setOpen, reload, showToast }: {
  snap: Snapshot
  open: boolean
  setOpen: (v: boolean) => void
  reload: () => Promise<Snapshot | null>
  showToast: Toast
}) {
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [deckId, setDeckId] = useState('')
  const [newDeck, setNewDeck] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) {
    return (
      <div style={{ padding: '0 16px 8px' }}>
        <button className="mf-btn sm" onClick={() => setOpen(true)}>＋ 新卡</button>
      </div>
    )
  }

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      let targetDeck = deckId
      const nd = newDeck.trim()
      if (nd) {
        const d = await ensureDeck(nd)
        targetDeck = d.id
      }
      const r = await addCard({
        front, back,
        deckId: targetDeck || undefined,
        tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      })
      if (!r.ok) { showToast(r.error || '添加失败', 'bad'); return }
      setFront(''); setBack(''); setTags(''); setNewDeck('')
      showToast('已添加（按新卡进入队列）', 'good')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '0 16px 8px' }}>
      <div className="mf-card" style={{ margin: 0 }}>
        <div className="mf-card-b">
          <textarea className="mf-txa" value={front} onChange={(e) => setFront(e.target.value)} placeholder="问题面（一卡一原子知识点，≤500 字）" maxLength={500} />
          <div style={{ height: 7 }} />
          <textarea className="mf-txa" value={back} onChange={(e) => setBack(e.target.value)} placeholder="答案面（精炼，≤2000 字）" maxLength={2000} />
          <div className="mf-row" style={{ marginTop: 8 }}>
            <select className="mf-sel" value={deckId} onChange={(e) => setDeckId(e.target.value)} style={{ flex: 1, minWidth: 0 }}>
              <option value="">默认牌组</option>
              {snap.decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input className="mf-inp" style={{ flex: 1, minWidth: 0 }} value={newDeck} onChange={(e) => setNewDeck(e.target.value)} placeholder="或新建牌组名" />
          </div>
          <input className="mf-inp" style={{ marginTop: 8 }} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="标签（逗号分隔，可空）" />
          <div className="mf-actions">
            <button className="mf-btn sm" disabled={!front.trim() || !back.trim() || busy} onClick={() => void submit()}>添加</button>
            <button className="mf-btn sm ghost" onClick={() => setOpen(false)}>收起</button>
          </div>
        </div>
      </div>
    </div>
  )
}
