/**
 * ui.tsx —— 面板共享组件与样式（全部 scoping 在 .depprobe-* 下，勿污染宿主）
 */
import React, { useState } from 'react'
import type { Finding, Sev } from './model'

// ── 样式（一次注入，scoped）─────────────────────────────────────────────────
const STYLE = `
.depprobe-panel { font-size: 12px; color: #E4E4E7; background: #17171B; height: 100%;
  display: flex; flex-direction: column; font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; }
.depprobe-panel * { box-sizing: border-box; }
.depprobe-panel input, .depprobe-panel textarea, .depprobe-panel select, .depprobe-panel button {
  font-family: inherit; font-size: 12px; color: #E4E4E7; background: #232329; border: 1px solid #3F3F46;
  border-radius: 6px; padding: 5px 8px; outline: none; }
.depprobe-panel input:focus, .depprobe-panel textarea:focus, .depprobe-panel select:focus { border-color: #3B82F6; }
.depprobe-panel button { cursor: pointer; background: #2A2A31; }
.depprobe-panel button:hover { background: #33333B; }
.depprobe-panel button:disabled { opacity: .45; cursor: not-allowed; }
.depprobe-panel button.primary { background: #2563EB; border-color: #2563EB; color: #fff; }
.depprobe-panel button.primary:hover { background: #1D4ED8; }
.depprobe-panel button.danger { background: #7F1D1D; border-color: #991B1B; color: #FECACA; }
.depprobe-panel button.small { padding: 2px 8px; border-radius: 4px; }
.depprobe-panel textarea { font-family: ui-monospace, Consolas, monospace; }
.depprobe-panel code, .depprobe-panel pre, .depprobe-panel .mono { font-family: ui-monospace, Consolas, monospace; }
.dp-tabs { display: flex; gap: 2px; padding: 8px 10px 0; border-bottom: 1px solid #2A2A31; }
.dp-tab { padding: 6px 14px; border: none; border-radius: 6px 6px 0 0; background: transparent; color: #9CA3AF; }
.dp-tab.active { background: #232329; color: #fff; }
.dp-statusbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #1D1D22; border-bottom: 1px solid #2A2A31; font-size: 11px; color: #9CA3AF; }
.dp-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.dp-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10.5px; font-weight: 600; flex: none; }
.dp-card { background: #1D1D22; border: 1px solid #2A2A31; border-radius: 8px; padding: 10px 12px; }
.dp-row { display: flex; align-items: center; gap: 6px; }
.dp-grow { flex: 1; min-width: 0; }
.dp-label { font-size: 11px; color: #9CA3AF; margin-bottom: 3px; display: block; }
.dp-scroll { overflow-y: auto; }
.dp-chip { background: #232329; border: 1px solid #2A2A31; border-radius: 6px; padding: 4px 10px; font-size: 11px; }
.dp-chip b { color: #fff; font-weight: 600; }
.dp-err { color: #F87171; }
.dp-warn { color: #FBBF24; }
.dp-ok { color: #34D399; }
.dp-muted { color: #6B7280; }
.dp-hint { font-size: 11px; color: #9CA3AF; line-height: 1.6; }
.dp-find { padding: 5px 10px; border-bottom: 1px solid #202027; cursor: pointer; display: flex; gap: 8px; align-items: baseline; min-width: 0; }
.dp-find:hover { background: #202028; }
.dp-find.sel { background: #2A2230; }
.dp-find .dp-pkg { flex: none; min-width: 130px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; }
.dp-find .dp-id { color: #93C5FD; font-family: ui-monospace, Consolas, monospace; font-size: 11px; flex: none; }
.dp-find .dp-sum { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #A1A1AA; font-size: 11.5px; }
.dp-detail { background: #141418; border-top: 1px solid #2A2A31; padding: 8px 12px; max-height: 240px; overflow: auto; }
.dp-detail pre { margin: 4px 0; white-space: pre-wrap; word-break: break-all; font-size: 11.5px; line-height: 1.5; }
`

export function PanelStyle(): JSX.Element {
  return <style>{STYLE}</style>
}

// ── 严重度 ──────────────────────────────────────────────────────────────────
export const SEV_LABEL: Record<Sev, string> = {
  critical: '严重', high: '高', medium: '中', low: '低', unknown: '未分级',
}

