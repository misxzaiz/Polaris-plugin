/**
 * 今日 Tab：到期提醒横幅（知道了）+ 倒计时卡片 + 今日时间轴（习惯打卡）+ 明天预览
 */
import { useEffect, useMemo, useState } from 'react'
import * as core from '../shared/core'
import { ackReminder, markOccurrence, type SundialData, type SundialEvent } from './model'

interface Row { e: SundialEvent; start: number; key: string; end: number }

const css = `
.sd-remind{background:linear-gradient(135deg,#3a2b16,#33220f);border:1px solid #6b4e1d;border-radius:13px;margin:0 16px 10px;padding:11px 13px;display:flex;gap:10px;align-items:flex-start}
.sd-remind-ico{font-size:18px;line-height:1.2}
.sd-remind-main{flex:1;min-width:0}
.sd-remind-t{font-size:13px;font-weight:700;color:#F0C36D}
.sd-remind-s{font-size:11px;color:#B8A27A;margin-top:2px}
.sd-cds{display:flex;gap:8px;overflow-x:auto;padding:2px 16px 8px;scrollbar-width:none}
.sd-cds::-webkit-scrollbar{display:none}
.sd-cd{flex:0 0 auto;min-width:108px;background:#161B22;border:1px solid #242C3A;border-radius:11px;padding:9px 11px}
.sd-cd-n{font-size:19px;font-weight:800;background:linear-gradient(135deg,#C77B3F,#58A6FF);-webkit-background-clip:text;background-clip:text;color:transparent}
.sd-cd-t{font-size:11px;margin-top:2px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sd-cd-d{font-size:9.5px;color:#5C6678;margin-top:1px}
.sd-occ{display:flex;gap:9px;padding:10px 13px;border-top:1px solid #1d2330;align-items:flex-start}
.sd-occ:first-child{border-top:none}
.sd-occ.now{background:#1A2130}
.sd-occ-time{font-size:11px;color:#8B95A7;width:78px;flex-shrink:0;padding-top:1px;font-variant-numeric:tabular-nums}
.sd-occ-time.now{color:#58A6FF;font-weight:700}
.sd-occ-main{flex:1;min-width:0}
.sd-occ-t{font-size:12.5px;font-weight:600;line-height:1.4;word-break:break-word}
.sd-occ-t.done{color:#8B95A7;text-decoration:line-through}
.sd-occ-m{font-size:10px;color:#5C6678;margin-top:3px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.sd-kind{border-radius:4px;padding:0 5px;font-size:9px;font-weight:700}
.sd-kind.habit{background:#12301f;color:#3FB950}
.sd-kind.countdown{background:#2b2416;color:#D29922}
.sd-kind.ics{background:#141d2e;color:#58A6FF}
.sd-occ-btns{display:flex;gap:5px;flex-shrink:0}
.sd-allday{font-size:10px;color:#C77B3F;font-weight:700}
`

function rowEnd(e: SundialEvent, start: number): number {
  return start + Math.max(0, Number(e.durationMin) || 0) * 60000
}

