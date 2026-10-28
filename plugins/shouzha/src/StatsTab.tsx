/**
 * 透视 Tab：分类占比 / 年化排行 / 价格变动 / 已取消止损
 * 全部数据来自 core.stats（与 AI 同口径），本组件只做展示。
 */
import type { ReadOnlyTabProps } from './Panel'
import { fmtMoney, annualCost, STATUS_LABELS, type Subscription } from './model'

export default function StatsTab({ data }: ReadOnlyTabProps) {
  if (!data) return <div className="sz-empty">载入中…</div>
  const { stats, settings } = data
  const sym = settings.currencySymbol
  const maxCat = Math.max(...stats.byCategory.map((c) => c.monthly), 1)
  const maxFlow = Math.max(...stats.cashflow.map((c) => c.amount), 1)

  return (
    <>
      <div className="sz-sec"><i className="sz-bar" />总账</div>
      <div className="sz-card"><div className="sz-card-b">
        <div className="sz-kv"><small>生效中（{stats.counts.active} 笔）月均</small><b>{fmtMoney(stats.monthlyActive, sym)}</b></div>
        <div className="sz-kv"><small>生效中年化</small><b>{fmtMoney(stats.annualActive, sym)}</b></div>
        {stats.counts.trial > 0 && (
          <div className="sz-kv"><small>试用 {stats.counts.trial} 笔若转正，月均再加</small><b>+{fmtMoney(stats.monthlyTrial, sym)}</b></div>
        )}
        <div className="sz-kv"><small>暂停（{stats.counts.paused} 笔，不计入）</small><b>{stats.counts.paused}</b></div>
        <div className="sz-kv"><small>已取消（{stats.counts.cancelled} 笔）年化止损</small><b style={{ color: '#7EE2A0' }}>{fmtMoney(stats.savedAnnual, sym)}</b></div>
      </div></div>

      <div className="sz-sec"><i className="sz-bar" />分类占比<span className="sz-hint">生效中，按月均</span></div>
      <div className="sz-card"><div className="sz-card-b">
        {!stats.byCategory.length && <div className="sz-empty">还没有生效中的订阅</div>}
        {stats.byCategory.map((c) => (
          <div key={c.category} style={{ marginBottom: 8 }}>
            <div className="sz-kv"><small>{c.category}（{c.count} 笔）</small><b>{fmtMoney(c.monthly, sym)}/月</b></div>
            <div className="sz-pct"><i style={{ width: `${Math.max(2, Math.round((c.monthly / maxCat) * 100))}%` }} /></div>
          </div>
        ))}
      </div></div>

      <div className="sz-sec"><i className="sz-bar" />年化排行<span className="sz-hint">含试用转正预估</span></div>
      <div className="sz-card"><div className="sz-card-b" style={{ padding: '2px 13px' }}>
        {!stats.topAnnual.length && <div className="sz-empty">还没有订阅</div>}
        {stats.topAnnual.map((t, i) => (
          <div className="sz-item" key={t.id}>
            <div className="sz-item-main">
              <b>{i + 1}. {t.name}{t.status === 'trial' && <span className="sz-badge info">试用</span>}</b>
              <small>{t.vendor ? `${t.vendor} · ` : ''}{t.category} · {fmtMoney(t.amount, sym)}/{t.cycleLabel} · 下次 {t.nextRenewalDate}</small>
            </div>
            <div className="sz-item-amt">{fmtMoney(t.annual, sym)}<small>年化</small></div>
          </div>
        ))}
      </div></div>

      <div className="sz-sec"><i className="sz-bar" />涨价监控<span className="sz-hint">现价 ≠ 开通价</span></div>
      <div className="sz-card"><div className="sz-card-b">
        {!stats.priceChanges.length && <div className="sz-empty">暂无价格变动记录<br /><span className="sz-sub">每次对账（确认续费/改价）都会记入价格史，涨价自动浮出。</span></div>}
        {stats.priceChanges.map((p) => {
          const up = p.to > p.from
          return (
            <div className="sz-kv" key={p.id}>
              <small>{p.name}{p.vendor ? `（${p.vendor}）` : ''} · {p.date}</small>
              <b>{fmtMoney(p.from, sym)} → {fmtMoney(p.to, sym)} <span style={{ color: up ? '#FF8A9A' : '#7EE2A0' }}>{up ? '↑' : '↓'}{Math.abs(Math.round(((p.to - p.from) / p.from) * 100))}%</span></b>
            </div>
          )
        })}
      </div></div>

      <div className="sz-sec"><i className="sz-bar" />已取消（{stats.counts.cancelled}）</div>
      <div className="sz-card"><div className="sz-card-b" style={{ padding: '2px 13px' }}>
        {!stats.counts.cancelled && <div className="sz-empty">还没有取消过订阅</div>}
        {data.subs.filter((s: Subscription) => s.status === 'cancelled').map((s) => (
          <div className="sz-item" key={s.id}>
            <div className="sz-item-main">
              <b>{s.name}<span className="sz-badge off">{STATUS_LABELS[s.status]}</span></b>
              <small>{s.cancelReason ? `原因：${s.cancelReason} · ` : ''}{s.cancelledAt ? `${s.cancelledAt} 取消` : ''}</small>
            </div>
            <div className="sz-item-amt" style={{ color: '#7EE2A0' }}>年省 {fmtMoney(annualCost(s) || 0, sym)}</div>
          </div>
        ))}
      </div></div>

      <div className="sz-sec"><i className="sz-bar" />月度扣费分布</div>
      <div className="sz-card"><div className="sz-card-b">
        <div className="sz-bars">
          {stats.cashflow.map((c) => (
            <div className={`sz-barcol ${c.amount > stats.monthlyActive * 1.5 ? 'hot' : ''}`} key={c.month} title={c.items.map((i) => `${i.date} ${i.name} ${fmtMoney(i.amount, sym)}`).join('\n')}>
              <i style={{ height: `${Math.max(3, Math.round((c.amount / maxFlow) * 74))}px` }} />
              <small>{Number(c.month.slice(5))}</small>
            </div>
          ))}
        </div>
        <div className="sz-sub" style={{ marginTop: 6 }}>横轴为未来 12 个月的月份（1..12 显示月份数字），黄色 = 大额年费扎堆月。</div>
      </div></div>
    </>
  )
}
