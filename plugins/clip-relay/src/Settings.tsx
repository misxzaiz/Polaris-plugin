/**
 * 设置区：保留策略 + URL 抓取开关 + 服务管理（cap.pluginServiceManager 自举）+ 危险区
 */
import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_SETTINGS, SERVICE_ID, clearAll, kvSet, listServiceStatus, serviceAction,
  K, type BoardData, type RelaySettings, type ServiceStatus,
} from './model'
import type { Toast } from './Panel'

function StateBadge({ st }: { st?: ServiceStatus }) {
  const map: Record<string, [string, string]> = {
    running: ['运行中', '#3FB950'],
    starting: ['启动中', '#D29922'],
    stopping: ['停止中', '#D29922'],
    stopped: ['已停止', '#8B95A7'],
    error: ['异常', '#F85149'],
  }
  const [label, color] = st ? map[st.state] || [st.state, '#8B95A7'] : ['未报告', '#8B95A7']
  return <span className="cr-state" style={{ color }}><i className="cr-dot" style={{ background: color }} />{label}{st?.restartCount ? ` · 重启 ${st.restartCount} 次` : ''}</span>
}

export default function SettingsSection({ pluginId, data, reload, showToast }: {
  pluginId: string
  data: BoardData | null
  reload: () => Promise<BoardData | null>
  showToast: Toast
}) {
  const [svc, setSvc] = useState<ServiceStatus | undefined>(undefined)
  const [svcBusy, setSvcBusy] = useState(false)
  const [form, setForm] = useState<RelaySettings>(data?.settings ?? DEFAULT_SETTINGS)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => { setForm(data?.settings ?? DEFAULT_SETTINGS) }, [data?.settings])

  const refreshSvc = useCallback(async () => {
    try {
      const all = await listServiceStatus()
      setSvc(all.find((s) => s.pluginId === pluginId && s.serviceId === SERVICE_ID))
    } catch (_) { setSvc(undefined) }
  }, [pluginId])

  useEffect(() => { refreshSvc() }, [refreshSvc])

  const onSvcAction = useCallback(async (action: 'start' | 'stop' | 'restart') => {
    setSvcBusy(true)
    try {
      await serviceAction(action, pluginId, SERVICE_ID)
      showToast(`已${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}服务`)
      await new Promise((r) => setTimeout(r, 1200))
      await refreshSvc()
      await reload()
    } catch (e) {
      showToast(`${action} 失败：${(e as Error).message}`, true)
    } finally {
      setSvcBusy(false)
    }
  }, [pluginId, refreshSvc, reload, showToast])

  const saveSettings = useCallback(async (patch: Partial<RelaySettings>) => {
    const next = { ...form, ...patch }
    setForm(next)
    try {
      await kvSet(K.settings, next)
      showToast('设置已保存（服务约 30s 内生效）')
      reload()
    } catch (e) {
      showToast(`保存失败：${(e as Error).message}`, true)
    }
  }, [form, reload, showToast])

  const onClearAll = useCallback(async () => {
    try {
      const n = await clearAll()
      setConfirmClear(false)
      showToast(`已清空 ${n} 条`)
      reload()
    } catch (e) {
      showToast(`清空失败：${(e as Error).message}`, true)
    }
  }, [reload, showToast])

  const num = (v: string, dflt: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : dflt
  }

  return (
    <div>
      <div className="cr-card">
        <div className="cr-sec"><i className="cr-bar" />保留策略<small className="cr-hint">由后台服务按周期清扫</small></div>
        <div className="cr-field">
          <span className="cr-field-l"><b>最多保留条数</b><small>超出时最旧的未置顶条目被清理（置顶永留）</small></span>
          <input
            className="cr-num" type="number" min={20} max={500} value={form.maxItems}
            onChange={(e) => setForm({ ...form, maxItems: num(e.target.value, form.maxItems) })}
            onBlur={(e) => saveSettings({ maxItems: num(e.target.value, form.maxItems) })}
          />
        </div>
        <div className="cr-field">
          <span className="cr-field-l"><b>保留天数</b><small>超过天数的未置顶条目被清理</small></span>
          <input
            className="cr-num" type="number" min={1} max={365} value={form.retentionDays}
            onChange={(e) => setForm({ ...form, retentionDays: num(e.target.value, form.retentionDays) })}
            onBlur={(e) => saveSettings({ retentionDays: num(e.target.value, form.retentionDays) })}
          />
        </div>
        <div className="cr-field">
          <span className="cr-field-l"><b>URL 标题抓取</b><small>推送链接时由服务抓取网页标题与摘要（关闭则只显示 URL）</small></span>
          <button
            className={`cr-toggle ${form.urlEnrich ? 'on' : ''}`}
            onClick={() => saveSettings({ urlEnrich: !form.urlEnrich })}
            aria-label="URL 标题抓取"
          ><i /></button>
        </div>
      </div>

      <div className="cr-card">
        <div className="cr-sec"><i className="cr-bar" />后台服务<small className="cr-hint">{svc ? `pid ${svc.pid ?? '—'}` : '状态未知'}</small></div>
        <div className="cr-card-b">
          <StateBadge st={svc} />
          {svc?.lastError && <div className="cr-sub" style={{ marginTop: 4 }}>最近错误：{svc.lastError}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
            <button className="cr-btn sm" disabled={svcBusy} onClick={() => onSvcAction('start')}>启动</button>
            <button className="cr-btn ghost sm" disabled={svcBusy} onClick={() => onSvcAction('restart')}>重启</button>
            <button className="cr-btn ghost sm" disabled={svcBusy} onClick={() => onSvcAction('stop')}>停止</button>
            <button className="cr-btn ghost sm" disabled={svcBusy} onClick={refreshSvc}>刷新状态</button>
          </div>
          <div className="cr-sub" style={{ marginTop: 7 }}>
            服务负责 URL 标题抓取与保留清扫；停止后收发照常，链接不再补标题、条目不再自动清理。
          </div>
        </div>
      </div>

      <div className="cr-card">
        <div className="cr-sec"><i className="cr-bar" />危险区</div>
        <div className="cr-card-b">
          {!confirmClear ? (
            <button className="cr-btn danger sm" onClick={() => setConfirmClear(true)}>清空整块板子（含置顶）</button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: '#FF8A9A' }}>确认删除全部条目？此操作不可撤销。</span>
              <button className="cr-btn danger sm" onClick={onClearAll}>确认清空</button>
              <button className="cr-btn ghost sm" onClick={() => setConfirmClear(false)}>取消</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
