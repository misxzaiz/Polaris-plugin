/**
 * 数据浏览 Tab：库选择 + 表清单 + 数据网格（分页/WHERE 过滤/点列头排序）。
 * 连接只读——改动数据走 SQL 查询 Tab 的两步写。
 */
import { useCallback, useEffect, useState } from 'react'
import { svcFetch, withSvc, fmtBytes, fmtDbPath, type LibEntry, type MetaReply, type ShapedCell } from './model'

interface SchemaReply {
  ok: boolean; error?: string
  objects?: Array<{ type: string; name: string }>
  columns?: Array<{ name: string; type: string; pk: number }>; rowCount?: number | null
}
interface RowsReply {
  ok: boolean; error?: string
  table?: string; total?: number; offset?: number
  columns?: string[]; rows?: ShapedCell[][]; truncated?: boolean
}
interface OpenByPathReply { ok: boolean; error?: string; dbId?: string }

const PAGE = 100

export default function BrowseTab({ libs, reply, onChanged }: {
  libs: LibEntry[]; reply: MetaReply | null; onChanged: () => void
}) {
  const [dbId, setDbId] = useState('')
  const [table, setTable] = useState('')
  const [where, setWhere] = useState('')
  const [orderBy, setOrderBy] = useState('')
  const [desc, setDesc] = useState(false)
  const [offset, setOffset] = useState(0)
  const [schema, setSchema] = useState<SchemaReply | null>(null)
  const [rows, setRows] = useState<RowsReply | null>(null)
  const [err, setErr] = useState('')
  const [pathInput, setPathInput] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!dbId && libs.length) { setDbId(libs[0].dbId); setTable(''); }
  }, [libs, dbId])

  const loadSchema = useCallback(async (id: string) => {
    if (!id) { setSchema(null); return }
    try {
      const r = await withSvc((m) => svcFetch<SchemaReply>(m, '/api/schema', { dbId: id }))
      setSchema(r)
      if (!r.ok) setErr(r.error || 'schema 读取失败')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [])

  const loadRows = useCallback(async (id: string, tbl: string, opts?: { where?: string; orderBy?: string; desc?: boolean; offset?: number }) => {
    if (!id || !tbl) { setRows(null); return }
    setLoading(true)
    try {
      const r = await withSvc((m) => svcFetch<RowsReply>(m, '/api/rows', {
        dbId: id, table: tbl,
        where: opts?.where || undefined, orderBy: opts?.orderBy || undefined, desc: opts?.desc,
        offset: opts?.offset ?? 0, limit: PAGE,
      }))
      setRows(r)
      if (!r.ok) setErr(r.error || '查询失败'); else setErr('')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (dbId) { loadSchema(dbId); setTable(''); setRows(null); setOffset(0); setWhere(''); setOrderBy('') }
  }, [dbId, loadSchema])

  useEffect(() => {
    if (dbId && table) loadRows(dbId, table, { where, orderBy, desc, offset })
  }, [dbId, table, where, orderBy, desc, offset, loadRows])

  const openByPath = useCallback(async () => {
    const p = pathInput.trim()
    if (!p) return
    setErr('')
    try {
      const r = await withSvc((m) => svcFetch<OpenByPathReply>(m, '/api/open', { path: p }))
      if (!r.ok || !r.dbId) { setErr(r.error || '打开失败'); return }
      setPathInput(''); onChanged()
      setDbId(r.dbId)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [pathInput, onChanged])

  const curLib = libs.find((l) => l.dbId === dbId)
  const tables = (schema?.objects || []).filter((o) => o.type === 'table')
  const total = rows?.total ?? 0

  const sortBy = (col: string) => {
    if (orderBy === col) { if (!desc) setDesc(true); else { setOrderBy(''); setDesc(false) } }
    else { setOrderBy(col); setDesc(false) }
    setOffset(0)
  }

  return (
    <div>
      <div className="sl-sec"><span className="sl-bar" />数据浏览<span className="sl-hint">只读连接 · 改数据去「SQL 查询」走两步写</span></div>
      <div className="sl-lib-pick">
        {libs.length === 0 && <span className="sl-sub">还没有打开过库——去「库雷达」扫描，或粘贴路径：</span>}
        {libs.map((l) => (
          <button key={l.dbId} className={`sl-pill ${dbId === l.dbId ? 'on' : ''}`} onClick={() => setDbId(l.dbId)} title={l.path}>
            {l.label} · {fmtBytes(l.sizeBytes)}{l.knownAs ? ` · ${l.knownAs}` : ''}
          </button>
        ))}
        <input
          className="sl-inp sl-mono" style={{ maxWidth: 320 }}
          placeholder="直接打开：C:\\path\\to.db"
          value={pathInput} onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') openByPath() }}
        />
        <button className="sl-btn sm" onClick={openByPath}>打开</button>
      </div>
      {err ? <div className="sl-err">{err}</div> : null}

      {curLib && (
        <>
          {schema && schema.ok && (
            <div className="sl-lib-pick">
              {tables.length === 0 && <span className="sl-sub">库中没有表</span>}
              {tables.map((t) => (
                <button key={t.name} className={`sl-pill ${table === t.name ? 'on' : ''}`} onClick={() => { setTable(t.name); setOffset(0); setWhere(''); setOrderBy('') }}>{t.name}</button>
              ))}
            </div>
          )}

          {table && (
            <div className="sl-card">
              <div className="sl-card-b">
                <div className="sl-row">
                  <span className="sl-tag">{table}</span>
                  {typeof total === 'number' && <span className="sl-sub">{total.toLocaleString()} 行</span>}
                  <input
                    className="sl-inp sl-grow sl-mono" style={{ maxWidth: 300 }}
                    placeholder="WHERE 过滤（如 age > 18）"
                    value={where} onChange={(e) => { setWhere(e.target.value); setOffset(0) }}
                  />
                </div>
              </div>
              {loading ? <div className="sl-empty">加载中…</div>
                : rows && rows.ok && rows.rows ? (
                  rows.rows.length === 0 ? <div className="sl-empty">0 行</div> : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="sl-grid">
                        <thead><tr>
                          {rows.columns?.map((c) => (
                            <th key={c} onClick={() => sortBy(c)} title="点击排序">
                              {c}{orderBy === c ? (desc ? ' ↓' : ' ↑') : ''}
                            </th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {rows.rows.map((r, i) => (
                            <tr key={i}>
                              {r.map((cell, j) => (
                                <td key={j} title={cell.v || ''}>
                                  {cell.t === 'null' ? <span className="sl-null">NULL</span>
                                    : cell.t === 'blob' ? <span className="sl-blob">{cell.v}</span>
                                      : <>{cell.v}{cell.trunc ? <span className="sl-trunc">…{cell.trunc}字符</span> : null}</>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : rows && !rows.ok ? <div className="sl-err">{rows.error}</div> : null}
              {rows && rows.ok && total > PAGE && (
                <div className="sl-card-b sl-row" style={{ borderTop: '1px solid #1B2029' }}>
                  <button className="sl-btn sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>上一页</button>
                  <span className="sl-sub">{offset + 1}–{Math.min(offset + PAGE, total)} / {total.toLocaleString()}</span>
                  <button className="sl-btn sm" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>下一页</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {reply && !reply.bridgeOk ? <div className="sl-empty">宿主桥未就绪（清单暂不可用）</div> : null}
    </div>
  )
}
