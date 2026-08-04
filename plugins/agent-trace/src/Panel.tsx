import { useState, useEffect, useCallback } from 'react'

/**
 * Agent Trace Panel
 * 时间线列表 + 调用详情 + 过滤 + 统计 + 清空/导出。
 */

interface Trace {
  id: string
  ts: number
  tool: string
  args: unknown
  result: string
  ms: number
  error: string | null
}

export default function AgentTracePanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void
}) {
  const [traces, setTraces] = useState<Trace[]>([])
  const [selected, setSelected] = useState<Trace | null>(null)
  const [filterTool, setFilterTool] = useState('')
  const [errorOnly, setErrorOnly] = useState(false)
  const [stats, setStats] = useState<{ total: number; errors: number; errorRate: string; avgMs: number; byTool: Record<string, number> } | null>(null)

  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem('polaris.agenttrace.traces')
      if (raw) setTraces(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const persist = (next: Trace[]) => {
    setTraces(next)
    localStorage.setItem('polaris.agenttrace.traces', JSON.stringify(next))
  }

  // 本地添加（手动记录演示用）
  const addLocal = () => {
    const tool = prompt('工具名')
    if (!tool) return
    const tr: Trace = { id: 't' + Date.now().toString(36), ts: Date.now(), tool, args: {}, result: '(手动记录)', ms: Math.floor(Math.random() * 500), error: null }
    persist([tr, ...traces])
  }

  const askAIStats = () => {
    onSendToChat?.('请用 agent-trace 的 trace_stats 工具给我追踪统计')
  }

  const filtered = traces.filter(t =>
    (!filterTool || t.tool.includes(filterTool)) && (!errorOnly || t.error)
  )

  const clear = () => {
    if (confirm('清空所有追踪？')) persist([])
    setSelected(null)
  }

  const exportLocal = () => {
    const jsonl = traces.map(t => JSON.stringify(t)).join('\n')
    const blob = new Blob([jsonl], { type: 'application/jsonl' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `traces-${Date.now()}.jsonl`
    a.click()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13 }}>
      {/* 工具栏 */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid #3F3F46', flexWrap: 'wrap' }}>
        <input value={filterTool} onChange={(e) => setFilterTool(e.target.value)} placeholder="过滤工具名…" style={{ flex: 1, minWidth: 80, padding: '4px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 11, outline: 'none' }} />
        <button onClick={() => setErrorOnly(!errorOnly)} style={errorOnly ? activeBtn : btnStyle}>{errorOnly ? '✓ 仅错误' : '仅错误'}</button>
        <button onClick={addLocal} style={btnStyle}>+</button>
        <button onClick={exportLocal} style={btnStyle}>导出</button>
        <button onClick={askAIStats} style={btnStyle}>统计</button>
        <button onClick={clear} style={{ ...btnStyle, color: '#EF4444' }}>清空</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? <div style={{ color: '#8E8E93', textAlign: 'center', padding: 24, fontSize: 11 }}>暂无追踪记录</div> :
          filtered.slice(0, 200).map(t => (
            <div key={t.id} onClick={() => setSelected(t)} style={{ padding: '8px 10px', borderBottom: '1px solid #2A2A30', cursor: 'pointer', background: selected?.id === t.id ? '#2D2D33' : 'transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 500, fontFamily: 'monospace' }}>{t.tool}</span>
                <span style={{ fontSize: 10, color: t.error ? '#EF4444' : '#10B981' }}>{t.error ? '✗' : '✓'} {t.ms}ms</span>
              </div>
              <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{new Date(t.ts).toLocaleTimeString()} · {t.error || t.result.slice(0, 60)}</div>
            </div>
          ))
        }
      </div>

      {/* 详情 */}
      {selected && (
        <div style={{ borderTop: '1px solid #3F3F46', padding: 10, maxHeight: '40%', overflowY: 'auto', background: '#1F1F24' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{selected.tool}</span>
            <button onClick={() => setSelected(null)} style={{ ...btnStyle, padding: '2px 6px' }}>✕</button>
          </div>
          <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 8 }}>{new Date(selected.ts).toLocaleString()} · {selected.ms}ms · {selected.id}</div>
          {selected.error && <div style={{ fontSize: 11, color: '#EF4444', padding: 6, background: '#EF444422', borderRadius: 4, marginBottom: 6 }}>{selected.error}</div>}
          <div style={{ fontSize: 10, color: '#8E8E93', marginBottom: 2 }}>参数</div>
          <pre style={{ margin: '0 0 6px', fontSize: 11, color: '#B4B4B8', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{JSON.stringify(selected.args, null, 2)}</pre>
          <div style={{ fontSize: 10, color: '#8E8E93', marginBottom: 2 }}>结果</div>
          <pre style={{ margin: 0, fontSize: 11, color: '#10B981', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{selected.result}</pre>
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#F8F8F8', fontSize: 11, cursor: 'pointer' }
const activeBtn: React.CSSProperties = { ...btnStyle, background: '#F59E0B22', color: '#F59E0B', borderColor: '#F59E0B' }
