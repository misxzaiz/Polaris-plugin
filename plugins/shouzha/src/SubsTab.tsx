/**
 * 订阅 Tab：全量列表（状态过滤/搜索）+ 添加/编辑表单 + 行内操作（对账/暂停/取消/恢复/删除）
 * 表单字段与 core.normalizeSub 白名单一致；金额变化自动记价格史（applyUpdate）。
 */
import { useMemo, useState } from 'react'
import type { TabProps } from './Panel'
import {
  CATEGORIES, annualCost, applyUpdate, cancelSub, cycleLabel, daysBetween, fmtMoney,
  advanceDate, normalizeSub, pauseSub, resumeSub, saveSub, deleteSub, stateBadge, todayStr, renewSub,
  LIMITS,
  type Subscription,
} from './model'

type Filter = 'active' | 'trial' | 'paused' | 'cancelled' | 'all'

interface FormState {
  id?: string
  name: string
  vendor: string
  plan: string
  amount: string
  cycle: Subscription['cycle']
  customDays: string
  nextRenewalDate: string
  autoRenew: boolean
  status: 'active' | 'trial'
  trialEndsAt: string
  category: string
  paymentMethod: string
  manageUrl: string
  note: string
  remindDaysBefore: string
}

function emptyForm(defaultRemind: number): FormState {
  return {
    name: '', vendor: '', plan: '', amount: '', cycle: 'month', customDays: '',
    nextRenewalDate: '', autoRenew: true, status: 'active', trialEndsAt: '',
    category: '视频娱乐', paymentMethod: '', manageUrl: '', note: '',
    remindDaysBefore: String(defaultRemind),
  }
}

function toForm(s: Subscription): FormState {
  return {
    id: s.id, name: s.name, vendor: s.vendor || '', plan: s.plan || '', amount: String(s.amount),
    cycle: s.cycle, customDays: s.customDays ? String(s.customDays) : '',
    nextRenewalDate: s.nextRenewalDate, autoRenew: s.autoRenew, status: s.status === 'trial' ? 'trial' : 'active',
    trialEndsAt: s.trialEndsAt || '', category: s.category, paymentMethod: s.paymentMethod || '',
    manageUrl: s.manageUrl || '', note: s.note || '', remindDaysBefore: s.remindDaysBefore != null ? String(s.remindDaysBefore) : '',
  }
}

