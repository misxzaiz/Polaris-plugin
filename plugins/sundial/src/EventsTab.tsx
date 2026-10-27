/**
 * 事件 Tab：日程列表（下一发生/重复规则/来源）+ 添加/编辑表单 + ICS 订阅管理
 *
 * 表单的重复规则是友好下拉（内部经 friendlyRrule 归一）；提醒是预设片选（≤3 个）。
 * ICS 的抓取全部由后台服务执行（命令信箱触发），面板零外网请求。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import { deleteEvent, icsAdd, icsRefresh, icsRemove, saveEvent, type SundialData, type SundialEvent } from './model'

const css = `
.sd-ev{padding:11px 13px;border-top:1px solid #1d2330}
.sd-ev:first-child{border-top:none}
.sd-ev-h{display:flex;align-items:center;gap:8px}
.sd-ev-t{flex:1;min-width:0;font-size:12.5px;font-weight:600;word-break:break-word}
.sd-ev-t.done{color:#8B95A7;text-decoration:line-through}
.sd-ev-m{font-size:10px;color:#5C6678;margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.sd-form{padding:12px 13px;border-top:1px solid #1d2330}
.sd-frow{display:flex;gap:8px;align-items:center}
.sd-chips{display:flex;gap:5px;flex-wrap:wrap}
.sd-chip{background:#12151c;border:1px solid #2a2f3a;border-radius:14px;color:#8B95A7;font-size:11px;padding:3px 10px;cursor:pointer}
.sd-chip.on{background:#1d3327;border-color:#2b4a37;color:#3FB950;font-weight:600}
.sd-ics{padding:11px 13px;border-top:1px solid #1d2330}
.sd-checkbox{display:flex;align-items:center;gap:5px;font-size:11.5px;color:#8B95A7;cursor:pointer;white-space:nowrap}
.sd-checkbox input{accent-color:#2b6cb0}
`

type FormState = {
  id: string | null
  title: string
  allDay: boolean
  date: string
  time: string
  durationMin: number
  kind: 'event' | 'habit' | 'countdown'
  rruleMode: 'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom'
  weekdays: number[]
  monthday: string
  customRrule: string
  remind: number[]
  tags: string
  notes: string
}

function emptyForm(): FormState {
  const now = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  return {
    id: null, title: '', allDay: false, date: `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`,
    time: '09:00', durationMin: 60, kind: 'event', rruleMode: 'none', weekdays: [], monthday: '1',
    customRrule: '', remind: [30], tags: '', notes: '',
  }
}

function formFromEvent(e: SundialEvent): FormState {
  const base = emptyForm()
  let mode: FormState['rruleMode'] = 'custom'
  let weekdays: number[] = []
  let monthday = '1'
  let custom = ''
  if (!e.rrule) mode = 'none'
  else if (e.rrule === 'FREQ=DAILY') mode = 'daily'
  else if (e.rrule === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') mode = 'weekdays'
  else if (e.rrule === 'FREQ=WEEKLY;INTERVAL=2') mode = 'biweekly'
  else if (e.rrule === 'FREQ=YEARLY') mode = 'yearly'
  else if (e.rrule.startsWith('FREQ=WEEKLY;BYDAY=')) {
    mode = 'weekly'
    weekdays = e.rrule.slice('FREQ=WEEKLY;BYDAY='.length).split(',').map((s) => core.WD_BY_NAME[s] ?? 1)
  } else if (e.rrule.startsWith('FREQ=MONTHLY;BYMONTHDAY=')) {
    mode = 'monthly'
    monthday = e.rrule.slice('FREQ=MONTHLY;BYMONTHDAY='.length)
  } else custom = e.rrule
  const p = e.allDay ? core.utcParts(e.start) : core.localParts(e.start)
  const p2 = (n: number) => String(n).padStart(2, '0')
  const dateStr = `${p.y}-${p2(p.m)}-${p2(p.d)}`
  const hhmm = e.allDay ? base.time : `${p2(core.localParts(e.start).hh)}:${p2(core.localParts(e.start).mm)}`
  return {
    id: e.id, title: e.title, allDay: e.allDay, date: dateStr, time: hhmm,
    durationMin: e.durationMin, kind: e.kind, rruleMode: mode, weekdays, monthday, customRrule: custom,
    remind: [...e.remind], tags: e.tags.join(','), notes: e.notes,
  }
}

function rruleFromForm(f: FormState): string {
  switch (f.rruleMode) {
    case 'none': return ''
    case 'daily': return 'FREQ=DAILY'
    case 'weekdays': return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
    case 'weekly': {
      if (!f.weekdays.length) return 'FREQ=WEEKLY'
      const names = [...f.weekdays].sort((a, b) => a - b).map((n) => core.WD_NAME_BY_NUM[n])
      return 'FREQ=WEEKLY;BYDAY=' + names.join(',')
    }
    case 'biweekly': return 'FREQ=WEEKLY;INTERVAL=2'
    case 'monthly': return f.monthday === 'last' ? 'FREQ=MONTHLY;BYMONTHDAY=-1' : `FREQ=MONTHLY;BYMONTHDAY=${parseInt(f.monthday, 10) || 1}`
    case 'yearly': return 'FREQ=YEARLY'
    case 'custom': return f.customRrule.trim()
    default: return ''
  }
}

const REMIND_CHIPS: [number, string][] = [[0, '准时'], [15, '15 分钟'], [30, '30 分钟'], [60, '1 小时'], [120, '2 小时'], [1440, '1 天前'], [2880, '2 天前']]
const WD_CH = ['日', '一', '二', '三', '四', '五', '六']

export default function EventsTab({ data, reload, showToast }: {
  data: SundialData | null
  reload: () => Promise<SundialData | null>
  showToast: (msg: string, bad?: boolean) => void
}) {
  const [form, setForm] = useState<FormState | null>(null)
  const [query, setQuery] = useState('')
  const [confirmDel, setConfirmDel] = useState<string>('')
  const [icsUrl, setIcsUrl] = useState('')
  const [icsName, setIcsName] = useState('')
  const [confirmIcs, setConfirmIcs] = useState<string>('')
  const now = Date.now()

  const rows = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    const out = data.events
      .filter((e) => e.source !== 'ics')
      .filter((e) => !q || `${e.title}|${e.notes}|${e.tags.join('/')}`.toLowerCase().includes(q))
      .map((e) => {
        const next = core.expandOccurrences(e, e.allDay ? core.dayStartUtc(now) - core.DAY_MS : now, now + 90 * core.DAY_MS, { max: 3 })[0] || null
        return { e, next }
      })
      .sort((a, b) => (a.next ? a.next.start : a.e.start) - (b.next ? b.next.start : b.e.start))
    return out
  }, [data, query, now])

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f))

  const submit = async () => {
    if (!form) return
    if (!form.title.trim()) { showToast('标题不能为空', true); return }
    const start = form.allDay ? form.date : `${form.date} ${form.time}`
    const input: Record<string, unknown> = {
      title: form.title.trim(),
      start,
      allDay: form.allDay,
      durationMin: form.allDay ? undefined : form.durationMin,
      kind: form.kind,
      rrule: rruleFromForm(form),
      remind: form.remind,
      tags: form.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      notes: form.notes,
    }
    try {
      const existing = form.id ? data?.events.find((e) => e.id === form.id) || null : null
      if (form.id && !existing) { showToast('原事件已不存在', true); setForm(null); return }
      await saveEvent(input, existing)
      setForm(null)
      await reload()
      showToast(existing ? '已保存修改' : '已添加')
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const del = async (e: SundialEvent) => {
    if (confirmDel !== e.id) { setConfirmDel(e.id); return }
    setConfirmDel('')
    try {
      await deleteEvent(e.id)
      if (form?.id === e.id) setForm(null)
      await reload()
      showToast('已删除')
    } catch (err) { showToast((err as Error).message, true) }
  }

  const nextText = (e: SundialEvent, next: { start: number } | null): string => {
    if (!next) return '没有即将到来的发生（过期或未启用）'
    const markV = e.done ? e.done[core.occKey(next.start, e.allDay)] : undefined
    const when = e.allDay
      ? core.fmtOccWhen(next.start, true, e.durationMin)
      : `${core.fmtDay(next.start)} ${core.fmtClock(next.start)}`
    return `${when}${markV === 'done' ? ' ✅' : markV === 'skip' ? ' ⏭' : ''}`
  }

  const addIcs = async () => {
    if (!icsUrl.trim()) { showToast('请填订阅地址', true); return }
    try {
      await icsAdd(icsUrl.trim(), icsName.trim())
      setIcsUrl(''); setIcsName('')
      await reload()
      showToast('已添加订阅，服务几秒内抓取')
    } catch (e) { showToast((e as Error).message, true) }
  }

  if (!data) return <div className="sd-empty">载入中…</div>

  return (
    <div>
      <div className="sd-sec">
        <i className="sd-bar" />我的日程
        <span className="sd-hint">{rows.length} 条（不含 ICS 导入）</span>
        <button className="sd-btn sm" style={{ marginLeft: 8 }} onClick={() => setForm(emptyForm())}>＋ 添加</button>
      </div>
      <div style={{ padding: '0 16px 8px' }}>
        <input className="sd-inp" placeholder="搜索标题 / 备注 / 标签…" value={query} onChange={(e2) => setQuery(e2.target.value)} />
      </div>

      {form && (
        <div className="sd-card">
          <div className="sd-form">
            <label className="sd-lbl">标题</label>
            <input className="sd-inp" value={form.title} placeholder="如：取快递 / 周会 / 背单词" onChange={(e2) => set({ title: e2.target.value })} />
            <div className="sd-frow" style={{ marginTop: 8 }}>
              <label className="sd-checkbox"><input type="checkbox" checked={form.allDay} onChange={(e2) => set({ allDay: e2.target.checked })} />全天</label>
              <input className="sd-inp" style={{ flex: 1 }} type="date" value={form.date} onChange={(e2) => set({ date: e2.target.value })} />
              {!form.allDay && <input className="sd-inp" style={{ width: 100 }} type="time" value={form.time} onChange={(e2) => set({ time: e2.target.value })} />}
            </div>
            {!form.allDay && (
              <>
                <label className="sd-lbl">时长</label>
                <select className="sd-sel" value={form.durationMin} onChange={(e2) => set({ durationMin: Number(e2.target.value) })}>
                  {[0, 15, 30, 45, 60, 90, 120, 180, 240, 480].map((n) => (
                    <option key={n} value={n}>{n === 0 ? '时刻点（无时长）' : `${n} 分钟`}</option>
                  ))}
                </select>
              </>
            )}
            <label className="sd-lbl">类型</label>
            <select className="sd-sel" value={form.kind} onChange={(e2) => set({ kind: e2.target.value as FormState['kind'] })}>
              <option value="event">日程</option>
              <option value="habit">习惯打卡（可连击）</option>
              <option value="countdown">倒数日 / 纪念日</option>
            </select>
            <label className="sd-lbl">重复</label>
            <select className="sd-sel" value={form.rruleMode} onChange={(e2) => set({ rruleMode: e2.target.value as FormState['rruleMode'] })}>
              <option value="none">不重复</option>
              <option value="daily">每天</option>
              <option value="weekdays">工作日（一至五）</option>
              <option value="weekly">每周（选星期）</option>
              <option value="biweekly">每两周</option>
              <option value="monthly">每月（选几号）</option>
              <option value="yearly">每年</option>
              <option value="custom">自定义 RRULE（高级）</option>
            </select>
            {form.rruleMode === 'weekly' && (
              <div className="sd-chips" style={{ marginTop: 6 }}>
                {WD_CH.map((ch, i) => (
                  <button key={i} className={`sd-chip ${form.weekdays.includes(i) ? 'on' : ''}`}
                    onClick={() => set({ weekdays: form.weekdays.includes(i) ? form.weekdays.filter((x) => x !== i) : [...form.weekdays, i] })}>
                    周{ch}
                  </button>
                ))}
              </div>
            )}
            {form.rruleMode === 'monthly' && (
              <div className="sd-frow" style={{ marginTop: 6 }}>
                <span className="sd-sub">每月</span>
                <input className="sd-inp" style={{ width: 90 }} value={form.monthday} placeholder="15 或 -1=月末" onChange={(e2) => set({ monthday: e2.target.value })} />
                <span className="sd-sub">号</span>
              </div>
            )}
            {form.rruleMode === 'custom' && (
              <input className="sd-inp" style={{ marginTop: 6, font: '11px Consolas,monospace' }} value={form.customRrule}
                placeholder="FREQ=DAILY;COUNT=10（支持子集，详见 README）" onChange={(e2) => set({ customRrule: e2.target.value })} />
            )}
            <label className="sd-lbl">提前提醒（最多 3 个）</label>
            <div className="sd-chips">
              {REMIND_CHIPS.map(([min, label]) => (
                <button key={min} className={`sd-chip ${form.remind.includes(min) ? 'on' : ''}`}
                  onClick={() => set({ remind: form.remind.includes(min) ? form.remind.filter((x) => x !== min) : form.remind.length >= 3 ? form.remind : [...form.remind, min] })}>
                  {label}
                </button>
              ))}
            </div>
            <label className="sd-lbl">标签（逗号分隔）</label>
            <input className="sd-inp" value={form.tags} placeholder="工作, 健康" onChange={(e2) => set({ tags: e2.target.value })} />
            <label className="sd-lbl">备注</label>
            <textarea className="sd-inp" rows={2} value={form.notes} onChange={(e2) => set({ notes: e2.target.value })} />
            <div className="sd-frow" style={{ marginTop: 10 }}>
              <button className="sd-btn" onClick={submit}>{form.id ? '保存修改' : '添加'}</button>
              <button className="sd-btn ghost" onClick={() => setForm(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      <div className="sd-card">
        {rows.length === 0 && <div className="sd-empty">还没有日程。点右上「＋ 添加」，或在聊天里对 AI 说「明天上午10点提醒我开会」。</div>}
        {rows.map(({ e, next }) => {
          const nextKey = next ? core.occKey(next.start, e.allDay) : ''
          const markV = nextKey && e.done ? e.done[nextKey] : undefined
          return (
            <div key={e.id} className="sd-ev">
              <div className="sd-ev-h">
                <div className={`sd-ev-t ${markV === 'done' ? 'done' : ''}`}>{e.title}</div>
                {e.remind.length > 0 && <span className="sd-tag">⏰ {e.remind.map((n) => (n >= 1440 ? `${n / 1440}天` : n >= 60 ? `${n / 60}时` : `${n}分`)).join('/')}</span>}
              </div>
              <div className="sd-ev-m">
                {e.kind !== 'event' && <span className={`sd-kind ${e.kind}`}>{e.kind === 'habit' ? '习惯' : '倒数'}</span>}
                <span>{nextText(e, next)}</span>
                {e.rrule && <span>· {core.describeRrule(e.rrule)}</span>}
                {e.tags.map((t) => <span key={t} className="sd-tag">{t}</span>)}
              </div>
              <div className="sd-ev-m" style={{ marginTop: 6 }}>
                {next && markV !== 'done' && <button className="sd-btn sm ok" onClick={async () => {
                  try { await saveEvent({ done: { ...(e.done || {}), [nextKey]: 'done' } }, e); await reload() } catch (err) { showToast((err as Error).message, true) }
                }}>✓ 完成下一次</button>}
                {next && markV === 'done' && <button className="sd-btn sm ghost" onClick={async () => {
                  const done = { ...(e.done || {}) }
                  delete done[nextKey]
                  try { await saveEvent({ done }, e); await reload() } catch (err) { showToast((err as Error).message, true) }
                }}>撤销完成</button>}
                <button className="sd-btn sm ghost" onClick={() => setForm(formFromEvent(e))}>编辑</button>
                <button className={`sd-btn sm ${confirmDel === e.id ? 'danger' : 'ghost'}`} onClick={() => del(e)}>
                  {confirmDel === e.id ? '确认删除？' : '删除'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="sd-sec"><i className="sd-bar" />外部日历订阅（ICS）<span className="sd-hint">由后台服务抓取，手机也能看</span></div>
      <div className="sd-card">
        {data.ics.length === 0 && (
          <div className="sd-empty" style={{ padding: '14px 16px' }}>
            把日历的 ICS/Webcal 链接（Google 日历「公开日历地址」、学校课表、排班表导出）粘到下面，按间隔自动同步进来。
          </div>
        )}
        {data.ics.map((d) => {
          const time = d.lastFetchAt ? new Date(d.lastFetchAt).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '从未抓取'
          const status = d.lastStatus === 'error' ? `⚠ ${d.lastError || '抓取失败'}` : d.lastStatus === 'never' ? '等待首抓' : '正常'
          return (
            <div key={d.id} className="sd-ics">
              <div className="sd-ev-h">
                <div className="sd-ev-t">{d.name}{d.enabled === false ? '（已停用）' : ''}</div>
                <span className="sd-tag">{d.eventCount || 0} 事件</span>
              </div>
              <div className="sd-ev-m">
                <span>{time} · {status}</span>
                <span style={{ wordBreak: 'break-all' }}>{d.url}</span>
              </div>
              <div className="sd-ev-m" style={{ marginTop: 6 }}>
                <button className="sd-btn sm ghost" onClick={async () => { try { await icsRefresh(d.id); showToast('已下发刷新') } catch (err) { showToast((err as Error).message, true) } }}>刷新</button>
                <button className={`sd-btn sm ${confirmIcs === d.id ? 'danger' : 'ghost'}`} onClick={async () => {
                  if (confirmIcs !== d.id) { setConfirmIcs(d.id); return }
                  setConfirmIcs('')
                  try { await icsRemove(d.id); await reload(); showToast('已下发退订（其事件将删除）') } catch (err) { showToast((err as Error).message, true) }
                }}>{confirmIcs === d.id ? '确认退订？' : '退订'}</button>
              </div>
            </div>
          )
        })}
        <div className="sd-ics">
          <div className="sd-frow">
            <input className="sd-inp" style={{ flex: 2 }} placeholder="https://…/basic.ics 或 webcal://…" value={icsUrl} onChange={(e2) => setIcsUrl(e2.target.value)} />
            <input className="sd-inp" style={{ flex: 1 }} placeholder="显示名" value={icsName} onChange={(e2) => setIcsName(e2.target.value)} />
            <button className="sd-btn" onClick={addIcs}>订阅</button>
          </div>
          {data.ics.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button className="sd-btn sm ghost" onClick={async () => { try { await icsRefresh(); showToast('已下发全部刷新') } catch (err) { showToast((err as Error).message, true) } }}>全部立刷</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
