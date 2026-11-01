/**
 * DiagnoseTab —— 全面体检：输入域名 → 触发服务 → 展示最近报告
 * 运行态来自 dom.meta 心跳（running.step），报告来自 dom.latest。
 */
import { useEffect, useState } from 'react'
import { sendCommand, loadLatest, type Report, type ServiceMeta } from './model'
import ReportView from './ReportView'

export default function DiagnoseTab({ meta, onDone }: { meta: ServiceMeta | null; onDone: () => void }) {
  const [domain, setDomain] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [loadingLatest, setLoadingLatest] = useState(true)

  useEffect(() => {
    loadLatest().then((r) => { if (r && r.kind !== 'lookup') setReport(r); setLoadingLatest(false) })
  }, [])

  const running = meta?.running || null
  const runBlocked = running && running.action !== 'lookup' ? running : null

  async function start() {
    const d = domain.trim()
    if (!d) { setErr('请输入域名'); return }
    setErr('')
    setBusy(true)
    try {
      const r = await sendCommand<{ ok: boolean; error?: string; report?: Report }>('full', { domain: d }, 180000)
      if (r.ok && r.report) { setReport(r.report); onDone() }
      else setErr(r.error || '体检失败')
    } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="dp-card">
        <div className="dp-card-b">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="dp-inp" placeholder="要体检的域名，如 example.com"
              value={domain} onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy && !runBlocked) start() }}
            />
            <button className="dp-btn" disabled={busy || !!runBlocked} onClick={start} style={{ flexShrink: 0 }}>
              {busy ? '体检中…' : '开始体检'}
            </button>
          </div>
          <div className="dp-sub" style={{ marginTop: 7 }}>
            DNS 基础（NS/SOA/A/CAA/DNSSEC）+ 邮件身份（SPF/DMARC/DKIM/MX）+ 证书，全只读查询，约 15-60 秒
          </div>
          {runBlocked && (
            <div className="dp-warn" style={{ marginTop: 7 }}>
              正在体检 {runBlocked.domain}（阶段：{runBlocked.step}）——完成后可发起下一次
            </div>
          )}
          {err && <div className="dp-err" style={{ marginTop: 7 }}>{err}</div>}
        </div>
      </div>
      {loadingLatest && <div className="dp-empty">加载最近报告…</div>}
      {!loadingLatest && report && <ReportView rep={report} />}
      {!loadingLatest && !report && !busy && (
        <div className="dp-empty">
          还没有体检报告。<br />输入域名点「开始体检」，或在聊天里对 AI 说：<br />
          <b style={{ color: '#7EE2A8' }}>「帮我体检一下 example.com 的域名」</b>
        </div>
      )}
    </div>
  )
}
