/**
 * Mock 接口台面板：Tab 组装 + 轮询 + Toast
 *
 * 数据面：cap.kv 投影（meta/settings/idx/hist 每 2.5s 轮询）；
 * 服务状态徽章据 meta 心跳渲染；控制面写（路由 CRUD/自检/试一发）全走 kv。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import RoutesTab from './tabs/RoutesTab'
import HistoryTab from './tabs/HistoryTab'
import SelftestTab from './tabs/SelftestTab'
import SettingsTab from './tabs/SettingsTab'
import { getIdx, getMeta, getSelftestReport, getSettings, readHistChunks, type HistRec, type MockIdx, type MockMeta, type MockSettings, type SelftestReport } from './model'

export type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

const META_FRESH_MS = 90 * 1000
const POLL_MS = 2500

const TABS: Array<{ id: string; label: string }> = [
  { id: 'routes', label: '路由' },
  { id: 'history', label: '历史' },
  { id: 'selftest', label: '自检' },
  { id: 'settings', label: '设置' },
]

export interface PanelData {
  meta: MockMeta | null
  settings: MockSettings | null
  idx: MockIdx | null
  history: HistRec[]
  selftestReport: SelftestReport | null
  loaded: boolean
}

export default function Panel({ pluginId, onSendToChat }: { pluginId: string; onSendToChat?: (m: string) => void }) {
  const [tab, setTab] = useState('routes')
  const [data, setData] = useState<PanelData>({ meta: null, settings: null, idx: null, history: [], selftestReport: null, loaded: false })
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
      const [history, selftestReport] = await Promise.all([readHistChunks(idx?.chunkCount || 0), getSelftestReport()])
      const next: PanelData = { meta, settings, idx, history, selftestReport, loaded: true }
      setData(next)
      return next
    } catch (_) {
      const next: PanelData = { meta: null, settings: null, idx: null, history: [], selftestReport: null, loaded: true }
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
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5' }}>⌗ Mock 接口台</span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 8,
          background: running ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
          color: running ? '#3fb950' : '#f85149',
        }}>{running ? `服务中 :${data.meta?.port ?? ''}` : '服务离线'}</span>
        {data.meta?.degraded && running && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(210,153,34,.15)', color: '#d29922' }}>kv 降级（mock 应答不受影响）</span>
        )}
        {running && (
          <span style={{ fontSize: 10, color: '#52525b' }}>
            路由 {data.meta?.enabledCount ?? 0}/{data.meta?.routeCount ?? 0} 启用 · 历史累计 {data.meta?.histTotal ?? 0}
          </span>
        )}
      </div>

      <div style={{
        fontSize: 11, padding: '6px 10px', borderRadius: 8,
        background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.25)', color: '#93c5fd',
      }}>
        把前端/测试的 baseURL 指向 <code style={{ color: '#bfdbfe' }}>http://127.0.0.1:{data.meta?.port ?? 9868}</code>，未匹配的路径会返回带提示的 404 诊断体。路由改完 3 秒内生效。
      </div>

      <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
              border: '1px solid', minHeight: 32, whiteSpace: 'nowrap',
              borderColor: tab === tb.id ? '#3b82f6' : '#3f3f46',
              background: tab === tb.id ? 'rgba(59,130,246,.15)' : 'transparent',
              color: tab === tb.id ? '#93c5fd' : '#a1a1aa',
            }}
          >{tb.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {!data.loaded && <div style={{ color: '#71717a', fontSize: 12 }}>读取数据中…</div>}
        {data.loaded && !running && (
          <div style={{
            padding: 12, borderRadius: 8, border: '1px solid rgba(248,81,73,.35)',
            background: 'rgba(248,81,73,.08)', fontSize: 12, color: '#fca5a5', marginBottom: 8,
          }}>
            后台服务未运行：mock 地址不可用（路由编辑仍可进行，生效要等服务起来）。去 <b>设置</b> 页启动服务（或检查端口 9868 是否被占用）。
          </div>
        )}
        {tab === 'routes' && <RoutesTab data={data} running={running} reload={reload} showToast={showToast} />}
        {tab === 'history' && <HistoryTab data={data} running={running} showToast={showToast} />}
        {tab === 'selftest' && <SelftestTab data={data} running={running} reload={reload} showToast={showToast} />}
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
        仅监听 127.0.0.1；历史只保留最近 500 条且服务重启清空；路由/设置存本机 kv，数据不出本机。
      </div>
    </div>
  )
}
