/**
 * Prompt Vault ChatCard — result 模式
 * 渲染 render_prompt 的输出，高亮缺失变量。
 */
export default function PromptVaultCard({ data, onSendToChat }: {
  pluginId: string
  cardId: string
  toolName: string
  mode: 'result' | 'interaction'
  status: string
  data: unknown
  response?: unknown
  onSendToChat?: (msg: string) => void | Promise<void>
}) {
  const d = (data || {}) as { rendered?: string; vars?: string[]; missing?: string[]; version?: number }
  if (!d.rendered) {
    return <div style={{ padding: 12, color: '#8E8E93', fontSize: 12 }}>无渲染结果</div>
  }

  return (
    <div style={{ borderRadius: 8, border: '1px solid #3F3F46', background: '#1F1F24', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #3F3F46' }}>
        <span style={{ fontSize: 11, color: '#8E8E93' }}>
          渲染结果{d.version ? ` · v${d.version}` : ''}
          {d.missing && d.missing.length > 0 && <span style={{ color: '#F59E0B', marginLeft: 6 }}>⚠ 缺 {d.missing.length} 变量</span>}
        </span>
        {onSendToChat && (
          <button onClick={() => onSendToChat(`这个 prompt 渲染结果如何？能否优化模板？\n\n${d.rendered}`)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#2D2D33', color: '#B4B4B8', fontSize: 10, cursor: 'pointer' }}>优化</button>
        )}
      </div>

      {d.missing && d.missing.length > 0 && (
        <div style={{ padding: '6px 10px', borderBottom: '1px solid #3F3F46', background: '#F59E0B11', fontSize: 10, color: '#F59E0B' }}>
          未提供: {d.missing.join(', ')}
        </div>
      )}

      <div style={{ padding: 12, maxHeight: 300, overflow: 'auto' }}>
        <pre style={{ margin: 0, fontSize: 12, color: '#10B981', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', lineHeight: 1.6 }}>{d.rendered}</pre>
      </div>

      {d.vars && d.vars.length > 0 && (
        <details style={{ borderTop: '1px solid #3F3F46', padding: '6px 10px' }}>
          <summary style={{ cursor: 'pointer', fontSize: 10, color: '#6B7280' }}>变量 ({d.vars.length})</summary>
          <div style={{ marginTop: 4, fontSize: 10, color: '#3B82F6', fontFamily: 'monospace' }}>{d.vars.map(v => '{{' + v + '}}').join('  ')}</div>
        </details>
      )}
    </div>
  )
}
