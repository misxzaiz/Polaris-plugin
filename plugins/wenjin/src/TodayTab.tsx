/**
 * 今日 Tab：状态分布 chips + 跟进到期（点名该催的）+ 近期日程与提醒。
 * 跟进卡片可就地记一条跟进（note 事件），记完即从名单消失。
 */
import { useState } from 'react'
import * as core from '../shared/core.js'
import { saveEvent, type WenData, type WenView } from './model'
import type { Tab } from './Panel'

const STATUS_COLORS: Record<string, string> = {
  wish: '#8B95A7', applied: '#58A6FF', screening: '#79B8FF', written: '#E3B341',
  interview: '#A371F7', offered: '#3FB950', accepted: '#2EA043',
  rejected: '#F85149', withdrawn: '#6E7681',
}

function StatusChips({ data }: { data: WenData }) {
  const p = core.pipeline(data.apps)
  const chips = core.STATUSES.filter((s) => p.counts[s] > 0)
  if (!chips.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(64px,1fr))', gap: 6, padding: '2px 16px 10px' }}>
      {chips.map((s) => (
        <div className="wj-chip" key={s}>
          <b style={{ color: STATUS_COLORS[s] || '#E6EAF2' }}>{p.counts[s]}</b>
          <small>{core.STATUS_LABELS[s]}</small>
        </div>
      ))}
    </div>
  )
}

function DueCard({ data, row, reload, toast }: {
  data: WenData
  row: { app: { id: string; companyName: string; title: string; status: string }; daysSince: number; lastAt: number }
  reload: () => Promise<WenData | null>
  toast: (msg: string, bad?: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!text.trim()) { toast('写点什么再记', true); return }
    setBusy(true)
    try {
      await saveEvent({ type: 'note', detail: text.trim(), at: Date.now() }, null, row.app.id)
      toast('已记跟进')
      setOpen(false)
      setText('')
      await reload()
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="wj-card">
      <div className="wj-card-b">
        <div className="wj-row">
          <div className="wj-grow">
            <b style={{ fontSize: 13 }}>{row.app.companyName} · {row.app.title}</b>
            <div className="wj-sub">
              <span className="wj-tag yellow" style={{ marginRight: 6 }}>已 {row.daysSince} 天无进展</span>
              {core.STATUS_LABELS[row.app.status] || row.app.status}
            </div>
          </div>
          <button className="wj-btn sm" onClick={() => setOpen(!open)}>{open ? '收起' : '记跟进'}</button>
        </div>
        {open ? (
          <div style={{ marginTop: 8 }}>
            <textarea
              className="wj-inp"
              placeholder="跟进内容：催了 HR / 内推人回复了 / 决定先放着（会记进时间线）"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="wj-row" style={{ marginTop: 6, justifyContent: 'flex-end' }}>
              <button className="wj-btn sm ghost" onClick={() => setOpen(false)}>取消</button>
              <button className="wj-btn sm" disabled={busy} onClick={save}>保存</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function TodayTab({ data, view, reload, toast, goTab }: {
  data: WenData
  view: WenView
  reload: () => Promise<WenData | null>
  toast: (msg: string, bad?: boolean) => void
  goTab: (t: Tab) => void
}) {
  const appById = new Map(data.apps.map((a) => [a.id, a]))
  const { schedule, reminders } = view.upcoming
  const best = view.funnelChannel.filter((g) => g.responded > 0)
    .sort((x, y) => y.responded - x.responded)[0]

  return (
    <div className="wj-page">
      <div className="wj-sec">
        <span className="wj-bar" />在途全景
        <span className="wj-hint">{data.apps.filter((a) => !a.archived).length} 条未归档</span>
      </div>
      {view.pipeline.active.length === 0 && data.apps.length === 0 ? (
        <div className="wj-empty">
          台账还是空的。<br />
          去聊天里说「投了 XX 公司的 XX 岗」即可建档，<br />
          或在「投递」页右上角手动添加。
        </div>
      ) : <StatusChips data={data} />}

      <div className="wj-sec">
        <span className="wj-bar" />跟进到期
        <span className="wj-hint">超过 {data.settings.followUpDays} 天无进展就点名</span>
      </div>
      {view.due.length === 0 ? (
        <div className="wj-card"><div className="wj-card-b wj-sub">✅ 暂无到期跟进——所有在投投递近期都有动静。</div></div>
      ) : view.due.slice(0, 10).map((row) => (
        <DueCard key={row.app.id} data={data} row={row} reload={reload} toast={toast} />
      ))}

      {schedule.length || reminders.length ? (
        <>
          <div className="wj-sec">
            <span className="wj-bar" />近期日程
            <span className="wj-hint">面试/笔试 + 到点提醒</span>
          </div>
          <div className="wj-card"><div className="wj-card-b wj-tl">
            {schedule.map((e) => {
              const a = appById.get(e.appId)
              return (
                <div className="wj-tl-item" key={e.id}>
                  <div className="wj-row">
                    <b style={{ fontSize: 12.5 }}>{core.fmtDateTime(core.parseTs(e.at) || 0)}</b>
                    <span className="wj-tag purple">{core.EVENT_LABELS[e.type]}</span>
                  </div>
                  <div className="wj-sub">
                    {a ? `${a.companyName} · ${a.title}` : '(投递已删)'}{e.title ? ` — ${e.title}` : ''}
                    {e.detail ? `；${e.detail.length > 60 ? e.detail.slice(0, 60) + '…' : e.detail}` : ''}
                  </div>
                </div>
              )
            })}
            {reminders.map((e) => {
              const a = appById.get(e.appId)
              return (
                <div className="wj-tl-item" key={e.id}>
                  <div className="wj-row">
                    <b style={{ fontSize: 12.5, color: '#E3B341' }}>⏰ 提醒</b>
                    <span className="wj-tag yellow">{core.fmtDateTime(core.parseTs(e.remindAt) || 0)}</span>
                  </div>
                  <div className="wj-sub">
                    {a ? `${a.companyName} · ${a.title}` : ''}{e.title || e.detail ? ` — ${e.title || e.detail}` : ''}
                  </div>
                </div>
              )
            })}
          </div></div>
        </>
      ) : null}

      {best ? (
        <>
          <div className="wj-sec"><span className="wj-bar" />渠道一句话</div>
          <div className="wj-card"><div className="wj-card-b wj-sub">
            <b style={{ color: '#79B8FF' }}>{best.key}</b>
            ：已投 {best.submitted}、有回音 {best.responded}
            {best.respondedRate ? `（回复率 ${best.respondedRate}）` : '（样本 <5 不出百分比）'}
            {best.interviewed ? `、走到面试 ${best.interviewed}` : ''}
            。<button className="wj-btn sm ghost" style={{ marginLeft: 6 }} onClick={() => goTab('insight')}>看完整漏斗</button>
          </div></div>
        </>
      ) : null}

      {view.offers.length ? (
        <>
          <div className="wj-sec"><span className="wj-bar" />offer 概况</div>
          <div className="wj-card"><div className="wj-card-b wj-sub">
            共 {view.offers.length} 份 offer 档案；当前最优年化
            <b style={{ color: '#3FB950' }}> {view.offers[0].annual.toLocaleString()} 元</b>
            （{view.offers[0].companyName}）。
            <button className="wj-btn sm ghost" style={{ marginLeft: 6 }} onClick={() => goTab('insight')}>逐项对比</button>
          </div></div>
        </>
      ) : null}
    </div>
  )
}
