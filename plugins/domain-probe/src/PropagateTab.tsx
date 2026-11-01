/**
 * PropagateTab —— 多解析器一致性（传播检查）：同一条记录在
 * 阿里 / DNSPod / Cloudflare / Google 四个公共解析器的答案并排对比。
 * 注：这是「公共解析器视图对比」，不是全球节点抽样——README 已如实说明。
 */
import { useState } from 'react'
import { sendCommand, type Report, type ServiceMeta } from './model'
import ReportView from './ReportView'

const TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'SOA', 'CAA', 'CNAME']

export default function PropagateTab({ meta }: { meta: ServiceMeta | null }) {
  const [domain, setDomain] = useState('')
  const [type, setType] = useState('A')
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
      const r = await sendCommand<{ ok: boolean; error?: string; report?: Report }>('lookup', { domain: d, type, allResolvers: true }, 60000)
      if (r.ok && r.report) setReport(r.report)
      else setErr(r.error || '查询失败')
    } catch (e) { setErr(String((e as Error).message || e)) } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="dp-card">
        <div className="dp-card-b">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="dp-inp" placeholder="域名或子域，如 www.example.com"
              value={domain} onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy && !runBlocked) start() }}
            />
            <select className="dp-sel" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="dp-btn" disabled={busy || !!runBlocked} onClick={start} style={{ flexShrink: 0 }}>
              {busy ? '查询中…' : '对比查询'}
            </button>
          </div>
          <div className="dp-sub" style={{ marginTop: 7 }}>
            改了解析后在这里验证：国内外解析器看到的答案一致了，才算全球生效（含 TTL 提示）
          </div>
          {runBlocked && <div className="dp-warn" style={{ marginTop: 7 }}>正在体检 {runBlocked.domain}（{runBlocked.step}），请等它完成</div>}
          {err && <div className="dp-err" style={{ marginTop: 7 }}>{err}</div>}
        </div>
      </div>
      {report && <ReportView rep={report} />}
      {!report && !busy && (
        <div className="dp-empty">
          对 AI 说：<b style={{ color: '#7EE2A8' }}>「查下 www.example.com 的 A 记录在国内外解析器上是否一致」</b>
        </div>
      )}
    </div>
  )
}
