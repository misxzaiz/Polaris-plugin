/**
 * 设置 Tab：轮询/颜色习惯/指数条设置 + 服务管理 + 数据源说明
 */
import { useState } from 'react'
import {
  listServiceStatus, normalizeCode, saveSettings, serviceAction,
  timeAgo, type QsSettings, type ServiceStatus, type Snapshot,
} from './model'

export default function SettingsTab({ snap, reload, showToast, pluginId }: {
  snap: Snapshot | null
  reload: () => Promise<void>
  showToast: (t: string, bad?: boolean) => void
  pluginId: string
}) {
  const [pollSec, setPollSec] = useState(String(snap?.settings.pollSec ?? 20))
  const [offHours, setOffHours] = useState(String(snap?.settings.offHoursPollSec ?? 300))
  const [redUp, setRedUp] = useState(snap?.settings.redUp ?? true)
  const [indexes, setIndexes] = useState((snap?.settings.indexes ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const [svc, setSvc] = useState<ServiceStatus[] | null>(null)
  const [svcBusy, setSvcBusy] = useState(false)

  async function save() {
    const ps = Number(pollSec)
    const oh = Number(offHours)
    if (!Number.isFinite(ps) || ps < 10 || ps > 300) {
      showToast('盘中轮询间隔需在 10–300 秒', true)
      return
    }
    if (!Number.isFinite(oh) || oh < 60 || oh > 3600) {
      showToast('盘外轮询间隔需在 60–3600 秒', true)
      return
    }
    const idxList: string[] = []
    for (const part of indexes.split(/[,，;；\s]+/).filter(Boolean)) {
      const r = normalizeCode(part)
      if (!r.id) {
        showToast(`指数条设置有误：${r.error}`, true)
        return
      }
      if (!idxList.includes(r.id)) idxList.push(r.id)
    }
    if (idxList.length > 8) {
      showToast('指数条最多 8 个', true)
      return
    }
    setSaving(true)
    try {
      const s: QsSettings = { pollSec: Math.floor(ps), offHoursPollSec: Math.floor(oh), redUp, indexes: idxList }
      await saveSettings(s)
      await reload()
      showToast('设置已保存（服务将在 5 秒内生效）')
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setSaving(false)
    }
  }

  async function loadSvc() {
    try {
      const list = await listServiceStatus()
      setSvc(list.filter((s) => s.pluginId === pluginId))
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }
  void loadSvc // 惰性：首次渲染不查，点按钮再查

  async function svcAction(action: 'start' | 'stop' | 'restart') {
    setSvcBusy(true)
    try {
      await serviceAction(action, pluginId, 'quotes-service')
      showToast(`已${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}服务`)
      setTimeout(() => { void loadSvc(); void reload() }, 1500)
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setSvcBusy(false)
    }
  }

  const meta = snap?.meta
  const mySvc = svc?.find((s) => s.pluginId === pluginId)

  return (
    <div>
      <div className="qs-sec"><span className="qs-bar" />轮询与显示</div>
      <div className="qs-card">
        <div style={{ padding: '10px 13px' }}>
          <label className="qs-lbl">盘中轮询间隔（秒，10–300；默认 20）</label>
          <input className="qs-inp sm" value={pollSec} onChange={(e) => setPollSec(e.target.value)} inputMode="numeric" />
          <label className="qs-lbl">盘外轮询间隔（秒，60–3600；默认 300）</label>
          <input className="qs-inp sm" value={offHours} onChange={(e) => setOffHours(e.target.value)} inputMode="numeric" />
          <label className="qs-lbl" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={redUp} onChange={(e) => setRedUp(e.target.checked)} />
            红涨绿跌（A 股习惯；取消则绿涨红跌，港美习惯）
          </label>
          <label className="qs-lbl">指数条（逗号分隔，最多 8 个；指数代码需带 sh/sz 前缀）</label>
          <input className="qs-inp" value={indexes} onChange={(e) => setIndexes(e.target.value)} placeholder="sh000001, sz399001, sz399006" />
          <div className="qs-formrow">
            <button className="qs-btn" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存设置'}</button>
          </div>
        </div>
      </div>

      <div className="qs-sec"><span className="qs-bar" />后台服务</div>
      <div className="qs-card">
        <div style={{ padding: '10px 13px' }}>
          <div className="qs-sub">
            抓取由后台服务原生执行（面板/AI 不直连外网）。服务未运行时行情不会更新。
          </div>
          {mySvc && (
            <div className="qs-sub" style={{ marginTop: 4 }}>
              状态 <b style={{ color: mySvc.state === 'running' ? '#3FB950' : '#D29922' }}>{mySvc.state}</b>
              {mySvc.pid ? ` · pid ${mySvc.pid}` : ''}
              {mySvc.uptime ? ` · 已运行 ${Math.floor(mySvc.uptime / 60)} 分钟` : ''}
              {mySvc.restartCount ? ` · 重启 ${mySvc.restartCount} 次` : ''}
              {mySvc.lastError ? ` · ${mySvc.lastError}` : ''}
            </div>
          )}
          {meta && (
            <div className="qs-sub" style={{ marginTop: 4 }}>
              心跳 {timeAgo(meta.wroteAt)} · 最近轮询 {timeAgo(meta.lastPollAt ?? undefined)}
              {' '}· 数据源 {meta.lastSource || '—'} · 桥 {meta.bridge || '—'}
              {meta.lastError ? ` · ${meta.lastError}` : ''}
            </div>
          )}
          <div className="qs-formrow">
            <button className="qs-btn sm" disabled={svcBusy} onClick={() => void svcAction('start')}>启动</button>
            <button className="qs-btn ghost sm" disabled={svcBusy} onClick={() => void svcAction('restart')}>重启</button>
            <button className="qs-btn ghost sm" disabled={svcBusy} onClick={() => void svcAction('stop')}>停止</button>
            <button className="qs-btn ghost sm" disabled={svcBusy} onClick={() => void loadSvc()}>刷新状态</button>
          </div>
        </div>
      </div>

      <div className="qs-sec"><span className="qs-bar" />数据说明</div>
      <div className="qs-card">
        <div style={{ padding: '10px 13px' }} className="qs-sub">
          · 实时行情：腾讯财经（主源）→ 东方财富（备源）自动降级；两源均不可用时保留最近缓存并在行情行标注 <b>cache</b>。<br />
          · 分时：腾讯 ifzq 当日数据，展开详情时按需拉取。<br />
          · 支持：沪/深/北 场内股票、ETF/LOF、指数。暂不支持：场外基金净值、港股、美股。<br />
          · 提醒在服务轮询时评估，仅对「行情时间为今天」的数据生效（节假日不误触），每规则每交易日最多触发一次。<br />
          · 本插件只读公开行情数据，不收集任何个人信息，无任何交易功能。
        </div>
      </div>
    </div>
  )
}
