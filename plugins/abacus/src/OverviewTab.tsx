/**
 * 总览 Tab：四时段成本卡 + 关键指标 + 近 14 天 token 堆叠柱 + 分源成本条 + 漏钱洞察
 */
import { fmtTokens, fmtUsd, fmtCny, type PanelData, type DailyRow } from './model'

interface Ctx { data: PanelData; refresh: () => Promise<void>; showToast: (t: string, k?: 'good' | 'bad' | '') => void }

const W = 340
const H = 150
const PAD_T = 10
const PAD_B = 20
const DAYS = 14

function bucketTokens(b: { fin: number; cr: number; cw: number; out: number }) {
  return b.fin + b.cr + b.cw + b.out
}

function InsightList({ data, limit }: { data: PanelData; limit?: number }) {
  const insights = (data.quality && data.quality.insights) || []
  const shown = limit ? insights.slice(0, limit) : insights
  if (!shown.length) return <div className="ab-empty">暂无洞察（等下一次扫描）</div>
  const icon = (level: string) => (level === 'warn' ? '⚠️' : level === 'good' ? '💰' : level === 'info' ? '🔍' : '·')
  return (
    <div className="ab-card-b">
      {shown.map((i, idx) => (
        <div key={`${i.code}-${idx}`} className={`ab-insight ${i.level}`}>
          <span className="ic">{icon(i.level)}</span>
          <span className="tx">{i.text}</span>
        </div>
      ))}
    </div>
  )
}

