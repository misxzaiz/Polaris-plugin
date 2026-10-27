/**
 * 面板共享 UI 原子（分节标题 / 关系头像 / 常用类型）
 */
import { RELATION_COLORS, type Person } from './model'

export function Section({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="tr-sec">
      <i className="tr-bar" />
      {title}
      {hint && <span className="tr-hint">{hint}</span>}
    </div>
  )
}

export function Avatar({ person, size = 34 }: { person: Person; size?: number }) {
  const ch = (person.alias || person.name || '？').trim().charAt(0).toUpperCase()
  return (
    <div
      className="tr-avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, background: RELATION_COLORS[person.relation] || RELATION_COLORS.其他 }}
    >
      {ch}
    </div>
  )
}

export type Toast = (msg: string, kind?: 'bad' | 'good') => void
