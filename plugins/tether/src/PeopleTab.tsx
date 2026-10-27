/**
 * 故人 Tab：花名册（搜索/关系筛选/归档开关）+ 详情抽屉
 * 详情 = 档案字段 + 失联状态 + 就地快捷记账（联系/人情/便签/承诺）+ 未闭环承诺 + 最近往来
 */
import { useMemo, useState } from 'react'
import {
  RELATIONS, CHANNELS, upsertPerson, removePersonCascade, setPromiseStatus, appendJournalEvent,
  driftList, dueState, normalizePromise, normalizeEvent, makeId, savePromises,
  type PanelData, type Person, type JournalEvent, type DueState,
} from './model'
import { Section, Avatar, type Toast } from './ui'

interface TabP {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
  selectedPersonId: string | null
  setSelectedPersonId: (id: string | null) => void
  setTab: (t: 'people') => void
}

/** 人物编辑表单（新建/编辑共用） */
function PersonForm({ initial, onDone, onCancel, data, showToast }: {
  initial: Person | null
  onDone: () => void
  onCancel: () => void
  data: PanelData
  showToast: Toast
}) {
  const [f, setF] = useState({
    name: initial?.name || '',
    alias: initial?.alias || '',
    relation: initial?.relation || '其他',
    birthday: initial?.birthday || '',
    cadenceDays: initial?.cadenceDays != null ? String(initial.cadenceDays) : '',
    phone: initial?.contacts?.phone || '',
    wechat: initial?.contacts?.wechat || '',
    email: initial?.contacts?.email || '',
    other: initial?.contacts?.other || '',
    howMet: initial?.howMet || '',
    tags: (initial?.tags || []).join('，'),
    note: initial?.note || '',
  })
  const set = (k: string, v: string) => setF((c) => ({ ...c, [k]: v }))

  const submit = async () => {
    const contacts: Record<string, string> = {}
    for (const k of ['phone', 'wechat', 'email', 'other'] as const) {
      if (f[k].trim()) contacts[k] = f[k].trim()
    }
    const input = {
      id: initial?.id,
      name: f.name.trim(),
      alias: f.alias.trim(),
      relation: f.relation,
      birthday: f.birthday.trim() || undefined,
      cadenceDays: f.cadenceDays.trim() === '' ? null : Number(f.cadenceDays),
      contacts,
      howMet: f.howMet.trim(),
      tags: f.tags.split(/[，,、\s]+/).map((t) => t.trim()).filter(Boolean),
      note: f.note.trim(),
    }
    const r = await upsertPerson(input as Record<string, unknown>, data.peopleBook)
    if (!r.ok) { showToast(r.error || '保存失败', 'bad'); return }
    showToast(`${initial ? '已更新' : '已建档'}：${r.person!.name}`, 'good')
    onDone()
  }

  return (
    <div className="tr-card">
      <div className="tr-card-b">
        <div className="tr-row">
          <input className="tr-inp" style={{ flex: 2, minWidth: 120 }} placeholder="姓名（必填）" value={f.name} onChange={(e) => set('name', e.target.value)} />
          <input className="tr-inp" style={{ flex: 1, minWidth: 100 }} placeholder="称呼（老张）" value={f.alias} onChange={(e) => set('alias', e.target.value)} />
          <select className="tr-sel" value={f.relation} onChange={(e) => set('relation', e.target.value)}>
            {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="tr-row" style={{ marginTop: 6 }}>
          <input className="tr-inp" style={{ flex: 1, minWidth: 110 }} placeholder="生日 MM-DD 或 1990-06-15" value={f.birthday} onChange={(e) => set('birthday', e.target.value)} />
          <input className="tr-inp" style={{ width: 110 }} placeholder="节奏（天，空=默认）" inputMode="numeric" value={f.cadenceDays} onChange={(e) => set('cadenceDays', e.target.value)} />
        </div>
        <div className="tr-row" style={{ marginTop: 6 }}>
          <input className="tr-inp" style={{ flex: 1, minWidth: 90 }} placeholder="电话" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
          <input className="tr-inp" style={{ flex: 1, minWidth: 90 }} placeholder="微信" value={f.wechat} onChange={(e) => set('wechat', e.target.value)} />
          <input className="tr-inp" style={{ flex: 1, minWidth: 90 }} placeholder="邮箱" value={f.email} onChange={(e) => set('email', e.target.value)} />
          <input className="tr-inp" style={{ flex: 1, minWidth: 90 }} placeholder="其他" value={f.other} onChange={(e) => set('other', e.target.value)} />
        </div>
        <input className="tr-inp" style={{ marginTop: 6 }} placeholder="怎么认识的" value={f.howMet} onChange={(e) => set('howMet', e.target.value)} />
        <input className="tr-inp" style={{ marginTop: 6 }} placeholder="标签（逗号分隔，如 重要客户，年度合同）" value={f.tags} onChange={(e) => set('tags', e.target.value)} />
        <textarea className="tr-inp" style={{ marginTop: 6, resize: 'vertical', minHeight: 52 }} placeholder="备注（喜好/忌讳/家人情况…）" value={f.note} onChange={(e) => set('note', e.target.value)} />
        <div className="tr-row" style={{ marginTop: 8 }}>
          <button className="tr-btn" onClick={submit}>{initial ? '保存' : '建档'}</button>
          <button className="tr-btn ghost" onClick={onCancel}>取消</button>
          <span className="tr-sub">生日仅阳历；节奏=想多久联系一次</span>
        </div>
      </div>
    </div>
  )
}

/** 就地快捷记账/立诺 */
function QuickLog({ person, data, reload, showToast, kind, setKind }: {
  person: Person
  data: PanelData
  reload: () => Promise<PanelData | null>
  showToast: Toast
  kind: 'contact' | 'favor' | 'note' | 'promise' | null
  setKind: (k: 'contact' | 'favor' | 'note' | 'promise' | null) => void
}) {
  const [channel, setChannel] = useState('见面')
  const [favorDir, setFavorDir] = useState<'gave' | 'got'>('gave')
  const [promiseDir, setPromiseDir] = useState<'iowe' | 'owedme'>('iowe')
  const [text, setText] = useState('')
  const [due, setDue] = useState('')

  if (!kind) return null

  const submit = async () => {
    const t = text.trim()
    if (!t) { showToast('内容不能为空', 'bad'); return }
    if (kind === 'promise') {
      const norm = normalizePromise({ personId: person.id, direction: promiseDir, text: t, due: due.trim() || undefined })
      if (norm.error || !norm.promise) { showToast(norm.error || '承诺不合法', 'bad'); return }
      await savePromises({ byId: { ...data.promisesBook.byId, [norm.promise.id]: norm.promise } })
      showToast(`立此存照：${promiseDir === 'iowe' ? '我许的' : '我等的'} · ${t}`, 'good')
    } else {
      const norm = normalizeEvent({
        id: makeId(), at: Date.now(), personId: person.id, type: kind,
        channel: kind === 'contact' ? channel : undefined,
        direction: kind === 'favor' ? favorDir : undefined,
        text: t,
      })
      if (norm.error || !norm.event) { showToast(norm.error || '记录不合法', 'bad'); return }
      await appendJournalEvent(norm.event, data.journalBook.events)
      showToast(`已记：${person.name} · ${kind === 'contact' ? channel : kind === 'favor' ? (favorDir === 'gave' ? '帮了他' : '他帮我') : '便签'}`, 'good')
    }
    setText('')
    setDue('')
    setKind(null)
    await reload()
  }

  return (
    <div className="tr-form">
      {kind === 'contact' && (
        <div className="tr-row">
          {CHANNELS.map((c) => (
            <button key={c} className={`tr-chip ${channel === c ? 'on' : ''}`} onClick={() => setChannel(c)}>{c}</button>
          ))}
        </div>
      )}
      {kind === 'favor' && (
        <div className="tr-row">
          <button className={`tr-chip ${favorDir === 'gave' ? 'on' : ''}`} onClick={() => setFavorDir('gave')}>我帮了他</button>
          <button className={`tr-chip ${favorDir === 'got' ? 'on' : ''}`} onClick={() => setFavorDir('got')}>他帮了我</button>
        </div>
      )}
      {kind === 'promise' && (
        <div className="tr-row">
          <button className={`tr-chip ${promiseDir === 'iowe' ? 'on' : ''}`} onClick={() => setPromiseDir('iowe')}>我许的</button>
          <button className={`tr-chip ${promiseDir === 'owedme' ? 'on' : ''}`} onClick={() => setPromiseDir('owedme')}>我等的</button>
          <input className="tr-inp date" type="date" style={{ width: 150 }} value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      )}
      <div className="tr-row">
        <input
          className="tr-inp" style={{ flex: 1 }}
          placeholder={kind === 'contact' ? '聊了什么？一句话即可' : kind === 'favor' ? '帮了什么？' : kind === 'promise' ? '答应了什么？' : '记点什么（喜好/要紧事）'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
        />
        <button className="tr-btn sm" onClick={() => void submit()}>记</button>
        <button className="tr-btn sm ghost" onClick={() => setKind(null)}>收</button>
      </div>
    </div>
  )
}

function PersonDetail({ person, data, reload, showToast, onBack, setTab }: {
  person: Person
  data: PanelData
  reload: () => Promise<PanelData | null>
  showToast: Toast
  onBack: () => void
  setTab: (t: 'people') => void
}) {
  const [editing, setEditing] = useState(false)
  const [quickKind, setQuickKind] = useState<'contact' | 'favor' | 'note' | 'promise' | null>(null)

  const now = Date.now()
  const drift = useMemo(
    () => driftList(data.peopleBook.byId, data.journalBook.events, data.settings, now).find((d) => d.personId === person.id),
    [data, person.id, now],
  )
  const events = useMemo(
    () => data.journalBook.events.filter((e) => e.personId === person.id).sort((a, b) => b.at - a.at).slice(0, 10),
    [data.journalBook.events, person.id],
  )
  const mine = Object.values(data.promisesBook.byId)
    .filter((p) => p.personId === person.id && p.status === 'open')
    .map((p) => ({ ...p, dueState: dueState(p.due, now, data.settings.dueWarnDays) as DueState }))

  const toggleArchive = async () => {
    const r = await upsertPerson({ id: person.id, name: person.name, archivedAt: person.archivedAt ? null : now }, data.peopleBook)
    if (!r.ok) { showToast(r.error || '操作失败', 'bad'); return }
    await reload()
    showToast(person.archivedAt ? '已恢复到在册' : '已归档（失联/生日不再提醒）', 'good')
  }

  const togglePin = async () => {
    const r = await upsertPerson({ id: person.id, name: person.name, pinned: !person.pinned }, data.peopleBook)
    if (!r.ok) { showToast(r.error || '操作失败', 'bad'); return }
    await reload()
  }

  const remove = async () => {
    if (!window.confirm(`删除「${person.name}」及其全部往来与承诺？不可恢复。`)) return
    const n = await removePersonCascade(person.id, data)
    await reload()
    showToast(`已删除 ${person.name}（连带往来 ${n} 条）`)
    onBack()
  }

  const closePromise = async (id: string, text: string) => {
    await setPromiseStatus(id, 'done')
    await reload()
    showToast(`已闭环：${text}`, 'good')
  }

  const contact = person.contacts || {}
  const contactRows = (['phone', 'wechat', 'email', 'other'] as const)
    .filter((k) => contact[k])
    .map((k) => ({ k, label: { phone: '电话', wechat: '微信', email: '邮箱', other: '其他' }[k], v: contact[k] }))

  return (
    <div>
      <div className="tr-card">
        <div className="tr-detail-head">
          <button className="tr-back" onClick={onBack}>←</button>
          <Avatar person={person} size={40} />
          <div className="tr-tt" style={{ flex: 1 }}>
            <b style={{ fontSize: 14 }}>
              {person.name}
              {person.alias && person.alias !== person.name ? <span style={{ color: '#8B95A7', fontWeight: 400 }}>（{person.alias}）</span> : null}
              <span className="tr-tag" style={{ marginLeft: 6 }}>{person.relation}</span>
              {person.pinned ? <span style={{ marginLeft: 4 }}>📌</span> : null}
            </b>
            <small style={{ color: drift && drift.level === 'lost' ? '#FF8A9A' : drift && drift.level === 'warn' ? '#F2C063' : '#8B95A7' }}>
              {drift ? drift.text : ''}
            </small>
          </div>
        </div>
        <div className="tr-detail-grid">
          {person.birthday && <div><span>生日</span><b>{person.birthday}</b></div>}
          <div><span>联系节奏</span><b>{person.cadenceDays ? `${person.cadenceDays} 天` : `默认 ${data.settings.defaultCadenceDays} 天`}</b></div>
          {contactRows.map((c) => <div key={c.k}><span>{c.label}</span><b>{c.v}</b></div>)}
          {person.howMet && <div style={{ gridColumn: '1 / -1' }}><span>怎么认识</span><b>{person.howMet}</b></div>}
          {!!(person.tags && person.tags.length) && (
            <div style={{ gridColumn: '1 / -1' }}><span>标签</span><b>{person.tags.join('、')}</b></div>
          )}
          {person.note && <div style={{ gridColumn: '1 / -1' }}><span>备注</span><b style={{ fontWeight: 400 }}>{person.note}</b></div>}
        </div>
        <div className="tr-actions">
          <button className="tr-btn sm" onClick={() => setQuickKind(quickKind === 'contact' ? null : 'contact')}>记联系</button>
          <button className="tr-btn sm ghost" onClick={() => setQuickKind(quickKind === 'favor' ? null : 'favor')}>记人情</button>
          <button className="tr-btn sm ghost" onClick={() => setQuickKind(quickKind === 'note' ? null : 'note')}>写便签</button>
          <button className="tr-btn sm ghost" onClick={() => setQuickKind(quickKind === 'promise' ? null : 'promise')}>加承诺</button>
          <button className="tr-btn sm ghost" onClick={() => setEditing(!editing)}>{editing ? '收起编辑' : '编辑'}</button>
          <button className="tr-btn sm ghost" onClick={togglePin}>{person.pinned ? '取消置顶' : '置顶'}</button>
          <button className="tr-btn sm ghost" onClick={toggleArchive}>{person.archivedAt ? '恢复' : '归档'}</button>
          <button className="tr-btn sm danger" onClick={remove}>删除</button>
        </div>
        <QuickLog person={person} data={data} reload={reload} showToast={showToast} kind={quickKind} setKind={setQuickKind} />
      </div>

      {editing && (
        <PersonForm initial={person} data={data} showToast={showToast} onDone={() => { setEditing(false); void reload() }} onCancel={() => setEditing(false)} />
      )}

      <Section title="未闭环承诺" hint={`${mine.length} 条`} />
      <div className="tr-card">
        <div className="tr-card-b" style={{ padding: mine.length ? '4px 13px' : 0 }}>
          {mine.length ? mine.map((p) => (
            <div className="tr-promise" key={p.id}>
              <span className={`tr-dir ${p.direction}`}>{p.direction === 'iowe' ? '我许的' : '我等的'}</span>
              <div className="tr-promise-main">
                <b>{p.text}</b>
                <small>{p.dueState.label}</small>
              </div>
              <button className="tr-btn sm" onClick={() => closePromise(p.id, p.text)}>闭环 ✓</button>
            </div>
          )) : <div className="tr-empty" style={{ padding: '12px' }}>和这位之间没有悬着的承诺</div>}
        </div>
      </div>

      <Section title="最近往来" hint="" />
      <div className="tr-card">
        <div className="tr-card-b" style={{ padding: events.length ? '4px 13px' : 0 }}>
          {events.length ? events.map((e) => (
            <div className="tr-event" key={e.id}>
              <span className={`tr-kind ${e.type === 'favor' ? `favor-${e.direction}` : ''}`}>{e.type === 'contact' ? (e.channel || '联系') : e.type === 'favor' ? (e.direction === 'gave' ? '帮了他' : '他帮我') : '便签'}</span>
              <div className="tr-event-body">
                <b style={{ fontWeight: 400 }}>{e.text}</b>
                <small>{new Date(e.at).toLocaleDateString('zh-CN')}</small>
              </div>
            </div>
          )) : <div className="tr-empty" style={{ padding: '12px' }}>还没有往来记录——点上面的「记联系」记第一笔</div>}
        </div>
      </div>
      <div style={{ height: 8 }} />
    </div>
  )
}

export default function PeopleTab({ data, reload, showToast, selectedPersonId, setSelectedPersonId, setTab }: TabP) {
  const [query, setQuery] = useState('')
  const [relation, setRelation] = useState<string>('')
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)

  if (!data) return <div className="tr-empty">载入中…</div>
  const now = Date.now()

  const selected = selectedPersonId ? data.peopleBook.byId[selectedPersonId] : null
  if (selected) {
    return (
      <PersonDetail
        person={selected}
        data={data}
        reload={reload}
        showToast={showToast}
        onBack={() => setSelectedPersonId(null)}
        setTab={setTab}
      />
    )
  }

  const drift = driftList(data.peopleBook.byId, data.journalBook.events, data.settings, now)
  const driftById = new Map(drift.map((d) => [d.personId, d]))
  const q = query.trim().toLowerCase()
  const list = Object.values(data.peopleBook.byId)
    .filter((p) => {
      if (!p) return false
      if (showArchived ? !p.archivedAt : !!p.archivedAt) return false
      if (relation && p.relation !== relation) return false
      if (q) {
        const hay = [p.name, p.alias, p.howMet, p.note, ...(p.tags || [])].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.name.localeCompare(b.name, 'zh'))

  return (
    <div>
      <Section title="故人" hint={`${list.length} 位`} />
      <div className="tr-card">
        <div className="tr-card-b">
          <div className="tr-row">
            <input className="tr-inp" style={{ flex: 1 }} placeholder="搜索名字 / 标签 / 备注" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="tr-btn" onClick={() => setAdding(!adding)}>{adding ? '收起' : '+ 建档'}</button>
          </div>
          <div className="tr-row" style={{ marginTop: 8 }}>
            <button className={`tr-chip ${relation === '' ? 'on' : ''}`} onClick={() => setRelation('')}>全部</button>
            {RELATIONS.map((r) => (
              <button key={r} className={`tr-chip ${relation === r ? 'on' : ''}`} onClick={() => setRelation(relation === r ? '' : r)}>{r}</button>
            ))}
          </div>
        </div>
        {adding && (
          <PersonForm
            initial={null}
            data={data}
            showToast={showToast}
            onDone={() => { setAdding(false); void reload() }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>

      <div className="tr-card">
        <div className="tr-card-b" style={{ padding: list.length ? '2px 0' : 0 }}>
          {list.length ? list.map((p) => {
            const d = driftById.get(p.id)
            return (
              <div className="tr-person" key={p.id} onClick={() => setSelectedPersonId(p.id)}>
                <Avatar person={p} />
                <div className="tr-person-main">
                  <b>
                    {p.name}
                    {p.alias && p.alias !== p.name ? <span style={{ color: '#5C6678', fontWeight: 400 }}>（{p.alias}）</span> : null}
                    {p.pinned ? ' 📌' : ''}
                    {p.archivedAt ? <span className="tr-tag">已归档</span> : d && d.level !== 'ok' ? <span className={`tr-dot ${d.level}`} style={{ marginLeft: 4 }} /> : null}
                  </b>
                  <small>{d ? d.text : ''}</small>
                </div>
                <span className="tr-tag">{p.relation}</span>
              </div>
            )
          }) : <div className="tr-empty">{showArchived ? '没有归档的人物' : '还没有人物档案——点右上「+ 建档」，或直接对 AI 说「帮我记一下张总」'}</div>}
        </div>
        <div className="tr-card-b" style={{ paddingTop: 0 }}>
          <button className={`tr-chip ${showArchived ? 'on' : ''}`} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? '← 回到在册' : '查看已归档'}
          </button>
        </div>
      </div>
    </div>
  )
}
