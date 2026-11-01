/**
 * 概览 Tab：全家车辆卡片（里程/日均/能耗/元每公里 + 养护进度 + 证件红黄）+ 个人证件段。
 * 数据来自 FamilySnap（服务端快照或本地同源现算）——本 Tab 不做写操作。
 */
import * as core from '../shared/core'
import { fmtNum } from '../shared/core'
import type { TabProps } from './Panel'
import type { CarSnap, DocBand } from '../shared/core'

const css = `
.ov-car{padding:11px 13px}
.ov-head{display:flex;align-items:center;gap:8px}
.ov-name{font-weight:700;font-size:13.5px}
.ov-kind{font-size:10px;color:#8B95A7;background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 6px}
.ov-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0 8px}
.ov-cell{background:#0d1117;border-radius:9px;padding:7px 6px;text-align:center}
.ov-cell b{display:block;font-size:13px;font-variant-numeric:tabular-nums}
.ov-cell small{font-size:9.5px;color:#8B95A7}
.ov-item{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #1c222e;font-size:11.5px}
.ov-item:first-of-type{border-top:none}
.ov-item .nm{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ov-doc{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #1c222e;font-size:11.5px}
.ov-doc:first-of-type{border-top:none}
.ov-state{font-size:10px;padding:1px 7px;border-radius:5px;white-space:nowrap}
.ov-state.overdue,.ov-state.expired{background:#3a1d22;color:#FF8A9A;border:1px solid #54262c}
.ov-state.due,.ov-state.soon{background:#332a12;color:#E3B341;border:1px solid #5a4a1e}
.ov-state.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.ov-alert{margin:0 16px 10px;background:#332a12;border:1px solid #5a4a1e;border-radius:11px;padding:9px 12px;font-size:11.5px;color:#E3B341;line-height:1.7}
.ov-alert.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
`

function bandCls(s: string): string {
  return s === 'overdue' || s === 'expired' ? s : s === 'due' || s === 'soon' ? s : 'ok'
}
function stateText(s: string): string {
  return { overdue: '已超期', due: '将到', watch: '留意', ok: '正常', expired: '已过期', soon: '临近' }[s] || s
}
function itemDueText(p: { state: string; axis: string | null; kmLeft?: number; dueKm?: number; dueDate?: string; daysLeftByKm?: number | null; daysLeftByTime?: number }): string {
  if (p.state === 'overdue') {
    if (p.axis === 'time') return `已于 ${p.dueDate} 到期`
    return `已超 ${fmtNum(-(p.kmLeft || 0))} km`
  }
  if (p.axis === 'time' && p.dueDate) return `${p.dueDate} 到期${p.daysLeftByTime != null ? `（${Math.abs(p.daysLeftByTime)} 天${p.daysLeftByTime <= 0 ? '前' : '后'}）` : ''}`
  const km = p.kmLeft != null ? `剩 ${fmtNum(p.kmLeft)} km` : ''
  const days = p.daysLeftByKm != null ? `（约 ${p.daysLeftByKm} 天）` : ''
  return `${km}${days}`
}
function docRow(d: DocBand, carLabel: boolean) {
  const when = d.days < 0 ? `${-d.days} 天前已过期` : `${d.days} 天后到期`
  return (
    <div className="ov-doc" key={d.docId}>
      <span className={`ov-state ${bandCls(d.band)}`}>{stateText(d.band)}</span>
      <span className="ov-item nm" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {carLabel && d.carName !== '个人' ? `${d.carName} · ` : ''}{d.type}
      </span>
      <span className="cx-sub">{d.expiry} · {when}</span>
    </div>
  )
}

