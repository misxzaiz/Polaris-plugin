/**
 * 保单 Tab：过滤 + 列表卡 + 详情（缴费进度/流水/编辑/删除）+ 新增表单。
 * 写动作全部先过 core.normalize* 唯一口径；删除两击确认。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import type { Policy, PolicyState } from '../shared/core'
import { deleteEvent, deletePolicy, memberName, saveEvent, savePolicy, type JinkuiData } from './model'
import type { TabProps } from './Panel'
import { FREQ_CN, KIND_CN, kindTag, stateTag } from './ui'

interface Props extends TabProps {
  states: PolicyState[]
}

type FormState = {
  name: string; kind: string; insuredId: string; company: string; policyNo: string
  coverageWan: string; coverageNote: string; premium: string; freq: string; payYears: string
  startDate: string; endDate: string; waitingDays: string; fileNote: string; note: string
}

const EMPTY_FORM: FormState = {
  name: '', kind: 'medical', insuredId: '', company: '', policyNo: '',
  coverageWan: '', coverageNote: '', premium: '', freq: 'yearly', payYears: '',
  startDate: '', endDate: '', waitingDays: '', fileNote: '', note: '',
}

function toForm(p: Policy): FormState {
  return {
    name: p.name, kind: p.kind, insuredId: p.insuredId, company: p.company, policyNo: p.policyNo,
    coverageWan: p.coverage != null ? String(p.coverage / 10000) : '',
    coverageNote: p.coverageNote,
    premium: p.premium != null ? String(p.premium) : '',
    freq: p.freq, payYears: p.payYears != null ? String(p.payYears) : '',
    startDate: p.startDate, endDate: p.endDate || '', waitingDays: p.waitingDays != null ? String(p.waitingDays) : '',
    fileNote: p.fileNote, note: p.note,
  }
}

export default function PoliciesTab({ data, states, reload, showToast }: Props) {
  const [filterMember, setFilterMember] = useState('all')
  const [filterKind, setFilterKind] = useState('all')
  const [filterState, setFilterState] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [confirmDelEv, setConfirmDelEv] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (!data) return []
    return data.policies
      .map((p, i) => ({ policy: p, st: states[i] }))
      .filter(({ policy, st }) => {
        if (filterMember !== 'all' && policy.insuredId !== filterMember) return false
        if (filterKind !== 'all' && policy.kind !== filterKind) return false
        if (filterState === 'inforce' && !core.coversGap(st.state)) return false
        if (filterState !== 'all' && filterState !== 'inforce' && st.state !== filterState) return false
        return true
      })
  }, [data, states, filterMember, filterKind, filterState])

  if (!data) return <div className="jk-empty">加载中…</div>

  const setF = (k: keyof FormState) => (e: { target: { value: string } }) => {
    setForm((f) => (f ? { ...f, [k]: e.target.value } : f))
  }

  const submit = async () => {
    if (!form) return
    try {
      const input: Record<string, unknown> = {
        name: form.name, kind: form.kind, insuredId: form.insuredId, company: form.company,
        policyNo: form.policyNo, coverageWan: form.coverageWan || undefined,
        coverageNote: form.coverageNote,
        premium: form.premium || undefined, freq: form.freq,
        payYears: form.payYears || undefined, startDate: form.startDate,
        endDate: form.endDate || undefined, waitingDays: form.waitingDays || undefined,
        fileNote: form.fileNote, note: form.note,
      }
      const prev = editId ? data.policies.find((p) => p.id === editId) || null : null
      if (prev) input.name = prev.name // 判重锚点不可改名
      await savePolicy(input, prev)
      showToast(prev ? '已更新保单' : '已入柜')
      setForm(null)
      setEditId(null)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const logPayToday = async (p: Policy) => {
    try {
      await saveEvent({ type: 'pay', policyId: p.id, date: core.dayKey(Date.now()) })
      showToast(`已记缴费：${p.name}`)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const doDelete = async (id: string) => {
    try {
      const n = await deletePolicy(id, data)
      showToast(`已删除保单及 ${n} 条流水`)
      setConfirmDel(null)
      setExpanded(null)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const doDeleteEvent = async (occKey: string) => {
    try {
      await deleteEvent(occKey)
      showToast('已删除流水')
      setConfirmDelEv(null)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  if (form) {
    return (
      <>
        <div className="jk-sec"><span className="jk-bar" />{editId ? '编辑保单' : '新增保单'}</div>
        <div className="jk-card"><div className="jk-card-b">
          <label className="jk-lbl">产品名 *</label>
          <input className="jk-inp" value={form.name} onChange={setF('name')} placeholder="如 平安e生保·长期医疗" disabled={!!editId} />
          {editId && <div className="jk-sub">产品名是判重锚点，编辑时不可改。</div>}
          <div className="jk-grid">
            <div>
              <label className="jk-lbl">险种 *</label>
              <select className="jk-sel" value={form.kind} onChange={setF('kind')}>
                {core.KINDS.map((k) => <option key={k} value={k}>{KIND_CN[k]}</option>)}
              </select>
            </div>
            <div>
              <label className="jk-lbl">被保险人 *</label>
              <select className="jk-sel" value={form.insuredId} onChange={setF('insuredId')} disabled={!!editId}>
                <option value="">选择成员…</option>
                {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {editId && <div className="jk-sub">被保人不可改；录错请删除重建。</div>}
            </div>
          </div>
          <div className="jk-grid">
            <div>
              <label className="jk-lbl">保险公司</label>
              <input className="jk-inp" value={form.company} onChange={setF('company')} placeholder="如 平安人寿" />
            </div>
            <div>
              <label className="jk-lbl">保单号</label>
              <input className="jk-inp" value={form.policyNo} onChange={setF('policyNo')} placeholder="选填" />
            </div>
          </div>
          <div className="jk-grid">
            <div>
              <label className="jk-lbl">保额（万）</label>
              <input className="jk-inp" type="number" value={form.coverageWan} onChange={setF('coverageWan')} placeholder="如 300" />
            </div>
            <div>
              <label className="jk-lbl">保额口径说明</label>
              <input className="jk-inp" value={form.coverageNote} onChange={setF('coverageNote')} placeholder="如 一般医疗300万/年" />
            </div>
          </div>
          <label className="jk-lbl">电子保单位置</label>
          <input className="jk-inp" value={form.fileNote} onChange={setF('fileNote')} placeholder="如 邮箱 xx@yy / 保司App-我的保单（理赔时找得到原件）" />
          <div className="jk-grid">
            <div>
              <label className="jk-lbl">每期保费（元）</label>
              <input className="jk-inp" type="number" value={form.premium} onChange={setF('premium')} placeholder="如 4000" />
            </div>
            <div>
              <label className="jk-lbl">缴费频率 *</label>
              <select className="jk-sel" value={form.freq} onChange={setF('freq')}>
                {core.FREQS.map((f) => <option key={f} value={f}>{FREQ_CN[f]}</option>)}
              </select>
            </div>
          </div>
          <div className="jk-grid">
            <div>
              <label className="jk-lbl">缴费年限（年）</label>
              <input className="jk-inp" type="number" value={form.payYears} onChange={setF('payYears')} placeholder="趸交不用填" />
            </div>
            <div>
              <label className="jk-lbl">等待期（天）</label>
              <input className="jk-inp" type="number" value={form.waitingDays} onChange={setF('waitingDays')} placeholder="如 90" />
            </div>
          </div>
          <div className="jk-grid">
            <div>
              <label className="jk-lbl">首期缴费日 / 生效日 *</label>
              <input className="jk-inp" type="date" value={form.startDate} onChange={setF('startDate')} />
            </div>
            <div>
              <label className="jk-lbl">保障期满日</label>
              <input className="jk-inp" type="date" value={form.endDate} onChange={setF('endDate')} />
            </div>
          </div>
          <label className="jk-lbl">备注</label>
          <input className="jk-inp" value={form.note} onChange={setF('note')} placeholder="如 无社保版 / 智能核保通过" />
          <div className="jk-row" style={{ marginTop: 12 }}>
            <button className="jk-btn green" onClick={submit} disabled={!form.name || !form.insuredId || !form.startDate}>保存</button>
            <button className="jk-btn ghost" onClick={() => { setForm(null); setEditId(null) }}>取消</button>
          </div>
        </div></div>
      </>
    )
  }

  return (
    <>
      <div className="jk-sec">
        <span className="jk-bar" />保单{rows.length ? `（${rows.length}）` : ''}
        <button className="jk-btn green sm" style={{ marginLeft: 'auto' }} onClick={() => {
          if (!data.members.length) {
            showToast('先在「设置」Tab 建家庭成员', true)
            return
          }
          setForm({ ...EMPTY_FORM, insuredId: data.members[0].id, startDate: core.dayKey(Date.now()) })
        }}>+ 新增</button>
      </div>
      <div className="jk-row" style={{ padding: '0 16px 8px', gap: 6 }}>
        <select className="jk-sel" style={{ width: 'auto', flex: 1 }} value={filterMember} onChange={(e) => setFilterMember(e.target.value)}>
          <option value="all">全部成员</option>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="jk-sel" style={{ width: 'auto', flex: 1 }} value={filterKind} onChange={(e) => setFilterKind(e.target.value)}>
          <option value="all">全部险种</option>
          {core.KINDS.map((k) => <option key={k} value={k}>{KIND_CN[k]}</option>)}
        </select>
        <select className="jk-sel" style={{ width: 'auto', flex: 1 }} value={filterState} onChange={(e) => setFilterState(e.target.value)}>
          <option value="all">全部状态</option>
          <option value="inforce">在保</option>
          <option value="grace">宽限期</option>
          <option value="lapse">中止期</option>
          <option value="waiting">等待期</option>
          <option value="matured">已满期</option>
          <option value="surrendered">已退保</option>
          <option value="terminated">已终止</option>
        </select>
      </div>

      {!rows.length && <div className="jk-empty">没有符合条件的保单。</div>}
      {rows.map(({ policy, st }) => {
        const pp = core.periodsPaid(policy, st.paidUntil)
        const tp = core.totalPeriods(policy)
        const evs = data.events.filter((e) => e.policyId === policy.id).sort((a, b) => (a.date < b.date ? -1 : 1))
        const isOpen = expanded === policy.id
        return (
          <div key={policy.id} className="jk-card">
            <div className="jk-card-b">
              <div className="jk-row" style={{ cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : policy.id)}>
                <div className="jk-grow">
                  <b style={{ fontSize: 12.5 }}>{memberName(data, policy.insuredId)} · {policy.name}</b>
                  <div className="jk-sub">
                    {policy.company || '未记公司'} · {FREQ_CN[policy.freq] || policy.freq}
                    {policy.premium != null ? ` ${core.fmtMoney(policy.premium)}` : ''}
                    {st.nextPayDate ? ` · 下次缴费 ${st.nextPayDate}` : ''}
                  </div>
                </div>
                <div className="jk-row" style={{ gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {kindTag(policy)}
                  {stateTag(st)}
                </div>
              </div>
              {isOpen && (
                <div style={{ marginTop: 9, borderTop: '1px solid #242C3A', paddingTop: 8 }}>
                  <div className="jk-kv"><span>保单号</span><span>{policy.policyNo || '—'}</span></div>
                  <div className="jk-kv"><span>保额</span><span>{policy.coverage != null ? `${core.fmtMoney(policy.coverage)}${policy.coverageNote ? `（${policy.coverageNote}）` : ''}` : '未登记'}</span></div>
                  <div className="jk-kv"><span>缴费进度</span><span className="jk-num">{pp}{tp != null ? ` / ${tp}` : ''} 期 · 缴至 {st.paidUntil}</span></div>
                  {st.waitingEnd && st.state === 'waiting' && <div className="jk-kv"><span>等待期</span><span style={{ color: '#E3B341' }}>至 {st.waitingEnd}（期内出险通常不赔）</span></div>}
                  {st.graceEnd && st.state === 'grace' && <div className="jk-kv"><span>宽限期</span><span style={{ color: '#FF8A9A' }}>至 {st.graceEnd}（保障仍有效）</span></div>}
                  {st.state === 'lapse' && <div className="jk-kv"><span>中止期</span><span style={{ color: '#FF8A9A' }}>出险不赔，可申请复效</span></div>}
                  <div className="jk-kv"><span>保障期</span><span>{policy.endDate ? `至 ${policy.endDate}` : '终身/未填'}{policy.waitingDays != null ? ` · 等待期 ${policy.waitingDays} 天` : ''}</span></div>
                  <div className="jk-kv"><span>电子保单</span><span>{policy.fileNote || '未登记（建议补记）'}</span></div>
                  {policy.note && <div className="jk-kv"><span>备注</span><span>{policy.note}</span></div>}

                  <div className="jk-lbl" style={{ marginTop: 10 }}>流水（{evs.length}）</div>
                  {evs.length === 0 && <div className="jk-sub">暂无缴费/理赔/批改流水。</div>}
                  {evs.slice().reverse().map((e) => (
                    <div key={e.occKey} className="jk-row" style={{ padding: '2px 0' }}>
                      <span className="jk-sub jk-grow">
                        {e.date} · {core.EVENT_NAMES[e.type] || e.type}{e.amount != null ? ` ${core.fmtMoney(e.amount)}` : ''}{e.note ? ` · ${e.note}` : ''}
                      </span>
                      {confirmDelEv === e.occKey
                        ? <button className="jk-btn danger sm" onClick={() => doDeleteEvent(e.occKey)}>确认删</button>
                        : <button className="jk-btn ghost sm" onClick={() => setConfirmDelEv(e.occKey)}>删</button>}
                    </div>
                  ))}

                  <div className="jk-row" style={{ marginTop: 10, gap: 6, flexWrap: 'wrap' }}>
                    <button className="jk-btn green sm" onClick={() => logPayToday(policy)}>记一笔缴费</button>
                    <button className="jk-btn ghost sm" onClick={() => { setForm(toForm(policy)); setEditId(policy.id) }}>编辑</button>
                    {confirmDel === policy.id
                      ? <button className="jk-btn danger sm" onClick={() => doDelete(policy.id)}>确认删除（连带流水）</button>
                      : <button className="jk-btn danger sm" onClick={() => setConfirmDel(policy.id)}>删除</button>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
