import { useState } from 'react'

/**
 * JSON Explorer Panel
 * 粘贴 JSON → 树形展开 + 搜索 + 路径复制。
 */
export default function JsonxPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void
}) {
  const [input, setInput] = useState('')
  const [parsed, setParsed] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const parse = () => {
    try { setParsed(JSON.parse(input)); setError(null) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setParsed(null) }
  }

  const copyPath = (path: string) => { navigator.clipboard?.writeText(path) }

  const askAI = () => {
    if (!input.trim()) return
    onSendToChat?.(`请用 jsonx 的 extract_paths 工具分析这个 JSON 的结构：\n\n${input}`)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13 }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #3F3F46', display: 'flex', gap: 6 }}>
        <button onClick={parse} style={btnStyle}>解析</button>
        <button onClick={askAI} disabled={!input.trim()} style={{ ...btnStyle, opacity: input.trim() ? 1 : 0.4 }}>AI 提路径</button>
      </div>
      {error && <div style={{ padding: '4px 10px', color: '#EF4444', fontSize: 11 }}>✗ {error}</div>}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='粘贴 JSON…{"key":"value"}'
          spellCheck={false}
          style={{ height: 120, padding: 8, fontFamily: 'ui-monospace, monospace', fontSize: 12, background: '#25252B', color: '#F8F8F8', border: 'none', borderBottom: '1px solid #3F3F46', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
        />
        {parsed !== null && (
          <>
            <div style={{ padding: '6px 10px', borderBottom: '1px solid #3F3F46' }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索键/值…" style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              <TreeNode data={parsed} path="$" search={search} onCopy={copyPath} depth={0} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TreeNode({ data, path, search, onCopy, depth }: {
  data: unknown
  path: string
  search: string
  onCopy: (p: string) => void
  depth: number
}) {
  const [open, setOpen] = useState(depth < 2)
  const isArr = Array.isArray(data)
  const isObj = data !== null && typeof data === 'object' && !isArr

  if (data === null) return <div style={{ paddingLeft: depth * 14, color: '#6B7280' }}>null</div>
  if (typeof data !== 'object') {
    const v = JSON.stringify(data)
    if (search && !v.toLowerCase().includes(search.toLowerCase()) && !path.toLowerCase().includes(search.toLowerCase())) return null
    return (
      <div style={{ paddingLeft: depth * 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#3B82F6', fontFamily: 'monospace', fontSize: 12 }}>{path.split('.').pop()}:</span>
        <span style={{ color: typeof data === 'string' ? '#10B981' : typeof data === 'number' ? '#F59E0B' : '#8B5CF6', fontFamily: 'monospace', fontSize: 12 }}>{v}</span>
        <button onClick={() => onCopy(path)} style={{ fontSize: 9, padding: '1px 4px', border: '1px solid #3F3F46', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>copy</button>
      </div>
    )
  }

  const entries = isArr ? data.map((v, i) => [i, v]) : Object.entries(data)
  const preview = JSON.stringify(data).slice(0, 50)

  if (search && !path.toLowerCase().includes(search.toLowerCase()) && !preview.toLowerCase().includes(search.toLowerCase())) {
    const hasMatch = entries.some(([k, v]) => String(k).toLowerCase().includes(search.toLowerCase()) || JSON.stringify(v).toLowerCase().includes(search.toLowerCase()))
    if (!hasMatch) return null
  }

  return (
    <div>
      <div style={{ paddingLeft: depth * 14, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <span style={{ color: '#6B7280', fontSize: 10 }}>{open ? '▼' : '▶'}</span>
        <span style={{ color: '#3B82F6', fontFamily: 'monospace', fontSize: 12 }}>{path.split('.').pop()}{isArr ? '[]' : ''}</span>
        {!open && <span style={{ color: '#6B7280', fontSize: 10 }}>{entries.length} 项</span>}
        <button onClick={(e) => { e.stopPropagation(); onCopy(path) }} style={{ fontSize: 9, padding: '1px 4px', border: '1px solid #3F3F46', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>copy</button>
      </div>
      {open && entries.map(([k, v]) => (
        <TreeNode key={String(k)} data={v} path={`${path}${isArr ? `[${k}]` : (path === '$' ? '' : '.') + k}`} search={search} onCopy={onCopy} depth={depth + 1} />
      ))}
    </div>
  )
}

const btnStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#F8F8F8', fontSize: 11, cursor: 'pointer' }
