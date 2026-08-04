/**
 * Literature ChatCard — result 模式
 * 渲染 extract_paper 的结构化字段。
 */
export default function LiteratureCard({ data, onSendToChat }: {
  pluginId: string
  cardId: string
  toolName: string
  mode: 'result' | 'interaction'
  status: string
  data: unknown
  response?: unknown
  onSendToChat?: (msg: string) => void | Promise<void>
}) {
  const d = (data || {}) as { paper?: Record<string, string> }
  const p = d.paper
  if (!p) return <div style={{ padding: 12, color: '#8E8E93', fontSize: 12 }}>无提取结果</div>

  const fields = [
    ['标题', p.title], ['作者', p.authors], ['年份', p.year],
    ['方法', p.method], ['样本', p.sample], ['结论', p.conclusion], ['局限', p.limitation],
  ]

  return (
    <div style={{ borderRadius: 8, border: '1px solid #3F3F46', background: '#1F1F24', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #3F3F46' }}>
        <span style={{ fontSize: 11, color: '#8E8E93' }}>论文结构化</span>
        {onSendToChat && (
          <button onClick={() => onSendToChat(`请基于这篇论文的提取结果，帮我写一段综述段落：\n\n标题: ${p.title}\n方法: ${p.method}\n结论: ${p.conclusion}`)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#2D2D33', color: '#B4B4B8', fontSize: 10, cursor: 'pointer' }}>写综述</button>
        )}
      </div>
      <div style={{ padding: 12 }}>
        {fields.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12 }}>
            <span style={{ color: '#8E8E93', width: 50, flexShrink: 0 }}>{k}</span>
            <span style={{ color: v === '（待补）' ? '#6B7280' : '#F8F8F8' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
