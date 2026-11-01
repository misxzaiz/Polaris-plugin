/**
 * 车务 Tab：养护项（周期+锚点+倒计时）/ 维保记录（联动养护项锚点）/ 证件（红黄榜）。
 * 三个子区各自带折叠的新建表单；删除一律 window.confirm 确认。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import { saveItem, saveSvc, saveDoc, deleteSvc, deleteDoc, deleteItem } from './model'
import type { TabProps } from './Panel'

const css = `
.sv-fold{background:transparent;border:none;color:#79B8FF;font-size:11px;cursor:pointer;padding:2px 6px}
.sv-form{border-top:1px solid #1c222e;padding-top:9px;margin-top:8px}
.sv-it{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #1c222e;font-size:11.5px;min-width:0}
.sv-it:first-child{border-top:none}
.sv-st{font-size:10px;padding:1px 7px;border-radius:5px;white-space:nowrap;flex-shrink:0}
.sv-st.overdue{background:#3a1d22;color:#FF8A9A;border:1px solid #54262c}
.sv-st.due{background:#332a12;color:#E3B341;border:1px solid #5a4a1e}
.sv-st.watch{background:#16283e;color:#79B8FF;border:1px solid #1f4a74}
.sv-st.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.sv-del{background:transparent;border:none;color:#5C6678;cursor:pointer;font-size:13px;padding:2px 5px;flex-shrink:0}
.sv-del:hover{color:#F85149}
.sv-adv{background:#16283e;border:1px solid #1f4a74;color:#79B8FF;border-radius:6px;font-size:10px;padding:2px 7px;cursor:pointer;flex-shrink:0}
.sv-adv:hover{filter:brightness(1.2)}
.sv-hint2{font-size:10px;color:#5C6678;margin-top:4px;line-height:1.6}
`

type Fold = '' | 'item' | 'svc' | 'doc'

export default function ServiceTab({ data, reload, showToast }: TabProps) {
  const [fold, setFold] = useState<Fold>('')
  const [busy, setBusy] = useState(false)

  // 养护项表单
  const [itCar, setItCar] = useState(''); const [itName, setItName] = useState('')
  const [itKm, setItKm] = useState(''); const [itMonths, setItMonths] = useState('')
  const [itLastOdo, setItLastOdo] = useState(''); const [itLastDate, setItLastDate] = useState('')
  // 维保表单
  const [svCar, setSvCar] = useState(''); const [svType, setSvType] = useState('maintenance')
  const [svDate, setSvDate] = useState(() => core.dayKey(Date.now())); const [svOdo, setSvOdo] = useState('')
  const [svCost, setSvCost] = useState(''); const [svDesc, setSvDesc] = useState('')
  const [svVendor, setSvVendor] = useState(''); const [svItemName, setSvItemName] = useState('')
  // 证件表单
  const [dcCar, setDcCar] = useState(''); const [dcType, setDcType] = useState('交强险')
  const [dcExpiry, setDcExpiry] = useState(''); const [dcRemind, setDcRemind] = useState('')

  const cars = data?.cars || []
  const carName = (id: string) => cars.find((c) => c.id === id)?.name || '个人/未知'

  const itemsProj = useMemo(() => {
    if (!data) return []
    const now = Date.now()
    return data.items.map((it) => {
      const car = data.cars.find((c) => c.id === it.carId) || null
      const p = it.active === false
        ? null
        : core.itemProjection(it, car, data.energies, data.svcs, now, data.settings)
      return { it, car, p }
    }).sort((a, b) => {
      if (!a.p && !b.p) return 0
      if (!a.p) return 1
      if (!b.p) return -1
      const w = { overdue: 0, due: 1, watch: 2, ok: 3 }
      return w[a.p.state] - w[b.p.state]
    })
  }, [data])

  const svcRows = useMemo(() => {
    return [...(data?.svcs || [])].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : (a.date < b.date ? 1 : -1)))
  }, [data])

  const docRows = useMemo(() => {
    if (!data) return []
    return core.docBands(data.docs, data.cars, Date.now(), data.settings)
  }, [data])

  if (!data) return <div className="cx-empty">载入中…</div>
  if (!cars.length) return <div className="cx-empty">先去「设置」添加车辆。</div>

  const submitItem = async () => {
    const carId = itCar || cars[0].id
    const cycle: { kmInterval?: number; monthInterval?: number } = {}
    if (itKm.trim()) cycle.kmInterval = Number(itKm)
    if (itMonths.trim()) cycle.monthInterval = Number(itMonths)
    try {
      await saveItem({ carId, name: itName, cycle, lastOdometer: itLastOdo.trim() ? Number(itLastOdo) : undefined, lastDate: itLastDate || undefined })
      setItName(''); setItKm(''); setItMonths(''); setItLastOdo(''); setItLastDate(''); setFold('')
      await reload(); showToast('已立养护项')
    } catch (e) { showToast((e as Error).message, true) }
  }

  const submitSvc = async () => {
    const car = cars.find((c) => c.id === (svCar || cars[0].id))
    if (!car) return
    setBusy(true)
    try {
      const s = await saveSvc({
        carId: car.id, type: svType, date: svDate,
        odometer: svOdo.trim() ? Number(svOdo) : undefined,
        cost: svCost.trim() ? Number(svCost) : undefined,
        desc: svDesc, vendor: svVendor, itemName: svItemName,
      })
      // 与 MCP 同口径：maintenance + itemName 命中 → 推进锚点
      let anchorMsg = ''
      if (s.type === 'maintenance' && s.itemName) {
        const target = data.items.find((it) => it.carId === car.id && it.name === s.itemName)
        if (target) {
          const patch: Record<string, unknown> = {}
          if (s.odometer != null && (target.lastOdometer === undefined || s.odometer >= target.lastOdometer)) patch.lastOdometer = s.odometer
          if (!target.lastDate || s.date >= target.lastDate) patch.lastDate = s.date
          if (patch.lastOdometer !== undefined || patch.lastDate !== undefined) {
            await saveItem(patch, target)
            anchorMsg = `；已推进「${target.name}」锚点`
          }
        }
      }
      setSvOdo(''); setSvCost(''); setSvDesc(''); setSvItemName(''); setFold('')
      await reload(); showToast(`已记维保${anchorMsg}`)
    } catch (e) { showToast((e as Error).message, true) } finally { setBusy(false) }
  }

  const submitDoc = async () => {
    try {
      await saveDoc({
        carId: dcCar, type: dcType, expiry: dcExpiry,
        remindDays: dcRemind.trim() ? Number(dcRemind) : undefined,
      })
      setDcExpiry(''); setDcRemind(''); setFold('')
      await reload(); showToast('已登记证件')
    } catch (e) { showToast((e as Error).message, true) }
  }

  /** 养护项「做到今天」：立一条 maintenance 维保 + 推进锚点（一键闭环） */
  const advanceItem = async (it: (typeof itemsProj)[number]['it']) => {
    const car = cars.find((c) => c.id === it.carId)
    if (!car) return
    const today = core.dayKey(Date.now())
    const curOdo = core.latestOdometer(
      data.energies.filter((e) => e.carId === car.id),
      data.svcs.filter((s) => s.carId === car.id),
      car,
    )
    if (!window.confirm(`把「${it.name}」记为今天（${today}）已做${curOdo > 0 ? `，里程按当前 ${core.fmtNum(curOdo)} km` : ''}？`)) return
    try {
      await saveSvc({ carId: car.id, type: 'maintenance', date: today, odometer: curOdo > 0 ? curOdo : undefined, desc: `${it.name}（面板快捷打卡）`, itemName: it.name })
      const target = it
      const patch: Record<string, unknown> = { lastDate: today }
      if (curOdo > 0 && (target.lastOdometer === undefined || curOdo >= target.lastOdometer)) patch.lastOdometer = curOdo
      await saveItem(patch, target)
      await reload(); showToast(`「${it.name}」已推进锚点，进入下一周期`)
    } catch (e) { showToast((e as Error).message, true) }
  }

  const stTag = (s: string) => <span className={`sv-st ${s}`}>{({ overdue: '已超期', due: '将到', watch: '留意', ok: '正常' } as Record<string, string>)[s] || s}</span>

  return (
    <div className="cx-root" style={{ display: 'block' }}>
      <style>{css}</style>
      {/* ── 养护项 ── */}
      <div className="cx-sec"><i className="cx-bar" />养护项
        <button className="sv-fold" style={{ marginLeft: 'auto' }} onClick={() => setFold(fold === 'item' ? '' : 'item')}>{fold === 'item' ? '收起' : '+ 新建'}</button>
      </div>
      <div className="cx-card"><div className="cx-card-b">
        {fold === 'item' && (
          <div className="sv-form">
            <div className="cx-row" style={{ gap: 8 }}>
              <div className="cx-grow">
                <label className="cx-lbl">车辆</label>
                <select className="cx-sel" value={itCar || cars[0].id} onChange={(e) => setItCar(e.target.value)}>
                  {cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="cx-grow">
                <label className="cx-lbl">项目名</label>
                <input className="cx-inp" placeholder="机油机滤" value={itName} onChange={(e) => setItName(e.target.value)} />
              </div>
            </div>
            <div className="cx-row" style={{ gap: 8 }}>
              <div className="cx-grow">
                <label className="cx-lbl">里程周期（km，可空）</label>
                <input className="cx-inp" inputMode="numeric" placeholder="5000" value={itKm} onChange={(e) => setItKm(e.target.value)} />
              </div>
              <div className="cx-grow">
                <label className="cx-lbl">时间周期（月，可空）</label>
                <input className="cx-inp" inputMode="numeric" placeholder="6" value={itMonths} onChange={(e) => setItMonths(e.target.value)} />
              </div>
            </div>
            <div className="cx-row" style={{ gap: 8 }}>
              <div className="cx-grow">
                <label className="cx-lbl">上次保养里程（km 周期必填）</label>
                <input className="cx-inp" inputMode="decimal" placeholder="46000" value={itLastOdo} onChange={(e) => setItLastOdo(e.target.value)} />
              </div>
              <div className="cx-grow">
                <label className="cx-lbl">上次保养日期（月周期必填）</label>
                <input className="cx-inp" type="date" value={itLastDate} onChange={(e) => setItLastDate(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 9 }}>
              <button className="cx-btn" onClick={submitItem} disabled={busy}>立养护项</button>
            </div>
            <div className="sv-hint2">双周期同时填 = 哪个先到按哪个提醒。里程周期按日均里程换算天数。</div>
          </div>
        )}
        {itemsProj.length === 0 && <div className="cx-empty" style={{ padding: 14 }}>还没有养护项。建议先立「机油机滤」「空调滤芯」「轮胎换位」。</div>}
        {itemsProj.map(({ it, p }) => (
          <div className="sv-it" key={it.id}>
            <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {carName(it.carId)} · {it.name}
              <span className="cx-sub"> {core.describeItem(it).replace(it.name, '').trim()}</span>
            </span>
            {p && stTag(p.state)}
            <span className="cx-sub" style={{ minWidth: 96, textAlign: 'right' }}>
              {p ? (p.state === 'overdue'
                ? (p.axis === 'time' ? `${p.dueDate} 到期` : `超 ${core.fmtNum(-(p.kmLeft || 0))}km`)
                : (p.axis === 'time' && p.dueDate ? `${p.dueDate}` : p.kmLeft != null ? `剩 ${core.fmtNum(p.kmLeft)}km` : '')) : '已停用'}
            </span>
            {p && <button className="sv-adv" onClick={() => advanceItem(it)}>做到今天</button>}
            <button
              className="sv-del" title="删除养护项"
              onClick={async () => {
                if (!window.confirm(`删除养护项「${it.name}」？历史维保记录保留。`)) return
                try { await deleteItem(it.id); await reload(); showToast('已删除') } catch (e) { showToast((e as Error).message, true) }
              }}
            >✕</button>
          </div>
        ))}
      </div></div>

      {/* ── 维保记录 ── */}
      <div className="cx-sec"><i className="cx-bar" />维保记录
        <button className="sv-fold" style={{ marginLeft: 'auto' }} onClick={() => setFold(fold === 'svc' ? '' : 'svc')}>{fold === 'svc' ? '收起' : '+ 记一笔'}</button>
      </div>
      <div className="cx-card"><div className="cx-card-b">
        {fold === 'svc' && (
          <div className="sv-form">
            <div className="cx-row" style={{ gap: 8 }}>
              <div className="cx-grow">
                <label className="cx-lbl">车辆</label>
                <select className="cx-sel" value={svCar || cars[0].id} onChange={(e) => setSvCar(e.target.value)}>
                  {cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="cx-grow">
                <label className="cx-lbl">类型</label>
                <select className="cx-sel" value={svType} onChange={(e) => setSvType(e.target.value)}>
                  {core.SVC_TYPES.map((t) => <option key={t} value={t}>{core.SVC_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="cx-grow">
                <label className="cx-lbl">日期</label>
                <input className="cx-inp" type="date" value={svDate} onChange={(e) => setSvDate(e.target.value)} />
              </div>
            </div>
            <div className="cx-row" style={{ gap: 8 }}>
              <div className="cx-grow">
                <label className="cx-lbl">里程（可空）</label>
                <input className="cx-inp" inputMode="decimal" value={svOdo} onChange={(e) => setSvOdo(e.target.value)} />
              </div>
              <div className="cx-grow">
                <label className="cx-lbl">费用（元，可空）</label>
                <input className="cx-inp" inputMode="decimal" value={svCost} onChange={(e) => setSvCost(e.target.value)} />
              </div>
              <div className="cx-grow">
                <label className="cx-lbl">商家（可空）</label>
                <input className="cx-inp" value={svVendor} onChange={(e) => setSvVendor(e.target.value)} />
              </div>
            </div>
            <label className="cx-lbl">做了什么</label>
            <input className="cx-inp" placeholder="小保养 换机油机滤" value={svDesc} onChange={(e) => setSvDesc(e.target.value)} />
            <label className="cx-lbl">对应养护项名（类型=保养时填写可自动推进其周期锚点）</label>
            <input className="cx-inp" placeholder="机油机滤" value={svItemName} onChange={(e) => setSvItemName(e.target.value)} />
            <div style={{ marginTop: 9 }}>
              <button className="cx-btn" onClick={submitSvc} disabled={busy}>记维保</button>
            </div>
          </div>
        )}
        {svcRows.length === 0 && <div className="cx-empty" style={{ padding: 14 }}>还没有维保记录。</div>}
        {svcRows.slice(0, 40).map((s) => (
          <div className="sv-it" key={s.id}>
            <span className="cx-sub" style={{ width: 74, flexShrink: 0 }}>{s.date}</span>
            <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {carName(s.carId)} · {s.desc}
              {s.odometer != null && <span className="cx-sub"> {core.fmtNum(s.odometer)}km</span>}
              {s.vendor && <span className="cx-sub"> @{s.vendor}</span>}
            </span>
            {s.cost != null && <span>{core.fmtNum(s.cost)}元</span>}
            <button
              className="sv-del" title="删除这条维保记录"
              onClick={async () => {
                if (!window.confirm(`删除 ${s.date}「${s.desc}」？`)) return
                try { await deleteSvc(s.id); await reload(); showToast('已删除（若曾推进锚点，请手动调整养护项）') } catch (e) { showToast((e as Error).message, true) }
              }}
            >✕</button>
          </div>
        ))}
        {svcRows.length > 40 && <div className="cx-sub" style={{ paddingTop: 6 }}>（仅显示最近 40 条，共 {svcRows.length} 条）</div>}
      </div></div>

      {/* ── 证件 ── */}
      <div className="cx-sec"><i className="cx-bar" />证件 / 保险 / 年检
        <button className="sv-fold" style={{ marginLeft: 'auto' }} onClick={() => setFold(fold === 'doc' ? '' : 'doc')}>{fold === 'doc' ? '收起' : '+ 登记'}</button>
      </div>
      <div className="cx-card"><div className="cx-card-b">
        {fold === 'doc' && (
          <div className="sv-form">
            <div className="cx-row" style={{ gap: 8 }}>
              <div className="cx-grow">
                <label className="cx-lbl">车辆（可选「个人证件」）</label>
                <select className="cx-sel" value={dcCar} onChange={(e) => setDcCar(e.target.value)}>
                  <option value="">个人证件（如驾驶证）</option>
                  {cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="cx-grow">
                <label className="cx-lbl">类型</label>
                <input className="cx-inp" list="cx-doc-types" placeholder="交强险" value={dcType} onChange={(e) => setDcType(e.target.value)} />
                <datalist id="cx-doc-types">{core.DOC_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
              </div>
            </div>
            <div className="cx-row" style={{ gap: 8 }}>
              <div className="cx-grow">
                <label className="cx-lbl">到期日</label>
                <input className="cx-inp" type="date" value={dcExpiry} onChange={(e) => setDcExpiry(e.target.value)} />
              </div>
              <div className="cx-grow">
                <label className="cx-lbl">提前提醒天数（可空）</label>
                <input className="cx-inp" inputMode="numeric" placeholder="30" value={dcRemind} onChange={(e) => setDcRemind(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 9 }}>
              <button className="cx-btn" onClick={submitDoc} disabled={busy}>登记</button>
            </div>
          </div>
        )}
        {docRows.length === 0 && <div className="cx-empty" style={{ padding: 14 }}>还没有登记证件。交强险/年检到期是法定硬触点，建议先登记。</div>}
        {docRows.map((d) => (
          <div className="sv-it" key={d.docId}>
            <span className={`sv-st ${d.band === 'expired' ? 'overdue' : d.band === 'soon' ? 'due' : 'ok'}`}>
              {d.band === 'expired' ? '已过期' : d.band === 'soon' ? `剩 ${d.days} 天` : '正常'}
            </span>
            <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.carName === '个人' ? '' : `${d.carName} · `}{d.type}
            </span>
            <span className="cx-sub">{d.expiry}</span>
            <button
              className="sv-del" title="删除证件"
              onClick={async () => {
                if (!window.confirm(`删除${d.carName === '个人' ? '' : d.carName + '的'}「${d.type}」登记？`)) return
                try { await deleteDoc(d.docId); await reload(); showToast('已删除') } catch (e) { showToast((e as Error).message, true) }
              }}
            >✕</button>
          </div>
        ))}
        <div className="sv-hint2">续保/年检完成后，把到期日改成新日期即可（AI 侧说「交强险续到明年5月1日」也行）。</div>
      </div></div>
    </div>
  )
}
