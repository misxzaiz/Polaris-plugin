/**
 * JSON Explorer ChatCard — result 模式
 * 渲染 search_json 结果。
 */
export default function JsonxCard({ data, onSendToChat }: {
  pluginId: string
  cardId: string
  toolName: string
  mode: 'result' | 'interaction'
  status: string
  data: unknown
  response?: unknown
  onSendToChat?: (msg: string) => void | Promise<void>
}) {
  const d = (data || {}) as { results?: Array<{ path: string; key: string; value: string }> }
  const results = d.results || []
  if (results.length === 0) return <div style={{ padding: 12, color: '#8E8E93', fontSize: 12 }}>未找到匹配</div>

  return (
    <div style={{ borderRadius: 8, border: '1px solid #3F3F46', background: '#1F1F24', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #3F3F46' }}>
        <span style={{ fontSize: 11, color: '#8E8E93' }}>JSON 搜索 · {results.length} 项</span>
        {onSendToChat && (
          <button onClick={() => onSendToChat(`请分析这些 JSON 路径的含义：\n\n${results.map(r => `${r.path} = ${r.value}`).join('\n')}`)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#2D2D33', color: '#B4B4B8', fontSize: 10, cursor: 'pointer' }}>分析</button>
        )}
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {results.map((r, i) => (
          <div key={i} style={{ padding: '6px 10px', borderBottom: '1px solid #2A2A30', fontFamily: 'monospace', fontSize: 11 }}>
            <div style={{ color: '#3B82F6' }}>{r.path}</div>
            <div style={{ color: '#10B981', marginTop: 2 }}>{typeof r.value === 'string' ? r.value.slice(0, 80) : JSON.stringify(r.value).slice(0, 80)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
