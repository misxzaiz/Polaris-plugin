/**
 * 统计 Tab：总览 5 格 + 7 天到期预报 + 30 天复习活动 + 分牌组进度。
 * 全部数据来自 srs-core.computeStats（从 card.history 派生，无独立计数器）。
 */
import { type Snapshot } from './model'

export default function StatsTab({ snap }: { snap: Snapshot | null }) {
  if (!snap) return <div className="mf-empty">载入中…</div>
  const s = snap.stats

  const activityMax = Math.max(1, ...s.activity30.map((a) => a.count))
  const forecastMax = Math.max(1, ...s.forecast.map((f) => f.count))

  return (
    <div>
      <div className="mf-sec"><i className="mf-bar" />总览</div>
      <div className="mf-grid">
        <div className="mf-stat"><b>{s.total}</b><small>卡片</small></div>
        <div className="mf-stat"><b className="hot">{s.dueNow}</b><small>现在到期</small></div>
        <div className="mf-stat"><b>{s.today.reviews}</b><small>今日复习</small></div>
        <div className="mf-stat"><b className="hot">🔥{s.streak}</b><small>连击天数</small></div>
        <div className="mf-stat"><b>{s.retention30 != null ? `${s.retention30}%` : '—'}</b><small>30天留存</small></div>
      </div>

      <div className="mf-sec"><i className="mf-bar" />7 天到期预报<span className="mf-hint">共 {s.forecast.reduce((a, b) => a + b.count, 0)} 张</span></div>
      <div className="mf-card">
        <div className="mf-card-b">
          <div className="mf-bars">
            {s.forecast.map((f) => (
              <div key={f.date} className={`mf-barcol ${f.count ? '' : 'ghost'}`}>
                <em>{f.count || ''}</em>
                <i style={{ height: `${Math.max(3, (f.count / forecastMax) * 100)}%` }} />
                <small>{f.date}</small>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mf-sec"><i className="mf-bar" />30 天复习活动<span className="mf-hint">日均 {(s.activity30.reduce((a, b) => a + b.count, 0) / 30).toFixed(1)} 次</span></div>
      <div className="mf-card">
        <div className="mf-card-b">
          <div className="mf-bars">
            {s.activity30.map((a) => (
              <div key={a.date} className={`mf-barcol ${a.count ? '' : 'ghost'}`} title={`${a.date}：${a.count} 次`}>
                <i style={{ height: `${Math.max(2, (a.count / activityMax) * 100)}%` }} />
                {a.date.endsWith('-01') && <small>{a.date.slice(5)}</small>}
              </div>
            ))}
          </div>
          <div className="mf-sub" style={{ marginTop: 6 }}>今日 {s.today.reviews} 次（答对 {s.today.correct}）· 新学 {s.today.newCards} 张 · 最佳连击 {s.bestStreak} 天</div>
        </div>
      </div>

      <div className="mf-sec"><i className="mf-bar" />牌组</div>
      <div className="mf-card">
        <div className="mf-card-b">
          {s.byDeck.filter((d) => d.total > 0).length === 0 && <div className="mf-empty">还没有牌组</div>}
          {s.byDeck.filter((d) => d.total > 0).map((d) => {
            const done = d.total - d.due - d.fresh
            const pct = d.total ? Math.round((done / d.total) * 100) : 0
            return (
              <div className="mf-deckline" key={d.id}>
                <span className="nm">{d.name}</span>
                <span className="ct">到期 {d.due} · 新 {d.fresh}</span>
                <span className="mf-prog"><i style={{ width: `${pct}%` }} /></span>
                <span className="ct">{d.total} 张</span>
              </div>
            )
          })}
          <div className="mf-sub" style={{ marginTop: 8 }}>
            状态分布：新 {s.byStatus.new} · 学习中 {s.byStatus.learning} · 复习中 {s.byStatus.review}
            {s.byStatus.suspended ? ` · 已暂停 ${s.byStatus.suspended}` : ''}
            {` · 间隔 ≥21 天的成熟卡 ${s.byDeck.reduce((a, b) => a + b.mature, 0)} 张`}
          </div>
        </div>
      </div>

      <div className="mf-sec"><i className="mf-bar" />节奏说明</div>
      <div className="mf-card">
        <div className="mf-card-b mf-sub">
          每日限额在「设置」里调（当前：新卡 {snap.settings.dailyNewLimit}/天，复习 {snap.settings.dailyReviewLimit}/天）。
          <br />「重来」的卡 10 分钟后回队；评分越稳，间隔按 ease 越拉越长——
          {s.today.reviews === 0 ? '今天还没开始，去「复习」页过一遍吧。' : `今天已复习 ${s.today.reviews} 次，按节奏继续就好。`}
          {nextDueHint(s)}
        </div>
      </div>
    </div>
  )
}

function nextDueHint(s: Snapshot['stats']): string {
  if (s.dueNow > 0) return `现在就有 ${s.dueNow} 张到期。`
  const next = s.forecast.find((f) => f.count > 0)
  return next ? `下一波到期在 ${next.date}（${next.count} 张）。` : ''
}
