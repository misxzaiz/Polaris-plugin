/**
 * 历史：服务与 MCP 的任务记录（cap.kv zhifang.history.*，服务单写者）。
 * 面板只读 + 发清空命令键（服务先删后做）。
 */
import { useState } from 'react'
import type { PanelCtx } from './Panel'
import { OP_LABELS, core, requestClearHistory } from './model'

function timeOf(at: string): string {
  return String(at || '').replace('T', ' ').slice(0, 19)
}

export default function HistoryTab({ ctx }: { ctx: PanelCtx }) {
  const { history, reloadHistory, showToast } = ctx
  const [clearing, setClearing] = useState(false)

  const clear = async () => {
    if (clearing) return
    if (!window.confirm('确定清空全部任务历史？（只删记录，不删任何输出文件）')) return
    setClearing(true)
    try {
      await requestClearHistory()
      showToast('已请求清空：服务在线时即刻生效（离线则上线后生效）', 'good')
      window.setTimeout(() => { reloadHistory() }, 1200)
    } catch (e) {
      showToast('清空失败：' + String((e as Error).message || e), 'bad')
    } finally {
      setClearing(false)
    }
  }

  if (!history.length) {
    return (
      <div className="zf-empty" data-testid="history-empty">
        还没有任务记录。<br />在工作台处理文件，或让 AI 调用 zhifang_* 工具后，这里会出现完整台账。
      </div>
    )
  }

  return (
    <div>
      <div className="zf-sec">
        <span className="zf-bar" />
        任务历史
        <span className="zf-hint">{history.length} 条 · 只删记录不删文件</span>
      </div>
      <div className="zf-chiprow">
        <button className="zf-btn ghost sm" onClick={reloadHistory}>刷新</button>
        <button className="zf-btn ghost sm" data-testid="clear-history" onClick={clear} disabled={clearing}>清空历史</button>
      </div>
      {history.map((h) => (
        <div className="zf-item" key={h.id} data-testid="history-item">
          <div className="zf-item-head">
            <b>{OP_LABELS[h.op] || h.op}{h.ok === false ? ' · 失败' : ''}</b>
            <span className={'zf-badge ' + (h.source === 'mcp' ? 'ok' : '')}>{h.source === 'mcp' ? 'AI' : '面板'}</span>
            <span className="zf-badge">{timeOf(h.at)}</span>
            <span className="zf-badge">{h.ms}ms</span>
          </div>
          <div className="zf-item-mid">
            输入：{(h.inputs || []).join('、') || '—'}
          </div>
          {h.ok === false && h.error && (
            <div className="zf-item-mid" style={{ color: '#FF8A9A' }}>失败原因：{h.error}</div>
          )}
          {(h.outputs || []).map((o) => (
            <div className="zf-item-mid" key={o.path}>
              📄 {o.name} · {core.formatBytes(o.size)} · {o.path}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
