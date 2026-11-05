/**
 * 面板组装：三个 Tab（扫描 / 矩阵 / 设置）。
 * 数据面 cap.kv i18n.*；扫描与落盘 127.0.0.1 直连自家服务。
 */
import { useCallback, useEffect, useState } from 'react'
import ScanTab from './ScanTab'
import MatrixTab from './MatrixTab'
import SettingsTab from './SettingsTab'
import { getMeta, metaAlive, type ScanResult, type ServiceMeta } from './model'

export interface PanelCtx {
  pluginId: string
  onSendToChat?: (text: string) => void | Promise<void>
}

type TabId = 'scan' | 'matrix' | 'settings'

const TABS: { id: TabId; label: string }[] = [
  { id: 'scan', label: '扫描' },
  { id: 'matrix', label: '矩阵' },
  { id: 'settings', label: '设置' },
]

export default function Panel(props: PanelCtx) {
  const ctx = props
  const [tab, setTab] = useState<TabId>('scan')
  const [meta, setMeta] = useState<ServiceMeta | null>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)

  const refreshMeta = useCallback(async () => {
    const m = await getMeta()
    setMeta(m)
    setOnline(metaAlive(m))
  }, [])

  useEffect(() => {
    refreshMeta()
    const t = setInterval(refreshMeta, 30 * 1000)
    return () => clearInterval(t)
  }, [refreshMeta])

  const alive = online === true && !!meta

  return (
    <div style={{ fontFamily: 'inherit', fontSize: 13, color: 'var(--polaris-text, #d4d4d8)', padding: 12, maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>多语言键同步台</strong>
        <span
          title={alive ? '服务在线' : '服务未运行：宿主会自动拉起，稍等片刻或去 设置→插件→i18n-sync 查看'}
          style={{
            fontSize: 11, padding: '1px 8px', borderRadius: 999,
            background: alive ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
            color: alive ? '#22c55e' : '#ef4444',
          }}
        >
          {alive ? '服务在线' : online === null ? '检测中…' : '服务未运行'}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '4px 12px', borderRadius: 6, border: '1px solid transparent', cursor: 'pointer',
                background: tab === t.id ? 'var(--polaris-accent, #6366f1)' : 'transparent',
                color: tab === t.id ? '#fff' : 'inherit',
                borderColor: tab === t.id ? 'transparent' : 'var(--polaris-border, #3f3f46)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {!alive && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(234,179,8,.1)', border: '1px solid rgba(234,179,8,.3)', marginBottom: 10, lineHeight: 1.6 }}>
          后台服务未运行，扫描与落盘不可用。宿主对已启用插件会自动拉起服务（30s 心跳，3 次失败自动重启）；
          也可到 <b>设置 → 插件 → 多语言键同步台</b> 手动启动。MCP 工具（对话里的 i18n_status 等）不依赖本服务，始终可用。
        </div>
      )}

      {tab === 'scan' && <ScanTab ctx={ctx} meta={meta} scan={scan} onScanDone={setScan} goMatrix={() => setTab('matrix')} />}
      {tab === 'matrix' && <MatrixTab ctx={ctx} meta={meta} scan={scan} onScanDone={setScan} />}
      {tab === 'settings' && <SettingsTab ctx={ctx} meta={meta} onMetaRefresh={refreshMeta} />}
    </div>
  )
}
