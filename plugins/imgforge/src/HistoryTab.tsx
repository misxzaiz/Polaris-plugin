/**
 * 历史：cap.kv imgforge.history.* 投影（面板与 AI/MCP 共用同一份台账）。
 * 清空走命令键 imgforge.cmd（先删后做，单写者纪律）。
 */
import { useState } from 'react'
import type { HistoryEntry } from './model'
import { requestClearHistory } from './model'
import { core } from './model'
import type { PanelCtx } from './Panel'

export default function HistoryTab({ ctx }: { ctx: PanelCtx }) {
  const { history, reloadHistory, showToast, meta } = ctx
  const [busy, setBusy] = useState(false)

  const clearAll = async () => {
    if (busy) return
    setBusy(true)
    try {
      await requestClearHistory()
      showToast('已请求清空（服务在线时立即生效）')
      window.setTimeout(() => { reloadHistory() }, 1200)
    } catch (e) {
      showToast(String((e as Error).message || e), 'bad')
    } finally {
      setBusy(false)
    }
  }

  if (!history.length) {
    return (
      <div>
        <div className="if-sec"><span className="if-bar" />任务历史</div>
        <div className="if-empty">
          还没有任务记录。<br />面板批量变换或让 AI 调 imgforge_process 后，记录会出现在这里。
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="if-sec">
        <span className="if-bar" />任务历史
        <span className="if-hint">{history.length} 条（环形保留）</span>
        <button className="if-btn ghost sm" style={{ marginLeft: 8 }} onClick={clearAll} disabled={busy}>清空</button>
      </div>
      {history.map((h) => (
        <div key={h.id} className="if-item">
          <div className="if-item-head">
            <b>{String(h.at).replace('T', ' ').slice(0, 16)} · [{h.source}] {h.pipeline}</b>
            <span className={'if-badge ' + (h.okState ? 'ok' : 'bad')}>{h.okState ? `${h.ok}/${h.total} 成功` : '失败'}</span>
          </div>
          <div className="if-item-mid">
            {core.formatBytes(h.inBytes || 0)} → {core.formatBytes(h.outBytes || 0)}
            （{(h.savedBytes || 0) >= 0 ? '节省 ' : '增大 '}{core.formatBytes(Math.abs(h.savedBytes || 0))}）
            · 输出 {h.outDir || '?'}
            {h.ms ? ` · ${(h.ms / 1000).toFixed(1)}s` : ''}
          </div>
          {!h.okState && h.error && <div className="if-item-mid" style={{ color: '#FF8A9A' }}>{h.error}</div>}
          {h.okState && h.fail > 0 && (
            <div className="if-item-mid" style={{ color: '#F2B263' }}>
              {h.fail} 张失败：{(h.results || []).filter((r) => !r.ok).slice(0, 3).map((r) => r.name + '（' + r.error + '）').join('；')}
            </div>
          )}
        </div>
      ))}
      {!meta && <div className="if-sub" style={{ margin: '0 18px' }}>服务离线：清空命令会在服务上线后生效。</div>}
    </div>
  )
}
