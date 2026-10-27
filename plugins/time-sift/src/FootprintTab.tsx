/**
 * FootprintTab —— 足迹：总卡 + 26 周热力图（内联网格，零依赖）+ 来源分布 + Top 活跃日
 *
 * 数据直读 kv（sift.stats.total / sift.stats.daily，服务单写）——服务离线也能看历史足迹。
 */
import { useEffect, useState } from 'react'
import { readDaily, readTotals, SOURCE_LABEL, type SiftSource, type Totals } from './model'

function fmtNum(n: number): string {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + ' 亿'
  if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万'
  return n >= 1000 ? n.toLocaleString('en-US') : String(n)
}

const HEAT_STEPS = ['#1b2130', '#17351f', '#1d5230', '#27793f', '#39a852', '#5fd86f']

function heatColor(msgs: number): string {
  if (msgs <= 0) return HEAT_STEPS[0]
  if (msgs <= 10) return HEAT_STEPS[1]
  if (msgs <= 30) return HEAT_STEPS[2]
  if (msgs <= 80) return HEAT_STEPS[3]
  if (msgs <= 200) return HEAT_STEPS[4]
  return HEAT_STEPS[5]
}

/** 最近 N 周的日期矩阵（列=周，行=周一..周日），GitHub 贡献图风格 */
function buildWeeks(daily: Record<string, { s: number; m: number }>, weeks = 26) {
  const today = new Date()
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  // 对齐到本周周日（周末在列底）
  const endOffset = (end.getDay() + 6) % 7 // 周一=0
  const lastMonday = new Date(end)
  lastMonday.setDate(end.getDate() - endOffset)
  const cols: Array<Array<{ day: string; m: number; s: number } | null>> = []
  const d = new Date(lastMonday)
  d.setDate(lastMonday.getDate() - (weeks - 1) * 7)
  for (let w = 0; w < weeks; w++) {
    const col: Array<{ day: string; m: number; s: number } | null> = []
    for (let i = 0; i < 7; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (d > end) col.push(null)
      else {
        const v = daily[key]
        col.push({ day: key, m: v ? v.m : 0, s: v ? v.s : 0 })
      }
      d.setDate(d.getDate() + 1)
    }
    cols.push(col)
  }
  return cols
}

