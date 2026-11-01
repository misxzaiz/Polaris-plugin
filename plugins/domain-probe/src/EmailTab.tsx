/**
 * EmailTab —— 邮件身份专项：SPF（含 RFC 7208 查询计数）/ DMARC / DKIM / MX
 */
import { useState } from 'react'
import { sendCommand, type Report, type ServiceMeta } from './model'
import ReportView from './ReportView'

export default function EmailTab({ meta }: { meta: ServiceMeta | null }) {
  const [domain, setDomain] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const running = meta?.running || null
  const runBlocked = running && running.action !== 'lookup' ? running : null

  async function start() {
    const d = domain.trim()
    if (!d) { setErr('请输入域名'); return }
    setErr('')
    setBusy(true)
    try {
      const r = await sendCommand<{ ok: boolean; error?: string; report?: Report }>('email', { domain: d }, 120000)
      if (r.ok && r.report) setReport(r.report)
      else setErr(r.error || '体检失败')
    } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="dp-card">
        <div className="dp-card-b">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="dp-inp" placeholder="发信域名（@ 后面的那个），如 mycompany.com"
              value={domain} onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy && !runBlocked) start() }}
            />
            <button className="dp-btn" disabled={busy || !!runBlocked} onClick={start} style={{ flexShrink: 0 }}>
              {busy ? '检查中…' : '邮件体检'}
            </button>
          </div>
          <div className="dp-sub" style={{ marginTop: 7 }}>
            邮件进垃圾箱/被拒信的第一现场：SPF 语法与十次查询上限、DMARC 策略、DKIM 常见 selector、MX 体检
          </div>
          {runBlocked && <div className="dp-warn" style={{ marginTop: 7 }}>正在体检 {runBlocked.domain}（{runBlocked.step}），请等它完成</div>}
          {err && <div className="dp-err" style={{ marginTop: 7 }}>{err}</div>}
        </div>
      </div>
      {report && <ReportView rep={report} />}
      {!report && !busy && (
        <div className="dp-empty">
          对 AI 说：<b style={{ color: '#7EE2A8' }}>「帮我查下 mycompany.com 的邮件配置，最近发信老进垃圾箱」</b><br />
          也可以直接在上方输入域名发起
        </div>
      )}
    </div>
  )
}
