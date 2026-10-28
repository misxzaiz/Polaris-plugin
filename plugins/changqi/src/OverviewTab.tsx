/**
 * 总览 Tab：透视 KPI 头 + 预警条（today/trial/soon/week）+ 状态过滤 + 台账卡 + 内联录入/编辑表单
 */
import { useMemo, useState } from 'react'
import {
  addSub, updateSub, kvDel, K, fmtMoney, monthlyEquivalent,
  CYCLES, CYCLE_LABELS, CHANNELS, CHANNEL_LABELS, DEFAULT_CATEGORIES,
  type PanelData, type Subscription, type RowInfo,
} from './model'
import type { Toast } from './Panel'

type StatusFilter = 'active+trial' | 'trial' | 'cancelled'

interface FormState {
  id: string | null
  name: string
  amount: string
  cycle: string
  cycleDays: string
  anchorDate: string
  channel: string
  category: string
  trialEndsAt: string
  note: string
}

function emptyForm(today: string): FormState {
  return { id: null, name: '', amount: '', cycle: 'monthly', cycleDays: '', anchorDate: today, channel: 'other', category: '其他', trialEndsAt: '', note: '' }
}

function formFromSub(s: Subscription): FormState {
  return {
    id: s.id,
    name: s.name,
    amount: String(s.amount),
    cycle: s.cycle,
    cycleDays: s.cycleDays != null ? String(s.cycleDays) : '',
    anchorDate: s.anchorDate,
    channel: s.channel,
    category: s.category,
    trialEndsAt: s.trialEndsAt || '',
    note: s.note || '',
  }
}

/** 预警条顺序：today → trial → soon → week */
const ALERT_ORDER: Record<string, number> = { today: 0, trial: 1, soon: 2, week: 3 }

