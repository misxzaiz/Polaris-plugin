import { useEffect, useState } from 'react'

/**
 * Diagram ChatCard (result 模式)
 *
 * 当 AI 调用 generate_diagram 工具后，Polaris 用此卡片渲染结构化结果
 * （_meta.diagram.code 中的 Mermaid 代码 → SVG），而非纯文本。
 * 同时提供"在面板中编辑"和"发送到聊天继续迭代"的入口。
 */

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'

interface DiagramData {
  type?: string
  code?: string
  valid?: boolean
  template?: string
}

let mermaidPromise: Promise<void> | null = null
function loadMermaid(): Promise<void> {
  const w = window as unknown as { mermaid?: { initialize: (o: unknown) => void } }
  if (w.mermaid) return Promise.resolve()
  if (mermaidPromise) return mermaidPromise
  mermaidPromise = new Promise<void>((resolve) => {
    const s = document.createElement('script')
    s.src = MERMAID_CDN
    s.onload = () => {
      if (w.mermaid) w.mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })
      resolve()
    }
    document.head.appendChild(s)
  })
  return mermaidPromise
}

export default function DiagramCard({ data, onSendToChat }: {
  pluginId: string
  cardId: string
  toolName: string
  mode: 'result' | 'interaction'
  status: string
  data: unknown
  response?: unknown
  onSendToChat?: (msg: string) => void | Promise<void>
}) {
  const d = (data as DiagramData) || {}
  // 兼容：data 可能直接是 { code } 或嵌套在 _meta
  const code = d.code || (typeof data === 'string' ? data : '') || ''
  const [svg, setSvg] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!code) return
    let cancelled = false
    loadMermaid().then(() => {
      const w = window as unknown as { mermaid?: { render: (id: string, c: string) => Promise<{ svg: string }> } }
      if (!w.mermaid || cancelled) return
      w.mermaid.render('dcard-' + Math.random().toString(36).slice(2, 9), code)
        .then(({ svg: out }) => { if (!cancelled) { setSvg(out); setErr(null) } })
        .catch((e) => { if (!cancelled) setSvg(''); if (!cancelled) setErr(e instanceof Error ? e.message : String(e)) })
    })
    return () => { cancelled = true }
  }, [code])

  if (!code) {
    return <div style={{ padding: 12, color: '#8E8E93', fontSize: 12 }}>无可渲染的图表数据</div>
  }

  return (
    <div style={{ borderRadius: 8, border: '1px solid #3F3F46', background: '#1F1F24', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #3F3F46' }}>
        <span style={{ fontSize: 11, color: '#8E8E93' }}>
          {d.template || '图表'} · {d.type || 'mermaid'}
          {d.valid === false && <span style={{ color: '#EF4444', marginLeft: 6 }}>✗ 语法问题</span>}
        </span>
        {onSendToChat && (
          <button
            onClick={() => onSendToChat(`请基于这张图表继续迭代：\n\n\`\`\`mermaid\n${code}\n\`\`\``)}
            style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#2D2D33', color: '#B4B4B8', fontSize: 10, cursor: 'pointer' }}
          >
            迭代
          </button>
        )}
      </div>
      <div style={{ padding: 12, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: 80, overflow: 'auto' }}>
        {svg ? (
          <div style={{ width: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />
        ) : err ? (
          <pre style={{ color: '#EF4444', fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>{err}</pre>
        ) : (
          <span style={{ color: '#8E8E93', fontSize: 11 }}>渲染中…</span>
        )}
      </div>
      <details style={{ borderTop: '1px solid #3F3F46', padding: '6px 10px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 10, color: '#6B7280' }}>Mermaid 源码</summary>
        <pre style={{ marginTop: 6, fontSize: 11, color: '#B4B4B8', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'ui-monospace, monospace' }}>{code}</pre>
      </details>
    </div>
  )
}
