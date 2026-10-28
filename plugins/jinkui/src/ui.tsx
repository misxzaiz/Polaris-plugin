/** 面板小部件：状态徽章与文案（总览/保单/透视共用） */
import * as core from '../shared/core'
import type { Policy, PolicyState } from '../shared/core'

export const KIND_CN: Record<string, string> = {
  medical: '医疗', critical: '重疾', life: '寿险', accident: '意外',
  annuity: '年金', property: '家财', other: '其他',
}
export const FREQ_CN: Record<string, string> = {
  yearly: '年缴', half: '半年缴', quarter: '季缴', monthly: '月缴', single: '趸交',
}
export const RELATION_CN: Record<string, string> = {
  self: '本人', spouse: '配偶', child: '子女', parent: '父母', other: '其他',
}

export function stateTag(st: PolicyState) {
  if (st.state === 'active' || st.state === 'paid-off') return <span className="jk-tag green">{st.stateName}</span>
  if (st.state === 'grace' || st.state === 'lapse') return <span className="jk-tag red">{st.stateName}</span>
  if (st.state === 'waiting') return <span className="jk-tag yellow">{st.stateName}</span>
  return <span className="jk-tag">{st.stateName}</span>
}

export function kindTag(policy: Policy) {
  return <span className="jk-tag blue">{KIND_CN[policy.kind] || policy.kind}</span>
}
