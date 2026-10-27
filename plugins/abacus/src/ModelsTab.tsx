/**
 * 模型 Tab：模型账本表（成本/请求数/缓存命中/TTFT/错误/近 30 天）
 */
import { fmtTokens, fmtUsd, fmtCny, type PanelData } from './model'

interface Ctx { data: PanelData; refresh: () => Promise<void>; showToast: (t: string, k?: 'good' | 'bad' | '') => void }

export default function ModelsTab({ ctx }: { ctx: Ctx }) {
  const { data } = ctx
  const fx = data.settings.fxRate
  if (!data.models.length) return <div className="ab-empty">暂无模型数据——服务首扫后出现。</div>

  const maxCost = Math.max(1e-9, ...data.models.map((m) => m.costUsd))

  return (
    <div>
      <div className="ab-sec"><i className="ab-bar" />模型账本<small className="ab-hint">{data.models.length} 个模型 · 按累计成本降序</small></div>
      <div className="ab-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="ab-table">
            <thead>
              <tr>
                <th>模型</th>
                <th className="ab-num">请求</th>
                <th className="ab-num">全价输入</th>
                <th className="ab-num">缓存读</th>
                <th className="ab-num">命中</th>
                <th className="ab-num">输出</th>
                <th className="ab-num">成本</th>
                <th className="ab-num">近30天</th>
                <th className="ab-num">TTFT P50</th>
                <th className="ab-num">错</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((m) => (
                <tr key={m.model}>
                  <td>
                    {m.model}
                    {m.priced === 0 && <span className="ab-tag amber" style={{ marginLeft: 6 }}>未计价</span>}
                    {m.provider && <span className="ab-tag" style={{ marginLeft: 4 }}>{m.provider}</span>}
                  </td>
                  <td className="ab-num">{m.req}</td>
                  <td className="ab-num">{fmtTokens(m.fin)}</td>
                  <td className="ab-num" title={`缓存节省 ${fmtUsd(m.savings)}`}>{fmtTokens(m.cr)}</td>
                  <td className="ab-num">
                    {m.cacheHit !== null ? (
                      <>
                        <span className="ab-hitbar"><i style={{ width: `${Math.min(100, m.cacheHit)}%` }} /></span>
                        {m.cacheHit}%
                      </>
                    ) : '—'}
                  </td>
                  <td className="ab-num">{fmtTokens(m.out)}</td>
                  <td className="ab-num">
                    <div style={{ width: 56, height: 4, background: '#222936', borderRadius: 2, marginBottom: 3 }}>
                      <div style={{ width: `${(m.costUsd / maxCost) * 100}%`, height: '100%', borderRadius: 2, background: '#F2C063' }} />
                    </div>
                    {fmtUsd(m.costUsd)}
                  </td>
                  <td className="ab-num" title={`${m.d30Req} 次请求`}>{m.d30Req ? `${fmtUsd(m.d30Cost)}` : '—'}</td>
                  <td className="ab-num">{m.ttftP50 ? `${(m.ttftP50 / 1000).toFixed(1)}s` : '—'}</td>
                  <td className="ab-num">{m.err ? <span className="ab-tag red">{m.err}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="ab-sec"><i className="ab-bar" />说明</div>
      <div className="ab-card"><div className="ab-card-b ab-caliber">
        「命中」= 缓存读 token ÷（全价输入 + 缓存读 + 缓存写）。缓存读通常只按全价的 1/10 计费——
        命中率越高，同样上下文越便宜。未计价模型在「设置」Tab 补价后立即入账。
      </div></div>
    </div>
  )
}
