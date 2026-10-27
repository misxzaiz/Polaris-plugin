/**
 * 设置 Tab：投递设置（TTL/上限/PIN）+ 服务管理卡（自举 start/stop/restart）
 * + 存储信息 + 危险区（清空投递区）
 */
import { useEffect, useState } from 'react'
import {
  fmtBytes, listServiceStatus, saveSettings, sendCommand, serviceAction,
  serviceStart, PLUGIN_ID, SERVICE_ID,
  type ServiceStatusRow,
} from './model'
import type { PanelData } from './DropTab'
import type { Toast } from './Panel'

function isRunning(s: ServiceStatusRow | undefined): boolean {
  if (!s) return false
  if (s.running === true) return true
  return typeof s.status === 'string' && /running|ok|alive/i.test(s.status)
}

export default function SettingsTab({ data, reload, showToast, running }: {
  data: PanelData
  reload: () => Promise<PanelData>
  showToast: Toast
  running: boolean
}) {
  const [svcRows, setSvcRows] = useState<ServiceStatusRow[] | null>(null)
  const [busy, setBusy] = useState('')
  const [ttlHours, setTtlHours] = useState('')
  const [maxSizeMb, setMaxSizeMb] = useState('')
  const [totalCapMb, setTotalCapMb] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const rows = await listServiceStatus()
        if (alive) setSvcRows(rows)
      } catch (_) {
        if (alive) setSvcRows([])
      }
    }
    void poll()
    const timer = setInterval(poll, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  useEffect(() => {
    const s = data.settings
    if (s && !dirty) {
      setTtlHours(String(s.ttlHours))
      setMaxSizeMb(String(s.maxSizeMb))
      setTotalCapMb(String(s.totalCapMb))
    }
  }, [data.settings, dirty])

  const mine = (svcRows || []).find((r) => r.pluginId === PLUGIN_ID && (r.serviceId === SERVICE_ID || r.id === SERVICE_ID))
  const svcUp = isRunning(mine)

  const doSave = async () => {
    if (!data.settings) return
    const next = {
      ...data.settings,
      ttlHours: Number(ttlHours) || data.settings.ttlHours,
      maxSizeMb: Number(maxSizeMb) || data.settings.maxSizeMb,
      totalCapMb: Number(totalCapMb) || data.settings.totalCapMb,
    }
    setBusy('save')
    try {
      await saveSettings(next)
      setDirty(false)
      showToast('设置已保存（服务 30 秒内热更新）', 'good')
      await reload()
    } catch (e) {
      showToast(`保存失败：${(e as Error).message}`, 'bad')
    } finally {
      setBusy('')
    }
  }

  const doRegenPin = async () => {
    if (!data.settings) return
    if (!window.confirm('重新生成 PIN？已连接的手机需要重新输入。')) return
    const pin = String(Math.floor(100000 + Math.random() * 900000))
    setBusy('pin')
    try {
      await saveSettings({ ...data.settings, pin })
      showToast(`新 PIN：${pin}（手机端需重新输入）`, 'good')
      await reload()
    } catch (e) {
      showToast(`生成失败：${(e as Error).message}`, 'bad')
    } finally {
      setBusy('')
    }
  }

  const doService = async (action: 'start' | 'stop' | 'restart') => {
    if (busy) return
    setBusy(action)
    try {
      if (action === 'start') await serviceStart()
      else await serviceAction(action)
      showToast(`服务${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}指令已下发`, 'good')
      setTimeout(() => { void reload() }, 2000)
    } catch (e) {
      showToast(`服务${action}失败：${(e as Error).message}`, 'bad')
    } finally {
      setBusy('')
    }
  }

  const doClear = async () => {
    if (!window.confirm('清空投递区将删除全部投递文件（含手机端未下载的），不可恢复。确定？')) return
    if (!window.confirm('再次确认：真的清空全部？')) return
    setBusy('clear')
    try {
      const r = await sendCommand('clear', { confirm: true })
      showToast(r.ok ? `已清空（${r.count} 条）` : `清空失败：${r.error}`, r.ok ? 'good' : 'bad')
      await reload()
    } catch (e) {
      showToast(`清空失败：${(e as Error).message}`, 'bad')
    } finally {
      setBusy('')
    }
  }

  const input = (value: string, onChange: (v: string) => void, suffix: string): React.ReactNode => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setDirty(true) }}
        style={{ width: 76, padding: '6px 8px', borderRadius: 6, border: '1px solid #3f3f46', background: '#18181b', color: '#e4e4e7', fontSize: 12 }}
      />
      <span style={{ fontSize: 11, color: '#71717a' }}>{suffix}</span>
    </span>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
      <section>
        <div style={{ color: '#a1a1aa', marginBottom: 6 }}>投递设置</div>
        <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#d4d4d8' }}>自动清理（TTL）</span>
            {input(ttlHours, setTtlHours, '小时（1–720）')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#d4d4d8' }}>单文件上限</span>
            {input(maxSizeMb, setMaxSizeMb, 'MB（1–8192）')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#d4d4d8' }}>投递区总容量</span>
            {input(totalCapMb, setTotalCapMb, 'MB（256–65536）')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#d4d4d8' }}>
              访问 PIN
              <span style={{ display: 'block', fontSize: 10, color: '#71717a' }}>手机端访问门禁，仅在局域网内有效</span>
            </span>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 16, letterSpacing: 3, color: '#f4f4f5', fontWeight: 600 }}>{data.settings?.pin || '——'}</span>
              <button onClick={doRegenPin} disabled={!!busy} style={ghostBtn()}>重新生成</button>
            </span>
          </div>
          {dirty && (
            <button onClick={doSave} disabled={busy === 'save'} style={primaryBtn()}>
              {busy === 'save' ? '保存中…' : '保存设置'}
            </button>
          )}
        </div>
      </section>

      <section>
        <div style={{ color: '#a1a1aa', marginBottom: 6 }}>后台服务</div>
        <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#d4d4d8' }}>
              快传服务（0.0.0.0:9867）
              <span style={{ display: 'block', fontSize: 10, color: '#71717a' }}>
                {(svcRows || []).length === 0 ? '状态未知（宿主不支持服务管理？）' : (mine?.lastError ? `最近错误：${mine.lastError}` : '端口被占用时会诚实失败，见插件日志')}
              </span>
            </span>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 8,
              background: svcUp ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
              color: svcUp ? '#3fb950' : '#f85149',
            }}>{svcUp ? '运行中' : '未运行'}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => doService('start')} disabled={!!busy} style={ghostBtn()}>启动</button>
            <button onClick={() => doService('stop')} disabled={!!busy} style={ghostBtn()}>停止</button>
            <button onClick={() => doService('restart')} disabled={!!busy} style={ghostBtn()}>重启</button>
          </div>
          <div style={{ fontSize: 10, color: '#71717a', lineHeight: 1.6 }}>
            首次监听局域网端口时 Windows 可能弹出防火墙提示，允许「专用网络」即可。
            {running && data.meta?.dropDir && (
              <>存储目录：{data.meta.dropDir}（{data.meta.itemCount ?? 0} 条 / {fmtBytes(data.meta.storeBytes)}）</>
            )}
          </div>
        </div>
      </section>

      <section>
        <div style={{ color: '#a1a1aa', marginBottom: 6 }}>危险区</div>
        <div style={{ background: 'rgba(248,81,73,.05)', border: '1px solid rgba(248,81,73,.3)', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#d4d4d8' }}>清空投递区<span style={{ display: 'block', fontSize: 10, color: '#71717a' }}>删除全部投递文件，手机端同步消失</span></span>
          <button onClick={doClear} disabled={!!busy} style={{ ...ghostBtn(), color: '#f87171', borderColor: 'rgba(248,81,73,.4)' }}>清空</button>
        </div>
      </section>
    </div>
  )
}

function ghostBtn(): React.CSSProperties {
  return {
    padding: '5px 12px', fontSize: 11, borderRadius: 7, border: '1px solid #3f3f46',
    background: '#27272a', color: '#d4d4d8', cursor: 'pointer', minHeight: 30,
  }
}
function primaryBtn(): React.CSSProperties {
  return {
    padding: '8px 14px', fontSize: 12, borderRadius: 8, border: 'none',
    background: '#3b82f6', color: '#fff', cursor: 'pointer', minHeight: 36,
  }
}
