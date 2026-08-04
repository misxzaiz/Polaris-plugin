/**
 * Agent Trace ChatCard — result 模式
 * 渲染 query_traces 的调用时间线。
 */
export default function AgentTraceCard({ data, onSendToChat }: {
  pluginId: string
  cardId: string
  toolName: string
  mode: 'result' | 'interaction'
  status: string
  data: unknown
  response?: unknown
  onSendToChat?: (msg: string) => void | Promise<void>
}) {
  const d = (data || {}) as { traces?: Array<{ ts: number; tool: string; ms: number; error: string | null; result: string }>; total?: number }
  const traces = d.traces || []
  if (traces.length === 0) return <div style={{ padding: 12, color: '#8E8E93', fontSize: 12 }}>无追踪记录</div>

  return (
    <div style={{ borderRadius: 8, border: '1px solid #3F3F46', background: '#1F1F24', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #3F3F46' }}>
        <span style={{ fontSize: 11, color: '#8E8E93' }}>调用追踪 · {traces.length} 条{d.total ? ` (共 ${d.total})` : ''}</span>
        {onSendToChat && (
          <button onClick={() => onSendToChat(`请分析这些工具调用的模式，找出异常或优化点：\n\n${traces.slice(0, 5).map(t => `[${t.tool}] ${t.ms}ms ${t.error ? '✗' : '✓'}`).join('\n')}`)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#2D2D33', color: '#B4B4B8', fontSize: 10, cursor: 'pointer' }}>分析</button>
        )}
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {traces.map((t, i) => (
          <div key={i} style={{ padding: '6px 10px', borderBottom: '1px solid #2A2A30', fontSize: 11, fontFamily: 'monospace' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#F8F8F8' }}>{new Date(t.ts).toLocaleTimeString()} {t.tool}</span>
              <span style={{ color: t.error ? '#EF4444' : '#10B981' }}>{t.error ? '✗' : '✓'} {t.ms}ms</span>
            </div>
            {t.error && <div style={{ color: '#EF4444', marginTop: 2, fontSize: 10 }}>{t.error}</div>}
            {!t.error && t.result && <div style={{ color: '#8E8E93', marginTop: 2, fontSize: 10 }}>{t.result.slice(0, 80)}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