export default function TodayTab({ data, reload, showToast }: {
  data: SundialData | null
  reload: () => Promise<SundialData | null>
  showToast: (msg: string, bad?: boolean) => void
}) {
  const [, forceTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => forceTick((n) => n + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  const now = Date.now()
  const activeReminders = useMemo(() => {
    if (!data) return []
    return data.reminders.filter((r) => !data.acked[r.id] || data.acked[r.id] <= r.remindAt)
  }, [data])

  const { todayRows, tomorrowRows, alldayRows, timedRows } = useMemo(() => {
    const empty = { todayRows: [] as Row[], tomorrowRows: [] as Row[], alldayRows: [] as Row[], timedRows: [] as Row[] }
    if (!data) return empty
    const p = core.localParts(now)
    const t0 = new Date(p.y, p.m - 1, p.d).getTime()
    const t1 = t0 + core.DAY_MS - 1
    const collect = (from: number, to: number): Row[] => {
      const rows: Row[] = []
      for (const e of data.events) {
        if (e.enabled === false) continue
        for (const occ of core.expandOccurrences(e, from, to)) {
          rows.push({ e, start: occ.start, key: occ.key, end: rowEnd(e, occ.start) })
        }
      }
      return rows.sort((a, b) => a.start - b.start)
    }
    const today = collect(t0, t1)
    const tomorrow = collect(t0 + core.DAY_MS, t1 + core.DAY_MS)
    return {
      todayRows: today,
      tomorrowRows: tomorrow,
      alldayRows: today.filter((r) => r.e.allDay),
      timedRows: today.filter((r) => !r.e.allDay),
    }
  }, [data, now])

  const countdowns = useMemo(() => {
    if (!data) return []
    const out: { e: SundialEvent; days: number; targetTs: number }[] = []
    for (const e of data.events) {
      if (e.enabled === false || e.kind !== 'countdown') continue
      const c = core.countdownInfo(e, now)
      if (c && c.days <= 365) out.push({ e, days: c.days, targetTs: c.targetTs })
    }
    return out.sort((a, b) => a.days - b.days).slice(0, 8)
  }, [data, now])

  const mark = async (e: SundialEvent, occKey: string, state: 'done' | 'skip' | 'none') => {
    try {
      await markOccurrence(e, occKey, state)
      await reload()
    } catch (err) {
      showToast((err as Error).message, true)
    }
  }

  const ack = async (rId: string) => {
    try {
      await ackReminder(rId)
      await reload()
    } catch (err) {
      showToast((err as Error).message, true)
    }
  }

  if (!data) return <div className="sd-empty">载入中…</div>

  const nextUp = timedRows.find((r) => r.end >= now && !(r.e.done && r.e.done[r.key] === 'done') && !(r.e.done && r.e.done[r.key] === 'skip'))

  const occRow = (r: Row, isTomorrow = false) => {
    const markV = r.e.done ? r.e.done[r.key] : undefined
    const isNow = !isTomorrow && r.start <= now && r.end >= now
    const isNext = r === nextUp
    return (
      <div key={r.e.id + '|' + r.key} className={`sd-occ ${isNow ? 'now' : ''}`}>
        <div className={`sd-occ-time ${isNow ? 'now' : ''}`}>
          {r.e.allDay ? <span className="sd-allday">全天</span> : core.fmtClock(r.start)}
        </div>
        <div className="sd-occ-main">
          <div className={`sd-occ-t ${markV === 'done' ? 'done' : ''}`}>
            {r.e.title}
            {r.e.kind === 'habit' && !isTomorrow && (() => {
              const s = core.computeStreak(r.e, now)
              return s > 0 ? <span style={{ color: '#D29922', marginLeft: 6 }}>🔥{s}</span> : null
            })()}
          </div>
          <div className="sd-occ-m">
            {r.e.kind !== 'event' && <span className={`sd-kind ${r.e.kind}`}>{r.e.kind === 'habit' ? '习惯' : '倒数'}</span>}
            {r.e.source === 'ics' && <span className="sd-kind ics">ICS</span>}
            {r.e.rrule && <span>{core.describeRrule(r.e.rrule)}</span>}
            {markV === 'skip' && <span style={{ color: '#8B95A7' }}>已跳过</span>}
            {r.e.tags.map((t) => <span key={t} className="sd-tag">{t}</span>)}
          </div>
        </div>
        <div className="sd-occ-btns">
          {markV === 'done'
            ? <button className="sd-btn sm ghost" onClick={() => mark(r.e, r.key, 'none')}>撤销</button>
            : (
              <>
                <button className="sd-btn sm ok" onClick={() => mark(r.e, r.key, 'done')}>完成</button>
                {!isTomorrow && <button className="sd-btn sm ghost" onClick={() => mark(r.e, r.key, 'skip')}>跳过</button>}
              </>
            )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {activeReminders.length > 0 && (
        <div>
          {activeReminders.slice(0, 6).map((r) => (
            <div key={r.id} className="sd-remind">
              <div className="sd-remind-ico">⏰</div>
              <div className="sd-remind-main">
                <div className="sd-remind-t">{r.title}</div>
                <div className="sd-remind-s">
                  {r.allDay ? '全天' : core.fmtClock(r.start)} 开始
                  {r.offsetMin > 0 ? ` · 提前 ${r.offsetMin >= 1440 ? `${Math.round(r.offsetMin / 1440)} 天` : r.offsetMin >= 60 ? `${r.offsetMin / 60} 小时` : `${r.offsetMin} 分钟`}` : ' · 准时提醒'}
                </div>
              </div>
              <button className="sd-btn sm ghost" onClick={() => ack(r.id)}>知道了</button>
            </div>
          ))}
        </div>
      )}

      {countdowns.length > 0 && (
        <div>
          <div className="sd-sec"><i className="sd-bar" />倒数日<span className="sd-hint">距目标还有</span></div>
          <div className="sd-cds">
            {countdowns.map(({ e, days, targetTs }) => (
              <div key={e.id} className="sd-cd">
                <div className="sd-cd-n">{days === 0 ? '今天' : `D-${days}`}</div>
                <div className="sd-cd-t" title={e.title}>{e.title}</div>
                <div className="sd-cd-d">{core.fmtDay(targetTs)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sd-sec"><i className="sd-bar" />今天<span className="sd-hint">{core.fmtDay(now)} {core.WD_CN[new Date(now).getDay()] && `周${core.WD_CN[new Date(now).getDay()]}`}</span></div>
      <div className="sd-card">
        {todayRows.length === 0 && <div className="sd-empty">今天没有安排。<br />去聊天里对 AI 说「提醒我明天下午3点取快递」，或在「事件」页添加。</div>}
        {alldayRows.map((r) => occRow(r))}
        {timedRows.map((r) => occRow(r))}
      </div>

      {tomorrowRows.length > 0 && (
        <div>
          <div className="sd-sec"><i className="sd-bar" />明天<span className="sd-hint">{tomorrowRows.length} 项</span></div>
          <div className="sd-card">
            {tomorrowRows.slice(0, 5).map((r) => occRow(r, true))}
            {tomorrowRows.length > 5 && <div className="sd-sub" style={{ padding: '8px 13px' }}>还有 {tomorrowRows.length - 5} 项…</div>}
          </div>
        </div>
      )}
    </div>
  )
}