export default function OverviewTab({ ctx }: { ctx: Ctx }) {
  const { data } = ctx
  const s = data.summary
  const fx = data.settings.fxRate

  if (!s) return <div className="ab-empty">聚合数据尚未就绪——后台服务首次扫描完成后这里会出现你的第一本账。</div>

  const cards = [
    { label: '今日成本', b: s.today, cls: 'gold' },
    { label: '近 7 天', b: s.d7, cls: 'blue' },
    { label: '近 30 天', b: s.d30, cls: '' },
    { label: '累计', b: s.all, cls: '' },
  ]

  const allTokens = bucketTokens(s.all)
  const cacheHit = s.all.fin + s.all.cr + s.all.cw > 0 ? ((s.all.cr / (s.all.fin + s.all.cr + s.all.cw)) * 100).toFixed(1) : null

  // 近 14 天柱状
  const rows: DailyRow[] = data.daily.slice(-DAYS)
  const dayMap = new Map(rows.map((r) => [r.day, r]))
  const days: DailyRow[] = []
  const now = new Date()
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const hit = dayMap.get(key)
    days.push(hit || { day: key, req: 0, fin: 0, cr: 0, cw: 0, out: 0, costUsd: 0, cacheSavings: 0 })
  }
  const maxTokens = Math.max(1, ...days.map((d) => bucketTokens(d)))
  const bw = (W - 8) / DAYS
  const chartH = H - PAD_T - PAD_B

  const bySrc = Object.entries(s.bySrc || {}).filter(([, b]) => b.req > 0 || b.costUsd > 0)
  const srcCostTotal = Math.max(1e-9, ...[bySrc.reduce((sum, [, b]) => sum + b.costUsd, 0), 1e-9])
  const srcColors: Record<string, string> = { zcode: '#4C8DFF', claude: '#D29922', polaris: '#3FB950' }

  return (
    <div>
      <div className="ab-sec"><i className="ab-bar" />成本<small className="ab-hint">USD 与人民币折算（汇率 {fx}）</small></div>
      <div className="ab-statrow">
        {cards.map((c) => (
          <div key={c.label} className="ab-stat">
            <b className={c.cls || undefined}>{fmtCny(c.b.costUsd, fx)}</b>
            <small>{c.label} · {fmtUsd(c.b.costUsd)} · {c.b.req} 次</small>
          </div>
        ))}
      </div>
      <div className="ab-statrow">
        <div className="ab-stat">
          <b className="green">{fmtUsd(s.all.cacheSavings)}</b>
          <small>缓存累计节省 ≈{fmtCny(s.all.cacheSavings, fx)}</small>
        </div>
        <div className="ab-stat">
          <b className={cacheHit && Number(cacheHit) > 80 ? 'green' : 'amber'}>{cacheHit ? `${cacheHit}%` : '—'}</b>
          <small>缓存命中率（token 口径）</small>
        </div>
        <div className="ab-stat">
          <b className="blue">{fmtTokens(allTokens)}</b>
          <small>累计 token（四类合计）</small>
        </div>
        <div className="ab-stat">
          <b className={s.all.unpricedTokens > 0 ? 'red' : 'muted'}>{s.all.unpricedTokens > 0 ? fmtTokens(s.all.unpricedTokens) : '0'}</b>
          <small>未计价 token（去设置补价）</small>
        </div>
      </div>

      <div className="ab-sec"><i className="ab-bar" />近 {DAYS} 天 token 用量<small className="ab-hint">柱段：全价输入 / 缓存读 / 输出</small></div>
      <div className="ab-card"><div className="ab-card-b">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
          {days.map((d, i) => {
            const total = bucketTokens(d)
            const x = 4 + i * bw
            const scale = chartH / maxTokens
            const hOut = d.out * scale
            const hFin = d.fin * scale
            const hCr = d.cr * scale
            const yOut = PAD_T + chartH - hOut
            const yFin = yOut - hFin
            const yCr = yFin - hCr
            return (
              <g key={d.day}>
                <title>{`${d.day} ｜ ${d.req} 次 ｜ 全价 ${fmtTokens(d.fin)} · 缓存 ${fmtTokens(d.cr)} · 输出 ${fmtTokens(d.out)} ｜ 成本 ${fmtUsd(d.costUsd)}`}</title>
                {total > 0 && (
                  <>
                    <rect x={x + 1} y={yCr} width={bw - 2} height={Math.max(0.5, hCr)} fill="#2b3d5c" />
                    <rect x={x + 1} y={yFin} width={bw - 2} height={Math.max(0.5, hFin)} fill="#4C8DFF" />
                    <rect x={x + 1} y={yOut} width={bw - 2} height={Math.max(0.5, hOut)} fill="#F2C063" />
                  </>
                )}
                {total === 0 && <rect x={x + 1} y={PAD_T + chartH - 1} width={bw - 2} height={1} fill="#222936" />}
                {(i % 2 === 0 || i === DAYS - 1) && (
                  <text x={x + bw / 2} y={H - 6} fill="#5C6678" fontSize="8" textAnchor="middle">{d.day.slice(5)}</text>
                )}
              </g>
            )
          })}
        </svg>
        <div className="ab-legend">
          <span><i style={{ background: '#4C8DFF' }} />全价输入</span>
          <span><i style={{ background: '#2b3d5c' }} />缓存读</span>
          <span><i style={{ background: '#F2C063' }} />输出</span>
        </div>
      </div></div>

      {bySrc.length > 0 && (
        <>
          <div className="ab-sec"><i className="ab-bar" />成本构成（分源）</div>
          <div className="ab-card"><div className="ab-card-b">
            <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: '#222936' }}>
              {bySrc.map(([src, b]) => (
                <div key={src} style={{ width: `${(b.costUsd / srcCostTotal) * 100}%`, background: srcColors[src] || '#8B95A7' }} title={`${src}: ${fmtUsd(b.costUsd)}`} />
              ))}
            </div>
            <div className="ab-legend" style={{ marginTop: 8 }}>
              {bySrc.map(([src, b]) => (
                <span key={src}><i style={{ background: srcColors[src] || '#8B95A7' }} />{src} {fmtUsd(b.costUsd)}（{b.req} 次）</span>
              ))}
            </div>
          </div></div>
        </>
      )}

      <div className="ab-sec"><i className="ab-bar" />漏钱透视<small className="ab-hint">详见「质量」Tab</small></div>
      <div className="ab-card"><InsightList data={data} limit={4} /></div>
    </div>
  )
}
