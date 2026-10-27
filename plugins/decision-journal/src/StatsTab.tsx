/**
 * 校准 Tab：SVG 校准曲线（自称把握 vs 实际命中率，对角线=完美校准）+
 * Brier / bias 解读 + 分桶表 + 经验卡 + 按月复盘时间线
 */
import { fmtDate, computeCalibration, recentLessons, type PanelCtx } from './model'

const W = 320
const H = 200
const PAD_L = 36
const PAD_R = 14
const PAD_T = 14
const PAD_B = 34

/** 把握 0-100 → x 像素；命中率 0-1 → y 像素 */
const xOf = (conf: number) => PAD_L + ((W - PAD_L - PAD_R) * conf) / 100
const yOf = (rate: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - rate)

/** 桶在 x 轴的代表点：取桶内把握中值 */
const BUCKET_MID: Record<string, number> = { '<50': 25, '50-69': 60, '70-84': 77, '85-100': 93 }

export default function StatsTab({ ctx, openDetail }: { ctx: PanelCtx; openDetail: (id: string) => void }) {
  const { decisions, cal } = ctx
  const lessons = recentLessons(decisions, 8)
  const scored = cal.buckets.filter((b) => b.n > 0)

  // 月度复盘条形（近 8 个月）
  const months: { month: string; n: number; avgScore: number }[] = []
  if (cal.byMonth.length) {
    const last = cal.byMonth[cal.byMonth.length - 1].month
    const [ly, lm] = last.split('-').map(Number)
    for (let i = 7; i >= 0; i--) {
      const d = new Date(ly, lm - 1 - i, 1)
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const hit = cal.byMonth.find((m) => m.month === mk)
      months.push({ month: mk, n: hit ? hit.n : 0, avgScore: hit ? hit.avgScore : 0 })
    }
  }
  const maxN = Math.max(1, ...months.map((m) => m.n))

  return (
    <div>
      <div className="dj-sec"><i className="dj-bar" />校准曲线<small className="dj-hint">点在对角线上=把握与结果相符</small></div>
      <div className="dj-card"><div className="dj-card-b dj-cal-wrap">
        {cal.nScored ? (
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
            {[0, 0.25, 0.5, 0.75, 1].map((r) => (
              <g key={r}>
                <line x1={PAD_L} y1={yOf(r)} x2={W - PAD_R} y2={yOf(r)} stroke="#222936" strokeWidth="1" />
                <text x={PAD_L - 5} y={yOf(r) + 3} fill="#5C6678" fontSize="8.5" textAnchor="end">{r * 100}%</text>
              </g>
            ))}
            {[0, 25, 50, 75, 100].map((c) => (
              <text key={c} x={xOf(c)} y={H - PAD_B + 12} fill="#5C6678" fontSize="8.5" textAnchor="middle">{c}</text>
            ))}
            <text x={(W + PAD_L) / 2} y={H - 4} fill="#5C6678" fontSize="9" textAnchor="middle">自称把握 →</text>
            <line x1={xOf(0)} y1={yOf(0)} x2={xOf(100)} y2={yOf(1)} stroke="#3a4356" strokeWidth="1" strokeDasharray="4 3" />
            {scored.map((b) => {
              const x = xOf(BUCKET_MID[b.key] ?? 50)
              const y = yOf(b.hitRate)
              return (
                <g key={b.key}>
                  <circle cx={x} cy={y} r={5 + Math.min(4, b.n)} fill={b.hitRate >= (BUCKET_MID[b.key] ?? 50) / 100 ? '#3FB950' : '#F85149'} opacity="0.9" />
                  <text x={x} y={y - 10} fill="#C9D4E8" fontSize="9" textAnchor="middle">{Math.round(b.hitRate * 100)}%</text>
                  <text x={x} y={y + 3.5} fill="#0e1116" fontSize="7.5" fontWeight="700" textAnchor="middle">{b.n}</text>
                </g>
              )
            })}
          </svg>
        ) : (
          <div className="dj-empty">还没有可计分的复盘。先立此存照，到期复盘，曲线自然长出来。</div>
        )}
      </div></div>

      {cal.nScored ? (
        <div className="dj-card"><div className="dj-card-b">
          <div className="dj-row" style={{ alignItems: 'baseline', gap: 14 }}>
            <span><span className="dj-big" style={{ color: '#9EC4FF' }}>{cal.brier.toFixed(2)}</span><br /><small style={{ color: '#5C6678', fontSize: 10 }}>Brier（0 完美 · 0.25 瞎猜）</small></span>
            <span><span className="dj-big" style={{ color: '#7EE2A0' }}>{Math.round(cal.hitRate * 100)}%</span><br /><small style={{ color: '#5C6678', fontSize: 10 }}>实际命中率</small></span>
            <span><span className="dj-big" style={{ color: '#F2C063' }}>{Math.round(cal.avgConf * 100)}%</span><br /><small style={{ color: '#5C6678', fontSize: 10 }}>平均自称把握</small></span>
          </div>
          <div className="dj-sub" style={{ marginTop: 8 }}>{cal.verdict}</div>
          {cal.nVoid ? <div className="dj-sub">另有 {cal.nVoid} 条复盘为「作废」，不计分。</div> : null}
          <table className="dj-table" style={{ marginTop: 8 }}>
            <thead><tr><th>把握区间</th><th>样本</th><th>命中率</th><th>平均把握</th><th>Brier</th></tr></thead>
            <tbody>
              {cal.buckets.map((b) => (
                <tr key={b.key} style={{ opacity: b.n ? 1 : 0.4 }}>
                  <td>{b.label}</td><td>{b.n}</td>
                  <td>{b.n ? `${Math.round(b.hitRate * 100)}%` : '—'}</td>
                  <td>{b.n ? `${Math.round(b.avgConf * 100)}%` : '—'}</td>
                  <td>{b.n ? b.brier.toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      ) : null}

      {months.length && cal.nScored ? (
        <>
          <div className="dj-sec"><i className="dj-bar" />复盘节奏<small className="dj-hint">柱高=复盘数，颜色深浅=平均分</small></div>
          <div className="dj-card"><div className="dj-card-b">
            <div className="dj-monthbar">
              {months.map((m) => (
                <div key={m.month} className="dj-monthcol">
                  <i style={{ height: `${Math.max(3, (m.n / maxN) * 100)}%`, opacity: m.n ? 0.35 + m.avgScore * 0.65 : 0.15 }} />
                  <small>{m.month.slice(5)}</small>
                </div>
              ))}
            </div>
          </div></div>
        </>
      ) : null}

      <div className="dj-sec"><i className="dj-bar" />经验卡<small className="dj-hint">复盘沉淀的教训，AI 决策时可引用</small></div>
      {lessons.length ? (
        <div className="dj-card"><div className="dj-card-b">
          {lessons.map((l) => (
            <div key={l.id} className="dj-lesson" style={{ cursor: 'pointer' }} onClick={() => openDetail(l.id)}>
              <b>{l.title} <span style={{ color: '#5C6678', fontWeight: 400, fontSize: 10 }}>{fmtDate(l.resolvedAt)}</span></b>
              <small>{l.lesson}</small>
            </div>
          ))}
        </div></div>
      ) : (
        <div className="dj-card"><div className="dj-card-b">
          <div className="dj-sub">还没有教训沉淀。复盘时写一句「下次怎么办」，它们会变成你决策时最值钱的参考。</div>
        </div></div>
      )}
    </div>
  )
}
