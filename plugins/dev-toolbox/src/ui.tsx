// 共享 UI 小组件（dtb- 前缀样式见 styles.css）；所有用户内容一律走 React 文本节点，杜绝 innerHTML
import { useState, type ReactNode } from 'react'
import { hasSendToChat, sendToChat } from './host'

export function CopyBtn({ text, label = '复制' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 旧 WebView 兜底：临时 textarea + execCommand
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } finally {
        document.body.removeChild(ta)
      }
    }
    setDone(true)
    setTimeout(() => setDone(false), 1200)
  }
  return (
    <button className="dtb-mini" onClick={copy} title="复制到剪贴板" disabled={text === ''}>
      {done ? '已复制' : label}
    </button>
  )
}

/** 工具结果一键送入当前 AI 会话（可选能力，宿主未挂载时不渲染） */
export function SendBtn({ text }: { text: string }) {
  if (!hasSendToChat() || text === '') return null
  return (
    <button className="dtb-mini" onClick={() => sendToChat(text)} title="发送到当前会话">
      发到会话
    </button>
  )
}

export function Input(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  type?: string
}) {
  return (
    <input
      className={`dtb-input${props.mono ? ' dtb-mono' : ''}`}
      type={props.type ?? 'text'}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

export function Area(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      className="dtb-area dtb-mono"
      rows={props.rows ?? 6}
      value={props.value}
      placeholder={props.placeholder}
      spellCheck={false}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

export function Select(props: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <select className="dtb-select" value={props.value} onChange={(e) => props.onChange(e.target.value)}>
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Check(props: { checked: boolean; onChange: (v: boolean) => void; label: string; title?: string }) {
  return (
    <label className="dtb-check" title={props.title}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  )
}

export function L({ label, children, actions }: { label: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="dtb-lrow">
      <div className="dtb-llabel">
        {label}
        {actions ? <span className="dtb-lactions">{actions}</span> : null}
      </div>
      <div className="dtb-lvalue">{children}</div>
    </div>
  )
}

export function Out({ text, mono = true, rows }: { text: string; mono?: boolean; rows?: number }) {
  return (
    <pre className={`dtb-out${mono ? ' dtb-mono' : ''}`} style={rows ? { maxHeight: rows * 22 } : undefined}>
      {text === '' ? <span className="dtb-dim">（空）</span> : text}
    </pre>
  )
}

export function Note({ kind, children }: { kind: 'error' | 'warn' | 'info' | 'ok'; children: ReactNode }) {
  return <div className={`dtb-note dtb-note-${kind}`}>{children}</div>
}

export function KV({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <div className="dtb-kv">
      {rows.map(([k, v]) => (
        <div className="dtb-kvrow" key={k}>
          <span className="dtb-kvk">{k}</span>
          <span className="dtb-kvv dtb-mono">{v}</span>
        </div>
      ))}
    </div>
  )
}
