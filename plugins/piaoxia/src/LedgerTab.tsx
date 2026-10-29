/**
 * LedgerTab —— 票册：过滤列表 + 详情（状态流转/补保修/改类别/两击删除）。
 * 全部口径走 shared/core；状态按钮按 TRANSITIONS 动态渲染。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import type { PanelCtx } from './Panel'
import { patchInvoice, transitionInvoice, deleteInvoice, addManualInvoice } from './model'

export default function LedgerTab({ ctx }: { ctx: PanelCtx }) {
  const [statusF, setStatusF] = useState('')
  const [catF, setCatF] = useState('')
  const [monthF, setMonthF] = useState('')
  const [kw, setKw] = useState('')
  const [openId, setOpenId] = useState('')
  const [manualOpen, setManualOpen] = useState(false)

  const list = useMemo(() => {
    const kwN = core.normName(kw)
    return Array.from(ctx.data.invoices.values())
      .filter((inv) => {
        if (statusF && inv.status !== statusF) return false
        if (catF && inv.category !== catF) return false
        if (monthF && (!inv.date || inv.date.slice(0, 7) !== monthF)) return false
        if (kwN) {
          const hay = core.normName([inv.number, inv.seller.name, inv.buyer.name, inv.note, inv.fileName, inv.reimburseId].concat(inv.items.map((x) => x.name)).join('|'))
          if (hay.indexOf(kwN) === -1) return false
        }
        return true
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)))
  }, [ctx.data.invoices, statusF, catF, monthF, kw])

  return (
    <div>
      <div className="px-card">
        <div className="px-row">
          <select className="px-select" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            <option value="">全部状态</option>
            {Object.keys(core.STATUSES).map((k) => <option key={k} value={k}>{core.STATUSES[k]}</option>)}
          </select>
          <select className="px-select" value={catF} onChange={(e) => setCatF(e.target.value)}>
            <option value="">全部分类</option>
            {Object.keys(core.CATEGORIES).map((k) => <option key={k} value={k}>{core.CATEGORIES[k]}</option>)}
          </select>
          <input className="px-input" type="month" value={monthF} onChange={(e) => setMonthF(e.target.value)} />
          <input className="px-input" style={{ flex: 1, minWidth: 140 }} placeholder="搜号码/销方/品名/备注" value={kw} onChange={(e) => setKw(e.target.value)} />
          <button className="px-btn primary" onClick={() => setManualOpen(!manualOpen)}>＋手动录入</button>
        </div>
      </div>

      {manualOpen && <ManualForm ctx={ctx} onDone={() => { setManualOpen(false); void ctx.reload() }} />}

      {ctx.view.pending.stale.length > 0 && !statusF && !catF && !monthF && !kw && (
        <div className="px-warnbox">
          ⚠ {ctx.view.pending.stale.length} 张待报销票开票已超 60 天（最早 {ctx.view.pending.stale[0].date}），小心报销过期。
        </div>
      )}

      <div className="px-card">
        {list.length === 0 ? (
          <div className="px-dim" style={{ textAlign: 'center', padding: '26px 0' }}>
            {ctx.data.invoices.size === 0 ? '发票保险库还是空的：去「收票台」拖入发票，或点右上「＋手动录入」' : '没有匹配过滤条件的票'}
          </div>
        ) : (
          <table className="px-table">
            <thead>
              <tr><th>号码</th><th>日期</th><th>销方</th><th>金额</th><th>分类</th><th>状态</th><th /></tr>
            </thead>
            <tbody>
              {list.map((inv) => (
                <InvoiceRow key={inv.id} ctx={ctx} inv={inv} open={openId === inv.id}
                  onToggle={() => setOpenId(openId === inv.id ? '' : inv.id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function InvoiceRow({ ctx, inv, open, onToggle }: { ctx: PanelCtx, inv: core.Invoice, open: boolean, onToggle: () => void }) {
  return (
    <>
      <tr className="click" onClick={onToggle}>
        <td className="px-mono">{inv.number || <span className="px-dim">（无号码）</span>}</td>
        <td>{inv.date || <span className="px-dim">?</span>}</td>
        <td>{inv.seller.name || <span className="px-dim">未识别</span>}</td>
        <td>¥{inv.total.toFixed(2)}</td>
        <td>{core.CATEGORIES[inv.category]}</td>
        <td><span className={'px-tag ' + inv.status}>{core.STATUSES[inv.status]}</span></td>
        <td className="px-dim">{open ? '收起 ▲' : '详情 ▼'}</td>
      </tr>
      {open && <tr><td colSpan={7} style={{ padding: 0 }}><InvoiceDetail ctx={ctx} inv={inv} /></td></tr>}
    </>
  )
}

function InvoiceDetail({ ctx, inv }: { ctx: PanelCtx, inv: core.Invoice }) {
  const [reimburseId, setReimburseId] = useState(inv.reimburseId)
  const [rejectNote, setRejectNote] = useState('')
  const [warranty, setWarranty] = useState(inv.warrantyMonths === null ? '' : String(inv.warrantyMonths))
  const [note, setNote] = useState(inv.note)
  const [confirmDel, setConfirmDel] = useState(0)
  const [busy, setBusy] = useState(false)

  const allowed = (to: string) => inv.status === to || (core.TRANSITIONS[inv.status] || []).indexOf(to) !== -1

  const doTransition = async (to: string) => {
    setBusy(true)
    try {
      await transitionInvoice(inv, to, { reimburseId: to === 'submitted' ? reimburseId : undefined, rejectNote: to === 'rejected' ? rejectNote : undefined })
      ctx.toast(`已流转为「${core.STATUSES[to]}」`)
      await ctx.reload()
    } catch (e) {
      ctx.toast(String((e as Error).message), true)
    } finally {
      setBusy(false)
    }
  }

  const doPatch = async (patch: Partial<core.Invoice>) => {
    setBusy(true)
    try {
      await patchInvoice(inv, patch)
      ctx.toast('已更新')
      await ctx.reload()
    } catch (e) {
      ctx.toast(String((e as Error).message), true)
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    if (confirmDel !== 1) { setConfirmDel(1); setTimeout(() => setConfirmDel(0), 4000); return }
    setBusy(true)
    try {
      await deleteInvoice(inv.id)
      ctx.toast('已删除' + (inv.archivedPath ? '（归档原件仍在 ' + inv.archivedPath + '）' : ''))
      await ctx.reload()
    } catch (e) {
      ctx.toast(String((e as Error).message), true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-detail">
      <div className="px-kv">
        <span className="k">种类/标题</span><span>{core.KINDS[inv.kind]}{inv.title ? ' · ' + inv.title : ''}</span>
        <span className="k">号码/代码</span><span className="px-mono">{inv.number || '—'}{inv.code ? ' / ' + inv.code : ''}</span>
        <span className="k">销方</span><span>{inv.seller.name || '—'}{inv.seller.taxId ? <span className="px-dim px-mono">（{inv.seller.taxId}）</span> : ''}</span>
        <span className="k">购方</span><span>{inv.buyer.name || '—'}</span>
        <span className="k">金额构成</span>
        <span>¥{inv.total.toFixed(2)}{inv.amount !== null ? <span className="px-dim">（不含税 {inv.amount.toFixed(2)} + 税 {inv.tax !== null ? inv.tax.toFixed(2) : '?'}）</span> : ''}</span>
        {inv.items.length > 0 && <><span className="k">品名</span><span>{inv.items.map((x) => x.name).join('；')}</span></>}
        <span className="k">报销单</span><span className="px-mono">{inv.reimburseId || '—'}{inv.submittedAt ? <span className="px-dim">（提交 {inv.submittedAt}{inv.settledAt ? '，到账 ' + inv.settledAt : ''}）</span> : ''}</span>
        <span className="k">保修</span><span>{inv.warrantyMonths !== null ? `开票起 ${inv.warrantyMonths} 个月 → ${inv.warrantyUntil || '（缺开票日期无法推算）'}` : '未登记'}</span>
        <span className="k">来源</span>
        <span className="px-dim px-mono" style={{ wordBreak: 'break-all' }}>
          {inv.source === 'manual' ? '手动录入' : inv.srcPath || inv.fileName || '收票'}{inv.archivedPath ? <span> · 归档 {inv.archivedPath}</span> : ''}
        </span>
        {inv.note && <><span className="k">备注</span><span>{inv.note}</span></>}
      </div>

      <div className="px-row" style={{ marginTop: 10 }}>
        {(['submitted', 'settled', 'rejected', 'pending', 'excluded'] as const).map((to) => (
          allowed(to) && to !== inv.status ? (
            <button key={to} className="px-btn sm" disabled={busy} onClick={() => void doTransition(to)}>
              {to === 'submitted' ? '已提交' : to === 'settled' ? '已到账' : to === 'rejected' ? '已退回' : to === 'pending' ? '放回待报销' : '不报销'}
            </button>
          ) : null
        ))}
      </div>
      {(allowed('submitted') || allowed('rejected')) && (
        <div className="px-row" style={{ marginTop: 6 }}>
          <input className="px-input" placeholder="报销单号（提交时可登记）" value={reimburseId} onChange={(e) => setReimburseId(e.target.value)} style={{ width: 180 }} />
          <input className="px-input" placeholder="退回原因（退回时可登记）" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} style={{ width: 220 }} />
        </div>
      )}

      <div className="px-row" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #242c3a' }}>
        <select className="px-select" value={inv.category} disabled={busy}
          onChange={(e) => void doPatch({ category: e.target.value })}>
          {Object.keys(core.CATEGORIES).map((k) => <option key={k} value={k}>{core.CATEGORIES[k]}</option>)}
        </select>
        <select className="px-select" value={inv.purpose} disabled={busy}
          onChange={(e) => void doPatch({ purpose: e.target.value })}>
          {Object.keys(core.PURPOSES).map((k) => <option key={k} value={k}>{core.PURPOSES[k]}</option>)}
        </select>
        <input className="px-input" type="number" min={0} max={120} placeholder="保修月数" style={{ width: 96 }}
          value={warranty} onChange={(e) => setWarranty(e.target.value)} />
        <button className="px-btn sm" disabled={busy} onClick={() => void doPatch({ warrantyMonths: warranty === '' ? null : Number(warranty) })}>
          存保修
        </button>
        <input className="px-input" placeholder="备注" style={{ flex: 1, minWidth: 120 }} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="px-btn sm" disabled={busy} onClick={() => void doPatch({ note })}>存备注</button>
        <button className="px-btn sm danger" disabled={busy} onClick={() => void doDelete()}>
          {confirmDel === 1 ? '再点一次确认删除' : '删除'}
        </button>
      </div>
    </div>
  )
}

function ManualForm({ ctx, onDone }: { ctx: PanelCtx, onDone: () => void }) {
  const [f, setF] = useState({ number: '', date: core.todayKey(), sellerName: '', itemName: '', total: '', category: '', purpose: 'expense', warrantyMonths: '', note: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!Number(f.total)) { ctx.toast('金额（价税合计）必填', true); return }
    setBusy(true)
    try {
      await addManualInvoice({
        total: Number(f.total),
        number: f.number || undefined,
        date: f.date || undefined,
        seller: { name: f.sellerName, taxId: '' },
        items: f.itemName ? [{ name: f.itemName }] : [],
        category: f.category || undefined,
        purpose: f.purpose as core.Invoice['purpose'],
        warrantyMonths: f.warrantyMonths === '' ? undefined : Number(f.warrantyMonths),
        note: f.note,
      })
      ctx.toast('已入账')
      onDone()
    } catch (e) {
      ctx.toast(String((e as Error).message), true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-card">
      <h3>手动录入 <span className="px-hint">纸质票/扫描件走这里（发票保险库不做 OCR）</span></h3>
      <div className="px-row">
        <input className="px-input" placeholder="发票号码（纸质票可空）" value={f.number} onChange={(e) => set('number', e.target.value)} style={{ width: 200 }} />
        <input className="px-input" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
        <input className="px-input" placeholder="销方名称" value={f.sellerName} onChange={(e) => set('sellerName', e.target.value)} style={{ width: 180 }} />
        <input className="px-input" placeholder="品名" value={f.itemName} onChange={(e) => set('itemName', e.target.value)} style={{ width: 150 }} />
        <input className="px-input" placeholder="价税合计*" value={f.total} onChange={(e) => set('total', e.target.value)} style={{ width: 100 }} />
        <select className="px-select" value={f.category} onChange={(e) => set('category', e.target.value)}>
          <option value="">自动分类</option>
          {Object.keys(core.CATEGORIES).map((k) => <option key={k} value={k}>{core.CATEGORIES[k]}</option>)}
        </select>
        <select className="px-select" value={f.purpose} onChange={(e) => set('purpose', e.target.value)}>
          {Object.keys(core.PURPOSES).map((k) => <option key={k} value={k}>{core.PURPOSES[k]}</option>)}
        </select>
        <input className="px-input" type="number" min={0} placeholder="保修月数" value={f.warrantyMonths} onChange={(e) => set('warrantyMonths', e.target.value)} style={{ width: 96 }} />
        <input className="px-input" placeholder="备注" value={f.note} onChange={(e) => set('note', e.target.value)} style={{ width: 120 }} />
        <button className="px-btn primary" disabled={busy} onClick={() => void submit()}>入账</button>
      </div>
    </div>
  )
}
