/**
 * Webhook 调试台面板：Tab 组装 + 轮询 + Toast
 *
 * 数据面：cap.kv 投影（meta/settings/idx/rec 每 2.5s 轮询）；
 * 服务状态徽章据 meta 心跳渲染。服务管理动作在设置页（自举 start）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import LiveTab from './tabs/LiveTab'
import BucketsTab from './tabs/BucketsTab'
import StatsTab from './tabs/StatsTab'
import SettingsTab from './tabs/SettingsTab'
import { getIdx, getMeta, getSettings, readRecChunks, type Capture, type Settings, type WhsIdx, type WhsMeta } from './model'

export type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

const META_FRESH_MS = 90 * 1000
const POLL_MS = 2500

const TABS: Array<{ id: string; label: string }> = [
  { id: 'live', label: '回调流' },
  { id: 'buckets', label: '桶与地址' },
  { id: 'stats', label: '排查' },
  { id: 'settings', label: '设置' },
]

export interface PanelData {
  meta: WhsMeta | null
  settings: Settings | null
  idx: WhsIdx | null
  captures: Capture[]
  loaded: boolean
}

export default function Panel({ pluginId, onSendToChat }: { pluginId: string; onSendToChat?: (m: string) => void }) {
  const [tab, setTab] = useState('live')
  const [data, setData] = useState<PanelData>({ meta: null, settings: null, idx: null, captures: [], loaded: false })
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const loadedOnce = useRef(false)

  const showToast: Toast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  const reload = useCallback(async (): Promise<PanelData> => {
    try {
      const [meta, settings, idx] = await Promise.all([getMeta(), getSettings(), getIdx()])
      const captures = await readRecChunks(idx?.chunkCount || 0)
      const next: PanelData = { meta, settings, idx, captures, loaded: true }
      setData(next)
      return next
    } catch (_) {
      const next: PanelData = { meta: null, settings: null, idx: null, captures: [], loaded: true }
      setData(next)
      return next
    }
  }, [])

  useEffect(() => {
    void reload()
    const timer = setInterval(() => { void reload() }, POLL_MS)
    return () => clearInterval(timer)
  }, [reload])

  const running = !!(data.meta && data.meta.lastTickAt && Date.now() - data.meta.lastTickAt < META_FRESH_MS)
  if (data.loaded && !loadedOnce.current) loadedOnce.current = true

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%', gap: 10, color: '#d4d4d8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5' }}>↩ Webhook 调试台</span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 8,
          background: running ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
          color: running ? '#3fb950' : '#f85149',
        }}>{running ? `捕获中 :${data.meta?.port ?? ''}` : '服务离线'}</span>
        {data.meta?.degraded && running && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(210,153,34,.15)', color: '#d29922' }}>kv 降级（捕获不受影响）</span>
        )}
        {running && (
          <span style={{ fontSize: 10, color: '#52525b' }}>
            累计 {data.meta?.capturesTotal ?? 0} 条 · 留痕 {data.meta?.filePath ? data.meta.filePath.split(/[\\/]/).slice(-1)[0] : '-'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
              border: '1px solid', minHeight: 32, whiteSpace: 'nowrap',
              borderColor: tab === t.id ? '#3b82f6' : '#3f3f46',
              background: tab === t.id ? 'rgba(59,130,246,.15)' : 'transparent',
              color: tab === t.id ? '#93c5fd' : '#a1a1aa',
            }}
          >{t.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {!data.loaded && <div style={{ color: '#71717a', fontSize: 12 }}>读取数据中…</div>}
        {data.loaded && !running && (
          <div style={{
            padding: 12, borderRadius: 8, border: '1px solid rgba(248,81,73,.35)',
            background: 'rgba(248,81,73,.08)', fontSize: 12, color: '#fca5a5', marginBottom: 8,
          }}>
            后台服务未运行：捕获地址不可用。去 <b>设置</b> 页启动服务（或检查端口 {9869} 是否被占用）。
          </div>
        )}
        {tab === 'live' && <LiveTab data={data} running={running} reload={reload} showToast={showToast} onSendToChat={onSendToChat} onGoTab={setTab} />}
        {tab === 'buckets' && <BucketsTab data={data} running={running} reload={reload} showToast={showToast} />}
        {tab === 'stats' && <StatsTab data={data} onSendToChat={onSendToChat} />}
        {tab === 'settings' && <SettingsTab data={data} reload={reload} showToast={showToast} running={running} />}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 16px', borderRadius: 8, fontSize: 12, maxWidth: '80%',
          background: toast.kind === 'good' ? 'rgba(63,185,80,.92)' : toast.kind === 'bad' ? 'rgba(248,81,73,.92)' : 'rgba(59,130,246,.92)',
          color: '#fff', zIndex: 50,
        }}>{toast.msg}</div>
      )}

      <div style={{ fontSize: 10, color: '#52525b' }}>
        数据只存本机（captures.jsonl + 本机 kv），无外发路径；敏感 payload 注意勿在共享屏幕时展示。
      </div>
    </div>
  )
}
