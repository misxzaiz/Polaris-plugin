/**
 * 设置 Tab：后台服务管理（cap.pluginServiceManager）+ 全局设置 + 数据管理
 */
import { useEffect, useState } from 'react'
import {
  listServiceStatus, serviceAction, kvSet, kvDel, kvKeys, K, timeAgo,
  type Snapshot, type SentinelSettings, type ServiceStatus,
} from './model'

export default function SettingsTab({ pluginId, snap, reload, showToast }: {
  pluginId: string
  snap: Snapshot | null
  reload: () => Promise<unknown>
  showToast: (msg: string, bad?: boolean) => void
}) {
  const SERVICE_ID = 'sentinel-service'
  const [status, setStatus] = useState<ServiceStatus | null>(null)
  const [statusErr, setStatusErr] = useState('')
  const [busy, setBusy] = useState('')
  const [draft, setDraft] = useState<SentinelSettings | null>(snap?.settings ?? null)

  useEffect(() => { setDraft(snap?.settings ?? null) }, [snap?.settings])

  const refreshStatus = async () => {
    try {
      const all = await listServiceStatus()
      setStatus(all.find((s) => s.pluginId === pluginId && s.serviceId === SERVICE_ID) ?? null)
      setStatusErr('')
    } catch (e) {
      setStatusErr((e as Error).message)
    }
  }

  useEffect(() => {
    refreshStatus()
    const t = setInterval(refreshStatus, 8000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginId])

  const doService = async (action: 'start' | 'stop' | 'restart') => {
    setBusy(action)
    try {
      await serviceAction(action, pluginId, SERVICE_ID)
      showToast(`已${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}服务`)
      setTimeout(refreshStatus, 2000)
    } catch (e) {
      showToast(`服务${action === 'start' ? '启动' : '操作'}失败：${(e as Error).message}`, true)
    }
    setBusy('')
  }

  const saveSettings = async () => {
    if (!draft) return
    try {
      await kvSet(K.settings, {
        ...draft,
        maxConcurrency: Math.min(6, Math.max(1, Math.floor(Number(draft.maxConcurrency) || 3))),
        retentionDays: Math.max(1, Math.floor(Number(draft.retentionDays) || 30)),
        maxEventsPerTarget: Math.max(10, Math.floor(Number(draft.maxEventsPerTarget) || 50)),
      })
      await reload()
      showToast('设置已保存（服务 60 秒内生效）')
    } catch (e) {
      showToast(`保存失败：${(e as Error).message}`, true)
    }
  }

  const clearEvents = async () => {
    if (!window.confirm('清理全部事件（保留监控目标与快照）？')) return
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith('sentinel.event.'))
      await Promise.all(keys.map((k) => kvDel(k)))
      showToast(`已清理 ${keys.length} 条事件`)
      await reload()
    } catch (e) {
      showToast(`清理失败：${(e as Error).message}`, true)
    }
  }

  const clearAll = async () => {
    if (!window.confirm('删除网页哨兵的全部数据（目标/状态/快照/事件/设置）？不可恢复。')) return
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith('sentinel.'))
      await Promise.all(keys.map((k) => kvDel(k)))
      showToast('已清空全部哨兵数据')
      await reload()
    } catch (e) {
      showToast(`清理失败：${(e as Error).message}`, true)
    }
  }

  const stateCls = (s?: string) => (s === 'running' ? '#3FB950' : s === 'error' ? '#F85149' : s === 'starting' ? '#D29922' : '#8B95A7')
  const meta = snap?.meta

  return (
    <div>
      <div className="ps-sec"><i className="ps-bar" />后台服务</div>
      <div className="ps-card">
        <div className="ps-card-b">
          <div className="ps-row">
            <i className="ps-dot" style={{ background: stateCls(status?.state) }} />
            <b style={{ flex: 1 }}>
              {status ? ({
                starting: '启动中', running: '运行中', stopping: '停止中', stopped: '已停止', error: '异常',
              }[status.state] || status.state) : statusErr ? '状态未知' : '未注册（插件刚装？稍候刷新）'}
            </b>
            {busy && <span className="ps-spin" />}
          </div>
          <div className="ps-state">
            {status?.pid && <span className="ps-kv">PID <b>{status.pid}</b></span>}
            {status?.port ? <span className="ps-kv">· 端口 <b>{status.port}</b></span> : null}
            {status?.uptime ? <span className="ps-kv">· 已运行 <b>{Math.floor(status.uptime / 60)} 分钟</b></span> : null}
            {!!status?.restartCount && <span className="ps-kv">· 重启 <b>{status.restartCount}</b> 次</span>}
          </div>
          {status?.lastError && <div className="ps-sub" style={{ color: '#F85149', marginTop: 4 }}>{status.lastError}</div>}
          <div className="ps-state">
            {meta
              ? <span className="ps-kv">心跳 <b>{timeAgo(meta.lastTickAt)}</b> · 桥 <b>{meta.bridge}</b> · v{meta.version}</span>
              : <span className="ps-kv">尚无心跳（服务未运行时正常）</span>}
          </div>
          <div className="ps-actions">
            <button className="ps-btn sm" disabled={busy !== '' || status?.state === 'running' || status?.state === 'starting'} onClick={() => doService('start')}>启动</button>
            <button className="ps-btn sm ghost" disabled={busy !== '' || !status || (status.state !== 'running' && status.state !== 'error' && status.state !== 'starting')} onClick={() => doService('restart')}>重启</button>
            <button className="ps-btn sm ghost" disabled={busy !== '' || !status || (status.state !== 'running' && status.state !== 'starting' && status.state !== 'error')} onClick={() => doService('stop')}>停止</button>
          </div>
          <div className="ps-sub" style={{ marginTop: 8 }}>
            抓取全部由本服务在后台原生执行（无浏览器跨域限制）；桌面与手机 Web 面板通过 cap.kv 看到同一份状态。
          </div>
        </div>
      </div>

      <div className="ps-sec"><i className="ps-bar" />调度设置</div>
      {draft && (
        <div className="ps-card">
          <div className="ps-card-b" style={{ padding: 0 }}>
            <div className="ps-field">
              <div className="ps-field-l"><b>全局暂停调度</b><small>暂停后不发起任何检查，已有数据保留</small></div>
              <button
                className={`ps-toggle ${draft.pausedAll ? 'on' : ''}`}
                onClick={() => setDraft({ ...draft, pausedAll: !draft.pausedAll })}
              ><i /></button>
            </div>
            <div className="ps-field">
              <div className="ps-field-l"><b>并发抓取数</b><small>同时最多发起几个请求（1–6）</small></div>
              <input className="ps-num" type="number" min={1} max={6} value={draft.maxConcurrency}
                onChange={(e) => setDraft({ ...draft, maxConcurrency: Number(e.target.value) })} />
            </div>
            <div className="ps-field">
              <div className="ps-field-l"><b>事件保留天数</b><small>超期事件自动清理（天）</small></div>
              <input className="ps-num" type="number" min={1} value={draft.retentionDays}
                onChange={(e) => setDraft({ ...draft, retentionDays: Number(e.target.value) })} />
            </div>
            <div className="ps-field">
              <div className="ps-field-l"><b>每目标事件上限</b><small>超出后最旧的被清理（条）</small></div>
              <input className="ps-num" type="number" min={10} value={draft.maxEventsPerTarget}
                onChange={(e) => setDraft({ ...draft, maxEventsPerTarget: Number(e.target.value) })} />
            </div>
            <div className="ps-field" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="ps-field-l"><b>自定义 User-Agent</b><small>留空用默认浏览器 UA（某些站点需要特定 UA/Cookie 时配合目标级请求头）</small></div>
              <input className="ps-inp" value={draft.userAgent} placeholder="（默认）"
                onChange={(e) => setDraft({ ...draft, userAgent: e.target.value })} />
            </div>
            <div className="ps-actions" style={{ padding: '10px 13px' }}>
              <button className="ps-btn sm" onClick={saveSettings}>保存设置</button>
            </div>
          </div>
        </div>
      )}

      <div className="ps-sec"><i className="ps-bar" />数据</div>
      <div className="ps-card">
        <div className="ps-card-b">
          <div className="ps-state" style={{ marginTop: 0 }}>
            <span className="ps-kv">目标 <b>{snap?.rows.length ?? 0}</b></span>
            <span className="ps-kv">· 存储 <b>cap.kv（sentinel.* 键空间）</b></span>
          </div>
          <div className="ps-actions">
            <button className="ps-btn sm ghost" onClick={clearEvents}>清理全部事件</button>
            <button className="ps-btn sm danger" onClick={clearAll}>清空全部数据</button>
          </div>
        </div>
      </div>

      <div className="ps-sec"><i className="ps-bar" />关于</div>
      <div className="ps-card">
        <div className="ps-card-b ps-sub">
          网页哨兵 page-sentinel v0.1.0 —— 盯网页变化的后台哨兵：价格 / 库存 / 放号 / 考位 / release / 文档更新。
          <br />· 浏览器有同源策略，本插件把抓取下沉到后台服务原生执行，天然无跨域问题；
          <br />· 手机端访问时面板经宿主统一通道（自动带 token）读写 cap.kv，与桌面看到同一份数据；
          <br />· 在聊天里可直接让 AI 管理监控（sentinel_add_watch 等工具）；
          <br />· 抓取礼貌策略：同一主机至少间隔 15 秒，单机并发默认 3。
        </div>
      </div>
    </div>
  )
}
