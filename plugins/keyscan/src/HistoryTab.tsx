/**
 * 历史 Tab：近 20 次扫描的紧凑时间线 + 趋势（内联 SVG 迷你柱图，零依赖）。
 * 数据源 keyscan.history（服务单写者）。
 */
import { useCallback, useEffect, useState } from 'react'
import { loadPanelData, type HistoryEntry } from './model'

interface Props { onGoFindings: () => void }

export default function HistoryTab({ onGoFindings }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await loadPanelData()
      setHistory(d.history)
      setErr('')
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const maxFindings = Math.max(1, ...history.map((h) => h.findingCount ?? 0))

  return (
    <>
      <div className="ks-sec"><span className="ks-bar" />扫描历史<span className="ks-hint">最近 {history.length} 次</span></div>

      {history.length >= 2 && (
        <div className="ks-card"><div className="ks-card-b">
          <div className="ks-sub" style={{ marginBottom: 6 }}>发现数趋势（柱高=该次发现总数，红段=新增）</div>
          <TrendChart history={history.slice(0, 12).reverse()} max={maxFindings} />
        </div></div>
      )}

      {loading && <div className="ks-empty">加载中…</div>}
      {err && <div className="ks-err">{err}</div>}
      {!loading && !err && history.length === 0 && (
        <div className="ks-card"><div className="ks-empty">还没有扫描历史。<br />去「扫描」Tab 发起第一次安检。</div></div>
      )}

      {history.map((h) => {
        const c = h.counts ?? { critical: 0, high: 0, medium: 0 }
        const nw = h.new ?? { newCount: 0, newCritical: 0, newHigh: 0 }
        return (
          <div className="ks-card" style={{ margin: '0 16px 8px' }} key={h.id}>
            <div className="ks-card-b" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 11.5 }}>
                  <b>{new Date(h.at).toLocaleString()}</b>
                  {nw.newCount > 0 && <span className="ks-sev critical" style={{ marginLeft: 6 }}>新增 {nw.newCount}</span>}
                  {h.truncated && <span className="ks-tag" style={{ marginLeft: 6 }}>截断</span>}
                </div>
                <div className="ks-sub ks-mono" style={{ marginTop: 2, wordBreak: 'break-all' }}>{h.root}</div>
                <div className="ks-sub" style={{ marginTop: 2 }}>
                  {h.files ?? '?'} 文件 · {Math.round((h.durationMs ?? 0) / 1000)}s · 🔴{c.critical} 🟠{c.high} 🟡{c.medium} · 共 {h.findingCount ?? 0} 条
                </div>
              </div>
              <button className="ks-btn ghost sm" onClick={onGoFindings}>看明细</button>
            </div>
          </div>
        )
      })}
    </>
  )
}

/** 内联 SVG 迷你柱图：蓝柱=总数，红帽=新增（零依赖，house 先例） */
function TrendChart({ history, max }: { history: HistoryEntry[]; max: number }) {
  const W = 100; const H = 56; const n = history.length
  const bw = n ? (W / n) * 0.62 : 0
  return (
    <svg viewBox={`0 0 ${W} ${H + 10}`} style={{ width: '100%', display: 'block' }} preserveAspectRatio="none">
      {history.map((h, i) => {
        const total = h.findingCount ?? 0
        const fresh = h.new?.newCount ?? 0
        const base = (total / max) * H
        const freshH = Math.min(base, (fresh / max) * H)
        const x = n > 1 ? (i * W) / (n - 1) - bw / 2 : W / 2 - bw / 2
        return (
          <g key={h.id}>
            <rect x={x} y={H - base} width={bw} height={Math.max(base, 0.8)} rx={1.2} fill="#2b6cb0" />
            {fresh > 0 && base > 0 && (
              <rect x={x} y={H - base} width={bw} height={Math.max(freshH, 0.8)} rx={1.2} fill="#F85149" />
            )}
            <text x={x + bw / 2} y={H + 8} fontSize={5} fill="#5C6678" textAnchor="middle">
              {new Date(h.at).toLocaleDateString().slice(5)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
