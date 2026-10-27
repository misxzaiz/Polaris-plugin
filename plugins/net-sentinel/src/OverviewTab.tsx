/**
 * 概览 Tab：在线大状态 + 目标卡片（延迟 + 15min spark + 丢包/DNS）+ 活跃事件条 + 最近测速
 */
import { fmtMs, msColor, type NetSnapshot, type PanelData, type TargetMeta } from './model'

const css = `
.ns-online{margin:0 16px 10px;padding:12px 14px;border-radius:13px;border:1px solid #242C3A;background:#161B22;display:flex;align-items:center;gap:12px}
.ns-online.up{border-color:rgba(63,185,80,.4);background:linear-gradient(135deg,rgba(63,185,80,.08),rgba(22,27,34,.6))}
.ns-online.down{border-color:#54262c;background:linear-gradient(135deg,rgba(248,81,73,.1),rgba(22,27,34,.6))}
.ns-online-i{font-size:22px;flex-shrink:0}
.ns-online-t{flex:1;min-width:0}
.ns-online-t b{font-size:15px;display:block}
.ns-online-t small{color:#8B95A7;font-size:10.5px;display:block;margin-top:2px}
.ns-online-ms{font-size:20px;font-weight:700;flex-shrink:0}
.ns-online-ms small{font-size:10px;color:#8B95A7;display:block;text-align:right;font-weight:400}
.ns-strip{margin:0 16px 10px;padding:9px 13px;border-radius:11px;border:1px solid #54262c;background:rgba(248,81,73,.08);color:#FF8A9A;font-size:11.5px;line-height:1.6}
.ns-strip.warm{border-color:#4a3a18;background:rgba(210,153,34,.08);color:#E3B341}
.ns-strip.good{border-color:#1d4428;background:rgba(63,185,80,.07);color:#7EE2A8}
.ns-cards{display:flex;flex-direction:column;gap:8px;margin:0 16px 10px}
.ns-tcard{background:#161B22;border:1px solid #242C3A;border-radius:12px;padding:10px 12px}
.ns-tcard.dead{border-color:#54262c}
.ns-tc-h{display:flex;align-items:center;gap:8px}
.ns-tc-name{font-weight:600;font-size:12.5px}
.ns-tc-host{color:#5C6678;font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ns-tc-ms{margin-left:auto;font-size:16px;font-weight:700}
.ns-spark{width:100%;height:30px;display:block;margin-top:6px}
.ns-tc-meta{display:flex;gap:8px;margin-top:5px;font-size:10.5px;color:#8B95A7;flex-wrap:wrap}
.ns-kv{display:flex;align-items:baseline;gap:6px;margin:0 16px 10px;padding:9px 13px;background:#161B22;border:1px solid #242C3A;border-radius:11px;font-size:12px}
.ns-kv b{font-size:15px}
.ns-kv small{color:#5C6678;margin-left:auto;font-size:10.5px}
`

const KIND_META: Record<string, string> = {
  gateway: '网关',
  anchor: '锚点',
  normal: '站点',
}

