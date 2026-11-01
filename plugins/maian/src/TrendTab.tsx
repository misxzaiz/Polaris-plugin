/**
 * 趋势 Tab：成员×指标 → 区间统计卡 + 手搓 SVG 折线（近 30 天，零依赖）+
 * 就诊小结生成（core.buildSummary → 复制给医生）。图表与统计口径全部出自 core。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import type { TabProps } from './PanelTypes'
import type { VitalRecord } from './model'
import { BandTag, bandOfRecord, memberOf } from './ui'

const SVG_W = 480
const SVG_H = 150
const PAD_L = 30
const PAD_R = 8
const PAD_T = 10
const PAD_B = 18

export default function TrendTab({ data, showToast }: TabProps) {
  const [profileId, setProfileId] = useState('')
  const [kind, setKind] = useState('bp')
  const [from, setFrom] = useState(core.dayKey(Date.now() - 29 * core.DAY_MS))
  const [to, setTo] = useState(core.dayKey(Date.now()))
  const [summary, setSummary] = useState('')

  const members = data?.members || []
  const activeId = profileId || members[0]?.id || ''
  const member = members.find((m) => m.id === activeId)

  const range = useMemo(() => core.rangeDays(from, to), [from, to])
  const records: VitalRecord[] = useMemo(() => {
    if (!data || !member || !range) return []
    const t0 = core.parseDayKey(from)!
    const t1 = core.parseDayKey(to)! + core.DAY_MS
    return data.records.filter((r) => r.profileId === member.id && r.kind === kind && r.ts >= t0 && r.ts < t1)
  }, [data, member, kind, from, to, range])

  const stats = useMemo(() => core.statsFor(records, member?.heightCm ? () => member.heightCm : undefined), [records, member])
  const points = useMemo(() => core.trendPoints(records, member?.heightCm ? () => member.heightCm : undefined), [records, member])

  function genSummary() {
    if (!data || !member) { showToast('先建档成员', true); return }
    if (!range) { showToast('日期区间无效（跨度 ≤400 天）', true); return }
    const md = core.buildSummary({ member, from, to, records: data.records.filter((r) => r.profileId === member.id) })
    setSummary(md)
  }

  async function copySummary() {
    if (!summary) return
    try {
      await navigator.clipboard.writeText(summary)
      showToast('小结已复制，可直接粘贴给医生')
    } catch (_) {
      showToast('复制失败——长按下方文本手动复制', true, true)
    }
  }

  if (!data) return <div className="mn-empty">载入中…</div>
  if (!members.length) return <div className="mn-empty">先在「记录」或「设置」里建成员，这里才会有趋势。</div>

  return (
    <div>
      <div className="mn-card"><div className="mn-card-b">
        <span className="mn-lbl" style={{ marginTop: 0 }}>成员</span>
        <div className="mn-chips">
          {members.map((m) => (
            <button key={m.id} className={`mn-chip ${activeId === m.id ? 'on' : ''}`} onClick={() => setProfileId(m.id)}>{m.name}</button>
          ))}
        </div>
        <span className="mn-lbl">指标</span>
        <div className="mn-chips">
          {core.KINDS.map((k) => {
            const n = data.records.filter((r) => r.profileId === activeId && r.kind === k).length
            return (
              <button key={k} className={`mn-chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
                {core.KIND_META[k].label}{n ? ` ${n}` : ''}
              </button>
            )
          })}
        </div>
        <div className="mn-row" style={{ marginTop: 8 }}>
          <input className="mn-inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mn-sub">至</span>
          <input className="mn-inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {!range && <div className="mn-err">日期区间无效（须 YYYY-MM-DD 且跨度 ≤400 天）</div>}
      </div></div>

      {range && (
        <>
          <div className="mn-sec"><i className="mn-bar" />区间统计<span className="mn-hint">{from.slice(5)} ~ {to.slice(5)} · {stats.count} 条</span></div>
          <div className="mn-card"><div className="mn-card-b">
            {stats.count === 0 ? (
              <div className="mn-empty" style={{ padding: 14 }}>该区间没有{core.KIND_META[kind].label}记录。</div>
            ) : (
              <>
                <div className="mn-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(stats.fields).map(([k, f]) => (
                    <span key={k} className="mn-tag blue">{k === 'sys' ? '收缩压' : k === 'dia' ? '舒张压' : k === 'pulse' ? '心率' : k === 'mmol' ? '血糖' : k === 'kg' ? '体重' : '体温'} 均 {f.avg}（{f.min}~{f.max}）</span>
                  ))}
                </div>
                <div className="mn-row" style={{ marginTop: 8, gap: 6 }}>
                  <BandTag level="green" label={`绿 ${stats.bands.green}`} />
                  <BandTag level="yellow" label={`黄 ${stats.bands.yellow}`} />
                  <BandTag level="red" label={`红 ${stats.bands.red}`} />
                  <BandTag level="urgent" label={`急 ${stats.bands.urgent}`} />
                  <span className="mn-hint">通用参考区间，请遵医嘱</span>
                </div>
                {stats.latest && (
                  <div className="mn-sub" style={{ marginTop: 8 }}>
                    最近一次：{core.fmtDT(stats.latest.ts)} {core.fmtValue(stats.latest)}（{bandOfRecord(stats.latest, member).text}）
                  </div>
                )}
              </>
            )}
          </div></div>

          {points.length >= 2 && (
            <>
              <div className="mn-sec"><i className="mn-bar" />趋势<span className="mn-hint">{kind === 'bp' ? '上线=收缩 下线=舒张' : core.KIND_META[kind].unit}</span></div>
              <div className="mn-card"><div className="mn-card-b" style={{ overflowX: 'auto' }}>
                <TrendChart kind={kind} points={points} />
              </div></div>
            </>
          )}

          <div className="mn-sec"><i className="mn-bar" />就诊小结</div>
          <div className="mn-card"><div className="mn-card-b">
            <div className="mn-sub" style={{ marginBottom: 8 }}>把「{from.slice(5)} ~ {to.slice(5)}」的记录整理成一张可带给医生的小结（统计+分带+逐条明细）。</div>
            <button className="mn-btn" onClick={genSummary}>生成小结</button>
            {summary && (
              <div style={{ marginTop: 10 }}>
                <div className="mn-row">
                  <button className="mn-btn ok sm" onClick={copySummary}>复制</button>
                  <button className="mn-btn ghost sm" onClick={() => setSummary('')}>收起</button>
                </div>
                <textarea className="mn-inp" readOnly value={summary} rows={14} style={{ marginTop: 8, font: '11px/1.6 ui-monospace,Consolas,monospace' }} onFocus={(e) => e.currentTarget.select()} />
              </div>
            )}
          </div></div>
        </>
      )}
    </div>
  )
}

/** 手搓 SVG 折线（零依赖）：x=时间线性，y=自适应域；点色=分带 */
function TrendChart({ kind, points }: { kind: string; points: ReturnType<typeof core.trendPoints> }) {
  const vals: number[] = []
  for (const p of points) {
    if (kind === 'bp') { vals.push(p.sys!, p.dia!) } else vals.push(p.value!)
  }
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null
  if (hi - lo < 1) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.12
  lo -= pad; hi += pad
  const t0 = points[0].ts
  const t1 = points[points.length - 1].ts
  const span = Math.max(t1 - t0, 1)
  const x = (ts: number) => PAD_L + ((ts - t0) / span) * (SVG_W - PAD_L - PAD_R)
  const y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * (SVG_H - PAD_T - PAD_B)
  const path = (getV: (p: (typeof points)[number]) => number) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.ts).toFixed(1)},${y(getV(p)).toFixed(1)}`).join(' ')
  const dotColor: Record<string, string> = { green: '#3FB950', yellow: '#E3B341', red: '#F85149', urgent: '#FF5A6E', none: '#8B95A7' }
  const grid = [0, 0.5, 1].map((f) => {
    const v = hi - f * (hi - lo)
    return { y: PAD_T + f * (SVG_H - PAD_T - PAD_B), label: String(Math.round(v * 10) / 10) }
  })
  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="体征趋势图">
      {grid.map((g, i) => (
        <g key={i}>
          <line x1={PAD_L} y1={g.y} x2={SVG_W - PAD_R} y2={g.y} stroke="#242C3A" strokeWidth="1" />
          <text x={PAD_L - 4} y={g.y + 3} fill="#5C6678" fontSize="8" textAnchor="end">{g.label}</text>
        </g>
      ))}
      {kind === 'bp' ? (
        <>
          <path d={path((p) => p.sys!)} fill="none" stroke="#F85149" strokeWidth="1.6" />
          <path d={path((p) => p.dia!)} fill="none" stroke="#58A6FF" strokeWidth="1.6" />
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={x(p.ts)} cy={y(p.sys!)} r="2.6" fill={dotColor[p.level] || '#8B95A7'} />
              <circle cx={x(p.ts)} cy={y(p.dia!)} r="2.6" fill={dotColor[p.level] || '#8B95A7'} />
            </g>
          ))}
        </>
      ) : (
        <>
          <path d={path((p) => p.value!)} fill="none" stroke="#79B8FF" strokeWidth="1.6" />
          {points.map((p, i) => (
            <circle key={i} cx={x(p.ts)} cy={y(p.value!)} r="2.6" fill={dotColor[p.level] || '#8B95A7'} />
          ))}
        </>
      )}
      <text x={PAD_L} y={SVG_H - 4} fill="#5C6678" fontSize="8">{core.fmtDT(t0).slice(5)}</text>
      <text x={SVG_W - PAD_R} y={SVG_H - 4} fill="#5C6678" fontSize="8" textAnchor="end">{core.fmtDT(t1).slice(5)}</text>
    </svg>
  )
}
