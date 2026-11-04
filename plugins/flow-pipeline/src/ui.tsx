/**
 * ui.tsx —— 共享小部件与作用域样式（自动化流水线面板）
 * 样式全部收敛在 .flowpipe-panel 作用域内，禁止 :root/body 级注入（house 纪律）。
 */
import React from 'react'

export function PanelStyle(): JSX.Element {
  return (
    <style>{`
.flowpipe-panel { display:flex; flex-direction:column; height:100%; background:#16181B; color:#E5E7EB; font-size:13px; }
.flowpipe-panel * { box-sizing:border-box; }
.flowpipe-panel button { background:#2A2F36; color:#E5E7EB; border:1px solid #3A4048; border-radius:6px; padding:4px 10px; cursor:pointer; font-size:12px; }
.flowpipe-panel button:hover:not(:disabled) { background:#343B44; }
.flowpipe-panel button:disabled { opacity:.45; cursor:not-allowed; }
.flowpipe-panel button.primary { background:#2563EB; border-color:#2563EB; color:#fff; }
.flowpipe-panel button.primary:hover:not(:disabled) { background:#1D4ED8; }
.flowpipe-panel button.danger { background:#7F1D1D; border-color:#991B1B; color:#FECACA; }
.flowpipe-panel button.small { padding:2px 7px; font-size:11px; }
.flowpipe-panel input, .flowpipe-panel select, .flowpipe-panel textarea {
  background:#1D2126; color:#E5E7EB; border:1px solid #3A4048; border-radius:6px; padding:4px 8px; font-size:12px; width:100%;
}
.flowpipe-panel textarea { font-family:Consolas,Monaco,monospace; resize:vertical; }
.flowpipe-panel input:focus, .flowpipe-panel select:focus, .flowpipe-panel textarea:focus { outline:none; border-color:#3B82F6; }
.flowpipe-panel .fp-header { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid #2A2F36; }
.flowpipe-panel .fp-title { font-weight:600; font-size:14px; flex:1; }
.flowpipe-panel .fp-dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
.flowpipe-panel .fp-body { flex:1; display:flex; min-height:0; }
.flowpipe-panel .fp-side { width:250px; min-width:250px; border-right:1px solid #2A2F36; display:flex; flex-direction:column; }
.flowpipe-panel .fp-side-list { flex:1; overflow:auto; padding:6px; }
.flowpipe-panel .fp-pl-item { padding:7px 9px; border-radius:6px; cursor:pointer; margin-bottom:2px; border:1px solid transparent; }
.flowpipe-panel .fp-pl-item:hover { background:#20242A; }
.flowpipe-panel .fp-pl-item.active { background:#232B36; border-color:#2F3B4C; }
.flowpipe-panel .fp-pl-name { font-weight:500; display:flex; align-items:center; gap:6px; }
.flowpipe-panel .fp-pl-sub { color:#8B929C; font-size:11px; margin-top:2px; display:flex; gap:6px; align-items:center; }
.flowpipe-panel .fp-chip { font-size:10px; padding:1px 6px; border-radius:8px; background:#262B33; color:#9CA3AF; }
.flowpipe-panel .fp-chip.on { background:#0F2E1D; color:#34D399; }
.flowpipe-panel .fp-chip.warn { background:#3B2A12; color:#FBBF24; }
.flowpipe-panel .fp-chip.err { background:#3B1416; color:#F87171; }
.flowpipe-panel .fp-main { flex:1; display:flex; flex-direction:column; min-width:0; }
.flowpipe-panel .fp-tabs { display:flex; gap:2px; padding:6px 10px 0; border-bottom:1px solid #2A2F36; }
.flowpipe-panel .fp-tab { padding:5px 14px; cursor:pointer; border-radius:6px 6px 0 0; color:#9CA3AF; font-size:12px; }
.flowpipe-panel .fp-tab.active { background:#1D2126; color:#E5E7EB; border:1px solid #2A2F36; border-bottom-color:#1D2126; }
.flowpipe-panel .fp-scroll { flex:1; overflow:auto; padding:12px; }
.flowpipe-panel .fp-card { background:#1D2126; border:1px solid #2A2F36; border-radius:8px; padding:10px 12px; margin-bottom:10px; }
.flowpipe-panel .fp-row { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
.flowpipe-panel .fp-field { display:flex; flex-direction:column; gap:3px; margin-bottom:8px; }
.flowpipe-panel .fp-label { font-size:11px; color:#8B929C; }
.flowpipe-panel .fp-label code { color:#93C5FD; }
.flowpipe-panel .fp-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.flowpipe-panel .fp-grid3 { display:grid; grid-template-columns:90px 1fr 1fr; gap:8px; }
.flowpipe-panel .fp-step { border:1px solid #2A2F36; border-radius:8px; background:#1B1F24; margin-bottom:8px; }
.flowpipe-panel .fp-step-head { display:flex; align-items:center; gap:8px; padding:6px 10px; background:#22262C; border-radius:8px 8px 0 0; }
.flowpipe-panel .fp-step-idx { width:20px; height:20px; border-radius:50%; background:#2F3B4C; color:#93C5FD; font-size:11px; display:flex; align-items:center; justify-content:center; flex:none; }
.flowpipe-panel .fp-step-body { padding:8px 10px; }
.flowpipe-panel .fp-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:#8B929C; padding:30px; text-align:center; }
.flowpipe-panel .fp-run-item { border:1px solid #2A2F36; border-radius:8px; padding:8px 10px; margin-bottom:6px; cursor:pointer; }
.flowpipe-panel .fp-run-item:hover { background:#20242A; }
.flowpipe-panel .fp-run-item.active { border-color:#2F3B4C; background:#232B36; }
.flowpipe-panel .fp-timeline { border-left:2px solid #2A2F36; margin-left:8px; padding-left:14px; }
.flowpipe-panel .fp-tl-item { position:relative; padding:4px 0 10px; }
.flowpipe-panel .fp-tl-item::before { content:''; position:absolute; left:-19.5px; top:9px; width:9px; height:9px; border-radius:50%; background:#4B5563; }
.flowpipe-panel .fp-tl-item.ok::before { background:#34D399; }
.flowpipe-panel .fp-tl-item.error::before { background:#F87171; }
.flowpipe-panel .fp-tl-item.skipped::before { background:#6B7280; }
.flowpipe-panel .fp-tl-item.running::before { background:#FBBF24; }
.flowpipe-panel .fp-mono { font-family:Consolas,Monaco,monospace; font-size:11px; }
.flowpipe-panel .fp-excerpt { background:#16181B; border:1px solid #2A2F36; border-radius:6px; padding:6px 8px; margin-top:4px; white-space:pre-wrap; word-break:break-all; color:#A7B0BC; }
.flowpipe-panel .fp-err { color:#F87171; }
.flowpipe-panel .fp-okc { color:#34D399; }
.flowpipe-panel .fp-muted { color:#8B929C; }
.flowpipe-panel .fp-modal-mask { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:50; }
.flowpipe-panel .fp-modal { width:520px; max-width:92%; max-height:86%; overflow:auto; background:#1D2126; border:1px solid #3A4048; border-radius:10px; padding:14px; }
.flowpipe-panel .fp-kv-row { display:grid; grid-template-columns:130px 1fr 90px 28px; gap:6px; margin-bottom:5px; align-items:center; }
.flowpipe-panel a { color:#93C5FD; }
`}</style>
  )
}

export function Dot({ color }: { color: string }): JSX.Element {
  return <span className="fp-dot" style={{ background: color }} />
}

export function statusColor(status?: string): string {
  switch (status) {
    case 'ok': return '#34D399'
    case 'running': case 'queued': return '#FBBF24'
    case 'error': return '#F87171'
    case 'stopped': return '#9CA3AF'
    default: return '#6B7280'
  }
}

export function triggerText(t?: { type?: string; everyMinutes?: number; at?: string }): string {
  if (!t) return '手动'
  switch (t.type) {
    case 'interval': return `每 ${t.everyMinutes ?? '?'} 分钟`
    case 'daily': return `每天 ${t.at ?? '??:??'}`
    case 'webhook': return 'Webhook'
    default: return '手动'
  }
}

export function durStr(ms?: number | null): string {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}

export function timeStr(iso?: string): string {
  if (!iso) return ''
  return String(iso).replace('T', ' ').slice(5, 16)
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="fp-field">
      <span className="fp-label">{label}{hint ? <span className="fp-muted"> · {hint}</span> : null}</span>
      {children}
    </div>
  )
}
