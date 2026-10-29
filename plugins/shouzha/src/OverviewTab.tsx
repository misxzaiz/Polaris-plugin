/**
 * 总览 Tab：三榜（逾期待对账 / 即将扣费 / 试用转正）+ 成本速览 + 未来 12 个月现金流
 * 对账动作在这里一键完成——这是续费管家区别于记账与提醒工具的核心闭环。
 */
import { useState } from 'react'
import type { TabProps, Tab as TabKey } from './Panel'
import {
  cancelSub, fmtMoney, fmtDate, renewSub, saveSub, skipSub, daysBetween, todayStr, cycleLabel,
  type Subscription,
} from './model'

/** 两段确认按钮（防误触：第一次点击进入确认态，3 秒内再点才执行） */
function ConfirmBtn(props: { label: string; confirmLabel: string; cls?: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  return (
    <button
      className={`sz-btn sm ${props.cls || 'ghost'} ${armed ? 'danger' : ''}`}
      onClick={() => {
        if (armed) { setArmed(false); props.onConfirm() } else {
          setArmed(true)
          setTimeout(() => setArmed(false), 3000)
        }
      }}
    >{armed ? props.confirmLabel : props.label}</button>
  )
}

export default function OverviewTab({ data, reload, showToast, goTab }: TabProps & { goTab: (t: TabKey) => void }) {
  const [busy, setBusy] = useState<string | null>(null)

  if (!data) return <div className="sz-empty">载入中…</div>
  const { settings, board, stats } = data
  const sym = settings.currencySymbol
  const today = todayStr()

  const act = async (s: Subscription, kind: 'renew' | 'skip' | 'cancel') => {
    setBusy(s.id + kind)
    try {
      let r: { error?: string; sub?: Subscription }
      if (kind === 'renew') r = renewSub(s, {})
      else if (kind === 'skip') r = skipSub(s, { reason: '本次未续' })
      else r = cancelSub(s, { reason: '面板取消' })
      if (r.error || !r.sub) { showToast(r.error || '操作失败', 'bad'); return }
      await saveSub(r.sub)
      const fresh = await reload()
      if (kind === 'renew') showToast(`已对账：${s.name}，下一期 ${fmtDate(r.sub.nextRenewalDate)}`, 'good')
      else {
        const saved = fresh ? fresh.stats.savedAnnual : 0
        showToast(`「${s.name}」已取消 · 累计年化止损 ${fmtMoney(saved, sym)}`, 'good')
      }
    } finally {
      setBusy(null)
    }
  }

  const itemRow = (s: Subscription, kind: 'overdue' | 'upcoming' | 'trial') => {
    const diff = daysBetween(today, kind === 'trial' ? (s.trialEndsAt || s.nextRenewalDate) : s.nextRenewalDate)
    const when = diff === null ? '' : diff === 0 ? '今天' : diff < 0 ? `已过 ${-diff} 天` : `${diff} 天后`
    return (
      <div className="sz-item" key={s.id}>
        <div className="sz-item-main">
          <b>{s.name}<span className={`sz-badge ${kind === 'overdue' ? 'bad' : kind === 'trial' ? 'bad' : 'warn'}`}>{kind === 'overdue' ? '待对账' : kind === 'trial' ? '试用' : s.autoRenew ? '自动续费' : '手动续'}</span></b>
          <small>{s.vendor ? `${s.vendor} · ` : ''}{kind === 'trial' ? `试用至 ${fmtDate(s.trialEndsAt || s.nextRenewalDate)}（${when}）` : `${fmtDate(s.nextRenewalDate)} 扣费（${when}）`}</small>
          <div className="sz-ops">
            {kind !== 'trial' && (
              <button className="sz-btn sm" disabled={busy === s.id + 'renew'} onClick={() => void act(s, 'renew')}>
                {kind === 'overdue' ? '确认已续费' : '确认已扣'}
              </button>
            )}
            {kind === 'trial' && (
              <button className="sz-btn sm" disabled={busy === s.id + 'renew'} onClick={() => void act(s, 'renew')}>已转正续费</button>
            )}
            <ConfirmBtn label="不续了，取消" confirmLabel="确认取消？" cls="ghost" onConfirm={() => void act(s, 'skip')} />
          </div>
        </div>
        <div className="sz-item-amt">
          {fmtMoney(s.amount, sym)}
          <small>/{cycleLabel(s)}</small>
        </div>
      </div>
    )
  }

  const maxFlow = Math.max(...stats.cashflow.map((c) => c.amount), 1)

  return (
    <>
      {/* 三榜 */}
      {board.overdue.length > 0 && (
        <div className="sz-alert red">
          <b>🔴 逾期待对账 {board.overdue.length} 笔</b>
          扣费日已过境但未确认是否真被扣费——沉默扣款就在这里发生。逐笔「确认已续费」或「这次没续」。
          <div className="sz-card" style={{ margin: '8px 0 0' }}><div className="sz-card-b" style={{ padding: '2px 2px' }}>
            {board.overdue.map((s) => itemRow(s, 'overdue'))}
          </div></div>
        </div>
      )}
      {board.trials.length > 0 && (
        <div className="sz-alert red">
          <b>🧪 试用转正 {board.trials.length} 笔</b>
          到期不处理通常自动转正扣费——试用结束前决定去留。
          <div className="sz-card" style={{ margin: '8px 0 0' }}><div className="sz-card-b" style={{ padding: '2px 2px' }}>
            {board.trials.map((s) => itemRow(s, 'trial'))}
          </div></div>
        </div>
      )}
      {board.upcoming.length > 0 && (
        <div className="sz-alert amber">
          <b>📅 即将扣费 {board.upcoming.length} 笔</b>
          不想续的话，现在就是取消窗口。
          <div className="sz-card" style={{ margin: '8px 0 0' }}><div className="sz-card-b" style={{ padding: '2px 2px' }}>
            {board.upcoming.map((s) => itemRow(s, 'upcoming'))}
          </div></div>
        </div>
      )}
      {!board.overdue.length && !board.upcoming.length && !board.trials.length && (
        <div className="sz-card"><div className="sz-card-b" style={{ textAlign: 'center', padding: '22px 13px' }}>
          <div style={{ fontSize: 22 }}>🟢</div>
          <b style={{ display: 'block', margin: '6px 0 2px' }}>当前一切干净</b>
          <span className="sz-sub">没有逾期、近期扣费或试用转正。<br />在「订阅」Tab 登记你的第一笔订阅，续费管家开始替你盯防。</span>
        </div></div>
      )}

      {/* 成本速览 */}
      <div className="sz-sec"><i className="sz-bar" />成本速览</div>
      <div className="sz-card"><div className="sz-card-b">
        <div className="sz-row" style={{ justifyContent: 'space-between' }}>
          <div className="sz-kv" style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
            <small>生效中月均（{stats.counts.active} 笔）</small>
            <b style={{ fontSize: 19 }}>{fmtMoney(stats.monthlyActive, sym)}</b>
          </div>
          <div className="sz-kv" style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
            <small>年化</small>
            <b style={{ fontSize: 19 }}>{fmtMoney(stats.annualActive, sym)}</b>
          </div>
          <div className="sz-kv" style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
            <small>含试用转正预估</small>
            <b style={{ fontSize: 19 }}>{fmtMoney(stats.monthlyAll, sym)}<span className="sz-sub">/月</span></b>
          </div>
        </div>
        {stats.savedAnnual > 0 && (
          <div className="sz-sub" style={{ marginTop: 6 }}>✂️ 已取消订阅累计年化止损 <b style={{ color: '#7EE2A0' }}>{fmtMoney(stats.savedAnnual, sym)}</b>（详见透视）</div>
        )}
      </div></div>

      {/* 未来 12 个月现金流 */}
      <div className="sz-sec"><i className="sz-bar" />未来 12 个月现金流<span className="sz-hint">逐月将扣金额</span></div>
      <div className="sz-card"><div className="sz-card-b">
        <div className="sz-bars">
          {stats.cashflow.map((c) => (
            <div className={`sz-barcol ${c.amount > stats.monthlyActive * 1.5 ? 'hot' : ''}`} key={c.month} title={c.items.length ? c.items.map((i) => `${i.date} ${i.name} ${fmtMoney(i.amount, sym)}`).join('\n') : '无扣费'}>
              <i style={{ height: `${Math.max(3, Math.round((c.amount / maxFlow) * 74))}px` }} />
              <small>{Number(c.month.slice(5))}</small>
            </div>
          ))}
        </div>
        <div className="sz-sub" style={{ marginTop: 6 }}>
          未来一年将扣 <b style={{ color: '#E6EAF2' }}>{fmtMoney(stats.cashflow.reduce((s2, c) => s2 + c.amount, 0), sym)}</b>
          （黄色月份 = 大额年费扎堆；悬停柱子看明细）
        </div>
      </div></div>

      <div style={{ textAlign: 'center', padding: '4px 0 10px' }}>
        <button className="sz-btn ghost sm" onClick={() => goTab('subs')}>管理全部 {data.subs.filter((s) => s.status !== 'cancelled').length} 笔订阅 →</button>
      </div>
    </>
  )
}