export default function FootprintTab() {
  const [totals, setTotals] = useState<Totals | null>(null)
  const [daily, setDaily] = useState<Record<string, { s: number; m: number }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const [t, d] = await Promise.all([readTotals(), readDaily()])
      setTotals(t)
      setDaily(d || {})
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return (
      <div className="ts-empty">
        <span className="ts-spin" /> 读取足迹…
      </div>
    )
  }
  if (!totals || totals.sessions === 0) {
    return (
      <div className="ts-empty">
        <b>足迹还是空白</b>
        服务完成首次扫描后会在这里看到：会话热力图、总量、来源分布。
        <br />
        去「设置」页确认服务状态与首次扫描进度。
      </div>
    )
  }

  const weeks = buildWeeks(daily)
  const topDays = Object.entries(daily)
    .sort((a, b) => b[1].m - a[1].m)
    .slice(0, 8)
  const maxDayMsgs = topDays.length ? topDays[0][1].m : 1
  const sources = Object.entries(totals.bySource || {}).sort((a, b) => b[1].sessions - a[1].sessions)
  const maxSrcSessions = sources.length ? sources[0][1].sessions : 1
  const tk = totals.tokens || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, sessionsCovered: 0 }

  return (
    <>
      <div className="ts-sec">
        <span className="ts-bar" /> 总览
        <span className="ts-hint">
          {totals.firstDay || '?'} ~ {totals.lastDay || '?'}
        </span>
      </div>
      <div className="ts-row" style={{ padding: '0 16px 10px', gap: 8 }}>
        {(
          [
            ['会话', fmtNum(totals.sessions)],
            ['消息', fmtNum(totals.messages)],
            ['对话散文', fmtNum(totals.proseChars)],
            ['活跃天数', fmtNum(totals.activeDays)],
          ] as Array<[string, string]>
        ).map(([label, value]) => (
          <div key={label} className="ts-card" style={{ flex: 1, minWidth: 100, margin: 0 }}>
            <div className="ts-card-b" style={{ textAlign: 'center', padding: '10px 6px' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#B3B9FF' }}>{value}</div>
              <div className="ts-sub" style={{ marginTop: 2 }}>
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="ts-sec">
        <span className="ts-bar" /> 26 周热力图
        <span className="ts-hint">按天消息数</span>
      </div>
      <div className="ts-card">
        <div className="ts-card-b" style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, 11px)', gap: 3, width: 'max-content' }}>
            {weeks.map((col, ci) =>
              col.map((cell, ri) => (
                <div
                  key={`${ci}-${ri}`}
                  title={cell ? `${cell.day}：${cell.s} 会话 / ${cell.m} 消息` : ''}
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 2.5,
                    background: cell ? heatColor(cell.m) : 'transparent',
                    outline: cell && cell.m > 0 ? 'none' : '1px solid rgba(255,255,255,.03)',
                  }}
                />
              )),
            )}
          </div>
          <div className="ts-row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
            <span className="ts-sub">少</span>
            {HEAT_STEPS.map((c) => (
              <span key={c} style={{ width: 11, height: 11, borderRadius: 2.5, background: c, display: 'inline-block' }} />
            ))}
            <span className="ts-sub">多</span>
          </div>
        </div>
      </div>

      <div className="ts-sec">
        <span className="ts-bar" /> 来源分布
      </div>
      <div className="ts-card">
        <div className="ts-card-b">
          {sources.map(([src, v]) => (
            <div key={src} style={{ marginBottom: 8 }}>
              <div className="ts-row" style={{ fontSize: 11.5 }}>
                <span className={`ts-tag ${src}`}>{SOURCE_LABEL[src as SiftSource] || src}</span>
                <span className="ts-sub">
                  {v.sessions} 会话 / {fmtNum(v.messages)} 消息
                </span>
              </div>
              <div style={{ height: 6, background: '#1b2130', borderRadius: 3, marginTop: 4 }}>
                <div style={{ width: `${Math.max(3, (v.sessions / maxSrcSessions) * 100)}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#7A5CFF,#58A6FF)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ts-sec">
        <span className="ts-bar" /> Top 活跃日
        <span className="ts-hint">按消息数</span>
      </div>
      <div className="ts-card">
        <div className="ts-card-b">
          {topDays.map(([day, v]) => (
            <div key={day} className="ts-row" style={{ marginBottom: 6, fontSize: 11.5 }}>
              <span style={{ width: 84, flexShrink: 0 }}>{day}</span>
              <div style={{ flex: 1, height: 6, background: '#1b2130', borderRadius: 3 }}>
                <div style={{ width: `${Math.max(2, (v.m / maxDayMsgs) * 100)}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#1d5230,#5fd86f)' }} />
              </div>
              <span className="ts-sub" style={{ width: 90, textAlign: 'right', flexShrink: 0 }}>
                {v.s} 会话 / {v.m} 消息
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="ts-sec">
        <span className="ts-bar" /> Token 用量
        <span className="ts-hint">口径：能取到用量的 {tk.sessionsCovered} 条会话</span>
      </div>
      <div className="ts-card">
        <div className="ts-card-b ts-sub">
          输入 {fmtNum(tk.input)} · 输出 {fmtNum(tk.output)} · 缓存读 {fmtNum(tk.cacheRead)} · 缓存写 {fmtNum(tk.cacheWrite)}
          {tk.costUsd > 0 && ` · 费用约 $${tk.costUsd.toFixed(2)}`}
          <br />
          来源开关不同 / 源数据不同，token 只对「能取到」的会话累加，不臆造补零。
        </div>
      </div>
    </>
  )
}
