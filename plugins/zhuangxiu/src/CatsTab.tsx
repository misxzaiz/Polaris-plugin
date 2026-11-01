/**
 * 科目 Tab：标准模板一键采用 + 分组科目表（预算/已花/进度/红黄绿）+ 建科目 + 改预算
 */
import { useState } from 'react'
import * as core from '../shared/core'
import type { Category } from '../shared/core'
import { applyTemplate, deleteKey, K, saveCategory } from './model'
import type { TabProps } from './PanelTypes'

export default function CatsTab({ data, reload, showToast }: TabProps) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [group, setGroup] = useState(core.GROUPS[0])
  const [budget, setBudget] = useState('')
  const [isExtra, setIsExtra] = useState(false)
  const [edit, setEdit] = useState<Category | null>(null)
  const [editBudget, setEditBudget] = useState('')
  const [editNote, setEditNote] = useState('')
  const [busy, setBusy] = useState(false)

  if (!data) return <div className="zx-empty">载入中…</div>
  const cmp = core.budgetCompare(data.cats, data.exps, data.project?.totalBudget)
  const rowById = new Map(cmp.rows.map((r) => [r.cat.id, r]))
  const expCountByCat = new Map<string, number>()
  for (const e of data.exps) expCountByCat.set(e.catId, (expCountByCat.get(e.catId) || 0) + 1)

  async function onTemplate() {
    setBusy(true)
    try {
      const n = await applyTemplate(data!.cats)
      showToast(n > 0 ? `标准科目模板：新建 ${n} 个科目（预算待录）` : '标准科目均已存在')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function onAdd() {
    setBusy(true)
    try {
      await saveCategory({
        name, group, budget: budget.trim() === '' ? undefined : Number(budget), isExtra, order: data!.cats.length,
      }, null)
      showToast(`已建科目「${name.trim()}」`)
      setName(''); setBudget(''); setIsExtra(false); setAdding(false)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function onSaveEdit() {
    if (!edit) return
    setBusy(true)
    try {
      await saveCategory({
        budget: editBudget.trim() === '' ? null : Number(editBudget),
        note: editNote,
      }, edit)
      showToast('科目已更新')
      setEdit(null)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteCat() {
    if (!edit) return
    const used = expCountByCat.get(edit.id) || 0
    if (used > 0) {
      showToast(`该科目名下仍有 ${used} 笔支出，请先在「流水」迁移或删除`, true, true)
      return
    }
    try {
      await deleteKey(K.cat(edit.id))
      showToast('科目已删除')
      setEdit(null)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  let lastGroup = ''
  return (
    <>
      <div className="zx-sec">
        <i className="zx-bar-ic" />科目表
        <span className="zx-hint">{data.cats.length} 科目 · 预算 ¥{core.fmtMoney(cmp.totals.catBudgetTotal)}</span>
      </div>
      {data.cats.length === 0 && (
        <div className="zx-card"><div className="zx-empty">
          还没有科目。<br />建议先采用<b>标准科目模板</b>（30 项，内嵌防漏项清单），再按报价单逐科目录预算。
          <div style={{ marginTop: 10 }}>
            <button className="zx-btn" disabled={busy} onClick={onTemplate}>一键采用标准科目模板</button>
          </div>
        </div></div>
      )}
      {data.cats.length > 0 && (
        <div style={{ padding: '0 16px 8px' }}>
          <button className="zx-btn ghost sm" disabled={busy} onClick={onTemplate}>补齐标准科目</button>{' '}
          <button className="zx-btn ghost sm" onClick={() => setAdding(!adding)}>{adding ? '收起' : '+ 建科目'}</button>
        </div>
      )}
      {adding && (
        <div className="zx-card"><div className="zx-card-b">
          <label className="zx-lbl">科目名称</label>
          <input className="zx-inp" value={name} placeholder="如 瓷砖 / 增项·窗套加固" onChange={(e) => setName(e.target.value)} />
          <div className="zx-grid2">
            <div>
              <label className="zx-lbl">分组</label>
              <select className="zx-sel" value={group} onChange={(e) => setGroup(e.target.value)}>
                {core.GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="zx-lbl">预算（元，可留空）</label>
              <input className="zx-inp" inputMode="decimal" value={budget} placeholder="如 12800" onChange={(e) => setBudget(e.target.value)} />
            </div>
          </div>
          <label className="zx-lbl"><input type="checkbox" checked={isExtra} onChange={(e) => setIsExtra(e.target.checked)} /> 增项科目（报价单外新增，计入增项合计）</label>
          <div style={{ marginTop: 10 }}>
            <button className="zx-btn" disabled={busy || !name.trim()} onClick={onAdd}>建科目</button>
          </div>
        </div></div>
      )}
      <div className="zx-card">
        {cmp.rows.map((r) => {
          const c = r.cat
          const showGroup = c.group !== lastGroup
          lastGroup = c.group
          const pct = r.pct !== null ? Math.min(r.pct, 100) : 0
          return (
            <div key={c.id}>
              {showGroup && <div className="zx-item" style={{ padding: '7px 13px 3px' }}><span className="zx-sub" style={{ fontWeight: 700 }}>[{c.group}]</span></div>}
              <button
                className="zx-item"
                style={{ width: '100%', background: 'none', border: 'none', borderTop: '1px solid #1d2330', color: 'inherit', textAlign: 'left', cursor: 'pointer', font: 'inherit', display: 'block' }}
                onClick={() => { setEdit(c); setEditBudget(c.budget !== undefined ? String(c.budget) : ''); setEditNote(c.note || '') }}
              >
                <div className="zx-item-t">
                  <b>{c.name}</b>
                  {c.isExtra && <span className="zx-tag yellow">增</span>}
                  {r.level !== 'green' && r.level !== 'gray' && <span className={`zx-tag ${r.level}`}>{r.level === 'red' ? '超支' : '临超'}</span>}
                  <span className="zx-grow" />
                  <span className="zx-right">
                    <b className="zx-money">¥{core.fmtMoney(r.spent)}</b>
                    <span className="zx-sub"> / {r.budget !== null ? `¥${core.fmtMoney(r.budget)}` : '未定'}</span>
                  </span>
                </div>
                <div className="zx-row" style={{ marginTop: 4 }}>
                  <div className="zx-progress"><i className={r.level} style={{ width: `${pct}%` }} /></div>
                  <span className="zx-sub" style={{ width: 34, textAlign: 'right' }}>{r.pct !== null ? `${r.pct}%` : '—'}</span>
                </div>
              </button>
            </div>
          )
        })}
      </div>

      {edit && (
        <div className="zx-modal-bg" onClick={() => setEdit(null)}>
          <div className="zx-modal" onClick={(e) => e.stopPropagation()}>
            <h4>科目「{edit.name}」{edit.isExtra ? '（增项科目）' : ''}</h4>
            <label className="zx-lbl">预算（元；清空=未定预算）</label>
            <input className="zx-inp" inputMode="decimal" value={editBudget} onChange={(e) => setEditBudget(e.target.value)} />
            <label className="zx-lbl">备注</label>
            <input className="zx-inp" value={editNote} placeholder="如 报价单第 3 页 / 含人工" onChange={(e) => setEditNote(e.target.value)} />
            <div className="zx-sub" style={{ marginTop: 6 }}>
              已花 ¥{core.fmtMoney(rowById.get(edit.id)?.spent || 0)}
              {expCountByCat.get(edit.id) ? ` · ${expCountByCat.get(edit.id)} 笔支出` : ' · 无支出'}
            </div>
            <div className="zx-row" style={{ marginTop: 12, gap: 6 }}>
              <button className="zx-btn" disabled={busy} onClick={onSaveEdit}>保存</button>
              <button className="zx-btn ghost" onClick={() => setEdit(null)}>取消</button>
              <span className="zx-grow" />
              <button className="zx-btn danger" onClick={onDeleteCat}>删除科目</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
