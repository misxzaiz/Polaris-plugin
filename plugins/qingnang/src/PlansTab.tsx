/**
 * 方案 Tab：按成员筛选的用药方案列表（描述/依从率/停用启用/编辑/删除）+ 新建表单。
 * 依从率用本地近窗数据（8 天窗口取 7 天）由 core.adherence 现算，口径与 AI/服务一致。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import { saveRegimen, deleteEntity, type QingData, type Regimen } from './model'
import type { TabProps } from './PanelTypes'

const FREQ_TYPES: [string, string][] = [
  ['daily', '每天'],
  ['weekly', '每周几'],
  ['interval', '每 N 天'],
  ['cycle', '吃 N 停 M'],
  ['prn', '需要时（prn）'],
]
const WD = ['日', '一', '二', '三', '四', '五', '六']

interface FormState {
  profileId: string; medId: string; dose: string; times: string
  freqType: string; weekdays: number[]; intervalDays: string; onDays: string; offDays: string
  startDate: string; endDate: string; note: string
}
function emptyForm(): FormState {
  return {
    profileId: '', medId: '', dose: '1', times: '08:00',
    freqType: 'daily', weekdays: [], intervalDays: '7', onDays: '21', offDays: '7',
    startDate: core.dayKey(Date.now()), endDate: '', note: '',
  }
}
function formToInput(f: FormState): Record<string, unknown> {
  const freq: Record<string, unknown> = { type: f.freqType }
  if (f.freqType === 'weekly') freq.weekdays = f.weekdays
  if (f.freqType === 'interval') freq.intervalDays = Number(f.intervalDays)
  if (f.freqType === 'cycle') { freq.onDays = Number(f.onDays); freq.offDays = Number(f.offDays) }
  return {
    profileId: f.profileId, medId: f.medId, dose: Number(f.dose),
    times: f.times.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean),
    freq, startDate: f.startDate, endDate: f.endDate || undefined, note: f.note,
  }
}

export default function PlansTab({ data, reload, showToast, pluginId }: TabProps) {
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<Regimen | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState('')
  void pluginId

  const adherenceByReg = useMemo(() => {
    if (!data) return new Map<string, core.Adherence>()
    const ctx = { profiles: data.profiles, meds: data.meds, regimens: data.regimens, logs: data.logs, settings: data.settings }
    const map = new Map<string, core.Adherence>()
    // 单方案口径：ctx 只喂当前方案（adherence 的过滤维度是 profileId）
    for (const r of data.regimens) map.set(r.id, core.adherence({ ...ctx, regimens: [r] }, null, Date.now(), 7))
    return map
  }, [data])

  if (!data) return <div className="qn-empty">载入中…</div>

  const meds = data.meds
  const regs = data.regimens
    .filter((r) => !filter || r.profileId === filter)
    .sort((a, b) => (a.active === b.active ? (a.startDate < b.startDate ? 1 : -1) : a.active === false ? 1 : -1))
  const medById = new Map(meds.map((m) => [m.id, m]))
  const profById = new Map(data.profiles.map((p) => [p.id, p]))

  function openEdit(r: Regimen | null) {
    if (r) {
      setForm({
        profileId: r.profileId, medId: r.medId, dose: String(r.dose), times: r.times.join(','),
        freqType: r.freq.type, weekdays: r.freq.weekdays ? [...r.freq.weekdays] : [],
        intervalDays: String(r.freq.intervalDays || 7), onDays: String(r.freq.onDays || 21), offDays: String(r.freq.offDays || 7),
        startDate: r.startDate, endDate: r.endDate || '', note: r.note,
      })
      setEditing(r)
    } else {
      setForm(emptyForm())
      setEditing(null)
    }
    setShowForm(true)
  }

  async function submit() {
    setBusy(true)
    try {
      const saved = await saveRegimen(formToInput(form), editing)
      showToast(editing ? '方案已更新' : '方案已建立')
      setShowForm(false)
      setEditing(null)
      void saved
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(r: Regimen) {
    setBusy(true)
    try {
      await saveRegimen({ active: !r.active }, r)
      showToast(r.active ? '已停用（保留历史）' : '已启用')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function remove(r: Regimen) {
    if (confirmDel !== r.id) { setConfirmDel(r.id); setTimeout(() => setConfirmDel((c) => (c === r.id ? '' : c)), 4000); return }
    setBusy(true)
    try {
      await deleteEntity('regimen', r.id, false, data!)
      showToast('已删除方案及其打卡记录')
      setConfirmDel('')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  if (!data.profiles.length && !showForm) {
    return (
      <div>
        <div className="qn-card"><div className="qn-card-b qn-empty">
          先到「设置」页建家庭成员，再来排用药方案。
        </div></div>
      </div>
    )
  }

  return (
    <div>
      <div className="qn-sec">
        <span className="qn-bar" />
        用药方案（{regs.length}）
        <button className="qn-hint qn-btn ghost sm" onClick={() => openEdit(null)}>＋ 新方案</button>
      </div>

      {/* 成员筛选 */}
      <div className="qn-card"><div className="qn-card-b qn-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <button className={`qn-btn sm ${filter === '' ? '' : 'ghost'}`} onClick={() => setFilter('')}>全部</button>
        {data.profiles.map((p) => (
          <button key={p.id} className={`qn-btn sm ${filter === p.id ? '' : 'ghost'}`} onClick={() => setFilter(p.id)}>
            {p.name}{p.kind === 'pet' ? ' 🐾' : ''}
          </button>
        ))}
      </div></div>

      {showForm && (
        <div className="qn-card"><div className="qn-card-b">
          <div className="qn-row">
            <div className="qn-grow">
              <label className="qn-lbl">谁在吃 *</label>
              <select className="qn-sel" value={form.profileId} onChange={(e) => setForm({ ...form, profileId: e.target.value })}>
                <option value="">选择成员…</option>
                {data.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="qn-grow">
              <label className="qn-lbl">吃什么药 *</label>
              <select className="qn-sel" value={form.medId} onChange={(e) => setForm({ ...form, medId: e.target.value })}>
                <option value="">选择药品…</option>
                {meds.map((m) => <option key={m.id} value={m.id}>{m.name}{m.spec ? `（${m.spec}）` : ''}</option>)}
              </select>
            </div>
          </div>
          <div className="qn-row">
            <div style={{ width: 110 }}>
              <label className="qn-lbl">每次剂量 *</label>
              <input className="qn-inp" value={form.dose} inputMode="decimal" onChange={(e) => setForm({ ...form, dose: e.target.value })} />
            </div>
            <div className="qn-grow">
              <label className="qn-lbl">服药时刻（逗号分隔 HH:MM；prn 可留空）</label>
              <input className="qn-inp" value={form.times} placeholder="08:00, 20:00" onChange={(e) => setForm({ ...form, times: e.target.value })} />
            </div>
          </div>
          <label className="qn-lbl">频次</label>
          <select className="qn-sel" value={form.freqType} onChange={(e) => setForm({ ...form, freqType: e.target.value })}>
            {FREQ_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {form.freqType === 'weekly' && (
            <div className="qn-row" style={{ marginTop: 6, gap: 4 }}>
              {WD.map((w, i) => (
                <button key={i} className={`qn-btn sm ${form.weekdays.includes(i) ? '' : 'ghost'}`}
                  onClick={() => setForm({ ...form, weekdays: form.weekdays.includes(i) ? form.weekdays.filter((x) => x !== i) : [...form.weekdays, i].sort() })}>
                  {w}
                </button>
              ))}
            </div>
          )}
          {form.freqType === 'interval' && (
            <div style={{ marginTop: 6 }}>
              <label className="qn-lbl">间隔天数（2-365）</label>
              <input className="qn-inp" value={form.intervalDays} inputMode="numeric" onChange={(e) => setForm({ ...form, intervalDays: e.target.value })} />
            </div>
          )}
          {form.freqType === 'cycle' && (
            <div className="qn-row" style={{ marginTop: 6 }}>
              <div className="qn-grow">
                <label className="qn-lbl">吃（天）</label>
                <input className="qn-inp" value={form.onDays} inputMode="numeric" onChange={(e) => setForm({ ...form, onDays: e.target.value })} />
              </div>
              <div className="qn-grow">
                <label className="qn-lbl">停（天）</label>
                <input className="qn-inp" value={form.offDays} inputMode="numeric" onChange={(e) => setForm({ ...form, offDays: e.target.value })} />
              </div>
            </div>
          )}
          <div className="qn-row" style={{ marginTop: 4 }}>
            <div className="qn-grow">
              <label className="qn-lbl">开始日期 *</label>
              <input className="qn-inp" value={form.startDate} placeholder="YYYY-MM-DD" onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="qn-grow">
              <label className="qn-lbl">结束日期（疗程药填，长期留空）</label>
              <input className="qn-inp" value={form.endDate} placeholder="YYYY-MM-DD" onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <label className="qn-lbl">备注（如「饭后吃」——仅记录，不构成医疗建议）</label>
          <input className="qn-inp" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <div className="qn-row" style={{ marginTop: 10, gap: 8 }}>
            <button className="qn-btn" disabled={busy || !form.profileId || !form.medId} onClick={submit}>{editing ? '保存修改' : '建立方案'}</button>
            <button className="qn-btn ghost" onClick={() => { setShowForm(false); setEditing(null) }}>取消</button>
          </div>
        </div></div>
      )}

      {!regs.length && !showForm && (
        <div className="qn-card"><div className="qn-card-b qn-empty">
          {data.meds.length ? '还没有用药方案。点「＋ 新方案」排一个，或让 AI 一句话搞定。' : '药箱里还没有药——先到「药箱」页登记药品。'}
        </div></div>
      )}

      {regs.map((r) => {
        const med = medById.get(r.medId)
        const prof = profById.get(r.profileId)
        const adh = adherenceByReg.get(r.id)
        return (
          <div key={r.id} className="qn-card">
            <div className="qn-row" style={{ padding: '10px 13px' }}>
              <span className="qn-grow">
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{prof ? prof.name : '?'} · {med ? med.name : '?'}</span>
                <div className="qn-sub">{core.describeRegimen(r, med)}</div>
                {r.note && <div className="qn-sub">📝 {r.note}</div>}
              </span>
              <span className={`qn-tag ${r.active === false ? '' : 'blue'}`}>{r.active === false ? '已停' : '进行中'}</span>
            </div>
            <div className="qn-row" style={{ padding: '0 13px 10px', gap: 6 }}>
              {adh && adh.rate != null && (
                <span className={`qn-tag ${adh.rate >= 80 ? 'green' : adh.rate >= 50 ? 'yellow' : 'red'}`}>
                  近7天依从 {adh.rate}%（{adh.taken}/{adh.decided}{adh.missed ? ` 漏${adh.missed}` : ''}）
                </span>
              )}
              <button className="qn-btn ghost sm" disabled={busy} onClick={() => toggleActive(r)}>{r.active === false ? '启用' : '停用'}</button>
              <button className="qn-btn ghost sm" disabled={busy} onClick={() => openEdit(r)}>编辑</button>
              <button className="qn-btn danger sm" disabled={busy} onClick={() => remove(r)}>
                {confirmDel === r.id ? '再点确认(连带删打卡)' : '删除'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
