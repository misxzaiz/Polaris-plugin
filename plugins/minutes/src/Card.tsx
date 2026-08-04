/**
 * Minutes ChatCard — result 模式
 * AI 调用 structure_minutes 后渲染分节纪要，支持复制与迭代。
 */
export default function MinutesCard({ data, onSendToChat }: {
  pluginId: string
  cardId: string
  toolName: string
  mode: 'result' | 'interaction'
  status: string
  data: unknown
  response?: unknown
  onSendToChat?: (msg: string) => void | Promise<void>
}) {
  const d = (data || {}) as { template?: string; markdown?: string; sections?: string[]; actions?: Array<{ task: string; owner?: string; deadline?: string }> }
  if (!d.markdown) {
    return <div style={{ padding: 12, color: '#8E8E93', fontSize: 12 }}>无结构化内容</div>
  }

  return (
    <div style={{ borderRadius: 8, border: '1px solid #3F3F46', background: '#1F1F24', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #3F3F46' }}>
        <span style={{ fontSize: 11, color: '#8E8E93' }}>{d.template || '纪要'} · {d.sections?.length || 0} 节</span>
        {onSendToChat && (
          <button onClick={() => onSendToChat(`请基于以下纪要继续完善，补充缺失的负责人与截止日期：\n\n${d.markdown}`)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#2D2D33', color: '#B4B4B8', fontSize: 10, cursor: 'pointer' }}>完善</button>
        )}
      </div>

      {d.actions && d.actions.length > 0 && (
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #3F3F46', background: '#F59E0B11' }}>
          <div style={{ fontSize: 10, color: '#F59E0B', marginBottom: 4 }}>待办 ({d.actions.length})</div>
          {d.actions.map((a, i) => (
            <div key={i} style={{ fontSize: 11, color: '#B4B4B8', marginBottom: 2 }}>
              ☐ {a.task}{a.owner ? ` <span style="color:#3B82F6">@${a.owner}</span>` : ''}{a.deadline ? ` ⏰${a.deadline}` : ''}
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: 12, overflow: 'auto', maxHeight: 300 }}>
        <pre style={{ margin: 0, fontSize: 12, color: '#F8F8F8', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', lineHeight: 1.6 }}>{d.markdown}</pre>
      </div>

      <details style={{ borderTop: '1px solid #3F3F46', padding: '6px 10px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 10, color: '#6B7280' }}>分节</summary>
        <div style={{ marginTop: 4, fontSize: 11, color: '#8E8E93' }}>{d.sections?.join(' · ')}</div>
      </details>
    </div>
  )
}
