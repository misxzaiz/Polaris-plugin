/**
 * 透视 Tab：四大件缺口矩阵 + 未来 12 个月保费现金流 + 理赔流水。
 * 全部 core 现算（与 MCP query gap/stats 同口径）。
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

export default function InsightsTab({ data }: Props) {
  const derived = useMemo(() => {
    if (!data) return null
    const now = Date.now()
    const gap = core.gapMatrix(data.members, data.policies, data.events, data.settings, now)
    const flow = core.premiumFlow(data.policies, data.events, data.settings, now)
    const claims = data.events
      .filter((e) => e.type === 'claim')
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 20)
      .map((e) => ({ ev: e, policy: data.policies.find((p) => p.id === e.policyId) || null }))
    return { gap, flow, claims, now }
  }, [data])

  if (!data || !derived) return <div className="jk-empty">加载中…</div>
  const { gap, flow, claims } = derived

  return (
    <>
      <div className="jk-sec"><span className="jk-bar" />保障缺口矩阵<span className="jk-hint">现状透视，不构成投保建议</span></div>
      <div className="jk-card">
        <div className="jk-card-b" style={{ overflowX: 'auto' }}>
          {!data.members.length && <div className="jk-sub">先在「设置」Tab 建成员。</div>}
          {!!data.members.length && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ color: '#8B95A7' }}>
                  <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>成员</th>
                  {core.GAP_KINDS.map((k) => (
                    <th key={k} style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>{KIND_CN[k]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gap.rows.map((row) => (
                  <tr key={row.memberId} style={{ borderTop: '1px solid #242C3A' }}>
                    <td style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>{row.name}</td>
                    {core.GAP_KINDS.map((k) => {
                      const c = row.cells[k]
                      return (
                        <td key={k} style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>
                          {c
                            ? <span>{c.count} 张 · <b className="jk-num">{core.fmtMoney(c.sum)}</b></span>
                            : <span className="jk-tag red">缺</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="jk-sub" style={{ marginTop: 8 }}>
            口径：只统计有效/等待期/宽限期内的保单；中止期、已退保、已满期不计入覆盖（中止期出险不赔，如实呈现）。
            {Object.entries(gap.otherKinds).some(([, n]) => n > 0) && (
              <> 其他在保：{Object.entries(gap.otherKinds).filter(([, n]) => n > 0).map(([k, n]) => `${KIND_CN[k] || k}×${n}`).join('、')}（信息层）。</>
            )}
          </div>
        </div>
      </div>

      <div className="jk-sec"><span className="jk-bar" />未来 12 个月保费现金流<span className="jk-hint">合计 {core.fmtMoney(flow.total)}</span></div>
      <div className="jk-card">
        <div className="jk-card-b">
          {Object.keys(flow.months).length === 0 && <div className="jk-sub">未来 12 个月无应缴（趸交/缴费期满/无保费记录）。</div>}
          {Object.keys(flow.months).sort().map((mk) => (
            <div key={mk} className="jk-kv">
              <span className="jk-num">{mk}</span>
              <span className="jk-num">{core.fmtMoney(flow.months[mk].amount)}<span className="jk-sub">（{flow.months[mk].items.map((i) => i.name).join('、')}）</span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="jk-sec"><span className="jk-bar" />理赔流水<span className="jk-hint">最近 20 条</span></div>
      <div className="jk-card">
        <div className="jk-card-b">
          {!claims.length && <div className="jk-sub">暂无理赔记录。理赔到账后在对 AI 说「XX 保单理赔下来 N 元」即可记入。</div>}
          {claims.map(({ ev, policy }) => (
            <div key={ev.occKey} className="jk-kv">
              <span>{ev.date} · {policy ? policy.name : '已删保单'}{ev.note ? ` · ${ev.note}` : ''}</span>
              <span className="jk-num" style={{ color: '#3FB950' }}>{ev.amount != null ? core.fmtMoney(ev.amount) : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
