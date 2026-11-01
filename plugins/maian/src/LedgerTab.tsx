/**
 * 台账 Tab：全量记录筛选浏览（成员×指标×日期区间）+ 行内删除（两步确认）+
 * 编辑弹窗（复用记录字段；跨日迁移走 model.updateRecord 单一口径）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import { deleteRecord, updateRecord, type VitalRecord } from './model'
import type { TabProps } from './PanelTypes'
import { BandTag, bandOfRecord, memberOf } from './ui'

type EditState = {
  id: string
  kind: string
  profileId: string
  sys: string; dia: string; pulse: string
  mmol: string; slot: string
  kg: string; c: string
  date: string
  time: string
  note: string
} | null

export default function LedgerTab({ data, reload, showToast }: TabProps) {
  const [fMember, setFMember] = useState('')
  const [fKind, setFKind] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [edit, setEdit] = useState<EditState>(null)
  const [confirmId, setConfirmId] = useState('')
  const [busy, setBusy] = useState(false)

  const members = data?.members || []

  const filtered = useMemo(() => {
    if (!data) return []
    let rs = [...data.records]
    if (fMember) rs = rs.filter((r) => r.profileId === fMember)
    if (fKind) rs = rs.filter((r) => r.kind === fKind)
    if (fFrom) {
      const t = core.parseDayKey(fFrom)
      if (t !== null) rs = rs.filter((r) => r.ts >= t)
    }
    if (fTo) {
      const t = core.parseDayKey(fTo)
      if (t !== null) rs = rs.filter((r) => r.ts < t + core.DAY_MS)
    }
    return rs.sort((a, b) => b.ts - a.ts)
  }, [data, fMember, fKind, fFrom, fTo])

  const groups = useMemo(() => {
    const m = new Map<string, VitalRecord[]>()
    for (const r of filtered) {
      const d = core.dayKeyOfTs(r.ts)
      if (!m.has(d)) m.set(d, [])
      m.get(d)!.push(r)
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  function openEdit(r: VitalRecord) {
    setEdit({
      id: r.id,
      kind: r.kind,
      profileId: r.profileId,
      sys: r.sys !== undefined ? String(r.sys) : '',
      dia: r.dia !== undefined ? String(r.dia) : '',
      pulse: r.pulse !== undefined ? String(r.pulse) : '',
      mmol: r.mmol !== undefined ? String(r.mmol) : '',
      slot: r.slot || 'random',
      kg: r.kg !== undefined ? String(r.kg) : '',
      c: r.c !== undefined ? String(r.c) : '',
      date: core.dayKeyOfTs(r.ts),
      time: core.fmtTime(r.ts),
      note: r.note || '',
    })
  }

  async function saveEdit() {
    if (!edit) return
    setBusy(true)
    try {
      await updateRecord(edit.id, {
        profileId: edit.profileId,
        kind: edit.kind,
        sys: edit.kind === 'bp' ? Number(edit.sys) : undefined,
        dia: edit.kind === 'bp' ? Number(edit.dia) : undefined,
        pulse: edit.kind === 'bp' && edit.pulse !== '' ? Number(edit.pulse) : undefined,
        mmol: edit.kind === 'bg' ? Number(edit.mmol) : undefined,
        slot: edit.kind === 'bg' ? edit.slot : undefined,
        kg: edit.kind === 'weight' ? Number(edit.kg) : undefined,
        c: edit.kind === 'temp' ? Number(edit.c) : undefined,
        date: edit.date,
        time: edit.time,
        note: edit.note.trim(),
      })
      setEdit(null)
      await reload()
      showToast('已修改')
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function del(id: string) {
    if (confirmId !== id) { setConfirmId(id); return }
    setConfirmId('')
    try {
      await deleteRecord(id)
      await reload()
      showToast('已删除')
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  if (!data) return <div className="mn-empty">载入中…</div>

  return (
    <div>
      <div className="mn-card"><div className="mn-card-b">
        <span className="mn-lbl" style={{ marginTop: 0 }}>筛选</span>
        <div className="mn-chips">
          <button className={`mn-chip ${fMember === '' ? 'on' : ''}`} onClick={() => setFMember('')}>全部成员</button>
          {members.map((m) => (
            <button key={m.id} className={`mn-chip ${fMember === m.id ? 'on' : ''}`} onClick={() => setFMember(m.id)}>{m.name}</button>
          ))}
        </div>
        <div className="mn-chips" style={{ marginTop: 6 }}>
          <button className={`mn-chip ${fKind === '' ? 'on' : ''}`} onClick={() => setFKind('')}>全部指标</button>
          {core.KINDS.map((k) => (
            <button key={k} className={`mn-chip ${fKind === k ? 'on' : ''}`} onClick={() => setFKind(k)}>{core.KIND_META[k].label}</button>
          ))}
        </div>
        <div className="mn-row" style={{ marginTop: 8 }}>
          <input className="mn-inp" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          <span className="mn-sub">至</span>
          <input className="mn-inp" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          {(fFrom || fTo) && <button className="mn-btn ghost sm" onClick={() => { setFFrom(''); setFTo('') }}>清日期</button>}
        </div>
      </div></div>

      <div className="mn-sec"><i className="mn-bar" />记录<span className="mn-hint">{filtered.length} 条</span></div>
      {groups.length === 0 ? (
        <div className="mn-empty">没有符合条件的记录。</div>
      ) : groups.map(([date, rs]) => (
        <div key={date}>
          <div className="mn-sec" style={{ padding: '10px 18px 4px' }}><i className="mn-bar" />{date}</div>
          {rs.map((r) => {
            const member = memberOf(data, r.profileId)
            const b = bandOfRecord(r, member)
            return (
              <div key={r.id} className="mn-card"><div className="mn-card-b">
                <div className="mn-row">
                  <span className="mn-tag blue">{core.fmtTime(r.ts)}</span>
                  <b>{member?.name || '?'}</b>
                  <span>{core.KIND_META[r.kind].label} {core.fmtValue(r)}</span>
                  <BandTag level={b.level} label={b.label} />
                  <span className="mn-hint">{r.src === 'panel' ? '面板' : 'AI'}</span>
                </div>
                {(r.note || (b.level !== 'green' && b.level !== 'none')) && (
                  <div className="mn-sub" style={{ marginTop: 4 }}>{r.note ? `${r.note} · ` : ''}{b.text}</div>
                )}
                <div className="mn-row" style={{ marginTop: 6 }}>
                  <div className="mn-grow" />
                  <button className="mn-btn ghost sm" onClick={() => openEdit(r)}>改</button>
                  {confirmId === r.id
                    ? <button className="mn-btn danger sm" onClick={() => del(r.id)}>确认删除</button>
                    : <button className="mn-btn ghost sm" onClick={() => del(r.id)}>删</button>}
                </div>
              </div></div>
            )
          })}
        </div>
      ))}

      {edit && (
        <div className="mn-modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setEdit(null) }}>
          <div className="mn-modal">
            <h4>修改记录</h4>
            <span className="mn-lbl">成员</span>
            <div className="mn-chips">
              {members.map((m) => (
                <button key={m.id} className={`mn-chip ${edit.profileId === m.id ? 'on' : ''}`} onClick={() => setEdit({ ...edit, profileId: m.id })}>{m.name}</button>
              ))}
            </div>
            <span className="mn-lbl">指标</span>
            <div className="mn-chips">
              {core.KINDS.map((k) => (
                <button key={k} className={`mn-chip ${edit.kind === k ? 'on' : ''}`} onClick={() => setEdit({ ...edit, kind: k })}>{core.KIND_META[k].label}</button>
              ))}
            </div>
            {edit.kind === 'bp' && (
              <div className="mn-row" style={{ marginTop: 8 }}>
                <input className="mn-inp" style={{ width: '30%' }} type="number" placeholder="收缩压" value={edit.sys} onChange={(e) => setEdit({ ...edit, sys: e.target.value })} />
                <input className="mn-inp" style={{ width: '30%' }} type="number" placeholder="舒张压" value={edit.dia} onChange={(e) => setEdit({ ...edit, dia: e.target.value })} />
                <input className="mn-inp" style={{ width: '28%' }} type="number" placeholder="心率(选)" value={edit.pulse} onChange={(e) => setEdit({ ...edit, pulse: e.target.value })} />
              </div>
            )}
            {edit.kind === 'bg' && (
              <>
                <div className="mn-row" style={{ marginTop: 8 }}>
                  <input className="mn-inp mn-grow" type="number" step="0.1" placeholder="血糖 mmol/L" value={edit.mmol} onChange={(e) => setEdit({ ...edit, mmol: e.target.value })} />
                </div>
                <div className="mn-chips" style={{ marginTop: 6 }}>
                  {core.BG_SLOTS.map((s) => (
                    <button key={s} className={`mn-chip ${edit.slot === s ? 'on' : ''}`} onClick={() => setEdit({ ...edit, slot: s })}>{core.BG_SLOT_META[s].label}</button>
                  ))}
                </div>
              </>
            )}
            {edit.kind === 'weight' && (
              <div className="mn-row" style={{ marginTop: 8 }}>
                <input className="mn-inp mn-grow" type="number" step="0.1" placeholder="体重 kg" value={edit.kg} onChange={(e) => setEdit({ ...edit, kg: e.target.value })} />
              </div>
            )}
            {edit.kind === 'temp' && (
              <div className="mn-row" style={{ marginTop: 8 }}>
                <input className="mn-inp mn-grow" type="number" step="0.1" placeholder="体温 ℃" value={edit.c} onChange={(e) => setEdit({ ...edit, c: e.target.value })} />
              </div>
            )}
            <div className="mn-row" style={{ marginTop: 8 }}>
              <input className="mn-inp mn-grow" type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
              <input className="mn-inp" type="time" value={edit.time} onChange={(e) => setEdit({ ...edit, time: e.target.value })} />
            </div>
            <input className="mn-inp" style={{ marginTop: 8 }} placeholder="备注"
              value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
            <div className="mn-row" style={{ marginTop: 12 }}>
              <button className="mn-btn mn-grow" disabled={busy} onClick={saveEdit}>{busy ? '保存中…' : '保存'}</button>
              <button className="mn-btn ghost" onClick={() => setEdit(null)}>取消</button>
            </div>
            <div className="mn-sub" style={{ marginTop: 6 }}>改日期跨日/跨月会自动迁移，统计口径不变。</div>
          </div>
        </div>
      )}
    </div>
  )
}
