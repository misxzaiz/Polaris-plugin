/**
 * 历史页：批次列表（撤销入口）+ 批次明细（逐文件 from→to + 状态）
 * 撤销经命令信箱由服务执行：逐文件「目的仍在 & 原位已空」才回移，冲突如实报告。
 */
import { useEffect, useState } from 'react'
import { callService, fmtBytes, fmtTime, loadBatches, type Batch, type Toast } from './model'

interface Props {
  refresh: () => Promise<void>
  showToast: (t: Toast) => void
}

const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  done: { t: '✓', c: '#3FB950' },
  gone: { t: '∅ 目标已不在', c: '#8B95A7' },
  changed: { t: '↯ 执行中变化', c: '#D29922' },
  locked: { t: '🔒 被占用', c: '#D29922' },
  error: { t: '✗ 失败', c: '#F85149' },
  held: { t: '⏸ 根外暂缓', c: '#D29922' },
  conflict: { t: '⚠ 冲突', c: '#D29922' },
  ready: { t: '待回移', c: '#58A6FF' },
}

export default function HistoryTab({ refresh, showToast }: Props) {
  const [batches, setBatches] = useState<Batch[] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [undoing, setUndoing] = useState<string | null>(null)

  async function load() {
    try {
      setBatches(await loadBatches(40))
    } catch {
      setBatches([])
    }
  }

  useEffect(() => { load() }, [])

  async function undo(b: Batch) {
    if (!window.confirm(`撤销批次 ${b.batchId}？\n将把本批次移动过的 ${b.summary.done} 个文件逐一移回原位；冲突/已再次移动的文件会如实报告，绝不覆盖。`)) return
    setBusy(`u-${b.batchId}`)
    setUndoing(null)
    try {
      const r = await callService<{ undone: number; failed: number; undoBatchId: string; results: { fromRel: string; status: string; why?: string }[] }>(
        'undo',
        { batchId: b.batchId, confirm: true },
        { timeoutMs: 150_000 },
      )
      await Promise.all([load(), refresh()])
      showToast({
        msg: `撤销完成：回移 ${r.undone} 个，未成 ${r.failed} 个${r.failed ? '（明细见新批次 ' + r.undoBatchId + '）' : ''}`,
        bad: r.failed > 0,
      })
    } catch (e) {
      showToast({ msg: String((e as Error).message || e), bad: true })
    } finally {
      setBusy('')
    }
  }

  if (batches === null) return <div className="ff-empty">加载中…</div>
  if (!batches.length) return <div className="ff-card"><div className="ff-empty">还没有批次记录。<br />到「总览」页对一个文件夹「立即整理」，或在对话里让 AI 执行。</div></div>

  return (
    <>
      {batches.map((b) => {
        const isUndo = b.mode === 'undo'
        return (
          <div className="ff-card" key={b.batchId}>
            <div className="ff-batch">
              <div className="ff-batch-h">
                <b>{b.batchId}</b>
                <span className="ff-tag">{isUndo ? `撤销自 ${b.undoOf}` : b.mode === 'auto' ? '自动' : '手动'}</span>
                {b.summary.failed > 0 && <span className="ff-tag warn">失败 {b.summary.failed}</span>}
                {b.summary.held > 0 && <span className="ff-tag warn">暂缓 {b.summary.held}</span>}
                <div style={{ flex: 1 }} />
                <span className="ff-sub">{fmtTime(b.at)}</span>
              </div>
              <div className="ff-batch-sum">
                {isUndo ? '回移' : '整理'} {b.summary.done}/{b.summary.total} 个文件
                {b.summary.bytesMoved > 0 && ` · ${fmtBytes(b.summary.bytesMoved)}`}
                <span className="ff-dim"> · {b.rootPath}</span>
              </div>
              <div className="ff-row" style={{ marginTop: 6 }}>
                <button className="ff-btn sm ghost" onClick={() => setExpanded(expanded === b.batchId ? null : b.batchId)}>
                  {expanded === b.batchId ? '收起明细' : '明细'}
                </button>
                {!isUndo && b.summary.done > 0 && (
                  <button className="ff-btn sm danger" disabled={busy === `u-${b.batchId}`} onClick={() => undo(b)}>
                    {busy === `u-${b.batchId}` ? '撤销中…' : '撤销本批次'}
                  </button>
                )}
              </div>
              {expanded === b.batchId && (
                <div className="ff-ops">
                  {b.ops.map((op, i) => {
                    const st = STATUS_LABEL[op.status] || { t: op.status, c: '#8B95A7' }
                    return (
                      <div key={i} className="ff-op">
                        <span style={{ color: st.c }}>{st.t}</span>{' '}
                        <span className="ff-mono">{op.fromRel}</span>
                        <span className="ff-dim"> → </span>
                        <span className="ff-mono">{op.toAbs || op.toRel || '?'}</span>
                        {op.why && <div className="ff-dim">{op.why}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })}
      {undoing && <div className="ff-sub" style={{ padding: '0 16px' }}>撤销中…</div>}
    </>
  )
}
