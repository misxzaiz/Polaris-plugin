/**
 * 投递 Tab：过滤列表（状态/渠道/关键词）+ 展开详情。
 * 详情内完成全部写操作：改状态、记进展事件（联动状态）、录 offer、
 * 编辑字段、删除（两击确认 + 级联提示）。写路径全部经 model.save* → core.normalize。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core.js'
import {
  deleteAppCascade, eventsOf, saveApp, saveEvent, saveOffer,
  type App, type Offer, type WEvent, type WenData, type WenView,
} from './model'

const STATUS_COLORS: Record<string, string> = {
  wish: '#8B95A7', applied: '#58A6FF', screening: '#79B8FF', written: '#E3B341',
  interview: '#A371F7', offered: '#3FB950', accepted: '#2EA043',
  rejected: '#F85149', withdrawn: '#6E7681',
}
function statusTag(s: string) {
  const c = STATUS_COLORS[s] || '#8B95A7'
  return <span className="wj-tag" style={{ color: c, borderColor: c + '55', background: c + '18' }}>{core.STATUS_LABELS[s] || s}</span>
}

/** 相对描述：X 天前 / 今天 / 明天 */
function relDay(ms: number | null): string {
  if (ms == null) return ''
  const d0 = new Date(); d0.setHours(0, 0, 0, 0)
  const diff = Math.round((ms - d0.getTime()) / core.DAY_MS)
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === -1) return '昨天'
  return diff < 0 ? `${-diff} 天前` : `${diff} 天后`
}

