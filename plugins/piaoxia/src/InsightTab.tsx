/**
 * InsightTab —— 透视：报销看板 / 月度节奏 / 分类构成 / 销方 TOP / 报销单 / 保修榜 / CSV 导出。
 * 纯展示：全部数字来自 shared/core.buildView 确定性派生，零业务口径。
 */
import { useState } from 'react'
import * as core from '../shared/core'
import type { PanelCtx } from './Panel'
import { exportAllJSON, downloadText } from './model'

export default function InsightTab({ ctx }: { ctx: PanelCtx }) {
  const view = ctx.view
  const [confirmExport, setConfirmExport] = useState(0)

  const maxMonth = Math.max(1, ...view.byMonth.map((m) => m.total))
  const maxCat = Math.max(1, ...view.byCategory.map((c) => c.total))

  const doExportCSV = () => {
    const list = Array.from(ctx.data.invoices.values()).sort((a, b) => String(b.date).localeCompare(String(a.date)))
    downloadText('piaoxia-' + core.todayKey() + '.csv', core.exportCSV(list))
    ctx.toast('已导出 CSV（Excel 可直接打开）')
  }

  const doExportJSON = () => {
    if (confirmExport !== 1) { setConfirmExport(1); setTimeout(() => setConfirmExport(0), 4000); return }
    void exportAllJSON(ctx.data)
    setConfirmExport(0)
    ctx.toast('已导出 JSON 备份（含全部票据与抬头）')
  }

  return (
    <div>
      {view.pending.stale.length > 0 && (
        <div className="px-warnbox">⚠ {view.pending.stale.length} 张待报销票开票已超 60 天，合计 ¥{view.pending.stale.reduce((s, x) => s + x.total, 0).toFixed(2)}。逐张处理去「票册」筛选「待报销」。</div>
      )}

      <div className="px-grid" style={{ marginBottom: 12 }}>
        <div className="px-stat money"><div className="n">¥{view.pending.total.toFixed(2)}</div><div className="l">待报销（{view.pending.count} 张）</div></div>
        <div className="px-stat"><div className="n">¥{view.inFlight.total.toFixed(2)}</div><div className="l">在途已提交（{view.inFlight.count} 张）</div></div>
        <div className="px-stat"><div className="n">¥{view.month.settled.total.toFixed(2)}</div><div className="l">{view.thisMonth} 已到账（{view.month.settled.count} 张）</div></div>
        <div className="px-stat"><div className="n">¥{view.month.opened.total.toFixed(2)}</div><div className="l">{view.thisMonth} 开票（{view.month.opened.count} 张）</div></div>
        <div className="px-stat"><div className="n">¥{view.year.total.toFixed(2)}</div><div className="l">{view.year.key} 年累计（{view.year.count} 张）</div></div>
      </div>

      <div className="px-card">
        <h3>近 12 个月开票节奏 <span className="px-hint">按开票日，不含「不报销」</span></h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 110 }}>
          {view.byMonth.map((m) => (
            <div key={m.key} style={{ flex: 1, textAlign: 'center' }} title={m.key + '：' + m.count + ' 张 / ¥' + m.total.toFixed(2)}>
              <div style={{ fontSize: 9, color: '#7d8590', marginBottom: 2 }}>{m.total ? Math.round(m.total) : ''}</div>
              <div className="px-bar" style={{ height: Math.max(3, (m.total / maxMonth) * 76) }}><i /></div>
              <div style={{ fontSize: 9, color: '#7d8590', marginTop: 3 }}>{m.key.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-card">
        <h3>分类构成</h3>
        <table className="px-table">
          <tbody>
            {view.byCategory.map((c) => (
              <tr key={c.key}>
                <td style={{ width: 90 }}>{c.label}</td>
                <td>
                  <div className="px-bar"><i style={{ width: Math.round((c.total / maxCat) * 100) + '%' }} /></div>
                </td>
                <td style={{ width: 110, textAlign: 'right' }}>¥{c.total.toFixed(2)}<span className="px-dim">（{c.count}张）</span></td>
              </tr>
            ))}
            {view.byCategory.length === 0 && <tr><td className="px-dim">还没有票</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="px-card">
        <h3>报销单 <span className="px-hint">提交时登记的 reimburseId 分组</span></h3>
        {view.reimburseGroups.length === 0 ? (
          <div className="px-dim">还没有登记过报销单号。提交报销时在票册详情里填单号，或对 AI 说「这批发上去了，单号 XX」。</div>
        ) : (
          <table className="px-table">
            <thead><tr><th>报销单号</th><th>票数</th><th>金额</th><th>构成</th><th>最近活动</th></tr></thead>
            <tbody>
              {view.reimburseGroups.map((g) => (
                <tr key={g.id}>
                  <td className="px-mono">{g.id}</td>
                  <td>{g.count}</td>
                  <td>¥{g.total.toFixed(2)}</td>
                  <td>{Object.keys(g.statuses).map((k) => <span key={k} className={'px-tag ' + k} style={{ marginRight: 4 }}>{core.STATUSES[k]}×{g.statuses[k]}</span>)}</td>
                  <td className="px-dim">{g.latest}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-card">
        <h3>保修到期榜 <span className="px-hint">90 天内到期或已过期</span></h3>
        {view.warrantyUpcoming.length === 0 ? (
          <div className="px-dim">没有 90 天内到期的保修。给票补保修期：票册详情 → 保修月数。</div>
        ) : (
          <table className="px-table">
            <thead><tr><th>票</th><th>销方</th><th>金额</th><th>保修至</th><th>状态</th></tr></thead>
            <tbody>
              {view.warrantyUpcoming.map((x) => (
                <tr key={x.inv.id}>
                  <td className="px-mono">{x.inv.number || '（无号码）'}</td>
                  <td>{x.inv.seller.name || '—'}</td>
                  <td>¥{x.inv.total.toFixed(2)}</td>
                  <td>{x.inv.warrantyUntil}</td>
                  <td>
                    {x.daysLeft < 0
                      ? <span className="px-err">已过期 {-x.daysLeft} 天</span>
                      : x.daysLeft <= 30
                        ? <span className="px-warn">还剩 {x.daysLeft} 天</span>
                        : <span className="px-dim">还剩 {x.daysLeft} 天</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-card">
        <h3>销方 TOP10 <span className="px-hint">全年累计（含不报销票）</span></h3>
        {view.sellers.length === 0 ? <div className="px-dim">还没有数据</div> : (
          <table className="px-table">
            <tbody>
              {view.sellers.map((s, i) => (
                <tr key={i}><td style={{ width: 24, color: '#7d8590' }}>{i + 1}</td><td>{s.name}</td><td style={{ textAlign: 'right' }}>¥{s.total.toFixed(2)}<span className="px-dim">（{s.count}张）</span></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-card">
        <h3>导出</h3>
        <div className="px-row">
          <button className="px-btn" onClick={doExportCSV}>导出 CSV（Excel）</button>
          <button className="px-btn" onClick={doExportJSON}>{confirmExport === 1 ? '再点一次确认导出全部数据' : '导出 JSON 备份'}</button>
          <span className="px-dim">CSV 给财务/个税汇算；JSON 备份可在「抬头与设置」导入恢复。</span>
        </div>
      </div>
    </div>
  )
}
