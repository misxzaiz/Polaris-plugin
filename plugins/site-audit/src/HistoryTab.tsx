/**
 * 历史 Tab：最近体检记录（新→旧）+ 查看报告 + 清空历史
 */
import { useState } from 'react'
import { opAction, type HistoryEntry, type ServiceMeta } from './model'

interface HistoryTabProps {
  meta: ServiceMeta | null
  history: HistoryEntry[]
  onRefresh: () => void
  onView: (auditId: string | null | undefined) => void
}

export default function HistoryTab({ meta, history, onRefresh, onView }: HistoryTabProps) {
  const [busy, setBusy] = useState(false)

  const clear = async () => {
    if (!meta || busy) return
    setBusy(true)
    try {
      await opAction(meta, 'clear_history')
      onRefresh()
    } catch { /* 服务未起 */ } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="sa-sec">
        <span className="sa-bar" />体检历史
        <span className="sa-hint">报告保留最近 20 份（超出自动清理）</span>
      </div>
      {history.length === 0 && (
        <div className="sa-empty">
          还没有体检历史。<br />
          在「体检」Tab 发起第一次整站体检；报告完成后会留档在这里，可随时回看与对比。
        </div>
      )}
      {history.map((h) => (
        <div className="sa-card" key={h.auditId}>
          <div className="sa-card-b">
            <div className="sa-row-h">
              <span className={`sa-badge ${h.fatal ? 'bad' : h.score >= 90 ? 'good' : h.score >= 70 ? 'warn' : 'bad'}`}>{h.fatal ? '失败' : `${h.score}/100`}</span>
              <b style={{ fontSize: 12 }} className="sa-mono">{h.seed}</b>
              {h.aborted && <span className="sa-tag">中止</span>}
            </div>
            <div className="sa-sub" style={{ marginTop: 4 }}>
              {String(h.at).replace('T', ' ').slice(0, 16)} · {h.pagesCrawled} 页 / {h.assetsChecked} 资源 / {h.externalChecked} 外链 · {(h.durationMs / 1000).toFixed(1)}s · 错误 {h.errors} · 警告 {h.warns}
            </div>
            {h.fatal && <div className="sa-err">{h.fatal}</div>}
            <div className="sa-sub" style={{ marginTop: 2 }}>{h.verdictOne}</div>
            <div className="sa-btnrow">
              <button className="sa-btn ghost sm" onClick={() => onView(h.auditId)} disabled={Boolean(h.fatal) && h.pagesCrawled === 0}>查看报告</button>
              <span className="sa-sub sa-mono">auditId={h.auditId}</span>
            </div>
          </div>
        </div>
      ))}
      {history.length > 0 && meta && (
        <div className="sa-btnrow" style={{ padding: '0 18px' }}>
          <button className="sa-btn danger sm" onClick={clear} disabled={busy}>清空历史记录</button>
          <span className="sa-sub">只清历史清单，已保留的报告仍可用 auditId 读取。</span>
        </div>
      )}
    </>
  )
}
