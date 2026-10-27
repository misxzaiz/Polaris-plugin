/**
 * 日历 Tab：月视图网格（点天看当天）——内联实现，零第三方依赖
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import type { SundialData, SundialEvent } from './model'

const css = `
.sd-mh{display:flex;align-items:center;gap:8px;padding:6px 18px}
.sd-mt{font-size:14px;font-weight:800}
.sd-mgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;padding:6px 14px}
.sd-mwd{font-size:10px;color:#5C6678;text-align:center;padding:3px 0;font-weight:700}
.sd-mcell{min-height:52px;background:#12151c;border:1px solid #1d2330;border-radius:8px;padding:4px 5px;cursor:pointer;overflow:hidden;transition:border-color .12s}
.sd-mcell:hover{border-color:#2b6cb0}
.sd-mcell.dim{opacity:.38}
.sd-mcell.today{border-color:#C77B3F}
.sd-mcell.sel{border-color:#58A6FF;background:#141d2e}
.sd-md{font-size:10.5px;color:#8B95A7;text-align:right;font-variant-numeric:tabular-nums}
.sd-mcell.today .sd-md{color:#C77B3F;font-weight:800}
.sd-mdots{display:flex;flex-direction:column;gap:2px;margin-top:2px}
.sd-mdot{font-size:8.5px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#C9D1D9}
.sd-mdot.habit{color:#3FB950}
.sd-mdot.countdown{color:#D29922}
.sd-mdot.done{color:#5C6678;text-decoration:line-through}
`

interface DayOcc { e: SundialEvent; start: number; key: string }

export default function MonthTab({ data }: { data: SundialData | null }) {
  const todayP = core.localParts(Date.now())
  const [view, setView] = useState({ y: todayP.y, m: todayP.m })
  const [sel, setSel] = useState<{ y: number; m: number; d: number } | null>(null)

  // 月内每天的发生（timed 按本机日期归属，allDay 按 UTC 日期归属）
  const { grid, byDay } = useMemo(() => {
    const empty = { grid: [] as { d: number; inMonth: boolean; occs: DayOcc[] }[], byDay: new Map<string, DayOcc[]>() }
    if (!data) return empty
    const monthStart = new Date(view.y, view.m - 1, 1).getTime()
    const monthEnd = new Date(view.y, view.m, 0, 23, 59, 59, 999).getTime()
    const map = new Map<string, DayOcc[]>()
    const push = (dayKey: string, occ: DayOcc) => {
      const arr = map.get(dayKey) || []
      arr.push(occ)
      map.set(dayKey, arr)
    }
    for (const e of data.events) {
      if (e.enabled === false) continue
      for (const occ of core.expandOccurrences(e, monthStart, monthEnd)) {
        if (e.allDay) {
          const p = core.utcParts(occ.start)
          push(`${p.y}-${p.m}-${p.d}`, { e, start: occ.start, key: occ.key })
        } else {
          const p = core.localParts(occ.start)
          push(`${p.y}-${p.m}-${p.d}`, { e, start: occ.start, key: occ.key })
        }
      }
    }
    // 6 周网格（含前后月补位）
    const firstDow = (new Date(view.y, view.m - 1, 1).getDay() + 6) % 7 // 周一=0
    const daysInMonth = new Date(view.y, view.m, 0).getDate()
    const cells: { d: number; inMonth: boolean; occs: DayOcc[] }[] = []
    const total = Math.ceil((firstDow + daysInMonth) / 7) * 7
    for (let i = 0; i < total; i++) {
      const dayNum = i - firstDow + 1
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth
      const dd = inMonth ? dayNum : dayNum < 1 ? dayNum : dayNum - daysInMonth
      const key = inMonth ? `${view.y}-${view.m}-${dayNum}` : ''
      cells.push({ d: dd, inMonth, occs: (key && map.get(key)) || [] })
    }
    return { grid: cells, byDay: map }
  }, [data, view])

  const selKey = sel ? `${sel.y}-${sel.m}-${sel.d}` : ''
  const selOccs = selKey ? (byDay.get(selKey) || []).sort((a, b) => a.start - b.start) : []

  const isTodayCell = (cell: { d: number; inMonth: boolean }) => cell.inMonth && view.y === todayP.y && view.m === todayP.m && cell.d === todayP.d
  const isSel = (cell: { d: number; inMonth: boolean }) => !!sel && cell.inMonth && view.y === sel.y && view.m === sel.m && cell.d === sel.d

  const shift = (delta: number) => {
    const m = view.m + delta
    const y = view.y + Math.floor((m - 1) / 12)
    const nm = ((m - 1) % 12 + 12) % 12 + 1
    setView({ y, m: nm })
    setSel(null)
  }

  return (
    <div>
      <div className="sd-mh">
        <button className="sd-btn sm ghost" onClick={() => shift(-1)}>‹</button>
        <span className="sd-mt">{view.y} 年 {view.m} 月</span>
        <button className="sd-btn sm ghost" onClick={() => shift(1)}>›</button>
        <button className="sd-btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => { setView({ y: todayP.y, m: todayP.m }); setSel({ y: todayP.y, m: todayP.m, d: todayP.d }) }}>今</button>
      </div>
      <div className="sd-mgrid">
        {['一', '二', '三', '四', '五', '六', '日'].map((w) => <div key={w} className="sd-mwd">{w}</div>)}
        {grid.map((cell, i) => (
          <div
            key={i}
            className={`sd-mcell ${cell.inMonth ? '' : 'dim'} ${isTodayCell(cell) ? 'today' : ''} ${isSel(cell) ? 'sel' : ''}`}
            onClick={() => cell.inMonth && setSel({ y: view.y, m: view.m, d: cell.d })}
          >
            <div className="sd-md">{cell.d}</div>
            <div className="sd-mdots">
              {cell.occs.slice(0, 2).map((o) => {
                const markV = o.e.done ? o.e.done[o.key] : undefined
                return (
                  <div key={o.e.id + o.key} className={`sd-mdot ${o.e.kind === 'habit' ? 'habit' : o.e.kind === 'countdown' ? 'countdown' : ''} ${markV === 'done' ? 'done' : ''}`}>
                    {o.e.title}
                  </div>
                )
              })}
              {cell.occs.length > 2 && <div className="sd-mdot" style={{ color: '#5C6678' }}>+{cell.occs.length - 2}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="sd-sec"><i className="sd-bar" />{sel ? `${sel.m} 月 ${sel.d} 日` : '选一天看安排'}</div>
      <div className="sd-card">
        {!sel && <div className="sd-empty">点上面的日期格子，查看当天安排。</div>}
        {sel && selOccs.length === 0 && <div className="sd-empty">这天没有安排。</div>}
        {selOccs.map((o) => {
          const markV = o.e.done ? o.e.done[o.key] : undefined
          return (
            <div key={o.e.id + o.key} className="sd-occ">
              <div className="sd-occ-time">{o.e.allDay ? <span className="sd-allday">全天</span> : core.fmtClock(o.start)}</div>
              <div className="sd-occ-main">
                <div className={`sd-occ-t ${markV === 'done' ? 'done' : ''}`}>{o.e.title}</div>
                <div className="sd-occ-m">
                  {o.e.kind !== 'event' && <span className={`sd-kind ${o.e.kind}`}>{o.e.kind === 'habit' ? '习惯' : '倒数'}</span>}
                  {o.e.source === 'ics' && <span className="sd-kind ics">ICS</span>}
                  {o.e.rrule && <span>{core.describeRrule(o.e.rrule)}</span>}
                  {markV === 'skip' && <span>已跳过</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
