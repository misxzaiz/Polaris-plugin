/**
 * StatsTab.tsx —— 运行中容器资源快照：2.5s 轮询单帧 stats（Engine 无历史，如实标注）
 */
import { useCallback, useEffect, useState } from 'react'
import { api, ServiceError, StatsSnap } from '../model'

function pct(n: number | null): string { return n == null ? '—' : `${n}%` }
function bar(n: number | null): number { return n == null ? 0 : Math.max(0, Math.min(100, n)) }

export default function StatsTab({ engineOk }: { engineOk: boolean }) {
  const [items, setItems] = useState<StatsSnap[]>([])
  const [err, setErr] = useState('')
  const [auto, setAuto] = useState(true)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!engineOk) return
    setLoading(true)
    try {
      const r = await api.statsAll()
      setItems(r.items || [])
      setErr('')
    } catch (e) {
      setErr((e as ServiceError).message || String(e))
    } finally {
      setLoading(false)
    }
  }, [engineOk])

  useEffect(() => {
    load()
    if (!auto) return () => undefined
    const t = setInterval(load, 2500)
    return () => clearInterval(t)
  }, [load, auto])

  if (!engineOk) return <div className="dk-pad dk-dim">Docker 引擎未连接。</div>

  return (
    <div className="dk-pad">
      <div className="dk-row">
        <span className="dk-dim dk-small">单帧快照（Engine 不提供历史曲线）；刚启动的容器 CPU 可能短暂显示 0%。</span>
        <span className="dk-grow" />
        <label className="dk-dim dk-small" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />2.5s 自动刷新
        </label>
        <button type="button" className="dk-btn dk-btn-sm" onClick={load}>{loading ? '刷新中…' : '刷新'}</button>
      </div>
      {err && <div className="dk-err dk-mt8">{err}</div>}
      {!err && items.length === 0 && <div className="dk-dim dk-mt8">没有运行中的容器。</div>}
      {items.length > 0 && (
        <table className="dk-table dk-mt8">
          <thead>
            <tr><th>容器</th><th style={{ width: 260 }}>CPU</th><th style={{ width: 300 }}>内存</th><th>网络 I/O</th><th>块 I/O</th></tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td className="dk-mono">{s.name}</td>
                <td>
                  <div className="dk-row"><span style={{ width: 48 }}>{s.cpuPct}%</span></div>
                  <div style={{ height: 4, background: '#1b2230', borderRadius: 2, marginTop: 3 }}>
                    <div style={{ height: 4, borderRadius: 2, width: `${bar(s.cpuPct)}%`, background: s.cpuPct > 80 ? '#f85149' : '#2f81f7' }} />
                  </div>
                </td>
                <td>
                  <div className="dk-row dk-small"><span>{fmtMB(s.memUsed)} / {fmtMB(s.memLimit)}</span><span className="dk-dim">{pct(s.memPct)}</span></div>
                  <div style={{ height: 4, background: '#1b2230', borderRadius: 2, marginTop: 3 }}>
                    <div style={{ height: 4, borderRadius: 2, width: `${bar(s.memPct)}%`, background: (s.memPct || 0) > 90 ? '#f85149' : '#3fb950' }} />
                  </div>
                </td>
                <td className="dk-small dk-dim">↑ {fmtMB(s.netTx)} · ↓ {fmtMB(s.netRx)}</td>
                <td className="dk-small dk-dim">读 {fmtMB(s.blkRead)} · 写 {fmtMB(s.blkWrite)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function fmtMB(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
