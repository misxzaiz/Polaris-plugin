/**
 * Panel.tsx —— LLM 请求调试台主面板：三 Tab（请求/端点/历史）+ 服务状态条
 */
import { useCallback, useEffect, useState } from 'react'
import type { HistoryEntry, MaskedEndpoint, ReqRecord, ServiceMeta } from './model'
import { loadEndpoints, loadHistory, loadMeta, normalizeHistory, sendCommand } from './model'
import RequestTab from './RequestTab'
import EndpointsTab from './EndpointsTab'
import HistoryTab from './HistoryTab'

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

type TabId = 'request' | 'endpoints' | 'history'

export default function Panel() {
  const [tab, setTab] = useState<TabId>('request')
  const [meta, setMeta] = useState<ServiceMeta | null>(null)
  const [endpoints, setEndpoints] = useState<MaskedEndpoint[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [models, setModels] = useState<Record<string, string[]>>({})
  const [initialRawBody, setInitialRawBody] = useState<Record<string, unknown> | null>(null)
  const [bridgeErr, setBridgeErr] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [m, eps, h] = await Promise.all([loadMeta(), loadEndpoints(), loadHistory()])
      setMeta(m)
      setEndpoints(eps && Array.isArray(eps.items) ? eps.items : [])
      setHistory(normalizeHistory(h))
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

  /** 拉某端点模型表（缓存在面板本地，供 model datalist 与端点页展示） */
  const fetchModels = useCallback(async (endpointId: string) => {
    try {
      const r = await sendCommand('models', { endpointId }, 25000)
      if (r && r.ok && Array.isArray(r.models)) setModels((prev) => ({ ...prev, [endpointId]: r.models }))
    } catch (_) { /* 模型表失败不打断主流程 */ }
  }, [])

  /** 从历史详情跳回请求页：载入请求体 */
  const openInRequest = useCallback((record: ReqRecord) => {
    setInitialRawBody(record.body)
    setTab('request')
  }, [])

  const running = meta && meta.running

  return (
    <div style={{ color: '#E6EDF3', fontSize: 13, padding: '2px 4px 20px' }}>
      <div style={S.bar}>
        <button style={S.tab(tab === 'request')} onClick={() => { setInitialRawBody(null); setTab('request') }}>请求</button>
        <button style={S.tab(tab === 'endpoints')} onClick={() => setTab('endpoints')}>端点{endpoints.length ? `（${endpoints.length}）` : ''}</button>
        <button style={S.tab(tab === 'history')} onClick={() => setTab('history')}>历史{history.length ? `（${history.length}）` : ''}</button>
        <span style={{ flex: 1 }} />
        <span style={S.muted}>
          {meta
            ? (meta.degraded
              ? `⚠ 服务降级：${meta.lastBridgeErr || '桥不可达，60s 自动重试'}`
              : `服务 v${meta.version} · ${meta.endpointCount} 端点`)
            : '连接服务中…'}
        </span>
        {running ? <span style={{ ...S.muted, color: '#D29922' }}>发送中：{running.endpointName}</span> : null}
      </div>

      {bridgeErr ? (
        <div style={{ color: '#FFA198', fontSize: 12, marginBottom: 10 }}>
          宿主通道异常：{bridgeErr}（cap.kv 不可达？请确认 Polaris 版本与插件服务状态）
        </div>
      ) : null}

      {tab === 'request' ? (
        <RequestTab
          endpoints={endpoints}
          models={models}
          onEndpointsChanged={() => { refresh(); if (endpoints.length) fetchModels(endpoints[0].id) }}
          initialRawBody={initialRawBody}
        />
      ) : null}
      {tab === 'endpoints' ? (
        <EndpointsTab
          endpoints={endpoints}
          models={models}
          onChanged={() => { refresh(); }}
        />
      ) : null}
      {tab === 'history' ? (
        <HistoryTab history={history} onOpenRequest={openInRequest} />
      ) : null}
    </div>
  )
}
