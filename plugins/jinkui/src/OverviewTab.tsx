/**
 * 总览 Tab：家庭合计卡 + 缴费红黄榜 + 等待期/满期信息层 + 缺口速览。
 * 全部经 shared/core 现算（与 MCP jinkui_today 同口径）。
 */
import { useMemo } from 'react'
import * as core from '../shared/core'
import type { PolicyState } from '../shared/core'
import { memberName, type JinkuiData } from './model'
import type { TabProps } from './Panel'
import { KIND_CN } from './ui'

interface Props extends TabProps {
  states: PolicyState[]
}

export default function OverviewTab({ data, states }: Props) {
  const derived = useMemo(() => {
    if (!data) return null
    const now = Date.now()
    const totals = core.familyTotals(data.policies, data.events, data.settings, now)
    const gap = core.gapMatrix(data.members, data.policies, data.events, data.settings, now)
    const rows: { policy: JinkuiData['policies'][number]; st: PolicyState }[] = data.policies.map((p, i) => ({ policy: p, st: states[i] }))
    const reds = rows.filter(({ st }) => st.state === 'grace' || st.state === 'lapse')
    const yellows = rows.filter(({ policy, st }) => {
      if (st.state !== 'active' && st.state !== 'paid-off') return false
      if (st.nextPayDate && st.daysToPay != null && st.daysToPay >= 0 && st.daysToPay <= data.settings.warnDays) return true
      if (policy.endDate && st.state === 'active') {
        const d = core.dayDiff(policy.endDate, st.today)
        if (d != null && d >= 0 && d <= data.settings.warnDays) return true
      }
      return false
    })
    const waiting = rows.filter(({ st }) => st.state === 'waiting')
    const ended = rows.filter(({ st }) => st.state === 'matured' || st.state === 'surrendered' || st.state === 'terminated')
    return { totals, gap, reds, yellows, waiting, ended, now }
  }, [data, states])

  if (!data || !derived) return <div className="jk-empty">加载中…</div>
  const { totals, gap, reds, yellows, waiting, ended } = derived

  if (!data.policies.length) {
    return (
      <div className="jk-empty">
        保单台账还是空的。把家里的保单一张张「入柜」：<br />
        在对话里说「给娃买了份 50 万的重疾，平安的，年缴 4000 缴 20 年」<br />
        或在「保单」Tab 点「新增保单」。
      </div>
    )
  }

  const gapBits = gap.rows.filter((r) => r.missing.length)
    .map((r) => `${r.name}缺 ${r.missing.map((k) => KIND_CN[k] || k).join('/')}`)
  const otherBits = Object.entries(gap.otherKinds).filter(([, n]) => n > 0)
    .map(([k, n]) => `${KIND_CN[k] || k}×${n}`)

  return (
    <>
      <div className="jk-sec"><span className="jk-bar" />家庭合计</div>
      <div style={{ padding: '0 16px 10px' }}>
        <div className="jk-grid">
          <div className="jk-stat"><b className="jk-num">{totals.activeCount}<small style={{ fontSize: 11 }}> / {totals.policyCount} 张</small></b><small>在保 / 入柜总数</small></div>
          <div className="jk-stat"><b className="jk-num">{core.fmtMoney(totals.annualizedPremium)}</b><small>年缴保费（趸交不计）</small></div>
          <div className="jk-stat"><b className="jk-num">{core.fmtMoney(totals.totalPaid)}</b><small>累计已缴</small></div>
          <div className="jk-stat"><b className="jk-num">{core.fmtMoney(totals.totalClaim)}</b><small>累计理赔</small></div>
        </div>
      </div>

      {reds.length > 0 && (
        <>
          <div className="jk-sec"><span className="jk-bar" />红榜 · 保障风险<span className="jk-hint">宽限期保障仍有效；中止期出险不赔</span></div>
          {reds.map(({ policy, st }) => (
            <div key={policy.id} className="jk-alert" style={st.state === 'lapse' ? { background: '#3a1d22', borderColor: '#54262c', color: '#FF8A9A' } : undefined}>
              {memberName(data, policy.insuredId)} 的「{policy.name}」——{st.stateName}
              {st.state === 'grace' && st.graceEnd && <>：应缴 {st.nextPayDate}，宽限期至 <b>{st.graceEnd}</b>，尽快补缴</>}
              {st.state === 'lapse' && st.graceEnd && <>：复效窗口约至 <b>{core.addDays(st.graceEnd, core.REINSTATE_WINDOW_DAYS)}</b>，联系保司办复效</>}
            </div>
          ))}
        </>
      )}

      <div className="jk-sec"><span className="jk-bar" />临近缴费 / 满期<span className="jk-hint">{data.settings.warnDays} 天内</span></div>
      {yellows.length === 0 && <div className="jk-card"><div className="jk-card-b jk-sub">未来 {data.settings.warnDays} 天没有应缴/满期保单。</div></div>}
      {yellows.map(({ policy, st }) => (
        <div key={policy.id} className="jk-card">
          <div className="jk-card-b">
            <div className="jk-row">
              <div className="jk-grow">
                <b style={{ fontSize: 12.5 }}>{memberName(data, policy.insuredId)} · {policy.name}</b>
                <div className="jk-sub">
                  {st.nextPayDate && st.daysToPay != null && st.daysToPay >= 0
                    ? <>缴费 {st.nextPayDate}（{st.daysToPay === 0 ? '今天' : `${st.daysToPay} 天后`}）{policy.premium != null ? ` ${core.fmtMoney(policy.premium)}` : ''}</>
                    : <>满期 {policy.endDate}</>}
                </div>
              </div>
              <span className="jk-tag yellow">{st.daysToPay != null && st.daysToPay >= 0 && st.nextPayDate ? '缴费' : '满期'}</span>
            </div>
          </div>
        </div>
      ))}

      {waiting.length > 0 && (
        <>
          <div className="jk-sec"><span className="jk-bar" />等待期中<span className="jk-hint">等待期内出险通常不赔</span></div>
          {waiting.map(({ policy, st }) => (
            <div key={policy.id} className="jk-card">
              <div className="jk-card-b jk-sub">
                {memberName(data, policy.insuredId)} 的「{policy.name}」——等待期至 <b style={{ color: '#E3B341' }}>{st.waitingEnd}</b>
              </div>
            </div>
          ))}
        </>
      )}

      <div className="jk-sec"><span className="jk-bar" />缺口速览<span className="jk-hint">四大件 = 医疗/重疾/寿险/意外</span></div>
      <div className="jk-card">
        <div className="jk-card-b jk-sub">
          {gapBits.length
            ? gapBits.map((b, i) => <div key={i}>· {b}</div>)
            : <div>✅ 四大件在册成员暂无缺格。</div>}
          {otherBits.length > 0 && <div style={{ marginTop: 4 }}>其他在保：{otherBits.join('、')}（不计入四大件）。</div>}
          <div style={{ marginTop: 4, color: '#5C6678' }}>口径：只统计有效/等待期/宽限期内的保单；中止期、已退保、已满期不计入覆盖。透视不构成投保建议。</div>
        </div>
      </div>

      {ended.length > 0 && (
        <>
          <div className="jk-sec"><span className="jk-bar" />留档<span className="jk-hint">满期 / 退保 / 终止</span></div>
          <div className="jk-card">
            <div className="jk-card-b jk-sub">
              {ended.map(({ policy, st }) => (
                <div key={policy.id}>· {memberName(data, policy.insuredId)} 的「{policy.name}」——{st.stateName}{st.surrenderDate ? `（${st.surrenderDate}）` : ''}</div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