function Spark({ recent, color }: { recent: [number, number | null][]; color: string }) {
  const pts = recent.slice(-60)
  if (pts.length < 2) return <svg className="ns-spark" />
  const vals = pts.map((p) => p[1])
  const known = vals.filter((v): v is number => v !== null && Number.isFinite(v))
  const max = known.length ? Math.max(...known, 50) : 100
  const w = 100
  const hgt = 30
  const xStep = w / Math.max(1, pts.length - 1)
  const segments: string[] = []
  let cur: string[] = []
  pts.forEach((p, i) => {
    if (p[1] === null || !Number.isFinite(p[1])) {
      if (cur.length > 1) segments.push(cur.join(' '))
      cur = []
      return
    }
    const y = hgt - 2 - (p[1] / max) * (hgt - 6)
    cur.push(`${(i * xStep).toFixed(1)},${y.toFixed(1)}`)
  })
  if (cur.length > 1) segments.push(cur.join(' '))
  return (
    <svg className="ns-spark" viewBox={`0 0 ${w} ${hgt}`} preserveAspectRatio="none">
      {segments.map((s, i) => (
        <polyline key={i} points={s} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  )
}

function lossPctOf(recent: [number, number | null][]): number | null {
  const win = recent.slice(-30)
  if (!win.length) return null
  const okN = win.filter((p) => p[1] !== null && Number.isFinite(p[1])).length
  return Math.round(((win.length - okN) / win.length) * 100)
}

function TargetCard({ t, snap }: { t: TargetMeta; snap: NetSnapshot }) {
  const r = snap.round[t.id]
  const recent = snap.recent[t.id] || []
  const loss = lossPctOf(recent)
  const dns = r && Number.isFinite(r.dnsMs) ? r.dnsMs : null
  return (
    <div className={`ns-tcard ${r && !r.ok ? 'dead' : ''}`}>
      <div className="ns-tc-h">
        <span className="ns-tc-name">{t.label}</span>
        <span className="ns-tc-host">{t.host || '(自动网关)'}:{t.port} · {KIND_META[t.kind] || t.kind}</span>
        <span className="ns-tc-ms" style={{ color: r && r.ok ? msColor(r.ms) : '#F85149' }}>
          {r ? (r.ok ? fmtMs(r.ms) : '✗') : '…'}
        </span>
      </div>
      <Spark recent={recent} color={r && r.ok ? msColor(r.ms) : '#F85149'} />
      <div className="ns-tc-meta">
        <span>近30轮丢包 {loss === null ? '—' : `${loss}%`}</span>
        {dns !== null && <span>DNS {fmtMs(dns)}</span>}
        {r && !r.ok && <span style={{ color: '#FF8A9A' }}>失联：{r.err || '无应答'}</span>}
        {!t.enabled && <span className="ns-tag">已停用</span>}
      </div>
    </div>
  )
}

export default function OverviewTab({ data, goHistory, goFeed }: {
  data: PanelData | null
  goHistory: () => void
  goFeed: () => void
}) {
  const snap = data?.snap ?? null
  if (!snap) {
    return <div className="ns-empty">暂无快照：后台探测服务可能未运行。<br />到「设置」Tab 查看服务状态并启动。</div>
  }
  const best = snap.targets
    .filter((t) => t.enabled !== false)
    .map((t) => snap.round[t.id])
    .filter((r) => r && r.ok && Number.isFinite(r.ms))
    .map((r) => r.ms as number)
  const bestMs = best.length ? Math.min(...best) : null
  const online = snap.online

  return (
    <>
      <div className={`ns-online ${online ? 'up' : 'down'}`}>
        <span className="ns-online-i">{online ? '🟢' : '🔴'}</span>
        <span className="ns-online-t">
          <b>{online ? '网络在线' : '网络离线'}</b>
          <small>
            锚点判定 · 本会话 {snap.counts.rounds} 轮 / {snap.counts.probes} 次探测 / 丢包 {snap.counts.probes ? Math.round((snap.counts.losses / snap.counts.probes) * 100) : 0}%
            {snap.speeding ? ' · 测速进行中…' : ''}
          </small>
        </span>
        <span className="ns-online-ms" style={{ color: msColor(bestMs) }}>
          {bestMs !== null ? fmtMs(bestMs) : '—'}
          <small>最快目标</small>
        </span>
      </div>

      {!online && (
        <div className="ns-strip" onClick={goFeed}>
          ⚠ 网络当前判定为离线（锚点全部或多数失联）。查看事件线 →
        </div>
      )}

      <div className="ns-cards">
        {snap.targets.map((t) => <TargetCard key={t.id} t={t} snap={snap} />)}
      </div>

      {snap.speeds.length > 0 && (
        <div>
          {snap.speeds.slice(0, 3).map((s) => (
            <div key={s.at} className="ns-kv">
              <span style={{ color: s.ok ? '#3FB950' : '#F85149' }}>{s.ok ? '⚡' : '✗'}</span>
              <b style={{ color: s.ok ? '#58A6FF' : '#F85149' }}>{s.ok ? `${s.mbps} Mbps` : '测速失败'}</b>
              <small>
                {new Date(s.at).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {s.ok && Number.isFinite(s.latencyMs as number) ? ` · 首字节 ${Math.round(s.latencyMs as number)}ms` : ''}
                {s.err ? ` · ${s.err}` : ''}
              </small>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