export function sevColor(s: Sev): string {
  switch (s) {
    case 'critical': return '#F87171'
    case 'high': return '#FB923C'
    case 'medium': return '#FBBF24'
    case 'low': return '#60A5FA'
    default: return '#9CA3AF'
  }
}

export function SevBadge({ sev }: { sev: Sev }): JSX.Element {
  const c = sevColor(sev)
  return <span className="dp-badge" style={{ background: `${c}22`, color: c }}>{SEV_LABEL[sev] || sev}</span>
}

export function SevDot({ sev }: { sev: Sev }): JSX.Element {
  return <span className="dp-dot" style={{ background: sevColor(sev) }} />
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

// ── 统计芯片条 ──────────────────────────────────────────────────────────────
export function StatChips({ items }: { items: Array<{ label: string; value: string; tone?: 'ok' | 'warn' | 'err' | 'muted' }> }): JSX.Element {
  const toneColor = (t?: string) => (t === 'ok' ? '#34D399' : t === 'warn' ? '#FBBF24' : t === 'err' ? '#F87171' : t === 'muted' ? '#9CA3AF' : '#E4E4E7')
  return (
    <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
      {items.map((it) => (
        <span key={it.label} className="dp-chip">
          <span className="dp-muted">{it.label} </span>
          <b style={{ color: toneColor(it.tone) }}>{it.value}</b>
        </span>
      ))}
    </div>
  )
}

// ── 发现明细行 ──────────────────────────────────────────────────────────────
export function FindingList({ findings, emptyHint, onIgnore }: {
  findings: Finding[]
  emptyHint?: string
  onIgnore?: (f: Finding) => void
}): JSX.Element {
  const [sel, setSel] = useState<string | null>(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {findings.length === 0 && <div className="dp-hint" style={{ padding: 14 }}>{emptyHint || '（无发现）'}</div>}
      {findings.map((f) => {
        const key = `${f.pkg}@${f.version}|${f.vulnId}`
        return (
          <React.Fragment key={key}>
            <div className={`dp-find ${sel === key ? 'sel' : ''}`} onClick={() => setSel(sel === key ? null : key)}>
              <SevBadge sev={f.severity} />
              <span className="dp-pkg" title={`${f.pkg}@${f.version}`}>{f.pkg}<span className="dp-muted">@{f.version}</span></span>
              <span className="dp-id">{f.vulnId}</span>
              <span className="dp-sum">{f.summary || (f.detailOk ? '' : '（详情获取失败）')}</span>
              {f.fixed.length > 0 && <span className="dp-ok" style={{ flex: 'none', fontSize: 11 }}>→ {f.fixed[0]}</span>}
            </div>
            {sel === key && <FindingDetail f={f} onIgnore={onIgnore} />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function FindingDetail({ f, onIgnore }: { f: Finding; onIgnore?: (f: Finding) => void }): JSX.Element {
  return (
    <div className="dp-detail">
      <div className="dp-row" style={{ marginBottom: 4 }}>
        <span className="dp-badge" style={{ background: `${sevColor(f.severity)}18`, color: sevColor(f.severity) }}>{f.vulnId}</span>
        {f.url && <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#93C5FD', fontSize: 11 }}>公告页 ↗</a>}
        {onIgnore && <button className="small" style={{ marginLeft: 'auto' }} onClick={(e) => { e.stopPropagation(); onIgnore(f) }}>忽略此包此漏洞…</button>}
      </div>
      <div className="dp-hint" style={{ marginBottom: 4 }}>
        <div><span className="dp-muted">包：</span><span className="mono">{f.pkg}@{f.version}</span>（{f.ecosystem}）</div>
        <div><span className="dp-muted">来源：</span><span className="mono">{f.file}</span></div>
        {f.aliases.length > 0 && <div><span className="dp-muted">别名：</span>{f.aliases.join(', ')}</div>}
        <div><span className="dp-muted">修复版本：</span>{f.fixed.length ? <span className="dp-ok mono">{f.fixed.join(' / ')}</span> : <span className="dp-warn">官方未提供 fixed 版本</span>}</div>
        {!f.detailOk && <div className="dp-warn">详情获取失败（严重度按未分级计）</div>}
      </div>
      {f.summary && <pre>{f.summary}</pre>}
    </div>
  )
}
