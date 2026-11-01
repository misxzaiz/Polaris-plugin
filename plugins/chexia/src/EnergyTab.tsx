/**
 * 补能 Tab：加油/充电流水——表单（车/日期/里程/量/金额/是否加满）+ 近期流水列表。
 * 里程表读数是油耗与养护倒计时的生命线（normalizeEnergy 强制校验）。
 * 提交成功后展示重算的期间口径能耗，让「记一笔 → 看到油耗」的闭环立即可见。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import { K, saveEnergy, deleteEnergy } from './model'
import type { TabProps } from './Panel'

const css = `
.en-form{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.en-form .full{grid-column:1/-1}
.en-check{display:flex;align-items:center;gap:6px;font-size:12px;color:#8B95A7;margin-top:8px}
.en-check input{accent-color:#2b6cb0}
.en-rec{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #1c222e;font-size:11.5px;min-width:0}
.en-rec:first-child{border-top:none}
.en-rec .dt{color:#8B95A7;width:74px;flex-shrink:0;font-variant-numeric:tabular-nums}
.en-rec .odo{font-variant-numeric:tabular-nums}
.en-full{font-size:9px;color:#3FB950;border:1px solid #2b4a37;border-radius:4px;padding:0 4px}
.en-part{font-size:9px;color:#D29922;border:1px solid #5a4a1e;border-radius:4px;padding:0 4px}
.en-del{background:transparent;border:none;color:#5C6678;cursor:pointer;font-size:13px;padding:2px 5px;flex-shrink:0}
.en-del:hover{color:#F85149}
.en-cons{margin-top:8px;background:#0d1117;border-radius:9px;padding:8px 10px;font-size:11.5px;line-height:1.8}
`

export default function EnergyTab({ data, reload, showToast, pluginId }: TabProps) {
  const [carId, setCarId] = useState('')
  const [date, setDate] = useState(() => core.dayKey(Date.now()))
  const [odometer, setOdometer] = useState('')
  const [amount, setAmount] = useState('')
  const [cost, setCost] = useState('')
  const [filled, setFilled] = useState(true)
  const [station, setStation] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastCons, setLastCons] = useState<string>('')
  const [filterCar, setFilterCar] = useState('')

  const cars = data?.cars || []
  const effCarId = carId || (cars[0] ? cars[0].id : '')
  const car = cars.find((c) => c.id === effCarId) || null

  const records = useMemo(() => {
    const list = (data?.energies || []).filter((e) => !filterCar || e.carId === filterCar)
    return list.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : (a.date < b.date ? 1 : -1)))
  }, [data, filterCar])

  // 分车统计（本地同源现算：近90天期间口径）
  const stats = useMemo(() => {
    if (!data) return []
    const today = core.dayKey(Date.now())
    const since90 = core.addDaysStr(today, -90)
    return data.cars.map((c) => {
      const own = data.energies.filter((e) => e.carId === c.id)
      const cons = core.periodConsumption(own, c, today, core.addDaysStr(today, -core.CONS_WINDOW_DAYS))
      const total90 = since90
        ? own.filter((e) => core.dayDiff(since90, e.date) >= 0).reduce((n, e) => n + (Number(e.cost) || 0), 0)
        : 0
      return { car: c, cons, total90: core.r2(total90) }
    })
  }, [data])

  if (!data) return <div className="cx-empty">载入中…</div>
  if (!cars.length) {
    return <div className="cx-empty">先去「设置」添加车辆，或对 AI 说「记一下我的车」。</div>
  }

  const submit = async () => {
    if (!car) return
    if (!odometer.trim()) { showToast('里程表读数必填——它是油耗和养护倒计时的生命线', true); return }
    if (!amount.trim() || !(Number(amount) > 0)) { showToast('请填写本次补能量（升或 kWh）', true); return }
    setBusy(true)
    try {
      const e = await saveEnergy({
        carId: car.id, date, odometer: Number(odometer), amount: Number(amount),
        cost: cost.trim() ? Number(cost) : 0, filled, station,
      }, null, car)
      setOdometer(''); setAmount(''); setCost(''); setStation('')
      // 提交后立即可见的闭环：重算该车期间口径
      const own = [...(data.energies.filter((x) => x.carId === car.id).filter((x) => x.id !== e.id)), e]
      const cons = core.periodConsumption(own, car, core.dayKey(Date.now()), core.addDaysStr(core.dayKey(Date.now()), -core.CONS_WINDOW_DAYS))
      setLastCons(cons.ok
        ? `近90天：${cons.per100} ${cons.unit}/100km${cons.estimated ? '（毛估）' : ''}${cons.costPerKm != null ? ` · ${cons.costPerKm} 元/km` : ''}（窗口 ${cons.since}→${cons.until}）`
        : `能耗暂无法出数：${cons.reason}`)
      await reload()
      showToast(`已记补能 ${e.amount}${core.unitOf(car)} / ${e.cost} 元`)
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  const carName = (id: string) => cars.find((c) => c.id === id)?.name || '?'

  return (
    <div className="cx-root" style={{ display: 'block' }}>
      <style>{css}</style>
      <div className="cx-sec"><i className="cx-bar" />记一笔补能<span className="cx-hint">里程表读数必填</span></div>
      <div className="cx-card"><div className="cx-card-b">
        <div className="en-form">
          <div>
            <label className="cx-lbl">车辆</label>
            <select className="cx-sel" value={effCarId} onChange={(e) => setCarId(e.target.value)}>
              {cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="cx-lbl">日期</label>
            <input className="cx-inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="cx-lbl">里程表读数（km）</label>
            <input className="cx-inp" inputMode="decimal" placeholder={`${car ? core.fmtNum(car.initialOdometer) : 0} 以上`} value={odometer} onChange={(e) => setOdometer(e.target.value)} />
          </div>
          <div>
            <label className="cx-lbl">金额（元）</label>
            <input className="cx-inp" inputMode="decimal" placeholder="350" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div>
            <label className="cx-lbl">补能量（{car ? core.unitOf(car) : 'L/kWh'}）</label>
            <input className="cx-inp" inputMode="decimal" placeholder={car?.kind === 'ev' ? '32.5' : '42.3'} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="cx-lbl">加油站/充电站（可空）</label>
            <input className="cx-inp" placeholder="中石化 / 特来电" value={station} onChange={(e) => setStation(e.target.value)} />
          </div>
          <label className="en-check full">
            <input type="checkbox" checked={filled} onChange={(e) => setFilled(e.target.checked)} />
            加满/充满（两次加满之间可精确算油耗；加半箱也能记，期间口径兜底）
          </label>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="cx-btn" onClick={submit} disabled={busy}>{busy ? '记录中…' : '记一笔'}</button>
        </div>
        {lastCons && <div className="en-cons">{lastCons}</div>}
      </div></div>

      <div className="cx-sec"><i className="cx-bar" />分车统计<span className="cx-hint">近90天</span></div>
      <div className="cx-card"><div className="cx-card-b">
        {stats.map(({ car: c, cons, total90 }) => (
          <div key={c.id} style={{ padding: '5px 0', fontSize: 11.5 }}>
            <b>{c.name}</b>
            <span className="cx-sub">
              ：{cons.ok ? `${cons.per100} ${cons.unit}/100km${cons.estimated ? '（毛估）' : ''}` : cons.reason}
              {total90 > 0 ? ` · 补能 ${core.fmtNum(total90)} 元` : ''}
            </span>
          </div>
        ))}
      </div></div>

      <div className="cx-sec"><i className="cx-bar" />补能流水
        <select className="cx-sel" style={{ width: 'auto', marginLeft: 'auto', padding: '3px 6px', fontSize: 11 }} value={filterCar} onChange={(e) => setFilterCar(e.target.value)}>
          <option value="">全部车辆</option>
          {cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="cx-card"><div className="cx-card-b">
        {records.length === 0 && <div className="cx-empty" style={{ padding: 14 }}>该范围还没有补能记录。</div>}
        {records.slice(0, 60).map((e) => (
          <div className="en-rec" key={e.id}>
            <span className="dt">{e.date}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{carName(e.carId)}</span>
            <span className="odo">{core.fmtNum(e.odometer)}km</span>
            <span>{e.amount}{e.kind === 'charge' ? 'kWh' : 'L'}</span>
            <span>{e.cost}元</span>
            {e.filled ? <span className="en-full">满</span> : <span className="en-part">未满</span>}
            {e.station && <span className="cx-sub" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.station}</span>}
            <button
              className="en-del" title="删除这条记录"
              onClick={async () => {
                if (!window.confirm(`删除 ${e.date} 这条补能记录？`)) return
                try { await deleteEnergy(e.id); await reload(); showToast('已删除') } catch (err) { showToast((err as Error).message, true) }
              }}
            >✕</button>
          </div>
        ))}
        {records.length > 60 && <div className="cx-sub" style={{ paddingTop: 6 }}>（仅显示最近 60 条，共 {records.length} 条）</div>}
      </div></div>
    </div>
  )
}