/** 添加/编辑弹窗表单（编辑时 init.__sub 为 applyUpdate 的基底） */
function SubForm(props: {
  init: FormInit
  symbol: string
  onClose: () => void
  onSaved: (msg: string) => void
  showToast: TabProps['showToast']
}) {
  const [f, setF] = useState<FormState>(props.init)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<FormState>) => setF((p) => ({ ...p, ...patch }))
  const editing = !!f.id

  const submit = async () => {
    setSaving(true)
    try {
      const raw: Record<string, unknown> = {
        name: f.name, vendor: f.vendor || undefined, plan: f.plan || undefined,
        amount: Number(f.amount), cycle: f.cycle,
        customDays: f.cycle === 'custom' ? Number(f.customDays) : undefined,
        nextRenewalDate: f.nextRenewalDate || undefined,
        autoRenew: f.autoRenew, status: f.status,
        trialEndsAt: f.status === 'trial' ? f.trialEndsAt : undefined,
        category: f.category, paymentMethod: f.paymentMethod || undefined,
        manageUrl: f.manageUrl || undefined, note: f.note || undefined,
        remindDaysBefore: f.remindDaysBefore === '' ? undefined : Number(f.remindDaysBefore),
      }
      if (editing) {
        // 编辑：以已有订阅为基底合并（金额变化会自动记价格史）
        const cur: Subscription | undefined = props.init.__sub
        if (!cur) return
        const r = applyUpdate(cur, raw)
        if (r.error || !r.sub) { props.showToast(r.error || '保存失败', 'bad'); return }
        await saveSub(r.sub)
        props.onSaved(`已保存「${r.sub.name}」`)
      } else {
        const r = normalizeSub(raw)
        if (r.error || !r.sub) { props.showToast(r.error || '保存失败', 'bad'); return }
        await saveSub(r.sub)
        props.onSaved(`已登记「${r.sub.name}」· 下次扣费 ${r.sub.nextRenewalDate}`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sz-modal" onClick={(e) => { if (e.target === e.currentTarget) props.onClose() }}>
      <div className="sz-modal-box">
        <div className="sz-modal-head">
          <b>{editing ? `编辑订阅` : '登记订阅'}</b>
          <button className="sz-btn ghost sm" onClick={props.onClose}>关闭</button>
        </div>
        <div className="sz-modal-body">
          <label className="sz-lbl">名称 *</label>
          <input className="sz-inp" value={f.name} maxLength={LIMITS.name} placeholder="如：腾讯视频" onChange={(e) => set({ name: e.target.value })} />
          <div className="sz-grid2">
            <div>
              <label className="sz-lbl">服务商</label>
              <input className="sz-inp" value={f.vendor} maxLength={LIMITS.vendor} placeholder="如：腾讯" onChange={(e) => set({ vendor: e.target.value })} />
            </div>
            <div>
              <label className="sz-lbl">套餐</label>
              <input className="sz-inp" value={f.plan} maxLength={LIMITS.plan} placeholder="如：连续包年" onChange={(e) => set({ plan: e.target.value })} />
            </div>
            <div>
              <label className="sz-lbl">金额（每周期）*</label>
              <input className="sz-inp" value={f.amount} inputMode="decimal" placeholder="如：25 或 248" onChange={(e) => set({ amount: e.target.value })} />
            </div>
            <div>
              <label className="sz-lbl">周期 *</label>
              <select className="sz-sel" style={{ width: '100%' }} value={f.cycle} onChange={(e) => set({ cycle: e.target.value as Subscription['cycle'] })}>
                <option value="month">每月</option>
                <option value="year">每年</option>
                <option value="quarter">每季</option>
                <option value="week">每周</option>
                <option value="custom">自定义天数</option>
              </select>
            </div>
            {f.cycle === 'custom' && (
              <div>
                <label className="sz-lbl">周期天数（1..3650）</label>
                <input className="sz-inp" value={f.customDays} inputMode="numeric" onChange={(e) => set({ customDays: e.target.value })} />
              </div>
            )}
            <div>
              <label className="sz-lbl">下次扣费日{editing ? '' : '（留空=今天起算一周期）'}</label>
              <input className="sz-inp" value={f.nextRenewalDate} placeholder="YYYY-MM-DD" onChange={(e) => set({ nextRenewalDate: e.target.value })} />
            </div>
            <div>
              <label className="sz-lbl">状态</label>
              <select className="sz-sel" style={{ width: '100%' }} value={f.status} onChange={(e) => set({ status: e.target.value as 'active' | 'trial' })}>
                <option value="active">生效中</option>
                <option value="trial">试用中</option>
              </select>
            </div>
            {f.status === 'trial' && (
              <div>
                <label className="sz-lbl">试用到期日 *（必填，转正红榜依据）</label>
                <input className="sz-inp" value={f.trialEndsAt} placeholder="YYYY-MM-DD" onChange={(e) => set({ trialEndsAt: e.target.value })} />
              </div>
            )}
            <div>
              <label className="sz-lbl">分类</label>
              <select className="sz-sel" style={{ width: '100%' }} value={f.category} onChange={(e) => set({ category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="sz-lbl">支付方式</label>
              <input className="sz-inp" value={f.paymentMethod} maxLength={LIMITS.paymentMethod} placeholder="支付宝/微信/Apple…" onChange={(e) => set({ paymentMethod: e.target.value })} />
            </div>
            <div>
              <label className="sz-lbl">提前提醒天数（0..30，空=默认）</label>
              <input className="sz-inp" value={f.remindDaysBefore} inputMode="numeric" onChange={(e) => set({ remindDaysBefore: e.target.value })} />
            </div>
          </div>
          <label className="sz-lbl">管理/取消入口（http/https）</label>
          <input className="sz-inp" value={f.manageUrl} maxLength={LIMITS.manageUrl} placeholder="https://…（会员管理页）" onChange={(e) => set({ manageUrl: e.target.value })} />
          <label className="sz-lbl">备注（勿存密码等敏感信息）</label>
          <input className="sz-inp" value={f.note} maxLength={LIMITS.note} onChange={(e) => set({ note: e.target.value })} />
          <label className="sz-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.autoRenew} onChange={(e) => set({ autoRenew: e.target.checked })} /> 自动续费
          </label>
          {!editing && f.nextRenewalDate === '' && Number(f.amount) > 0 && (
            <div className="sz-sub" style={{ marginTop: 6 }}>预览：下次扣费 {advanceDate(todayStr(), f.cycle, f.cycle === 'custom' ? Number(f.customDays) : undefined) || '（周期/天数待修正）'}</div>
          )}
        </div>
        <div className="sz-modal-foot">
          <button className="sz-btn ghost" onClick={props.onClose}>取消</button>
          <button className="sz-btn" disabled={saving || !f.name || !f.amount} onClick={() => void submit()}>{saving ? '保存中…' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}

/** 编辑表单需要拿到原始订阅对象（applyUpdate 基底） */
interface FormInit extends FormState { __sub?: Subscription }

export default function SubsTab({ data, reload, showToast }: TabProps) {
  const [filter, setFilter] = useState<Filter>('active')
  const [kw, setKw] = useState('')
  const [form, setForm] = useState<FormInit | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState('')

  const subs = useMemo(() => {
    if (!data) return []
    let list = data.subs
    if (filter !== 'all') list = list.filter((s) => s.status === filter)
    if (kw.trim()) {
      const q = kw.trim().toLowerCase()
      list = list.filter((s) => [s.name, s.vendor, s.plan, s.note, s.paymentMethod].filter(Boolean).join(' ').toLowerCase().includes(q))
    }
    return list.slice().sort((a, b) => (annualCost(b) || 0) - (annualCost(a) || 0))
  }, [data, filter, kw])

  if (!data) return <div className="sz-empty">载入中…</div>
  const sym = data.settings.currencySymbol

  const op = async (s: Subscription, kind: 'renew' | 'pause' | 'resume' | 'delete') => {
    setBusy(s.id + kind)
    try {
      if (kind === 'renew') {
        const r = renewSub(s, {})
        if (r.error || !r.sub) { showToast(r.error || '失败', 'bad'); return }
        await saveSub(r.sub)
        showToast(`已对账：${s.name}，下一期 ${r.sub.nextRenewalDate}`, 'good')
      } else if (kind === 'pause') {
        await saveSub(pauseSub(s, {}).sub)
        showToast(`「${s.name}」已暂停`, 'good')
      } else if (kind === 'resume') {
        const next = advanceDate(todayStr(), s.cycle, s.customDays)
        if (!next) { showToast('无法推算恢复后的扣费日，请编辑后操作', 'bad'); return }
        const r = resumeSub(s, next)
        if (r.error || !r.sub) { showToast(r.error || '失败', 'bad'); return }
        await saveSub(r.sub)
        showToast(`「${s.name}」已恢复，下次扣费 ${next}（可在编辑里改）`, 'good')
      } else {
        await deleteSub(s.id)
        showToast(`已彻底删除「${s.name}」`, 'good')
      }
      await reload()
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="sz-sec">
        <i className="sz-bar" />订阅
        <button className="sz-btn sm" style={{ marginLeft: 'auto' }} onClick={() => setForm({ ...emptyForm(data.settings.defaultRemindDays) })}>＋ 登记</button>
      </div>
      <div className="sz-card"><div className="sz-card-b">
        <div className="sz-row">
          {([['active', '生效中'], ['trial', '试用'], ['paused', '暂停'], ['cancelled', '已取消'], ['all', '全部']] as [Filter, string][]).map(([k, label]) => (
            <button key={k} className={`sz-chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
              {label}{k !== 'all' && data.stats.counts[k as keyof typeof data.stats.counts] ? ` ${data.stats.counts[k as keyof typeof data.stats.counts]}` : ''}
            </button>
          ))}
        </div>
        <input className="sz-inp" style={{ marginTop: 8 }} value={kw} placeholder="搜索名称/服务商/备注…" onChange={(e) => setKw(e.target.value)} />
      </div></div>

      <div className="sz-card"><div className="sz-card-b" style={{ padding: '2px 13px' }}>
        {!subs.length && <div className="sz-empty">这里还没有订阅。<br />点右上「＋ 登记」，或在聊天里对 AI 说「我订了 xx 月费 xx」。</div>}
        {subs.map((s) => {
          const badge = stateBadge(s)
          const diff = s.status === 'trial' && s.trialEndsAt ? daysBetween(todayStr(), s.trialEndsAt) : daysBetween(todayStr(), s.nextRenewalDate)
          return (
            <div className="sz-item" key={s.id}>
              <div className="sz-item-main">
                <b>{s.name}{badge && <span className={`sz-badge ${badge.cls}`}>{badge.text}</span>}</b>
                <small>
                  {s.vendor ? `${s.vendor} · ` : ''}{s.plan ? `${s.plan} · ` : ''}{s.category} · {s.paymentMethod || '支付方式未记'}
                  {diff !== null && (s.status === 'active' || s.status === 'trial') ? ` · ${diff < 0 ? `扣费日已过 ${-diff} 天` : diff === 0 ? '今天扣费' : `${diff} 天后`} ` : ''}
                  {s.priceHistory.length > 1 ? ` · 开通价 ${fmtMoney(s.priceHistory[0].amount, sym)}` : ''}
                </small>
                <div className="sz-ops">
                  {(s.status === 'active' || s.status === 'trial') && (
                    <button className="sz-btn sm" disabled={busy === s.id + 'renew'} onClick={() => void op(s, 'renew')}>对账续费</button>
                  )}
                  {s.status === 'paused' && (
                    <button className="sz-btn sm" disabled={busy === s.id + 'resume'} onClick={() => void op(s, 'resume')}>恢复</button>
                  )}
                  {s.status === 'cancelled' && (
                    <button className="sz-btn sm" disabled={busy === s.id + 'resume'} onClick={() => void op(s, 'resume')}>恢复订阅</button>
                  )}
                  {(s.status === 'active' || s.status === 'trial') && (
                    <button className="sz-btn ghost sm" disabled={busy === s.id + 'pause'} onClick={() => void op(s, 'pause')}>暂停</button>
                  )}
                  {(s.status === 'active' || s.status === 'trial' || s.status === 'paused') && (
                    <button className="sz-btn warn sm" disabled={busy === s.id + 'cancel'} onClick={async () => {
                      const reason = s.status === 'trial' ? '试用后取消' : '不再续费'
                      await saveSub(cancelSub(s, { reason }).sub)
                      showToast(`「${s.name}」已取消（可恢复）`, 'good')
                      await reload()
                    }}>取消</button>
                  )}
                  <button className="sz-btn ghost sm" onClick={() => setForm({ ...toForm(s), __sub: s })}>编辑</button>
                  {s.id !== confirmId && (
                    <button className="sz-btn danger sm" onClick={() => setConfirmId(s.id)}>删除</button>
                  )}
                </div>
                {confirmId === s.id && (
                  <div className="sz-ops">
                    <span className="sz-sub">彻底删除不可恢复（含价格史）：</span>
                    <button className="sz-btn danger sm" onClick={async () => { setConfirmId(''); await op(s, 'delete') }}>确认删除</button>
                    <button className="sz-btn ghost sm" onClick={() => setConfirmId('')}>算了</button>
                  </div>
                )}
              </div>
              <div className="sz-item-amt">
                {fmtMoney(s.amount, sym)}
                <small>/{cycleLabel(s)}</small>
                <small>年化 {fmtMoney(annualCost(s) || 0, sym)}</small>
              </div>
            </div>
          )
        })}
      </div></div>

      {form && (
        <SubForm
          init={form}
          symbol={sym}
          onClose={() => setForm(null)}
          showToast={showToast}
          onSaved={async (msg) => { setForm(null); showToast(msg, 'good'); await reload() }}
        />
      )}
    </>
  )
}
