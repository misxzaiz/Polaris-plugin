/**
 * EventsTab.tsx —— 容器事件流水（service 内存环形缓冲，3s 轮询）：类型筛选，回答「为什么重启/退出」
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, EventItem, ServiceError } from '../model'

const TYPE_COLORS: Record<string, string> = {
  container: '#9ecbff',
  image: '#d2a8ff',
  network: '#7ee787',
  volume: '#79c0ff',
}

function actionChip(action: string): string {
  if (['die', 'kill', 'oom', 'destroy', 'prune'].includes(action)) return '#f28b93'
  if (['start', 'restart'].includes(action)) return '#3fb950'
  if (action === 'stop' || action === 'pause') return '#d29922'
  return '#8b95a7'
}

export default function EventsTab({ engineOk }: { engineOk: boolean }) {
  const [items, setItems] = useState<EventItem[]>([])
  const [pumpRunning, setPumpRunning] = useState(false)
  const [type, setType] = useState('all')
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!engineOk) return
    try {
      const r = await api.events(500)
      setItems(r.items || [])
      setPumpRunning(r.pumpRunning)
      setErr('')
    } catch (e) {
      setErr((e as ServiceError).message || String(e))
    }
  }, [engineOk])

  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [load])

  const types = useMemo(() => Array.from(new Set(items.map((i) => i.type))), [items])
  const visible = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return items.filter((e) => {
      if (type !== 'all' && e.type !== type) return false
      if (kw && !`${e.type}/${e.action} ${e.actor} ${JSON.stringify(e.attrs)}`.toLowerCase().includes(kw)) return false
      return true
    })
  }, [items, type, q])

  if (!engineOk) return <div className="dk-pad dk-dim">Docker 引擎未连接。</div>

  return (
    <div className="dk-pad">
      <div className="dk-row">
        <select className="dk-select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">全部类型</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="dk-input" style={{ width: 200 }} placeholder="搜索动作/容器名" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="dk-grow" />
        <span className={`dk-small ${pumpRunning ? 'dk-ok' : 'dk-err'}`}>{pumpRunning ? '● 事件流已连接' : '○ 事件流未连接（引擎未就绪时会自动重连）'}</span>
        <button type="button" className="dk-btn dk-btn-sm" onClick={load}>刷新</button>
      </div>
      {err && <div className="dk-err dk-mt8">{err}</div>}
      <div className="dk-dim dk-small dk-mt8">service 启动以来的容器事件（内存环形缓冲 500 条，不落盘；重启 service 后清空）。</div>
      {!err && visible.length === 0 && <div className="dk-dim dk-mt8">暂无事件。</div>}
      {visible.length > 0 && (
        <table className="dk-table dk-mt8">
          <thead>
            <tr><th style={{ width: 90 }}>时间</th><th style={{ width: 160 }}>类型/动作</th><th>对象</th><th>明细</th></tr>
          </thead>
          <tbody>
            {visible.map((e, i) => (
              <tr key={`${e.time}-${i}`}>
                <td className="dk-mono dk-small">{new Date(e.time).toLocaleTimeString('zh-CN', { hour12: false })}</td>
                <td className="dk-mono dk-small" style={{ color: TYPE_COLORS[e.type] || '#8b95a7' }}>
                  {e.type}/<span style={{ color: actionChip(e.action) }}>{e.action}</span>
                </td>
                <td className="dk-mono dk-small">{e.actor || '—'}</td>
                <td className="dk-small dk-dim">
                  {Object.entries(e.attrs || {}).map(([k, v]) => `${k}=${v}`).join('  ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
