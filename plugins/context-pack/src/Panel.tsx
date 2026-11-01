/**
 * 上下文打包台面板：Tab 组装 + 服务心跳轮询 + Toast
 *
 * 数据面：cap.kv 投影（meta 2.5s 轮询；settings 惰性读）。
 * 打包主流程（扫描→勾选→预算→打包→出包）由 PackTab 自持状态。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import PackTab from './tabs/PackTab'
import HistoryTab from './tabs/HistoryTab'
import SettingsTab from './tabs/SettingsTab'
import { getMeta, getSettings, type CpkMeta, type Settings } from './model'

export type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

const META_FRESH_MS = 90 * 1000
const POLL_MS = 2500

const TABS: Array<{ id: string; label: string }> = [
  { id: 'pack', label: '打包' },
  { id: 'history', label: '包历史' },
  { id: 'settings', label: '设置' },
]

export default function Panel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void | Promise<void>
}) {
  void pluginId
  const [tab, setTab] = useState('pack')
  const [meta, setMeta] = useState<CpkMeta | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  const showToast: Toast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  useEffect(() => {
    let alive = true
    const reload = async () => {
      try {
        const [m, s] = await Promise.all([getMeta(), getSettings()])
        if (!alive) return
        setMeta(m)
        setSettings(s)
      } catch (_) { /* 轮询容忍 */ }
      if (alive) setLoaded(true)
    }
    void reload()
    const timer = setInterval(() => { void reload() }, POLL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  const running = !!(meta && meta.lastTickAt && Date.now() - meta.lastTickAt < META_FRESH_MS)

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%', gap: 10, color: '#d4d4d8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5' }}>📦 上下文打包台</span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 8,
          background: running ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
          color: running ? '#3fb950' : '#f85149',
        }}>{running ? '服务运行中' : '服务离线'}</span>
        {running && meta?.degraded && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(210,153,34,.15)', color: '#d29922' }}>kv 降级</span>
        )}
        <span style={{ fontSize: 10, color: '#52525b' }}>目录 → LLM 上下文包 · 全程本机</span>
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
        {!loaded && <div style={{ color: '#71717a', fontSize: 12 }}>读取数据中…</div>}
        {loaded && !running && (
          <div style={{
            padding: 12, borderRadius: 8, border: '1px solid rgba(248,81,73,.35)',
            background: 'rgba(248,81,73,.08)', fontSize: 12, color: '#fca5a5', marginBottom: 8,
          }}>
            后台服务未运行：扫描/打包不可用。去 <b>设置</b> 页启动服务（或检查端口 {9872} 是否被占用）。
          </div>
        )}
        {tab === 'pack' && <PackTab running={running} showToast={showToast} onSendToChat={onSendToChat} />}
        {tab === 'history' && <HistoryTab showToast={showToast} onGoTab={setTab} />}
        {tab === 'settings' && <SettingsTab meta={meta} settings={settings} running={running} showToast={showToast} />}
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
        只读扫描指定目录；包文件落本机 polaris-context/bundles/，无外发路径。token 数为启发式估算。
      </div>
    </div>
  )
}
