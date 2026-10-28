/**
 * 统计 Tab：池子总览（全部纯派生自 core，无持久状态）。
 * 成熟度漏斗 / 状态四格 / 近 8 周捕获趋势 / 高频标签 / 孵化效率。
 */
import { computePondStats, MATURITIES, KINDS, fmtDay, type Idea } from './model'

export default function StatsTab({ ideas }: { ideas: Idea[] }) {
  const now = Date.now()
  const s = computePondStats(ideas, now)
  const maxMat = Math.max(1, ...s.byMaturity)
  const maxWeek = Math.max(1, ...s.captures8w.map((w) => w.count))

  if (!ideas.length) {
    return <div className="lx-empty">还没有任何想法，统计无从谈起——先去捕一条。</div>
  }

  return (
    <>
      <div className="lx-sec"><span className="lx-bar" />池子速览</div>
      <div className="lx-card">
        <div className="lx-card-b">
          <div className="lx-statgrid">
            <div className="lx-statcell"><b>{s.active}</b><small>在池</small></div>
            <div className="lx-statcell"><b style={{ color: s.dueNow ? '#F0B47A' : undefined }}>{s.dueNow}</b><small>今日回访</small></div>
            <div className="lx-statcell"><b style={{ color: '#7EE2A0' }}>{s.done}</b><small>已落地</small></div>
            <div className="lx-statcell"><b style={{ color: '#6E7686' }}>{s.archived}</b><small>归档</small></div>
          </div>
          <div className="lx-sub" style={{ marginTop: 8 }}>
            捕获 {s.total} 条 · 孵化到轮廓以上占在池 {Math.round(s.matureShare * 100)}%
            {s.oldestActiveDays != null ? ` · 最老想法已 ${s.oldestActiveDays} 天` : ''}
          </div>
        </div>
      </div>

      <div className="lx-sec"><span className="lx-bar" />成熟度漏斗</div>
      <div className="lx-card">
        <div className="lx-card-b">
          {MATURITIES.map((m, i) => (
            <div className="lx-funnel-row" key={m.key}>
              <span className="nm">{m.label}</span>
              <span className="tr"><i style={{ width: `${(s.byMaturity[i] / maxMat) * 100}%` }} /></span>
              <span className="ct">{s.byMaturity[i]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="lx-sec"><span className="lx-bar" />近 8 周捕获</div>
      <div className="lx-card">
        <div className="lx-card-b">
          <div className="lx-weeks">
            {s.captures8w.map((w) => (
              <div className="lx-weekcol" key={w.weekStart}>
                <i style={{ height: `${Math.max(3, (w.count / maxWeek) * 52)}px` }} title={`${w.count} 条`} />
                <small>{fmtDay(w.weekStart).slice(5).replace('-', '/')}</small>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lx-sec"><span className="lx-bar" />在池类型与高频标签</div>
      <div className="lx-card">
        <div className="lx-card-b">
          <div className="lx-sub">
            {KINDS.map((k) => `${k.label} ${s.byKind[k.key] || 0}`).join(' · ')}
          </div>
          <div className="lx-row" style={{ marginTop: 8 }}>
            {s.topTags.length
              ? s.topTags.map((t) => <span key={t.tag} className="lx-chip">#{t.tag} ×{t.count}</span>)
              : <span className="lx-sub">还没打过标签——标签决定星系归属，捕的时候顺手带一个。</span>}
          </div>
        </div>
      </div>

      <div className="lx-sec"><span className="lx-bar" />这套机制怎么用</div>
      <div className="lx-card">
        <div className="lx-card-b lx-sub">
          想法入池 3 天后首次回访；深化/再等等间隔翻倍（最长 60 天），推进则回到 3 天活跃节奏，落地即收口。
          归档不是删除——沉寂的想法仍可检索、可恢复。<br />
          在对话里说「翻翻旧想法」触发回访，「来一场碰撞」随机抽想法头脑风暴，「星系报告」看哪些想法已成簇可合流。
        </div>
      </div>
    </>
  )
}
