/**
 * 往来 Tab：全局流水（按日分组）+ 类型筛选 + 关键词 + 记一笔表单
 */
import { useState } from 'react'
import {
  CHANNELS, appendJournalEvent, normalizeEvent, makeId, contactLabel, dayKeyOf,
  type PanelData, type JournalEvent,
} from './model'
import { Section, Avatar, type Toast } from './ui'

type Kind = '' | 'contact' | 'note' | 'favor'

export default function JournalTab({ data, reload, showToast }: {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
}) {
  const [kind, setKind] = useState<Kind>('')
  const [kw, setKw] = useState('')
  const [fPersonId, setFPersonId] = useState('')
  const [nPersonId, setNPersonId] = useState('')
  const [nType, setNType] = useState<'contact' | 'note' | 'favor'>('contact')
  const [nChannel, setNChannel] = useState('见面')
  const [nFavorDir, setNFavorDir] = useState<'gave' | 'got'>('gave')
  const [nText, setNText] = useState('')

  if (!data) return <div className="tr-empty">载入中…</div>
  const peopleById = data.peopleBook.byId
  const activePeople = Object.values(peopleById).filter((p) => !p.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))

  const submit = async () => {
    const t = nText.trim()
    if (!nPersonId) { showToast('选一个人', 'bad'); return }
    if (!t) { showToast('内容不能为空', 'bad'); return }
    const norm = normalizeEvent({
      id: makeId(), at: Date.now(), personId: nPersonId, type: nType,
      channel: nType === 'contact' ? nChannel : undefined,
      direction: nType === 'favor' ? nFavorDir : undefined,
      text: t,
    })
    if (norm.error || !norm.event) { showToast(norm.error || '记录不合法', 'bad'); return }
    await appendJournalEvent(norm.event, data.journalBook.events)
    setNText('')
    await reload()
    const who = peopleById[nPersonId]?.name || ''
    showToast(`已记：${who} · ${contactLabel(norm.event)}`, 'good')
  }

  // 过滤 + 按日分组
  const q = kw.trim().toLowerCase()
  const filtered = data.journalBook.events
    .filter((e) => {
      if (!e) return false
      if (kind && e.type !== kind) return false
      if (fPersonId && e.personId !== fPersonId) return false
      if (q && !String(e.text).toLowerCase().includes(q)) return false
      return true
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, 200)
  const byDay = new Map<string, JournalEvent[]>()
  const todayKey = dayKeyOf(Date.now())
  const yesterdayKey = dayKeyOf(Date.now() - 86400000)
  for (const e of filtered) {
    const k = dayKeyOf(e.at)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(e)
  }
  const dayLabel = (k: string) => (k === todayKey ? '今天' : k === yesterdayKey ? '昨天' : k)

  return (
    <div>
      <Section title="记一笔" />
      <div className="tr-card">
        <div className="tr-card-b">
          <div className="tr-row">
            <select className="tr-sel" style={{ flex: 1 }} value={nPersonId} onChange={(e) => setNPersonId(e.target.value)}>
              <option value="">对象…</option>
              {activePeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className={`tr-chip ${nType === 'contact' ? 'on' : ''}`} onClick={() => setNType('contact')}>联系</button>
            <button className={`tr-chip ${nType === 'favor' ? 'on' : ''}`} onClick={() => setNType('favor')}>人情</button>
            <button className={`tr-chip ${nType === 'note' ? 'on' : ''}`} onClick={() => setNType('note')}>便签</button>
          </div>
          {nType === 'contact' && (
            <div className="tr-row" style={{ marginTop: 6 }}>
              {CHANNELS.map((c) => (
                <button key={c} className={`tr-chip ${nChannel === c ? 'on' : ''}`} onClick={() => setNChannel(c)}>{c}</button>
              ))}
            </div>
          )}
          {nType === 'favor' && (
            <div className="tr-row" style={{ marginTop: 6 }}>
              <button className={`tr-chip ${nFavorDir === 'gave' ? 'on' : ''}`} onClick={() => setNFavorDir('gave')}>我帮了他</button>
              <button className={`tr-chip ${nFavorDir === 'got' ? 'on' : ''}`} onClick={() => setNFavorDir('got')}>他帮了我</button>
            </div>
          )}
          <div className="tr-row" style={{ marginTop: 6 }}>
            <input className="tr-inp" style={{ flex: 1 }} placeholder="发生了什么，一句话即可"
              value={nText} onChange={(e) => setNText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} />
            <button className="tr-btn sm" onClick={() => void submit()}>记</button>
          </div>
        </div>
      </div>

      <Section title="流水" hint={`${filtered.length} 条`} />
      <div className="tr-card">
        <div className="tr-card-b">
          <div className="tr-row">
            <button className={`tr-chip ${kind === '' ? 'on' : ''}`} onClick={() => setKind('')}>全部</button>
            <button className={`tr-chip ${kind === 'contact' ? 'on' : ''}`} onClick={() => setKind('contact')}>联系</button>
            <button className={`tr-chip ${kind === 'favor' ? 'on' : ''}`} onClick={() => setKind('favor')}>人情</button>
            <button className={`tr-chip ${kind === 'note' ? 'on' : ''}`} onClick={() => setKind('note')}>便签</button>
            <select className="tr-sel" style={{ flex: 1, minWidth: 100 }} value={fPersonId} onChange={(e) => setFPersonId(e.target.value)}>
              <option value="">所有人</option>
              {activePeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <input className="tr-inp" style={{ marginTop: 8 }} placeholder="搜内容关键词" value={kw} onChange={(e) => setKw(e.target.value)} />
        </div>
      </div>

      {[...byDay.entries()].map(([day, events]) => (
        <div key={day}>
          <div className="tr-card" style={{ marginTop: 10 }}>
            <div style={{ padding: '8px 13px 0' }}><span className="tr-sub"><b style={{ color: '#8B95A7' }}>{dayLabel(day)}</b></span></div>
            <div className="tr-card-b" style={{ padding: '4px 13px 10px' }}>
              {events.map((e) => {
                const who = peopleById[e.personId]
                return (
                  <div className="tr-event" key={e.id}>
                    {who
                      ? <Avatar person={who} size={26} />
                      : <span className="tr-kind">？</span>}
                    <div className="tr-event-body">
                      <b style={{ fontWeight: 400 }}>{e.text}</b>
                      <small>{who ? who.name : '（已删除）'} · {new Date(e.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small>
                    </div>
                    <span className={`tr-kind ${e.type === 'favor' ? `favor-${e.direction}` : ''}`}>{contactLabel(e)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}
      {!filtered.length && <div className="tr-empty">没有符合条件的往来记录{!kind && !q && !fPersonId ? '——对 AI 说「记一下我今天见了谁」也行' : ''}</div>}
    </div>
  )
}
