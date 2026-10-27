/**
 * 历史 Tab：范围选择（24h/72h/7d）+ 小时桶热力条 + 均值折线 + 全目标聚合表
 *
 * 数据：netmon.h.<YYYYMMDDHH> 小时桶（服务写前持久），面板并行分批拉取后
 * 本地聚合。桶分钟记录 [minIdx, avgX10|null, max, loss, cnt]。
 */
import { useEffect, useMemo, useState } from 'react'
import { loadHourBuckets, fmtMs, msColor, type HourBucket, type MinuteRec, type PanelData } from './model'

const css = `
.ns-h-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.ns-h-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#7C5CFF,#58A6FF);flex-shrink:0}
.ns-h-range{display:flex;gap:6px;margin:0 16px 10px}
.ns-h-chip{background:#161B22;border:1px solid #242C3A;color:#8B95A7;font-size:11px;border-radius:8px;padding:4px 10px;cursor:pointer}
.ns-h-chip.on{background:#1C2330;color:#E6EAF2;border-color:#2b6cb0;font-weight:600}
.ns-h-heat{margin:0 16px 10px;background:#161B22;border:1px solid #242C3A;border-radius:12px;padding:10px 12px}
.ns-h-heat-row{display:flex;gap:2px;margin-top:4px}
.ns-h-cell{flex:1;height:16px;border-radius:3px;background:#1a2029;min-width:0}
.ns-h-heat-l{display:flex;justify-content:space-between;font-size:10px;color:#5C6678;margin-top:5px}
.ns-h-chart{margin:0 16px 10px;background:#161B22;border:1px solid #242C3A;border-radius:12px;padding:10px 12px}
.ns-h-table{margin:0 16px 10px;background:#161B22;border:1px solid #242C3A;border-radius:12px;overflow:hidden}
.ns-h-tr{display:flex;padding:7px 12px;border-top:1px solid #1d2330;font-size:11.5px;gap:6px;align-items:center}
.ns-h-tr:first-child{border-top:none;color:#8B95A7;font-size:10.5px}
.ns-h-tr.n{color:#8B95A7}
.ns-h-c1{flex:1.2;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:#E6EAF2}
.ns-h-tr.n .ns-h-c1{font-weight:400;color:#8B95A7}
.ns-h-c{flex:1;text-align:right}
`

type Range = 24 | 72 | 168

interface HourAgg { key: string; avg: number | null; max: number | null; lossPct: number; cnt: number }

function aggHour(recs: MinuteRec[]): { avg: number | null; max: number | null; loss: number; cnt: number } {
  const okMs: number[] = []
  let loss = 0
  let cnt = 0
  let max = 0
  for (const r of recs) {
    if (!Array.isArray(r) || r.length < 5) continue
    cnt += r[4]
    loss += r[3]
    if (r[1] !== null && Number.isFinite(r[1])) okMs.push(r[1] / 10)
    if (Number.isFinite(r[2]) && r[2] > max) max = r[2]
  }
  return {
    avg: okMs.length ? okMs.reduce((a, b) => a + b, 0) / okMs.length : null,
    max: max || null,
    loss,
    cnt,
  }
}

function heatColor(cell: HourAgg | null): string {
  if (!cell || cell.cnt === 0) return '#1a2029'
  if (cell.lossPct >= 50) return '#F85149'
  if (cell.lossPct > 0) return '#8c3a35'
  if (cell.avg === null) return '#1a2029'
  return msColor(cell.avg)
}

