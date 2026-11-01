/**
 * HistoryTab —— 体检历史：最近 60 条记录，点击载入完整报告
 */
import { useEffect, useState } from 'react'
import { loadHistory, loadReport, sendCommand, type HistoryEntry, type Report } from './model'
import ReportView from './ReportView'

const KIND_CN: Record<string, string> = { full: '全面', email: '邮件', cert: '证书', lookup: '查询' }

export default function HistoryTab({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<HistoryEntry[] | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    loadHistory().then((h) => setItems(Array.isArray(h) ? h : []))
  }, [refreshKey])

  async function open(entry: HistoryEntry) {
    setErr('')
    setReport(null)
    const r = await loadReport(entry.runId)
    if (r) setReport(r)
    else {
      // 报告可能已被轮换清理 → 让服务按 runId 兜底读一次（同样读 kv，路径一致）
      const viaCmd = await sendCommand<{ ok: boolean; report?: Report; error?: string }>('get_report', { runId: entry.runId }, 20000)
      if (viaCmd.ok && viaCmd.report) setReport(viaCmd.report)
      else setErr(viaCmd.error || '报告不存在或已被清理')
    }
  }

  async function clearHistory() {
    if (!confirm('清空本地体检历史？（报告缓存与历史列表都会删除，不影响任何线上数据）')) return
    // 清理走服务权威（避免面板直接删服务单写者键产生竞态）：settings_set 之外提供专用于清历史的动作会让服务面变大，
    // 这里采用面板直删 dom.history + dom.runs + dom.report.*（服务下次写入会自动重建索引）
    try {
      const { getHostInvoke } = await import('./host')
      const invoke = getHostInvoke()
      const list = await invoke<{ ok: boolean; result?: { keys?: string[] } }>('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'list' } } })
      const keys = (list.result?.keys || []).filter((k) => k.startsWith('dom.report.') || k === 'dom.history' || k === 'dom.runs' || k === 'dom.latest')
      for (const k of keys) {
        await invoke('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'delete', key: k } } })
      }
      setItems([]); setReport(null)
    } catch (e) { setErr(String((e as Error).message || e)) }
  }

  return (
    <div>
      <div className="dp-card">
        <div className="dp-card-b" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>体检历史{items ? `（${items.length}）` : ''}</span>
          <span style={{ flex: 1 }} />
          {items && items.length > 0 && (
            <button className="dp-btn sm danger" onClick={clearHistory}>清空</button>
          )}
        </div>
      </div>
      {err && <div className="dp-err">{err}</div>}
      {report && <ReportView rep={report} compact />}
      {!report && (
        <div className="dp-card">
          {items === null && <div className="dp-empty">加载中…</div>}
          {items && items.length === 0 && (
            <div className="dp-empty">还没有体检记录。先去「体检」页发起一次吧。</div>
          )}
          {items && items.map((x) => {
            const c = x.counts || {}
            return (
              <div key={x.runId} className="dp-row" style={{ cursor: 'pointer' }} onClick={() => open(x)}>
                <div className="dp-row-h">
                  <span className={`dp-badge ${x.ok ? 'good' : 'bad'}`}>{x.ok ? '✓' : '✗'}</span>
                  <b className="dp-mono" style={{ fontSize: 12.5 }}>{x.domain}</b>
                  <span className="dp-tag">{KIND_CN[x.kind] || x.kind}</span>
                  {x.score != null && <b style={{ fontSize: 12.5, color: x.score >= 85 ? '#3FB950' : x.score >= 70 ? '#58A6FF' : x.score >= 50 ? '#E3B341' : '#F85149' }}>{x.score}分</b>}
                  {!!c.red && <span style={{ fontSize: 10, color: '#F85149' }}>红{c.red}</span>}
                  {!!c.yellow && <span style={{ fontSize: 10, color: '#E3B341' }}>黄{c.yellow}</span>}
                  <span className="dp-muted" style={{ marginLeft: 'auto', fontSize: 10 }}>{String(x.at).replace('T', ' ').slice(0, 16)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
