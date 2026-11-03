/**
 * Panel.tsx —— OpenAPI 调试台主面板：三 Tab（合同/调试/对比）+ 服务状态条
 */
import { useCallback, useEffect, useState } from 'react'
import type { EnvView, HistoryEntry, ServiceMeta, SpecSummary } from './model'
import { loadEnvs, loadHistory, loadMeta, loadSpecs, normalizeHistory } from './model'
import SpecsTab from './SpecsTab'
import CallTab from './CallTab'
import DiffTab from './DiffTab'

const S = {
  bar: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0 10px', borderBottom: '1px solid #30363D', marginBottom: 12, flexWrap: 'wrap' as const },
  tab: (active: boolean) => ({
    background: active ? '#1F6FEB' : 'transparent',
    color: active ? '#fff' : '#C9D1D9',
    border: '1px solid #30363D',
    borderRadius: 6,
    padding: '5px 14px',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  }),
  muted: { color: '#8B949E', fontSize: 12 },
}

type TabId = 'specs' | 'call' | 'diff'

export default function Panel() {
  const [tab, setTab] = useState<TabId>('specs')
  const [meta, setMeta] = useState<ServiceMeta | null>(null)
  const [specs, setSpecs] = useState<SpecSummary[]>([])
  const [envs, setEnvs] = useState<(EnvView & { specId: string })[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [activeSpecId, setActiveSpecId] = useState('')
  const [bridgeErr, setBridgeErr] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [m, sp, ev, h] = await Promise.all([loadMeta(), loadSpecs(), loadEnvs(), loadHistory()])
      setMeta(m)
      const items = sp && Array.isArray(sp.items) ? sp.items : []
      setSpecs(items)
      setEnvs(ev && Array.isArray(ev.items) ? ev.items : [])
      setHistory(normalizeHistory(h))
      setActiveSpecId((cur) => (cur && items.some((s) => s.id === cur) ? cur : (items.length ? items[items.length - 1].id : '')))
      setBridgeErr('')
    } catch (e) {
      setBridgeErr(String((e as Error).message))
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  const openDebug = useCallback((specId: string) => {
    setActiveSpecId(specId)
    setTab('call')
  }, [])

  const running = meta && meta.running

  return (
    <div style={{ color: '#E6EDF3', fontSize: 13, padding: '2px 4px 20px' }}>
      <div style={S.bar}>
        <button style={S.tab(tab === 'specs')} onClick={() => setTab('specs')}>合同{specs.length ? `（${specs.length}）` : ''}</button>
        <button style={S.tab(tab === 'call')} onClick={() => setTab('call')}>调试</button>
        <button style={S.tab(tab === 'diff')} onClick={() => setTab('diff')}>对比</button>
        <span style={{ flex: 1 }} />
        <span style={S.muted}>
          {meta
            ? (meta.degraded
              ? `⚠ 服务降级：${meta.lastBridgeErr || '桥不可达，60s 自动重试'}`
              : `服务 v${meta.version} · ${meta.specCount} 合同`)
            : '连接服务中…'}
        </span>
        {running ? <span style={{ ...S.muted, color: '#D29922' }}>请求中：{running.label}</span> : null}
      </div>

      {bridgeErr ? (
        <div style={{ color: '#FFA198', fontSize: 12, marginBottom: 10 }}>
          宿主通道异常：{bridgeErr}（cap.kv 不可达？请确认 Polaris 版本与插件服务状态）
        </div>
      ) : null}

      {tab === 'specs' ? (
        <SpecsTab specs={specs} onChanged={refresh} onOpenDebug={openDebug} />
      ) : null}
      {tab === 'call' ? (
        <CallTab
          specs={specs}
          activeSpecId={activeSpecId}
          setActiveSpecId={setActiveSpecId}
          envs={envs}
          history={history.filter((h) => !activeSpecId || h.specId === activeSpecId)}
          onChanged={refresh}
        />
      ) : null}
      {tab === 'diff' ? (
        <DiffTab specs={specs} />
      ) : null}
    </div>
  )
}
