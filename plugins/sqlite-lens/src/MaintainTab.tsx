/**
 * 维护 Tab：库统计（页/膨胀/可回收空间）+ 完整性检查 + 手动备份 + VACUUM。
 * VACUUM 与备份都是写级操作：VACUUM 前强制备份；审计全部留痕。
 */
import { useCallback, useEffect, useState } from 'react'
import { svcFetch, withSvc, fmtBytes, timeAgo, type LibEntry, type MetaReply } from './model'

interface StatsReply {
  ok: boolean; error?: string
  fileSize?: number; pageSize?: number; pageCount?: number; freelistPages?: number
  reclaimableBytes?: number; journalMode?: string; walSize?: number
  counts?: { tables: number; views: number; indexes: number; triggers: number }
  hint?: string | null
}
interface IntegrityReply { ok: boolean; error?: string; healthy?: boolean; lines?: string[] }
interface MaintainReply { ok: boolean; error?: string; dest?: string; size?: number; beforeBytes?: number; afterBytes?: number; freedBytes?: number }

export default function MaintainTab({ libs, reply, onChanged, onGoto }: {
  libs: LibEntry[]; reply: MetaReply | null; onChanged: () => void
  onGoto: (tab: 'radar' | 'browse' | 'query' | 'maintain' | 'settings') => void
}) {
  const [dbId, setDbId] = useState('')
  const [stats, setStats] = useState<StatsReply | null>(null)
  const [integrity, setIntegrity] = useState<IntegrityReply | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [vacConfirm, setVacConfirm] = useState(false)

  useEffect(() => {
    if (!dbId && libs.length) setDbId(libs[0].dbId)
  }, [libs, dbId])

  const load = useCallback(async (id: string) => {
    if (!id) { setStats(null); setIntegrity(null); return }
    setVacConfirm(false)
    try {
      const [s, c] = await Promise.all([
        withSvc((m) => svcFetch<StatsReply>(m, '/api/stats', { dbId: id })),
        withSvc((m) => svcFetch<IntegrityReply>(m, '/api/integrity', { dbId: id })),
      ])
      setStats(s); setIntegrity(c)
      if (!s.ok) setErr(s.error || '统计失败'); else setErr('')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [])

  useEffect(() => { load(dbId) }, [dbId, load])

  const doMaintain = useCallback(async (op: 'backup' | 'vacuum') => {
    setErr(''); setMsg('')
    try {
      const r = await withSvc((m) => svcFetch<MaintainReply>(m, '/api/maintain', { dbId, op }))
      if (r.ok) {
        if (op === 'backup') setMsg(`备份完成 → ${r.dest}（${fmtBytes(r.size)}）`)
        else setMsg(`VACUUM 完成：${fmtBytes(r.beforeBytes)} → ${fmtBytes(r.afterBytes)}（释放 ${fmtBytes(r.freedBytes)}），备份在 ${r.dest}`)
        onChanged(); load(dbId)
      } else setErr(r.error || '操作失败')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setVacConfirm(false) }
  }, [dbId, load, onChanged])

  const curLib = libs.find((l) => l.dbId === dbId)
  const pendings = reply?.pendingList || []

  return (
    <div>
      <div className="sl-sec"><span className="sl-bar" />维护<span className="sl-hint">统计 / 完整性 / 备份 / VACUUM</span></div>
      <div className="sl-lib-pick">
        {libs.map((l) => (
          <button key={l.dbId} className={`sl-pill ${dbId === l.dbId ? 'on' : ''}`} onClick={() => setDbId(l.dbId)} title={l.path}>{l.label}</button>
        ))}
        {!libs.length && <span className="sl-sub">先打开一个库</span>}
      </div>

      {err ? <div className="sl-err">{err}</div> : null}
      {msg ? <div className="sl-card"><div className="sl-card-b"><span className="sl-badge good">{msg}</span></div></div> : null}

      {pendings.length > 0 && (
        <div className="sl-pend-banner">
          <b>⚠ 有 {pendings.length} 张待确认写单</b>
          {pendings.map((p) => (
            <div key={p.id} className="sl-sub sl-mono" style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.sql}>
              · {p.sql}（影响 {p.preview.changes === null ? '—' : `${p.preview.changes} 行`}，{timeAgo(p.createdAt)}）— 用顶部横幅按钮处理
            </div>
          ))}
        </div>
      )}

      {curLib && stats && stats.ok && (
        <div className="sl-card">
          <div className="sl-card-b">
            <div className="sl-kv"><span className="k">文件</span><span className="v">{curLib.path}</span></div>
            <div className="sl-kv"><span className="k">大小</span><span className="v">{fmtBytes(stats.fileSize)}（{stats.pageCount?.toLocaleString()} 页 × {stats.pageSize}B）</span></div>
            <div className="sl-kv"><span className="k">journal</span><span className="v">{stats.journalMode} · WAL {fmtBytes(stats.walSize)}</span></div>
            <div className="sl-kv"><span className="k">空闲页</span><span className="v">{stats.freelistPages} 页（可回收 <b style={{ color: (stats.reclaimableBytes || 0) > 1024 * 1024 ? '#D29922' : undefined }}>{fmtBytes(stats.reclaimableBytes)}</b>）</span></div>
            <div className="sl-kv"><span className="k">对象</span><span className="v">表 {stats.counts?.tables} · 视图 {stats.counts?.views} · 索引 {stats.counts?.indexes} · 触发器 {stats.counts?.triggers}</span></div>
            {stats.hint ? <div className="sl-sub" style={{ marginTop: 6 }}>{stats.hint}</div> : null}
            {integrity && integrity.ok && (
              <div className="sl-kv"><span className="k">完整性</span><span className="v">
                <span className={`sl-badge ${integrity.healthy ? 'good' : 'warn'}`}>{integrity.healthy ? 'quick_check 通过' : '有问题'}</span>
                {integrity.lines && !integrity.healthy ? <div className="sl-sub sl-mono">{integrity.lines.join('\n')}</div> : null}
              </span></div>
            )}
            <div className="sl-row" style={{ marginTop: 10 }}>
              <button className="sl-btn" onClick={() => doMaintain('backup')}>立即备份</button>
              {!vacConfirm
                ? <button className="sl-btn" disabled={(stats.reclaimableBytes || 0) === 0 && (stats.freelistPages || 0) === 0} onClick={() => setVacConfirm(true)}>VACUUM 瘦身</button>
                : (
                  <span className="sl-row">
                    <button className="sl-btn danger" onClick={() => doMaintain('vacuum')}>确认 VACUUM（先自动备份）</button>
                    <button className="sl-btn sm" onClick={() => setVacConfirm(false)}>再想想</button>
                  </span>
                )}
              <button className="sl-btn sm" onClick={() => onGoto('browse')}>去浏览数据 →</button>
            </div>
          </div>
        </div>
      )}

      <div className="sl-sec"><span className="sl-bar" />审计日志<span className="sl-hint">写操作全留痕（跨端共享，最近 100 条）</span></div>
      {(reply?.audit || []).length === 0
        ? <div className="sl-empty">还没有写操作记录——所有写入/备份/打开都会留痕在这里</div>
        : (
          <div className="sl-card">
            {(reply?.audit || []).slice(0, 30).map((a, i) => (
              <div key={i} className="sl-card-b" style={{ padding: '7px 13px', borderBottom: '1px solid #1B2029' }}>
                <div className="sl-row">
                  <span className={`sl-badge ${a.status === 'committed' ? 'good' : a.status === 'failed' ? 'bad' : 'info'}`}>{a.status}</span>
                  <span className="sl-grow sl-mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.sql}>{a.sql}</span>
                  <span className="sl-tag">{timeAgo(a.at)}</span>
                </div>
                <div className="sl-sub" style={{ marginTop: 2 }}>
                  {a.dbPath}{a.changes !== null && a.changes !== undefined ? ` · 影响 ${a.changes} 行` : ''}{a.backupPath ? ` · 备份 ${a.backupPath}` : ''}{a.error ? ` · ${a.error}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
