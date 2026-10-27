/**
 * 历史 Tab：7/14/30 天区间，分类堆叠条 + 汇总 + 日明细（点行看单日 Top 应用）
 */
import { useEffect, useMemo, useState } from 'react'
import {
  aggregateDays, displayName, fmtDur, loadDays,
  CATEGORIES, type CatRule, type TrailDay,
} from './model'
import type { PanelData } from './model'

export default function HistoryTab({ data }: { data: PanelData | null }) {
  const [range, setRange] = useState<7 | 14 | 30>(7)
  const [days, setDays] = useState<TrailDay[] | null>(null)
  const [err, setErr] = useState('')
  const [openDay, setOpenDay] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setDays(null)
    setErr('')
    loadDays(range)
      .then((d) => { if (alive) setDays(d) })
      .catch((e) => { if (alive) setErr((e as Error).message) })
    return () => { alive = false }
  }, [range])

  const rules: CatRule[] = data?.cats.rules ?? []
  const agg = useMemo(() => (days ? aggregateDays(days, rules) : null), [days, rules])
  const sortedDays = useMemo(() => (days ? [...days].reverse() : []), [days])

  const openDayRec = openDay ? days?.find((d) => d.date === openDay) : null
  const openAgg = useMemo(() => (openDayRec ? aggregateDays([openDayRec], rules) : null), [openDayRec, rules])

  return (
    <>
      <div className="tt-card">
        <div className="tt-card-h">
          区间汇总
          <span className="tt-seg">
            {([7, 14, 30] as const).map((r) => (
              <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r}天</button>
            ))}
          </span>
        </div>
        <div className="tt-card-b">
          {err && <div className="tt-err">{err}</div>}
          {!err && !days && <div className="tt-empty">加载中…</div>}
          {agg && (
            <div className="tt-chips" style={{ padding: '4px 0 6px' }}>
              <div className="tt-chip"><small>合计活跃</small><b>{fmtDur(agg.totalSec)}</b></div>
              <div className="tt-chip"><small>日均</small><b>{fmtDur(Math.round(agg.totalSec / range))}</b></div>
              <div className="tt-chip"><small>空闲</small><b>{fmtDur(agg.idleSec)}</b></div>
              <div className="tt-chip"><small>有记录天数</small><b>{days!.length}</b></div>
            </div>
          )}
        </div>
      </div>

      {agg && (
        <div className="tt-card">
          <div className="tt-card-h">分类构成 <small>每天一根堆叠条</small></div>
          <div className="tt-card-b">
            <div className="tt-daybar">
              {sortedDays.map((d) => {
                const dayAgg = agg.byDay[d.date]
                const total = dayAgg?.totalSec || 0
                const cats = Object.entries(dayAgg?.byCat || {}).sort((a, b) => b[1] - a[1])
                return (
                  <div className="tt-dayrow" key={d.date} title={`${d.date} ${fmtDur(total)}`}>
                    <span className="d">{d.date.slice(5)}</span>
                    <div className="stack">
                      {cats.map(([cat, sec]) => {
                        const meta = CATEGORIES[cat] || CATEGORIES.other
                        return (
                          <div
                            key={cat}
                            style={{ flex: sec, background: meta.color, height: '100%', minWidth: 2 }}
                            title={`${meta.label} ${fmtDur(sec)}`}
                          />
                        )
                      })}
                    </div>
                    <span className="sum">{total > 0 ? fmtDur(total) : '—'}</span>
                  </div>
                )
              })}
              {!sortedDays.length && <div className="tt-empty">区间内暂无记录</div>}
            </div>
          </div>
        </div>
      )}

      {agg && (
        <div className="tt-card">
          <div className="tt-card-h">日明细 <small>点行看单日 Top</small></div>
          <div className="tt-card-b">
            <div className="tt-daylist">
              {sortedDays.map((d) => {
                const dayAgg = agg.byDay[d.date]
                const top = Object.entries(dayAgg?.byCat || {}).sort((a, b) => b[1] - a[1])[0]
                const meta = top ? (CATEGORIES[top[0]] || CATEGORIES.other) : null
                return (
                  <div className="tt-dayitem" key={d.date} onClick={() => setOpenDay(openDay === d.date ? null : d.date)}>
                    <span className="d">{d.date}</span>
                    <span className="info">
                      {(dayAgg?.totalSec || 0) > 0
                        ? `切换 ${d.switches} 次 · 空闲 ${fmtDur(d.idleSec)}${meta ? ` · 主 ${meta.emoji}${meta.label}` : ''}`
                        : '无记录'}
                    </span>
                    <span className="dur">{(dayAgg?.totalSec || 0) > 0 ? fmtDur(dayAgg!.totalSec) : '—'}</span>
                  </div>
                )
              })}
            </div>
            {openDayRec && openAgg && (
              <div style={{ borderTop: '1px solid #1d2330', marginTop: 8, paddingTop: 6 }}>
                <div className="tt-sub" style={{ paddingBottom: 4 }}>{openDayRec.date} Top 应用：</div>
                {Object.entries(openAgg.byApp).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([app, sec]) => {
                  return (
                    <div className="tt-app-row" key={app}>
                      <span className="nm">{displayName(app)}</span>
                      <span className="dur">{fmtDur(sec)}</span>
                    </div>
                  )
                })}
                {!Object.keys(openAgg.byApp).length && <div className="tt-empty">该日无应用记录</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
