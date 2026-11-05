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
 * 当日分时图：折线 + 昨收虚线基线 + 涨跌区域填充 + 完整坐标轴/标注。
 *
 * 维度标注（解决「看不懂是按时还是按日」）：
 *   - 横轴 = 真实交易时间：09:30 → 11:30（上午段）与 13:00 → 15:00（下午段），
 *     按真实时钟映射（体现午休 gap，不再均匀展开）
 *   - 横轴刻度：09:30 / 11:30 / 13:00 / 15:00 四个时间标签
 *   - 纵轴价格刻度：最高 / 昨收 / 最低，右侧标注数值（涨跌% 上红下绿）
 *   - 标题行：「当日分时 · MM-DD」+ 最新价 + 涨跌%
 *   - 末点高亮：当前价实心圆点
 */
export function Sparkline({ points, prevClose, color, width = 300, height = 110, date }: {
  points: MinutePoint[]
  prevClose: number | null
  color: string
  width?: number
  height?: number
  date?: string
}) {
  if (!points.length) {
    return <div style={{ color: '#5C6678', fontSize: 11, padding: '14px 0' }}>暂无分时数据</div>
  }
  // 画布尺寸：左留 4 轴距、右留价格轴 46、上留标题 18、下留时间轴 20
  const padL = 4, padR = 46, padT = 18, padB = 20
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const prices = points.map((p) => p.p)
  const lo = Math.min(...prices, prevClose ?? Infinity)
  const hi = Math.max(...prices, prevClose ?? -Infinity)
  const pad = (hi - lo) * 0.08 || hi * 0.002 || 0.01
  const yMin = lo - pad
  const yMax = hi + pad

  /** 分钟数（从 09:30 起）→ 横坐标。真实时钟映射：上午段 09:30-11:30 与下午段 13:00-15:00 各占一半绘图宽 */
  function xOfMin(minOfDay: number): number {
    const MORN = 9 * 60 + 30, LUNCH = 11 * 60 + 30, AFTER = 13 * 60, CLOSE = 15 * 60
    if (minOfDay <= LUNCH) return padL + ((minOfDay - MORN) / (LUNCH - MORN)) * (plotW / 2)
    return padL + (plotW / 2) + ((minOfDay - AFTER) / (CLOSE - AFTER)) * (plotW / 2)
  }
  /** 分钟序号 → 分钟数（数据点 t 为 'HHMM' 字符串） */
  function minOf(i: number): number {
    const t = points[i].t
    const s = String(t)
    if (/^\d{4}$/.test(s)) return parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(2, 4), 10)
    return 9 * 60 + 30 + i // 兜底：按均匀推进
  }
  const x = (i: number) => xOfMin(minOf(i))
  const y = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.p).toFixed(1)}`).join(' ')
  const area = `${path} L${x(points.length - 1).toFixed(1)},${padT + plotH} L${x(0).toFixed(1)},${padT + plotH} Z`
  const hasBase = prevClose !== null && Number.isFinite(prevClose)
  const last = points[points.length - 1]
  const lastPct = hasBase && prevClose !== null ? ((last.p - prevClose) / prevClose) * 100 : null
  const lastColor = lastPct === null ? '#8B95A7' : lastPct >= 0 ? UP_RED : DOWN_GREEN

  // 纵轴三档：最高 / 昨收 / 最低（右侧）
  const yTicks = [
    { label: '高', v: hi, sub: null },
    { label: '昨收', v: prevClose, sub: '昨收' },
    { label: '低', v: lo, sub: null },
  ].filter((t) => t.v !== null && t.v !== undefined)

  const xTicks = [
    { t: '09:30', min: 9 * 60 + 30 },
    { t: '11:30', min: 11 * 60 + 30 },
    { t: '13:00', min: 13 * 60 },
    { t: '15:00', min: 15 * 60 },
  ]

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }} preserveAspectRatio="none">
      {/* 标题行 */}
      <text x={padL} y={11} fill="#8B95A7" fontSize="9" fontWeight="600">
        {fmtDateLabel(date)} · 当日分时
      </text>
      <text x={width - padR} y={11} fill={lastColor} fontSize="9" fontWeight="700" textAnchor="end">
        {last.p.toFixed(2)}{lastPct !== null ? `  ${lastPct >= 0 ? '+' : ''}${lastPct.toFixed(2)}%` : ''}
      </text>

      {/* 昨收虚线 + 标注 */}
      {hasBase && (
        <>
          <line x1={padL} x2={width - padR} y1={y(prevClose as number)} y2={y(prevClose as number)} stroke="#5C6678" strokeWidth={0.8} strokeDasharray="4 3" />
          <text x={width - padR + 2} y={y(prevClose as number) + 3} fill="#8B95A7" fontSize="7.5" fontWeight="600">昨收</text>
        </>
      )}

      {/* 面积 + 折线 */}
      <path d={area} fill={color} fillOpacity={0.1} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />

      {/* 末点高亮 */}
      <circle cx={x(points.length - 1)} cy={y(last.p)} r={2.5} fill={lastColor} stroke="#10141C" strokeWidth={1} />

      {/* 纵轴价格刻度（右侧） */}
      {yTicks.map((t, i) => (
        <g key={'y' + i}>
          <line x1={width - padR} x2={width - padR + 3} y1={y(t.v as number)} y2={y(t.v as number)} stroke="#5C6678" strokeWidth={0.6} />
          <text x={width - padR + 5} y={y(t.v as number) + 2.6} fill="#8B95A7" fontSize="7.5">
            {(t.v as number).toFixed(2)}
          </text>
        </g>
      ))}

      {/* 横轴时间刻度 */}
      {xTicks.map((t, i) => (
        <g key={'x' + i}>
          <line x1={xOfMin(t.min)} x2={xOfMin(t.min)} y1={padT} y2={padT + plotH} stroke="#242C3A" strokeWidth={0.5} strokeDasharray="2 3" />
          <text x={xOfMin(t.min)} y={height - 6} fill="#8B95A7" fontSize="7.5" textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>{t.t}</text>
        </g>
      ))}
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

/** yyyyMMdd → 'MM-DD'；非法输入返回 ''（标题行日期标签） */
function fmtDateLabel(d: string | undefined): string {
  const s = String(d || '')
  return /^\d{8}$/.test(s) ? `${s.slice(4, 6)}-${s.slice(6, 8)}` : ''
}