export default function OverviewTab({ data, reload, showToast }: {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
}) {
  const [filter, setFilter] = useState<StatusFilter>('active+trial')
  const [form, setForm] = useState<FormState | null>(null)
  const [busy, setBusy] = useState(false)

  const categories = useMemo(() => {
    const own = new Set<string>(DEFAULT_CATEGORIES)
    if (data) for (const s of data.subs) if (s.category) own.add(s.category)
    return [...own]
  }, [data])

  if (!data) return <div className="cq-empty">载入中…</div>
  const ov = data.overview
  const sym = data.settings.currencySymbol

  const alerts = ov.rows
    .filter((r) => r.urgency && r.urgency !== 'calm')
    .sort((a, b) => (ALERT_ORDER[a.urgency as string] ?? 9) - (ALERT_ORDER[b.urgency as string] ?? 9))

  // 已取消视图的卡片来自全量 subs（computeOverview.rows 只含进行中+试用）
  const cancelledRows: RowInfo[] = data.subs
    .filter((s) => s.status === 'cancelled')
    .map((s) => ({ sub: s, monthlyEquiv: monthlyEquivalent(s), nextChargeDate: null, daysUntil: null, urgency: null }))
  const rows = filter === 'cancelled'
    ? cancelledRows
    : ov.rows.filter((r) => {
      if (filter === 'trial') return r.sub.status === 'trial'
      return r.sub.status === 'active' || r.sub.status === 'trial'
    })

  const submitForm = async () => {
    if (!form || busy) return
    const amount = Number(form.amount)
    if (!form.name.trim()) { showToast('请填写订阅名称', 'bad'); return }
    if (!Number.isFinite(amount) || amount <= 0) { showToast('金额需为正数', 'bad'); return }
    if (form.cycle === 'custom' && !(Number(form.cycleDays) >= 1)) { showToast('自定义周期需填天数（≥1）', 'bad'); return }
    setBusy(true)
    try {
      const payload = {
        name: form.name.trim(),
        amount,
        cycle: form.cycle,
        cycleDays: form.cycle === 'custom' ? Math.floor(Number(form.cycleDays)) : undefined,
        anchorDate: form.anchorDate,
        channel: form.channel,
        category: form.category,
        trialEndsAt: form.trialEndsAt || undefined,
        note: form.note.trim() || undefined,
      }
      if (form.id) {
        const r = await updateSub(form.id, payload as Record<string, unknown>)
        if (!r.ok) throw new Error(r.error || '更新失败')
        showToast('已保存修改', 'good')
      } else {
        const r = await addSub(payload)
        if (!r.ok) throw new Error(r.error || '入册失败')
        showToast(`已入册「${payload.name}」`, 'good')
      }
      setForm(null)
      await reload()
    } catch (e) {
      showToast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const doAction = async (fn: () => Promise<unknown>, okMsg: string) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      await reload()
      showToast(okMsg, 'good')
    } catch (e) {
      showToast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const kpi = (label: string, value: string, sub: string) => (
    <div className="cq-kpi" key={label}>
      <small>{label}</small>
      <b>{value}</b>
      <em>{sub}</em>
    </div>
  )

  const alertLine = (r: RowInfo) => {
    const isTrial = r.sub.status === 'trial'
    const cls = r.urgency === 'today' ? 'today' : r.urgency === 'trial' ? 'trial' : r.urgency === 'soon' ? 'soon' : 'week'
    const dayText = r.daysUntil === 0 ? '今天' : r.daysUntil != null && r.daysUntil > 0 ? `${r.daysUntil} 天后` : ''
    const text = isTrial
      ? `${r.sub.name} 试用期将转正`
      : r.urgency === 'today' ? `${r.sub.name} 今天扣费` : `${r.sub.name} 即将扣费`
    return (
      <div key={r.sub.id} className={`cq-alert ${cls}`}>
        <b>{text}</b>
        <small>{isTrial ? `${r.nextChargeDate} 转正扣 ${fmtMoney(r.sub.amount, sym)}` : `${r.nextChargeDate} · ${fmtMoney(r.sub.amount, sym)}${dayText ? ` · ${dayText}` : ''}`}</small>
      </div>
    )
  }

  const card = (r: RowInfo) => {
    const s = r.sub
    const isTrial = s.status === 'trial'
    const isCancelled = s.status === 'cancelled'
    const cyc = s.cycle === 'custom' ? `每${s.cycleDays}天` : CYCLE_LABELS[s.cycle] || s.cycle
    const nextText = isCancelled
      ? '已取消 · 不再提醒'
      : r.nextChargeDate
        ? `${r.urgency === 'today' ? '今天扣费' : r.nextChargeDate}（${r.daysUntil === 0 ? '今天' : `${r.daysUntil} 天后`}）`
        : '无下期'
    return (
      <div key={s.id} className={`cq-item ${r.urgency === 'today' ? 'urgent' : ''}`}>
        <div className="cq-item-head">
          <b>{s.name}</b>
          {isTrial && <span className="cq-badge trialb">试用</span>}
          {isCancelled && <span className="cq-badge doneb">已取消</span>}
          <span className="cq-badge">{CHANNEL_LABELS[s.channel] || s.channel}</span>
          <span className="cq-badge">{s.category}</span>
        </div>
        <div className="cq-item-mid">
          <span className={`cq-next ${r.urgency === 'today' || r.urgency === 'trial' ? 'hot' : ''}`}>{nextText}</span>
          <span className="cq-amt">
            <b>{fmtMoney(s.amount, sym)}</b>
            <small>/{cyc} · 月均 {fmtMoney(monthlyEquivalent(s), sym)}</small>
          </span>
        </div>
        <div className="cq-item-foot">
          <span className="note">{s.note || (isTrial ? `试用期至 ${s.trialEndsAt}` : '')}</span>
          {!isCancelled && s.status === 'active' && (
            <button className="cq-btn sm ghost" disabled={busy} onClick={() => doAction(
              () => updateSub(s.id, { lastConfirmedDate: data.today }),
              `已确认「${s.name}」本期已扣，下期顺延`,
            )}>已扣</button>
          )}
          {!isCancelled && (
            <button className="cq-btn sm ghost" disabled={busy} onClick={() => {
              const guide = confirmCancel(s.name)
              if (guide) doAction(() => updateSub(s.id, { status: 'cancelled' }), `已取消「${s.name}」，可在已取消列表恢复`)
            }}>取消</button>
          )}
          {isCancelled && (
            <button className="cq-btn sm ghost" disabled={busy} onClick={() => doAction(
              () => updateSub(s.id, { status: 'active' }),
              `已恢复「${s.name}」`,
            )}>恢复</button>
          )}
          <button className="cq-btn sm ghost" disabled={busy} onClick={() => setForm(formFromSub(s))}>编辑</button>
          {isCancelled && <DeleteBtn busy={busy} name={s.name} onDelete={() => doAction(
            async () => { await kvDel(K.sub(s.id)) },
            `已彻底删除「${s.name}」`,
          )} />}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="cq-kpis">
        {kpi('月均支出', fmtMoney(ov.monthlyTotal, sym), `年化 ${fmtMoney(ov.yearlyTotal, sym)}`)}
        {kpi('本月将扣', `${ov.monthCharge.count} 笔`, fmtMoney(ov.monthCharge.sum, sym))}
        {kpi('试用期', `${ov.trialCount} 笔`, ov.trialExpiring.length ? `${ov.trialExpiring.length} 笔临近转正` : '无临近转正')}
      </div>

      {alerts.length > 0 && (
        <>
          <div className="cq-sec"><span className="cq-bar" />提醒<span className="cq-hint">距下次扣费 {data.settings.remindDays} 天内</span></div>
          {alerts.map(alertLine)}
        </>
      )}

      <div className="cq-chiprow">
        <button className={`cq-chip ${filter === 'active+trial' ? 'on' : ''}`} onClick={() => setFilter('active+trial')}>
          进行中 {ov.rows.filter((r) => r.sub.status !== 'cancelled').length}
        </button>
        <button className={`cq-chip ${filter === 'trial' ? 'on' : ''}`} onClick={() => setFilter('trial')}>
          试用 {ov.trialCount}
        </button>
        <button className={`cq-chip ${filter === 'cancelled' ? 'on' : ''}`} onClick={() => setFilter('cancelled')}>
          已取消 {ov.cancelledCount}
        </button>
        <button className="cq-btn sm" style={{ marginLeft: 'auto' }} onClick={() => setForm(emptyForm(data.today))}>＋ 入册订阅</button>
      </div>

      {form && (
        <div className="cq-card">
          <div className="cq-card-b">
            <b style={{ fontSize: 12.5 }}>{form.id ? '编辑订阅' : '入册订阅'}</b>
            <label className="cq-lbl">名称</label>
            <input className="cq-inp" value={form.name} placeholder="如：网易云音乐黑胶VIP" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="cq-lbl">每期金额</label>
                <input className="cq-inp" type="number" min="0" step="0.01" value={form.amount} placeholder="15" onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="cq-lbl">周期</label>
                <select className="cq-sel" style={{ width: '100%' }} value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })}>
                  {CYCLES.map((c) => <option key={c} value={c}>{CYCLE_LABELS[c] || c}</option>)}
                </select>
              </div>
              {form.cycle === 'custom' && (
                <div style={{ flex: 1 }}>
                  <label className="cq-lbl">天数</label>
                  <input className="cq-inp" type="number" min="1" value={form.cycleDays} onChange={(e) => setForm({ ...form, cycleDays: e.target.value })} />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="cq-lbl">下次扣费日 / 上次扣费日</label>
                <input className="cq-inp" type="date" value={form.anchorDate} onChange={(e) => setForm({ ...form, anchorDate: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="cq-lbl">扣费渠道</label>
                <select className="cq-sel" style={{ width: '100%' }} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                  {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c] || c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="cq-lbl">分类</label>
                <select className="cq-sel" style={{ width: '100%' }} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="cq-lbl">试用期截止（留空=非试用）</label>
                <input className="cq-inp" type="date" value={form.trialEndsAt} onChange={(e) => setForm({ ...form, trialEndsAt: e.target.value })} />
              </div>
            </div>
            <label className="cq-lbl">备注</label>
            <input className="cq-inp" value={form.note} placeholder="可选" onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <div className="cq-form-actions">
              <button className="cq-btn" disabled={busy} onClick={submitForm}>{form.id ? '保存' : '入册'}</button>
              <button className="cq-btn ghost" disabled={busy} onClick={() => setForm(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      <div className="cq-sec"><span className="cq-bar" />台账<span className="cq-hint">共 {rows.length} 笔</span></div>
      {rows.length === 0 && (
        <div className="cq-empty">
          {filter === 'cancelled' ? '没有已取消的订阅。' : '台账还是空的——点右上「＋ 入册订阅」，\n或在聊天里直接说「帮我把网易云会员记入订阅」。'}
        </div>
      )}
      {rows.map(card)}
    </>
  )
}

/** 取消前确认（面板侧内联 confirm；确认后 AI/面板文案同走 cancelGuide 语义） */
function confirmCancel(name: string): boolean {
  return window.confirm(`确认取消「${name}」？\n取消后不再提醒（台账留档可恢复）。\n记得按引导到支付渠道关闭自动续费，否则仍会被扣款。`)
}

function DeleteBtn({ busy, name, onDelete }: { busy: boolean; name: string; onDelete: () => Promise<void> }) {
  const [armed, setArmed] = useState(false)
  if (!armed) {
    return <button className="cq-btn sm danger" disabled={busy} onClick={() => setArmed(true)}>删</button>
  }
  return (
    <span className="cq-confirm-inline">
      <button className="cq-btn sm danger" disabled={busy} onClick={async () => {
        setArmed(false)
        await onDelete()
      }}>确认删</button>
      <button className="cq-btn sm ghost" disabled={busy} onClick={() => setArmed(false)}>否</button>
    </span>
  )
}