function Chart({ cells, color }: { cells: (HourAgg | null)[]; color: string }) {
  const w = 100
  const hgt = 90
  const vals = cells.map((c) => (c && c.avg !== null && Number.isFinite(c.avg) ? c.avg : null))
  const known = vals.filter((v): v is number => v !== null)
  const max = Math.max(200, ...(known.length ? known : [0])) * 1.15
  const xStep = w / Math.max(1, cells.length - 1)
  const segments: string[] = []
  let cur: string[] = []
  vals.forEach((v, i) => {
    if (v === null) {
      if (cur.length > 1) segments.push(cur.join(' '))
      cur = []
      return
    }
    const y = hgt - 4 - (v / max) * (hgt - 10)
    cur.push(`${(i * xStep).toFixed(2)},${y.toFixed(2)}`)
  })
  if (cur.length > 1) segments.push(cur.join(' '))
  return (
    <svg width="100%" height={hgt} viewBox={`0 0 ${w} ${hgt}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={w} y1={hgt - 4 - f * (hgt - 10)} y2={hgt - 4 - f * (hgt - 10)} stroke="#1d2330" strokeWidth="0.4" />
      ))}
      {segments.map((s, i) => (
        <polyline key={i} points={s} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

export default function HistoryTab({ data }: { data: PanelData | null }) {
  const [range, setRange] = useState<Range>(24)
  const [buckets, setBuckets] = useState<Map<string, HourBucket> | null>(null)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<string>('')

  const targets = data?.snap?.targets ?? []

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadHourBuckets(range).then((m) => {
      if (!alive) return
      setBuckets(m)
      setLoading(false)
    }).catch(() => {
      if (alive) setLoading(false)
    })
    return () => { alive = false }
  }, [range])

  // 时间轴：从旧到新的 range 个小时键
  const hourKeys = useMemo(() => {
    const now = Date.now()
    const out: string[] = []
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(now - i * 3600 * 1000)
      const p = (n: number) => String(n).padStart(2, '0')
      out.push(`${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}`)
    }
    return out
  }, [range])

  // 每目标：小时聚合数组（对齐 hourKeys）
  const perTarget = useMemo(() => {
    const out = new Map<string, (HourAgg | null)[]>()
    if (!buckets) return out
    for (const tid of new Set([...buckets.values()].flatMap((b) => Object.keys(b.byTarget)))) {
      const cells: (HourAgg | null)[] = hourKeys.map((k) => {
        const b = buckets.get(k)
        if (!b || !b.byTarget[tid]) return null
        const a = aggHour(b.byTarget[tid])
        if (!a.cnt) return null
        return { key: k, avg: a.avg, max: a.max, lossPct: a.cnt ? Math.round((a.loss / a.cnt) * 1000) / 10 : 0, cnt: a.cnt }
      })
      out.set(tid, cells)
    }
    return out
  }, [buckets, hourKeys])

  const selId = sel || [...perTarget.keys()][0] || ''
  const selCells = perTarget.get(selId) || []
  const selTarget = targets.find((t) => t.id === selId)

  // 全目标聚合表
  const tableRows = useMemo(() => {
    const rows: { tid: string; label: string; avg: number | null; p95v: number | null; max: number | null; lossPct: number; cnt: number }[] = []
    for (const t of targets) {
      const cells = perTarget.get(t.id)
      if (!cells) continue
      const recs: MinuteRec[] = []
      for (const k of hourKeys) {
        const b = buckets?.get(k)
        if (b && b.byTarget[t.id]) recs.push(...b.byTarget[t.id])
      }
      const allOk: number[] = []
      let loss = 0
      let cnt = 0
      let max = 0
      for (const r of recs) {
        if (!Array.isArray(r) || r.length < 5) continue
        cnt += r[4]
        loss += r[3]
        if (r[1] !== null && Number.isFinite(r[1])) allOk.push(r[1] / 10)
        if (Number.isFinite(r[2]) && r[2] > max) max = r[2]
      }
      if (!cnt) continue
      allOk.sort((a, b) => a - b)
      rows.push({
        tid: t.id,
        label: t.label,
        avg: allOk.length ? Math.round((allOk.reduce((a, b) => a + b, 0) / allOk.length) * 10) / 10 : null,
        p95v: allOk.length ? allOk[Math.min(allOk.length - 1, Math.ceil(allOk.length * 0.95) - 1)] : null,
        max: max || null,
        lossPct: Math.round((loss / cnt) * 1000) / 10,
        cnt,
      })
    }
    rows.sort((a, b) => (b.lossPct - a.lossPct) || ((b.avg ?? 0) - (a.avg ?? 0)))
    return rows
  }, [targets, perTarget, buckets, hourKeys])

  if (!data?.snap) {
    return <div className="ns-empty">暂无快照：后台探测服务可能未运行。</div>
  }

  return (
    <>
      <div className="ns-h-sec">
        <span className="ns-h-bar" />
        时间范围
        <span className="ns-hint">{loading ? '加载中…' : `${[...buckets?.keys() ?? []].length} 个小时桶`}</span>
      </div>
      <div className="ns-h-range">
        {([24, 72, 168] as Range[]).map((r) => (
          <button key={r} className={`ns-h-chip ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>
            {r === 24 ? '24 小时' : r === 72 ? '72 小时' : '7 天'}
          </button>
        ))}
      </div>

      {targets.length > 0 && (
        <div className="ns-h-range" style={{ flexWrap: 'wrap' }}>
          {targets.map((t) => (
            <button
              key={t.id}
              className={`ns-h-chip ${selId === t.id ? 'on' : ''}`}
              onClick={() => setSel(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="ns-h-heat">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <b style={{ fontSize: 12.5 }}>{selTarget ? selTarget.label : '（无数据）'}</b>
          <span style={{ color: '#5C6678', fontSize: 10.5 }}>逐小时：颜色=平均延迟，红=丢包</span>
        </div>
        <div className="ns-h-heat-row">
          {selCells.map((c, i) => (
            <span key={i} className="ns-h-cell" style={{ background: heatColor(c) }} title={`${c ? `${c.key} · avg ${fmtMs(c.avg)} · 丢包 ${c.lossPct}% · ${c.cnt} 次` : '无数据'}`} />
          ))}
        </div>
        <div className="ns-h-heat-l">
          <span>{range === 24 ? '每格=1小时' : `${Math.round(range / 24)}天每格=1小时`}</span>
          <span>优&lt;150ms · 良&lt;400ms · 缓&lt;800ms · 劣≥800ms</span>
        </div>
      </div>

      <div className="ns-h-chart">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <b style={{ fontSize: 12.5 }}>平均延迟走势</b>
          <span style={{ color: '#5C6678', fontSize: 10.5 }}>{selTarget ? `${selTarget.host}:${selTarget.port}` : ''}</span>
          <span style={{ color: '#5C6678', fontSize: 10.5, marginLeft: 'auto' }}>
            峰值 {fmtMs(Math.max(0, ...selCells.map((c) => (c && c.max) || 0)))}
          </span>
        </div>
        <Chart cells={selCells} color={msColor(selCells.length ? selCells[selCells.length - 1]?.avg ?? null : null)} />
      </div>

      <div className="ns-h-table">
        <div className="ns-h-tr n">
          <span className="ns-h-c1">目标</span>
          <span className="ns-h-c">均值</span>
          <span className="ns-h-c">P95</span>
          <span className="ns-h-c">峰值</span>
          <span className="ns-h-c">丢包</span>
        </div>
        {tableRows.length === 0 && <div className="ns-empty" style={{ padding: 18 }}>{loading ? '加载中…' : '该范围内暂无探测数据（服务刚启动或已清空）'}</div>}
        {tableRows.map((r) => (
          <div key={r.tid} className="ns-h-tr">
            <span className="ns-h-c1">{r.label}</span>
            <span className="ns-h-c" style={{ color: msColor(r.avg) }}>{fmtMs(r.avg)}</span>
            <span className="ns-h-c">{fmtMs(r.p95v)}</span>
            <span className="ns-h-c">{fmtMs(r.max)}</span>
            <span className="ns-h-c" style={{ color: r.lossPct > 0 ? '#F85149' : '#3FB950' }}>{r.lossPct}%</span>
          </div>
        ))}
      </div>
    </>
  )
}
