/**
 * 口袋快传面板：Tab 组装 + 轮询 + Toast
 *
 * 数据面：cap.kv 投影（meta/items/settings 每 3s 轮询）；服务状态徽章据此渲染。
 * 大文件直传等对自家服务的 HTTP 操作在各 Tab 内做，失败给诚实指引。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getItems, getMeta, getSettings, type DropItem, type DropMeta, type DropSettings } from './model'
import DropTab from './DropTab'
import EventTab from './EventTab'
import SettingsTab from './SettingsTab'

export type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

const META_FRESH_MS = 90 * 1000

const TABS: Array<{ id: string; label: string }> = [
  { id: 'drop', label: '快传' },
  { id: 'events', label: '动态' },
  { id: 'settings', label: '设置' },
]

interface PanelData {
  meta: DropMeta | null
  items: DropItem[]
  settings: DropSettings | null
  loaded: boolean
}

export default function Panel({ pluginId }: { pluginId: string; onSendToChat?: (m: string) => void }) {
  const [tab, setTab] = useState('drop')
  const [data, setData] = useState<PanelData>({ meta: null, items: [], settings: null, loaded: false })
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  const showToast: Toast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  const reload = useCallback(async (): Promise<PanelData> => {
    try {
      const [meta, items, settings] = await Promise.all([getMeta(), getItems(), getSettings()])
      const next: PanelData = { meta, items, settings, loaded: true }
      setData(next)
      return next
    } catch (_) {
      const next: PanelData = { meta: null, items: [], settings: null, loaded: true }
      setData(next)
      return next
    }
  }, [])

  useEffect(() => {
    void reload()
    const timer = setInterval(() => { void reload() }, 3000)
    return () => clearInterval(timer)
  }, [reload])

  const metaFresh = !!(data.meta && data.meta.lastTickAt && Date.now() - data.meta.lastTickAt < META_FRESH_MS)
  const running = metaFresh

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%', gap: 10, color: '#d4d4d8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5' }}>⚡ 口袋快传</span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 8,
          background: running ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
          color: running ? '#3fb950' : '#f85149',
        }}>{running ? '服务运行中' : '服务离线'}</span>
        {data.meta?.degraded && running && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(210,153,34,.15)', color: '#d29922' }}>kv 降级</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
              border: '1px solid', minHeight: 32,
              borderColor: tab === t.id ? '#3b82f6' : '#3f3f46',
              background: tab === t.id ? 'rgba(59,130,246,.15)' : 'transparent',
              color: tab === t.id ? '#93c5fd' : '#a1a1aa',
            }}
          >{t.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tab === 'drop' && <DropTab data={data} reload={reload} showToast={showToast} running={running} />}
        {tab === 'events' && <EventTab showToast={showToast} />}
        {tab === 'settings' && <SettingsTab data={data} reload={reload} showToast={showToast} running={running} />}
      </div>

      <div style={{ fontSize: 10, color: '#52525b' }}>
        {pluginId} · {running ? `端口 ${data.meta?.port ?? '—'}` : '手机端需服务在线后扫码'}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)',
          background: toast.kind === 'bad' ? '#7f1d1d' : toast.kind === 'good' ? '#14532d' : '#27272a',
          color: '#f4f4f5', fontSize: 12, padding: '8px 14px', borderRadius: 8, zIndex: 99,
          maxWidth: '80vw', boxShadow: '0 4px 14px rgba(0,0,0,.4)',
        }}>{toast.msg}</div>
      )}
    </div>
  )
}
