/**
 * 统计 Tab：月度总览卡 + 总预算进度 + 分类排行（含分类预算）+ 逐日柱状图
 * 全部数字来自 shared/ledger-core.computeStats（与 AI 查账同一口径）。
 */
import { fmtMoney, fmtMonthTitle, type PanelData } from './model'

export default function StatsTab({ data, month, switchMonth }: {
  data: PanelData | null
  month: string
  switchMonth: (delta: number) => void
}) {
  if (!data) return <div className="pl-empty">载入中…</div>
  const s = data.stats
  const sym = s.currencySymbol
  const maxDay = Math.max(...s.byDay.map((d) => d.expense), 1)
  const peakDay = s.byDay.slice().sort((a, b) => b.expense - a.expense)[0]

  return (
    <div>
      <div className="pl-monthnav">
        <button className="pl-navbtn" onClick={() => switchMonth(-1)}>‹</button>
        <b>{fmtMonthTitle(month)}</b>
        <button className="pl-navbtn" onClick={() => switchMonth(1)}>›</button>
      </div>

      <div className="pl-card">
        <div className="pl-card-b" style={{ display: 'flex', textAlign: 'center' }}>
          <div style={{ flex: 1 }}>
            <div className="pl-sub">支出</div>
            <b className="pl-amt-exp" style={{ fontSize: 16 }}>{fmtMoney(s.expense, sym)}</b>
          </div>
          <div style={{ flex: 1, borderLeft: '1px solid #1d2330' }}>
            <div className="pl-sub">收入</div>
            <b className="pl-amt-inc" style={{ fontSize: 16 }}>{fmtMoney(s.income, sym)}</b>
          </div>
          <div style={{ flex: 1, borderLeft: '1px solid #1d2330' }}>
            <div className="pl-sub">结余</div>
            <b style={{ fontSize: 16 }} className={s.balance < 0 ? 'pl-amt-exp' : 'pl-amt-inc'}>{fmtMoney(s.balance, sym)}</b>
          </div>
          <div style={{ flex: 0.8, borderLeft: '1px solid #1d2330' }}>
            <div className="pl-sub">笔数</div>
            <b style={{ fontSize: 16 }}>{s.count}</b>
          </div>
        </div>
        {!!s.excludedSum && (
          <div className="pl-sub" style={{ textAlign: 'center', padding: '6px 0 2px', borderTop: '1px solid #1d2330' }}>
            另有 {fmtMoney(s.excludedSum, sym)} 不参与汇总（已排除分类，如工资），未计入上方结余
          </div>
        )}
      </div>

      {s.totalBudget != null && s.totalBudget > 0 && (
        <div className="pl-card">
          <div className="pl-card-b">
            <div className="pl-row">
              <b style={{ fontSize: 12.5 }}>月度总预算</b>
              <span className="pl-hint">
                {fmtMoney(s.expense, sym)} / {fmtMoney(s.totalBudget, sym)} · {Math.round((s.totalBudgetUsed || 0) * 100)}%
              </span>
            </div>
            <div className="pl-budget">
              <i className={(s.totalBudgetUsed || 0) > 1 ? 'over' : (s.totalBudgetUsed || 0) > 0.9 ? 'warn' : ''} style={{ width: `${Math.min(100, (s.totalBudgetUsed || 0) * 100)}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="pl-sec"><i className="pl-bar" />分类排行<span className="pl-hint">按支出金额</span></div>
      <div className="pl-card">
        <div className="pl-card-b">
          {s.byCategory.filter((c) => c.type === 'expense').length === 0 && <div className="pl-empty" style={{ padding: '10px 0' }}>本月还没有支出。</div>}
          {s.byCategory.filter((c) => c.type === 'expense').map((c) => {
            const used = c.budget != null && c.budget > 0 ? c.sum / c.budget : null
            return (
              <div key={c.category} style={{ padding: '7px 0', borderTop: '1px solid #1d2330' }}>
                <div className="pl-row">
                  <b style={{ fontSize: 12.5, flex: 1 }}>{c.category} {c.excluded && <span className="pl-sub">⊘ 不参与汇总</span>} <span className="pl-sub">×{c.count}</span></b>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtMoney(c.sum, sym)}</span>
                  {c.budget != null && <span className="pl-sub">{Math.round((used || 0) * 100)}% 预算</span>}
                </div>
                {used != null && (
                  <div className="pl-budget">
                    <i className={used > 1 ? 'over' : used > 0.9 ? 'warn' : ''} style={{ width: `${Math.min(100, used * 100)}%` }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="pl-sec"><i className="pl-bar" />每日支出<span className="pl-hint">{peakDay && peakDay.expense > 0 ? `峰值 ${peakDay.date.slice(5)} ${fmtMoney(peakDay.expense, sym)}` : ''}</span></div>
      <div className="pl-card">
        <div className="pl-card-b">
          <div className="pl-bars">
            {s.byDay.map((d) => (
              <div className="pl-barcol" key={d.date} title={`${d.date}：${fmtMoney(d.expense, sym)}`}>
                <i style={{ height: `${Math.max(2, (d.expense / maxDay) * 100)}%`, opacity: d.expense > 0 ? 1 : 0.25 }} />
              </div>
            ))}
          </div>
          <div className="pl-row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
            <small className="pl-sub">1</small>
            <small className="pl-sub">{s.byDay.length}</small>
          </div>
        </div>
      </div>
    </div>
  )
}
