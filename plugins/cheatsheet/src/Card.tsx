/**
 * Cheatsheet ChatCard — result 模式
 * 渲染 search_commands 命令搜索结果。
 */
export default function CheatsheetCard({ data, onSendToChat }: {
  pluginId: string
  cardId: string
  toolName: string
  mode: 'result' | 'interaction'
  status: string
  data: unknown
  response?: unknown
  onSendToChat?: (msg: string) => void | Promise<void>
}) {
  const d = (data || {}) as { results?: Array<{ id: string; cmd: string; desc: string; category: string; example: string }>; total?: number }
  const results = d.results || []
  if (results.length === 0) return <div style={{ padding: 12, color: '#8E8E93', fontSize: 12 }}>未找到匹配命令</div>

  return (
    <div style={{ borderRadius: 8, border: '1px solid #3F3F46', background: '#1F1F24', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #3F3F46' }}>
        <span style={{ fontSize: 11, color: '#8E8E93' }}>命令速查 · {results.length} 条{d.total ? ` (共 ${d.total})` : ''}</span>
        {onSendToChat && (
          <button onClick={() => onSendToChat(`请详细解释这些命令的用法：\n\n${results.map(r => r.cmd).join('\n')}`)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#2D2D33', color: '#B4B4B8', fontSize: 10, cursor: 'pointer' }}>详解</button>
        )}
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {results.map((r, i) => (
          <div key={i} style={{ padding: '8px 10px', borderBottom: '1px solid #2A2A30' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <code style={{ fontSize: 12, color: '#3B82F6', fontFamily: 'ui-monospace, monospace' }}>{r.cmd}</code>
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#3F3F46', color: '#8E8E93' }}>{r.category}</span>
            </div>
            <div style={{ fontSize: 11, color: '#B4B4B8', marginTop: 2 }}>{r.desc}</div>
            {r.example && <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2, fontFamily: 'monospace' }}>例: {r.example}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
