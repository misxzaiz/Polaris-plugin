/**
 * 明细 Tab：按月浏览，按日分组小计，分类/类型筛选，删除，附件查看，导出 CSV（复制）
 */
import { useMemo, useState } from 'react'
import {
  deleteBill, toCsv, fmtMoney, billTime, fmtMonthTitle,
  getAttachment, isImageMime,
  type Bill, type PanelData, type Attachment,
} from './model'

type Toast = (msg: string, kind?: 'bad' | 'good') => void

export default function ListTab({ data, month, switchMonth, reload, showToast }: {
  data: PanelData | null
  month: string
  switchMonth: (delta: number) => void
  reload: (m?: string) => Promise<PanelData | null>
  showToast: Toast
}) {
  const [catFilter, setCatFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [viewing, setViewing] = useState<Attachment | null>(null)

  const sym = data?.settings.currencySymbol || '¥'
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const b of data?.bills || []) set.add(b.category)
    return [...set]
  }, [data?.bills])

  const shown = (data?.bills || [])
    .filter((b) => (!catFilter || b.category === catFilter) && (!typeFilter || b.type === typeFilter))
    .sort((a, b) => b.ts - a.ts)

  const groups = useMemo(() => {
    const map = new Map<string, Bill[]>()
    for (const b of shown) {
      const d = new Date(b.ts)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(b)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [shown])

  const net = shown.reduce((s, b) => s + (b.type === 'income' ? b.amount : -b.amount), 0)

  const del = async (b: Bill) => {
    if (!window.confirm(`删除「${b.category} ${fmtMoney(b.amount, sym)}」这笔账？${b.attachmentId ? '（含附件一并删除）' : ''}`)) return
    try {
      const ok = await deleteBill(b.id, month)
      if (ok) { await reload(month); showToast('已删除') }
      else showToast('未找到该账单', 'bad')
    } catch (e) {
      showToast(`删除失败：${(e as Error).message}`, 'bad')
    }
  }

  const viewAtt = async (b: Bill) => {
    if (!b.attachmentId) return
    try {
      const a = await getAttachment(b.attachmentId)
      if (!a) { showToast('附件不存在或已清理', 'bad'); return }
      setViewing(a)
    } catch (e) {
      showToast(`读取附件失败：${(e as Error).message}`, 'bad')
    }
  }

  const copyCsv = async () => {
    const csv = toCsv(shown, sym)
    try {
      await navigator.clipboard.writeText(csv)
      showToast(`已复制 ${shown.length} 笔 CSV 到剪贴板`, 'good')
    } catch {
      showToast('剪贴板不可用（HTTPS/权限受限）', 'bad')
    }
  }

  return (
    <div>
      <div className="pl-monthnav">
        <button className="pl-navbtn" onClick={() => switchMonth(-1)}>‹</button>
        <b>{fmtMonthTitle(month)}</b>
        <button className="pl-navbtn" onClick={() => switchMonth(1)}>›</button>
      </div>
      <div className="pl-row" style={{ padding: '0 18px 8px' }}>
        <select className="pl-sel" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">全部分类</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="pl-sel" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">支出+收入</option>
          <option value="expense">仅支出</option>
          <option value="income">仅收入</option>
        </select>
        <button className="pl-btn sm ghost" onClick={copyCsv}>导出 CSV</button>
      </div>

      {!groups.length && <div className="pl-empty">本月没有符合条件的账单。</div>}

      {groups.map(([day, bills]) => {
        const dayNet = bills.reduce((s, b) => s + (b.type === 'income' ? b.amount : -b.amount), 0)
        return (
          <div className="pl-card" key={day}>
            <div className="pl-card-b">
              <div className="pl-dayhead">
                <b>{day.slice(5).replace('-', '/')}</b>
                <span>{new Date(day + 'T12:00:00').toLocaleDateString('zh-CN', { weekday: 'short' })}</span>
                <span className="sum">净 {dayNet >= 0 ? '+' : ''}{fmtMoney(dayNet, sym)}</span>
              </div>
              {bills.slice().sort((a, b) => b.ts - a.ts).map((b) => (
                <div className="pl-bill" key={b.id}>
                  <div className="pl-bill-main">
                    <b>{b.category}{b.note ? ` · ${b.note}` : ''}</b>
                    <small>
                      {billTime(b.ts)}{b.source === 'ai' ? ' · AI 记' : ''}{b.source === 'panel' ? ' · 面板记' : ''}
                      {b.attachmentId && (
                        <button className="pl-attlink" onClick={() => viewAtt(b)}> · 📎 查看附件</button>
                      )}
                    </small>
                  </div>
                  <span className={`pl-bill-amt ${b.type === 'income' ? 'pl-amt-inc' : 'pl-amt-exp'}`}>
                    {b.type === 'income' ? '+' : '-'}{fmtMoney(b.amount, sym)}
                  </span>
                  <button className="pl-btn sm danger" onClick={() => del(b)}>删</button>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {!!shown.length && (
        <div className="pl-sub" style={{ textAlign: 'center', padding: '4px 0 12px' }}>
          共 {shown.length} 笔 · 净额 {net >= 0 ? '+' : ''}{fmtMoney(net, sym)}
        </div>
      )}

      {viewing && (
        <div className="pl-attmodal" onClick={() => setViewing(null)}>
          <div className="pl-attmodal-box" onClick={(e) => e.stopPropagation()}>
            <div className="pl-attmodal-head">
              <b>{viewing.name}</b>
              <button className="pl-btn sm ghost" onClick={() => setViewing(null)}>关闭</button>
            </div>
            <div className="pl-attmodal-body">
              {isImageMime(viewing.mime)
                ? <img src={`data:${viewing.mime};base64,${viewing.data}`} alt={viewing.name} />
                : <a className="pl-btn sm ghost" href={`data:${viewing.mime};base64,${viewing.data}`} download={viewing.name}>下载 {viewing.name}</a>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
