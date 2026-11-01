/**
 * 库雷达 Tab：扫描常见目录/指定根，发现 .db/.sqlite 文件（读魔数区分真库），
 * 一键打开进浏览。扫描在服务端预算制执行（默认 4s，可加到 15s）。
 */
import { useCallback, useState } from 'react'
import { svcFetch, withSvc, fmtBytes, timeAgo, type RadarItem } from './model'

interface RadarReply { ok: boolean; items?: RadarItem[]; partial?: boolean; walked?: number; denied?: number; elapsedMs?: number; error?: string }

export default function RadarTab({ onOpened }: { onOpened: () => void }) {
  const [root, setRoot] = useState('')
  const [budget, setBudget] = useState(4)
  const [items, setItems] = useState<RadarItem[] | null>(null)
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [opening, setOpening] = useState('')

  const scan = useCallback(async () => {
    setBusy(true); setErr(''); setInfo('')
    try {
      const r = await withSvc((m) => svcFetch<RadarReply>(m, '/api/radar', {
        root: root.trim() || undefined, budgetMs: Math.round(budget * 1000),
      }))
      if (r.ok && r.items) {
        setItems(r.items)
        setInfo(`扫描 ${r.walked || 0} 个目录 · ${r.elapsedMs || 0}ms${r.partial ? ' · 预算内未扫完（可加大预算或指定根）' : ''}`)
      } else setErr(r.error || '扫描失败')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [root, budget])

  const openOne = useCallback(async (path: string) => {
    setOpening(path); setErr('')
    try {
      const r = await withSvc((m) => svcFetch<{ ok: boolean; error?: string }>(m, '/api/open', { path }))
      if (!r.ok) setErr(r.error || '打开失败')
      else onOpened()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setOpening('')
    }
  }, [onOpened])

  return (
    <div>
      <div className="sl-sec"><span className="sl-bar" />库雷达<span className="sl-hint">找磁盘上的 SQLite 库文件（.db/.sqlite/.sqlite3…）</span></div>
      <div className="sl-card">
        <div className="sl-card-b">
          <div className="sl-row">
            <input
              className="sl-inp sl-grow sl-mono"
              placeholder="可选：指定扫描根（如 D:\\space）；不填扫常见目录（用户目录/下载/文档/AppData）"
              value={root}
              onChange={(e) => setRoot(e.target.value)}
            />
          </div>
          <div className="sl-row" style={{ marginTop: 8 }}>
            <span className="sl-sub">预算 {budget}s</span>
            <input type="range" min={1} max={15} value={budget} onChange={(e) => setBudget(Number(e.target.value))} style={{ width: 120 }} />
            <button className="sl-btn primary" disabled={busy} onClick={scan}>{busy ? '扫描中…' : '扫描'}</button>
            {info ? <span className="sl-hint">{info}</span> : null}
          </div>
        </div>
      </div>

      {err ? <div className="sl-err">{err}</div> : null}

      {items !== null && (items.length === 0 ? (
        <div className="sl-empty">没找到库文件候选——加大预算、换根目录，或直接在「数据浏览」粘贴路径打开</div>
      ) : (
        <>
          <div className="sl-sec"><span className="sl-bar" />找到 {items.length} 个候选<span className="sl-hint">已读文件头验证 · 按大小排序</span></div>
          {items.map((it) => (
            <div key={it.path} className="sl-card">
              <div className="sl-card-b">
                <div className="sl-row">
                  <span className="sl-grow" style={{ overflow: 'hidden' }}>
                    <div className="sl-mono" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.path}>{it.path}</div>
                    <div className="sl-sub">
                      {fmtBytes(it.sizeBytes)} · 修改于 {timeAgo(it.mtimeMs)}
                      {it.sqlite === true ? ' · SQLite 魔数 ✓' : it.sqlite === false ? ' · ⚠ 非 SQLite（同扩展名）' : ''}
                    </div>
                  </span>
                  {it.sqlite !== false && (
                    <button className="sl-btn sm" disabled={opening === it.path} onClick={() => openOne(it.path)}>
                      {opening === it.path ? '打开中…' : '打开'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </>
      ))}
    </div>
  )
}
