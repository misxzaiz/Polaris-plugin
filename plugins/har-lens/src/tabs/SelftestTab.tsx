/**
 * 自检 Tab：试金石（内存合成 fixture HAR 全链路断言，零网络、不碰真实文件）
 */
import { useState } from 'react'
import { sendCommand, type PanelData, type SelftestReport } from '../model'

type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

export default function SelftestTab({ data, running, reload, showToast }: {
  data: PanelData
  running: boolean
  reload: () => Promise<PanelData>
  showToast: Toast
}) {
  const [busy, setBusy] = useState(false)
  const report: SelftestReport | null = data.selftest

  const run = async () => {
    setBusy(true)
    const r = await sendCommand<{ report: SelftestReport }>('selftest', {}, 60000)
    setBusy(false)
    if (!r.ok || !r.report) { showToast(`自检失败：${r.error || '未知'}`, 'bad'); return }
    showToast(r.report.allGreen ? `自检 ${r.report.passed}/${r.report.total} 全绿` : `自检有失败项`, r.report.allGreen ? 'good' : 'bad')
    await reload()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        fontSize: 11, padding: '8px 10px', borderRadius: 8,
        background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.25)', color: '#93c5fd',
      }}>
        试金石自检在服务进程内存里合成一份带已知病灶的 fixture HAR（慢请求/500/404/重复请求/鉴权头/Cookie/密钥特征/JWT/密码体），走 解析→分析→审计→脱敏→对比→详情 全链路逐项断言——零网络、不碰你的真实文件。
      </div>
      <div>
        <button
          onClick={() => void run()}
          disabled={!running || busy}
          style={{ padding: '7px 18px', fontSize: 12, borderRadius: 8, cursor: 'pointer', border: '1px solid #3b82f6', background: 'rgba(59,130,246,.2)', color: '#93c5fd', minHeight: 32 }}
        >{busy ? '自检中…' : '运行自检'}</button>
      </div>
      {report && (
        <div style={{ border: '1px solid #3f3f46', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: report.allGreen ? '#3fb950' : '#f85149', marginBottom: 6 }}>
            {report.allGreen ? '✅' : '❌'} {report.passed}/{report.total} 通过 · {report.durationMs}ms · v{report.version}
          </div>
          {report.checks.map((c, i) => (
            <div key={i} style={{ fontSize: 11, lineHeight: 1.8 }}>
              <span style={{ color: c.pass ? '#3fb950' : '#f85149' }}>{c.pass ? '✅' : '❌'}</span> {c.item}
              {!c.pass && c.detail && <span style={{ color: '#f85149' }}> —— {c.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
