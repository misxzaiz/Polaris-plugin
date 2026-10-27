/**
 * 今日 Tab：灶签（带理由推荐）+ 临期红榜 + 今日计划 + 三格速览
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/stove-core.js'
import { dayLabel, expiresLabel, LOCATION_LABELS, type Api, type Overview, type PantryItem, type Toast } from './model'

export default function TodayTab(props: {
  ov: Overview
  api: Api
  toast: Toast
  goTab: (t: 'today' | 'pantry' | 'recipes' | 'plan' | 'shopping' | 'settings') => void
}) {
  const { ov, api, toast, goTab } = props
  const [pickNonce, setPickNonce] = useState(0)
  const today = core.dayKey(Date.now())
  const serves = useMemo(
    () => core.suggestServing(ov.recipes, ov.pantry, ov.history, ov.settings, Date.now()),
    [ov, pickNonce],
  )
  const expiring = useMemo(() => core.expiringItems(ov.pantry, ov.settings.expiringDays, Date.now()), [ov])
  const todayPlan = ov.plan.days[today]
  const todayLabel = todayPlan
    ? (todayPlan.recipeId && ov.recipes.byId[todayPlan.recipeId]?.name) || todayPlan.note || '（空）'
    : null
  const undoneN = ov.shopping.items.filter((x) => !x.done).length
  const waste = useMemo(() => core.wasteStats(ov.history, 30, Date.now()), [ov])

  return (
    <>
      <div className="as-grid">
        <div className="as-stat" onClick={() => goTab('pantry')}>
          <b className={expiring.length > 0 ? 'hot' : ''}>{expiring.length}</b>
          <small>临期食材</small>
        </div>
        <div className="as-stat" onClick={() => goTab('shopping')}>
          <b>{undoneN}</b>
          <small>待买</small>
        </div>
        <div className="as-stat" onClick={() => goTab('settings')}>
          <b className={waste.wasteRate >= 30 ? 'hot' : ''}>{waste.wasteRate}%</b>
          <small>30 天浪费率</small>
        </div>
      </div>

      <div className="as-sec"><span className="as-bar" />今日灶签<span className="as-hint">临期优先 · 缺料降权 · 近做过回避</span></div>
      <div className="as-card"><div className="as-card-b">
        {serves.length === 0 && (
          <div className="as-empty">
            还推不出来——去「菜谱」加几道菜吧（支持贴 URL 一键导入）。<br />
            家里有啥先去「库存」记一笔，灶签才知道能做什么。
          </div>
        )}
        {serves.map((s, i) => {
          const planned = todayPlan?.recipeId === s.recipe.id
          return (
            <div className="as-suggest" key={s.recipe.id}>
              <div className={`as-rank${i === 0 ? ' first' : ''}`}>{i + 1}</div>
              <div className="main">
                <b>{s.recipe.name}<span className="as-sub"> · {s.recipe.minutes} 分钟</span></b>
                <div className="why">{s.reasons.join('；')}</div>
                {s.missing.length > 0 && <div className="miss">缺料：{s.missing.join('、')}</div>}
              </div>
              <button
                className={`as-btn sm${planned ? ' ghost' : ''}`}
                disabled={planned}
                onClick={() => api.planSet(today, { recipeId: s.recipe.id }, toast)}
              >{planned ? '已排今天' : '就吃这个'}</button>
            </div>
          )
        })}
      </div></div>

      <div className="as-sec"><span className="as-bar" />临期红榜<span className="as-hint">{ov.settings.expiringDays} 天窗口 · 去设置可调</span></div>
      <div className="as-card"><div className="as-card-b">
        {expiring.length === 0 && <div className="as-empty">没有临期食材，冰箱状态健康 ✅</div>}
        {expiring.slice(0, 10).map((it: PantryItem) => {
          const ex = expiresLabel(it.expiresAt, Date.now())
          return (
            <div className="as-item" key={it.id}>
              <div className="main">
                <b>{core.isExpired(it, Date.now()) ? '🔴' : '🟡'} {it.name}{it.qty != null ? ` ${it.qty}${it.unit || ''}` : ''}</b>
                <small>{LOCATION_LABELS[it.location] || it.location} · {ex.text}{it.note ? ` · ${it.note}` : ''}</small>
              </div>
              <button className="as-btn sm" onClick={() => api.pantryConsume(it, 'used', toast)}>吃掉了</button>
              <button className="as-btn sm danger" onClick={() => api.pantryConsume(it, 'discarded', toast)}>扔了</button>
            </div>
          )
        })}
        {expiring.length > 10 && <div className="as-sub" style={{ padding: '8px 2px 2px' }}>还有 {expiring.length - 10} 项，去「库存」看全部。</div>}
      </div></div>

      <div className="as-sec"><span className="as-bar" />今日计划<span className="as-hint">{dayLabel(today)}</span></div>
      <div className="as-card"><div className="as-card-b">
        {!todayLabel && (
          <div className="as-row">
            <span className="as-sub" style={{ flex: 1 }}>还没安排。从灶签挑一个，或去「本周」排。</span>
            <button className="as-btn sm ghost" onClick={() => goTab('plan')}>去排</button>
          </div>
        )}
        {todayLabel && (
          <div className="as-row">
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{todayLabel}</span>
            {todayPlan?.recipeId && (
              <button className="as-btn sm" onClick={() => api.markCooked(today, todayPlan.recipeId!, toast)}>做了这道菜</button>
            )}
            <button className="as-btn sm ghost" onClick={() => api.planClear(today, toast)}>清掉</button>
          </div>
        )}
      </div></div>
    </>
  )
}
