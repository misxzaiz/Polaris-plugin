/**
 * 历史 Tab：运行记录（新→旧），可按任务过滤，摘录可展开。
 */
import { useState } from 'react'
import { fmtTime } from './ui'
import type { RunRecord, Job } from './ui'

const STATUS_LABEL: Record<string, string> = { ok: '成功', fail: '失败', timeout: '超时' }

export default function HistoryTab({ runs, jobs }: { runs: RunRecord[]; jobs: Job[] }) {
  const [filterJobId, setFilterJobId] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const shown = filterJobId ? runs.filter((r) => r.jobId === filterJobId) : runs

  return (
    <div>
      <div style={{ margin: '0 16px 10px' }} className="tr-row">
        <select className="tr-sel" value={filterJobId} onChange={(e) => setFilterJobId(e.target.value)}>
          <option value="">全部任务</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
        <span className="tr-sub">{shown.length} 条（新→旧，保留策略见设置）</span>
      </div>

      {shown.length === 0 ? (
        <div className="tr-empty">
          还没有运行记录。<br />
          任务到点自动执行、或在任务卡上点「执行」后，记录会出现在这里。
        </div>
      ) : null}

      {shown.map((r) => (
        <div className="tr-card" key={r.id}>
          <div className="tr-card-b">
            <div className="tr-row" style={{ justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 12.5 }}>
                  {r.jobName}
                  {' '}
                  <span className={`tr-tag ${r.status === 'ok' ? 'ok' : r.status === 'timeout' ? 'timeout' : 'fail'}`}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                  {r.missed ? <span className="tr-tag missed">补跑</span> : null}
                  {r.trigger === 'manual' ? <span className="tr-tag manual">手动</span> : null}
                </b>
                <div className="tr-sub" style={{ marginTop: 3 }}>
                  {fmtTime(r.startedAt)} · {r.durationMs}ms · {r.summary}
                </div>
                {r.excerpt ? (
                  <div
                    className="tr-sub"
                    style={{
                      marginTop: 5, fontFamily: 'Consolas,monospace', fontSize: 10.5,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: expanded === r.id ? 300 : 60,
                      overflow: 'hidden', cursor: 'pointer', background: '#12151c', borderRadius: 8, padding: '6px 8px',
                    }}
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  >
                    {expanded === r.id ? r.excerpt : r.excerpt.slice(0, 160) + (r.excerpt.length > 160 ? ' …（点击展开）' : '')}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
