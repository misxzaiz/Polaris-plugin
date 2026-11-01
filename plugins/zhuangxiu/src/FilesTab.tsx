/**
 * 档案 Tab：项目档案（名称/房子/总预算/状态）+ 供应商 + 工期节点 + 对账小结/导出
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import type { Milestone, Vendor } from '../shared/core'
import { buildSummary } from '../shared/core'
import { deleteKey, exportAll, K, saveMilestone, saveProject, saveVendor } from './model'
import type { TabProps } from './PanelTypes'

export default function FilesTab({ data, reload, showToast }: TabProps) {
  const [pName, setPName] = useState('')
  const [pHouse, setPHouse] = useState('')
  const [pBudget, setPBudget] = useState('')
  const [pStatus, setPStatus] = useState('active')
  const [projLoaded, setProjLoaded] = useState(false)
  const [venEdit, setVenEdit] = useState<Vendor | null>(null)
  const [venOpen, setVenOpen] = useState(false)
  const [vName, setVName] = useState('')
  const [vRole, setVRole] = useState('')
  const [vPhone, setVPhone] = useState('')
  const [vContract, setVContract] = useState('')
  const [vNote, setVNote] = useState('')
  const [mTitle, setMTitle] = useState('')
  const [mDate, setMDate] = useState('')
  const [mNote, setMNote] = useState('')
  const [summary, setSummary] = useState('')
  const [expText, setExpText] = useState('')
  const [busy, setBusy] = useState(false)

  const paidByVen = useMemo(() => {
    const m = new Map<string, { paid: number; n: number }>()
    for (const e of data?.exps || []) {
      if (!e.vendorId) continue
      const cur = m.get(e.vendorId) || { paid: 0, n: 0 }
      cur.paid += e.amount; cur.n += 1
      m.set(e.vendorId, cur)
    }
    return m
  }, [data])

  if (!data) return <div className="zx-empty">载入中…</div>
  const p = data.project
  if (!projLoaded) {
    setPName(p?.name || '')
    setPHouse(p?.house || '')
    setPBudget(p?.totalBudget !== undefined ? String(p.totalBudget) : '')
    setPStatus(p?.status || 'active')
    setProjLoaded(true)
  }

  async function onSaveProject() {
    setBusy(true)
    try {
      await saveProject({
        name: pName, house: pHouse, status: pStatus,
        totalBudget: pBudget.trim() === '' ? null : Number(pBudget),
      }, p)
      showToast('项目档案已保存')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  function openVen(v: Vendor | null) {
    setVenEdit(v)
    setVenOpen(true)
    setVName(v?.name || '')
    setVRole(v?.role || '')
    setVPhone(v?.phone || '')
    setVContract(v?.contractAmount !== undefined ? String(v.contractAmount) : '')
    setVNote(v?.note || '')
  }

  async function onSaveVen() {
    setBusy(true)
    try {
      const input = {
        name: vName, role: vRole, phone: vPhone, note: vNote,
        contractAmount: vContract.trim() === '' ? null : Number(vContract),
      }
      if (venEdit) await saveVendor(input, venEdit)
      else {
        if (data!.vens.some((v) => v.name === vName.trim())) { showToast('同名供应商已存在', true); return }
        await saveVendor(input, null)
      }
      showToast('供应商已保存')
      setVenOpen(false)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteVen(v: Vendor) {
    try {
      await deleteKey(K.ven(v.id))
      showToast(`已删除供应商「${v.name}」（历史流水保留）`)
      setVenOpen(false)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  async function onAddMile() {
    setBusy(true)
    try {
      const m = await saveMilestone({ title: mTitle, date: mDate, note: mNote }, null)
      showToast(`已建节点「${m.title}」@ ${m.date}`)
      setMTitle(''); setMDate(''); setMNote('')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function onToggleMile(m: Milestone) {
    try {
      await saveMilestone({ done: !m.done }, m)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  async function onDeleteMile(m: Milestone) {
    try {
      await deleteKey(K.mile(m.id))
      showToast('节点已删除')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  function genSummary() {
    setSummary(core.buildSummary({
      project: data!.project, cats: data!.cats, expenses: data!.exps, vendors: data!.vens, milestones: data!.miles,
    }, Date.now()))
  }

  return (
    <>
      <div className="zx-sec"><i className="zx-bar-ic" />项目档案</div>
      <div className="zx-card"><div className="zx-card-b">
        <div className="zx-grid2">
          <div>
            <label className="zx-lbl">项目名称</label>
            <input className="zx-inp" value={pName} placeholder="如 世纪花园 3-502" onChange={(e) => setPName(e.target.value)} />
          </div>
          <div>
            <label className="zx-lbl">总预算（元，优先于科目合计）</label>
            <input className="zx-inp" inputMode="decimal" value={pBudget} placeholder="300000" onChange={(e) => setPBudget(e.target.value)} />
          </div>
        </div>
        <div className="zx-grid2">
          <div>
            <label className="zx-lbl">状态</label>
            <select className="zx-sel" value={pStatus} onChange={(e) => setPStatus(e.target.value)}>
              <option value="planning">规划中</option>
              <option value="active">进行中</option>
              <option value="done">已完工</option>
            </select>
          </div>
          <div>
            <label className="zx-lbl">房子/小区</label>
            <input className="zx-inp" value={pHouse} onChange={(e) => setPHouse(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="zx-btn" disabled={busy || !pName.trim()} onClick={onSaveProject}>保存项目档案</button>
        </div>
      </div></div>

      <div className="zx-sec">
        <i className="zx-bar-ic" />供应商
        <span className="zx-hint">{data.vens.length} 家</span>
        <button className="zx-link" onClick={() => openVen(null)}>+ 建档</button>
      </div>
      <div className="zx-card">
        {data.vens.length === 0 && <div className="zx-empty">还没有供应商档案。记账时对 AI 提「张师傅装的」会自动建档。</div>}
        {data.vens.map((v) => {
          const st = paidByVen.get(v.id) || { paid: 0, n: 0 }
          return (
            <div key={v.id} className="zx-item">
              <div className="zx-item-t">
                <b>{v.name}</b>
                {v.role && <span className="zx-tag">{v.role}</span>}
                <span className="zx-grow" />
                <span className="zx-right">
                  <b className="zx-money">¥{core.fmtMoney(st.paid)}</b>
                  <span className="zx-sub"> / {st.n} 笔</span>
                </span>
                <button className="zx-link" onClick={() => openVen(v)}>改</button>
              </div>
              {(v.phone || v.contractAmount !== undefined || v.note) && (
                <div className="zx-item-s">
                  {v.phone ? <span>· ☎ {v.phone}</span> : null}
                  {v.contractAmount !== undefined ? <span>· 合同额 ¥{core.fmtMoney(v.contractAmount)}</span> : null}
                  {v.note ? <span>· {v.note}</span> : null}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="zx-sec"><i className="zx-bar-ic" />工期节点<span className="zx-hint">逾期红 · 3 天内黄</span></div>
      <div className="zx-card"><div className="zx-card-b">
        <div className="zx-grid2">
          <input className="zx-inp" value={mTitle} placeholder="节点标题，如 水电验收" onChange={(e) => setMTitle(e.target.value)} />
          <input className="zx-inp" type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} />
        </div>
        <input className="zx-inp" style={{ marginTop: 8 }} value={mNote} placeholder="备注（可选）" onChange={(e) => setMNote(e.target.value)} />
        <div style={{ marginTop: 8 }}>
          <button className="zx-btn" disabled={busy || !mTitle.trim() || !mDate} onClick={onAddMile}>建节点</button>
        </div>
      </div></div>
      {data.miles.length > 0 && (
        <div className="zx-card">
          {data.miles.map((m) => {
            const lv = core.milestoneLevel(m)
            return (
              <div key={m.id} className="zx-item">
                <div className="zx-item-t">
                  <span className={`zx-tag ${lv.level === 'gray' ? 'gray' : lv.level}`}>
                    {m.done ? '已完成' : lv.level === 'red' ? `逾期 ${-(lv.daysLeft || 0)} 天` : lv.level === 'yellow' ? `还剩 ${lv.daysLeft} 天` : '未到'}
                  </span>
                  <b style={{ textDecoration: m.done ? 'line-through' : undefined }}>{m.title}</b>
                  <span className="zx-grow" />
                  <span className="zx-sub">{m.date}</span>
                  <button className="zx-link" onClick={() => onToggleMile(m)}>{m.done ? '重开' : '完成'}</button>
                  <button className="zx-link" onClick={() => onDeleteMile(m)}>删</button>
                </div>
                {m.note && <div className="zx-item-s">· {m.note}</div>}
              </div>
            )
          })}
        </div>
      )}

      <div className="zx-sec"><i className="zx-bar-ic" />对账小结与导出</div>
      <div className="zx-card"><div className="zx-card-b">
        <div className="zx-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className="zx-btn ghost" onClick={genSummary}>生成对账小结</button>
          <button className="zx-btn ghost" onClick={() => setExpText(exportAll(data!))}>生成导出 JSON</button>
        </div>
        {summary && <textarea className="zx-textarea" style={{ marginTop: 10 }} readOnly value={summary} />}
        {expText && <textarea className="zx-textarea" style={{ marginTop: 10 }} readOnly value={expText} />}
      </div></div>

      {venOpen && (
        <div className="zx-modal-bg" onClick={() => setVenOpen(false)}>
          <div className="zx-modal" onClick={(e) => e.stopPropagation()}>
            <h4>{venEdit ? `供应商「${venEdit.name}」` : '新建供应商'}</h4>
            <label className="zx-lbl">名称</label>
            <input className="zx-inp" value={vName} onChange={(e) => setVName(e.target.value)} />
            <div className="zx-grid2">
              <div>
                <label className="zx-lbl">角色</label>
                <input className="zx-inp" value={vRole} placeholder="瓦工/全包公司" onChange={(e) => setVRole(e.target.value)} />
              </div>
              <div>
                <label className="zx-lbl">电话</label>
                <input className="zx-inp" value={vPhone} onChange={(e) => setVPhone(e.target.value)} />
              </div>
            </div>
            <label className="zx-lbl">合同额（元，可选）</label>
            <input className="zx-inp" inputMode="decimal" value={vContract} onChange={(e) => setVContract(e.target.value)} />
            <label className="zx-lbl">备注</label>
            <input className="zx-inp" value={vNote} onChange={(e) => setVNote(e.target.value)} />
            <div className="zx-row" style={{ marginTop: 12, gap: 6 }}>
              <button className="zx-btn" disabled={busy || !vName.trim()} onClick={onSaveVen}>保存</button>
              <button className="zx-btn ghost" onClick={() => setVenOpen(false)}>取消</button>
              <span className="zx-grow" />
              {venEdit && <button className="zx-btn danger" onClick={() => onDeleteVen(venEdit)}>删除</button>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
