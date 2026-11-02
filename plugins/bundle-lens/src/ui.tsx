/**
 * ui.tsx —— 面板共享组件与样式（全部 scoping 在 .bl-* 下，勿污染宿主）
 */
import React from 'react'

// ── 样式（一次注入，scoped）─────────────────────────────────────────────────
const STYLE = `
.bl-panel { font-size: 12px; color: #E4E4E7; background: #17171B; height: 100%;
  display: flex; flex-direction: column; font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; }
.bl-panel * { box-sizing: border-box; }
.bl-panel input, .bl-panel textarea, .bl-panel select, .bl-panel button {
  font-family: inherit; font-size: 12px; color: #E4E4E7; background: #232329; border: 1px solid #3F3F46;
  border-radius: 6px; padding: 5px 8px; outline: none; }
.bl-panel input:focus, .bl-panel textarea:focus, .bl-panel select:focus { border-color: #3B82F6; }
.bl-panel button { cursor: pointer; background: #2A2A31; }
.bl-panel button:hover { background: #33333B; }
.bl-panel button:disabled { opacity: .45; cursor: not-allowed; }
.bl-panel button.primary { background: #2563EB; border-color: #2563EB; color: #fff; }
.bl-panel button.primary:hover { background: #1D4ED8; }
.bl-panel button.small { padding: 2px 8px; border-radius: 4px; }
.bl-panel code, .bl-panel pre, .bl-panel .mono { font-family: ui-monospace, Consolas, monospace; }
.bl-tabs { display: flex; gap: 2px; padding: 8px 10px 0; border-bottom: 1px solid #2A2A31; }
.bl-tab { padding: 6px 14px; border: none; border-radius: 6px 6px 0 0; background: transparent; color: #9CA3AF; }
.bl-tab.active { background: #232329; color: #fff; }
.bl-statusbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #1D1D22; border-bottom: 1px solid #2A2A31; font-size: 11px; color: #9CA3AF; }
.bl-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.bl-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10.5px; font-weight: 600; flex: none; }
.bl-card { background: #1D1D22; border: 1px solid #2A2A31; border-radius: 8px; padding: 10px 12px; }
.bl-row { display: flex; align-items: center; gap: 6px; }
.bl-grow { flex: 1; min-width: 0; }
.bl-label { font-size: 11px; color: #9CA3AF; margin-bottom: 3px; display: block; }
.bl-scroll { overflow-y: auto; }
.bl-err { color: #F87171; }
.bl-warn { color: #FBBF24; }
.bl-ok { color: #34D399; }
.bl-muted { color: #6B7280; }
.bl-hint { font-size: 11px; color: #9CA3AF; line-height: 1.6; }
.bl-path { font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bl-table { width: 100%; border-collapse: collapse; }
.bl-table th { text-align: left; font-size: 10.5px; color: #9CA3AF; font-weight: 600; padding: 4px 8px; border-bottom: 1px solid #2A2A31; position: sticky; top: 0; background: #1A1A1F; z-index: 1; }
.bl-table td { padding: 5px 8px; border-bottom: 1px solid #202027; font-size: 11.5px; vertical-align: middle; }
.bl-table tr.click { cursor: pointer; }
.bl-table tr.click:hover { background: #202028; }
.bl-barwrap { background: #26262C; border-radius: 3px; height: 8px; min-width: 60px; overflow: hidden; }
.bl-bar { height: 100%; border-radius: 3px; }
.bl-section { margin-bottom: 14px; }
.bl-h3 { font-size: 12.5px; font-weight: 600; margin: 0 0 6px; color: #D4D4D8; }
/* treemap */
.bl-treemap { position: relative; width: 100%; border: 1px solid #2A2A31; border-radius: 6px; overflow: hidden; background: #141418; }
.bl-tile { position: absolute; overflow: hidden; padding: 4px 6px; border: 1px solid #17171B; border-radius: 2px; cursor: default; }
.bl-tile:hover { filter: brightness(1.18); }
.bl-tile .t-name { font-size: 10.5px; font-weight: 600; color: rgba(255,255,255,.92); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bl-tile .t-size { font-size: 9.5px; color: rgba(255,255,255,.62); white-space: nowrap; }
.bl-legend { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; font-size: 10.5px; color: #9CA3AF; }
.bl-legend span { display: inline-flex; align-items: center; gap: 4px; }
.bl-legend i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
`

export function PanelStyle(): JSX.Element {
  return <style>{STYLE}</style>
}

export function dateTimeStr(ts: number | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function durStr(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}

export function fmtBytes(n: number | null | undefined): string {
  const v = n || 0
  if (v < 1024) return `${v}B`
  if (v < 1048576) return `${(v / 1024).toFixed(1)}KB`
  if (v < 1073741824) return `${(v / 1048576).toFixed(1)}MB`
  return `${(v / 1073741824).toFixed(2)}GB`
}

/** signed bytes（diff 用） */
export function fmtDelta(n: number): string {
  if (n === 0) return '±0'
  return `${n > 0 ? '+' : '-'}${fmtBytes(Math.abs(n))}`
}

export function deltaColor(n: number): string {
  if (n > 0) return '#F87171'
  if (n < 0) return '#34D399'
  return '#9CA3AF'
}

// 包配色（treemap）：按包名稳定哈希 → 色相；应用代码固定蓝；多份安装红系提醒
export function tileColor(name: string, isApp: boolean, conflicted: boolean): string {
  if (conflicted) return 'hsl(0, 62%, 38%)'
  if (isApp) return '#1D4ED8'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = 90 + (h % 180) // 90-270 绿→蓝紫，避开红
  return `hsl(${hue}, 46%, 34%)`
}

// ── 统计芯片条 ──────────────────────────────────────────────────────────────
export function StatChips({ items }: { items: Array<{ label: string; value: string; tone?: 'ok' | 'warn' | 'err' | 'muted' }> }): JSX.Element {
  const toneColor = (t?: string) => (t === 'ok' ? '#34D399' : t === 'warn' ? '#FBBF24' : t === 'err' ? '#F87171' : t === 'muted' ? '#9CA3AF' : '#E4E4E7')
  return (
    <div className="bl-row" style={{ flexWrap: 'wrap', gap: 6 }}>
      {items.map((it, i) => (
        <span key={i} className="bl-badge" style={{ background: '#232329', color: toneColor(it.tone), fontWeight: 500, padding: '3px 10px' }}>
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
    <div className="bl-barwrap">
      <div className="bl-bar" style={{ width: `${pct}%`, background: color || '#3B82F6' }} />
    </div>
  )
}
