/**
 * 今日 Tab：实时当前应用 + 汇总 chips + 分类条 + Top 应用 + 24h 时间带
 */
import { useMemo } from 'react'
import {
  aggregateDays, classifyApp, displayName, fmtDur, hourDominant,
  CATEGORIES, type PanelData, type CatRule, type TrailDay,
} from './model'
import type { Toast } from './Panel'

export default function TodayTab({ data, reload, showToast }: {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
}) {
  const rules = data?.cats.rules ?? []

  const agg = useMemo(
    () => (data?.today ? aggregateDays([data.today], rules) : null),
    [data?.today, rules],
  )

  const topApps = useMemo(() => {
    if (!agg) return []
    return Object.entries(agg.byApp).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [agg])

  const catBars = useMemo(() => {
    if (!agg) return []
    return Object.entries(agg.byCat)
      .map(([cat, sec]) => ({ cat, sec, ...(CATEGORIES[cat] || CATEGORIES.other) }))
      .sort((a, b) => b.sec - a.sec)
  }, [agg])

  if (!data) return <div className="tt-empty">加载中…</div>
  const { snap, today } = data

  if (!snap) {
    return (
      <div className="tt-empty">
        刻漏服务未运行。<br />
        <span className="tt-sub">到「设置」Tab 启动 trail-service 后，本页开始显示今日时间流向。</span>
      </div>
    )
  }

  const now = Date.now()
  const c = snap.current
  const sinceMin = c ? Math.max(0, Math.round((now - (c.since || now)) / 60000)) : 0
  const maxCatSec = catBars.length ? catBars[0].sec : 1
  const maxAppSec = topApps.length ? topApps[0][1] : 1

  return (
    <>
      {snap.paused && (
        <div className="tt-banner warn">⏸ 暂停采集中（隐私模式）——期间什么都不记录，设置 Tab 可恢复</div>
      )}
      {!snap.paused && snap.collector === 'dead' && (
        <div className="tt-banner bad">
          <span style={{ flex: 1, minWidth: 0 }}>采集器离线{snap.collectorErr ? `：${snap.collectorErr}` : ''}</span>
          <button
            className="tt-btn sm"
            onClick={async () => {
              const { runCmd } = await import('./model')
              const r = await runCmd({ action: 'collector_restart' })
              showToast(r.ok ? '已下发采集器重启' : r.error || '重启失败', !r.ok)
              await reload()
            }}
          >重启</button>
        </div>
      )}

      <div className="tt-card">
        <div className="tt-now">
          <div className="tt-now-ico">{snap.paused ? '⏸' : c && c.app && !c.idle ? '▶' : '🌙'}</div>
          <div className="tt-now-main">
            <b>{snap.paused ? '已暂停（隐私模式）' : c && c.app ? displayName(c.app) : '无前台应用'}</b>
            <small>
              {!snap.paused && c && c.app
                ? c.idle
                  ? `已空闲 ${fmtDur(Math.round((c.idleMs || 0) / 1000))}`
                  : `已 ${sinceMin < 1 ? '不到 1 分钟' : `${sinceMin} 分钟`}${c.title ? ` — ${c.title}` : ''}`
                : !snap.paused
                  ? '锁定屏或桌面空闲中，时间记入空闲桶'
                  : '恢复采集后继续记账'}
            </small>
          </div>
        </div>
        <div className="tt-chips">
          <div className="tt-chip"><small>今日活跃</small><b>{agg ? fmtDur(agg.totalSec) : '—'}</b></div>
          <div className="tt-chip"><small>空闲</small><b>{today ? fmtDur(today.idleSec) : '—'}</b></div>
          <div className="tt-chip"><small>应用切换</small><b>{today ? today.switches : '—'}</b></div>
          <div className="tt-chip"><small>应用数</small><b>{today ? Object.keys(today.apps).length : '—'}</b></div>
        </div>
      </div>

      <div className="tt-card">
        <div className="tt-card-h">分类 <small>规则改动对全部历史生效</small></div>
        <div className="tt-card-b">
          {catBars.length ? catBars.map((b) => (
            <div className="tt-bar-row" key={b.cat}>
              <div className="nm"><span>{b.emoji} {b.label}</span></div>
              <div className="tt-bar-track">
                <div className="tt-bar-fill" style={{ width: `${Math.max(3, (b.sec / maxCatSec) * 100)}%`, background: b.color }} />
              </div>
              <div className="tt-bar-val">{fmtDur(b.sec)}</div>
            </div>
          )) : <div className="tt-empty">今天还没有记录</div>}
        </div>
      </div>

      <div className="tt-card">
        <div className="tt-card-h">Top 应用</div>
        <div className="tt-card-b">
          {topApps.length ? topApps.map(([app, sec], i) => {
            const cat = classifyApp(app, rules)
            const meta = CATEGORIES[cat] || CATEGORIES.other
            return (
              <div className="tt-app-row" key={app}>
                <span className="idx">{i + 1}</span>
                <span className="nm">{displayName(app)}<span style={{ color: '#5C6678', fontSize: 10 }}>（{app}）</span></span>
                <span className="cat" style={{ background: `${meta.color}22`, color: meta.color }}>{meta.emoji} {meta.label}</span>
                <span className="dur">{fmtDur(sec)}</span>
              </div>
            )
          }) : <div className="tt-empty">暂无应用记录</div>}
        </div>
      </div>

      <div className="tt-card">
        <div className="tt-card-h">24 小时带 <small>颜色=该时段主分类，亮度=时长</small></div>
        <div className="tt-card-b">
          {today ? <HourStrip day={today} rules={rules} /> : <div className="tt-empty">暂无数据</div>}
        </div>
      </div>
    </>
  )
}

function HourStrip({ day, rules }: { day: TrailDay; rules: CatRule[] }) {
  const cells = []
  const nowHour = new Date().getHours()
  let maxSec = 1
  const dominants: (ReturnType<typeof hourDominant>)[] = []
  for (let h = 0; h < 24; h++) {
    const d = hourDominant(day, h, rules)
    dominants.push(d)
    if (d && d.sec > maxSec) maxSec = d.sec
  }
  for (let h = 0; h < 24; h++) {
    const d = dominants[h]
    const meta = d ? (CATEGORIES[d.cat] || CATEGORIES.other) : null
    const alpha = d ? Math.max(0.25, Math.min(1, 0.25 + (d.sec / maxSec) * 0.75)) : 0
    const future = h > nowHour
    cells.push(
      <div
        key={h}
        className="tt-cell"
        title={d ? `${String(h).padStart(2, '0')}:00 ${meta!.label} ${fmtDur(d.sec)}` : `${String(h).padStart(2, '0')}:00 无记录`}
        style={{
          background: d && !future
            ? hexAlpha(meta!.color, alpha)
            : '#12151c',
          outline: h === nowHour ? '1px solid #58A6FF88' : undefined,
        }}
      />,
    )
  }
  return (
    <>
      <div className="tt-strip">{cells}</div>
      <div className="tt-cell-l"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
    </>
  )
}

function hexAlpha(hex: string, alpha: number): string {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`
}
