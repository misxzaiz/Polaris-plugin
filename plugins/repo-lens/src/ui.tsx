/**
 * ui.tsx —— 面板共享组件与样式（全部 scoping 在 .rl-* 下，勿污染宿主）
 */
import React from 'react'

// ── 样式（一次注入，scoped）─────────────────────────────────────────────────
const STYLE = `
.rl-panel { font-size: 12px; color: #E4E4E7; background: #17171B; height: 100%;
  display: flex; flex-direction: column; font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; }
.rl-panel * { box-sizing: border-box; }
.rl-panel input, .rl-panel textarea, .rl-panel select, .rl-panel button {
  font-family: inherit; font-size: 12px; color: #E4E4E7; background: #232329; border: 1px solid #3F3F46;
  border-radius: 6px; padding: 5px 8px; outline: none; }
.rl-panel input:focus, .rl-panel textarea:focus, .rl-panel select:focus { border-color: #3B82F6; }
.rl-panel button { cursor: pointer; background: #2A2A31; }
.rl-panel button:hover { background: #33333B; }
.rl-panel button:disabled { opacity: .45; cursor: not-allowed; }
.rl-panel button.primary { background: #2563EB; border-color: #2563EB; color: #fff; }
.rl-panel button.primary:hover { background: #1D4ED8; }
.rl-panel button.small { padding: 2px 8px; border-radius: 4px; }
.rl-panel code, .rl-panel pre, .rl-panel .mono { font-family: ui-monospace, Consolas, monospace; }
.rl-tabs { display: flex; gap: 2px; padding: 8px 10px 0; border-bottom: 1px solid #2A2A31; }
.rl-tab { padding: 6px 14px; border: none; border-radius: 6px 6px 0 0; background: transparent; color: #9CA3AF; }
.rl-tab.active { background: #232329; color: #fff; }
.rl-statusbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #1D1D22; border-bottom: 1px solid #2A2A31; font-size: 11px; color: #9CA3AF; }
.rl-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.rl-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10.5px; font-weight: 600; flex: none; }
.rl-card { background: #1D1D22; border: 1px solid #2A2A31; border-radius: 8px; padding: 10px 12px; }
.rl-row { display: flex; align-items: center; gap: 6px; }
.rl-grow { flex: 1; min-width: 0; }
.rl-label { font-size: 11px; color: #9CA3AF; margin-bottom: 3px; display: block; }
.rl-scroll { overflow-y: auto; }
.rl-err { color: #F87171; }
.rl-warn { color: #FBBF24; }
.rl-ok { color: #34D399; }
.rl-muted { color: #6B7280; }
.rl-hint { font-size: 11px; color: #9CA3AF; line-height: 1.6; }
.rl-path { font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rl-table { width: 100%; border-collapse: collapse; }
.rl-table th { text-align: left; font-size: 10.5px; color: #9CA3AF; font-weight: 600; padding: 4px 8px; border-bottom: 1px solid #2A2A31; position: sticky; top: 0; background: #1A1A1F; z-index: 1; }
.rl-table td { padding: 5px 8px; border-bottom: 1px solid #202027; font-size: 11.5px; vertical-align: middle; }
.rl-table tr.click { cursor: pointer; }
.rl-table tr.click:hover { background: #202028; }
.rl-table tr.sel { background: #2A2230; }
.rl-barwrap { background: #26262C; border-radius: 3px; height: 8px; min-width: 60px; overflow: hidden; }
.rl-bar { height: 100%; border-radius: 3px; }
.rl-detail { background: #141418; border-top: 1px solid #2A2A31; padding: 8px 12px; max-height: 300px; overflow: auto; }
.rl-detail pre { margin: 4px 0; white-space: pre-wrap; word-break: break-all; font-size: 11.5px; line-height: 1.5; }
.rl-section { margin-bottom: 14px; }
.rl-h3 { font-size: 12.5px; font-weight: 600; margin: 0 0 6px; color: #D4D4D8; }
.rl-spark { display: flex; align-items: flex-end; gap: 1px; height: 42px; }
.rl-spark > div { flex: 1; min-width: 2px; background: #3B82F6; border-radius: 1px 1px 0 0; }
`

export function PanelStyle(): JSX.Element {
  return <style>{STYLE}</style>
}

export function timeStr(ts: number | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function dateTimeStr(ts: number | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function dateStr(unixSec: number | null | undefined): string {
  if (!unixSec) return '—'
  const d = new Date(unixSec * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function durStr(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)}KB`
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)}MB`
  return `${(n / 1073741824).toFixed(2)}GB`
}

/** 健康分配色：≥75 绿 / ≥50 黄 / <50 红 */
export function scoreColor(s: number): string {
  if (s >= 75) return '#34D399'
  if (s >= 50) return '#FBBF24'
  return '#F87171'
}

export function hotspotColor(score: number): string {
  if (score >= 55) return '#F87171'
  if (score >= 25) return '#FBBF24'
  return '#34D399'
}

// ── 统计芯片条 ──────────────────────────────────────────────────────────────
export function StatChips({ items }: { items: Array<{ label: string; value: string; tone?: 'ok' | 'warn' | 'err' | 'muted' }> }): JSX.Element {
  const toneColor = (t?: string) => (t === 'ok' ? '#34D399' : t === 'warn' ? '#FBBF24' : t === 'err' ? '#F87171' : t === 'muted' ? '#9CA3AF' : '#E4E4E7')
  return (
    <div className="rl-row" style={{ flexWrap: 'wrap', gap: 6 }}>
      {items.map((it, i) => (
        <span key={i} className="rl-badge" style={{ background: '#232329', color: toneColor(it.tone), fontWeight: 500, padding: '3px 10px' }}>
          {it.label} <b style={{ color: '#fff' }}>{it.value}</b>
        </span>
      ))}
    </div>
  )
}

/** 水平比例条（0-100 或自定义 max） */
export function Bar({ value, max = 100, color }: { value: number; max?: number; color?: string }): JSX.Element {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="rl-barwrap">
      <div className="rl-bar" style={{ width: `${pct}%`, background: color || '#3B82F6' }} />
    </div>
  )
}

/** 健康分环形表（SVG donut） */
export function HealthRing({ total, size = 96 }: { total: number; size?: number }): JSX.Element {
  const r = size / 2 - 8
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(100, total)) / 100
  const color = scoreColor(total)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#26262C" strokeWidth={9} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={9}
        strokeDasharray={`${c * frac} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray .5s ease' }}
      />
      <text x="50%" y="47%" textAnchor="middle" fill="#fff" fontSize={size * 0.26} fontWeight="700">{total}</text>
      <text x="50%" y="66%" textAnchor="middle" fill="#9CA3AF" fontSize={size * 0.11}>健康分</text>
    </svg>
  )
}

/** 分量条目（健康分构成） */
export function PartBar({ label, value, weight }: { label: string; value: number; weight: number }): JSX.Element {
  return (
    <div>
      <div className="rl-row" style={{ justifyContent: 'space-between', fontSize: 11 }}>
        <span style={{ color: '#9CA3AF' }}>{label} <span className="rl-muted">×{weight}</span></span>
        <b style={{ color: scoreColor(value) }}>{value}</b>
      </div>
      <Bar value={value} color={scoreColor(value)} />
    </div>
  )
}