// ── 记进展表单 ──────────────────────────────────────────────────────────
function EventForm({ app, existing, onDone, toast }: {
  app: App
  existing: WEvent | null
  onDone: () => Promise<void>
  toast: (m: string, bad?: boolean) => void
}) {
  const [type, setType] = useState(existing?.type || 'note')
  const [at, setAt] = useState(existing ? (existing.at || '').slice(0, 16).replace('T', ' ') : '')
  const [label, setLabel] = useState(existing?.title || '')
  const [detail, setDetail] = useState(existing?.detail || '')
  const [outcome, setOutcome] = useState(existing?.outcome || '')
  const [remindAt, setRemindAt] = useState(existing?.remindAt ? existing.remindAt.slice(0, 16).replace('T', ' ') : '')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      await saveEvent({ type, at: at || Date.now(), title: label, detail, outcome, remindAt }, existing, app.id)
      toast(existing ? '事件已更新' : '进展已记')
      await onDone()
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div style={{ borderTop: '1px solid #1c2230', marginTop: 8, paddingTop: 8 }}>
      <div className="wj-grid2">
        <div>
          <span className="wj-lbl">类型</span>
          <select className="wj-sel" value={type} onChange={(e) => setType(e.target.value)}>
            {core.EVENT_TYPES.map((t) => <option key={t} value={t}>{core.EVENT_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <span className="wj-lbl">时间（留空=现在）</span>
          <input className="wj-inp" placeholder="2026-11-02 14:30" value={at} onChange={(e) => setAt(e.target.value)} />
        </div>
      </div>
      <span className="wj-lbl">短标题（如「二面」）</span>
      <input className="wj-inp" value={label} onChange={(e) => setLabel(e.target.value)} />
      <span className="wj-lbl">详情 / 复盘</span>
      <textarea className="wj-inp" placeholder="过程记录；被问的问题也可以写在这里（每行一个会进复盘库）" value={detail} onChange={(e) => setDetail(e.target.value)} />
      <div className="wj-grid2">
        <div>
          <span className="wj-lbl">结果（仅「结果」事件）</span>
          <select className="wj-sel" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">不填</option>
            <option value="pass">通过</option>
            <option value="fail">未过</option>
          </select>
        </div>
        <div>
          <span className="wj-lbl">提醒（可空）</span>
          <input className="wj-inp" placeholder="2026-11-09 09:00" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
        </div>
      </div>
      <div className="wj-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="wj-btn sm" disabled={busy} onClick={submit}>{existing ? '保存修改' : '记下'}</button>
      </div>
    </div>
  )
}

// ── offer 表单 ─────────────────────────────────────────────────────────
function OfferForm({ app, existing, onDone, toast }: {
  app: App
  existing: Offer | null
  onDone: () => Promise<void>
  toast: (m: string, bad?: boolean) => void
}) {
  const [f, setF] = useState({
    baseMonthly: existing ? String(existing.baseMonthly) : '',
    months: existing ? String(existing.months) : '12',
    bonusMonths: existing ? String(existing.bonusMonths) : '0',
    commuteMin: existing ? String(existing.commuteMin) : '',
    remoteDays: existing ? String(existing.remoteDays) : '',
    stockNote: existing?.stockNote || '',
    deadline: existing?.deadline ? existing.deadline.slice(0, 16).replace('T', ' ') : '',
    note: existing?.note || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const submit = async () => {
    const base = Number(f.baseMonthly)
    if (!(base > 0)) { toast('月薪必须是正数', true); return }
    setBusy(true)
    try {
      await saveOffer({
        baseMonthly: base, months: Number(f.months) || 12, bonusMonths: Number(f.bonusMonths) || 0,
        commuteMin: Number(f.commuteMin) || 0, remoteDays: Number(f.remoteDays) || 0,
        stockNote: f.stockNote, deadline: f.deadline, note: f.note,
      }, existing, app.id)
      toast('offer 已入档（年化见洞察页）')
      await onDone()
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div style={{ borderTop: '1px solid #1c2230', marginTop: 8, paddingTop: 8 }}>
      <div className="wj-grid2">
        <div>
          <span className="wj-lbl">月薪（元）</span>
          <input className="wj-inp" placeholder="35000" value={f.baseMonthly} onChange={set('baseMonthly')} />
        </div>
        <div>
          <span className="wj-lbl">合同月数</span>
          <input className="wj-inp" placeholder="12" value={f.months} onChange={set('months')} />
        </div>
        <div>
          <span className="wj-lbl">年终奖月数</span>
          <input className="wj-inp" placeholder="0" value={f.bonusMonths} onChange={set('bonusMonths')} />
        </div>
        <div>
          <span className="wj-lbl">单程通勤（分钟）</span>
          <input className="wj-inp" placeholder="45" value={f.commuteMin} onChange={set('commuteMin')} />
        </div>
        <div>
          <span className="wj-lbl">每周远程（天）</span>
          <input className="wj-inp" placeholder="0" value={f.remoteDays} onChange={set('remoteDays')} />
        </div>
        <div>
          <span className="wj-lbl">答复截止（可空）</span>
          <input className="wj-inp" placeholder="2026-11-05 18:00" value={f.deadline} onChange={set('deadline')} />
        </div>
      </div>
      <span className="wj-lbl">期权 / 股票 / 签字费（只记文本，不计价）</span>
      <input className="wj-inp" value={f.stockNote} onChange={set('stockNote')} />
      <div className="wj-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="wj-btn sm" disabled={busy} onClick={submit}>保存 offer</button>
      </div>
    </div>
  )
}

// ── 展开的投递详情 ─────────────────────────────────────────────────────
function AppDetail({ data, app, reload, toast }: {
  data: WenData
  app: App
  reload: () => Promise<WenData | null>
  toast: (m: string, bad?: boolean) => void
}) {
  const [showEvent, setShowEvent] = useState(false)
  const [editEvent, setEditEvent] = useState<WEvent | null>(null)
  const [showOffer, setShowOffer] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const resume = data.resumes.find((r) => r.id === app.resumeId)
  const offer = data.offers.find((o) => o.appId === app.id)
  const events = eventsOf(app.id, data.events)

  const changeStatus = async (status: string) => {
    setBusy(true)
    try {
      await saveApp({ status }, app)
      toast(`状态 → ${core.STATUS_LABELS[status] || status}`)
      await reload()
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!confirmDel) { setConfirmDel(true); return }
    setBusy(true)
    try {
      const r = await deleteAppCascade(app, data.events, data.offers)
      toast(`已删除（级联 ${r.events} 事件 / ${r.offers} offer）`)
      await reload()
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ borderTop: '1px solid #1c2230', marginTop: 8, paddingTop: 10 }}>
      <div className="wj-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {app.appliedAt ? <span className="wj-sub">投递于 {core.fmtDateTime(core.parseTs(app.appliedAt) || 0)}</span> : null}
        {app.location ? <span className="wj-tag">{app.location}</span> : null}
        {app.salaryPosted ? <span className="wj-tag blue">{app.salaryPosted}</span> : null}
        {resume ? <span className="wj-tag purple">简历：{resume.label}</span> : null}
        <span className="wj-tag">{core.CHANNEL_LABELS[app.channel] || app.channel}</span>
      </div>

      <div className="wj-row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
        <span className="wj-sub">状态</span>
        <select
          className="wj-sel" style={{ width: 'auto' }} disabled={busy}
          value={app.status} onChange={(e) => changeStatus(e.target.value)}
        >
          {core.STATUSES.map((s) => <option key={s} value={s}>{core.STATUS_LABELS[s]}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button className="wj-btn sm ghost" onClick={() => { setShowEvent(!showEvent); setEditEvent(null) }}>
          {showEvent && !editEvent ? '收起表单' : '记进展'}
        </button>
        <button className="wj-btn sm ok" onClick={() => setShowOffer(!showOffer)}>{offer && !showOffer ? '看 offer' : offer ? '收起 offer' : '录 offer'}</button>
        <button className="wj-btn sm danger" disabled={busy} onClick={del}>{confirmDel ? '再点一次确认删除' : '删除'}</button>
      </div>

      {showEvent || editEvent ? (
        <EventForm app={app} existing={editEvent} onDone={async () => { setEditEvent(null); setShowEvent(false); await reload() }} toast={toast} />
      ) : null}
      {showOffer ? (
        <OfferForm app={app} existing={offer || null} onDone={async () => { await reload() }} toast={toast} />
      ) : offer ? (
        <div className="wj-sub" style={{ marginTop: 8, background: '#12151c', border: '1px solid #1c2230', borderRadius: 8, padding: '8px 10px' }}>
          💰 offer：月薪 {offer.baseMonthly.toLocaleString()} × {offer.months + offer.bonusMonths} 月 =
          <b style={{ color: '#3FB950' }}> {Math.round(offer.baseMonthly * (offer.months + offer.bonusMonths)).toLocaleString()} 元/年</b>
          {offer.commuteMin > 0 ? ` · 单程通勤 ${offer.commuteMin} 分` : ''}
          {offer.stockNote ? ` · ${offer.stockNote}` : ''}
        </div>
      ) : null}

      {app.jd ? (
        <details style={{ marginTop: 8 }}>
          <summary className="wj-sub" style={{ cursor: 'pointer' }}>JD 存档（{app.jd.length} 字）</summary>
          <div className="wj-sub" style={{ whiteSpace: 'pre-wrap', marginTop: 6, maxHeight: 200, overflowY: 'auto', background: '#12151c', borderRadius: 8, padding: 8 }}>{app.jd}</div>
        </details>
      ) : null}
      {app.note ? <div className="wj-sub" style={{ marginTop: 6 }}>📝 {app.note}</div> : null}

      <div className="wj-lbl">时间线（{events.length} 条事件）</div>
      {events.length === 0 ? (
        <div className="wj-sub">还没有事件——点「记进展」开始记账。</div>
      ) : (
        <div className="wj-tl">
          {events.map((e) => (
            <div className={`wj-tl-item ${e.type === 'note' ? 'dim' : ''}`} key={e.id}>
              <div className="wj-row" style={{ flexWrap: 'wrap' }}>
                <b style={{ fontSize: 12 }}>{core.fmtDateTime(core.parseTs(e.at) || 0)}</b>
                <span className="wj-tag purple">{core.EVENT_LABELS[e.type] || e.type}</span>
                {e.outcome ? <span className={`wj-tag ${e.outcome === 'pass' ? 'green' : 'red'}`}>{core.OUTCOME_LABELS[e.outcome]}</span> : null}
                {e.title ? <b style={{ fontSize: 12 }}>{e.title}</b> : null}
                <span style={{ flex: 1 }} />
                <button className="wj-btn sm ghost" onClick={() => { setEditEvent(e); setShowEvent(true) }}>改</button>
              </div>
              {e.detail ? <div className="wj-sub" style={{ whiteSpace: 'pre-wrap' }}>{e.detail}</div> : null}
              {e.questions && e.questions.length ? (
                <div className="wj-sub">❓ {e.questions.join(' / ')}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 列表 ───────────────────────────────────────────────────────────────
export default function AppsTab({ data, view, reload, toast }: {
  data: WenData
  view: WenView
  reload: () => Promise<WenData | null>
  toast: (m: string, bad?: boolean) => void
}) {
  const [status, setStatus] = useState('active')
  const [channel, setChannel] = useState('all')
  const [kw, setKw] = useState('')
  const [openId, setOpenId] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ company: '', title: '', channel: 'boss', status: 'applied', salaryPosted: '', location: '', note: '', appliedAt: '' })
  const [busy, setBusy] = useState(false)

  const dueMap = useMemo(() => new Map(view.due.map((d) => [d.app.id, d.daysSince])), [view.due])
  const lastEventOf = useMemo(() => {
    const m = new Map<string, WEvent>()
    for (const e of data.events) {
      const prev = m.get(e.appId)
      if (!prev || (core.parseTs(e.at) || 0) > (core.parseTs(prev.at) || 0)) m.set(e.appId, e)
    }
    return m
  }, [data.events])

  const list = useMemo(() => {
    let l = data.apps.slice()
    if (status === 'active') l = l.filter((a) => !a.archived && core.ACTIVE_STATUSES.includes(a.status))
    else if (status === 'archived') l = l.filter((a) => a.archived)
    else if (status !== 'all') l = l.filter((a) => a.status === status)
    if (channel !== 'all') l = l.filter((a) => a.channel === channel)
    if (kw.trim()) {
      const k = core.normName(kw)
      l = l.filter((a) => core.normName(a.companyName).includes(k) || core.normName(a.title).includes(k) || core.normName(a.note).includes(k))
    }
    l.sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)))
    return l
  }, [data.apps, status, channel, kw])

  const addApp = async () => {
    if (!form.company.trim() || !form.title.trim()) { toast('公司和职位都要填', true); return }
    setBusy(true)
    try {
      const dup = data.apps.find((a) => core.normName(a.companyName) === core.normName(form.company) && core.normName(a.title) === core.normName(form.title))
      if (dup) { toast('已存在同公司同职位投递，展开它直接记进展', true); setAdding(false); setOpenId(dup.id); return }
      await saveApp({
        companyName: form.company, title: form.title, channel: form.channel, status: form.status,
        salaryPosted: form.salaryPosted, location: form.location, note: form.note,
        appliedAt: form.status === 'wish' ? '' : (form.appliedAt || Date.now()),
      }, null)
      toast('已建档')
      setAdding(false)
      setForm({ company: '', title: '', channel: 'boss', status: 'applied', salaryPosted: '', location: '', note: '', appliedAt: '' })
      await reload()
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wj-page">
      <div className="wj-sec">
        <span className="wj-bar" />投递台账
        <span className="wj-hint">{list.length} 条</span>
        <button className="wj-btn sm" style={{ marginLeft: 8 }} onClick={() => setAdding(!adding)}>{adding ? '收起' : '+ 建档'}</button>
      </div>

      {adding ? (
        <div className="wj-card"><div className="wj-card-b">
          <div className="wj-grid2">
            <div>
              <span className="wj-lbl">公司 *</span>
              <input className="wj-inp" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <span className="wj-lbl">职位 *</span>
              <input className="wj-inp" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <span className="wj-lbl">渠道</span>
              <select className="wj-sel" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                {core.CHANNELS.map((c) => <option key={c} value={c}>{core.CHANNEL_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <span className="wj-lbl">状态</span>
              <select className="wj-sel" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {core.STATUSES.map((s) => <option key={s} value={s}>{core.STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <span className="wj-lbl">期望薪资</span>
              <input className="wj-inp" placeholder="25-35k·16薪" value={form.salaryPosted} onChange={(e) => setForm({ ...form, salaryPosted: e.target.value })} />
            </div>
            <div>
              <span className="wj-lbl">地点</span>
              <input className="wj-inp" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
          </div>
          <div className="wj-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="wj-btn sm" disabled={busy} onClick={addApp}>建档</button>
          </div>
        </div></div>
      ) : null}

      <div style={{ display: 'flex', gap: 6, padding: '0 16px 10px', flexWrap: 'wrap' }}>
        <select className="wj-sel" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">在途</option>
          <option value="all">全部</option>
          {core.STATUSES.map((s) => <option key={s} value={s}>{core.STATUS_LABELS[s]}</option>)}
          <option value="archived">已归档</option>
        </select>
        <select className="wj-sel" style={{ width: 'auto' }} value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="all">全渠道</option>
          {core.CHANNELS.map((c) => <option key={c} value={c}>{core.CHANNEL_LABELS[c]}</option>)}
        </select>
        <input className="wj-inp" style={{ flex: 1, minWidth: 120 }} placeholder="搜公司 / 职位 / 备注" value={kw} onChange={(e) => setKw(e.target.value)} />
      </div>

      {list.length === 0 ? (
        <div className="wj-empty">没有符合条件的投递。</div>
      ) : list.map((a) => {
        const last = lastEventOf.get(a.id)
        const due = dueMap.get(a.id)
        const open = openId === a.id
        return (
          <div className="wj-card" key={a.id}>
            <div className="wj-card-b">
              <div className="wj-row" style={{ cursor: 'pointer' }} onClick={() => setOpenId(open ? '' : a.id)}>
                <div className="wj-grow">
                  <div className="wj-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    <b style={{ fontSize: 13 }}>{a.companyName} · {a.title}</b>
                    {statusTag(a.status)}
                    {a.archived ? <span className="wj-tag">已归档</span> : null}
                  </div>
                  <div className="wj-sub" style={{ marginTop: 2 }}>
                    {last
                      ? `${core.EVENT_LABELS[last.type] || last.type}${last.title ? `（${last.title}）` : ''} · ${relDay(core.parseTs(last.at))}${last.detail ? ` · ${last.detail.slice(0, 40)}` : ''}`
                      : a.status === 'wish' ? '想投，还没投出' : '暂无事件'}
                  </div>
                </div>
                {due != null ? <span className="wj-tag yellow">催 {due}天</span> : null}
                <span className="wj-sub">{open ? '▾' : '▸'}</span>
              </div>
              {open ? <AppDetail data={data} app={a} reload={reload} toast={toast} /> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
