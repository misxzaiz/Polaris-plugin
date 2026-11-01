/**
 * 总览 Tab：预算执行大卡（红黄绿）+ 增项合计 + 节点红黄榜 + 常见漏项提示 + 最近流水
 */
import { useState } from 'react'
import * as core from '../shared/core'
import { saveCategory } from './model'
import type { TabProps } from './PanelTypes'

export default function OverviewTab({ data, reload, showToast }: TabProps) {
  const [fixing, setFixing] = useState(false)
  if (!data) return <div className="zx-empty">载入中…</div>
  const cmp = core.budgetCompare(data.cats, data.exps, data.project?.totalBudget)
  const t = cmp.totals
  const miss = core.missingCheck(data.cats)

  const todoMiles = data.miles
    .filter((m) => !m.done)
    .map((m) => ({ m, lv: core.milestoneLevel(m) }))
    .filter((x) => x.lv.level === 'red' || x.lv.level === 'yellow')
    .sort((a, b) => (a.lv.level === 'red' ? 0 : 1) - (b.lv.level === 'red' ? 0 : 1) || a.m.date.localeCompare(b.m.date))
    .slice(0, 4)

  const recent = [...data.exps].slice(-5).reverse()
  const catById = new Map(data.cats.map((c) => [c.id, c]))

  const pctCls = t.level === 'red' ? 'red' : t.level === 'yellow' ? 'yellow' : 'green'
  const pct = t.pct !== null ? Math.min(t.pct, 100) : 0

  async function fixMissing() {
    setFixing(true)
    try {
      let n = 0
      for (const name of miss) {
        const tpl = core.TEMPLATE.find((x) => x.name === name)
        // eslint-disable-next-line no-await-in-loop
        await saveCategory({ name, group: tpl ? tpl.group : '其他', order: data!.cats.length + n }, null)
        n += 1
      }
      showToast(`已补 ${n} 个漏项科目（预算待录）`)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setFixing(false)
    }
  }

  return (
    <>
      <div className="zx-sec"><i className="zx-bar-ic" />预算执行<span className="zx-hint">口径：core.budgetCompare</span></div>
      <div className="zx-card">
        <div className="zx-hero">
          <div className="zx-row">
            <span className="big zx-money">¥{core.fmtMoney(t.spentTotal)}</span>
            <span className="zx-grow" />
            {t.pct !== null && (
              <span className={`zx-tag ${t.level === 'red' ? 'red' : t.level === 'yellow' ? 'yellow' : 'green'}`}>
                {t.pct}%{t.level === 'red' ? ' · 已超支' : t.level === 'yellow' ? ' · 临超' : ''}
              </span>
            )}
          </div>
          <div className="zx-progress" style={{ marginTop: 8 }}>
            <i className={pctCls} style={{ width: `${pct}%` }} />
          </div>
          <div className="zx-kv">
            <span>总预算：{t.budgetTotal > 0 ? `¥${core.fmtMoney(t.budgetTotal)}` : '未设定'}</span>
            <span>剩余：¥{core.fmtMoney(t.remainTotal)}</span>
            {t.budgetTotal > 0 && t.catBudgetTotal !== t.budgetTotal && <span>科目合计 ¥{core.fmtMoney(t.catBudgetTotal)}</span>}
          </div>
          {cmp.extraSpent > 0 && (
            <div className="zx-kv" style={{ color: '#E3B341' }}>
              <span>增项合计（报价单外）：¥{core.fmtMoney(cmp.extraSpent)}</span>
              <span>{cmp.extraCount} 笔</span>
            </div>
          )}
        </div>
      </div>

      {todoMiles.length > 0 && (
        <>
          <div className="zx-sec"><i className="zx-bar-ic" />节点红黄榜<span className="zx-hint">逾期红 · 3 天内黄</span></div>
          <div className="zx-card">
            {todoMiles.map(({ m, lv }) => (
              <div key={m.id} className="zx-item">
                <div className="zx-item-t">
                  <span className={`zx-tag ${lv.level}`}>{lv.level === 'red' ? `逾期 ${-(lv.daysLeft || 0)} 天` : `还剩 ${lv.daysLeft} 天`}</span>
                  <b>{m.title}</b>
                  <span className="zx-grow" />
                  <span className="zx-sub">{m.date}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {miss.length > 0 && (
        <>
          <div className="zx-sec"><i className="zx-bar-ic" />常见漏项检查</div>
          <div className="zx-card">
            <div className="zx-card-b">
              <div className="zx-sub">
                预算单还没有这些「报价单最爱漏掉」的科目：<b style={{ color: '#E6EAF2' }}>{miss.join('、')}</b>。
                装修公司漏报 = 后期增项；确认需要就补进预算。
              </div>
              <div style={{ marginTop: 8 }}>
                <button className="zx-btn ghost" disabled={fixing} onClick={fixMissing}>一键补齐科目（预算待录）</button>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="zx-sec"><i className="zx-bar-ic" />最近流水<span className="zx-hint">共 {data.exps.length} 笔</span></div>
      <div className="zx-card">
        {recent.length === 0 && <div className="zx-empty">还没有支出。对 AI 说「瓷砖买了 3200」即可记账，或在「流水」页手工记。</div>}
        {recent.map((e) => {
          const c = catById.get(e.catId)
          const v = e.vendorId ? data.vens.find((x) => x.id === e.vendorId) : null
          return (
            <div key={e.id} className="zx-item">
              <div className="zx-item-t">
                <span className="zx-sub">{core.dayKeyOfTs(e.ts)}</span>
                <b>{c ? c.name : '（科目已删）'}</b>
                {c && c.isExtra && <span className="zx-tag yellow">增</span>}
                <span className="zx-grow" />
                <b className="zx-money">¥{core.fmtMoney(e.amount)}</b>
              </div>
              {(v || e.note) && (
                <div className="zx-item-s">{v ? <span>· {v.name}</span> : null}{e.note ? <span>· {e.note}</span> : null}</div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
