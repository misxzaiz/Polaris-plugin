/**
 * 总览 Tab：家庭合计 + 临近/异常横幅 + 每笔贷款卡片（进度环/下期扣款/剩余/重定价/对账漂移）
 */
import * as core from '../shared/core'
import { fmtStateBadges } from './ui'
import type { TabProps } from './Panel'
import type { LoanState } from '../shared/core'

function dayDiff(a: string, b: string): number | null {
  const ta = new Date(a + 'T00:00:00').getTime()
  const tb = new Date(b + 'T00:00:00').getTime()
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null
  return Math.round((tb - ta) / 86400000)
}

export default function OverviewTab({ data, states, onSendToChat }: TabProps & { states: LoanState[] }) {
  if (!data) return <div className="qf-empty">载入中…</div>
  if (!data.loans.length) {
    return (
      <div className="qf-empty">
        还没有贷款台账。<br />
        在聊天里对 AI 说：<b>「我有一笔 100 万 30 年等额本息 3.6% 的房贷，2021 年 3 月开始还」</b><br />
        一句话建档；或在「贷款」Tab 手工添加。<br />
        <span style={{ fontSize: 11 }}>建完档建议用银行 App 的实际剩余本金对一次账。</span>
      </div>
    )
  }

  const liveStates = states.filter((s, i) => data.loans[i].active !== false && !s.settled)
  const totals = core.familyTotals(states)
  const today = states[0]?.today || ''
  const alerts: string[] = []
  states.forEach((st, i) => {
    const loan = data.loans[i]
    if (!loan.active || st.settled) return
    if (st.nextPaymentDate) {
      const d = dayDiff(today, st.nextPaymentDate)
      if (d != null && d >= 0 && d <= data.settings.warnDays) {
        alerts.push(`📅 ${loan.name} 将于 ${st.nextPaymentDate}（${d === 0 ? '今天' : `${d} 天后`}）扣款 ${core.fmtMoney(st.nextPaymentAmount)}`)
      }
    }
    if (st.nextRepricingDate) {
      const d = dayDiff(today, st.nextRepricingDate)
      if (d != null && d >= 0 && d <= data.settings.repricingWarnDays) {
        alerts.push(`🔁 ${loan.name} 将于 ${st.nextRepricingDate} 重定价——到时把新利率告诉 AI 或在贷款页记录`)
      }
    }
    const cp = st.checkpoints[st.checkpoints.length - 1]
    if (cp && Math.abs(cp.drift) > data.settings.driftWarn) {
      alerts.push(`⚖ ${loan.name} 对账漂移 ${core.fmtMoney(cp.drift)}（${cp.date} 银行 ${core.fmtMoney(cp.bank)} vs 账面 ${core.fmtMoney(cp.book)}）——可能漏记利率变更/提前还款`)
    }
    if (st.truncated) alerts.push(`⚠ ${loan.name} 还款表异常（参数矛盾），请检查期数/月供可行性`)
  })

  return (
    <div>
      <div className="qf-card">
        <div className="qf-card-b">
          <div className="qf-row" style={{ marginBottom: 4 }}>
            <span className="qf-grow qf-sub">家庭贷款合计（{totals.loanCount} 笔在还{totals.settledCount ? `，${totals.settledCount} 笔已结清/停用` : ''}）</span>
            {onSendToChat && (
              <button
                className="qf-btn ghost sm"
                onClick={() => onSendToChat(`帮我看看贷款台账：现在家庭月供、剩余本金和剩余利息是什么情况？（贷款台账）`)}
              >问 AI</button>
            )}
          </div>
          <div className="qf-kv"><span>月供合计</span><span className="qf-num" style={{ fontWeight: 700 }}>{core.fmtMoney(totals.monthlyPayment)}</span></div>
          <div className="qf-kv"><span>剩余本金</span><span className="qf-num">{core.fmtMoney(totals.remainingPrincipal)}</span></div>
          <div className="qf-kv"><span>剩余总利息（按当前计划）</span><span className="qf-num">{core.fmtMoney(totals.remainingInterest)}</span></div>
          <div className="qf-kv"><span>今年已付利息</span><span className="qf-num">{core.fmtMoney(totals.paidThisYearInterest)}</span></div>
        </div>
      </div>

      {alerts.length > 0 && <div className="qf-alert">{alerts.map((a, i) => <div key={i}>{a}</div>)}</div>}

      {data.loans.map((loan, i) => {
        const st = states[i]
        const inactive = loan.active === false
        const progress = st.totalMonths > 0 ? Math.min(100, Math.round((st.monthsPaid / st.totalMonths) * 100)) : 0
        const nextDueDays = st.nextPaymentDate ? dayDiff(today, st.nextPaymentDate) : null
        const rpDays = st.nextRepricingDate ? dayDiff(today, st.nextRepricingDate) : null
        const cp = st.checkpoints[st.checkpoints.length - 1]
        return (
          <div className="qf-card" key={loan.id}>
            <div className="qf-card-b">
              <div className="qf-row" style={{ marginBottom: 6 }}>
                <b style={{ fontSize: 13 }}>{loan.name}</b>
                {fmtStateBadges(loan, st)}
                <span className="qf-grow" />
                {nextDueDays != null && nextDueDays >= 0 && nextDueDays <= data.settings.warnDays && (
                  <span className="qf-tag yellow">{nextDueDays === 0 ? '今天扣款' : `${nextDueDays} 天后扣款`}</span>
                )}
              </div>
              <div className="qf-prog" style={{ marginBottom: 3 }}><i style={{ width: `${progress}%` }} /></div>
              <div className="qf-sub" style={{ marginBottom: 6 }}>
                {st.settled
                  ? `已按计划结清（末期 ${st.endDate}）`
                  : `已还 ${st.monthsPaid}/${st.totalMonths} 期 · ${progress}%${loan.groupId ? ` · 组「${loan.groupId}」` : ''}`}
              </div>
              {!st.settled && (
                <>
                  <div className="qf-kv"><span>下期扣款</span><span className="qf-num">{st.nextPaymentDate} · <b>{core.fmtMoney(st.nextPaymentAmount)}</b></span></div>
                  <div className="qf-kv"><span>剩余本金</span><span className="qf-num">{core.fmtMoney(st.remainingPrincipal)}</span></div>
                  <div className="qf-kv"><span>当前利率</span><span className="qf-num">{core.fmtPct(st.currentRate)}{loan.method === 'annuity' ? '' : ''} · 剩余总利息 {core.fmtMoney(st.remainingInterest)}</span></div>
                  <div className="qf-kv"><span>计划结清</span><span className="qf-num">{st.endDate}{st.paidThisYearInterest > 0 ? ` · 今年已付息 ${core.fmtMoney(st.paidThisYearInterest)}` : ''}</span></div>
                </>
              )}
              {rpDays != null && (
                <div className="qf-kv"><span>下次重定价</span>
                  <span className="qf-num">{st.nextRepricingDate}
                    {rpDays >= 0 && rpDays <= data.settings.repricingWarnDays && <span className="qf-tag yellow" style={{ marginLeft: 6 }}>{rpDays === 0 ? '就是今天' : `${rpDays} 天后`}</span>}
                  </span>
                </div>
              )}
              {cp && (
                <div className="qf-kv"><span>最近对账（{cp.date}）</span>
                  <span className="qf-num">银行 {core.fmtMoney(cp.bank)} · 差 <span style={{ color: Math.abs(cp.drift) > data.settings.driftWarn ? '#F85149' : '#3FB950' }}>{core.fmtMoney(cp.drift)}</span></span>
                </div>
              )}
              {inactive && <div className="qf-sub" style={{ marginTop: 6 }}>已停用/结清：不计入合计与提醒，历史保留（贷款 Tab 可恢复）。</div>}
            </div>
          </div>
        )
      })}
      {liveStates.length === 0 && <div className="qf-empty">全部贷款已结清或停用。🎉</div>}
    </div>
  )
}
