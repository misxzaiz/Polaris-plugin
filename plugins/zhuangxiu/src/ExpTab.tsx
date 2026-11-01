/**
 * 流水 Tab：记一笔（金额/科目/日期/供应商/备注）+ 筛选（科目/供应商/月）+ 改/删
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import type { Expense } from '../shared/core'
import { deleteKey, K, saveExpense } from './model'
import type { TabProps } from './PanelTypes'

function todayStr() { return core.dayKey(Date.now()) }

export default function ExpTab({ data, reload, showToast }: TabProps) {
  const [amount, setAmount] = useState('')
  const [catId, setCatId] = useState('')
  const [date, setDate] = useState(todayStr())
  const [vendorId, setVendorId] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [note, setNote] = useState('')
  const [fCat, setFCat] = useState('all')
  const [fVen, setFVen] = useState('all')
  const [fMonth, setFMonth] = useState('all')
  const [edit, setEdit] = useState<Expense | null>(null)
  const [eAmount, setEAmount] = useState('')
  const [eCatId, setECatId] = useState('')
  const [eDate, setEDate] = useState('')
  const [eVendorId, setEVendorId] = useState('')
  const [ePay, setEPay] = useState('')
  const [eNote, setENote] = useState('')
  const [confirmDel, setConfirmDel] = useState('')
  const [busy, setBusy] = useState(false)

  const catById = useMemo(() => new Map((data?.cats || []).map((c) => [c.id, c])), [data])
  const venById = useMemo(() => new Map((data?.vens || []).map((v) => [v.id, v])), [data])

  if (!data) return <div className="zx-empty">载入中…</div>

  const months = useMemo(() => {
    const s = new Set<string>()
    for (const e of data.exps) s.add(core.dayKeyOfTs(e.ts).slice(0, 7))
    return [...s].sort().reverse()
  }, [data.exps])

  const filtered = useMemo(() => {
    let rs = [...data.exps].reverse()
    if (fCat !== 'all') rs = rs.filter((e) => e.catId === fCat)
    if (fVen !== 'all') rs = rs.filter((e) => (e.vendorId || '') === fVen)
    if (fMonth !== 'all') rs = rs.filter((e) => core.dayKeyOfTs(e.ts).slice(0, 7) === fMonth)
    return rs
  }, [data, fCat, fVen, fMonth])
  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0)

  async function onAdd() {
    setBusy(true)
    try {
      const cid = catId || (data!.cats[0] && data!.cats[0].id)
      if (!cid) { showToast('还没有科目：先到「科目」页采用标准模板', true); return }
      await saveExpense({
        catId: cid,
        amount: Number(amount),
        date,
        vendorId: vendorId || '',
        payMethod,
        note,
      }, null)
      showToast('已记一笔')
      setAmount(''); setNote(''); setPayMethod('')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  function openEdit(e: Expense) {
    setEdit(e)
    setEAmount(String(e.amount))
    setECatId(e.catId)
    setEDate(core.dayKeyOfTs(e.ts))
    setEVendorId(e.vendorId || '')
    setEPay(e.payMethod || '')
    setENote(e.note || '')
  }

  async function onSaveEdit() {
    if (!edit) return
    setBusy(true)
    try {
      await saveExpense({
        catId: eCatId,
        amount: Number(eAmount),
        date: eDate,
        vendorId: eVendorId,
        payMethod: ePay,
        note: eNote,
      }, edit)
      showToast('已修改')
      setEdit(null)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(id: string) {
    if (confirmDel !== id) { setConfirmDel(id); setTimeout(() => setConfirmDel((c) => (c === id ? '' : c)), 3000); return }
    try {
      await deleteKey(K.exp(id))
      showToast('已删除')
      setConfirmDel('')
      setEdit(null)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  return (
    <>
      <div className="zx-sec"><i className="zx-bar-ic" />记一笔<span className="zx-hint">也可对 AI 说「瓷砖买了 3200」</span></div>
      <div className="zx-card"><div className="zx-card-b">
        <div className="zx-grid3">
          <div>
            <label className="zx-lbl">金额（元）</label>
            <input className="zx-inp" inputMode="decimal" value={amount} placeholder="3200" onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="zx-lbl">科目</label>
            <select className="zx-sel" value={catId} onChange={(e) => setCatId(e.target.value)}>
              <option value="">（选择科目）</option>
              {data.cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isExtra ? '（增）' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="zx-lbl">日期</label>
            <input className="zx-inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="zx-grid2" style={{ marginTop: 4 }}>
          <div>
            <label className="zx-lbl">供应商（可选）</label>
            <select className="zx-sel" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">（不关联）</option>
              {data.vens.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="zx-lbl">备注（可选）</label>
            <input className="zx-inp" value={note} placeholder="如 80x80 灰砖 3 箱" onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="zx-btn" disabled={busy || !amount} onClick={onAdd}>记入台账</button>
        </div>
      </div></div>

      <div className="zx-sec">
        <i className="zx-bar-ic" />流水
        <span className="zx-hint">{filtered.length} 笔 · ¥{core.fmtMoney(filteredTotal)}</span>
      </div>
      <div style={{ padding: '0 16px 8px' }} className="zx-grid3">
        <select className="zx-sel" value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="all">全部科目</option>
          {data.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="zx-sel" value={fVen} onChange={(e) => setFVen(e.target.value)}>
          <option value="all">全部供应商</option>
          <option value="">（无供应商）</option>
          {data.vens.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select className="zx-sel" value={fMonth} onChange={(e) => setFMonth(e.target.value)}>
          <option value="all">全部月份</option>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="zx-card">
        {filtered.length === 0 && <div className="zx-empty">没有符合筛选条件的支出</div>}
        {filtered.map((e) => {
          const c = catById.get(e.catId)
          const v = e.vendorId ? venById.get(e.vendorId) : null
          return (
            <div key={e.id} className="zx-item">
              <div className="zx-item-t">
                <span className="zx-sub">{core.dayKeyOfTs(e.ts)}</span>
                <b>{c ? c.name : '（科目已删）'}</b>
                {c && c.isExtra && <span className="zx-tag yellow">增</span>}
                <span className="zx-grow" />
                <b className="zx-money">¥{core.fmtMoney(e.amount)}</b>
                <button className="zx-link" onClick={() => openEdit(e)}>改</button>
                <button className="zx-link" style={{ color: confirmDel === e.id ? '#F85149' : undefined }} onClick={() => onDelete(e.id)}>
                  {confirmDel === e.id ? '确认删?' : '删'}
                </button>
              </div>
              {(v || e.note || e.payMethod) && (
                <div className="zx-item-s">
                  {v ? <span>· {v.name}</span> : null}
                  {e.payMethod ? <span>· {e.payMethod}</span> : null}
                  {e.note ? <span>· {e.note}</span> : null}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {edit && (
        <div className="zx-modal-bg" onClick={() => setEdit(null)}>
          <div className="zx-modal" onClick={(e) => e.stopPropagation()}>
            <h4>修改支出</h4>
            <div className="zx-grid2">
              <div>
                <label className="zx-lbl">金额（元）</label>
                <input className="zx-inp" inputMode="decimal" value={eAmount} onChange={(e2) => setEAmount(e2.target.value)} />
              </div>
              <div>
                <label className="zx-lbl">科目</label>
                <select className="zx-sel" value={eCatId} onChange={(e2) => setECatId(e2.target.value)}>
                  {data.cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isExtra ? '（增）' : ''}</option>)}
                  {!catById.has(eCatId) && <option value={eCatId}>（科目已删）</option>}
                </select>
              </div>
            </div>
            <div className="zx-grid2">
              <div>
                <label className="zx-lbl">日期</label>
                <input className="zx-inp" type="date" value={eDate} onChange={(e2) => setEDate(e2.target.value)} />
              </div>
              <div>
                <label className="zx-lbl">供应商</label>
                <select className="zx-sel" value={eVendorId} onChange={(e2) => setEVendorId(e2.target.value)}>
                  <option value="">（不关联）</option>
                  {data.vens.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
            <label className="zx-lbl">支付方式</label>
            <input className="zx-inp" value={ePay} placeholder="微信/转账/现金" onChange={(e2) => setEPay(e2.target.value)} />
            <label className="zx-lbl">备注</label>
            <input className="zx-inp" value={eNote} onChange={(e2) => setENote(e2.target.value)} />
            <div className="zx-row" style={{ marginTop: 12, gap: 6 }}>
              <button className="zx-btn" disabled={busy} onClick={onSaveEdit}>保存</button>
              <button className="zx-btn ghost" onClick={() => setEdit(null)}>取消</button>
              <span className="zx-grow" />
              <button className="zx-btn danger" onClick={() => onDelete(edit.id)}>{confirmDel === edit.id ? '确认删?' : '删除'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
