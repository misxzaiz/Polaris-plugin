/**
 * 年报 Tab：年份选择 + KPI + 月度 12 柱 + 分体裁条形 + 评分档 + 年度十佳 + 心头好 + 年度最长短评
 * 全部纯派生自账本（computeYearReport），无任何预生成状态。
 */
import { useMemo, useState } from 'react'
import { computeYearReport, KIND_LABELS, RATING_BANDS, todayStr, type PanelData, type Work } from './model'
import { KIND_THEME } from './kindTheme'

export default function YearReportTab({ data }: { data: PanelData | null }) {
  const currentYear = todayStr().slice(0, 4)
  const [year, setYear] = useState(currentYear)

  const years = useMemo(() => {
    if (!data) return [currentYear]
    const set = new Set<string>([currentYear])
    for (const w of data.works) {
      if (w.finishDate && w.finishDate.length >= 4) set.add(w.finishDate.slice(0, 4))
    }
    return [...set].sort().reverse()
  }, [data, currentYear])

  if (!data) return <div className="gz-empty">载入中…</div>
  const yr = computeYearReport(data.works, year)
  const maxMonth = Math.max(1, ...yr.monthly.map((m) => m.count))
  const maxKind = Math.max(1, ...yr.perKind.map((k) => k.count))

  if (yr.doneCount === 0 && yr.favorites.length === 0) {
    return (
      <>
        <YearChips years={years} year={year} onPick={setYear} />
        <div className="gz-empty">{`${year} 年还没有完成记录。\n记下你看完/读完/玩完的每一部，年底这里就是你的年度报告。`}</div>
      </>
    )
  }

  return (
    <>
      <YearChips years={years} year={year} onPick={setYear} />

      <div className="gz-kpis">
        <div className="gz-kpi"><small>{year} 完成</small><b>{yr.doneCount}</b><em>{yr.wishCarryover ? `清单遗留 ${yr.wishCarryover}` : '全部消化'}</em></div>
        <div className="gz-kpi"><small>评分均值</small><b>{yr.avgRating != null ? yr.avgRating : '—'}</b><em>已评 {yr.ratedCount} 条</em></div>
        <div className="gz-kpi"><small>心头好</small><b>{yr.favorites.length}</b><em>私心偏爱</em></div>
      </div>

      {yr.perKind.length > 0 && (
        <>
          <div className="gz-sec"><span className="gz-bar" />分体裁</div>
          <div className="gz-card"><div className="gz-card-b">
            <div className="gz-bars">
              {yr.perKind.map((k) => (
                <div className="gz-bar-row" key={k.kind}>
                  <span className="nm">{k.label}</span>
                  <span className="tr"><i style={{ width: `${Math.round((k.count / maxKind) * 100)}%` }} /></span>
                  <span className="vl">×{k.count}{k.avg != null ? ` · 均 ${k.avg}` : ''}</span>
                </div>
              ))}
            </div>
          </div></div>
        </>
      )}

      {yr.doneCount > 0 && (
        <>
          <div className="gz-sec"><span className="gz-bar" />月度节奏<span className="gz-hint">完成笔数</span></div>
          <div className="gz-card"><div className="gz-card-b">
            <div className="gz-months">
              {yr.monthly.map((m) => (
                <div className="gz-month" key={m.month} title={`${m.month} 月完成 ${m.count}${m.avg != null ? `，均分 ${m.avg}` : ''}`}>
                  <span className="mc">{m.count || ''}</span>
                  <i style={{ height: `${Math.round((m.count / maxMonth) * 70)}px` }} />
                  <small>{m.month}</small>
                </div>
              ))}
            </div>
          </div></div>
        </>
      )}

      <div className="gz-sec"><span className="gz-bar" />评分档</div>
      <div className="gz-card"><div className="gz-card-b" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {RATING_BANDS.map((b) => (
          <span key={b} className={`gz-chip ${b !== '未评' && yr.ratingBands[b] ? 'on' : ''}`}>
            {b === '未评' ? `未评 ×${yr.doneCount - yr.ratedCount}` : `${b} ×${yr.ratingBands[b] || 0}`}
          </span>
        ))}
      </div></div>

      {yr.top.length > 0 && (
        <>
          <div className="gz-sec"><span className="gz-bar" />年度十佳<span className="gz-hint">分数 → 完成日</span></div>
          {yr.top.map((w: Work, i: number) => {
            const theme = KIND_THEME[w.kind] || KIND_THEME.other
            return (
              <div className="gz-item" key={w.id}>
                <span className="gz-rank">{i + 1}</span>
                <div className="gz-cover" style={{ background: theme.grad }}>{theme.emoji}</div>
                <div className="gz-item-main">
                  <div className="gz-item-head">
                    <b>{w.title}</b>
                    <span className="gz-rate">{w.rating} 分</span>
                  </div>
                  <div className="gz-item-mid">
                    <span className="gz-meta">{[w.year, w.creator, w.finishDate].filter(Boolean).join(' · ')}</span>
                    <span className="gz-badge">{KIND_LABELS[w.kind] || w.kind}</span>
                  </div>
                  {w.note && <div className="gz-item-foot"><span className="note">{w.note}</span></div>}
                </div>
              </div>
            )
          })}
        </>
      )}

      {yr.favorites.length > 0 && (
        <>
          <div className="gz-sec"><span className="gz-bar" />心头好<span className="gz-hint">十佳之外的私心偏爱</span></div>
          <div className="gz-card"><div className="gz-card-b" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {yr.favorites.map((w) => (
              <span key={w.id} className="gz-chip on">★ {w.title}</span>
            ))}
          </div></div>
        </>
      )}

      {yr.longestNote && (
        <>
          <div className="gz-sec"><span className="gz-bar" />年度最长短评</div>
          <div className="gz-quote" style={{ margin: '0 16px 10px' }}>
            <b>《{yr.longestNote.title}》{yr.longestNote.rating != null ? ` · ${yr.longestNote.rating} 分` : ''}</b>
            {yr.longestNote.note}
          </div>
        </>
      )}
    </>
  )
}

function YearChips({ years, year, onPick }: { years: string[]; year: string; onPick: (y: string) => void }) {
  return (
    <div className="gz-chiprow">
      {years.map((y) => (
        <button key={y} className={`gz-chip ${y === year ? 'on' : ''}`} onClick={() => onPick(y)}>{y}</button>
      ))}
    </div>
  )
}
