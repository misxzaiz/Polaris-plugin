/**
 * 对比 Tab：基准=当前打开 HAR，对比第二份 → 新增/消失/变慢/变快/状态翻转
 * 报告读 har.diff 投影（服务侧已脱敏 URL）。
 */
import { useState } from 'react'
import { sendCommand, fmtMs, fmtBytes, statusColor, type PanelData, type DiffRow } from '../model'

type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

const SECTIONS: Array<{ id: 'slower' | 'faster' | 'flips' | 'added' | 'removed'; label: string }> = [
  { id: 'slower', label: '变慢' },
  { id: 'faster', label: '变快' },
  { id: 'flips', label: '状态翻转' },
  { id: 'added', label: '新增' },
  { id: 'removed', label: '消失' },
]

export default function CompareTab({ data, running, reload, showToast }: {
  data: PanelData
  running: boolean
  reload: () => Promise<PanelData>
  showToast: Toast
}) {
  const [pathInput, setPathInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [section, setSection] = useState<'slower' | 'faster' | 'flips' | 'added' | 'removed'>('slower')
  const diff = data.diff
  const hasHar = !!(data.meta?.activePath || data.report)

  const run = async () => {
    const p = pathInput.trim()
    if (!p) { showToast('请填写对比 HAR 文件路径', 'bad'); return }
    setBusy(true)
    const r = await sendCommand('compare', { path: p }, 90000)
    setBusy(false)
    if (!r.ok) { showToast(`对比失败：${r.error || '未知'}`, 'bad'); return }
    showToast('对比完成', 'good')
    await reload()
  }

  const s = diff?.summary
  const rows: DiffRow[] = diff ? (diff[section] || []) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!hasHar && <div style={{ padding: 14, borderRadius: 8, border: '1px dashed #3f3f46', fontSize: 12, color: '#71717a' }}>先到「分析」页打开基准 HAR（通常是优化前/发布前的那份）。</div>}

      {hasHar && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void run() }}
            placeholder="对比 .har 文件路径（优化后/发布后）"
            disabled={!running || busy}
            style={{ flex: 1, minWidth: 220, padding: '7px 10px', fontSize: 12, borderRadius: 8, border: '1px solid #3f3f46', background: '#18181b', color: '#e4e4e7' }}
          />
          <button
            onClick={() => void run()}
            disabled={!running || busy}
            style={{ padding: '7px 16px', fontSize: 12, borderRadius: 8, cursor: 'pointer', border: '1px solid #3b82f6', background: 'rgba(59,130,246,.2)', color: '#93c5fd', minHeight: 32 }}
          >{busy ? '对比中…' : '对比'}</button>
        </div>
      )}

      {s && diff && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
            {[
              { k: '匹配', v: `${s.matched}`, c: '#d4d4d8' },
              { k: '新增', v: `${s.added}`, c: '#79c0ff' },
              { k: '消失', v: `${s.removed}`, c: '#8b949e' },
              { k: '变慢', v: `${s.slowerCount}`, c: '#f85149' },
              { k: '变快', v: `${s.fasterCount}`, c: '#3fb950' },
              { k: '状态翻转', v: `${s.flips}`, c: '#d29922' },
              { k: '总耗时', v: `${fmtMs(s.baseTimeSum)} → ${fmtMs(s.candTimeSum)}`, c: s.candTimeSum >= s.baseTimeSum ? '#f85149' : '#3fb950' },
            ].map((c) => (
              <div key={c.k} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #3f3f46', background: 'rgba(63,63,70,.25)' }}>
                <div style={{ fontSize: 10, color: '#71717a' }}>{c.k}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.c }}>{c.v}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#52525b' }}>
            基准: {diff.basePath.split(/[\\/]/).pop()} vs 对比件: {diff.candPath.split(/[\\/]/).pop()}（URL 精确匹配优先，去 query 同路径兜底；耗时差超过 50ms 计入变慢/变快）
          </div>

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                onClick={() => setSection(sec.id)}
                style={{
                  padding: '4px 12px', fontSize: 11, borderRadius: 8, cursor: 'pointer',
                  border: '1px solid', minHeight: 26,
                  borderColor: section === sec.id ? '#3b82f6' : '#3f3f46',
                  background: section === sec.id ? 'rgba(59,130,246,.15)' : 'transparent',
                  color: section === sec.id ? '#93c5fd' : '#a1a1aa',
                }}
              >{sec.label} {(diff[sec.id] || []).length}</button>
            ))}
          </div>

          <div style={{ border: '1px solid #3f3f46', borderRadius: 8, overflow: 'hidden' }}>
            {rows.length === 0 && <div style={{ padding: 12, fontSize: 11, color: '#52525b' }}>（无记录）</div>}
            {rows.slice(0, 60).map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderBottom: '1px solid #1c1c1f', fontSize: 10 }}>
                {section === 'slower' || section === 'faster' ? (
                  <>
                    <span style={{ width: 64, color: section === 'slower' ? '#f85149' : '#3fb950', fontWeight: 700, flexShrink: 0 }}>{r.dt && r.dt > 0 ? '+' : ''}{fmtMs(r.dt || 0)}</span>
                    <span style={{ width: 90, color: '#71717a', flexShrink: 0 }}>{fmtMs(r.t1 || 0)} → {fmtMs(r.t2 || 0)}</span>
                    <span style={{ width: 26, color: statusColor(r.s1 || 0), flexShrink: 0 }}>{r.s1}</span>
                    <span style={{ width: 26, color: statusColor(r.s2 || 0), flexShrink: 0 }}>{r.s2}</span>
                  </>
                ) : section === 'flips' ? (
                  <>
                    <span style={{ width: 64, color: '#d29922', fontWeight: 700, flexShrink: 0 }}>{r.s1} → {r.s2}</span>
                    <span style={{ width: 90, color: '#71717a', flexShrink: 0 }}>{fmtMs(r.t1 || 0)} → {fmtMs(r.t2 || 0)}</span>
                  </>
                ) : (
                  <>
                    <span style={{ width: 26, color: statusColor(r.s || 0), flexShrink: 0 }}>{r.s}</span>
                    <span style={{ width: 50, color: '#71717a', flexShrink: 0 }}>{fmtMs(r.t || 0)}</span>
                    <span style={{ width: 54, color: '#71717a', flexShrink: 0 }}>{fmtBytes(r.sz || 0)}</span>
                  </>
                )}
                <span style={{ flex: 1, color: '#d4d4d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.u}>{r.m} {r.u}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
