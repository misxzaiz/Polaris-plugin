/**
 * 设置 Tab：告警阈值 + 服务管理（cap.pluginServiceManager 自举启动）+ 数据管理
 */
import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_SETTINGS, SERVICE_ID, clearEvents, kvSet, listServiceStatus, serviceAction,
  K, type HostSettings, type PanelData, type ServiceStatus,
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
  return <span className="ph-state" style={{ color }}><i className="ph-dot" style={{ background: color }} />{label}{st?.restartCount ? ` · 重启 ${st.restartCount} 次` : ''}</span>
}

export default function SettingsTab({ pluginId, data, reload, showToast }: {
  pluginId: string
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
}) {
  const [svc, setSvc] = useState<ServiceStatus | undefined>(undefined)
  const [svcBusy, setSvcBusy] = useState(false)
  const [form, setForm] = useState<HostSettings>(data?.settings ?? DEFAULT_SETTINGS)

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

  const saveSettings = useCallback(async (patch: Partial<HostSettings>) => {
    const next = { ...form, ...patch }
    setForm(next)
    try {
      await kvSet(K.settings, next)
      showToast('设置已保存（服务约 10s 内生效）')
      reload()
    } catch (e) {
      showToast(`保存失败：${(e as Error).message}`, true)
    }
  }, [form, reload, showToast])

  const onClearEvents = useCallback(async () => {
    try {
      const n = await clearEvents()
      await kvSet(K.readAt, Date.now())
      showToast(`已清空 ${n} 条告警事件`)
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
      <div className="ph-card">
        <div className="ph-sec"><i className="ph-bar" />后台服务<small className="ph-hint">{svc ? `pid ${svc.pid ?? '—'}${svc.port ? ` · 端口 ${svc.port}` : ''}` : '状态未知'}</small></div>
        <div className="ph-card-b">
          <StateBadge st={svc} />
          {svc?.lastError && <div className="ph-sub" style={{ marginTop: 4 }}>最近错误：{svc.lastError}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
            <button className="ph-btn sm" disabled={svcBusy} onClick={() => onSvcAction('start')}>启动</button>
            <button className="ph-btn ghost sm" disabled={svcBusy} onClick={() => onSvcAction('restart')}>重启</button>
            <button className="ph-btn ghost sm" disabled={svcBusy} onClick={() => onSvcAction('stop')}>停止</button>
            <button className="ph-btn ghost sm" disabled={svcBusy} onClick={refreshSvc}>刷新状态</button>
          </div>
          <div className="ph-sub" style={{ marginTop: 7 }}>
            服务负责全部采样/告警/kill 执行（单写者）；停止后面板将显示「无快照」，MCP 工具也会提示服务未运行。
          </div>
        </div>
      </div>

      <div className="ph-card">
        <div className="ph-sec"><i className="ph-bar" />告警阈值</div>
        <div className="ph-field">
          <span className="ph-field-l"><b>暂停告警</b><small>继续采样与快照，但不产生新告警事件</small></span>
          <button
            className={`ph-toggle ${form.paused ? 'on' : ''}`}
            onClick={() => saveSettings({ paused: !form.paused })}
            aria-label="暂停告警"
          ><i /></button>
        </div>
        <div className="ph-field">
          <span className="ph-field-l"><b>CPU 阈值（%）</b><small>持续超过才告警，恢复也会记录</small></span>
          <input
            className="ph-num" type="number" min={50} max={100} value={form.cpuThreshold}
            onChange={(e) => setForm({ ...form, cpuThreshold: num(e.target.value, form.cpuThreshold) })}
            onBlur={(e) => saveSettings({ cpuThreshold: num(e.target.value, form.cpuThreshold) })}
          />
        </div>
        <div className="ph-field">
          <span className="ph-field-l"><b>内存阈值（%）</b><small>同上</small></span>
          <input
            className="ph-num" type="number" min={50} max={100} value={form.memThreshold}
            onChange={(e) => setForm({ ...form, memThreshold: num(e.target.value, form.memThreshold) })}
            onBlur={(e) => saveSettings({ memThreshold: num(e.target.value, form.memThreshold) })}
          />
        </div>
        <div className="ph-field">
          <span className="ph-field-l"><b>磁盘剩余下限（GB）</b><small>任一盘剩余低于该值告警</small></span>
          <input
            className="ph-num" type="number" min={1} max={500} value={form.diskFreeGb}
            onChange={(e) => setForm({ ...form, diskFreeGb: num(e.target.value, form.diskFreeGb) })}
            onBlur={(e) => saveSettings({ diskFreeGb: num(e.target.value, form.diskFreeGb) })}
          />
        </div>
        <div className="ph-field">
          <span className="ph-field-l"><b>持续采样数</b><small>连续 N 个采样（约 N×2.5s）超限才触发，防抖</small></span>
          <input
            className="ph-num" type="number" min={1} max={12} value={form.sustainTicks}
            onChange={(e) => setForm({ ...form, sustainTicks: num(e.target.value, form.sustainTicks) })}
            onBlur={(e) => saveSettings({ sustainTicks: num(e.target.value, form.sustainTicks) })}
          />
        </div>
      </div>

      <div className="ph-card">
        <div className="ph-sec"><i className="ph-bar" />数据管理</div>
        <div className="ph-card-b">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="ph-btn ghost sm" onClick={onClearEvents}>清空告警事件</button>
          </div>
          <div className="ph-sub" style={{ marginTop: 7 }}>
            全部数据在 cap.kv 的 hostmon.* 键空间；快照/历史由服务滚动覆盖，无需手动清理。
          </div>
        </div>
      </div>
    </div>
  )
}
