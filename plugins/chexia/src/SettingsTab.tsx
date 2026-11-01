/**
 * 设置 Tab：车辆管理（增改删，删车需确认并连带名下记录）/ 提醒与统计参数 /
 * 数据导出（JSON，剥离 rev）/ 后台服务管理（状态 + 启动）。
 */
import { useState } from 'react'
import * as core from '../shared/core'
import { saveCar, saveSettings, deleteCar, exportAll, serviceStatus, serviceStart, type ChexiaData } from './model'
import { capDispatch } from './host'
import type { TabProps } from './Panel'

const css = `
.st-car{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #1c222e;font-size:12px;min-width:0}
.st-car:first-child{border-top:none}
.st-del{background:transparent;border:none;color:#5C6678;cursor:pointer;font-size:13px;padding:2px 5px;flex-shrink:0}
.st-del:hover{color:#F85149}
.st-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.st-note{font-size:10.5px;color:#5C6678;line-height:1.7;margin-top:6px}
`

const SERVICE_ID = 'chexia-service'

export default function SettingsTab({ data, reload, showToast, pluginId }: TabProps) {
  const [name, setName] = useState(''); const [kind, setKind] = useState('fuel')
  const [odo, setOdo] = useState(''); const [plate, setPlate] = useState('')
  const [busy, setBusy] = useState(false)
  // 行内编辑：id -> {field: value}
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState(''); const [editOdo, setEditOdo] = useState('')

  const [docWarnDays, setDocWarnDays] = useState(''); const [itemWatchKm, setItemWatchKm] = useState('')
  const [itemWatchDays, setItemWatchDays] = useState(''); const [costWindowDays, setCostWindowDays] = useState('')
  const [svcRunning, setSvcRunning] = useState<boolean | null>(null)

  if (!data) return <div className="cx-empty">载入中…</div>
  const cars = data.cars
  const s = data.settings

  const addCar = async () => {
    setBusy(true)
    try {
      const c = await saveCar({ name, kind, initialOdometer: odo.trim() ? Number(odo) : 0, plate })
      setName(''); setOdo(''); setPlate('')
      await reload()
      showToast(`已建档「${c.name}」`)
    } catch (e) { showToast((e as Error).message, true) } finally { setBusy(false) }
  }

  const saveCarEdit = async (id: string) => {
    const prev = cars.find((c) => c.id === id)
    if (!prev) return
    try {
      await saveCar({ name: editName, initialOdometer: editOdo.trim() ? Number(editOdo) : undefined }, prev)
      setEditing(null)
      await reload(); showToast('已保存')
    } catch (e) { showToast((e as Error).message, true) }
  }

  const removeCar = async (id: string, cname: string) => {
    const own = {
      energies: data.energies.filter((e) => e.carId === id).length,
      items: data.items.filter((it) => it.carId === id).length,
      svcs: data.svcs.filter((x) => x.carId === id).length,
      docs: data.docs.filter((d) => d.carId === id).length,
    }
    const total = own.energies + own.items + own.svcs + own.docs
    const detail = total ? `（补能 ${own.energies} / 养护项 ${own.items} / 维保 ${own.svcs} / 证件 ${own.docs}）` : ''
    if (!window.confirm(`删除车辆「${cname}」${detail}？${total ? '\n这些记录将一并删除，不可恢复！' : ''}`)) return
    try {
      const n = await deleteCar(id, true, data)
      await reload(); showToast(`已删除「${cname}」${n ? `及 ${n} 条记录` : ''}`)
    } catch (e) { showToast((e as Error).message, true) }
  }

  const applySettings = async () => {
    try {
      await saveSettings({
        docWarnDays: docWarnDays.trim() ? Number(docWarnDays) : s.docWarnDays,
        itemWatchKm: itemWatchKm.trim() ? Number(itemWatchKm) : s.itemWatchKm,
        itemWatchDays: itemWatchDays.trim() ? Number(itemWatchDays) : s.itemWatchDays,
        costWindowDays: costWindowDays.trim() ? Number(costWindowDays) : s.costWindowDays,
      })
      setDocWarnDays(''); setItemWatchKm(''); setItemWatchDays(''); setCostWindowDays('')
      await reload(); showToast('已保存参数')
    } catch (e) { showToast((e as Error).message, true) }
  }

  const doExport = () => {
    const text = exportAll(data)
    try {
      const blob = new Blob([text], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chexia-export-${core.dayKey(Date.now())}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 3000)
    } catch (_) {
      // Blob 不可用时降级：写入剪贴板
      void navigator.clipboard?.writeText(text).then(() => showToast('导出 JSON 已复制到剪贴板'))
      return
    }
    showToast('已导出 JSON（浏览器下载）')
  }

  const checkSvc = async () => {
    try {
      const st = await serviceStatus(pluginId, SERVICE_ID)
      setSvcRunning(st ? st.running : null)
      showToast(st ? (st.running ? '服务运行中' : `服务未运行${st.lastError ? `：${st.lastError}` : ''}`) : '服务未注册（重装插件或重启应用）')
    } catch (e) { showToast((e as Error).message, true) }
  }
  const startSvc = async () => {
    try {
      await serviceStart(pluginId, SERVICE_ID)
      showToast('已请求启动服务，几秒后心跳可见')
      await reload()
    } catch (e) { showToast((e as Error).message, true) }
  }

  return (
    <div className="cx-root" style={{ display: 'block' }}>
      <style>{css}</style>
      <div className="cx-sec"><i className="cx-bar" />车辆档案</div>
      <div className="cx-card"><div className="cx-card-b">
        {cars.length === 0 && <div className="cx-empty" style={{ padding: 12 }}>还没有车辆。</div>}
        {cars.map((c) => (
          <div className="st-car" key={c.id}>
            {editing === c.id ? (
              <>
                <input className="cx-inp" style={{ width: 110 }} value={editName} onChange={(e) => setEditName(e.target.value)} />
                <input className="cx-inp" style={{ width: 84 }} inputMode="decimal" value={editOdo} onChange={(e) => setEditOdo(e.target.value)} placeholder="建档里程" />
                <button className="cx-btn sm" onClick={() => saveCarEdit(c.id)}>存</button>
                <button className="cx-btn sm ghost" onClick={() => setEditing(null)}>取消</button>
              </>
            ) : (
              <>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b>{c.name}</b>
                  <span className="cx-sub"> {core.CAR_KIND_LABELS[c.kind]}{c.plate ? ` · ${c.plate}` : ''} · 建档 {core.fmtNum(c.initialOdometer)} km</span>
                </span>
                <button className="cx-btn sm ghost" onClick={() => { setEditing(c.id); setEditName(c.name); setEditOdo(String(c.initialOdometer)) }}>改</button>
                <button
                  className="st-del" title="删除车辆"
                  onClick={() => removeCar(c.id, c.name)}
                >✕</button>
              </>
            )}
          </div>
        ))}
        <div className="st-grid" style={{ marginTop: 10 }}>
          <div>
            <label className="cx-lbl">车辆名称</label>
            <input className="cx-inp" placeholder="家里的白SUV" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="cx-lbl">类型</label>
            <select className="cx-sel" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="fuel">燃油</option>
              <option value="ev">纯电</option>
              <option value="phev">插混</option>
            </select>
          </div>
          <div>
            <label className="cx-lbl">建档里程（km）</label>
            <input className="cx-inp" inputMode="decimal" placeholder="45000" value={odo} onChange={(e) => setOdo(e.target.value)} />
          </div>
          <div>
            <label className="cx-lbl">车牌（可空）</label>
            <input className="cx-inp" placeholder="浙A·12345" value={plate} onChange={(e) => setPlate(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 9 }}>
          <button className="cx-btn" onClick={addCar} disabled={busy || !name.trim()}>添加车辆</button>
        </div>
      </div></div>

      <div className="cx-sec"><i className="cx-bar" />提醒与统计参数</div>
      <div className="cx-card"><div className="cx-card-b">
        <div className="st-grid">
          <div>
            <label className="cx-lbl">证件提前提醒（天）</label>
            <input className="cx-inp" inputMode="numeric" placeholder={String(s.docWarnDays)} value={docWarnDays} onChange={(e) => setDocWarnDays(e.target.value)} />
          </div>
          <div>
            <label className="cx-lbl">养护「将到」阈值（km）</label>
            <input className="cx-inp" inputMode="numeric" placeholder={String(s.itemWatchKm)} value={itemWatchKm} onChange={(e) => setItemWatchKm(e.target.value)} />
          </div>
          <div>
            <label className="cx-lbl">养护「留意」窗口（天）</label>
            <input className="cx-inp" inputMode="numeric" placeholder={String(s.itemWatchDays)} value={itemWatchDays} onChange={(e) => setItemWatchDays(e.target.value)} />
          </div>
          <div>
            <label className="cx-lbl">费用透视窗口（天）</label>
            <input className="cx-inp" inputMode="numeric" placeholder={String(s.costWindowDays)} value={costWindowDays} onChange={(e) => setCostWindowDays(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 9 }}>
          <button className="cx-btn" onClick={applySettings}>保存参数</button>
        </div>
      </div></div>

      <div className="cx-sec"><i className="cx-bar" />数据</div>
      <div className="cx-card"><div className="cx-card-b">
        <button className="cx-btn ghost" onClick={doExport}>导出全部数据（JSON）</button>
        <div className="st-note">
          数据全部存于本机 cap.kv（chexia.* 键空间），零外网请求、零账号。导出含车辆/补能/养护项/维保/证件与设置，可在任意端导入查看。
        </div>
      </div></div>

      <div className="cx-sec"><i className="cx-bar" />后台服务</div>
      <div className="cx-card"><div className="cx-card-b">
        <div className="cx-row">
          <span className="cx-grow cx-sub">
            服务每 15 秒重算全家快照（chexia.snapshot），三端面板与 AI 读一个键即得。服务不在线时面板自动本地现算，功能不受影响。
          </span>
        </div>
        <div className="cx-row" style={{ marginTop: 8 }}>
          <button className="cx-btn sm ghost" onClick={checkSvc}>查状态</button>
          <button className="cx-btn sm" onClick={startSvc}>启动服务</button>
          {svcRunning != null && <span className={`cx-tag ${svcRunning ? 'green' : 'yellow'}`}>{svcRunning ? '运行中' : '未运行'}</span>}
          {data.meta?.bridge && <span className="cx-tag">桥 {data.meta.bridge}</span>}
        </div>
      </div></div>
      <div className="st-note" style={{ margin: '0 18px' }}>
        插件 id：{pluginId} · 只做车务记录与提醒，不构成维修/保险建议。
      </div>
    </div>
  )
}
