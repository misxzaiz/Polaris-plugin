/**
 * 采购 Tab：超市动线分组清单 + 计划补齐 + 增删勾
 */
import { useState } from 'react'
import { CATEGORIES, CATEGORY_LABELS, type Api, type Overview, type Toast } from './model'

export default function ShoppingTab(props: { ov: Overview; api: Api; toast: Toast }) {
  const { ov, api, toast } = props
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('')

  const undone = ov.shopping.items.filter((x) => !x.done)
  const done = ov.shopping.items.filter((x) => x.done)

  const submit = () => {
    if (!name.trim()) { toast('写个要买的', true); return }
    api.shoppingAdd({ name: name.trim(), qty: qty.trim() === '' ? null : Number(qty), unit: unit.trim() }, toast)
    setName(''); setQty(''); setUnit('')
  }

  const groups = CATEGORIES
    .map((c) => ({ c, items: undone.filter((x) => x.category === c) }))
    .filter((g) => g.items.length > 0)

  return (
    <>
      <div className="as-sec">
        <span className="as-bar" />采购清单
        <span className="as-hint">{undone.length} 待买{done.length ? ` · ${done.length} 已勾` : ''}</span>
        <button className="as-btn sm ghost" style={{ marginLeft: 8 }} onClick={() => api.shoppingClearDone(toast)}>清空已勾</button>
        <button className="as-btn sm" onClick={() => api.shoppingFillFromPlan(toast)}>按计划补齐</button>
      </div>

      <div className="as-card"><div className="as-card-b">
        <div className="as-row">
          <input className="as-inp" style={{ flex: 2 }} placeholder="要买的（如 排骨）" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
          <input className="as-inp d" style={{ flex: 1 }} placeholder="数量" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />
          <input className="as-inp d" style={{ flex: 1 }} placeholder="单位" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <button className="as-btn" onClick={submit}>加入</button>
        </div>
      </div></div>

      {undone.length === 0 && (
        <div className="as-empty">清单是空的。排好「本周」计划后点「按计划补齐」，缺的料自动进来。</div>
      )}

      {groups.map((g, gi) => (
        <div key={g.c}>
          <div className="as-sec" style={{ opacity: 0.85 }}>
            <span className="as-bar" style={{ opacity: 0.6 }} />
            {gi + 1}. {CATEGORY_LABELS[g.c]}
            <span className="as-hint">{g.items.length}</span>
          </div>
          <div className="as-card"><div className="as-card-b">
            {g.items.map((it) => (
              <div className="as-item" key={it.id}>
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => api.shoppingToggle(it, toast)}
                  style={{ width: 15, height: 15, accentColor: '#C0632B', flexShrink: 0 }}
                />
                <div className="main">
                  <b>{it.name}{it.qty != null ? ` ${it.qty}${it.unit || ''}` : ''}{it.fromPlan ? ' 📋' : ''}</b>
                </div>
                <button className="as-btn tiny ghost" onClick={() => api.shoppingRemove(it, toast)}>✕</button>
              </div>
            ))}
          </div></div>
        </div>
      ))}

      {done.length > 0 && (
        <>
          <div className="as-sec" style={{ opacity: 0.7 }}><span className="as-bar" style={{ opacity: 0.4 }} />已买到</div>
          <div className="as-card" style={{ opacity: 0.7 }}><div className="as-card-b">
            {done.map((it) => (
              <div className="as-item" key={it.id}>
                <input type="checkbox" checked onChange={() => api.shoppingToggle(it, toast)}
                  style={{ width: 15, height: 15, accentColor: '#C0632B', flexShrink: 0 }} />
                <div className="main"><s style={{ fontSize: 12.5 }}>{it.name}</s></div>
                <button className="as-btn tiny ghost" onClick={() => api.shoppingRemove(it, toast)}>✕</button>
              </div>
            ))}
          </div></div>
        </>
      )}
    </>
  )
}
