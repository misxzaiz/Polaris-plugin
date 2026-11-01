/**
 * HistoryTab —— 历史运行列表：跳回结果页读旧 run（最近 10 份全量可回看）。
 */
import type { HistoryEntry } from './model'

export default function HistoryTab({ history, onOpen }: {
  history: HistoryEntry[]
  onOpen: (runId: string) => void
}) {
  if (!history.length) {
    return <div className="pm-empty">还没有历史运行。发起一次矩阵后这里会记录每次的数据集/成功率/judge 均分。</div>
  }
  return (
    <div>
      <div className="pm-sec"><span className="pm-bar" />历史运行（{history.length}）<span className="pm-hint">结果保留最近 10 份全量</span></div>
      <div className="pm-card"><div className="pm-card-b" style={{ padding: 0 }}>
        <table className="pm-tbl">
          <thead><tr><th>时间</th><th>数据集</th><th>格子</th><th>judge</th><th>变体</th><th>状态</th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.runId}>
                <td className="pm-sub" style={{ whiteSpace: 'nowrap' }}>{String(h.at || '').replace('T', ' ').slice(0, 16)}</td>
                <td><b>{h.datasetName || '?'}</b><div className="pm-sub">{h.runId}</div></td>
                <td>
                  <span style={{ color: '#3FB950' }}>{h.okCells}</span>/{h.cells}
                  {h.failedCells ? <span style={{ color: '#F85149' }}>（✗{h.failedCells}）</span> : null}
                </td>
                <td>{h.judgeAvg != null ? <b>{h.judgeAvg}</b> : <span className="pm-sub">未评判</span>}</td>
                <td className="pm-sub" style={{ maxWidth: 220, wordBreak: 'break-all' }}>{(h.variants || []).join(' / ')}</td>
                <td>
                  {h.status === 'done' ? <span className="pm-pill ok">完成</span>
                    : h.status === 'aborted' ? <span className="pm-pill warn">中止</span>
                    : <span className="pm-pill bad">出错</span>}
                  <button className="pm-btn ghost sm" style={{ marginLeft: 6 }}
                    onClick={() => onOpen(h.runId)}>查看</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}
