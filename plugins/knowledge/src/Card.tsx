/**
 * Knowledge ChatCard — result 模式
 * 渲染 search_notes 搜索结果。
 */
export default function KnowledgeCard({ data, onSendToChat }: {
  pluginId: string
  cardId: string
  toolName: string
  mode: 'result' | 'interaction'
  status: string
  data: unknown
  response?: unknown
  onSendToChat?: (msg: string) => void | Promise<void>
}) {
  const d = (data || {}) as { results?: Array<{ id: string; text: string; tags: string[] }>; total?: number }
  const results = d.results || []
  if (results.length === 0) return <div style={{ padding: 12, color: '#8E8E93', fontSize: 12 }}>未找到匹配知识</div>

  return (
    <div style={{ borderRadius: 8, border: '1px solid #3F3F46', background: '#1F1F24', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #3F3F46' }}>
        <span style={{ fontSize: 11, color: '#8E8E93' }}>知识检索 · {results.length} 条{d.total ? ` (共 ${d.total})` : ''}</span>
        {onSendToChat && (
          <button onClick={() => onSendToChat(`基于这些知识条目回答我的问题：\n\n${results.slice(0, 5).map(r => r.text.slice(0, 80)).join('\n---\n')}`)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#2D2D33', color: '#B4B4B8', fontSize: 10, cursor: 'pointer' }}>用此回答</button>
        )}
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {results.map((r, i) => (
          <div key={i} style={{ padding: '8px 10px', borderBottom: '1px solid #2A2A30' }}>
            <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>{r.id} {r.tags.length > 0 && `· ${r.tags.map(t => '#' + t).join(' ')}`}</div>
            <div style={{ fontSize: 12, color: '#F8F8F8', lineHeight: 1.5 }}>{r.text.slice(0, 150)}{r.text.length > 150 ? '…' : ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
