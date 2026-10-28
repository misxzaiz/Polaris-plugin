/**
 * 贷款 Tab：清单 + 新建/编辑 + 详情（年度本息构成 / 事件流水 / 记事件 / 删除）
 */
import { useState } from 'react'
import * as core from '../shared/core'
import { deleteEvent, deleteLoan, eventsOf, saveEvent, saveLoan } from './model'
import { fmtStateBadges, KIND_CN, METHOD_CN } from './ui'
import type { TabProps } from './Panel'
import type { Loan, LoanState } from '../shared/core'

const KIND_OPTS = Object.entries(KIND_CN)
const METHOD_OPTS = Object.entries(METHOD_CN)

export default function LoansTab({ data, states, reload, showToast }: TabProps & { states: LoanState[] }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  if (!data) return <div className="qf-empty">载入中…</div>
  const loans = data.loans

  return (
    <div>
      <div className="qf-sec">
        <span className="qf-bar" />贷款 {loans.length} 笔
        <span className="qf-hint">组合贷用相同「归组」聚合展示</span>
      </div>
      <div style={{ margin: '0 16px 10px' }}>
        <button className="qf-btn gold" style={{ width: '100%' }} onClick={() => { setAdding(!adding); setEditing(null) }}>
          {adding ? '收起新建表单' : '＋ 新建贷款'}
        </button>
      </div>
      {adding && <LoanForm onCancel={() => setAdding(false)} onDone={async (msg) => { setAdding(false); await reload(); showToast(msg) }} showToast={showToast} />}

      {!loans.length && <div className="qf-empty">还没有贷款。点上方「新建贷款」，或在聊天里对 AI 一句话说建。</div>}

      {loans.map((loan) => {
        const st = states[loans.indexOf(loan)]
        const open = openId === loan.id
        if (editing === loan.id) {
          return <LoanForm key={loan.id} existing={loan} onCancel={() => setEditing(null)} onDone={async (msg) => { setEditing(null); await reload(); showToast(msg) }} showToast={showToast} />
        }
        return (
          <div className="qf-card" key={loan.id}>
            <div className="qf-card-b" onClick={() => setOpenId(open ? null : loan.id)} style={{ cursor: 'pointer' }}>
              <div className="qf-row">
                <b style={{ fontSize: 13 }}>{loan.name}</b>
                {fmtStateBadges(loan, st)}
                <span className="qf-grow" />
                <span className="qf-num" style={{ fontSize: 12.5, fontWeight: 700 }}>{core.fmtMoney(st.remainingPrincipal)}</span>
                <span style={{ color: '#5C6678', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
              </div>
              <div className="qf-sub">
                {st.settled ? `已按计划结清（${st.endDate}）` : `${core.METHOD_NAMES[loan.method] || loan.method} ${core.fmtPct(st.currentRate)} · 已还 ${st.monthsPaid}/${st.totalMonths} 期 · 下期 ${core.fmtMoney(st.nextPaymentAmount)}（${st.nextPaymentDate}）`}
              </div>
            </div>
            {open && <LoanDetail loan={loan} states={states} data={data} reload={reload} showToast={showToast} onEdit={() => setEditing(loan.id)} />}
          </div>
        )
      })}
    </div>
  )
}

// ── 新建/编辑表单 ────────────────────────────────────────────────────────────
function LoanForm({ existing, onCancel, onDone, showToast }: {
  existing?: Loan
  onCancel: () => void
  onDone: (msg: string) => void | Promise<void>
  showToast: (msg: string, bad?: boolean) => void
}) {
  const [f, setF] = useState({
    name: existing?.name || '',
    kind: existing?.kind || 'mortgage',
    method: existing?.method || 'annuity',
    principal: existing ? String(existing.principal / 10000) : '',
    annualRate: existing ? String(existing.annualRate) : '',
    termMonths: existing ? String(existing.termMonths) : '360',
    startDate: existing?.startDate || '',
    lender: existing?.lender || '',
    groupId: existing?.groupId || '',
    rpDay: existing?.repricing ? existing.repricing.day : '',
    rpCycle: existing?.repricing ? String(existing.repricing.cycleMonths) : '12',
    note: existing?.note || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    setBusy(true)
    try {
      const repricing = f.rpDay ? { day: f.rpDay, cycleMonths: +f.rpCycle } : null
      const loan = await saveLoan({
        ...(existing ? { id: existing.id, createdAt: existing.createdAt, active: existing.active } : {}),
        name: f.name, kind: f.kind, method: f.method,
        principalWan: f.principal, annualRate: +f.annualRate, termMonths: +f.termMonths,
        startDate: f.startDate, lender: f.lender, groupId: f.groupId, repricing, note: f.note,
      }, existing || null)
      await onDone(`${existing ? '已更新' : '已新建'}「${loan.name}」`)
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="qf-card">
      <div className="qf-card-b">
        <b style={{ fontSize: 12.5 }}>{existing ? `编辑：${existing.name}` : '新建贷款'}</b>
        <label className="qf-lbl" style={{ marginTop: 6 }}>名称 *</label>
        <input className="qf-inp" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="商贷 / 公积金 / 车贷" />
        <div className="qf-row" style={{ gap: 8 }}>
          <div className="qf-grow">
            <label className="qf-lbl">类型</label>
            <select className="qf-sel" value={f.kind} onChange={(e) => set('kind', e.target.value)}>
              {KIND_OPTS.map(([k, cn]) => <option key={k} value={k}>{cn}</option>)}
            </select>
          </div>
          <div className="qf-grow">
            <label className="qf-lbl">还款方式 *</label>
            <select className="qf-sel" value={f.method} onChange={(e) => set('method', e.target.value)}>
              {METHOD_OPTS.map(([k, cn]) => <option key={k} value={k}>{cn}</option>)}
            </select>
          </div>
        </div>
        <div className="qf-row" style={{ gap: 8 }}>
          <div className="qf-grow">
            <label className="qf-lbl">本金（万）*</label>
            <input className="qf-inp qf-num" inputMode="decimal" value={f.principal} onChange={(e) => set('principal', e.target.value)} placeholder="100" />
          </div>
          <div className="qf-grow">
            <label className="qf-lbl">年利率 % *</label>
            <input className="qf-inp qf-num" inputMode="decimal" value={f.annualRate} onChange={(e) => set('annualRate', e.target.value)} placeholder="3.6" />
          </div>
          <div className="qf-grow">
            <label className="qf-lbl">期数（月）*</label>
            <input className="qf-inp qf-num" inputMode="numeric" value={f.termMonths} onChange={(e) => set('termMonths', e.target.value)} />
          </div>
        </div>
        <label className="qf-lbl">第一期还款日 *（不是放款日）</label>
        <input className="qf-inp" type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
        <div className="qf-row" style={{ gap: 8 }}>
          <div className="qf-grow">
            <label className="qf-lbl">放贷机构</label>
            <input className="qf-inp" value={f.lender} onChange={(e) => set('lender', e.target.value)} placeholder="（可选）" />
          </div>
          <div className="qf-grow">
            <label className="qf-lbl">归组（组合贷）</label>
            <input className="qf-inp" value={f.groupId} onChange={(e) => set('groupId', e.target.value)} placeholder="如 home" />
          </div>
        </div>
        <div className="qf-row" style={{ gap: 8 }}>
          <div className="qf-grow">
            <label className="qf-lbl">重定价日</label>
            <input className="qf-inp" value={f.rpDay} onChange={(e) => set('rpDay', e.target.value)} placeholder="01-01 或 anniversary" />
          </div>
          <div className="qf-grow">
            <label className="qf-lbl">重定价周期（月）</label>
            <select className="qf-sel" value={f.rpCycle} onChange={(e) => set('rpCycle', e.target.value)}>
              <option value="12">12</option><option value="6">6</option><option value="3">3</option>
            </select>
          </div>
        </div>
        <label className="qf-lbl">备注（违约金条款等）</label>
        <input className="qf-inp" value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="（可选）" />
        <div className="qf-row" style={{ marginTop: 10, gap: 8 }}>
          <button className="qf-btn gold qf-grow" disabled={busy} onClick={submit}>{existing ? '保存修改' : '建账'}</button>
          <button className="qf-btn ghost" onClick={onCancel}>取消</button>
        </div>
        {!existing && (
          <div className="qf-sub" style={{ marginTop: 6 }}>
            建账后按参数整表推算；建议用银行 App 的实际剩余本金在详情里「记对账」核一次。
          </div>
        )}
      </div>
    </div>
  )
}

// ── 详情：年度构成 + 事件 + 记事件 + 操作 ────────────────────────────────────
function LoanDetail({ loan, states, data, reload, showToast, onEdit }: {
  loan: Loan
  states: LoanState[]
  data: NonNullable<TabProps['data']>
  reload: TabProps['reload']
  showToast: TabProps['showToast']
  onEdit: () => void
}) {
  const idx = data.loans.indexOf(loan)
  const st = states[idx]
  const events = eventsOf(data, loan.id)
  const [logType, setLogType] = useState<'rate' | 'prepay' | 'checkpoint'>('prepay')
  const [logF, setLogF] = useState({ date: '', rate: '', amount: '', mode: 'payment', note: '' })
  const [busy, setBusy] = useState(false)
  const years = core.yearlyBreakdown(loan, eventsOf(data, loan.id))
  const maxY = Math.max(1, ...years.map((y) => y.paid))

  const submitLog = async () => {
    setBusy(true)
    try {
      const date = logF.date || st.today
      const amount = logF.amount ? Math.round(Number(logF.amount) * 10000 * 100) / 100 : null
      const input: Record<string, unknown> = {
        type: logType, loanId: loan.id, date, note: logF.note,
      }
      if (logType === 'rate') input.rate = +logF.rate
      if (logType === 'prepay' || logType === 'checkpoint') input.amount = amount
      if (logType === 'prepay') input.mode = logF.mode
      if (logType === 'prepay') {
        const v = core.validatePrepay(loan, events, { date, amount: amount || 0 })
        if (v.error) { showToast(v.error, true); return }
      }
      await saveEvent(input)
      setLogF({ date: '', rate: '', amount: '', mode: 'payment', note: '' })
      await reload()
      showToast(`已记录：${logType === 'rate' ? '利率变更' : logType === 'prepay' ? '提前还款' : '对账点'}`)
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async () => {
    await saveLoan({ id: loan.id, active: loan.active === false }, loan)
    await reload()
    showToast(loan.active === false ? '已恢复计入' : '已停用（历史保留）')
  }

  const del = async () => {
    if (!window.confirm(`删除「${loan.name}」及其 ${events.length} 条事件记录？不可恢复。`)) return
    await deleteLoan(loan.id, data)
    await reload()
    showToast('已删除')
  }

  return (
    <div style={{ borderTop: '1px solid #242C3A', padding: '10px 13px' }}>
      <div className="qf-row" style={{ gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <button className="qf-btn ghost sm" onClick={onEdit}>编辑参数</button>
        <button className="qf-btn ghost sm" onClick={toggleActive}>{loan.active === false ? '恢复计入' : '停用（结清/转出）'}</button>
        <span className="qf-grow" />
        <button className="qf-btn danger sm" onClick={del}>删除</button>
      </div>

      <div className="qf-sub" style={{ marginBottom: 6 }}>
        已付利息 {core.fmtMoney(st.paidInterest)} + 本金 {core.fmtMoney(st.paidPrincipal)}{st.paidPrepay ? ` + 提前还 ${core.fmtMoney(st.paidPrepay)}` : ''} · 今年付息 {core.fmtMoney(st.paidThisYearInterest)}
        {loan.note ? <> · 备注：{loan.note}</> : null}
      </div>

      {/* 年度本息构成（迷你柱图） */}
      <div className="qf-sub" style={{ marginBottom: 3 }}>年度支出构成（柱高=当年现金支出；深色=利息）</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 54, marginBottom: 2 }}>
        {years.map((y) => {
          const h = Math.max(3, Math.round((y.paid / maxY) * 54))
          const ih = y.paid > 0 ? Math.max(2, Math.round((y.interest / y.paid) * h)) : 0
          return (
            <div key={y.year} style={{ flex: 1, minWidth: 0 }} title={`${y.year}：息 ${core.fmtMoney(y.interest)} / 本 ${core.fmtMoney(y.principal)}${y.prepay ? ` / 提前还 ${core.fmtMoney(y.prepay)}` : ''}`}>
              <div style={{ height: h, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderRadius: 2, overflow: 'hidden', background: '#2b4a37' }}>
                <div style={{ height: ih, background: '#8a6414' }} />
              </div>
              <div style={{ fontSize: 8, color: '#5C6678', textAlign: 'center', marginTop: 1 }}>{y.year.slice(2)}</div>
            </div>
          )
        })}
      </div>

      {/* 记事件 */}
      <div className="qf-row" style={{ gap: 6, marginTop: 10 }}>
        {([['prepay', '提前还款'], ['rate', '利率变更'], ['checkpoint', '对账']] as const).map(([k, cn]) => (
          <button key={k} className={`qf-btn sm ${logType === k ? 'gold' : 'ghost'}`} onClick={() => setLogType(k)}>{cn}</button>
        ))}
      </div>
      <div className="qf-row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <input className="qf-inp" style={{ width: 130 }} type="date" value={logF.date} onChange={(e) => setLogF((p) => ({ ...p, date: e.target.value }))} placeholder={st.today} />
        {logType === 'rate' && (
          <input className="qf-inp qf-num" style={{ width: 90 }} inputMode="decimal" value={logF.rate} onChange={(e) => setLogF((p) => ({ ...p, rate: e.target.value }))} placeholder="新利率 %" />
        )}
        {logType !== 'rate' && (
          <input className="qf-inp qf-num" style={{ width: 110 }} inputMode="decimal" value={logF.amount} onChange={(e) => setLogF((p) => ({ ...p, amount: e.target.value }))} placeholder={logType === 'prepay' ? '金额（万）' : '银行余额（万）'} />
        )}
        {logType === 'prepay' && (
          <select className="qf-sel" style={{ width: 100 }} value={logF.mode} onChange={(e) => setLogF((p) => ({ ...p, mode: e.target.value }))}>
            <option value="payment">减月供</option>
            <option value="term">缩期</option>
          </select>
        )}
        <button className="qf-btn sm" disabled={busy} onClick={submitLog}>记录</button>
      </div>

      {/* 事件流水 */}
      <div className="qf-sub" style={{ margin: '10px 0 3px' }}>事件流水（{events.length}）</div>
      {!events.length && <div className="qf-sub">尚无利率变更/提前还款/对账记录。</div>}
      {events.slice().reverse().slice(0, 20).map((e) => (
        <div className="qf-row" key={e.occKey} style={{ padding: '3px 0', borderTop: '1px solid #1C2330' }}>
          <span className="qf-sub qf-num">{e.date}</span>
          <span className="qf-tag">{e.type === 'rate' ? '利率' : e.type === 'prepay' ? '提前还' : '对账'}</span>
          <span className="qf-sub qf-num qf-grow">
            {e.type === 'rate' ? `→ ${core.fmtPct(e.rate)}` : e.type === 'prepay' ? `${core.fmtMoney(e.amount)}（${e.mode === 'term' ? '缩期' : '减月供'}）` : `银行 ${core.fmtMoney(e.amount)}`}
            {e.note ? ` · ${e.note}` : ''}
          </span>
          <button
            className="qf-btn danger sm"
            onClick={async () => { await deleteEvent(e.occKey); await reload(); showToast('已删除该事件，还款表重放') }}
          >删</button>
        </div>
      ))}
    </div>
  )
}
