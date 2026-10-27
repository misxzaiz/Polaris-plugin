/**
 * 质量 Tab：错误分类 / 重试 / TTFT / 工具遥测 / 完整漏钱洞察
 */
import type { PanelData } from './model'
import { fmtTokens } from './model'

interface Ctx { data: PanelData; refresh: () => Promise<void>; showToast: (t: string, k?: 'good' | 'bad' | '') => void }

export default function QualityTab({ ctx }: { ctx: Ctx }) {
  const { data } = ctx
  const q = data.quality
  if (!q) return <div className="ab-empty">暂无质量数据——服务首扫后出现。</div>

  const errRows = Object.entries(q.errorsByType || {}).sort((a, b) => b[1] - a[1])
  const maxErr = Math.max(1, ...errRows.map(([, n]) => n))
  const maxTool = Math.max(1, ...(q.tools.byName || []).map((t) => t.n))

  return (
    <div>
      <div className="ab-sec"><i className="ab-bar" />错误与等待<small className="ab-hint">zcode 遥测口径</small></div>
      <div className="ab-statrow">
        <div className="ab-stat">
          <b className={q.ttftP50 ? '' : 'muted'}>{q.ttftP50 ? `${(q.ttftP50 / 1000).toFixed(1)}s` : '—'}</b>
          <small>TTFT P50{q.ttftP90 ? `（P90 ${(q.ttftP90 / 1000).toFixed(1)}s）` : ''}</small>
        </div>
        <div className="ab-stat">
          <b className={q.durP50 ? '' : 'muted'}>{q.durP50 ? `${Math.round(q.durP50 / 1000)}s` : '—'}</b>
          <small>请求时长 P50{q.durP90 ? `（P90 ${Math.round(q.durP90 / 1000)}s）` : ''}</small>
        </div>
        <div className="ab-stat">
          <b className="amber">{q.retriedRows}</b>
          <small>重试请求行 / {q.zcodeRows} 总行</small>
        </div>
      </div>
      <div className="ab-card"><div className="ab-card-b">
        {errRows.length === 0 ? (
          <div className="ab-sub">零错误请求——干净。</div>
        ) : errRows.map(([type, n]) => (
          <div key={type} className="ab-insight info">
            <span className="ic" style={{ width: 16, textAlign: 'center' }}>⛔</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b style={{ fontSize: 11.5 }}>{type}</b>
                <span className="ab-num" style={{ color: n > 100 ? '#FF8A9A' : '#F2C063' }}>{n} 次</span>
              </div>
              <div style={{ height: 4, background: '#222936', borderRadius: 2, marginTop: 3 }}>
                <div style={{ width: `${(n / maxErr) * 100}%`, height: '100%', borderRadius: 2, background: '#F85149' }} />
              </div>
            </div>
          </div>
        ))}
      </div></div>

      <div className="ab-sec"><i className="ab-bar" />工具遥测<small className="ab-hint">共 {q.tools.total} 次 · 破坏性 {q.tools.destructive} 次</small></div>
      <div className="ab-card"><div className="ab-card-b">
        {(q.tools.byName || []).length === 0 ? (
          <div className="ab-sub">暂无工具遥测。</div>
        ) : q.tools.byName.map((t) => (
          <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5 }}>{t.name}</span>
            <div style={{ flex: 1, height: 6, background: '#222936', borderRadius: 3 }}>
              <div style={{ width: `${(t.n / maxTool) * 100}%`, height: '100%', borderRadius: 3, background: '#4C8DFF' }} />
            </div>
            <span className="ab-num" style={{ width: 96, textAlign: 'right', fontSize: 10.5, color: '#8B95A7' }}>
              ×{t.n}{t.avgDurMs ? ` · ${t.avgDurMs >= 1000 ? `${(t.avgDurMs / 1000).toFixed(1)}s` : `${t.avgDurMs}ms`}` : ''}{t.destructive ? ' ⚠️' : ''}
            </span>
          </div>
        ))}
      </div></div>

      <div className="ab-sec"><i className="ab-bar" />漏钱洞察（全部）</div>
      <div className="ab-card"><div className="ab-card-b">
        {(!q.insights || q.insights.length === 0) ? (
          <div className="ab-sub">暂无洞察。</div>
        ) : q.insights.map((i, idx) => (
          <div key={`${i.code}-${idx}`} className={`ab-insight ${i.level}`}>
            <span className="ic">{i.level === 'warn' ? '⚠️' : i.level === 'good' ? '💰' : '🔍'}</span>
            <span className="tx">{i.text}</span>
          </div>
        ))}
      </div></div>

      <div className="ab-sec"><i className="ab-bar" />口径说明</div>
      <div className="ab-card"><div className="ab-card-b ab-caliber">
        错误/重试/TTFT/工具来自 ZCode 的 model_usage / tool_usage 遥测表，是逐请求的真实记录；
        限流（rate_limited）一般不产生计费 token，但产生真实等待时间。
        {data.summary ? ` 当前累计 ${fmtTokens(data.summary.all.fin + data.summary.all.cr)} 输入 token 中有 ${((data.summary.all.cr / Math.max(1e-9, data.summary.all.fin + data.summary.all.cr)) * 100).toFixed(1)}% 走了缓存。` : ''}
      </div></div>
    </div>
  )
}
