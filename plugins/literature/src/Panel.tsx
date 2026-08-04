import { useState, useEffect, useCallback } from 'react'

/**
 * Literature Matrix Panel
 * 文献库 + 对比矩阵表格 + 引用导出。
 * 通过 onSendToChat 触发 AI 调用 MCP save_paper/compare_papers。
 */

interface Paper {
  id: string
  title: string
  authors: string
  year: string
  method: string
  sample: string
  conclusion: string
  limitation: string
  note?: string
  ts: number
}

const FIELDS: (keyof Paper)[] = ['title', 'authors', 'year', 'method', 'sample', 'conclusion', 'limitation']
const FIELD_LABELS: Record<string, string> = { title: '标题', authors: '作者', year: '年份', method: '方法', sample: '样本', conclusion: '结论', limitation: '局限' }

export default function LiteraturePanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void
}) {
  const [papers, setPapers] = useState<Paper[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [input, setInput] = useState('')
  const [citation, setCitation] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem('polaris.literature.papers')
      if (raw) setPapers(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const persist = (next: Paper[]) => {
    setPapers(next)
    localStorage.setItem('polaris.literature.papers', JSON.stringify(next))
  }

  const addLocal = () => {
    if (!input.trim()) return
    // 本地简化版：AI 调用 MCP 更准
    const p: Paper = {
      id: 'p' + Date.now().toString().slice(-6),
      title: input.split(/\r?\n/)[0].slice(0, 60),
      authors: (input.match(/(?:作者|by|authors?)[:\s]*([^\n。,，]{2,40})/i)?.[1] || '（待补）').trim(),
      year: input.match(/(19|20)\d{2}/)?.[0] || '（待补）',
      method: '（待补）',
      sample: '（待补）',
      conclusion: input.slice(-80),
      limitation: '（待补）',
      note: '',
      ts: Date.now(),
    }
    persist([...papers, p])
    setInput('')
    setMsg(`✓ 本地保存 ${p.id}（建议用 AI 提取更准）`)
  }

  const askAIExtract = () => {
    if (!input.trim()) return
    onSendToChat?.(`请用 literature-matrix 的 save_paper 工具保存并提取这篇论文的结构化字段：\n\n${input}`)
  }

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  const askAICompare = () => {
    const ids = [...selected]
    if (ids.length < 2) { setMsg('选至少 2 篇'); return }
    onSendToChat?.(`请用 literature-matrix 的 compare_papers 工具对比这些论文：${JSON.stringify(ids)}`)
  }

  const askCitation = (style: string) => {
    if (selected.size !== 1) { setMsg('选 1 篇'); return }
    onSendToChat?.(`请用 literature-matrix 的 format_citation 工具格式化引用：id="${[...selected][0]}", style="${style}"`)
    // 本地简化版
    const p = papers.find(x => x.id === [...selected][0])
    if (p) {
      const c = style === 'IEEE' ? `[1] ${p.authors}, "${p.title}," ${p.year}.` :
        style === 'GB-T7714' ? `${p.authors}. ${p.title}[J]. ${p.year}.` :
        `${p.authors} (${p.year}). ${p.title}.`
      setCitation(c)
    }
  }

  const del = (id: string) => persist(papers.filter(p => p.id !== id))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13 }}>
      {/* 输入区 */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #3F3F46' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="粘贴论文摘要/笔记…"
          style={{ width: '100%', minHeight: 50, padding: 8, borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button onClick={addLocal} style={btnStyle}>本地保存</button>
          <button onClick={askAIExtract} disabled={!input.trim()} style={{ ...btnStyle, opacity: input.trim() ? 1 : 0.4 }}>AI 提取</button>
        </div>
      </div>

      {msg && <div style={{ padding: '4px 10px', color: msg.startsWith('✓') ? '#10B981' : '#EF4444', fontSize: 11 }}>{msg}</div>}

      {/* 列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {papers.length === 0 ? <div style={{ color: '#8E8E93', textAlign: 'center', padding: 24, fontSize: 11 }}>暂无文献</div> :
          papers.map(p => (
            <div key={p.id} style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: selected.has(p.id) ? '#2D2D33' : '#25252B', border: `1px solid ${selected.has(p.id) ? '#3B82F6' : '#3F3F46'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} style={{ cursor: 'pointer' }} />
                <div style={{ flex: 1, fontWeight: 500, fontSize: 12 }}>{p.title}</div>
                <button onClick={() => del(p.id)} style={{ ...btnStyle, padding: '2px 6px', fontSize: 10 }}>✕</button>
              </div>
              <div style={{ fontSize: 10, color: '#8E8E93', marginTop: 4 }}>{p.authors} · {p.year} · {p.id}</div>
            </div>
          ))
        }
      </div>

      {/* 对比区 */}
      {selected.size >= 2 && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid #3F3F46' }}>
          <button onClick={askAICompare} style={{ ...btnStyle, width: '100%' }}>生成对比矩阵 ({selected.size})</button>
        </div>
      )}

      {/* 引用区 */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid #3F3F46', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => askCitation('APA')} style={btnStyle}>APA</button>
        <button onClick={() => askCitation('IEEE')} style={btnStyle}>IEEE</button>
        <button onClick={() => askCitation('GB-T7714')} style={btnStyle}>GB-T7714</button>
        {citation && <div style={{ flexBasis: '100%', fontSize: 11, color: '#10B981', marginTop: 4, fontFamily: 'monospace' }}>{citation}</div>}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#F8F8F8', fontSize: 11, cursor: 'pointer' }
