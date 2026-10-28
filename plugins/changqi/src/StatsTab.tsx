/**
 * 统计 Tab：渠道分布 / 分类分布（月均口径条形）+ 最大三笔 + 试用期占用
 * 订阅是静态合同，无时间序列——不做趋势图，做「钱花在哪」的静态透视。
 */
import { fmtMoney, monthlyEquivalent, CYCLE_LABELS, type PanelData } from './model'

export default function StatsTab({ data }: { data: PanelData | null }) {
  if (!data) return <div className="cq-empty">载入中…</div>
  const ov = data.overview
  const sym = data.settings.currencySymbol

  const maxChannel = Math.max(1, ...ov.byChannel.map((c) => c.monthlySum))
  const maxCategory = Math.max(1, ...ov.byCategory.map((c) => c.monthlySum))

  if (!ov.rows.length) {
    return <div className="cq-empty">还没有进行中的订阅——先在「总览」入册。</div>
  }

  return (
    <>
      <div className="cq-sec"><span className="cq-bar" />总览<span className="cq-hint">月均口径</span></div>
      <div className="cq-card">
        <div className="cq-card-b" style={{ display: 'flex', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <small className="cq-sub">月均支出</small>
            <b style={{ fontSize: 21, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(ov.monthlyTotal, sym)}</b>
          </div>
          <div style={{ flex: 1 }}>
            <small className="cq-sub">年化支出</small>
            <b style={{ fontSize: 21, fontVariantNumeric: 'tabular-nums', color: '#8FB8F2' }}>{fmtMoney(ov.yearlyTotal, sym)}</b>
          </div>
        </div>
      </div>

      <div className="cq-sec"><span className="cq-bar" />按渠道<span className="cq-hint">月均 {ov.byChannel.length} 渠道</span></div>
      <div className="cq-card">
        <div className="cq-card-b">
          <div className="cq-bars">
            {ov.byChannel.map((c) => (
              <div className="cq-bar-row" key={c.channel}>
                <span className="nm">{c.label}</span>
                <span className="tr"><i style={{ width: `${Math.max(4, Math.round((c.monthlySum / maxChannel) * 100))}%` }} /></span>
                <span className="vl">{fmtMoney(c.monthlySum, sym)} ×{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="cq-sec"><span className="cq-bar" />按分类<span className="cq-hint">月均 {ov.byCategory.length} 类</span></div>
      <div className="cq-card">
        <div className="cq-card-b">
          <div className="cq-bars">
            {ov.byCategory.map((c) => (
              <div className="cq-bar-row" key={c.category}>
                <span className="nm">{c.category}</span>
                <span className="tr"><i className="mut" style={{ width: `${Math.max(4, Math.round((c.monthlySum / maxCategory) * 100))}%` }} /></span>
                <span className="vl">{fmtMoney(c.monthlySum, sym)} ×{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="cq-sec"><span className="cq-bar" />最大三笔<span className="cq-hint">月均</span></div>
      <div className="cq-card">
        <div className="cq-card-b">
          {ov.top.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0' }}>
              <b style={{ color: i === 0 ? '#FF8A9A' : '#E6EAF2', width: 18 }}>{i + 1}</b>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(t.monthlyEquiv, sym)}</b>
            </div>
          ))}
        </div>
      </div>

      {ov.rows.some((r) => r.sub.status === 'trial') && (
        <>
          <div className="cq-sec"><span className="cq-bar" />试用期占用<span className="cq-hint">转正后计入月均</span></div>
          <div className="cq-card">
            <div className="cq-card-b">
              {ov.rows.filter((r) => r.sub.status === 'trial').map((r) => (
                <div key={r.sub.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.sub.name}
                    <small className="cq-sub"> · 试用至 {r.sub.trialEndsAt}（{CYCLE_LABELS[r.sub.cycle]} {fmtMoney(r.sub.amount, sym)}）</small>
                  </span>
                  <b style={{ fontVariantNumeric: 'tabular-nums', color: '#C9A8FF' }}>{fmtMoney(monthlyEquivalent(r.sub), sym)}/月</b>
                </div>
              ))}
              <small className="cq-sub" style={{ display: 'block', marginTop: 6 }}>
                上方月均总额已含试用期金额；转正后如取消，请及时在总览处理。
              </small>
            </div>
          </div>
        </>
      )}
    </>
  )
}
