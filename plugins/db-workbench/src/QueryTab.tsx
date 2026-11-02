/**
 * QueryTab.tsx —— SQL 查询：编辑器 + 护栏状态条 + 结果表 + 导出 + 历史
 * 写模式是「临时开关」（仅本 Tab 会话内有效，且连接本身必须 allowWrite）。
 */
import { useEffect, useRef, useState } from 'react'
import { SvcClient, downloadCsv, downloadJson, type Profile, type QueryResult } from './model'
import type { Toast } from './Panel'

interface HistItem {
  id: string; profileId: string; profileName: string; kind: string
  ok: boolean; ms: number; rows: number; error: string; sql: string; at: number
}

export default function QueryTab({ svc, profiles, selectedId, setSelectedId, showToast }: {
  svc: SvcClient
  profiles: Profile[]
  selectedId: string
  setSelectedId: (id: string) => void
  showToast: Toast
}) {
  const sqlTypes = profiles.filter((p) => p.type !== 'redis')
  const [profileId, setProfileId] = useState(selectedId || (sqlTypes[0] && sqlTypes[0].id) || '')
  const [sql, setSql] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [running, setRunning] = useState(false)
  const [writeMode, setWriteMode] = useState(false)
  const [hist, setHist] = useState<HistItem[]>([])
  const [showHist, setShowHist] = useState(false)
  const [sessionPassword, setSessionPassword] = useState('')
  const [needPassword, setNeedPassword] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (selectedId && selectedId !== profileId) setProfileId(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const refreshHist = () => {
    svc.history().then((items) => setHist(items)).catch(() => {})
  }
  useEffect(() => { refreshHist() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const profile = sqlTypes.find((p) => p.id === profileId) || null
  const canWrite = profile !== null && !profile.readonly && profile.allowWrite

  const run = async (confirmOverride?: boolean) => {
    if (!profile) { showToast('先选择一个连接', true); return }
    if (!sql.trim()) { showToast('SQL 为空', true); return }
    setRunning(true)
    try {
      const r = await svc.query(profile.id, sql, {
        writeMode: writeMode && canWrite,
        confirm: confirmOverride === true,
        password: sessionPassword || undefined,
      })
      setResult(r)
      if (r.ok) {
        setNeedPassword(false)
        refreshHist()
      } else if (r.error && /未保存密码|password/i.test(r.error)) {
        setNeedPassword(true)
      }
      if (r.needsConfirm) showToast('DROP/TRUNCATE 需要确认后重发', true)
    } catch (e: any) {
      setResult({ ok: false, error: e.message || String(e) })
    } finally {
      setRunning(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void run()
    }
  }

  const p = result && result.ok ? result : null

  return (
    <div>
      <div className="dbw-sec">
        <div className="dbw-bar" />
        查询
        <span className="dbw-hint">Ctrl+Enter 执行</span>
      </div>

      <div className="dbw-card">
        <div className="dbw-card-b">
          <div className="dbw-row" style={{ marginBottom: 8 }}>
            <select
              className="dbw-sel"
              value={profileId}
              onChange={(e) => { setProfileId(e.target.value); setSelectedId(e.target.value); setResult(null) }}
              style={{ minWidth: 150 }}
            >
              {sqlTypes.length === 0 && <option value="">（无 SQL 连接）</option>}
              {sqlTypes.map((x) => (
                <option key={x.id} value={x.id}>{x.name}（{x.readonly ? '只读' : '可开写'}）</option>
              ))}
            </select>
            {canWrite && (
              <label className="dbw-chk" title="仅本次会话；每次执行仍受护栏约束">
                <input type="checkbox" checked={writeMode} onChange={(e) => setWriteMode(e.target.checked)} />
                写模式
              </label>
            )}
            {profile && !profile.readonly && !profile.allowWrite && (
              <span className="dbw-tag y">连接未开 allowWrite</span>
            )}
            {profile && profile.readonly && <span className="dbw-tag g">只读连接</span>}
            <div style={{ marginLeft: 'auto' }}>
              <button className="dbw-btn sm ghost" onClick={() => setShowHist((v) => !v)}>历史({hist.length})</button>
            </div>
          </div>

          {needPassword && (
            <div className="dbw-row" style={{ marginBottom: 8 }}>
              <span className="dbw-lbl">该连接未存密码，本次输入：</span>
              <input className="dbw-inp" type="password" style={{ maxWidth: 200 }} value={sessionPassword}
                onChange={(e) => setSessionPassword(e.target.value)} placeholder="会话内使用，不落盘" />
            </div>
          )}

          <textarea
            ref={editorRef}
            className="dbw-editor"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={'SELECT * FROM orders ORDER BY amount DESC LIMIT 20\n\n只读连接仅放行 SELECT/SHOW/DESCRIBE/EXPLAIN；\n写模式仍拒绝无 WHERE 的 UPDATE/DELETE。'}
            spellCheck={false}
          />

          <div className="dbw-row" style={{ marginTop: 8 }}>
            <button className="dbw-btn" disabled={running || !profile} onClick={() => void run()}>
              {running ? '执行中…' : '▶ 执行'}
            </button>
            <button className="dbw-btn ghost" disabled={!sql} onClick={() => { setSql(''); setResult(null) }}>清空</button>
            {result && result.needsConfirm && (
              <button className="dbw-btn danger" onClick={() => void run(true)}>⚠ 确认执行 {result.kind === 'ddl' ? 'DROP/TRUNCATE' : ''}</button>
            )}
            {p && (
              <span className="dbw-hint">
                {p.rowCount} 行 · {p.ms}ms {p.truncated ? ' · 已截断(超上限)' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {showHist && (
        <div className="dbw-card">
          <div className="dbw-card-b">
            <div className="dbw-row">
              <b style={{ fontSize: 12 }}>查询历史（新→旧）</b>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button className="dbw-btn ghost sm" onClick={() => { void svc.clearHistory().then(refreshHist) }}>清空历史</button>
                <button className="dbw-btn ghost sm" onClick={() => setShowHist(false)}>收起</button>
              </div>
            </div>
            <div style={{ marginTop: 6, maxHeight: 200, overflowY: 'auto' }}>
              {hist.length === 0 && <div className="dbw-sub">暂无历史。</div>}
              {hist.map((h) => (
                <div key={h.id} className="dbw-tree-i" onClick={() => { setSql(h.sql); setShowHist(false) }}>
                  <span style={{ color: h.ok ? '#3FB950' : '#F85149' }}>{h.ok ? '✓' : '✗'}</span>
                  <span className="dbw-tag">{h.kind}</span>
                  <span style={{ fontSize: 11, color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{h.sql}</span>
                  <span className="dbw-sub" style={{ marginLeft: 'auto' }}>{h.ok ? `${h.rows}行 ${h.ms}ms` : (h.error || '').slice(0, 40)}</span>
                </div>
              ))}
            </div>
            <div className="dbw-sub" style={{ marginTop: 4 }}>点击历史条目可回填 SQL。</div>
          </div>
        </div>
      )}

      {result && !result.ok && (
        <div className="dbw-card">
          <div className="dbw-err" style={{ padding: 10 }}>{result.error}</div>
        </div>
      )}

      {p && p.rows && p.rows.length > 0 && (
        <>
          <div className="dbw-sec">
            <div className="dbw-bar" />
            结果
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className="dbw-btn ghost sm" onClick={() => downloadCsv(p.columns || [], p.rows || [], `query-${Date.now()}.csv`)}>导出 CSV</button>
              <button className="dbw-btn ghost sm" onClick={() => downloadJson(p.rows, `query-${Date.now()}.json`)}>导出 JSON</button>
            </div>
          </div>
          <div style={{ margin: '0 16px 10px' }}>
            <div className="dbw-tblwrap">
              <table className="dbw-table">
                <thead>
                  <tr>{(p.columns || []).map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {p.rows.map((row, i) => (
                    <tr key={i}>
                      {(p.columns || []).map((c) => {
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
      {p && p.rows && p.rows.length === 0 && (
        <div className="dbw-empty">执行成功，0 行结果。</div>
      )}
    </div>
  )
}
