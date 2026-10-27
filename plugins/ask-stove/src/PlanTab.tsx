/**
 * 本周 Tab：今天起 7 天计划，每格可挑菜谱 / 写备注 / 清空
 */
import { useState } from 'react'
import * as core from '../shared/stove-core.js'
import { dayLabel, type Api, type Overview, type Toast } from './model'

export default function PlanTab(props: { ov: Overview; api: Api; toast: Toast }) {
  const { ov, api, toast } = props
  const [editing, setEditing] = useState<string | null>(null)
  const [pickQ, setPickQ] = useState('')
  const [note, setNote] = useState('')

  const today = core.dayKey(Date.now())
  const days = Array.from({ length: 7 }, (_, i) => core.dayShift(today, i))

  const openEdit = (day: string) => {
    setEditing(editing === day ? null : day)
    setPickQ('')
    setNote('')
  }

  return (
    <>
      <div className="as-sec">
        <span className="as-bar" />本周计划
        <span className="as-hint">排了菜谱，「采购」页才能一键补缺料</span>
      </div>
      {days.map((day) => {
        const e = ov.plan.days[day]
        const label = e ? (e.recipeId && ov.recipes.byId[e.recipeId]?.name) || e.note || '（空）' : null
        const d = new Date(`${day}T00:00:00`)
        const picks = ov.recipes.order
          .filter((id) => !pickQ || core.normName(ov.recipes.byId[id].name).includes(core.normName(pickQ)))
          .slice(0, 8)
        return (
          <div key={day}>
            <div className="as-card" style={{ cursor: 'pointer' }} onClick={() => openEdit(day)}>
              <div className="as-card-b as-row">
                <div style={{ width: 62, flexShrink: 0 }}>
                  <b style={{ fontSize: 13 }}>{dayLabel(day)}</b>
                  <div className="as-sub">{day.slice(5)} {day === today ? '· 今' : `周${'日一二三四五六'[d.getDay()]}`}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                  {label || <span className="as-sub">未安排 — 点一下排菜</span>}
                </div>
                {e?.recipeId && (
                  <button
                    className="as-btn tiny"
                    onClick={(ev) => { ev.stopPropagation(); api.markCooked(day, e.recipeId!, toast) }}
                  >做了</button>
                )}
                {label && (
                  <button
                    className="as-btn tiny ghost"
                    onClick={(ev) => { ev.stopPropagation(); api.planClear(day, toast) }}
                  >✕</button>
                )}
              </div>
            </div>
            {editing === day && (
              <div className="as-card" style={{ marginTop: -6, marginBottom: 12, borderColor: '#3a4a60' }}>
                <div className="as-card-b">
                  <span className="as-lbl" style={{ marginTop: 0 }}>挑菜谱（可搜）</span>
                  <input className="as-inp" placeholder="搜菜名…" value={pickQ} onChange={(ev) => setPickQ(ev.target.value)} />
                  <div className="as-row" style={{ marginTop: 8 }}>
                    {picks.length === 0 && <span className="as-sub">没有匹配菜谱</span>}
                    {picks.map((id) => (
                      <button
                        key={id}
                        className={`as-chip${e?.recipeId === id ? ' on' : ''}`}
                        onClick={() => { api.planSet(day, { recipeId: id }, toast); openEdit(day) }}
                      >{ov.recipes.byId[id].name}</button>
                    ))}
                  </div>
                  <span className="as-lbl">或写备注（如「外卖」「剩菜」）</span>
                  <div className="as-row">
                    <input
                      className="as-inp"
                      style={{ flex: 1 }}
                      placeholder="备注"
                      value={note}
                      onChange={(ev) => setNote(ev.target.value)}
                    />
                    <button className="as-btn sm" onClick={() => { if (note.trim()) { api.planSet(day, { note }, toast); openEdit(day) } }}>排备注</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
