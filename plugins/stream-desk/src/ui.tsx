/**
 * ui.tsx —— 面板共享组件与样式（全部 scoping 在 .streamdesk-* 下，勿污染宿主）
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Frame } from './model'
import { b64ToHex, prettyJson } from './model'
import { wsCloseCodeName, formatBytes } from '../shared/core'

// ── 样式（一次注入，scoped）─────────────────────────────────────────────────
const STYLE = `
.streamdesk-panel { font-size: 12px; color: #E4E4E7; background: #17171B; height: 100%;
  display: flex; flex-direction: column; font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; }
.streamdesk-panel * { box-sizing: border-box; }
.streamdesk-panel input, .streamdesk-panel textarea, .streamdesk-panel select, .streamdesk-panel button {
  font-family: inherit; font-size: 12px; color: #E4E4E7; background: #232329; border: 1px solid #3F3F46;
  border-radius: 6px; padding: 5px 8px; outline: none; }
.streamdesk-panel input:focus, .streamdesk-panel textarea:focus, .streamdesk-panel select:focus { border-color: #3B82F6; }
.streamdesk-panel button { cursor: pointer; background: #2A2A31; }
.streamdesk-panel button:hover { background: #33333B; }
.streamdesk-panel button:disabled { opacity: .45; cursor: not-allowed; }
.streamdesk-panel button.primary { background: #2563EB; border-color: #2563EB; color: #fff; }
.streamdesk-panel button.primary:hover { background: #1D4ED8; }
.streamdesk-panel button.danger { background: #7F1D1D; border-color: #991B1B; color: #FECACA; }
.streamdesk-panel button.small { padding: 2px 8px; border-radius: 4px; }
.streamdesk-panel textarea { font-family: ui-monospace, Consolas, monospace; }
.streamdesk-panel code, .streamdesk-panel pre, .streamdesk-panel .mono { font-family: ui-monospace, Consolas, monospace; }
.sd-tabs { display: flex; gap: 2px; padding: 8px 10px 0; border-bottom: 1px solid #2A2A31; }
.sd-tab { padding: 6px 14px; border: none; border-radius: 6px 6px 0 0; background: transparent; color: #9CA3AF; }
.sd-tab.active { background: #232329; color: #fff; }
.sd-statusbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #1D1D22; border-bottom: 1px solid #2A2A31; font-size: 11px; color: #9CA3AF; }
.sd-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.sd-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10.5px; font-weight: 600; flex: none; }
.sd-card { background: #1D1D22; border: 1px solid #2A2A31; border-radius: 8px; padding: 10px 12px; }
.sd-row { display: flex; align-items: center; gap: 6px; }
.sd-grow { flex: 1; min-width: 0; }
.sd-label { font-size: 11px; color: #9CA3AF; margin-bottom: 3px; display: block; }
.sd-frames { flex: 1; overflow-y: auto; border: 1px solid #2A2A31; border-radius: 8px; background: #1A1A1F; }
.sd-frame { padding: 4px 10px; border-bottom: 1px solid #202027; cursor: pointer; display: flex; gap: 8px; align-items: baseline; min-width: 0; }
.sd-frame:hover { background: #202028; }
.sd-frame.sel { background: #232B3D; }
.sd-frame .sd-seq { color: #6B7280; font-size: 10px; width: 34px; flex: none; text-align: right; }
.sd-frame .sd-gap { color: #6B7280; font-size: 10px; flex: none; width: 64px; }
.sd-frame .sd-size { color: #6B7280; font-size: 10px; flex: none; }
.sd-frame .sd-body { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; }
.sd-detail { background: #141418; border-top: 1px solid #2A2A31; padding: 8px 12px; max-height: 260px; overflow: auto; }
.sd-detail pre { margin: 4px 0; white-space: pre-wrap; word-break: break-all; font-size: 11.5px; line-height: 1.5; }
.sd-chip { background: #232329; border: 1px solid #2A2A31; border-radius: 6px; padding: 4px 10px; font-size: 11px; }
.sd-chip b { color: #fff; font-weight: 600; }
.sd-err { color: #F87171; }
.sd-warn { color: #FBBF24; }
.sd-ok { color: #34D399; }
.sd-muted { color: #6B7280; }
.sd-hint { font-size: 11px; color: #9CA3AF; line-height: 1.6; }
.sd-list-row { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 1px solid #202027; cursor: pointer; }
.sd-list-row:hover { background: #202028; }
.sd-list-row.sel { background: #232B3D; }
.sd-scroll { overflow-y: auto; }
`

export function PanelStyle(): JSX.Element {
  return <style>{STYLE}</style>
}

// ── 状态徽章 ────────────────────────────────────────────────────────────────
export function stateMeta(state: string): { label: string; color: string } {
  switch (state) {
    case 'open': return { label: '已连接', color: '#34D399' }
    case 'capturing': return { label: '抓取中', color: '#34D399' }
    case 'connecting': return { label: '连接中', color: '#60A5FA' }
    case 'closed': return { label: '已结束', color: '#9CA3AF' }
    case 'stopped': return { label: '已停止', color: '#9CA3AF' }
    case 'interrupted': return { label: '已中断', color: '#FBBF24' }
    case 'error': return { label: '错误', color: '#F87171' }
    default: return { label: state, color: '#9CA3AF' }
  }
}

export function StateBadge({ state }: { state: string }): JSX.Element {
  const m = stateMeta(state)
  return <span className="sd-badge" style={{ background: `${m.color}22`, color: m.color }}>{m.label}</span>
}

// ── 键值编辑器（请求头）─────────────────────────────────────────────────────
export interface KvRow { k: string; v: string }

export function KvEditor({ rows, onChange, keyPlaceholder, valPlaceholder }: {
  rows: KvRow[]
  onChange: (rows: KvRow[]) => void
  keyPlaceholder?: string
  valPlaceholder?: string
}): JSX.Element {
  const update = (i: number, patch: Partial<KvRow>) => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r))
    onChange(next)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map((r, i) => (
        <div key={i} className="sd-row">
          <input className="sd-grow" style={{ maxWidth: '38%' }} value={r.k} placeholder={keyPlaceholder || 'Header'}
            onChange={(e) => update(i, { k: e.target.value })} />
          <input className="sd-grow" value={r.v} placeholder={valPlaceholder || 'value'}
            onChange={(e) => update(i, { v: e.target.value })} />
          <button className="small" title="删除此头" onClick={() => onChange(rows.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div>
        <button className="small" onClick={() => onChange([...rows, { k: '', v: '' }])}>+ 添加</button>
      </div>
    </div>
  )
}

export function kvRowsToObj(rows: KvRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) {
    const k = r.k.trim()
    if (k) out[k] = r.v
  }
  return out
}

export function objToKvRows(obj: Record<string, string> | undefined): KvRow[] {
  return Object.entries(obj || {}).map(([k, v]) => ({ k, v }))
}

// ── 帧时间线 ────────────────────────────────────────────────────────────────
const KIND_LABEL: Record<string, string> = {
  text: '文本', binary: '二进制', event: '事件', chunk: '分块', ping: 'PING', pong: 'PONG',
  open: '打开', close: '关闭', error: '错误', status: '状态', note: '备注',
}

function frameColor(f: Frame): string {
  if (f.kind === 'error') return '#F87171'
  if (f.kind === 'close') return '#FBBF24'
  if (f.dir === 'out') return '#93C5FD'
  if (f.dir === 'in') return '#E4E4E7'
  return '#A1A1AA'
}

function framePreview(f: Frame): string {
  if (f.text) return f.text.replace(/\n+/g, ' ⏎ ')
  if (f.b64) return `[二进制 ${f.size ?? '?'}B]`
  return f.message || ''
}

export function FrameList({ frames, emptyHint }: { frames: Frame[]; emptyHint?: string }): JSX.Element {
  const [sel, setSel] = useState<number | null>(null)
  const [dirFilter, setDirFilter] = useState<'all' | 'in' | 'out'>('all')
  const [search, setSearch] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const boxRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => frames.filter((f) => {
    if (dirFilter !== 'all' && f.dir !== dirFilter) return false
    if (search) {
      const hay = `${f.text || ''} ${f.message || ''} ${f.event || ''} ${f.b64 || ''}`.toLowerCase()
      if (!hay.includes(search.toLowerCase())) return false
    }
    return true
  }), [frames, dirFilter, search])

  useEffect(() => {
    if (autoScroll && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [filtered.length, autoScroll])

  const selFrame = filtered.find((f) => f.seq === sel) || null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 6 }}>
      <div className="sd-row">
        <select value={dirFilter} onChange={(e) => setDirFilter(e.target.value as any)} style={{ width: 92 }}>
          <option value="all">全部方向</option>
          <option value="in">← 收</option>
          <option value="out">→ 发</option>
        </select>
        <input className="sd-grow" placeholder="搜索帧内容…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="sd-hint sd-row" style={{ gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} style={{ padding: 0 }} />
          自动滚动
        </label>
        <span className="sd-muted" style={{ fontSize: 11 }}>{filtered.length}/{frames.length} 帧</span>
      </div>
      <div className="sd-frames sd-scroll" ref={boxRef}>
        {filtered.length === 0 && <div className="sd-hint" style={{ padding: 14 }}>{emptyHint || '暂无帧'}</div>}
        {filtered.map((f) => (
          <React.Fragment key={f.seq}>
            <div className={`sd-frame ${sel === f.seq ? 'sel' : ''}`} onClick={() => setSel(sel === f.seq ? null : f.seq)}>
              <span className="sd-seq">#{f.seq}</span>
              <span style={{ color: frameColor(f), flex: 'none', width: 14, textAlign: 'center' }}>
                {f.dir === 'out' ? '→' : f.dir === 'in' ? '←' : '·'}
              </span>
              <span className="sd-badge" style={{ background: `${frameColor(f)}18`, color: frameColor(f) }}>
                {KIND_LABEL[f.kind] || f.kind}
              </span>
              <span className="sd-gap">+{f.gapMs}ms</span>
              {f.size != null && <span className="sd-size">{formatBytes(f.size)}</span>}
              <span className="sd-body" style={{ color: frameColor(f) }}>
                {f.truncated ? '⋯' : ''}{framePreview(f)}
              </span>
            </div>
            {sel === f.seq && <FrameDetail frame={f} />}
          </React.Fragment>
        ))}
      </div>
      {selFrame && <div className="sd-hint sd-muted">帧 #{selFrame.seq} 详情已展开（再次点击收起）</div>}
    </div>
  )
}

function FrameDetail({ frame }: { frame: Frame }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const pretty = frame.text ? prettyJson(frame.text) : null
  const copy = () => {
    const raw = frame.text || frame.b64 || frame.message || ''
    navigator.clipboard?.writeText(raw).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) }).catch(() => {})
  }
  const meta: Array<[string, string]> = []
  if (frame.httpStatus != null) meta.push(['HTTP 状态', String(frame.httpStatus)])
  if (frame.event) meta.push(['event', frame.event])
  if (frame.id) meta.push(['id', frame.id])
  if (frame.rttMs != null) meta.push(['RTT', `${frame.rttMs}ms`])
  if (frame.code != null) meta.push(['关闭码', `${frame.code}（${wsCloseCodeName(frame.code)}）`])
  if (frame.reason) meta.push(['原因', frame.reason])
  if (frame.latencyMs != null) meta.push(['延迟', `${frame.latencyMs}ms`])
  if (frame.truncated) meta.push(['截断', '内容超长，仅展示前段'])
  return (
    <div className="sd-detail">
      <div className="sd-row" style={{ marginBottom: 4 }}>
        <span className="sd-badge" style={{ background: `${frameColor(frame)}18`, color: frameColor(frame) }}>
          {KIND_LABEL[frame.kind] || frame.kind} #{frame.seq}
        </span>
        <button className="small" onClick={copy}>{copied ? '已复制 ✓' : '复制原文'}</button>
      </div>
      {meta.length > 0 && (
        <div className="sd-hint" style={{ marginBottom: 4 }}>
          {meta.map(([k, v]) => <div key={k}><span className="sd-muted">{k}：</span>{v}</div>)}
        </div>
      )}
      {frame.text && <pre style={{ color: pretty ? '#A5D6FF' : '#E4E4E7' }}>{pretty || frame.text}</pre>}
      {frame.b64 && (
        <>
          <div className="sd-hint sd-muted">HEX 预览（前 512 字节）：</div>
          <pre className="sd-muted" style={{ wordBreak: 'break-all' }}>{b64ToHex(frame.b64)}</pre>
        </>
      )}
      {!frame.text && !frame.b64 && frame.message && <pre>{frame.message}</pre>}
    </div>
  )
}

// ── 统计芯片条 ──────────────────────────────────────────────────────────────
export function StatChips({ items }: { items: Array<{ label: string; value: string; tone?: 'ok' | 'warn' | 'err' | 'muted' }> }): JSX.Element {
  const toneColor = (t?: string) => (t === 'ok' ? '#34D399' : t === 'warn' ? '#FBBF24' : t === 'err' ? '#F87171' : t === 'muted' ? '#9CA3AF' : '#E4E4E7')
  return (
    <div className="sd-row" style={{ flexWrap: 'wrap', gap: 6 }}>
      {items.map((it) => (
        <span key={it.label} className="sd-chip">
          <span className="sd-muted">{it.label} </span>
          <b style={{ color: toneColor(it.tone) }}>{it.value}</b>
        </span>
      ))}
    </div>
  )
}

export function timeStr(ts: number | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
