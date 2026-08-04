import { useState, useEffect, useCallback } from 'react'

interface Link { id: string; url: string; title: string; tags: string[]; desc: string; createdAt: number }

export default function LinkPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void
}) {
  const [links, setLinks] = useState<Link[]>([])
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = useCallback(() => {
    try { const raw = localStorage.getItem('polaris.link.links'); if (raw) setLinks(JSON.parse(raw)) } catch { /* ignore */ }
  }, [])
  useEffect(() => { refresh() }, [refresh])
  const persist = (n: Link[]) => { setLinks(n); localStorage.setItem('polaris.link.links', JSON.stringify(n)) }

  const tags = Array.from(new Set(links.flatMap(l => l.tags)))
  const filtered = links.filter(l =>
    (!query || (l.url + l.title + l.desc).toLowerCase().includes(query.toLowerCase())) &&
    (!tag || l.tags.includes(tag))
  )

  const add = () => {
    const url = prompt('URL'); if (!url) return
    const title = prompt('标题') || url
    const tagsStr = prompt('标签（逗号分隔）') || ''
    persist([{ id: 'l' + Date.now().toString(36), url, title, tags: tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean), desc: '', createdAt: Date.now() }, ...links])
    setMsg('✓ 已添加')
  }
  const del = (id: string) => { if (confirm('删除？')) persist(links.filter(l => l.id !== id)) }
  const askAI = () => { if (query) onSendToChat?.(`请用 link-vault 的 search_links 工具搜索："${query}"`) }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13 }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #3F3F46', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索…" style={{ flex: 1, minWidth: 80, padding: '4px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 11, outline: 'none' }} />
        <select value={tag} onChange={(e) => setTag(e.target.value)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 11 }}>
          <option value="">全部</option>
          {tags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={add} style={btnStyle}>+</button>
        <button onClick={askAI} disabled={!query} style={{ ...btnStyle, opacity: query ? 1 : 0.4 }}>AI 查</button>
      </div>
      {msg && <div style={{ padding: '4px 10px', color: msg.startsWith('✓') ? '#10B981' : '#EF4444', fontSize: 11 }}>{msg}</div>}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {filtered.length === 0 ? <div style={{ color: '#8E8E93', textAlign: 'center', padding: 24, fontSize: 11 }}>暂无书签</div> :
          filtered.map(l => (
            <div key={l.id} style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: '#25252B', border: '1px solid #3F3F46' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <a href={l.url} target="_blank" rel="noopener" style={{ fontSize: 13, fontWeight: 500, color: '#3B82F6', textDecoration: 'none' }}>{l.title}</a>
                <button onClick={() => del(l.id)} style={{ ...btnStyle, padding: '2px 6px', fontSize: 10 }}>✕</button>
              </div>
              <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2, wordBreak: 'break-all' }}>{l.url}</div>
              {l.tags.length > 0 && <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>{l.tags.map(t => <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#3B82F622', color: '#3B82F6' }}>{t}</span>)}</div>}
            </div>
          ))
        }
      </div>
    </div>
  )
}
const btnStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#F8F8F8', fontSize: 11, cursor: 'pointer' }
