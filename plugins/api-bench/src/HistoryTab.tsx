/**
 * 历史页：kv 报告库的列表（新→旧）→ 详情回看 + 任选两次 A/B 对比。
 * 历史与报告均读 cap.kv（跨端可看）；对比语义走 shared/bench-core（与 MCP 同源）。
 */
import { useCallback, useState } from 'react'
import { core, loadReport, type BenchReport, type HistoryEntry } from './model'
import { ReportView } from './WorkTab'

interface HistoryTabProps {
  history: HistoryEntry[]
  onRefresh: () => void
}

export default function HistoryTab({ history }: HistoryTabProps) {
  const [detailId, setDetailId] = useState<string>('')
  const [detail, setDetail] = useState<BenchReport | null>(null)
  const [pickA, setPickA] = useState<string>('')
  const [pickB, setPickB] = useState<string>('')
  const [cmpErr, setCmpErr] = useState('')

  const openDetail = useCallback(async (runId: string) => {
    setDetailId(runId)
    setDetail(null)
    const rep = await loadReport(runId)
    setDetail(rep)
  }, [])

  // 选中 A/B 后拉两份报告计算对比（对比语义走 shared/bench-core，与 MCP 同源）
  const [cmp, setCmp] = useState<{ a: BenchReport; b: BenchReport } | null>(null)
  const loadCompare = useCallback(async () => {
    if (!pickA || !pickB || pickA === pickB) { setCmp(null); return }
    const [ra, rb] = await Promise.all([loadReport(pickA), loadReport(pickB)])
    if (!ra || !rb) { setCmpErr('报告已被清理（仅保留最近 20 份完整报告）'); setCmp(null); return }
    setCmpErr('')
    setCmp({ a: ra, b: rb })
  }, [pickA, pickB])

  if (!history.length) {
    return <div className="ab-empty">还没有压测历史。到「压测」页发起第一次压测后，这里会出现每次的吞吐/延迟/错误摘要。</div>
  }

  const cmpResult = cmp ? core.compareReports(cmp.a, cmp.b) : null

  return (
    <>
      <div className="ab-sec">A/B 对比<span className="ab-hint">选两次压测：A=基准，B=改动后（吞吐升为优，延迟/错误降为优）</span></div>
      <div className="ab-card"><div className="ab-card-b">
        <div className="ab-fmrow">
          <select className="ab-sel" value={pickA} onChange={(e) => { setPickA(e.target.value); setCmp(null) }}>
            <option value="">选 A（基准）…</option>
            {history.map((h) => <option key={h.runId} value={h.runId}>{h.at.replace('T', ' ').slice(5, 16)} {h.method} {shortUrl(h.url)}（{h.rpsMean}/s）</option>)}
          </select>
          <select className="ab-sel" value={pickB} onChange={(e) => { setPickB(e.target.value); setCmp(null) }}>
            <option value="">选 B（对比）…</option>
            {history.map((h) => <option key={h.runId} value={h.runId}>{h.at.replace('T', ' ').slice(5, 16)} {h.method} {shortUrl(h.url)}（{h.rpsMean}/s）</option>)}
          </select>
          <button className="ab-btn sm" onClick={loadCompare} disabled={!pickA || !pickB || pickA === pickB}>对比</button>
        </div>
        {cmpErr && <div className="ab-err">{cmpErr}</div>}
        {cmpResult && cmp && (
          <>
            <table className="ab-tb" style={{ marginTop: 10 }}>
              <thead><tr><th>指标</th><th>A</th><th>B</th><th>Δ</th><th>更优</th></tr></thead>
              <tbody>
                {cmpResult.rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td className="ab-num">{r.a}{r.unit}</td>
                    <td className="ab-num">{r.b}{r.unit}</td>
                    <td className={`ab-num ${r.deltaPct == null ? '' : (r.better === 'b' ? 'ab-ok' : r.better === 'a' ? 'ab-bad' : '')}`}>{r.deltaPct == null ? 'n/a' : `${r.deltaPct > 0 ? '+' : ''}${r.deltaPct}%`}</td>
                    <td>{r.better === 'b' ? '✓ B' : r.better === 'a' ? '✓ A' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ab-card-b ab-sub">
              {cmpResult.bWins > cmpResult.aWins
                ? `B 总体更优（${cmpResult.bWins} 胜 ${cmpResult.aWins}，平 ${cmpResult.ties}）`
                : cmpResult.aWins > cmpResult.bWins
                  ? `A 总体更优（${cmpResult.aWins} 胜 ${cmpResult.bWins}，平 ${cmpResult.ties}）`
                  : `两者打平（${cmpResult.ties} 项持平）`}
              {'　'}A：{cmp.a.target.method} {shortUrl(cmp.a.target.url)} · B：{cmp.b.target.method} {shortUrl(cmp.b.target.url)}
            </div>
          </>
        )}
        {pickA && pickB && pickA === pickB && <div className="ab-warn" style={{ marginTop: 6 }}>A 与 B 是同一次压测——选两次不同的 run。</div>}
      </div></div>

      <div className="ab-sec">历史记录<span className="ab-hint">{history.length} 条（新→旧，完整报告保留最近 20 份）</span></div>
      <div className="ab-card">
        {history.map((h) => (
          <div key={h.runId} className="ab-row" onClick={() => openDetail(h.runId)} style={{ cursor: 'pointer' }}>
            <div className="ab-row-h">
              <span className={`ab-badge ${h.aborted ? 'warn' : 'good'}`}>{h.aborted ? '中止' : '完成'}</span>
              <span className="ab-sub">{h.at.replace('T', ' ').slice(0, 16)}</span>
              <span className="ab-mono" style={{ fontWeight: 600 }}>{h.method}</span>
              <span className="ab-mono ab-sub" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.url}</span>
            </div>
            <div className="ab-row-h ab-sub" style={{ marginTop: 3 }}>
              <span className="ab-num">{h.connections}c×{Math.round(h.durationS)}s</span>
              <span className="ab-num ab-ok">{h.rpsMean}/s</span>
              <span className="ab-num">p50 {h.p50}ms</span>
              <span className="ab-num">p97.5 {h.p97_5}ms</span>
              <span className={`ab-num ${h.errors ? 'ab-bad' : ''}`}>错误 {h.errors}</span>
              <span className={`ab-num ${h.non2xx ? 'ab-warn' : ''}`}>非2xx {h.non2xx}</span>
              {detailId === h.runId && <span className="ab-tag">详情↓</span>}
            </div>
          </div>
        ))}
      </div>

      {detailId && (
        detail
          ? <ReportView report={detail} />
          : <div className="ab-empty">加载报告中…（或报告已被清理）</div>
      )}
    </>
  )
}

function shortUrl(u: string): string {
  return String(u || '').replace(/^https?:\/\//, '').slice(0, 40)
}
