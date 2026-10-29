/**
 * 明细 Tab：月/方向/分类/关键词筛选 + 交易表 + 行内改分类 + 导出 CSV/JSON。
 * 金额彩色显示（收入绿 / 支出红 / 中性灰 / 退款蓝）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import { downloadText, exportCsvOf, exportJsonOf, filterTxnsOf, saveOverride } from './model'
import type { TabProps } from './Panel'
import type { Txn } from '../shared/core'

type Props = TabProps & { months: string[] }

const DISPLAY_LIMIT = 200

function fmtYuan(fen: number): string {
  return core.fenToYuan(Math.round(Number(fen) || 0))
}

export default function DetailTab({ data, cache, reload, showToast, months }: Props) {
  const [month, setMonth] = useState('')
  const [dir, setDir] = useState('')
  const [cat, setCat] = useState('')
  const [kw, setKw] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const categories = useMemo(() => (data ? [...new Set(data.txns.map((t) => core.categorize(t, data.rules, data.overrides)))].sort() : []), [data])
  const hits = useMemo(() => {
    if (!data) return []
    return filterTxnsOf(data, { month: month || undefined, dir: dir || undefined, category: cat || undefined, keyword: kw || undefined })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, DISPLAY_LIMIT)
  }, [data, month, dir, cat, kw])

  if (!data) return <div className="dz-empty">加载中…</div>

  const catOf = (t: Txn) => core.categorize(t, data.rules, data.overrides)

  const saveCat = async (t: Txn) => {
    setEditing(null)
    const c = editVal.trim()
    if (!c || c === catOf(t)) return
    try {
      await saveOverride(cache, t.id, c)
      showToast(`已改分类：${c}`)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const doExport = (kind: 'csv' | 'json') => {
    try {
      if (kind === 'csv') downloadText(`duzhi-export-${Date.now()}.csv`, exportCsvOf(data))
      else downloadText(`duzhi-export-${Date.now()}.json`, exportJsonOf(data))
      showToast('已导出（浏览器下载）')
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  return (
    <div>
      <div className="dz-card" style={{ marginTop: 6 }}>
        <div className="dz-card-b">
          <div className="dz-row">
            <select className="dz-sel" style={{ width: 120 }} value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">全部月份</option>
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="dz-sel" style={{ width: 96 }} value={dir} onChange={(e) => setDir(e.target.value)}>
              <option value="">全部</option>
              <option value="out">支出</option>
              <option value="in">收入</option>
              <option value="neutral">中性</option>
            </select>
            <select className="dz-sel" style={{ width: 120 }} value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">全部分类</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="dz-row" style={{ marginTop: 8 }}>
            <input
              className="dz-inp dz-grow"
              placeholder="搜交易对方 / 商品 / 备注…"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
            />
            <button className="dz-btn ghost" onClick={() => doExport('csv')}>导出 CSV</button>
            <button className="dz-btn ghost" onClick={() => doExport('json')}>JSON</button>
          </div>
        </div>
      </div>

      {hits.length === 0 ? (
        <div className="dz-empty">{data.txns.length === 0 ? '还没有账单：先去「导入」Tab 拖入账单文件。' : '没有符合筛选条件的交易。'}</div>
      ) : (
        <>
          {data.txns.length > DISPLAY_LIMIT && <div className="dz-sec"><span className="dz-bar" />明细<span className="dz-hint">共 {hits.length}+ 笔，只显示最近 {DISPLAY_LIMIT} 笔（导出含全部）</span></div>}
          <div className="dz-card">
            <div className="dz-card-b" style={{ padding: '4px 10px' }}>
              {hits.map((t) => {
                const isRefund = core.isRefundRow(t)
                const color = isRefund ? '#79B8FF' : t.dir === 'in' ? '#3FB950' : t.dir === 'out' ? '#F85149' : '#8B95A7'
                const prefix = isRefund ? '' : t.dir === 'in' ? '+' : t.dir === 'out' ? '-' : '±'
                return (
                  <div key={t.id} style={{ padding: '7px 2px', borderBottom: '1px solid #1c2230' }}>
                    <div className="dz-row">
                      <span className="dz-sub" style={{ width: 108, flexShrink: 0 }}>{t.date.slice(5, 16)}</span>
                      <span className="dz-num" style={{ color, width: 86, textAlign: 'right', flexShrink: 0 }}>{prefix}{fmtYuan(t.amountFen)}</span>
                      <span className="dz-grow" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.name || '(未知商户)'}{t.item ? <span className="dz-sub"> · {t.item}</span> : null}
                      </span>
                      <span className="dz-tag gold">{catOf(t)}</span>
                    </div>
                    <div className="dz-row" style={{ marginTop: 2 }}>
                      <span className="dz-sub dz-grow">
                        {isRefund ? '退款 · ' : ''}{t.status ? `${t.status} · ` : ''}{t.method || ''}{t.refundFen > 0 && !isRefund ? ` · 已退 ${fmtYuan(t.refundFen)}` : ''}
                      </span>
                      <span className={`dz-tag ${t.src === 'wechat' ? 'green' : 'blue'}`}>{t.src === 'wechat' ? '微信' : '支付宝'}</span>
                      <button
                        className="dz-btn sm ghost"
                        onClick={() => { setEditing(editing === t.id ? null : t.id); setEditVal(catOf(t)) }}
                      >
                        改分类
                      </button>
                    </div>
                    {editing === t.id && (
                      <div className="dz-row" style={{ marginTop: 6 }}>
                        <input
                          className="dz-inp dz-grow"
                          value={editVal}
                          placeholder="新分类名，如 咖啡奶茶"
                          onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void saveCat(t) }}
                        />
                        <button className="dz-btn sm" onClick={() => void saveCat(t)}>保存</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
