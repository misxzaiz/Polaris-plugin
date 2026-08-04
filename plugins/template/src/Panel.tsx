import { useState, useEffect, useCallback } from 'react'

interface Template { id: string; name: string; content: string; category: string }

export default function TemplatePanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void
}) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState<Template | null>(null)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editCat, setEditCat] = useState('')
  const [vars, setVars] = useState<Record<string, string>>({})
  const [rendered, setRendered] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem('polaris.template.templates')
      if (raw) setTemplates(JSON.parse(raw))
      else {
        // 种子
        const seed = [
          { id: 't1', name: '拒绝合作', content: '感谢您联系{{company}}。经评估，目前暂无法推进。祝顺利。\n\n{{your_name}}', category: '邮件' },
          { id: 't2', name: '催办进度', content: '{{name}}你好，{{task}}的进度如何？', category: '消息' },
          { id: 't3', name: '会议通知', content: '主题：{{topic}}\n时间：{{time}}\n地点：{{location}}', category: '通知' },
        ]
        setTemplates(seed); localStorage.setItem('polaris.template.templates', JSON.stringify(seed))
      }
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const persist = (next: Template[]) => { setTemplates(next); localStorage.setItem('polaris.template.templates', JSON.stringify(next)) }
  const categories = Array.from(new Set(templates.map(t => t.category)))
  const filtered = templates.filter(t => !category || t.category === category)

  const extractVars = (c: string) => { const set = new Set<string>(); const re = /\{\{\s*([\w.]+)\s*\}\}/g; let m; while ((m = re.exec(c)) !== null) set.add(m[1]); return [...set] }

  const select = (t: Template) => {
    setSelected(t); setEditing(false); setEditName(t.name); setEditContent(t.content); setEditCat(t.category)
    setVars({}); setRendered('')
  }
  const doRender = () => {
    let out = editContent
    for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{\\{\\s*${k.replace(/[.]/g, '\\.')}\\s*\\}\\}`, 'g'), v)
    setRendered(out)
  }
  const saveEdit = () => {
    if (!editName.trim()) { setMsg('名称不能空'); return }
    if (selected) {
      persist(templates.map(t => t.id === selected.id ? { ...t, name: editName, content: editContent, category: editCat || 'general' } : t))
    } else {
      persist([...templates, { id: 't' + Date.now().toString(36), name: editName, content: editContent, category: editCat || 'general' }])
    }
    setMsg('✓ 已保存'); setEditing(false)
  }
  const del = (id: string) => { if (confirm('删除？')) { persist(templates.filter(t => t.id !== id)); setSelected(null) } }
  const askAI = () => {
    if (!selected) return
    onSendToChat?.(`请用 template-vault 的 render_template 工具渲染「${selected.name}」，变量：${JSON.stringify(vars)}`)
  }

  const varList = extractVars(editContent)

  return (
    <div style={{ height: '100%', display: 'flex', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13 }}>
      {/* 列表 */}
      <div style={{ width: 200, borderRight: '1px solid #3F3F46', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #3F3F46', display: 'flex', gap: 6 }}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ flex: 1, padding: '4px', borderRadius: 4, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 11 }}>
            <option value="">全部分类</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => { setSelected({ id: '', name: '', content: '', category: '' }); setEditing(true); setEditName(''); setEditContent(''); setEditCat('') }} style={btnStyle}>+</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map(t => (
            <div key={t.id} onClick={() => select(t)} style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #2A2A30', background: selected?.id === t.id ? '#2D2D33' : 'transparent' }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{t.name}</div>
              <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{t.category} · {extractVars(t.content).length} 变量</div>
            </div>
          ))}
        </div>
      </div>

      {/* 编辑/预览 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93' }}>选择或新建模板</div> : (
          <>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #3F3F46', display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{editing ? '编辑' : selected.name}</span>
              {!editing && <button onClick={() => setEditing(true)} style={btnStyle}>编辑</button>}
              {editing && <button onClick={saveEdit} style={btnStyle}>保存</button>}
              <button onClick={() => del(selected.id)} style={{ ...btnStyle, color: '#EF4444' }}>删除</button>
            </div>
            {msg && <div style={{ padding: '4px 10px', color: msg.startsWith('✓') ? '#10B981' : '#EF4444', fontSize: 11 }}>{msg}</div>}
            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              {editing ? (
                <>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="模板名" style={{ ...inp, width: '100%', boxSizing: 'border-box', marginBottom: 6 }} />
                  <input value={editCat} onChange={(e) => setEditCat(e.target.value)} placeholder="分类" style={{ ...inp, width: '100%', boxSizing: 'border-box', marginBottom: 6 }} />
                  <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} placeholder="模板内容，用 {{变量}} 占位" style={{ ...inp, width: '100%', minHeight: 120, boxSizing: 'border-box', resize: 'vertical' }} />
                </>
              ) : (
                <>
                  <pre style={{ margin: '0 0 10px', padding: 10, borderRadius: 6, background: '#25252B', fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace' }}>{selected.content}</pre>
                  {varList.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, color: '#8E8E93', marginBottom: 6 }}>变量填充</div>
                      {varList.map(v => (
                        <div key={v} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: '#3B82F6', width: 100, fontFamily: 'monospace' }}>{'{{' + v + '}}'}</span>
                          <input value={vars[v] || ''} onChange={(e) => setVars(p => ({ ...p, [v]: e.target.value }))} placeholder={`值 for ${v}`} style={{ ...inp, flex: 1 }} />
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button onClick={doRender} style={btnStyle}>本地渲染</button>
                        <button onClick={askAI} style={btnStyle}>AI 渲染</button>
                        {rendered && <button onClick={() => navigator.clipboard?.writeText(rendered)} style={btnStyle}>复制</button>}
                      </div>
                      {rendered && <pre style={{ marginTop: 8, padding: 8, borderRadius: 6, background: '#1F2A1F', border: '1px solid #10B98144', fontSize: 12, color: '#10B981', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{rendered}</pre>}
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
const btnStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#F8F8F8', fontSize: 11, cursor: 'pointer' }
const inp: React.CSSProperties = { padding: '6px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 11, outline: 'none' }
