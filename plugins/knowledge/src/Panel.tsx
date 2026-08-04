import { useState, useEffect, useCallback } from 'react'

/**
 * Knowledge Base Panel
 * 搜索框 + 标签筛选 + 条目列表 + 编辑/添加。
 */

interface Note {
  id: string
  text: string
  tags: string[]
  source: string
  ts: number
}

export default function KnowledgePanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void
}) {
  const [notes, setNotes] = useState<Note[]>([])
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('')
  const [editing, setEditing] = useState<Note | null>(null)
  const [editText, setEditText] = useState('')
  const [editTags, setEditTags] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem('polaris.knowledge.notes')
      if (raw) setNotes(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const persist = (next: Note[]) => {
    setNotes(next)
    localStorage.setItem('polaris.knowledge.notes', JSON.stringify(next))
  }

  const tags = Array.from(new Set(notes.flatMap(n => n.tags)))
  const filtered = notes.filter(n =>
    (!query || n.text.toLowerCase().includes(query.toLowerCase())) &&
    (!tag || n.tags.includes(tag))
  )

  const newNote = () => {
    const text = prompt('笔记内容')
    if (!text) return
    const tagsStr = prompt('标签（逗号分隔）') || ''
    const note: Note = { id: 'k' + Date.now().toString(36), text, tags: tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean), source: 'manual', ts: Date.now() }
    persist([note, ...notes])
    setMsg(`✓ 已存入 ${note.id}`)
  }

  const select = (n: Note) => {
    setEditing(n)
    setEditText(n.text)
    setEditTags(n.tags.join(', '))
  }

  const saveEdit = () => {
    if (!editing) return
    persist(notes.map(n => n.id === editing.id ? { ...n, text: editText, tags: editTags.split(/[,，]/).map(t => t.trim()).filter(Boolean) } : n))
    setMsg(`✓ 已更新 ${editing.id}`)
    setEditing(null)
  }

  const del = (id: string) => {
    if (!confirm('删除？')) return
    persist(notes.filter(n => n.id !== id))
    if (editing?.id === id) setEditing(null)
  }

  const askAISearch = () => {
    if (!query) return
    onSendToChat?.(`请用 knowledge-base 的 search_notes 工具搜索："${query}"${tag ? `，标签 ${tag}` : ''}，并把结果整合进你的回答`)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13 }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #3F3F46', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索…" style={{ flex: 1, minWidth: 80, padding: '4px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 11, outline: 'none' }} />
        <select value={tag} onChange={(e) => setTag(e.target.value)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 11 }}>
          <option value="">全部标签</option>
          {tags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={newNote} style={btnStyle}>+</button>
        <button onClick={askAISearch} disabled={!query} style={{ ...btnStyle, opacity: query ? 1 : 0.4 }}>AI 查</button>
      </div>

      {msg && <div style={{ padding: '4px 10px', color: msg.startsWith('✓') ? '#10B981' : '#EF4444', fontSize: 11 }}>{msg}</div>}

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {filtered.length === 0 ? <div style={{ color: '#8E8E93', textAlign: 'center', padding: 24, fontSize: 11 }}>暂无条目</div> :
          filtered.map(n => (
            <div key={n.id} onClick={() => select(n)} style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: '#25252B', border: '1px solid #3F3F46', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, color: '#8E8E93' }}>{n.id}</span>
                <button onClick={(e) => { e.stopPropagation(); del(n.id) }} style={{ ...btnStyle, padding: '2px 6px', fontSize: 10 }}>✕</button>
              </div>
              <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{n.text.slice(0, 100)}{n.text.length > 100 ? '…' : ''}</div>
              {n.tags.length > 0 && <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>{n.tags.map(t => <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#3B82F622', color: '#3B82F6' }}>{t}</span>)}</div>}
            </div>
          ))
        }
      </div>

      {editing && (
        <div style={{ borderTop: '1px solid #3F3F46', padding: 10, background: '#1F1F24' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#8E8E93' }}>编辑 {editing.id}</span>
            <button onClick={() => setEditing(null)} style={{ ...btnStyle, padding: '2px 6px' }}>✕</button>
          </div>
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
          <input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="标签（逗号分隔）" style={{ width: '100%', marginTop: 6, padding: '4px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
          <button onClick={saveEdit} style={{ ...btnStyle, marginTop: 6 }}>保存</button>
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#F8F8F8', fontSize: 11, cursor: 'pointer' }
