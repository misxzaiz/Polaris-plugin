/**
 * 记录 Tab：快速记录（成员 chips × 指标 chips × 动态字段）+ 今日全家记录 +
 * 近 7 天黄红概览。保存走 core.normalizeRecord 唯一口径，toast 即时回带分带。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import { addRecord, deleteRecord, saveMember } from './model'
import type { TabProps } from './PanelTypes'
import { BandTag, bandOfRecord, memberOf } from './ui'

export default function RecordTab({ data, reload, showToast }: TabProps) {
  const [profileId, setProfileId] = useState('')
  const [kind, setKind] = useState('bp')
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')
  const [pulse, setPulse] = useState('')
  const [mmol, setMmol] = useState('')
  const [slot, setSlot] = useState('fasting')
  const [kg, setKg] = useState('')
  const [c, setC] = useState('')
  const [date, setDate] = useState<'today' | 'yesterday'>('today')
  const [note, setNote] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState('')

  const members = data?.members || []
  const activeId = profileId || members[0]?.id || ''
  const activeMember = members.find((m) => m.id === activeId)

  const todayKey = core.dayKey(Date.now())
  const todayRecords = useMemo(
    () => (data ? data.records.filter((r) => core.dayKeyOfTs(r.ts) === todayKey).sort((a, b) => b.ts - a.ts) : []),
    [data, todayKey],
  )
  const weekAgo = Date.now() - 7 * core.DAY_MS
  const flags = useMemo(() => {
    if (!data) return []
    const heightOf = (pid: string) => data.members.find((m) => m.id === pid)?.heightCm
    return data.records
      .filter((r) => r.ts >= weekAgo)
      .filter((r) => ['yellow', 'red', 'urgent'].includes(bandOfRecord(r, memberOf(data, r.profileId)).level))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 12)
  }, [data, weekAgo])

  async function save() {
    if (!data) return
    if (!activeMember) { showToast('先建档成员（下方输入名字即可）', true); return }
    setBusy(true)
    try {
      const rec = await addRecord({
        profileId: activeMember.id,
        kind,
        sys: kind === 'bp' ? Number(sys) : undefined,
        dia: kind === 'bp' ? Number(dia) : undefined,
        pulse: kind === 'bp' && pulse !== '' ? Number(pulse) : undefined,
        mmol: kind === 'bg' ? Number(mmol) : undefined,
        slot: kind === 'bg' ? slot : undefined,
        kg: kind === 'weight' ? Number(kg) : undefined,
        c: kind === 'temp' ? Number(c) : undefined,
        date,
        note: note.trim() || undefined,
      })
      const member = data.members.find((m) => m.id === rec.profileId)
      const b = core.bandOf(rec.kind, rec as unknown as Record<string, unknown>, member?.heightCm)
      setSys(''); setDia(''); setPulse(''); setMmol(''); setKg(''); setC(''); setNote('')
      await reload()
      showToast(`已记录 ${core.fmtValue(rec)}【${b.label}】${b.text}（请遵医嘱）`, b.level === 'urgent', b.level === 'urgent')
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function quickAddMember() {
    const name = newName.trim()
    if (!name) return
    try {
      const m = await saveMember({ name }, null)
      setNewName('')
      setProfileId(m.id)
      await reload()
      showToast(`已建档「${m.name}」`)
    } catch (e) {
      showToast((e as Error).message, true)
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
      {!members.length && (
        <div className="mn-card"><div className="mn-card-b">
          <div className="mn-sub" style={{ marginBottom: 8 }}>先建一位家庭成员（如「妈妈」），之后对 AI 说「记一下妈妈的血压」也行。</div>
          <div className="mn-row">
            <input className="mn-inp mn-grow" placeholder="成员名字，如：妈妈" value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') quickAddMember() }} />
            <button className="mn-btn" onClick={quickAddMember}>建档</button>
          </div>
        </div></div>
      )}

      {members.length > 0 && (
        <div className="mn-card"><div className="mn-card-b">
          <span className="mn-lbl" style={{ marginTop: 0 }}>谁</span>
          <div className="mn-chips">
            {members.map((m) => (
              <button key={m.id} className={`mn-chip ${activeId === m.id ? 'on' : ''}`} onClick={() => setProfileId(m.id)}>{m.name}</button>
            ))}
          </div>
          <span className="mn-lbl">指标</span>
          <div className="mn-chips">
            {core.KINDS.map((k) => (
              <button key={k} className={`mn-chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{core.KIND_META[k].label}</button>
            ))}
          </div>
          {kind === 'bp' && (
            <div className="mn-row" style={{ marginTop: 8 }}>
              <input className="mn-inp" style={{ width: '30%' }} type="number" placeholder="收缩压" value={sys} onChange={(e) => setSys(e.target.value)} />
              <input className="mn-inp" style={{ width: '30%' }} type="number" placeholder="舒张压" value={dia} onChange={(e) => setDia(e.target.value)} />
              <input className="mn-inp" style={{ width: '28%' }} type="number" placeholder="心率(选)" value={pulse} onChange={(e) => setPulse(e.target.value)} />
            </div>
          )}
          {kind === 'bg' && (
            <>
              <div className="mn-row" style={{ marginTop: 8 }}>
                <input className="mn-inp mn-grow" type="number" step="0.1" placeholder="血糖 mmol/L" value={mmol} onChange={(e) => setMmol(e.target.value)} />
              </div>
              <div className="mn-chips" style={{ marginTop: 6 }}>
                {core.BG_SLOTS.map((s) => (
                  <button key={s} className={`mn-chip ${slot === s ? 'on' : ''}`} onClick={() => setSlot(s)}>{core.BG_SLOT_META[s].label}</button>
                ))}
              </div>
            </>
          )}
          {kind === 'weight' && (
            <div className="mn-row" style={{ marginTop: 8 }}>
              <input className="mn-inp mn-grow" type="number" step="0.1" placeholder="体重 kg" value={kg} onChange={(e) => setKg(e.target.value)} />
              {activeMember?.heightCm ? <span className="mn-tag blue">身高 {activeMember.heightCm}cm · BMI 分带开</span> : <span className="mn-tag">未登记身高，BMI 分带关（设置里补）</span>}
            </div>
          )}
          {kind === 'temp' && (
            <div className="mn-row" style={{ marginTop: 8 }}>
              <input className="mn-inp mn-grow" type="number" step="0.1" placeholder="体温 ℃" value={c} onChange={(e) => setC(e.target.value)} />
            </div>
          )}
          <div className="mn-row" style={{ marginTop: 10 }}>
            <div className="mn-chips">
              {(['today', 'yesterday'] as const).map((d) => (
                <button key={d} className={`mn-chip ${date === d ? 'on' : ''}`} onClick={() => setDate(d)}>{d === 'today' ? '今天' : '昨天'}</button>
              ))}
            </div>
          </div>
          <input className="mn-inp" style={{ marginTop: 8 }} placeholder="备注（选）：服药前 / 运动后 / 左臂…"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mn-row" style={{ marginTop: 10 }}>
            <button className="mn-btn mn-grow" disabled={busy} onClick={save}>{busy ? '记录中…' : '记录'}</button>
          </div>
          <div className="mn-sub" style={{ marginTop: 6 }}>也可以直接对 AI 说：「妈妈早上血压 152/95 心率 78」。</div>
        </div></div>
      )}

      <div className="mn-sec"><i className="mn-bar" />今日全家<span className="mn-hint">{todayRecords.length} 条</span></div>
      {todayRecords.length === 0 ? (
        <div className="mn-empty">今天还没有记录。量完随手记一笔，复诊时就有据可依。</div>
      ) : (
        todayRecords.map((r) => {
          const member = memberOf(data, r.profileId)
          const b = bandOfRecord(r, member)
          return (
            <div key={r.id} className="mn-card"><div className="mn-card-b">
              <div className="mn-row">
                <b>{member?.name || '?'}</b>
                <span>{core.KIND_META[r.kind].label} {core.fmtValue(r)}</span>
                <BandTag level={b.level} label={b.label} />
                <span className="mn-hint">{core.fmtTime(r.ts)}{r.src === 'panel' ? '' : ' · AI'}</span>
              </div>
              {(r.note || (b.level !== 'green' && b.level !== 'none')) && (
                <div className="mn-sub" style={{ marginTop: 4 }}>
                  {r.note ? `${r.note} · ` : ''}{b.text}
                </div>
              )}
              <div className="mn-row" style={{ marginTop: 6 }}>
                <div className="mn-grow" />
                {confirmId === r.id
                  ? <button className="mn-btn danger sm" onClick={() => del(r.id)}>确认删除</button>
                  : <button className="mn-btn ghost sm" onClick={() => del(r.id)}>删</button>}
              </div>
            </div></div>
          )
        })
      )}

      {flags.length > 0 && (
        <>
          <div className="mn-sec"><i className="mn-bar" />近 7 天黄红概览<span className="mn-hint">仅供留意，请遵医嘱</span></div>
          {flags.map((r) => {
            const member = memberOf(data, r.profileId)
            const b = bandOfRecord(r, member)
            return (
              <div key={r.id} className="mn-card"><div className="mn-card-b">
                <div className="mn-row">
                  <BandTag level={b.level} label={b.label} />
                  <span>{`${core.fmtDT(r.ts).slice(5)} · ${member?.name || '?'} · ${core.KIND_META[r.kind].label} ${core.fmtValue(r)}`}</span>
                </div>
                <div className="mn-sub" style={{ marginTop: 3 }}>{b.text}</div>
              </div></div>
            )
          })}
        </>
      )}
    </div>
  )
}
