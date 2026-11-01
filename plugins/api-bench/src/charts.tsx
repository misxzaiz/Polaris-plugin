/**
 * 内联 SVG 图表（零图表库依赖）：吞吐面积图 + 延迟折线图。
 * 数据源：压测中的每秒实时采样 / 完成后报告内采样（两者 schema 相同）。
 */
import type { BenchSample } from './model'

interface ChartProps {
  samples: BenchSample[]
  height?: number
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const n = v / base
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * base
}

function fmtAxisRps(v: number): string {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`
  if (v >= 1000) return `${Math.round(v / 100) / 10}k`
  return String(Math.round(v))
}

function fmtAxisMs(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`
  return String(Math.round(v))
}

/** 吞吐（每秒请求数）面积图 */
export function RpsChart({ samples, height = 120 }: ChartProps) {
  const W = 600
  const H = height
  const P = { l: 38, r: 6, t: 8, b: 16 }
  if (!samples.length) {
    return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}><text x={W / 2} y={H / 2} fill="#5C6678" fontSize="11" textAnchor="middle">暂无采样</text></svg>
  }
  const xs = samples.map((s) => s.t)
  const maxY = niceMax(Math.max(...samples.map((s) => s.rps), 1))
  const maxX = Math.max(...xs, 1)
  const px = (t: number) => P.l + (t / maxX) * (W - P.l - P.r)
  const py = (v: number) => H - P.b - (v / maxY) * (H - P.t - P.b)
  const pts = samples.map((s) => `${px(s.t).toFixed(1)},${py(s.rps).toFixed(1)}`).join(' ')
  const gridY = [0, maxY / 2, maxY]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {gridY.map((v, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={py(v)} y2={py(v)} stroke="#1d2330" strokeWidth="1" />
          <text x={P.l - 4} y={py(v) + 3} fill="#5C6678" fontSize="9" textAnchor="end">{fmtAxisRps(v)}</text>
        </g>
      ))}
      <polygon points={`${P.l},${py(0)} ${pts} ${px(samples[samples.length - 1].t).toFixed(1)},${py(0)}`} fill="rgba(59,130,246,0.18)" />
      <polyline points={pts} fill="none" stroke="#3B82F6" strokeWidth="1.6" />
      <text x={W - P.r} y={H - 4} fill="#5C6678" fontSize="9" textAnchor="end">{maxX.toFixed(0)}s</text>
    </svg>
  )
}

/** 延迟折线图（窗口 mean 与 p97.5 两条线，ms） */
export function LatencyChart({ samples, height = 120 }: ChartProps) {
  const W = 600
  const H = height
  const P = { l: 38, r: 6, t: 8, b: 16 }
  const withLat = samples.filter((s) => s.latMean != null || s.latP97_5 != null)
  if (!withLat.length) {
    return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}><text x={W / 2} y={H / 2} fill="#5C6678" fontSize="11" textAnchor="middle">延迟采样中…</text></svg>
  }
  const maxY = niceMax(Math.max(...withLat.map((s) => Math.max(s.latMean || 0, s.latP97_5 || 0)), 1))
  const maxX = Math.max(...withLat.map((s) => s.t), 1)
  const px = (t: number) => P.l + (t / maxX) * (W - P.l - P.r)
  const py = (v: number) => H - P.b - (v / maxY) * (H - P.t - P.b)
  const line = (key: 'latMean' | 'latP97_5', color: string, dash?: string) => {
    const pts = withLat.filter((s) => s[key] != null).map((s) => `${px(s.t).toFixed(1)},${py(s[key] as number).toFixed(1)}`).join(' ')
    if (!pts) return null
    return <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeDasharray={dash} />
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {[0, maxY / 2, maxY].map((v, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={py(v)} y2={py(v)} stroke="#1d2330" strokeWidth="1" />
          <text x={P.l - 4} y={py(v) + 3} fill="#5C6678" fontSize="9" textAnchor="end">{fmtAxisMs(v)}</text>
        </g>
      ))}
      {line('latP97_5', '#E3B341')}
      {line('latMean', '#3FB950')}
      <text x={W - P.r} y={H - 4} fill="#5C6678" fontSize="9" textAnchor="end">{maxX.toFixed(0)}s</text>
      <g>
        <line x1={P.l} y1={P.t - 2} x2={P.l + 12} y2={P.t - 2} stroke="#3FB950" strokeWidth="2" />
        <text x={P.l + 16} y={P.t + 1} fill="#8B95A7" fontSize="9">mean</text>
        <line x1={P.l + 52} y1={P.t - 2} x2={P.l + 64} y2={P.t - 2} stroke="#E3B341" strokeWidth="2" />
        <text x={P.l + 68} y={P.t + 1} fill="#8B95A7" fontSize="9">p97.5（滚动窗口）</text>
      </g>
    </svg>
  )
}
