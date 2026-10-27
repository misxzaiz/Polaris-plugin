/**
 * 历史 Tab：快照时间线（SVG 柱状）+ 明细表 + 两次完整快照的「空间挪移」归因
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import core from '../shared/disk-core.js'
import { loadSnaps, fmtTime, type Snapshot } from './model'
import { RootSelect, type TabProps } from './Panel'

function Sparkbars({ snaps }: { snaps: Snapshot[] }) {
  // snaps 最新在前 → 图上旧左新右
  const list = [...snaps].reverse()
  if (list.length < 2) return null
  const W = 1000
  const H = 150
  const max = Math.max(...list.map((s) => s.total || 0), 1)
  const gap = 4
  const bw = Math.max(6, (W - gap * (list.length - 1)) / list.length)
  return (
    <svg viewBox={`0 0 ${W} ${H + 26}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="总量历史">
      {list.map((s, i) => {
        const h = Math.max(3, ((s.total || 0) / max) * (H - 20))
        const x = i * (bw + gap)
        const date = new Date(s.at)
        const label = `${date.getMonth() + 1}/${date.getDate()}`
        return (
          <g key={s.seq}>
            <title>{`#${s.seq} ${fmtTime(s.at)} · ${core.fmtBytes(s.total)}${s.partial ? '（不完整）' : ''}`}</title>
            <rect
              x={x} y={H - h} width={bw} height={h} rx={3}
              fill={s.partial ? 'rgba(88,166,255,0.35)' : 'url(#dr-hbar)'}
            />
            {i % Math.ceil(list.length / 8) === 0 && (
              <text x={x + bw / 2} y={H + 16} fontSize={12} fill="#5C6678" textAnchor="middle">{label}</text>
            )}
          </g>
        )
      })}
      <defs>
        <linearGradient id="dr-hbar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#BC8CFF" />
          <stop offset="100%" stopColor="#58A6FF" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function HistoryTab({ data }: TabProps) {
  const [rid, setRid] = useState('')
  const [snaps, setSnaps] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(false)
  const lastRid = useRef('')
  const roots = data?.roots || []

  const reloadSnaps = useCallback(async (rootId: string, silent = false) => {
    if (!rootId) return
    if (!silent) setLoading(true)
    try {
      setSnaps(await loadSnaps(rootId))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const effRoot = rid || roots[0]?.id || ''
    if (effRoot && effRoot !== lastRid.current) {
      lastRid.current = effRoot
      reloadSnaps(effRoot)
    }
  }, [rid, roots, reloadSnaps])

  // 两次最近完整快照的归因
  const complete = snaps.filter((s) => !s.partial)
  const [cur, prev] = complete
  const movers = cur && prev ? core.growthDiff(prev.dirs || [], cur.dirs || []).slice(0, 12) : []

  const effRoot = roots.find((r) => r.id === (rid || roots[0]?.id))

  return (
    <div>
      <div className="dr-card" style={{ marginTop: 4 }}>
        <RootSelect data={data} value={rid || roots[0]?.id || ''} onChange={(v) => { setRid(v); lastRid.current = v; reloadSnaps(v) }} />
      </div>

      {!roots.length && <div className="dr-empty">先在「总览」登记一个目录。</div>}

      {roots.length > 0 && (
        <>
          <div className="dr-sec">
            <span className="dr-bar" />总量走势
            <span className="dr-hint">{effRoot ? `${effRoot.label || effRoot.path} · ${snaps.length} 份快照` : ''}</span>
          </div>
          <div className="dr-mapwrap" style={{ padding: '10px 6px 2px' }}>
            {loading ? (
              <div className="dr-empty"><span className="dr-spin" /> 载入中…</div>
            ) : snaps.length >= 2 ? (
              <Sparkbars snaps={snaps} />
            ) : (
              <div className="dr-empty">快照还不足两份——自动快照每 {data?.settings.snapshotHours ?? 24} 小时一份，也可以现在去「总览」手动快扫一次。</div>
            )}
          </div>

          {movers.length > 0 && (
            <>
              <div className="dr-sec">
                <span className="dr-bar" />空间挪移归因
                <span className="dr-hint">{fmtTime(prev.at)} → {fmtTime(cur.at)} · 总 {core.fmtDelta(cur.total - prev.total)}</span>
              </div>
              <div className="dr-card">
                <div style={{ padding: '2px 0 6px' }}>
                  <table className="dr-tbl">
                    <thead>
                      <tr><th>目录</th><th className="dr-num">之前</th><th className="dr-num">之后</th><th className="dr-num">变化</th></tr>
                    </thead>
                    <tbody>
                      {movers.map((m) => (
                        <tr key={m.path}>
                          <td className="dr-mono">{m.path}</td>
                          <td className="dr-num" style={{ color: '#5C6678' }}>{core.fmtBytes(m.from)}</td>
                          <td className="dr-num" style={{ color: '#5C6678' }}>{core.fmtBytes(m.to)}</td>
                          <td className={`dr-num dr-delta ${m.delta > 0 ? 'up' : 'down'}`}>{core.fmtDelta(m.delta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <div className="dr-sec"><span className="dr-bar" />快照明细</div>
          <div className="dr-card">
            <div style={{ padding: '2px 0 6px' }}>
              <table className="dr-tbl">
                <thead>
                  <tr><th>时间</th><th>类型</th><th className="dr-num">总量</th><th className="dr-num">垃圾</th><th className="dr-num">耗时</th></tr>
                </thead>
                <tbody>
                  {snaps.map((s) => (
                    <tr key={s.seq}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {fmtTime(s.at)}
                        {s.partial && <span className="dr-badge-txt warn" style={{ marginLeft: 6 }}>不完整</span>}
                      </td>
                      <td>{s.deep ? '深扫' : '快扫'}{s.kind === 'auto' ? ' · 自动' : ''}</td>
                      <td className="dr-num">{core.fmtBytes(s.total)}</td>
                      <td className="dr-num">{s.junkCount || 0} 项</td>
                      <td className="dr-num" style={{ color: '#5C6678' }}>{Math.round((s.elapsedMs || 0) / 1000)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!snaps.length && <div className="dr-empty">还没有快照。</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
