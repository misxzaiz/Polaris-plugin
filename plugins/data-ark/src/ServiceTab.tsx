/**
 * 服务 Tab：后台服务状态（角色/租约/数据根/备份库/进行中动作）+ 服务管理
 * （自举 start/stop/restart）+ 事件流（快照/校验/恢复/GC/降级）。
 */
import { useEffect, useState } from 'react'
import {
  PLUGIN_ID, SERVICE_ID, listServiceStatus, serviceAction,
  timeAgo, fmtDuration, type Overview, type ServiceStatus,
} from './model'
import type { Toast } from './Panel'

const EVENT_STYLE: Record<string, { label: string; cls: string }> = {
  snapshot_ok: { label: '快照完成', cls: 'ok' },
  snapshot_fail: { label: '快照失败', cls: 'bad' },
  verify_ok: { label: '校验通过', cls: 'ok' },
  verify_fail: { label: '校验异常', cls: 'bad' },
  restore: { label: '恢复', cls: 'ok' },
  gc: { label: '回收', cls: 'warn' },
  catchup: { label: '补偿', cls: 'warn' },
  degraded: { label: '降级', cls: 'bad' },
  cmd_fail: { label: '命令失败', cls: 'bad' },
}

export default function ServiceTab({ data, reload, showToast }: {
  data: Overview | null
  reload: () => Promise<Overview | null>
  showToast: Toast
}) {
  const [svcStatus, setSvcStatus] = useState<ServiceStatus[] | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const r = await listServiceStatus()
        if (alive) setSvcStatus(r)
      } catch (_) {
        if (alive) setSvcStatus([])
      }
    }
    void poll()
    const timer = setInterval(poll, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  if (!data) return <div className="da-empty">载入中…</div>
  const st = data.state

  const mine = (svcStatus || []).find((s) => (s.pluginId === PLUGIN_ID && (s.serviceId === SERVICE_ID || s.id === SERVICE_ID)) || s.id === `${PLUGIN_ID}`)
  const running = !!(mine && (mine.running === true || (typeof mine.status === 'string' && /running|ok|alive/i.test(mine.status))))
  const serviceUi = (svcStatus || []).length > 0

  const doService = async (action: 'start' | 'stop' | 'restart') => {
    if (busy) return
    setBusy(action)
    try {
      await serviceAction(action, PLUGIN_ID, SERVICE_ID)
      showToast(`服务${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}指令已下发`, 'good')
      setTimeout(() => { void reload() }, 1500)
    } catch (e) {
      showToast(`服务${action}失败：${(e as Error).message}`, 'bad')
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <div className="da-sec"><i className="da-bar" />服务状态</div>
      <div className="da-card">
        <div className="da-card-b" style={{ padding: 0 }}>
          <div className="da-field">
            <div className="da-field-l"><b>后台服务（快照/校验/恢复执行者）</b>
              <small>
                {st.lastTickAt ? `心跳 ${timeAgo(st.lastTickAt)}` : '尚未心跳'}
                {st.resolvedTarget ? ` · 备份库 ${st.resolvedTarget}` : ''}
              </small>
            </div>
            <span className={`da-badge ${running ? 'inc' : 'err'}`}>{serviceUi ? (running ? '运行中' : '未运行') : '状态未知'}</span>
          </div>
          <div className="da-field">
            <div className="da-field-l"><b>角色 / 租约</b>
              <small>{st.lease ? `持有者 ${st.lease.host}·${st.lease.pid}（到期 ${new Date(st.lease.expiresAt).toLocaleTimeString('zh-CN', { hour12: false })}）` : '无租约'}</small>
            </div>
            <span className={`da-badge ${st.lease ? 'full' : ''}`}>{st.lease ? 'leader' : '空闲'}</span>
          </div>
          <div className="da-field">
            <div className="da-field-l"><b>保护对象（数据根）与备份库</b>
              <small style={{ wordBreak: 'break-all' }}>
                库占用 {fmtBytes(st.storeBytes)} · {st.objectsTotal ?? 0} 对象{data.settings.targetDir ? '' : '（默认 <数据根>/../polaris-ark）'}
              </small>
            </div>
          </div>
          <div className="da-actions" style={{ padding: '10px 13px' }}>
            <button className="da-btn sm" disabled={!!busy} onClick={() => void doService('start')}>启动</button>
            <button className="da-btn sm ghost" disabled={!!busy} onClick={() => void doService('restart')}>重启</button>
            <button className="da-btn sm ghost" disabled={!!busy} onClick={() => void doService('stop')}>停止</button>
            <span className="da-sub">服务随 Polaris 自启（autoStart），崩溃自动拉起</span>
          </div>
        </div>
      </div>

      <div className="da-sec"><i className="da-bar" />运行要点</div>
      <div className="da-card">
        <div className="da-card-b da-sub">
          调度：{data.snapshots.length ? `下次 ${st.nextRunAt ? new Date(st.nextRunAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '未排程'}` : '首次安装 90 秒后自动做第一份全量'}
          ；应用关机期间错过的调度会在启动后<b>补跑一次</b>（绝不连环补）。
          <br />进行中：{st.lastResult && !st.lastResult.ok && Date.now() - st.lastResult.at < 60000 ? <span style={{ color: '#FF8A9A' }}>上次动作失败：{st.lastResult.error}</span> : '空闲'}
          {data.state.lastVerify ? <> · 最近校验耗时 {fmtDuration(data.state.lastVerify.durationMs || 0)}</> : null}
          <br />日志：<code>数据根配置目录/data-ark.log</code>（512KB 轮转）
        </div>
      </div>

      <div className="da-sec"><i className="da-bar" />事件流<span className="da-hint">{data.events.length} 条（保留 50）</span></div>
      <div className="da-card">
        <div className="da-card-b">
          {data.events.length === 0 && <div className="da-empty">暂无事件——首次备份完成后这里会开始记录</div>}
          {data.events.slice(0, 50).map((e, i) => {
            const st2 = EVENT_STYLE[e.type] || { label: e.type, cls: '' }
            return (
              <div className="da-ev" key={`${e.at}-${i}`}>
                <span className="t">{new Date(e.at).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                <span className={`k ${st2.cls}`}>{st2.label}</span>
                <span className="m">{e.msg}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function fmtBytes(n?: number): string {
  const b = Number(n) || 0
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`
  return `${(b / 1073741824).toFixed(2)} GB`
}
