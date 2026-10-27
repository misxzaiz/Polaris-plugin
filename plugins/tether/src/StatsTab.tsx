/**
 * 透视 Tab：关系分组健康度 + 近 12 个月联系趋势柱状图 + 人情天平 + 承诺构成
 */
import {
  driftList, contactTrend, favorBalance, promiseBoard,
  type PanelData,
} from './model'
import { Section } from './ui'

export default function StatsTab({ data }: {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: (m: string, k?: 'bad' | 'good') => void
}) {
  if (!data) return <div className="tr-empty">载入中…</div>
  const now = Date.now()
  const drift = driftList(data.peopleBook.byId, data.journalBook.events, data.settings, now)
  const driftById = new Map(drift.map((d) => [d.personId, d]))
  const active = Object.values(data.peopleBook.byId).filter((p) => !p.archivedAt)

  // 按关系分组
  const byRelation = new Map<string, { count: number; lost: number; warn: number; daysSum: number; daysN: number }>()
  for (const p of active) {
    const rec = byRelation.get(p.relation) || { count: 0, lost: 0, warn: 0, daysSum: 0, daysN: 0 }
    rec.count += 1
    const d = driftById.get(p.id)
    if (d) {
      if (d.level === 'lost') rec.lost += 1
      else if (d.level === 'warn') rec.warn += 1
      rec.daysSum += d.daysSince
      rec.daysN += 1
    }
    byRelation.set(p.relation, rec)
  }
  const relRows = [...byRelation.entries()].sort((a, b) => b[1].count - a[1].count)

  const trend = contactTrend(data.journalBook.events, 12, now)
  const maxCount = Math.max(1, ...trend.map((t) => t.count))

  const bal = favorBalance(data.journalBook.events)
  const balRows = Object.entries(bal)
    .map(([pid, b]) => ({ name: data.peopleBook.byId[pid]?.name || '（已删除）', ...b, diff: b.gave - b.got }))
    .filter((b) => b.gave + b.got > 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))

  const board = promiseBoard(data.promisesBook.byId, data.peopleBook.byId, now, data.settings)
  const iowe = board.overdue.concat(board.dueSoon, board.scheduled, board.openNoDue).filter((p) => p.direction === 'iowe').length
  const owedme = board.overdue.concat(board.dueSoon, board.scheduled, board.openNoDue).length - iowe

  return (
    <div>
      <Section title="关系分组" hint={`${active.length} 位在册`} />
      <div className="tr-card">
        <div className="tr-card-b" style={{ padding: relRows.length ? '2px 13px' : 0 }}>
          {relRows.length ? relRows.map(([rel, rec]) => {
            const avg = rec.daysN ? Math.round(rec.daysSum / rec.daysN) : 0
            return (
              <div className="tr-field" key={rel}>
                <div className="tr-field-l">
                  <b>{rel} · {rec.count} 人</b>
                  <small>
                    平均 {avg} 天前联系
                    {rec.warn ? ` · 🟡 ${rec.warn}` : ''}{rec.lost ? ` · 🔴 ${rec.lost}` : ''}
                  </small>
                </div>
              </div>
            )
          }) : <div className="tr-empty" style={{ padding: '12px' }}>还没有人物档案</div>}
        </div>
      </div>

      <Section title="近 12 个月联系" hint={`${trend.reduce((s, t) => s + t.count, 0)} 次`} />
      <div className="tr-card">
        <div className="tr-card-b">
          <div className="tr-bars">
            {trend.map((t) => (
              <div className="tr-barcol" key={t.month} title={`${t.month}：${t.count} 次`}>
                <i style={{ height: `${Math.max(3, (t.count / maxCount) * 70)}px`, opacity: t.count ? 1 : 0.25 }} />
                <small>{t.month.slice(5)}</small>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Section title="人情天平" hint="中性记录，不折算钱" />
      <div className="tr-card">
        <div className="tr-card-b" style={{ padding: balRows.length ? '2px 13px' : 0 }}>
          {balRows.length ? balRows.slice(0, 10).map((b) => (
            <div className="tr-field" key={b.name}>
              <div className="tr-field-l">
                <b>{b.name}</b>
                <small>帮了他 {b.gave} 次 · 他帮我 {b.got} 次</small>
              </div>
              <span className="tr-tag" style={{ color: b.diff > 0 ? '#F2C063' : b.diff < 0 ? '#7EE2A0' : undefined }}>
                {b.diff > 0 ? '我多付出' : b.diff < 0 ? '我多受惠' : '持平'}
              </span>
            </div>
          )) : <div className="tr-empty" style={{ padding: '12px' }}>还没有人情往来记录</div>}
        </div>
      </div>

      <Section title="承诺构成" />
      <div className="tr-card">
        <div className="tr-card-b">
          <div className="tr-sub">
            未闭环 {iowe + owedme} 条：我许的 {iowe} · 我等的 {owedme}；已闭环 {board.closed.filter((p) => p.status === 'done').length} · 已取消 {board.closed.filter((p) => p.status === 'cancelled').length}
          </div>
        </div>
      </div>
    </div>
  )
}
