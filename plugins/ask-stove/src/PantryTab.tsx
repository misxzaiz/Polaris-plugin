/**
 * 库存 Tab：五分区折叠 + 添加表单 + 消耗/移除
 */
import { useState } from 'react'
import * as core from '../shared/stove-core.js'
import { expiresLabel, LOCATION_LABELS, LOCATIONS, type Api, type Overview, type Toast } from './model'

export default function PantryTab(props: { ov: Overview; api: Api; toast: Toast }) {
  const { ov, api, toast } = props
  const [showForm, setShowForm] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('')
  const [location, setLocation] = useState('fridge')
  const [expires, setExpires] = useState('')
  const [note, setNote] = useState('')

  const submit = () => {
    if (!name.trim()) { toast('先写个食材名', true); return }
    api.pantryAdd({
      name: name.trim(),
      qty: qty.trim() === '' ? null : Number(qty),
      unit: unit.trim(),
      location,
      expiresAt: expires || null,
      note: note.trim() || undefined,
    }, toast)
    setName(''); setQty(''); setUnit(''); setExpires(''); setNote('')
    setShowForm(false)
  }

  const groups = LOCATIONS.map((loc) => ({
    loc,
    items: ov.pantry.items
      .filter((x) => x.location === loc)
      .sort((a, b) => (a.expiresAt || Infinity) - (b.expiresAt || Infinity)),
  }))

  return (
    <>
      <div className="as-sec">
        <span className="as-bar" />库存
        <span className="as-hint">{ov.pantry.items.length} 种</span>
        <button className="as-btn sm" style={{ marginLeft: 8 }} onClick={() => setShowForm(!showForm)}>{showForm ? '收起' : '+ 入库'}</button>
      </div>
      {showForm && (
        <div className="as-card"><div className="as-card-b">
          <div className="as-row">
            <input className="as-inp" style={{ flex: 2 }} placeholder="食材名（如 排骨）" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="as-inp d" style={{ flex: 1 }} placeholder="数量" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />
            <input className="as-inp d" style={{ flex: 1 }} placeholder="单位" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div className="as-row" style={{ marginTop: 8 }}>
            <select className="as-sel" value={location} onChange={(e) => setLocation(e.target.value)}>
              {LOCATIONS.map((l) => <option key={l} value={l}>{LOCATION_LABELS[l]}</option>)}
            </select>
            <input className="as-inp d" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            <input className="as-inp" style={{ flex: 1 }} placeholder="备注（可选）" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="as-row" style={{ marginTop: 10 }}>
            <button className="as-btn" onClick={submit}>入库</button>
            <span className="as-sub">到期日可空；也可以直接在聊天里对 AI 说「买了两斤排骨」让它入库。</span>
          </div>
        </div></div>
      )}
      {groups.map((g) => (
        <div key={g.loc}>
          <div
            className="as-sec"
            style={{ cursor: 'pointer' }}
            onClick={() => setCollapsed((c) => ({ ...c, [g.loc]: !c[g.loc] }))}
          >
            <span className="as-bar" style={{ opacity: 0.6 }} />
            {LOCATION_LABELS[g.loc]}
            <span className="as-hint">{g.items.length}</span>
          </div>
          {!collapsed[g.loc] && (
            <div className="as-card"><div className="as-card-b">
              {g.items.length === 0 && <div className="as-sub" style={{ padding: '4px 2px' }}>空</div>}
              {g.items.map((it) => {
                const ex = expiresLabel(it.expiresAt, Date.now())
                return (
                  <div className="as-item" key={it.id}>
                    <div className="main">
                      <b>
                        {it.name}{it.qty != null ? ` ${it.qty}${it.unit || ''}` : ''}
                        {ex.level !== 'none' && (
                          <span className={`as-badge ${ex.level === 'over' ? 'hot' : 'soon'}`} style={{ marginLeft: 8 }}>{ex.text}</span>
                        )}
                      </b>
                      <small>入柜 {new Date(it.addedAt).toLocaleDateString()}{it.note ? ` · ${it.note}` : ''}</small>
                    </div>
                    <button className="as-btn sm" onClick={() => api.pantryConsume(it, 'used', toast)}>吃掉</button>
                    <button className="as-btn sm danger" onClick={() => api.pantryConsume(it, 'discarded', toast)}>扔掉</button>
                    <button className="as-btn tiny ghost" title="不记历史的直接移除" onClick={() => api.pantryRemove(it, toast)}>✕</button>
                  </div>
                )
              })}
            </div></div>
          )}
        </div>
      ))}
    </>
  )
}
