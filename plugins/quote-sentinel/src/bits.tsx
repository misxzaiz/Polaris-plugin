/**
 * 通用小组件：涨跌色 / 涨跌徽章 / 分时 SVG 图（手绘，零依赖）
 */
import type { MinutePoint } from './model'

export const UP_RED = '#F85149'
export const DOWN_GREEN = '#3FB950'
export const FLAT = '#8B95A7'

/** 中国习惯红涨绿跌可配：redUp=true 涨红跌绿；false 反转（港美习惯） */
export function colorFor(pct: number | null | undefined, redUp: boolean): string {
  const p = Number(pct)
  if (!Number.isFinite(p) || p === 0) return FLAT
  const up = p > 0
  return up === redUp ? UP_RED : DOWN_GREEN
}

export function PctBadge({ pct, redUp, big }: { pct: number | null | undefined; redUp: boolean; big?: boolean }) {
  const p = Number(pct)
  const text = Number.isFinite(p) ? `${p > 0 ? '+' : ''}${p.toFixed(2)}%` : '—'
  return (
    <span
      style={{
        background: colorFor(p, redUp) + '22',
        color: colorFor(p, redUp),
        border: `1px solid ${colorFor(p, redUp)}55`,
        borderRadius: 6,
        padding: big ? '2px 9px' : '1px 7px',
        fontSize: big ? 12.5 : 10,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

/**
 * 当日分时图：折线 + 昨收虚线基线 + 涨跌区域填充。
 * y 轴范围包含昨收与全部价格点；x 轴按 4 小时交易分钟均匀展开。
 */
export function Sparkline({ points, prevClose, color, width = 300, height = 96 }: {
  points: MinutePoint[]
  prevClose: number | null
  color: string
  width?: number
  height?: number
}) {
  if (!points.length) {
    return <div style={{ color: '#5C6678', fontSize: 11, padding: '14px 0' }}>暂无分时数据</div>
  }
  const prices = points.map((p) => p.p)
  const lo = Math.min(...prices, prevClose ?? Infinity)
  const hi = Math.max(...prices, prevClose ?? -Infinity)
  const pad = (hi - lo) * 0.08 || hi * 0.002 || 0.01
  const yMin = lo - pad
  const yMax = hi + pad
  const x = (i: number) => (i / Math.max(points.length - 1, 1)) * (width - 8) + 4
  const y = (v: number) => height - 6 - ((v - yMin) / (yMax - yMin)) * (height - 12)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.p).toFixed(1)}`).join(' ')
  const area = `${path} L${x(points.length - 1).toFixed(1)},${height - 4} L${x(0).toFixed(1)},${height - 4} Z`
  const base = prevClose !== null && Number.isFinite(prevClose)
    ? <line x1={4} x2={width - 4} y1={y(prevClose)} y2={y(prevClose)} stroke="#5C6678" strokeWidth={1} strokeDasharray="4 3" />
    : null
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }} preserveAspectRatio="none">
      <path d={area} fill={color} fillOpacity={0.1} />
      {base}
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: '#5C6678' }}>{label}</div>
      <div style={{ fontSize: 12, color: color || '#C9D1D9', fontWeight: 600 }}>{value}</div>
    </div>
  )
}