export default function OverviewTab({ data, snap }: TabProps & { snap: import('../shared/core').FamilySnap | null }) {
  if (!data) return <div className="cx-empty">载入中…</div>
  if (!data.cars.length) {
    return (
      <div className="cx-empty">
        还没有车辆档案。<br />
        去「设置」添加车辆，或直接对 AI 说：<br />
        <span style={{ color: '#79B8FF' }}>「记一下我的车：白SUV，油车，现在4万5千公里」</span><br />
        之后每次加完油报一句「加油350块42.3升，里程45230」就能自动算油耗。
      </div>
    )
  }
  const snapOf = (carId: string): CarSnap | undefined => snap?.cars.find((c) => c.carId === carId)
  const urgentDocs: DocBand[] = snap
    ? [...snap.cars.flatMap((c) => c.docsDue), ...snap.personalDocs].filter((d) => d.band !== 'ok')
    : []
  const redDocs = urgentDocs.filter((d) => d.band === 'expired')
  const yellowDocs = urgentDocs.filter((d) => d.band === 'soon')

  return (
    <div className="cx-root" style={{ display: 'block' }}>
      <style>{css}</style>
      {redDocs.length > 0 && (
        <div className="ov-alert red">🔴 {redDocs.length} 项证件已过期：{redDocs.map((d) => `${d.carName === '个人' ? '' : d.carName + '·'}${d.type}`).join('、')}——请尽快处理</div>
      )}
      {yellowDocs.length > 0 && (
        <div className="ov-alert">🟡 {yellowDocs.length} 项证件临近到期：{yellowDocs.map((d) => `${d.carName === '个人' ? '' : d.carName + '·'}${d.type} ${d.expiry}`).join('、')}</div>
      )}
      {snap?.cars.map((s) => {
        const car = data.cars.find((c) => c.id === s.carId)
        const cons = s.consumption
        return (
          <div className="cx-card" key={s.carId}>
            <div className="ov-car">
              <div className="ov-head">
                <span className="ov-name">{s.name}</span>
                <span className="ov-kind">{core.CAR_KIND_LABELS[s.kind] || s.kind}{s.plate ? ` · ${s.plate}` : ''}</span>
              </div>
              <div className="ov-grid">
                <div className="ov-cell"><b>{fmtNum(s.odometer)}<small>km</small></b><small>里程表</small></div>
                <div className="ov-cell"><b>{s.kmPerDay != null ? fmtNum(s.kmPerDay) : '—'}<small>km/天</small></b><small>日均里程</small></div>
                <div className="ov-cell"><b>{cons ? `${cons.per100}` : '—'}<small>{cons ? `${cons.unit}/100km` : ''}</small></b><small>期间能耗{cons?.estimated ? '*' : ''}</small></div>
                <div className="ov-cell"><b>{cons?.costPerKm != null ? `${cons.costPerKm}` : s.cost.costPerKm != null ? `${s.cost.costPerKm}` : '—'}<small>元/km</small></b><small>每公里成本</small></div>
              </div>
              {s.items.length > 0 && s.items.map((it) => {
                const p = it.projection
                const frac = p.kmLeft != null && p.dueKm != null && p.dueKm > 0
                  ? Math.max(0, Math.min(1, 1 - (p.kmLeft / (p.dueKm - (car ? car.initialOdometer : 0) || 1))))
                  : (p.state === 'overdue' ? 1 : 0)
                const color = p.state === 'overdue' ? '#F85149' : p.state === 'due' ? '#D29922' : p.state === 'watch' ? '#58A6FF' : '#3FB950'
                return (
                  <div className="ov-item" key={it.itemId}>
                    <span className="nm">{it.name}</span>
                    <div className="cx-prog" style={{ width: 90, flexShrink: 0 }}>
                      <i style={{ width: `${Math.round(frac * 100)}%`, background: color }} />
                    </div>
                    <span className={`ov-state ${bandCls(p.state)}`}>{stateText(p.state)}</span>
                    <span className="cx-sub" style={{ minWidth: 86, textAlign: 'right' }}>{itemDueText(p)}</span>
                  </div>
                )
              })}
              {s.items.length === 0 && <div className="cx-sub" style={{ paddingTop: 6 }}>未登记养护项——「车务」页可立机油/滤芯等周期项</div>}
              {s.docsDue.length > 0 && s.docsDue.map((d) => docRow(d, false))}
            </div>
          </div>
        )
      })}
      {snap && snap.personalDocs.length > 0 && (
        <div className="cx-card">
          <div className="cx-sec"><i className="cx-bar" />个人证件</div>
          <div className="cx-card-b">
            {snap.personalDocs.map((d) => docRow(d, false))}
          </div>
        </div>
      )}
      <div className="cx-sub" style={{ margin: '2px 18px 0', color: '#5C6678' }}>
        *期间能耗 = 近90天补能量 ÷ 里程差（不要求加满；尚无两次加满时为毛估）。元/km 与能耗同窗口。
      </div>
    </div>
  )
}
