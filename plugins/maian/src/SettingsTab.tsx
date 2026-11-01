/**
 * 设置 Tab：成员档案 CRUD（身高→BMI 分带开关）+ 全量导出（数据所有权）+
 * 数据与边界说明。删除成员两步确认；有记录时要求显式「连同记录删除」。
 */
import { useState } from 'react'
import { deleteMember, exportAll, saveMember } from './model'
import type { TabProps } from './PanelTypes'

export default function SettingsTab({ data, reload, showToast }: TabProps) {
  const [name, setName] = useState('')
  const [height, setHeight] = useState('')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string; height: string; note: string } | null>(null)
  const [confirmId, setConfirmId] = useState('')
  const [exportText, setExportText] = useState('')
  const [busy, setBusy] = useState(false)

  const members = data?.members || []

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const m = await saveMember({ name, heightCm: height === '' ? undefined : Number(height), note }, null)
      setName(''); setHeight(''); setNote('')
      await reload()
      showToast(`已建档「${m.name}」`)
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editing || !data) return
    const existing = data.members.find((m) => m.id === editing.id)
    if (!existing) return
    setBusy(true)
    try {
      await saveMember(
        { name: editing.name, heightCm: editing.height === '' ? undefined : Number(editing.height), note: editing.note },
        existing,
      )
      setEditing(null)
      await reload()
      showToast('已保存')
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function del(id: string, purge: boolean) {
    if (!data) return
    const hasRecords = data.records.some((r) => r.profileId === id)
    if (!purge && hasRecords && confirmId !== id) {
      setConfirmId(id)
      return
    }
    setConfirmId('')
    try {
      await deleteMember(id, purge, data)
      await reload()
      showToast(purge ? '成员与相关记录已删除' : '已删除')
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  if (!data) return <div className="mn-empty">载入中…</div>

  return (
    <div>
      <div className="mn-sec"><i className="mn-bar" />家庭成员</div>
      {members.map((m) => {
        const n = data.records.filter((r) => r.profileId === m.id).length
        return (
          <div key={m.id} className="mn-card"><div className="mn-card-b">
            {editing && editing.id === m.id ? (
              <>
                <div className="mn-row">
                  <input className="mn-inp" style={{ width: '38%' }} placeholder="名字" value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  <input className="mn-inp" style={{ width: '26%' }} type="number" placeholder="身高cm" value={editing.height}
                    onChange={(e) => setEditing({ ...editing, height: e.target.value })} />
                </div>
                <input className="mn-inp" style={{ marginTop: 6 }} placeholder="备注（如 高血压随访）" value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
                <div className="mn-row" style={{ marginTop: 8 }}>
                  <button className="mn-btn mn-grow" disabled={busy} onClick={saveEdit}>保存</button>
                  <button className="mn-btn ghost" onClick={() => setEditing(null)}>取消</button>
                </div>
              </>
            ) : (
              <>
                <div className="mn-row">
                  <b>{m.name}</b>
                  {m.heightCm ? <span className="mn-tag blue">身高 {m.heightCm}cm</span> : <span className="mn-tag">无身高（BMI 分带关）</span>}
                  <span className="mn-hint">累计 {n} 条</span>
                </div>
                {m.note && <div className="mn-sub" style={{ marginTop: 3 }}>{m.note}</div>}
                <div className="mn-row" style={{ marginTop: 6 }}>
                  <div className="mn-grow" />
                  <button className="mn-btn ghost sm" onClick={() => setEditing({ id: m.id, name: m.name, height: m.heightCm ? String(m.heightCm) : '', note: m.note })}>改</button>
                  {confirmId === m.id && data.records.some((r) => r.profileId === m.id)
                    ? <button className="mn-btn danger sm" onClick={() => del(m.id, true)}>连同 {n} 条记录删除</button>
                    : <button className="mn-btn ghost sm" onClick={() => del(m.id, false)}>删</button>}
                </div>
              </>
            )}
          </div></div>
        )
      })}
      <div className="mn-card"><div className="mn-card-b">
        <div className="mn-row">
          <input className="mn-inp" style={{ width: '38%' }} placeholder="新成员名字" value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <input className="mn-inp" style={{ width: '26%' }} type="number" placeholder="身高cm(选)" value={height}
            onChange={(e) => setHeight(e.target.value)} />
          <button className="mn-btn" disabled={busy || !name.trim()} onClick={add}>建档</button>
        </div>
        <input className="mn-inp" style={{ marginTop: 6 }} placeholder="备注（选，如 高血压随访 / 孕期监测）" value={note}
          onChange={(e) => setNote(e.target.value)} />
      </div></div>

      <div className="mn-sec"><i className="mn-bar" />数据导出</div>
      <div className="mn-card"><div className="mn-card-b">
        <div className="mn-sub" style={{ marginBottom: 8 }}>全量导出为 JSON（成员+全部记录），数据始终属于你。</div>
        {!exportText ? (
          <button className="mn-btn" onClick={() => setExportText(exportAll(data))}>生成导出文本</button>
        ) : (
          <>
            <div className="mn-row">
              <button className="mn-btn ghost sm" onClick={async () => {
                try { await navigator.clipboard.writeText(exportText); showToast('已复制') }
                catch (_) { showToast('复制失败，长按文本手动复制', true, true) }
              }}>复制</button>
              <button className="mn-btn ghost sm" onClick={() => setExportText('')}>收起</button>
              <span className="mn-hint">{exportText.length} 字符</span>
            </div>
            <textarea className="mn-inp" readOnly value={exportText} rows={10} style={{ marginTop: 8, font: '11px/1.6 ui-monospace,Consolas,monospace' }} onFocus={(e) => e.currentTarget.select()} />
          </>
        )}
      </div></div>

      <div className="mn-sec"><i className="mn-bar" />边界与说明</div>
      <div className="mn-card"><div className="mn-card-b mn-sub">
        <p style={{ margin: '0 0 6px' }}>· 分带为通用参考区间（血压家庭自测口径、血糖指尖血时点口径、体温、中国成人 BMI），<b>仅供留意，不构成医疗建议</b>；解读请遵医嘱。</p>
        <p style={{ margin: '0 0 6px' }}>· 数据纯本地存储（宿主 cap.kv），不出设备、无账号、无上传；换设备可用「数据导出」搬运。</p>
        <p style={{ margin: '0 0 6px' }}>· 测量提醒交给「日晷」日程插件（如「每天早上 8 点提醒我妈量血压」）；本插件专注记录、分带与小结。</p>
        <p style={{ margin: 0 }}>· 对 AI 直接说「妈妈早上血压 152/95」即可记录；说「生成妈妈这个月的就诊小结」即可带走一份给医生。</p>
      </div></div>
    </div>
  )
}
