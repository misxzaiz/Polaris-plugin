/**
 * 概览 Tab：CPU/内存双仪表（大数字 + 迷你走势）+ 磁盘条形 + 主机信息 + 告警条
 */
import { fmtUptime, gb, type PanelData } from './model'
import type { Toast } from './Panel'

function Spark({ hist, idx, color }: { hist: [number, number, number][]; idx: 1 | 2; color: string }) {
  const pts = hist.slice(-60)
  if (pts.length < 2) return <svg className="ph-spark" />
  const w = 100
  const hgt = 100
  const vals = pts.map((p) => Math.max(0, Math.min(100, p[idx] || 0)))
  const step = w / (vals.length - 1)
  const path = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(hgt - (v / 100) * hgt).toFixed(2)}`).join(' ')
  const area = `${path} L${w},${hgt} L0,${hgt} Z`
  return (
    <svg className="ph-spark" viewBox={`0 0 ${w} ${hgt}`} preserveAspectRatio="none">
      <path d={area} fill={color} opacity="0.13" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function diskCls(pct: number): string {
  if (pct >= 92) return 'ph-fill hot'
  if (pct >= 80) return 'ph-fill warn'
  return 'ph-fill'
}

export default function OverviewTab({ data, reload, showToast, goFeed }: {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
  goFeed: () => void
}) {
  void reload
  void showToast
  const snap = data?.snap ?? null

  if (!snap) {
    return (
      <div className="ph-empty">
        暂无主机快照。<br />
        后台服务可能未运行：去「设置」→ 服务管理 启动，<br />
        或稍等首个采样周期（约 5 秒）。
      </div>
    )
  }

  const cpu = snap.cpuPct
  const mem = snap.memPct
  const al = snap.alerts || {}
  const activeAlerts: string[] = []
  if (al.cpu_high) activeAlerts.push(`CPU 超过 ${data?.settings.cpuThreshold ?? 90}%`)
  if (al.mem_high) activeAlerts.push(`内存超过 ${data?.settings.memThreshold ?? 90}%`)
  if (al.disk_low) activeAlerts.push(`磁盘剩余不足：${(al.lowMounts || []).join('、') || '—'}`)

  const totalGb = (snap.host.totalMemBytes || 0) / 1073741824
  const usedGb = (snap.memUsedBytes || 0) / 1073741824

  return (
    <div>
      {activeAlerts.length > 0 && (
        <div className={`ph-alertstrip ${al.disk_low && !al.cpu_high && !al.mem_high ? 'warm' : ''}`}>
          ⚠ {activeAlerts.join('；')} —— 详情见「动态」
        </div>
      )}
      <div className="ph-gauges">
        <div className={`ph-gauge ${(cpu ?? 0) >= 85 ? 'ph-gauge hot' : (cpu ?? 0) >= 65 ? 'ph-gauge-warm ph-gauge' : 'ph-gauge'}`}>
          <div className="ph-gl"><b>CPU</b><span>{snap.host.cores} 核</span></div>
          <div className="ph-gv">{Number.isFinite(cpu as number) ? (cpu as number).toFixed(1) : '—'}<small>%</small></div>
          <Spark hist={snap.history} idx={1} color="#58A6FF" />
        </div>
        <div className={`ph-gauge ${(mem ?? 0) >= 85 ? 'ph-gauge hot' : (mem ?? 0) >= 65 ? 'ph-gauge-warm ph-gauge' : 'ph-gauge'}`}>
          <div className="ph-gl"><b>内存</b><span>{usedGb.toFixed(1)}/{totalGb.toFixed(1)} GB</span></div>
          <div className="ph-gv">{Number.isFinite(mem as number) ? (mem as number).toFixed(1) : '—'}<small>%</small></div>
          <Spark hist={snap.history} idx={2} color="#2EA98C" />
        </div>
      </div>

      {(snap.disks?.length ?? 0) > 0 && (
        <div className="ph-card">
          <div className="ph-sec"><i className="ph-bar" />磁盘<small className="ph-hint">via {snap.disksVia}</small></div>
          {snap.disks.map((d) => (
            <div className="ph-diskrow" key={d.mount}>
              <div className="ph-disk-h">
                <b>{d.mount}</b>
                <span>{gb(d.freeGb)} 可用 / 共 {gb(d.totalGb, 0)}</span>
              </div>
              <div className="ph-track"><div className={diskCls(d.pct)} style={{ width: `${Math.min(100, d.pct)}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      <div className="ph-card">
        <div className="ph-sec"><i className="ph-bar" />主机</div>
        <div className="ph-card-b">
          <dl className="ph-info">
            <div><dt>主机名</dt><dd>{snap.host.name || '—'}</dd></div>
            <div><dt>开机时长</dt><dd>{fmtUptime(snap.uptimeSec)}</dd></div>
            <div><dt>系统</dt><dd>{snap.host.platform} {snap.host.release} · {snap.host.arch}</dd></div>
            <div><dt>CPU</dt><dd>{snap.host.cpuModel || '—'}</dd></div>
            {snap.loadavg && snap.loadavg.length > 0 && (
              <div><dt>负载（1/5/15min）</dt><dd>{snap.loadavg.join(' / ')}</dd></div>
            )}
            <div><dt>进程 / 监听端口</dt><dd>{snap.procs.count} 个 / {snap.ports.count} 个</dd></div>
          </dl>
        </div>
      </div>

      <div className="ph-sub" style={{ padding: '2px 18px 8px' }}>
        历史窗口约 {Math.round(((snap.history?.length || 0) * 5) / 60)} 分钟 · 走势每 5s 一个样本 ·
        <button className="ph-btn ghost sm" style={{ marginLeft: 6 }} onClick={goFeed}>查看告警动态</button>
      </div>
    </div>
  )
}
