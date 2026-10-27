/**
 * 设置 Tab：隐私开关（暂停/标题采集）+ 采样参数 + 数据管理 + 服务管理
 */
import { useCallback, useEffect, useState } from 'react'
import {
  runCmd, saveSettings, serviceAction, listServiceStatus, kvKeys,
  SERVICE_ID, type PanelData, type ServiceStatus, type TrailSettings,
} from './model'
import type { Toast } from './Panel'

export default function SettingsTab({ pluginId, data, reload, showToast }: {
  pluginId: string
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
}) {
  const settings = data?.settings
  const [svc, setSvc] = useState<ServiceStatus | null>(null)
  const [confirmPurgeAll, setConfirmPurgeAll] = useState(false)
  const [purgeApp, setPurgeApp] = useState('')
  const [busy, setBusy] = useState(false)

  const refreshSvc = useCallback(async () => {
    try {
      const list = await listServiceStatus()
      setSvc(list.find((s) => s.pluginId === pluginId && s.serviceId === SERVICE_ID) || null)
    } catch { /* 服务管理不可用时静默 */ }
  }, [pluginId])

  useEffect(() => {
    refreshSvc()
    const t = setInterval(refreshSvc, 8000)
    return () => clearInterval(t)
  }, [refreshSvc])

  const patch = useCallback(async (p: Partial<TrailSettings>) => {
    if (!settings) return
    setBusy(true)
    try {
      await saveSettings(p, settings)
      await reload()
      showToast('已保存（服务 60s 内应用，暂停/恢复立即生效）')
    } catch (e) {
      showToast(`保存失败：${(e as Error).message}`, true)
    } finally {
      setBusy(false)
    }
  }, [settings, reload, showToast])

  const doSvc = useCallback(async (action: 'start' | 'stop' | 'restart') => {
    setBusy(true)
    try {
      await serviceAction(action, pluginId, SERVICE_ID)
      showToast(`已${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}服务`)
      setTimeout(refreshSvc, 1500)
      await reload()
    } catch (e) {
      showToast(`服务${action === 'start' ? '启动' : '操作'}失败：${(e as Error).message}`, true)
    } finally {
      setBusy(false)
    }
  }, [pluginId, refreshSvc, reload, showToast])

  const doPurgeApp = useCallback(async () => {
    const app = purgeApp.trim().toLowerCase()
    if (!app) { showToast('请输入进程名', true); return }
    setBusy(true)
    try {
      const r = await runCmd({ action: 'purge_app', app }, 90 * 1000)
      showToast(r.ok ? `已删除「${app}」的全部历史记录` : r.error || '删除失败', !r.ok)
      if (r.ok) { setPurgeApp(''); await reload() }
    } finally {
      setBusy(false)
    }
  }, [purgeApp, reload, showToast])

  const doPurgeAll = useCallback(async () => {
    setBusy(true)
    try {
      const r = await runCmd({ action: 'purge_all', confirm: true }, 90 * 1000)
      showToast(r.ok ? '已清空全部时间账本' : r.error || '清空失败', !r.ok)
      if (r.ok) { setConfirmPurgeAll(false); await reload() }
    } finally {
      setBusy(false)
    }
  }, [reload, showToast])

  const doRestartCollector = useCallback(async () => {
    setBusy(true)
    try {
      const r = await runCmd({ action: 'collector_restart' }, 30 * 1000)
      showToast(r.ok ? '已重启采集器' : r.error || '重启失败', !r.ok)
      await reload()
    } finally {
      setBusy(false)
    }
  }, [reload, showToast])

  const [dayKeyCount, setDayKeyCount] = useState<number | null>(null)
  useEffect(() => {
    kvKeys().then((keys) => setDayKeyCount(keys.filter((k) => k.startsWith('timetrail.day.')).length)).catch(() => {})
  }, [data?.today?.date])

  if (!settings) return <div className="tt-empty">加载中…</div>

  const meta = data?.meta
  const snap = data?.snap

  return (
    <>
      <div className="tt-card">
        <div className="tt-card-h">隐私</div>
        <div className="tt-card-b" style={{ padding: 0 }}>
          <div className="tt-field">
            <div className="tt-field-l">
              <b>暂停采集（隐私模式）</b>
              <small>暂停期间不记录任何窗口与空闲信息；恢复后从当下继续。</small>
            </div>
            <button
              className={`tt-toggle ${settings.paused ? 'on' : ''}`}
              disabled={busy}
              onClick={() => patch({ paused: !settings.paused })}
            ><i /></button>
          </div>
          <div className="tt-field">
            <div className="tt-field-l">
              <b>记录窗口标题</b>
              <small>默认只记进程名。开启后标题截断 80 字符、每应用每日留 top 40，全部只存本机 cap.kv。</small>
            </div>
            <button
              className={`tt-toggle ${settings.captureTitles ? 'on' : ''}`}
              disabled={busy}
              onClick={() => patch({ captureTitles: !settings.captureTitles })}
            ><i /></button>
          </div>
        </div>
      </div>

      <div className="tt-card">
        <div className="tt-card-h">采集参数 <small>改后服务 60s 内应用并重启采集器</small></div>
        <div className="tt-card-b" style={{ padding: 0 }}>
          <div className="tt-field">
            <div className="tt-field-l"><b>采样间隔</b><small>秒（2-15），越小越准、开销越大</small></div>
            <input
              className="tt-num" type="number" min={2} max={15} defaultValue={settings.tickSec}
              onBlur={(e) => {
                const v = Math.min(15, Math.max(2, Math.round(Number(e.target.value) || 3)))
                e.target.value = String(v)
                if (v !== settings.tickSec) patch({ tickSec: v })
              }}
            />
          </div>
          <div className="tt-field">
            <div className="tt-field-l"><b>空闲判定</b><small>无键鼠输入多少秒后记为空闲（30-1800）</small></div>
            <input
              className="tt-num" type="number" min={30} max={1800} defaultValue={settings.idleSec}
              onBlur={(e) => {
                const v = Math.min(1800, Math.max(30, Math.round(Number(e.target.value) || 180)))
                e.target.value = String(v)
                if (v !== settings.idleSec) patch({ idleSec: v })
              }}
            />
          </div>
          <div className="tt-field">
            <div className="tt-field-l"><b>保留天数</b><small>天账本滚动保留（7-365），过期自动清扫</small></div>
            <input
              className="tt-num" type="number" min={7} max={365} defaultValue={settings.retentionDays}
              onBlur={(e) => {
                const v = Math.min(365, Math.max(7, Math.round(Number(e.target.value) || 90)))
                e.target.value = String(v)
                if (v !== settings.retentionDays) patch({ retentionDays: v })
              }}
            />
          </div>
        </div>
      </div>

      <div className="tt-card">
        <div className="tt-card-h">服务 <small>{meta?.version ? `v${meta.version}` : ''}</small></div>
        <div className="tt-card-b" style={{ padding: 0 }}>
          <div className="tt-field">
            <div className="tt-field-l">
              <b>
                <span className="tt-state">
                  <i className={`tt-dot ${svc?.state === 'running' ? 'ok' : svc ? 'stale' : 'down'}`} style={{ width: 7, height: 7, borderRadius: 999, display: 'inline-block', background: svc?.state === 'running' ? '#3FB950' : svc ? '#D29922' : '#F85149' }} />
                  trail-service {svc ? stateLabel(svc.state) : '未注册'}
                </span>
              </b>
              <small>
                {meta
                  ? `pid ${meta.pid} · 桥 ${meta.bridge || '未连接'} · 采集器 ${snap?.collector || '?'}（重启 ${meta.collectorRestarts || 0} 次）`
                  : '无心跳——服务可能未运行'}
                {snap?.degraded ? ` · ⚠ ${snap.degraded}` : ''}
              </small>
            </div>
            <button className="tt-btn ghost sm" disabled={busy} onClick={() => doSvc(svc?.state === 'running' ? 'restart' : 'start')}>
              {svc?.state === 'running' ? '重启' : '启动'}
            </button>
            {svc?.state === 'running' && (
              <button className="tt-btn danger sm" disabled={busy} onClick={() => doSvc('stop')}>停止</button>
            )}
          </div>
          <div className="tt-field">
            <div className="tt-field-l"><b>采集器</b><small>PowerShell 子进程；异常退出会自动退避重启</small></div>
            <button className="tt-btn ghost sm" disabled={busy} onClick={doRestartCollector}>重启采集器</button>
          </div>
        </div>
      </div>

      <div className="tt-card">
        <div className="tt-card-h">数据 <small>{dayKeyCount === null ? '' : `${dayKeyCount} 个天账本`}</small></div>
        <div className="tt-card-b" style={{ padding: 0 }}>
          <div className="tt-field">
            <div className="tt-field-l"><b>删除某应用的全部记录</b><small>输入进程名（如 code），从所有历史天账本移除</small></div>
            <input
              className="tt-num" style={{ width: 110 }} placeholder="code" value={purgeApp}
              onChange={(e) => setPurgeApp(e.target.value)}
            />
            <button className="tt-btn danger sm" disabled={busy} onClick={doPurgeApp}>删除</button>
          </div>
          <div className="tt-field">
            <div className="tt-field-l"><b>清空全部时间账本</b><small>保留设置与分类规则</small></div>
            <button className="tt-btn danger sm" disabled={busy} onClick={() => setConfirmPurgeAll(true)}>清空…</button>
          </div>
          {confirmPurgeAll && (
            <div className="tt-confirm">
              <b>确定清空全部天账本？此操作不可撤销。</b>
              <button className="tt-btn danger sm" disabled={busy} onClick={doPurgeAll}>确认清空</button>
              <button className="tt-btn ghost sm" onClick={() => setConfirmPurgeAll(false)}>取消</button>
            </div>
          )}
          <div className="tt-field">
            <div className="tt-field-l"><b>存储位置</b><small>全部数据在本机 Polaris 数据根（cap.kv / SqliteStorage），不上传任何服务器；标题默认不采集。</small></div>
          </div>
        </div>
      </div>
    </>
  )
}

function stateLabel(state: ServiceStatus['state']): string {
  switch (state) {
    case 'running': return '运行中'
    case 'starting': return '启动中'
    case 'stopping': return '停止中'
    case 'stopped': return '已停止'
    case 'error': return '出错'
    default: return state
  }
}
