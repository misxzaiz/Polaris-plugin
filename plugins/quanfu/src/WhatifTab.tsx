/**
 * 测算 Tab：提前还款三方案对比工作台（本地 core 现算，不落库）
 */
import { useState } from 'react'
import * as core from '../shared/core'
import { eventsOf } from './model'
import type { TabProps } from './Panel'
import type { LoanState, WhatifResult } from '../shared/core'

export default function WhatifTab({ data, states, showToast }: TabProps & { states: LoanState[] }) {
  const [loanIdx, setLoanIdx] = useState(0)
  const [amount, setAmount] = useState('20')
  const [unit, setUnit] = useState<'wan' | 'yuan'>('wan')
  const [date, setDate] = useState('')
  const [result, setResult] = useState<{ w: WhatifResult; amount: number } | null>(null)
  const [busy, setBusy] = useState(false)

  if (!data) return <div className="qf-empty">载入中…</div>
  const allLoans = data.loans
  const activeLoans = allLoans.filter((l, i) => l.active !== false && !states[i].settled)
  if (!activeLoans.length) {
    return <div className="qf-empty">没有在还的贷款可测算——先在「贷款」Tab 添加。</div>
  }
  const loan = activeLoans[Math.min(loanIdx, activeLoans.length - 1)]
  const st = states[data.loans.indexOf(loan)]

  const run = async () => {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) { showToast('请输入金额', true); return }
    const amt = unit === 'wan' ? Math.round(n * 10000 * 100) / 100 : Math.round(n * 100) / 100
    setBusy(true)
    try {
      const w0 = core.whatifPrepay(loan, eventsOf(data, loan.id), { date: date || st.today, amount: amt })
      if ('error' in w0) { showToast(w0.error, true); setResult(null); return }
      setResult({ w: w0, amount: amt })
    } finally {
      setBusy(false)
    }
  }

  const col = (label: string, s: { remainingInterest: number; remainingMonths: number; endDate: string | null; nextPayment: number }, saved: number | null, hl: boolean) => (
    <div style={{ flex: 1, minWidth: 0, background: hl ? '#1C2330' : '#12151c', border: `1px solid ${hl ? '#5a4a1e' : '#2a2f3a'}`, borderRadius: 10, padding: '9px 10px' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div className="qf-num" style={{ fontSize: 15, fontWeight: 700, color: '#E3B341' }}>{core.fmtMoney(s.remainingInterest)}</div>
      <div className="qf-sub">剩余总利息</div>
      {saved != null && saved > 0 && <div className="qf-num" style={{ fontSize: 11.5, color: '#3FB950', marginTop: 3 }}>省 {core.fmtMoney(saved)}</div>}
      <div className="qf-sub" style={{ marginTop: 5 }}>
        {s.remainingMonths} 期 · 结清 {s.endDate || '—'}<br />{label !== '不提前还' ? `下期月供 ${core.fmtMoney(s.nextPayment)}` : `月供 ${core.fmtMoney(s.nextPayment)}`}
      </div>
    </div>
  )

  return (
    <div>
      <div className="qf-card">
        <div className="qf-card-b">
          <label className="qf-lbl" style={{ marginTop: 0 }}>对哪笔贷款测算</label>
          <select className="qf-sel" value={Math.min(loanIdx, activeLoans.length - 1)} onChange={(e) => { setLoanIdx(+e.target.value); setResult(null) }}>
            {activeLoans.map((l, i) => <option key={l.id} value={i}>{l.name}（剩 {core.fmtMoney(states[data.loans.indexOf(l)].remainingPrincipal)}）</option>)}
          </select>
          <label className="qf-lbl">提前还款金额</label>
          <div className="qf-row">
            <input className="qf-inp qf-grow" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="20" />
            <button className={`qf-btn sm ${unit === 'wan' ? 'gold' : 'ghost'}`} onClick={() => setUnit('wan')}>万</button>
            <button className={`qf-btn sm ${unit === 'yuan' ? 'gold' : 'ghost'}`} onClick={() => setUnit('yuan')}>元</button>
          </div>
          <label className="qf-lbl">生效基准日（实际在其后第一个扣款日生效）</label>
          <input className="qf-inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} placeholder={st.today} />
          <div className="qf-row" style={{ marginTop: 10 }}>
            <button className="qf-btn gold qf-grow" disabled={busy} onClick={run}>对比：不还 / 缩期 / 减月供</button>
          </div>
          <div className="qf-sub" style={{ marginTop: 6 }}>
            当前利率 {core.fmtPct(st.currentRate)} · 余额 {core.fmtMoney(st.remainingPrincipal)} · 下期 {core.fmtMoney(st.nextPaymentAmount)}（{st.nextPaymentDate}）
          </div>
        </div>
      </div>

      {result && (
        <div className="qf-card">
          <div className="qf-card-b">
            <div className="qf-sub" style={{ marginBottom: 8 }}>
              生效期 {result.w.effectiveDate}（期初余额 {core.fmtMoney(result.w.balanceAtEff)}，提前还款 {core.fmtMoney(result.amount)}）
              {result.w.bulletNote && <><br />⚠ {result.w.bulletNote}</>}
            </div>
            <div className="qf-row" style={{ alignItems: 'stretch', gap: 8 }}>
              {col('不提前还', result.w.baseline, null, false)}
              {col('缩期（月供基本不变）', result.w.term, result.w.saved.term, result.w.saved.term >= result.w.saved.payment)}
              {col('减月供（期限不变）', result.w.payment, result.w.saved.payment, result.w.saved.payment > result.w.saved.term)}
            </div>
            <div className="qf-sub" style={{ marginTop: 8 }}>
              事实对比：同样一笔钱，缩期通常省息更多、减月供现金流更松——选哪个取决于你的现金流与合同条款，贷款台账不代作决定。
              满意的话在聊天里说「提前还 {unit === 'wan' ? `${amount} 万` : `${amount} 元`}选{result.w.saved.term >= result.w.saved.payment ? '缩期' : '减月供'}」，AI 会记录并重放账本。
            </div>
          </div>
        </div>
      )}

      <div className="qf-card">
        <div className="qf-card-b qf-sub">
          <b style={{ color: '#E6EAF2' }}>口径说明</b><br />
          · 等额本息：月供固定，先息后本；等额本金：月本金固定；先息后本：按月付息、到期还本（提前还款只减息不缩期）。<br />
          · 缩期 = 保持月供基本不变、把期限缩短；减月供 = 保持期限、重算更低的月供。<br />
          · 逐期分级舍入、末期补差，与银行实际计息可能有分级出入；违约金按各行合同另计（可在贷款备注里登记）。
        </div>
      </div>
    </div>
  )
}
