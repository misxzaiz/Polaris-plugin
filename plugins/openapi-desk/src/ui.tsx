/**
 * ui.tsx —— 面板共用小部件（与 house 插件一致的 GitHub Dark 内联风格）
 */
import type { CSSProperties, ReactNode } from 'react'
import { SEVERITY_COLOR, SEVERITY_LABEL } from './model'

export const C = {
  bg: '#0D1117',
  panel: '#161B22',
  border: '#30363D',
  text: '#E6EDF3',
  muted: '#8B949E',
  accent: '#1F6FEB',
  danger: '#F85149',
  warn: '#D29922',
  ok: '#3FB950',
}

export const inputStyle: CSSProperties = {
  background: '#0D1117',
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: '5px 8px',
  fontSize: 12,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

export const btnStyle = (variant: 'primary' | 'ghost' | 'danger' = 'ghost'): CSSProperties => ({
  background: variant === 'primary' ? C.accent : 'transparent',
  color: variant === 'primary' ? '#fff' : variant === 'danger' ? C.danger : C.text,
  border: `1px solid ${variant === 'danger' ? 'rgba(248,81,73,0.4)' : C.border}`,
  borderRadius: 6,
  padding: '5px 12px',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
})

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>
        {label}
        {hint ? <span style={{ marginLeft: 6, opacity: 0.8 }}>{hint}</span> : null}
      </div>
      {children}
    </label>
  )
}

export function Badge({ text, color, bg }: { text: string; color: string; bg?: string }) {
  return (
    <span style={{
      color, background: bg || 'transparent',
      border: `1px solid ${color}`,
      borderRadius: 10, padding: '0 7px', fontSize: 10, lineHeight: '16px',
      display: 'inline-block', verticalAlign: 'middle',
    }}>{text}</span>
  )
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge text={SEVERITY_LABEL[severity] || severity} color={SEVERITY_COLOR[severity] || C.muted} />
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{
      border: `1px dashed ${C.border}`, borderRadius: 8,
      padding: '18px 16px', color: C.muted, fontSize: 12, lineHeight: 1.8,
    }}>{children}</div>
  )
}

export function Err({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <div style={{ color: '#FFA198', fontSize: 12, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{msg}</div>
  )
}

export function KeyValue({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{ fontSize: 11, lineHeight: 1.7 }}>
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8 }}>
          <span style={{ color: C.muted, minWidth: 76, flexShrink: 0 }}>{k}</span>
          <span style={{ wordBreak: 'break-all' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 8px' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: C.border }} />
      {extra}
    </div>
  )
}
