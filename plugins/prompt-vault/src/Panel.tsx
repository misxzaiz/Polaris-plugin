import { useState, useEffect, useCallback } from 'react'

/**
 * Prompt Vault Panel
 * 左侧 prompt 列表，右侧编辑（变量表单→渲染预览）+ 版本历史 diff。
 */

interface PromptEntry {
  name: string
  tags: string[]
  versions: number
  vars: string[]
}
interface Version {
  version: number
  template: string
  ts: number
  tags: string[]
}
interface PromptDetail {
  name: string
  tags: string[]
  versions: Version[]
}

export default function PromptVaultPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void
}) {
  const [list, setList] = useState<PromptEntry[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<PromptDetail | null>(null)
  const [editing, setEditing] = useState('')
  const [vars, setVars] = useState<Record<string, string>>({})
  const [rendered, setRendered] = useState('')
  const [diff, setDiff] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // 由于 MCP server 需独立进程，Panel 通过 onSendToChat 让 AI 调用 MCP；
  // 本地则用 fetch 直接读写数据文件不可行（跨进程），故 Panel 主要做本地编辑+复制，
  // 真正持久化通过 onSendToChat 触发 AI 调用 save_prompt。
  // 这里提供完整的本地编辑/渲染/变量管理体验。

  const refresh = useCallback(() => {
    // 从 localStorage 读 prompt 库（本地缓存，MCP 是另一份；此处为面板快速编辑用）
    try {
      const raw = localStorage.getItem('polaris.promptvault.list')
      if (raw) setList(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const persistList = (next: PromptEntry[]) => {
    setList(next)
    localStorage.setItem('polaris.promptvault.list', JSON.stringify(next))
  }

  const persistDetail = (name: string, versions: Version[], tags: string[]) => {
    const d: PromptDetail = { name, tags, versions }
    setDetail(d)
    localStorage.setItem('polaris.promptvault.' + name, JSON.stringify(d))
  }

  const loadDetail = (name: string): PromptDetail | null => {
    try {
      const raw = localStorage.getItem('polaris.promptvault.' + name)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  const select = (name: string) => {
    setSelected(name)
    const d = loadDetail(name)
    if (d) {
      setDetail(d)
      const latest = d.versions[d.versions.length - 1]
      setEditing(latest.template)
      setVars({})
      setRendered('')
      setDiff(null)
    } else {
      setDetail(null)
      setEditing('')
    }
    setMsg(null)
  }

  const extractVars = (t: string) => {
    const set = new Set<string>()
    const re = /\{\{\s*([\w.]+)\s*\}\}/g
    let m
    while ((m = re.exec(t)) !== null) set.add(m[1])
    return [...set]
  }

  const doRender = () => {
    let out = editing
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{\\{\\s*${k.replace(/[.]/g, '\\.')}\\s*\\}\\}`, 'g'), v)
    }
    setRendered(out)
  }

  const save = () => {
    if (!selected) return
    const d = loadDetail(selected) || { name: selected, tags: [], versions: [] }
    const ver = d.versions.length + 1
    d.versions.push({ version: ver, template: editing, ts: Date.now(), tags: d.tags })
    persistDetail(selected, d.versions, d.tags)
    const next = list.some(p => p.name === selected)
      ? list.map(p => p.name === selected ? { ...p, versions: d.versions.length, vars: extractVars(editing) } : p)
      : [...list, { name: selected, tags: d.tags, versions: d.versions.length, vars: extractVars(editing) }]
    persistList(next)
    setMsg(`✓ 已保存 ${selected} v${ver}`)
  }

  const newPrompt = () => {
    const name = prompt('新 prompt 名称（如 summarizer）')
    if (!name) return
    if (list.some(p => p.name === name)) { setMsg('已存在'); return }
    persistList([...list, { name, tags: [], versions: 0, vars: [] }])
    persistDetail(name, [], [])
    select(name)
  }

  const askAISave = () => {
    if (!selected || !editing) return
    onSendToChat?.(`请用 prompt-vault 的 save_prompt 工具保存：name="${selected}", template=\n${editing}`)
  }

  const askAIRender = () => {
    if (!selected) return
    onSendToChat?.(`请用 prompt-vault 的 render_prompt 工具渲染 "${selected}"，变量: ${JSON.stringify(vars)}`)
  }

  const showDiff = () => {
    if (!detail || detail.versions.length < 2) { setMsg('需至少 2 版本'); return }
    const v1 = detail.versions[detail.versions.length - 2]
    const v2 = detail.versions[detail.versions.length - 1]
    const la = v1.template.split(/\r?\n/)
    const lb = v2.template.split(/\r?\n/)
    const out: string[] = []
    const max = Math.max(la.length, lb.length)
    for (let i = 0; i < max; i++) {
      if (la[i] === lb[i]) out.push(`  ${la[i] || ''}`)
      else { if (la[i] !== undefined) out.push(`- ${la[i]}`); if (lb[i] !== undefined) out.push(`+ ${lb[i]}`) }
    }
    setDiff(out.join('\n'))
  }

  const varList = extractVars(editing)

  return (
    <div style={{ height: '100%', display: 'flex', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13 }}>
      {/* 左侧列表 */}
      <div style={{ width: 200, borderRight: '1px solid #3F3F46', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #3F3F46', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#8E8E93' }}>Prompt 库</span>
          <button onClick={newPrompt} style={btnStyle}>+</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {list.length === 0 ? <div style={{ padding: 12, color: '#8E8E93', fontSize: 11 }}>暂无，点 + 新建</div> :
            list.map(p => (
              <div key={p.name} onClick={() => select(p.name)} style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #2A2A30', background: selected === p.name ? '#2D2D33' : 'transparent' }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: '#6B7280' }}>v{p.versions} · {p.vars.length} 变量</div>
              </div>
            ))
          }
        </div>
      </div>

      {/* 右侧编辑 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93' }}>选择或新建一个 prompt</div>
        ) : (
          <>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #3F3F46', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{selected}</span>
              <span style={{ fontSize: 10, color: '#6B7280' }}>v{detail?.versions.length || 0}</span>
              <div style={{ flex: 1 }} />
              <button onClick={save} style={btnStyle}>存版本</button>
              <button onClick={showDiff} style={btnStyle}>对比上版</button>
              <button onClick={askAISave} style={btnStyle}>AI 持久化</button>
            </div>

            {msg && <div style={{ padding: '4px 10px', color: msg.startsWith('✓') ? '#10B981' : '#EF4444', fontSize: 11 }}>{msg}</div>}

            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              <textarea
                value={editing}
                onChange={(e) => setEditing(e.target.value)}
                placeholder="prompt 模板，用 {{variable}} 占位符…"
                style={{ width: '100%', minHeight: 120, padding: 8, borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 12, fontFamily: 'ui-monospace, monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />

              {varList.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: '#8E8E93', marginBottom: 6 }}>变量</div>
                  {varList.map(v => (
                    <div key={v} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#3B82F6', width: 100, fontFamily: 'monospace' }}>{'{{' + v + '}}'}</span>
                      <input
                        value={vars[v] || ''}
                        onChange={(e) => setVars(prev => ({ ...prev, [v]: e.target.value }))}
                        placeholder={`值 for ${v}`}
                        style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 11, outline: 'none' }}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={doRender} style={btnStyle}>本地渲染</button>
                    <button onClick={askAIRender} style={btnStyle}>AI 渲染</button>
                  </div>
                </div>
              )}

              {rendered && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: '#8E8E93', marginBottom: 4 }}>渲染结果</div>
                  <pre style={{ margin: 0, padding: 8, borderRadius: 6, background: '#1F2A1F', border: '1px solid #10B98144', fontSize: 12, color: '#10B981', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace' }}>{rendered}</pre>
                </div>
              )}

              {diff && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: '#8E8E93', marginBottom: 4 }}>版本对比</div>
                  <pre style={{ margin: 0, padding: 8, borderRadius: 6, background: '#25252B', border: '1px solid #3F3F46', fontSize: 11, color: '#B4B4B8', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace' }}>{diff}</pre>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#F8F8F8', fontSize: 11, cursor: 'pointer' }
