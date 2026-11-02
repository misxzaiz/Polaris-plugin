/**
 * SchemaTab.tsx —— 结构浏览：schema 列表 → 表列表 → 列/索引/DDL + 数据预览
 */
import { useCallback, useEffect, useState } from 'react'
import { SvcClient, downloadCsv, fmtBytes, type Profile, type TableInfo, type DescribeResult, type QueryResult } from './model'
import type { Toast } from './Panel'

export default function SchemaTab({ svc, profiles, selectedId, setSelectedId, showToast }: {
  svc: SvcClient
  profiles: Profile[]
  selectedId: string
  setSelectedId: (id: string) => void
  showToast: Toast
}) {
  const sqlTypes = profiles.filter((p) => p.type !== 'redis')
  const [profileId, setProfileId] = useState(selectedId || (sqlTypes[0] && sqlTypes[0].id) || '')
  const [schemas, setSchemas] = useState<string[]>([])
  const [schema, setSchema] = useState('')
  const [tables, setTables] = useState<TableInfo[]>([])
  const [table, setTable] = useState('')
  const [desc, setDesc] = useState<DescribeResult | null>(null)
  const [preview, setPreview] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState('')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (selectedId && selectedId !== profileId) setProfileId(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const profile = sqlTypes.find((p) => p.id === profileId) || null

  // 1) 连接变化 → 拉 schemas
  useEffect(() => {
    if (!profile) { setSchemas([]); setSchema(''); setTables([]); setTable(''); setDesc(null); setPreview(null); return }
    let alive = true
    setLoading('schemas')
    svc.schemas(profile.id)
      .then((items) => {
        if (!alive) return
        setSchemas(items)
        const def = profile.type === 'mysql' ? (profile.database || items[0] || '') : (items.includes('public') ? 'public' : items[0] || '')
        setSchema(def)
      })
      .catch((e) => showToast(e.message, true))
      .finally(() => alive && setLoading(''))
    return () => { alive = false }
  }, [profileId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 2) schema 变化 → 拉表
  const loadTables = useCallback((sch: string) => {
    if (!profile || !sch) { setTables([]); return }
    setLoading('tables')
    svc.tables(profile.id, sch)
      .then((items) => setTables(items))
      .catch((e) => showToast(e.message, true))
      .finally(() => setLoading(''))
  }, [profile, svc, showToast])

  useEffect(() => { loadTables(schema) }, [schema, loadTables])

  // 3) 表变化 → describe + preview
  useEffect(() => {
    if (!profile || !table) { setDesc(null); setPreview(null); return }
    let alive = true
    setLoading('desc')
    Promise.all([
      svc.describe(profile.id, schema, table),
      svc.preview(profile.id, schema, table, 50),
    ])
      .then(([d, pv]) => {
        if (!alive) return
        setDesc(d)
        setPreview(pv.ok ? pv : { ok: false, error: pv.error })
      })
      .catch((e) => alive && showToast(e.message, true))
      .finally(() => alive && setLoading(''))
    return () => { alive = false }
  }, [table, schema, profileId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sqlTypes.length) {
    return <div className="dbw-empty">还没有 MySQL / PostgreSQL 连接。<br />先在「连接」里创建。</div>
  }

  const shownTables = tables.filter((t) => !filter || t.name.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div>
      <div className="dbw-sec">
        <div className="dbw-bar" />
        结构
        <span className="dbw-hint">行数为引擎估算值</span>
      </div>

      <div className="dbw-card">
        <div className="dbw-card-b">
          <div className="dbw-row">
            <select className="dbw-sel" value={profileId} onChange={(e) => { setProfileId(e.target.value); setSelectedId(e.target.value); setTable('') }} style={{ minWidth: 140 }}>
              {sqlTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <select className="dbw-sel" value={schema} onChange={(e) => { setSchema(e.target.value); setTable('') }} style={{ maxWidth: 160 }}>
              {schemas.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="dbw-inp" style={{ maxWidth: 160 }} placeholder="过滤表名…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            {loading && <span className="dbw-sub">加载中…</span>}
          </div>
        </div>
      </div>

      {shownTables.length > 0 && (
        <div className="dbw-card">
          <div className="dbw-tree" style={{ padding: '6px 4px', maxHeight: 260, overflowY: 'auto' }}>
            {shownTables.map((t) => (
              <div key={t.name} className={`dbw-tree-i ${table === t.name ? 'on' : ''}`} onClick={() => setTable(t.name)}>
                <span className="dbw-tag" style={{ minWidth: 34, textAlign: 'center' }}>{t.type === 'VIEW' || t.type.includes('VIEW') ? '视图' : '表'}</span>
                <span style={{ color: '#E6EAF2' }}>{t.name}</span>
                <span className="dbw-sub" style={{ marginLeft: 'auto' }}>
                  {t.estRows != null ? `~${t.estRows}行` : ''} {fmtBytes(t.bytes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {desc && (
        <>
          <div className="dbw-sec"><div className="dbw-bar" />{schema}.{table} 的列 <span className="dbw-hint">{desc.columns.length} 列</span></div>
          <div style={{ margin: '0 16px 10px' }}>
            <div className="dbw-tblwrap" style={{ maxHeight: 240 }}>
              <table className="dbw-table">
                <thead><tr><th>列</th><th>类型</th><th>可空</th><th>默认</th><th>键</th><th>注释</th></tr></thead>
                <tbody>
                  {desc.columns.map((c) => (
                    <tr key={c.name}>
                      <td style={{ color: '#E6EAF2' }}>{c.name}</td>
                      <td>{c.type}</td>
                      <td className={c.nullable ? '' : 'dbw-null'}>{c.nullable ? 'YES' : 'NO'}</td>
                      <td className="dbw-null">{c.defaultValue == null ? 'NULL' : String(c.defaultValue)}</td>
                      <td>{c.key || ''}</td>
                      <td>{c.comment || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {desc.indexes.length > 0 && (
            <div className="dbw-card">
              <div className="dbw-card-b">
                <b style={{ fontSize: 12 }}>索引（{desc.indexes.length}）</b>
                {desc.indexes.map((i) => (
                  <div key={i.name} className="dbw-sub" style={{ marginTop: 3 }}>
                    <span className="dbw-tag" style={{ marginRight: 6 }}>{i.unique ? 'UNIQUE' : 'INDEX'}</span>
                    <span className="dbw-kbd">{i.ddl ? i.ddl : `${i.name}(${(i.columns || []).join(', ')})`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {preview && preview.ok && preview.rows && (
        <>
          <div className="dbw-sec">
            <div className="dbw-bar" />
            预览前 {preview.rowCount} 行
            <div style={{ marginLeft: 'auto' }}>
              <button className="dbw-btn ghost sm" onClick={() => downloadCsv(preview.columns || [], preview.rows || [], `${table}-preview.csv`)}>导出 CSV</button>
            </div>
          </div>
          <div style={{ margin: '0 16px 10px' }}>
            <div className="dbw-tblwrap">
              <table className="dbw-table">
                <thead><tr>{(preview.columns || []).map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i}>
                      {(preview.columns || []).map((c) => {
                        const v = row[c]
                        return <td key={c} className={v == null ? 'dbw-null' : ''} title={v == null ? '' : String(v)}>{v == null ? 'NULL' : String(v)}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {table && !loading && (!preview || !preview.ok) && (
        <div className="dbw-err">{preview && !preview.ok ? preview.error : '预览加载失败'}</div>
      )}
    </div>
  )
}
