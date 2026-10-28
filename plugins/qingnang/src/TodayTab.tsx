/**
 * 今日 Tab：日期导航（±7 天）+ 应服横幅（今日 now/overdue）+ 按成员分组药单 +
 * 一键打卡（已服/跳过/撤销）+ prn 需要时用药快捷记账。
 * 状态机口径与三端一致：全部来自 shared/core.todayPlan（本地重算，不依赖服务）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/core'
import { markLog } from './model'
import type { TabProps } from './PanelTypes'

const DAY = 86400000

function fmtDate(d: string): string {
  const ts = core.parseDayKey(d)
  if (ts == null) return d
  const dt = new Date(ts)
  const today = core.dayKey(Date.now())
  if (d === today) return '今天'
  if (d === core.dayKey(Date.now() + DAY)) return '明天'
  if (d === core.dayKey(Date.now() - DAY)) return '昨天'
  return `${dt.getMonth() + 1}月${dt.getDate()}日 周${core.WD_CN[dt.getDay()]}`
}

export default function TodayTab({ data, reload, showToast, onSendToChat }: TabProps) {
  const [viewDate, setViewDate] = useState(() => core.dayKey(Date.now()))
  const [busy, setBusy] = useState('')
  const today = core.dayKey(Date.now())
  const isToday = viewDate === today

  const plan = useMemo(() => {
    if (!data) return []
    return core.todayPlan({
      profiles: data.profiles, meds: data.meds, regimens: data.regimens,
      logs: data.logs, settings: data.settings,
    }, viewDate, Date.now())
  }, [data, viewDate])

  const bannerItems = useMemo(() => {
    if (!data || !isToday) return []
    // 横幅口径：本地 todayPlan 的 now/overdue（比服务投影更即时，打卡后立即消失）
    const out: { occKey: string; label: string; state: string }[] = []
    for (const g of plan) {
      for (const it of g.items) {
        if (it.state === 'now' || it.state === 'overdue') {
          out.push({ occKey: it.occKey, label: `${g.profile.name} · ${it.time} ${it.medName} ${it.amount}${it.unit}`, state: it.state })
        }
      }
    }
    return out
  }, [data, plan, isToday])

  const prnRegimens = useMemo(() => {
    if (!data) return []
    return data.regimens.filter((r) => r.active !== false && r.freq.type === 'prn')
  }, [data])

  async function log(regId: string, date: string, time: string, status: 'taken' | 'skip' | 'none', amount?: number) {
    if (!data) return
    const reg = data.regimens.find((r) => r.id === regId)
    if (!reg) { showToast('方案不存在（可能已删除）', true); return }
    setBusy(regId + date + time)
    try {
      await markLog(reg, date, time, status, amount)
      await reload()
      if (status === 'taken') showToast('已记录。库存快照几秒内自动更新')
      else if (status === 'skip') showToast('已记跳过')
      else showToast('已撤销')
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy('')
    }
  }

  if (!data) return <div className="qn-empty">载入中…</div>

  if (!data.profiles.length) {
    return (
      <div>
        <div className="qn-card"><div className="qn-card-b qn-empty">
          先建一个家庭成员（自己、家人、甚至宠物都行）<br />
          然后「方案」页给 TA 排上用药计划，AI 也能一句话帮你建好。
          {onSendToChat && (
            <div style={{ marginTop: 12 }}>
              <button className="qn-btn" onClick={() => onSendToChat('帮我建一个家庭成员档案：我自己。然后我会告诉你用药计划。')}>让 AI 帮我建</button>
            </div>
          )}
        </div></div>
      </div>
    )
  }

  const anyItems = plan.some((g) => g.items.length)
  const outOfWindow = Math.abs(core.dayDiff(viewDate, today)) > 7

  return (
    <div>
      {/* 日期导航 */}
      <div className="qn-sec">
        <span className="qn-bar" />
        {fmtDate(viewDate)}
        <div className="qn-hint qn-row" style={{ gap: 4 }}>
          <button className="qn-btn ghost sm" onClick={() => setViewDate(core.dayKey(core.parseDayKey(viewDate)! - DAY))}>‹ 前一天</button>
          {!isToday && <button className="qn-btn ghost sm" onClick={() => setViewDate(today)}>回到今天</button>}
          {core.dayDiff(viewDate, today) < 0 && <button className="qn-btn ghost sm" onClick={() => setViewDate(core.dayKey(core.parseDayKey(viewDate)! + DAY))}>后一天 ›</button>}
        </div>
      </div>
      {outOfWindow && <div className="qn-err">超出近 8 天记录窗口：更早的打卡状态可能不完整（补记请让 AI 用 MCP 工具）。</div>}

      {/* 应服横幅 */}
      {bannerItems.length > 0 && (
        <div className="qn-card" style={{ borderColor: '#54262c' }}>
          <div className="qn-card-b">
            {bannerItems.map((b) => (
              <div key={b.occKey} className="qn-row" style={{ padding: '5px 0' }}>
                <span className="qn-tag red">{b.state === 'now' ? '现在该吃' : '过点未服'}</span>
                <span className="qn-grow" style={{ fontSize: 12.5 }}>{b.label}</span>
                <button className="qn-btn ok sm" disabled={!!busy} onClick={() => { const p = core.parseOccKey(b.occKey); if (p) log(p.regId, p.date, p.time, 'taken') }}>已服</button>
                <button className="qn-btn ghost sm" disabled={!!busy} onClick={() => { const p = core.parseOccKey(b.occKey); if (p) log(p.regId, p.date, p.time, 'skip') }}>跳过</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 各成员药单 */}
      {plan.map((g) => {
        const c = g.counts
        const summary = g.items.length
          ? `✅${c.done} ⏭${c.skip} 🟡${c.now} 🔴${c.overdue} ⏳${c.upcoming}`
          : ''
        return (
          <div key={g.profile.id}>
            <div className="qn-sec">
              <span className="qn-bar" style={{ background: g.profile.kind === 'pet' ? '#C77B3F' : undefined }} />
              {g.profile.name}{g.profile.kind === 'pet' ? ' 🐾' : ''}
              <span className="qn-hint">{summary}</span>
            </div>
            <div className="qn-card">
              {!g.items.length && <div className="qn-card-b qn-sub" style={{ padding: '10px 13px' }}>今天没有排期用药</div>}
              {g.items.map((it) => (
                <div key={it.occKey} className="qn-row" style={{ padding: '8px 13px', borderBottom: '1px solid #1d2330' }}>
                  <span style={{ fontSize: 12, color: '#8B95A7', width: 42, flexShrink: 0 }}>{it.time}</span>
                  <span className="qn-grow" style={{ fontSize: 12.5 }}>
                    {it.medName} <span style={{ color: '#8B95A7' }}>{it.amount}{it.unit}</span>
                    {it.note && <div className="qn-sub">{it.note}</div>}
                  </span>
                  {it.state === 'done' && <span className="qn-tag green">已服</span>}
                  {it.state === 'skip' && <span className="qn-tag">已跳过</span>}
                  {it.state === 'now' && <span className="qn-tag yellow">现在</span>}
                  {it.state === 'overdue' && <span className="qn-tag red">过点</span>}
                  {it.state === 'upcoming' && <span className="qn-tag">未到点</span>}
                  {it.state === 'done' || it.state === 'skip' ? (
                    <button className="qn-btn ghost sm" disabled={!!busy} onClick={() => log(it.occKey.split('|')[0], viewDate, it.time, 'none')}>撤销</button>
                  ) : (
                    <>
                      <button className="qn-btn ok sm" disabled={!!busy} onClick={() => log(it.occKey.split('|')[0], viewDate, it.time, 'taken')}>已服</button>
                      <button className="qn-btn ghost sm" disabled={!!busy} onClick={() => log(it.occKey.split('|')[0], viewDate, it.time, 'skip')}>跳过</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {!anyItems && (
        <div className="qn-card"><div className="qn-card-b qn-empty">
          今天全家都没有排期用药。<br />去「方案」页排一个，或让 AI 一句话搞定。
        </div></div>
      )}

      {/* prn 需要时用药 */}
      {prnRegimens.length > 0 && (
        <div>
          <div className="qn-sec"><span className="qn-bar" style={{ background: '#8B95A7' }} />需要时用药（按需记一笔）</div>
          <div className="qn-card"><div className="qn-card-b qn-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {prnRegimens.map((r) => {
              const med = data.meds.find((m) => m.id === r.medId)
              const prof = data.profiles.find((p) => p.id === r.profileId)
              const label = `${prof ? prof.name : '?'}·${med ? med.name : '?'} ${r.dose}${med ? med.unit : ''}`
              const t = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
              return (
                <button key={r.id} className="qn-btn ghost sm" disabled={!!busy}
                  onClick={() => log(r.id, today, t, 'taken')}
                  title="记录一次实际服用（时刻=现在）">
                  {label}
                </button>
              )
            })}
          </div></div>
        </div>
      )}
    </div>
  )
}
