/**
 * SQL 查询 Tab：只读 SQL 编辑器 + 结果网格 + 查询历史 + 一键导出。
 * 写语句在这里会被服务端闸门拒绝并提示走两步写（/api/write）。
 */
import { useCallback, useEffect, useState } from 'react'
import { svcFetch, withSvc, fmtBytes, type LibEntry, type MetaReply, type ShapedCell, type QhistEntry } from './model'

interface QueryReply {
  ok: boolean; error?: string; sql?: string
  columns?: string[]; rows?: ShapedCell[][]; totalRows?: number; truncated?: boolean; ms?: number
}
interface ExportReply { ok: boolean; error?: string; path?: string; rows?: number; bytes?: number; format?: string }
interface WriteReply {
  ok: boolean; error?: string; pendingId?: string
  sql?: string; preview?: { head: string; changes: number | null; note?: string }
}

const SAMPLE = 'SELECT name, sql FROM sqlite_master WHERE type=\'table\''

export default function QueryTab({ libs, reply, onChanged }: {
  libs: LibEntry[]; reply: MetaReply | null; onChanged: () => void
}) {
  const [dbId, setDbId] = useState('')
  const [sql, setSql] = useState('')
  const [result, setResult] = useState<QueryReply | null>(null)
  const [pend, setPend] = useState<WriteReply | null>(null)
  const [exporting, setExporting] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!dbId && libs.length) setDbId(libs[0].dbId)
  }, [libs, dbId])

  const run = useCallback(async () => {
    if (!dbId || !sql.trim()) return
    setErr(''); setPend(null)
    try {
      const r = await withSvc((m) => svcFetch<QueryReply>(m, '/api/query', { dbId, sql }))
      setResult(r)
      if (r.ok) onChanged()
      else {
        // 只读闸门拒绝且像写语句 → 提示走两步写
        if (/只读|写语句|写通道/.test(r.error || '')) {
          const w = await withSvc((m) => svcFetch<WriteReply>(m, '/api/write', { dbId, sql }))
          setPend(w)
        } else setErr(r.error || '查询失败')
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [dbId, sql, onChanged])

  const doExport = useCallback(async (fmt: 'csv' | 'json') => {
    if (!dbId || !sql.trim()) return
    setExporting(true); setErr('')
    try {
      const r = await withSvc((m) => svcFetch<ExportReply>(m, '/api/export', { dbId, sql, format: fmt }))
      if (r.ok) setErr(`已导出 ${r.rows} 行 → ${r.path}（${fmtBytes(r.bytes)}）`)
      else setErr(r.error || '导出失败')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setExporting(false) }
  }, [dbId, sql])

  const qhist: QhistEntry[] = reply?.qhist || []
  const curLib = libs.find((l) => l.dbId === dbId)

  return (
    <div>
      <div className="sl-sec"><span className="sl-bar" />SQL 查询<span className="sl-hint">只读通道 · 写语句自动转入两步写预览</span></div>
      <div className="sl-lib-pick">
        {libs.map((l) => (
          <button key={l.dbId} className={`sl-pill ${dbId === l.dbId ? 'on' : ''}`} onClick={() => { setDbId(l.dbId); setResult(null); setPend(null) }} title={l.path}>
            {l.label}
          </button>
        ))}
        {!libs.length && <span className="sl-sub">先去「库雷达」或「数据浏览」打开一个库</span>}
      </div>

      {curLib && (
        <div className="sl-card">
          <div className="sl-card-b">
            <textarea
              className="sl-inp sl-mono" style={{ minHeight: 90 }}
              placeholder={`只读 SQL（${SAMPLE}）`}
              value={sql} onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run() }}
            />
            <div className="sl-row" style={{ marginTop: 8 }}>
              <button className="sl-btn primary" onClick={run}>执行（Ctrl+Enter）</button>
              <button className="sl-btn" disabled={exporting} onClick={() => doExport('csv')}>导出 CSV</button>
              <button className="sl-btn" disabled={exporting} onClick={() => doExport('json')}>导出 JSON</button>
            </div>
          </div>
        </div>
      )}

      {err ? <div className="sl-err">{err}</div> : null}

      {pend && pend.ok && pend.preview && (
        <div className="sl-pend-banner">
          <b>这是写语句——已生成两步写预览</b>
          <div className="sl-sub sl-mono" style={{ marginTop: 4 }}>{pend.sql}</div>
          <div className="sl-sub">预计影响 {pend.preview.changes === null ? '—（VACUUM 重建整个文件）' : `${pend.preview.changes} 行`} · 待确认单 {pend.pendingId}（10 分钟有效）</div>
          <div className="sl-sub">请到「维护」页（顶部横幅）确认或取消；确认前会自动整库备份。</div>
        </div>
      )}

      {result && (
        <div className="sl-card">
          <div className="sl-card-b">
            <div className="sl-row">
              <span className={`sl-badge ${result.ok ? 'good' : 'bad'}`}>{result.ok ? `${result.totalRows ?? result.rows?.length ?? 0} 行` : '失败'}</span>
              {result.ms !== undefined && <span className="sl-hint">{result.ms}ms{result.truncated ? ' · 已截断（结果超单元预算）' : ''}</span>}
            </div>
          </div>
          {result.ok && result.columns && result.rows ? (
            result.rows.length === 0 ? <div className="sl-empty">0 行</div> : (
              <div style={{ overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
                <table className="sl-grid">
                  <thead><tr>{result.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr key={i}>
                        {r.map((cell, j) => (
                          <td key={j} title={cell.v || ''}>
                            {cell.t === 'null' ? <span className="sl-null">NULL</span>
                              : cell.t === 'blob' ? <span className="sl-blob">{cell.v}</span>
                                : <>{cell.v}{cell.trunc ? <span className="sl-trunc">…{cell.trunc}</span> : null}</>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      )}

      {qhist.length > 0 && (
        <>
          <div className="sl-sec"><span className="sl-bar" />查询历史<span className="sl-hint">最近 {qhist.length} 条（跨端共享）</span></div>
          <div className="sl-card">
            {qhist.slice(0, 20).map((h, i) => (
              <div key={i} className="sl-card-b" style={{ padding: '7px 13px', borderBottom: '1px solid #1B2029' }}>
                <div className="sl-row">
                  <span className="sl-grow sl-mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                    title="点击填入" onClick={() => setSql(h.sql)}>{h.sql}</span>
                  <span className="sl-tag">{h.rows} 行 · {h.ms}ms</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
