/**
 * 记录卡（总览/藏卷共用）：排版化封面 + 头部徽标 + 元信息 + 短评 + 动作区（由调用方注入）
 */
import type { ReactNode } from 'react'
import { KIND_LABELS, statusLabel, diffDays, type Work } from './model'
import { KIND_THEME, STATUS_CLS } from './kindTheme'

export default function WorkCard({ work, today, rank, onEdit, children }: {
  work: Work
  today: string
  rank?: number
  onEdit?: () => void
  children?: ReactNode
}) {
  const theme = KIND_THEME[work.kind] || KIND_THEME.other
  const metaBits: string[] = []
  if (work.year) metaBits.push(String(work.year))
  if (work.creator) metaBits.push(work.creator)
  if (work.genre) metaBits.push(work.genre)
  let timeBit = ''
  if (work.status === 'done' && work.finishDate) timeBit = work.finishDate
  else if (work.status === 'active' && work.startDate) {
    const d = diffDays(work.startDate, today)
    timeBit = `开于 ${work.startDate}${d != null && d > 0 ? ` · ${d} 天` : ''}`
  } else if (work.status === 'wish' && work.createdAt) {
    const d = diffDays(new Date(work.createdAt).toISOString().slice(0, 10), today)
    timeBit = d != null && d > 0 ? `想 ${d} 天了` : '今天加入'
  } else if (work.status === 'dropped' && work.updatedAt) {
    timeBit = `更新于 ${new Date(work.updatedAt).toISOString().slice(0, 10)}`
  }
  return (
    <div className="gz-item">
      {rank != null && <span className="gz-rank">{rank}</span>}
      <div className="gz-cover" style={{ background: theme.grad }}>{theme.emoji}</div>
      <div className="gz-item-main">
        <div className="gz-item-head">
          <b>{work.title}</b>
          {typeof work.rating === 'number' && <span className="gz-rate">{work.rating} 分</span>}
        </div>
        <div className="gz-item-mid">
          <span className="gz-meta">{metaBits.join(' · ')}{timeBit ? ` · ${timeBit}` : ''}</span>
          <span className={`gz-badge ${STATUS_CLS[work.status] || ''}`}>{statusLabel(work.kind, work.status)}</span>
          <span className="gz-badge">{KIND_LABELS[work.kind] || work.kind}</span>
          {work.favorite && <span className="gz-badge fav">★ 心头好</span>}
        </div>
        {work.note && <div className="gz-item-foot"><span className="note">{work.note}</span></div>}
        <div className="gz-item-foot">
          {onEdit && <button className="gz-btn sm ghost" disabled={false} onClick={onEdit}>编辑</button>}
          {children}
        </div>
      </div>
    </div>
  )
}
