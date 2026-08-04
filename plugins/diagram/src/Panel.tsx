import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Diagram Studio Panel
 *
 * 三栏布局：模板选择 → 编辑器 + 实时预览 → 导出。
 * mermaid.js 通过 CDN script 标签动态注入（避免 bundle 体积，research 轮 9 对策）。
 * React 由宿主 pluginModuleLoader shim 提供（external）。
 */

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'

const TEMPLATES = [
  { type: 'flowchart', label: '流程图' },
  { type: 'sequence', label: '时序图' },
  { type: 'mindmap', label: '思维导图' },
  { type: 'class', label: '类图' },
  { type: 'state', label: '状态图' },
  { type: 'gantt', label: '甘特图' },
  { type: 'pie', label: '饼图' },
  { type: 'graph', label: '关系图' },
]

const STORAGE_KEY = 'polaris.diagram.history'

interface HistoryItem {
  id: string
  code: string
  type: string
  ts: number
}

export default function DiagramPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void
}) {
  const [code, setCode] = useState(`flowchart TD
    Start([开始]) --> Process[处理]
    Process --> Decision{判断}
    Decision -->|是| Done([完成])
    Decision -->|否| Process`)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [mermaidReady, setMermaidReady] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const renderTimer = useRef<number | null>(null)

  // 动态加载 mermaid.js
  useEffect(() => {
    const w = window as unknown as { mermaid?: { initialize: (o: unknown) => void; render: (id: string, code: string) => Promise<{ svg: string }> } }
    if (w.mermaid) { w.mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' }); setMermaidReady(true); return }
    const s = document.createElement('script')
    s.src = MERMAID_CDN
    s.onload = () => {
      if (w.mermaid) {
        w.mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })
        setMermaidReady(true)
      }
    }
    document.head.appendChild(s)
  }, [])

  // 加载历史
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setHistory(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  const render = useCallback(async (src: string) => {
    if (!mermaidReady) return
    const w = window as unknown as { mermaid?: { render: (id: string, code: string) => Promise<{ svg: string }> } }
    try {
      const { svg: out } = await w.mermaid!.render('dia-' + Date.now(), src)
      setSvg(out)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [mermaidReady])

  // 防抖渲染
  useEffect(() => {
    if (renderTimer.current) clearTimeout(renderTimer.current)
    renderTimer.current = window.setTimeout(() => render(code), 400)
    return () => { if (renderTimer.current) clearTimeout(renderTimer.current) }
  }, [code, render])

  const saveToHistory = useCallback((src: string, type: string) => {
    const item: HistoryItem = { id: Math.random().toString(36).slice(2, 9), code: src, type, ts: Date.now() }
    setHistory(prev => {
      const next = [item, ...prev].slice(0, 20)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const applyTemplate = (type: string) => {
    // 调用 MCP 工具生成骨架（通过 onSendToChat 触发，或直接内联模板）
    const templates: Record<string, string> = {
      flowchart: `flowchart TD\n    Start([开始]) --> Process[处理]\n    Process --> Done([完成])`,
      sequence: `sequenceDiagram\n    participant A\n    participant B\n    A->>B: 请求\n    B-->>A: 响应`,
      mindmap: `mindmap\n  root((主题))\n    分支A\n      子项1\n    分支B`,
      class: `classDiagram\n    class Animal {\n      +eat()\n    }\n    class Dog {\n      +bark()\n    }\n    Animal <|-- Dog`,
      state: `stateDiagram-v2\n    [*] --> Idle\n    Idle --> Active : 触发\n    Active --> [*]`,
      gantt: `gantt\n    title 项目计划\n    dateFormat YYYY-MM-DD\n    section 阶段\n    任务1 :a1, 2026-01-01, 7d`,
      pie: `pie title 占比\n    "A" : 40\n    "B" : 60`,
      graph: `graph LR\n    A[节点A] --> B[节点B]\n    B --> C[节点C]`,
    }
    setCode(templates[type] || templates.flowchart)
  }

  const exportSvg = () => {
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `diagram-${Date.now()}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPng = async () => {
    if (!svg) return
    const img = new Image()
    const svgBlob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#1A1A1F'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0)
        canvas.toBlob((blob) => {
          if (!blob) return
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = `diagram-${Date.now()}.png`
          a.click()
        })
      }
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  const copyCode = () => {
    navigator.clipboard?.writeText(code)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13 }}>
      {/* 顶部工具栏 */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid #3F3F46', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#8E8E93' }}>模板:</span>
        {TEMPLATES.map(t => (
          <button key={t.type} onClick={() => applyTemplate(t.type)} style={chipStyle} title={t.label}>{t.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={copyCode} style={btnStyle} title="复制 Mermaid 代码">复制</button>
        <button onClick={exportSvg} disabled={!svg} style={{ ...btnStyle, opacity: svg ? 1 : 0.4 }}>SVG</button>
        <button onClick={exportPng} disabled={!svg} style={{ ...btnStyle, opacity: svg ? 1 : 0.4 }}>PNG</button>
        <button onClick={() => saveToHistory(code, 'flowchart')} style={btnStyle}>存档</button>
      </div>

      {/* 主体：编辑器 + 预览 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1, padding: 10, fontFamily: 'ui-monospace, monospace', fontSize: 12,
            background: '#25252B', color: '#F8F8F8', border: 'none', borderRight: '1px solid #3F3F46',
            resize: 'none', outline: 'none', lineHeight: 1.5,
          }}
        />
        <div style={{ flex: 1, overflow: 'auto', padding: 12, background: '#1F1F24', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {mermaidReady ? (
            svg ? (
              <div style={{ width: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />
            ) : error ? (
              <div style={{ color: '#EF4444', fontSize: 12, whiteSpace: 'pre-wrap', padding: 8 }}>{error}</div>
            ) : (
              <div style={{ color: '#8E8E93' }}>渲染中…</div>
            )
          ) : (
            <div style={{ color: '#8E8E93' }}>加载 mermaid.js…</div>
          )}
        </div>
      </div>

      {/* 底部历史 */}
      {history.length > 0 && (
        <div style={{ borderTop: '1px solid #3F3F46', padding: '8px 10px', maxHeight: 120, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 4 }}>历史 ({history.length})</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {history.map(h => (
              <button key={h.id} onClick={() => setCode(h.code)} style={histStyle} title={h.code.slice(0, 50)}>
                {new Date(h.ts).toLocaleTimeString()} · {h.type}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 5, border: '1px solid #3F3F46',
  background: '#2D2D33', color: '#F8F8F8', fontSize: 11, cursor: 'pointer',
}
const chipStyle: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 10, border: '1px solid #3F3F46',
  background: 'transparent', color: '#B4B4B8', fontSize: 10, cursor: 'pointer',
}
const histStyle: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 4, border: '1px solid #3F3F46',
  background: '#25252B', color: '#8E8E93', fontSize: 10, cursor: 'pointer',
}
