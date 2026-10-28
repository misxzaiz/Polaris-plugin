/**
 * 搜索 Tab：查询输入 + 扩展名筛选片 + 结果（片段高亮）+ 预览抽屉 + 最近搜索
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiRead, apiSearch, clearRecent, loadRecent, pushRecent,
  ServiceUnavailableError,
  type ReadResp, type SearchResult, type WeibianStats,
} from './model'

const CATS: [string, string][] = [
  ['', '全部'],
  ['text', '文档'],
  ['code', '代码'],
  ['pdf', 'PDF'],
  ['docx', 'Word'],
  ['html', '网页'],
]

function Snippet({ text, hits }: { text: string, hits: { s: number, e: number }[] }) {
  if (!text) return null
  const parts: React.ReactNode[] = []
  let cur = 0
  const sorted = [...hits].sort((a, b) => a.s - b.s)
  sorted.forEach((h, i) => {
    if (h.s < cur) return
    if (h.s > cur) parts.push(<span key={`t${i}`}>{text.slice(cur, h.s)}</span>)
    parts.push(<mark key={`m${i}`}>{text.slice(h.s, h.e)}</mark>)
    cur = h.e
  })
  if (cur < text.length) parts.push(<span key="tail">{text.slice(cur)}</span>)
  return <div className="wb-snip">{parts}</div>
}

export default function SearchTab({ stats }: { stats: WeibianStats | null }) {
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [total, setTotal] = useState(0)
  const [took, setTook] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const [preview, setPreview] = useState<{ path: string, resp: ReadResp | null, loading: boolean, offset: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadRecent().then(setRecent).catch(() => { }) }, [])

  const runSearch = useCallback(async (q: string, c: string) => {
    const raw = q.trim()
    if (!raw) return
    const query = c ? `${c === 'text' || c === 'code' || c === 'pdf' || c === 'docx' || c === 'html' ? 'ext:' + c + ' ' : ''}${raw}` : raw
    setBusy(true)
    setError('')
    try {
      const r = await apiSearch(query, 30)
      if (!r.ok) {
        setError(r.error || '检索失败')
        setResults(null)
      } else {
        setResults(r.results || [])
        setTotal(r.total || 0)
        setTook(r.took || 0)
        if (r.results && r.results.length) {
          pushRecent(raw).then(setRecent).catch(() => { })
        }
      }
    } catch (e) {
      setError(e instanceof ServiceUnavailableError ? e.message : String((e as Error).message || e))
      setResults(null)
    } finally {
      setBusy(false)
    }
  }, [])

  const onSubmit = useCallback(() => { runSearch(query, cat) }, [runSearch, query, cat])

  const openPreview = useCallback(async (path: string, offset = 0) => {
    setPreview({ path, resp: null, loading: true, offset })
    try {
      const resp = await apiRead(path, offset, 8000)
      setPreview((p) => (p && p.path === path ? { ...p, resp, loading: false } : p))
    } catch (e) {
      setPreview((p) => (p && p.path === path ? { ...p, resp: { ok: false, error: String((e as Error).message || e) }, loading: false } : p))
    }
  }, [])

  const noIndex = stats && stats.docs === 0 && !stats.scanning

  return (
    <div>
      <div className="wb-sec"><i className="wb-bar" />检索<span className="wb-hint">多词空格分隔 · ext:pdf dir:子目录 可过滤</span></div>
      <div style={{ padding: '0 18px 8px', display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          className="wb-inp"
          style={{ fontSize: 13, padding: '9px 12px' }}
          placeholder="在已索引的文档里找…（Enter 检索）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
        />
        <button className="wb-btn" onClick={onSubmit} disabled={busy || !query.trim()}>{busy ? '检索中…' : '检索'}</button>
      </div>
      <div className="wb-chiprow">
        {CATS.map(([k, label]) => (
          <button key={k || 'all'} className={`wb-chip${cat === k ? ' on' : ''}`}
            onClick={() => { setCat(k); if (query.trim()) runSearch(query, k) }}>{label}</button>
        ))}
      </div>

      {error && <div className="wb-alert bad" style={{ whiteSpace: 'pre-wrap' }}>{error}</div>}

      {noIndex && !results && !busy && (
        <div className="wb-empty">
          <b>索引还是空的</b>
          先到「索引」Tab 添加要收录的文件夹（如桌面、文档），<br />
          服务会自动扫描建立索引，之后这里就能搜、AI 也能帮你查。
        </div>
      )}

      {stats && stats.scanning && (
        <div className="wb-progress"><i style={{ width: stats.maxDocs ? `${Math.min(96, ((stats.maxDocs - stats.pending) / Math.max(1, stats.maxDocs)) * 100)}%` : '40%' }} /></div>
      )}

      {results && (
        <div className="wb-sec" style={{ paddingTop: 2 }}>
          <i className="wb-bar" />结果
          <span className="wb-hint">{total} 条命中 · {took}ms{total > results.length ? `（显示前 ${results.length}）` : ''}</span>
        </div>
      )}
      {results && results.length === 0 && (
        <div className="wb-empty">
          <b>没有命中</b>
          换更具体的词试试；或到「索引」Tab 确认目标文件夹已收录。<br />
          支持 ext:pdf / ext:code / dir:子目录名 过滤。
        </div>
      )}
      {(results || []).map((it) => (
        <div key={it.id} className="wb-item" onClick={() => openPreview(it.path)}>
          <div className="wb-item-head">
            <b>{it.name}</b>
            <span className="wb-badge">{it.cat}{it.ext ? `.${it.ext}` : ''}</span>
            <span className="wb-badge">相关 {it.score}</span>
          </div>
          <div className="wb-item-mid">{it.path}</div>
          <Snippet text={it.snippet.text} hits={it.snippet.hits} />
        </div>
      ))}

      {recent.length > 0 && !results && !busy && (
        <>
          <div className="wb-sec"><i className="wb-bar" />最近检索
            <button className="wb-btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => { clearRecent().then(() => setRecent([])).catch(() => { }) }}>清空</button>
          </div>
          <div className="wb-chiprow">
            {recent.map((q) => (
              <button key={q} className="wb-chip" onClick={() => { setQuery(q); runSearch(q, cat) }}>{q}</button>
            ))}
          </div>
        </>
      )}

      {preview && (
        <div className="wb-drawer" onClick={() => setPreview(null)}>
          <div className="wb-drawer-p" onClick={(e) => e.stopPropagation()}>
            <div className="wb-drawer-h">
              <b>{preview.path}</b>
              <button className="wb-btn ghost sm" onClick={() => { void navigator.clipboard?.writeText(preview.path) }}>复制路径</button>
              <button className="wb-btn ghost sm" onClick={() => setPreview(null)}>关闭</button>
            </div>
            {preview.loading && <div className="wb-empty">读取中…</div>}
            {!preview.loading && preview.resp && !preview.resp.ok && (
              <div className="wb-alert bad" style={{ margin: '12px 16px' }}>{preview.resp.error}</div>
            )}
            {!preview.loading && preview.resp && preview.resp.ok && (
              <>
                <div className="wb-drawer-b">{preview.resp.text}</div>
                <div className="wb-drawer-h" style={{ borderTop: '1px solid #1C2330', borderBottom: 'none', justifyContent: 'center', gap: 14 }}>
                  <small style={{ color: '#5C6678' }}>全文 {preview.resp.total} 字符{preview.resp.truncated ? `，本段止于 ${preview.offset + (preview.resp.text?.length || 0)}` : '（已到末尾）'}</small>
                  {preview.resp.truncated && (
                    <button className="wb-btn sm" onClick={() => openPreview(preview.path, preview.offset + (preview.resp?.text?.length || 0))}>续读下一段</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
