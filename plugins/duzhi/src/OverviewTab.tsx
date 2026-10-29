/**
 * 总览 Tab：月选择 + 四统计卡 + 分类占比 + 商户 top + 月度趋势。
 * 全部经 core.aggregate 现算（与 MCP 同源）；口径注释常驻。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import { aggregateOf } from './model'
import type { TabProps } from './Panel'

type Props = TabProps & { months: string[] }

function fmtYuan(fen: number): string {
  const s = core.fenToYuan(Math.round(Number(fen) || 0))
  const [i, d] = s.replace('-', '').split('.')
  const neg = (Number(fen) || 0) < 0 ? '-' : ''
  return `${neg}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${d}`
}

export default function OverviewTab({ data, months }: Props) {
  const [month, setMonth] = useState<string>('')
  const agg = useMemo(() => (data ? aggregateOf(data, month) : null), [data, month])
  if (!data || !agg) return <div className="dz-empty">加载中…</div>

  const maxOut = Math.max(1, ...agg.categories.map((c) => c.outFen))
  const monthOut = Math.max(1, ...agg.months.map((m) => m.outFen))

  return (
    <div>
      <div className="dz-sec">
        <span className="dz-bar" />统计范围
        <select className="dz-sel" style={{ width: 'auto', marginLeft: 'auto' }} value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">全部月份</option>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="dz-grid" style={{ margin: '0 16px 10px' }}>
        <div className="dz-stat"><small>收入</small><b className="dz-num" style={{ color: '#3FB950' }}>{fmtYuan(agg.totals.inFen)}</b></div>
        <div className="dz-stat"><small>支出</small><b className="dz-num" style={{ color: '#F85149' }}>{fmtYuan(agg.totals.outFen)}</b></div>
        <div className="dz-stat"><small>退款（不计收支）</small><b className="dz-num" style={{ color: '#79B8FF' }}>{fmtYuan(agg.totals.refundFen)}</b></div>
        <div className="dz-stat"><small>净流 = 收 − 支 + 退</small><b className="dz-num" style={{ color: agg.totals.netFen >= 0 ? '#3FB950' : '#F85149' }}>{fmtYuan(agg.totals.netFen)}</b></div>
      </div>

      <div className="dz-sec"><span className="dz-bar" />支出分类<span className="dz-hint">关键词规则口径 · 仅支出</span></div>
      {agg.categories.length === 0 ? (
        <div className="dz-empty">该范围没有支出记录。</div>
      ) : (
        <div className="dz-card">
          <div className="dz-card-b">
            {agg.categories.slice(0, 8).map((c) => (
              <div key={c.cat} style={{ marginBottom: 8 }}>
                <div className="dz-row">
                  <span className="dz-grow" style={{ fontSize: 12 }}>{c.cat}</span>
                  <span className="dz-num" style={{ fontSize: 12 }}>{fmtYuan(c.outFen)}</span>
                  <span className="dz-sub">{agg.totals.outFen ? Math.round((c.outFen / agg.totals.outFen) * 100) : 0}%</span>
                </div>
                <div className="dz-hbar"><i style={{ width: `${Math.round((c.outFen / maxOut) * 100)}%` }} /></div>
              </div>
            ))}
            {agg.categories.length > 8 && <div className="dz-sub">其余 {agg.categories.length - 8} 个分类见「明细」Tab 筛选。</div>}
          </div>
        </div>
      )}

      <div className="dz-sec"><span className="dz-bar" />商户 top<span className="dz-hint">按支出</span></div>
      {agg.merchants.length === 0 ? (
        <div className="dz-empty">该范围没有商户支出。</div>
      ) : (
        <div className="dz-card">
          <div className="dz-card-b">
            {agg.merchants.map((m) => (
              <div className="dz-row" key={m.name} style={{ padding: '3px 0' }}>
                <span className="dz-grow" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                <span className="dz-sub">{m.count} 笔</span>
                <span className="dz-num" style={{ fontSize: 12, width: 84, textAlign: 'right' }}>{fmtYuan(m.outFen)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {agg.months.length > 1 && (
        <>
          <div className="dz-sec"><span className="dz-bar" />月度趋势</div>
          <div className="dz-card">
            <div className="dz-card-b">
              {[...agg.months].reverse().map((m) => (
                <div key={m.ym} style={{ marginBottom: 8 }}>
                  <div className="dz-row">
                    <span style={{ fontSize: 12, width: 74 }}>{m.ym}</span>
                    <span className="dz-sub dz-grow">支 {fmtYuan(m.outFen)} · 收 {fmtYuan(m.inFen)}{m.refundFen ? ` · 退 ${fmtYuan(m.refundFen)}` : ''}</span>
                    <span className="dz-num" style={{ fontSize: 12, color: m.netFen >= 0 ? '#3FB950' : '#F85149' }}>{fmtYuan(m.netFen)}</span>
                  </div>
                  <div className="dz-hbar"><i style={{ width: `${Math.round((m.outFen / monthOut) * 100)}%`, background: 'linear-gradient(90deg,#8A2E2E,#C25454)' }} /></div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {agg.neutralCount > 0 && (
        <div className="dz-card">
          <div className="dz-card-b dz-sub">
            口径说明：另有 {agg.neutralCount} 笔中性交易（零钱充值、理财互转、交易关闭等钱未真正流动的记录）未计入收支；退款单列，净流 = 收入 − 支出 + 退款。
          </div>
        </div>
      )}
    </div>
  )
}
