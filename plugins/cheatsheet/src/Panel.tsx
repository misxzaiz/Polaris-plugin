import { useState, useEffect, useCallback } from 'react'

interface Command { id: string; cmd: string; desc: string; category: string; example: string }

export default function CheatsheetPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void
}) {
  const [commands, setCommands] = useState<Command[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState<Command | null>(null)
  const [editCmd, setEditCmd] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCat, setEditCat] = useState('')
  const [editEx, setEditEx] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem('polaris.cheatsheet.commands')
      if (raw) setCommands(JSON.parse(raw))
      else setCommands([]) // 首次空，AI 调用 MCP 会种入 seed
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const persist = (next: Command[]) => { setCommands(next); localStorage.setItem('polaris.cheatsheet.commands', JSON.stringify(next)) }

  const categories = Array.from(new Set(commands.map(c => c.category)))
  const filtered = commands.filter(c =>
    (!category || c.category === category) &&
    (!query || (c.cmd + ' ' + c.desc + ' ' + c.example).toLowerCase().includes(query.toLowerCase()))
  )

  const newCmd = () => {
    setEditing({ id: '', cmd: '', desc: '', category: '', example: '' })
    setEditCmd(''); setEditDesc(''); setEditCat(''); setEditEx('')
  }
  const edit = (c: Command) => {
    setEditing(c); setEditCmd(c.cmd); setEditDesc(c.desc); setEditCat(c.category); setEditEx(c.example)
  }
  const saveEdit = () => {
    if (!editCmd.trim()) { setMsg('命令不能空'); return }
    if (editing?.id) {
      persist(commands.map(c => c.id === editing.id ? { ...c, cmd: editCmd, desc: editDesc, category: editCat || 'general', example: editEx } : c))
    } else {
      persist([...commands, { id: 'c' + Date.now().toString(36), cmd: editCmd, desc: editDesc, category: editCat || 'general', example: editEx }])
    }
    setMsg('✓ 已保存'); setEditing(null)
  }
  const del = (id: string) => { if (confirm('删除？')) persist(commands.filter(c => c.id !== id)) }

  const askAI = () => {
    if (!query) return
    onSendToChat?.(`请用 cheatsheet 的 search_commands 工具搜索："${query}"，并用结果回答怎么用`)
  }

  return (
    <div style={{ height: '100%', display: 'flex', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13 }}>
      {/* 分类侧栏 */}
      <div style={{ width: 130, borderRight: '1px solid #3F3F46', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #3F3F46', fontSize: 11, color: '#8E8E93' }}>分类</div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div onClick={() => setCategory('')} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 11, background: !category ? '#2D2D33' : 'transparent', color: !category ? '#F8F8F8' : '#8E8E93' }}>全部 ({commands.length})</div>
          {categories.map(c => (
            <div key={c} onClick={() => setCategory(c)} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 11, background: category === c ? '#2D2D33' : 'transparent', color: category === c ? '#F8F8F8' : '#8E8E93' }}>{c} ({commands.filter(x => x.category === c).length})</div>
          ))}
        </div>
      </div>

      {/* 主区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #3F3F46', display: 'flex', gap: 6 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索命令…" style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 11, outline: 'none' }} />
          <button onClick={newCmd} style={btnStyle}>+</button>
          <button onClick={askAI} disabled={!query} style={{ ...btnStyle, opacity: query ? 1 : 0.4 }}>AI 查</button>
        </div>
        {msg && <div style={{ padding: '4px 10px', color: msg.startsWith('✓') ? '#10B981' : '#EF4444', fontSize: 11 }}>{msg}</div>}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {filtered.length === 0 ? <div style={{ color: '#8E8E93', textAlign: 'center', padding: 24, fontSize: 11 }}>暂无命令，点 + 添加</div> :
            filtered.map(c => (
              <div key={c.id} onClick={() => edit(c)} style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: '#25252B', border: '1px solid #3F3F46', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <code style={{ fontSize: 12, color: '#3B82F6', fontFamily: 'ui-monospace, monospace' }}>{c.cmd}</code>
                  <button onClick={(e) => { e.stopPropagation(); del(c.id) }} style={{ ...btnStyle, padding: '2px 6px', fontSize: 10 }}>✕</button>
                </div>
                <div style={{ fontSize: 11, color: '#B4B4B8', marginTop: 4 }}>{c.desc}</div>
                {c.example && <div style={{ fontSize: 10, color: '#6B7280', marginTop: 4, fontFamily: 'monospace' }}>例: {c.example}</div>}
                <span style={{ fontSize: 9, color: '#8E8E93', marginTop: 4, display: 'inline-block' }}>{c.category}</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* 编辑抽屉 */}
      {editing && (
        <div style={{ width: 260, borderLeft: '1px solid #3F3F46', padding: 10, display: 'flex', flexDirection: 'column', gap: 6, background: '#1F1F24' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#8E8E93' }}>{editing.id || '新建'}</span>
            <button onClick={() => setEditing(null)} style={{ ...btnStyle, padding: '2px 6px' }}>✕</button>
          </div>
          <input value={editCmd} onChange={(e) => setEditCmd(e.target.value)} placeholder="命令" style={inp} />
          <input value={editCat} onChange={(e) => setEditCat(e.target.value)} placeholder="分类" style={inp} />
          <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="说明" style={{ ...inp, minHeight: 50, resize: 'vertical' }} />
          <input value={editEx} onChange={(e) => setEditEx(e.target.value)} placeholder="示例" style={inp} />
          <button onClick={saveEdit} style={btnStyle}>保存</button>
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#F8F8F8', fontSize: 11, cursor: 'pointer' }
const inp: React.CSSProperties = { padding: '6px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 11, outline: 'none' }
