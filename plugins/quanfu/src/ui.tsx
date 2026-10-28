/** 面板小部件：状态徽章（总览/贷款共用） */
import * as core from '../shared/core'
import type { Loan, LoanState } from '../shared/core'

export const METHOD_CN: Record<string, string> = { annuity: '等额本息', linear: '等额本金', bullet: '先息后本' }
export const KIND_CN: Record<string, string> = {
  mortgage: '房贷', car: '车贷', consumer: '消费贷', business: '经营贷', other: '其他',
}

export function fmtStateBadges(loan: Loan, st: LoanState) {
  return (
    <>
      <span className="qf-tag">{KIND_CN[loan.kind] || loan.kind}</span>
      <span className="qf-tag">{METHOD_CN[loan.method] || loan.method} · {core.fmtPct(st.currentRate)}</span>
      {loan.groupId && <span className="qf-tag blue">组合</span>}
      {!loan.active && <span className="qf-tag">已停用</span>}
      {st.settled && loan.active !== false && <span className="qf-tag green">已结清</span>}
    </>
  )
}
