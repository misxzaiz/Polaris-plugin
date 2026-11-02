/**
 * ui.tsx —— 面板展示小件（堆栈还原台）
 */
import React from 'react'

export function fmtBytes(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '-'
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

export function durStr(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}

/** 状态徽标：resolved/unresolved/internal/unparsed */
export function stateBadge(state: string): { text: string; cls: string } {
  switch (state) {
    case 'resolved': return { text: '✓', cls: 'ok' }
    case 'internal': return { text: '○', cls: 'skip' }
    case 'unparsed': return { text: '？', cls: 'warn' }
    default: return { text: '✗', cls: 'bad' }
  }
}

export function basename(p?: string | null): string {
  if (!p) return ''
  const s = String(p)
  return s.split(/[\\/]/).pop() || s
}

export function Chip({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'ok' | 'bad' | 'warn' | '' }): JSX.Element {
  return (
    <span className={`sl-chip ${tone || ''}`}>
      <span className="sl-chip-label">{label}</span>
      <span className="sl-chip-value">{value}</span>
    </span>
  )
}

export function Empty({ text }: { text: string }): JSX.Element {
  return <div className="sl-empty">{text}</div>
}

export function ErrBox({ text }: { text: string }): JSX.Element {
  return <div className="sl-errbox">{text}</div>
}

export function WarnBox({ items }: { items: string[] }): JSX.Element | null {
  if (!items || !items.length) return null
  return (
    <div className="sl-warnbox">
      {items.slice(0, 8).map((w, i) => <div key={i}>⚠ {w}</div>)}
      {items.length > 8 ? <div>…共 {items.length} 条</div> : null}
    </div>
  )
}
