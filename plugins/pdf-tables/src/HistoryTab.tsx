/**
 * 历史：任务台账（cap.kv pdf-tables.history.*，服务/MCP 写、面板只读）。
 * 环形容量由设置控制；清空走命令键（服务先删后做）。
 */
import type { PanelCtx } from './Panel'
import { core, requestClearHistory } from './model'

const OP_LABELS: Record<string, string> = {
  detect: '检测表格',
  read: '读表',
  extract: '提取落盘',
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function HistoryTab({ ctx }: { ctx: PanelCtx }) {
  const { history, showToast, reloadHistory, meta } = ctx

  const clearAll = async () => {
    try {
      await requestClearHistory()
      showToast('已请求清空（服务在线时立即生效）', 'good')
      window.setTimeout(() => { void reloadHistory() }, 800)
    } catch (e) {
      showToast('清空失败：' + String((e as Error).message || e), 'bad')
    }
  }

  return (
    <div>
      <div className="pdt-chiprow" style={{ justifyContent: 'space-between' }}>
        <span className="pdt-sub">共 {history.length} 条任务（面板与 AI 共用同一台账）</span>
        <button className="pdt-btn ghost sm" onClick={clearAll} disabled={!history.length} data-testid="clear-btn">清空历史</button>
      </div>

      {history.length === 0 && (
        <div className="pdt-empty" data-testid="history-empty">还没有任务记录。在工作台检测/提取一份 PDF，或让 AI 用 pdf_tables_* 工具操作。</div>
      )}

      {history.map((h) => (
        <div className="pdt-item" key={h.id} data-testid={'history-' + h.id}>
          <div className="pdt-item-head">
            <b>{OP_LABELS[h.op] || h.op} · {(h.inputs || []).join('、') || '(无输入)'}</b>
            <span className={'pdt-badge' + (h.ok ? ' ok' : ' bad')}>{h.source === 'mcp' ? 'AI' : '面板'} · {h.ok ? '成功' : '失败'}</span>
          </div>
          <div className="pdt-item-mid">
            {fmtTime(h.at)} · {typeof h.tables === 'number' ? `${h.tables} 张表 / ${h.rows || 0} 行 · ` : ''}{h.ms || 0} ms
            {h.outputs && h.outputs.length > 0 && (
              <div style={{ marginTop: 3 }}>
                {h.outputs.map((o) => (
                  <div key={o.path}>📄 {o.name} · {core.formatBytes(o.size)}</div>
                ))}
              </div>
            )}
            {h.error && <div style={{ color: '#FF8A9A', marginTop: 3 }}>错误：{h.error}</div>}
          </div>
        </div>
      ))}

      {!meta && history.length > 0 && (
        <div className="pdt-sub" style={{ margin: '0 18px 10px' }}>服务离线中：历史只读，清空命令将在服务上线后生效。</div>
      )}
    </div>
  )
}
