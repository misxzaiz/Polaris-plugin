/**
 * Panel.tsx —— 仓库体检台面板
 *
 * Tab 结构：扫描 / 总览 / 热点 / 体检 / 历史
 * 数据面：127.0.0.1 直连服务（model.ts）；扫描进行中 1s 轮询进度。
 * 已知限制：Web(https) 部署模式下浏览器会拦 http://127.0.0.1 混合内容——
 * 桌面/手机 WebView 正常（与 dep-probe/stream-desk/api-bench 面板直连面同款边界）。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, invalidateMeta, readMeta, SvcError } from './model'
import type { FileDetail, Hotspot, RunItem, ScanReport, ScanStatus, Settings } from './model'
import { restartService } from './host'
import {
  Bar, dateStr, dateTimeStr, durStr, HealthRing, hotspotColor, PanelStyle, PartBar, StatChips,
} from './ui'

const PLUGIN_ID = 'repo-lens'
const SERVICE_ID = 'repo-lens-server'

type Tab = 'scan' | 'overview' | 'hotspots' | 'audit' | 'history'

export default function Panel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void | Promise<void>
}): JSX.Element {
  const [tab, setTab] = useState<Tab>('scan')
  const [svcDown, setSvcDown] = useState<string | null>(null)
  const [degraded, setDegraded] = useState(false)
  const [meta, setMeta] = useState<{ version: string; uptime: number } | null>(null)

  // 扫描
  const [path, setPath] = useState('')
  const [days, setDays] = useState('365')
  const [maxCommits, setMaxCommits] = useState('5000')
  const [recentPaths, setRecentPaths] = useState<string[]>([])
  const [busy, setBusy] = useState<ScanStatus | null>(null)
  const [scanErr, setScanErr] = useState<string | null>(null)

  // 报告（总览/热点/体检共用）
  const [report, setReport] = useState<ScanReport | null>(null)
  const [selFile, setSelFile] = useState<string | null>(null)
  const [fileDetail, setFileDetail] = useState<FileDetail | null>(null)

  // 历史/设置
  const [runs, setRuns] = useState<RunItem[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [selftest, setSelftest] = useState<{ ok: boolean; total: number; failed: Array<{ name: string; error: string }>; git: string } | null>(null)
  const [selftesting, setSelftesting] = useState(false)

  const runIdRef = useRef<string | null>(null)
  const pollRef = useRef<number | null>(null)

  const loadRuns = useCallback(async () => {
    try { const r = await api.runs(); setRuns(r.runs); setDegraded(!!r.degraded) } catch (_) { /* 服务未起 */ }
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      const r = await api.settings()
      setSettings(r.settings)
      setDegraded(r.degraded)
      if (r.settings.recentPaths[0] && !path) setPath(r.settings.recentPaths[0])
    } catch (_) { /* 忽略 */ }
  }, [path])

  const loadReport = useCallback(async (runId: string) => {
    try {
      const r = await api.report(runId)
      setReport(r.report)
      runIdRef.current = runId
      setDegraded(false)
    } catch (e) { setScanErr((e as Error).message) }
  }, [])

  // ── 首次挂载：等 meta → 读设置/最近 run ──
  useEffect(() => {
    let alive = true
    ;(async () => {
      for (let i = 0; i < 20 && alive; i++) {
        const m = await readMeta()
        if (m) break
        await new Promise((r) => setTimeout(r, 600))
      }
      if (!alive) return
      try {
        const m = await api.meta()
        setMeta({ version: m.version, uptime: m.uptime })
        setDegraded(m.degraded)
        setSvcDown(null)
        if (m.settings) { setSettings(m.settings); setDays(String(m.settings.defaults.days)); setMaxCommits(String(m.settings.defaults.maxCommits)); setRecentPaths(m.settings.recentPaths); if (m.settings.recentPaths[0]) setPath(m.settings.recentPaths[0]) }
        if (m.lastRunId) { runIdRef.current = m.lastRunId; await loadReport(m.lastRunId) }
      } catch (e) { setSvcDown((e as Error).message) }
      await loadRuns()
    })()
    return () => { alive = false }
  }, [loadReport])

  // ── 扫描轮询 ──
  useEffect(() => {
    if (!busy) return
    pollRef.current = window.setInterval(async () => {
      try {
        const st = await api.scanStatus(busy.runId)
        setBusy((prev) => (prev ? { ...prev, ...st } : prev))
        if (st.status && st.status !== 'running') {
          window.clearInterval(pollRef.current!)
          pollRef.current = null
          invalidateMeta()
          if (st.status === 'ok') { setBusy(null); setTab('overview'); await loadReport(busy.runId); await loadRuns() }
          else { setBusy(null); setScanErr(st.error || st.message || `扫描失败（${st.status}）`); await loadRuns() }
        }
      } catch (e) {
        window.clearInterval(pollRef.current!)
        pollRef.current = null
        setBusy(null)
        setScanErr((e as Error).message)
      }
    }, 1000)
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); pollRef.current = null }
  }, [busy && busy.runId, loadReport, loadRuns]) // eslint-disable-line react-hooks/exhaustive-deps

  const startScan = useCallback(async () => {
    setScanErr(null)
    if (!path.trim()) { setScanErr('请填写仓库路径'); return }
    const d = Number(days); const mc = Number(maxCommits)
    try {
      const r = await api.scan(path.trim(), Number.isFinite(d) && d > 0 ? d : undefined, Number.isFinite(mc) && mc > 0 ? mc : undefined)
      setBusy({ runId: r.runId, status: 'running', phase: 'queued', progress: 0, message: '排队中' })
    } catch (e) {
      if (e instanceof SvcError && e.status === 409) { setScanErr('已有扫描在进行中，请等待完成'); return }
      setScanErr((e as Error).message)
    }
  }, [path, days, maxCommits])

  const openFile = useCallback(async (p: string) => {
    setSelFile(p)
    setFileDetail(null)
    if (!runIdRef.current) return
    try { setFileDetail(await api.fileDetail(runIdRef.current, p)) } catch (e) { setScanErr((e as Error).message) }
  }, [])

  // 气泡图点击中转（OverviewTab 深处的 BubbleChart → 本页 openFile）
  useEffect(() => {
    openFileGlobal = openFile
    return () => { openFileGlobal = () => {} }
  }, [openFile])

  const sendSummary = useCallback(async () => {
    if (!report || !onSendToChat) return
    const t = report.totals
    const top = (report.hotspots || []).slice(0, 8).map((h, i) => `${i + 1}. ${h.path}（${h.score} 分，${h.commits} 次提交，复杂度 ${h.cxScore}）`).join('\n')
    const couples = (report.couples || []).slice(0, 5).map((c) => `- ${c.a} ⇄ ${c.b}（${c.co} 次同提交）`).join('\n')
    const text = [
      `仓库体检报告（${report.repo ? report.repo.top : '?'}，${report.repo ? report.repo.branch : '?'} 分支）`,
      `健康分 ${report.health ? report.health.total : '?'}/100；窗口 ${report.window ? report.window.days : '?'} 天 / ${t ? t.commits : '?'} 提交 / ${t ? t.filesTracked : '?'} 个工作区文件 / ${t ? t.codeLines : '?'} 行代码`,
      `提交卫生：conventional ${Math.round((report.hygiene ? report.hygiene.conventionalRate : 0) * 100)}%，草率 ${report.hygiene ? report.hygiene.sloppy : 0} 条，巨提交 ${report.hygiene ? report.hygiene.bigCommits : 0} 个；巴士因子 ${report.busFactor ? report.busFactor.busFactor : '?'}（${report.busFactor ? report.busFactor.totalAuthors : '?'} 位作者）`,
      `重复代码 ${report.dupSummary ? report.dupSummary.totalDupLines : 0} 行（${report.dupSummary ? (report.dupSummary.ratio * 100).toFixed(1) : '?'}%）；历史大对象 ${report.blobs.length} 个`,
      '',
      '重构优先级（热点 Top8）：',
      top,
      couples ? `\n时间耦合（总是一起改）：\n${couples}` : '',
      report.warnings && report.warnings.length ? `\n⚠ ${report.warnings.join('；')}` : '',
    ].filter(Boolean).join('\n')
    await onSendToChat(text)
  }, [report, onSendToChat])

  const saveDefaults = useCallback(async () => {
    const d = Number(days); const mc = Number(maxCommits)
    try {
      const r = await api.saveSettings({ defaults: { days: Number.isFinite(d) && d > 0 ? d : 365, maxCommits: Number.isFinite(mc) && mc > 0 ? mc : 5000 } })
      setSettings(r.settings)
    } catch (e) { setScanErr((e as Error).message) }
  }, [days, maxCommits])

  const runSelftest = useCallback(async () => {
    setSelftesting(true)
    try { setSelftest(await api.selftest()) } catch (e) { setScanErr((e as Error).message) } finally { setSelftesting(false) }
  }, [])

  const doRestart = useCallback(async () => {
    try {
      await restartService(PLUGIN_ID, SERVICE_ID)
      invalidateMeta()
      setSvcDown(null)
      setMeta(null)
      setTimeout(() => window.location.reload(), 800)
    } catch (e) { setScanErr(`重启服务失败：${(e as Error).message}`) }
  }, [])

  // ── 渲染 ──
  return (
    <div className="rl-panel">
      <PanelStyle />
      <div className="rl-tabs">
        {([['scan', '扫描'], ['overview', '总览'], ['hotspots', '热点'], ['audit', '体检'], ['history', '历史/设置']] as Array<[Tab, string]>).map(([k, label]) => (
          <button key={k} className={`rl-tab ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); if (k === 'history') loadRuns() }}>{label}</button>
        ))}
        <div className="rl-grow" />
        {report && tab !== 'scan' && (
          <button className="small" style={{ margin: '4px 8px' }} onClick={sendSummary} disabled={!onSendToChat}
            title={onSendToChat ? '把报告摘要发到聊天' : '宿主未提供发送通道'}>发到聊天</button>
        )}
      </div>
      <div className="rl-statusbar">
        <span className="rl-dot" style={{ background: svcDown ? '#F87171' : degraded ? '#FBBF24' : '#34D399' }} />
        <span>{svcDown ? '服务不可达' : degraded ? '降级（宿主 kv 桥离线，报告不投影）' : '服务正常'}</span>
        {meta && <span className="rl-muted">v{meta.version} · 运行 {durStr(meta.uptime)}</span>}
        <div className="rl-grow" />
        {runIdRef.current && <span className="rl-muted mono">run {runIdRef.current}</span>}
      </div>

      {scanErr && (
        <div style={{ padding: '8px 12px', background: '#2A1B1E', borderBottom: '1px solid #7F1D1D' }}>
          <span className="rl-err">{scanErr}</span>
          <button className="small" style={{ marginLeft: 8 }} onClick={() => setScanErr(null)}>关闭</button>
        </div>
      )}

      {tab === 'scan' && (
        <ScanTab
          path={path} setPath={setPath} days={days} setDays={setDays} maxCommits={maxCommits} setMaxCommits={setMaxCommits}
          recentPaths={recentPaths} busy={busy} onStart={startScan}
        />
      )}
      {tab === 'overview' && <OverviewTab report={report} />}
      {tab === 'hotspots' && (
        <HotspotsTab report={report} selFile={selFile} fileDetail={fileDetail} onOpenFile={openFile}
          onClose={() => { setSelFile(null); setFileDetail(null) }} />
      )}
      {tab === 'audit' && <AuditTab report={report} />}
      {tab === 'history' && (
        <HistoryTab
          runs={runs} settings={settings} days={days} maxCommits={maxCommits} setDays={setDays} setMaxCommits={setMaxCommits}
          onLoadRun={async (id) => { await loadReport(id); setTab('overview') }}
          onSaveDefaults={saveDefaults} onSelftest={runSelftest} selftest={selftest} selftesting={selftesting}
          onRestart={doRestart} onClearRecents={async () => { try { await api.saveSettings({ recentPaths: [] }); await loadSettings() } catch (_) { /* 忽略 */ } }}
        />
      )}
    </div>
  )
}

// ── 扫描 Tab ────────────────────────────────────────────────────────────────

function ScanTab(props: {
  path: string; setPath: (s: string) => void
  days: string; setDays: (s: string) => void
  maxCommits: string; setMaxCommits: (s: string) => void
  recentPaths: string[]
  busy: ScanStatus | null
  onStart: () => void
}): JSX.Element {
  const { path, setPath, days, setDays, maxCommits, setMaxCommits, recentPaths, busy, onStart } = props
  const running = !!busy && busy.status === 'running'
  return (
    <div className="rl-scroll" style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="rl-card">
        <label className="rl-label">仓库路径（仓库根或其中任意子目录；本机需已安装 git）</label>
        <div className="rl-row">
          <input
            className="rl-grow mono" value={path} placeholder="例如 D:\space\base\Polaris"
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !running) onStart() }}
            list="rl-recent-paths"
          />
          <datalist id="rl-recent-paths">{recentPaths.map((p) => <option key={p} value={p} />)}</datalist>
          <button className="primary" onClick={onStart} disabled={running}>{running ? '体检中…' : '开始体检'}</button>
        </div>
        {recentPaths.length > 0 && (
          <div className="rl-row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            <span className="rl-muted" style={{ fontSize: 10.5 }}>最近：</span>
            {recentPaths.slice(0, 4).map((p) => (
              <button key={p} className="small" onClick={() => setPath(p)} title={p}>{p.split(/[\\/]/).pop()}</button>
            ))}
          </div>
        )}
        <div className="rl-row" style={{ marginTop: 8, gap: 12 }}>
          <label className="rl-row" style={{ gap: 6 }}>
            <span className="rl-muted">时间窗（天）</span>
            <input style={{ width: 80 }} value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
          <label className="rl-row" style={{ gap: 6 }}>
            <span className="rl-muted">最多提交数</span>
            <input style={{ width: 90 }} value={maxCommits} onChange={(e) => setMaxCommits(e.target.value)} />
          </label>
        </div>
      </div>

      {running && (
        <div className="rl-card">
          <div className="rl-row" style={{ justifyContent: 'space-between' }}>
            <b>{phaseLabel(busy && busy.phase || '')}</b>
            <span className="rl-muted">{Math.round((busy && busy.progress || 0) * 100)}%</span>
          </div>
          <div style={{ marginTop: 6 }}><Bar value={(busy && busy.progress || 0) * 100} color="#3B82F6" /></div>
          <div className="rl-hint" style={{ marginTop: 6 }}>{busy && busy.message}</div>
        </div>
      )}

      <div className="rl-card rl-hint">
        <b style={{ color: '#D4D4D8' }}>八个体检维度</b>
        <div style={{ marginTop: 6 }}>
          ① 热点 = 变更频率 × 复杂度（重构优先级）　② 时间耦合 = 总是被一起改的文件对（隐藏依赖）
          ③ 重复代码块　④ 历史大对象　⑤ 提交卫生（conventional 遵循率/草率消息/巨提交）
          ⑥ 巴士因子　⑦ 陈旧分支　⑧ 语言构成与综合健康分。
          复杂度为<b>启发式近似</b>（分支关键词 + 嵌套深度），口径诚实标注，非精确圈复杂度。
        </div>
        <div style={{ marginTop: 6 }} className="rl-muted">
          只读体检：git 子命令全只读白名单，不写仓库任何文件，零网络出站。
        </div>
      </div>
    </div>
  )
}

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    queued: '排队中', probe: '校验仓库', history: '读取提交历史', analyze: '归并分析',
    files: '读取工作区', duplicate: '重复检测', hotspots: '热点合并', couples: '时间耦合',
    blobs: '历史大对象', assemble: '汇总评分',
  }
  return map[phase] || phase || '进行中'
}

// ── 总览 Tab ────────────────────────────────────────────────────────────────

function OverviewTab({ report }: { report: ScanReport | null }): JSX.Element {
  if (!report || report.status !== 'ok') {
    return <EmptyReport />
  }
  const t = report.totals!
  const health = report.health
  const maxCommits = Math.max(1, ...report.hotspots.map((h) => h.commits))
  const bubble = report.hotspots.filter((h) => h.complexityKnown && h.loc > 0).slice(0, 60)
  return (
    <div className="rl-scroll" style={{ flex: 1, padding: 12 }}>
      <div className="rl-card" style={{ marginBottom: 10 }}>
        <div className="rl-row" style={{ gap: 12, flexWrap: 'wrap' }}>
          {health && <HealthRing total={health.total} />}
          <div className="rl-grow" style={{ minWidth: 260 }}>
            <div className="rl-path" style={{ color: '#fff', fontSize: 13, marginBottom: 4 }}>
              {report.repo ? report.repo.top : '?'} <span className="rl-muted">@{report.repo ? report.repo.branch : '?'}</span>
            </div>
            <StatChips items={[
              { label: '提交', value: String(t.commits) },
              { label: '工作区文件', value: String(t.filesTracked) },
              { label: '代码行', value: t.codeLines.toLocaleString() },
              { label: '窗口', value: `${report.window ? report.window.days : '?'} 天` },
              { label: '耗时', value: durStr(t.durationMs) },
              { label: '作者', value: String(report.busFactor ? report.busFactor.totalAuthors : '?') },
            ]} />
            {health && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', marginTop: 10 }}>
                <PartBar label="热点集中度" value={health.parts.hotspot} weight={0.25} />
                <PartBar label="重复率" value={health.parts.duplication} weight={0.2} />
                <PartBar label="提交卫生" value={health.parts.hygiene} weight={0.25} />
                <PartBar label="巴士因子" value={health.parts.busFactor} weight={0.15} />
                <PartBar label="历史大对象" value={health.parts.bigBlobs} weight={0.15} />
              </div>
            )}
          </div>
        </div>
        {report.warnings.length > 0 && (
          <div className="rl-warn rl-hint" style={{ marginTop: 8 }}>⚠ {report.warnings.join('；')}</div>
        )}
      </div>

      <div className="rl-card" style={{ marginBottom: 10 }}>
        <div className="rl-h3">热点气泡图（x=变更频率，y=复杂度，点大小=代码行数；右上加亮的 = 重构优先）</div>
        <BubbleChart rows={bubble} maxCommits={maxCommits} onPick={openFileGlobal} />
      </div>

      <div className="rl-card">
        <div className="rl-h3">语言构成（按代码行）</div>
        {report.languages.length === 0 && <div className="rl-hint rl-muted">无可读文本语言</div>}
        {report.languages.slice(0, 8).map((l) => (
          <div key={l.lang} className="rl-row" style={{ marginBottom: 4, gap: 8 }}>
            <span className="mono" style={{ width: 90, flex: 'none', fontSize: 11 }}>{l.lang}</span>
            <div className="rl-grow"><Bar value={l.codeLines} max={report.languages[0].codeLines} color="#60A5FA" /></div>
            <span className="rl-muted" style={{ width: 130, textAlign: 'right', flex: 'none', fontSize: 11 }}>{l.files} 文件 · {l.codeLines.toLocaleString()} 行</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// 全局中转：气泡点击下钻（避免把 onOpenFile 传穿所有子组件）
let openFileGlobal: (path: string) => void = () => {}

function BubbleChart({ rows, maxCommits, onPick }: { rows: Hotspot[]; maxCommits: number; onPick: (p: string) => void }): JSX.Element {
  const W = 620; const H = 300; const PAD = 34
  const maxLoc = Math.max(1, ...rows.map((r) => r.loc))
  const rOf = (loc: number) => 4 + Math.sqrt(loc / maxLoc) * 16
  const xOf = (commits: number) => PAD + (commits / maxCommits) * (W - PAD - 12)
  const yOf = (cx: number) => H - PAD - (cx / 100) * (H - PAD - 14)
  const medCommits = rows.length ? [...rows].sort((a, b) => a.commits - b.commits)[Math.floor(rows.length / 2)].commits : 1
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', background: '#141418', borderRadius: 6 }}>
      {/* 象限参考线：x=中位提交数，y=复杂度 50 */}
      <line x1={xOf(medCommits)} y1={12} x2={xOf(medCommits)} y2={H - PAD} stroke="#2F2F37" strokeDasharray="4 4" />
      <line x1={PAD} y1={yOf(50)} x2={W - 12} y2={yOf(50)} stroke="#2F2F37" strokeDasharray="4 4" />
      <text x={W - 14} y={20} textAnchor="end" fill="#F87171" fontSize={10.5}>高频 × 高复杂 = 重构优先</text>
      <text x={PAD + 4} y={yOf(50) - 6} fill="#6B7280" fontSize={10}>低频 × 高复杂 = 稳定但难读</text>
      <text x={PAD + 4} y={H - PAD + 14} fill="#6B7280" fontSize={10}>低频 × 低复杂</text>
      <text x={xOf(medCommits) + 6} y={H - PAD + 14} fill="#6B7280" fontSize={10}>高频 × 低复杂 = 活跃健康</text>
      <text x={PAD - 6} y={yOf(100) + 4} fill="#9CA3AF" fontSize={9.5} textAnchor="end">100</text>
      <text x={PAD - 6} y={yOf(0) + 4} fill="#9CA3AF" fontSize={9.5} textAnchor="end">0</text>
      {rows.map((r) => {
        const c = hotspotColor(r.score)
        return (
          <circle key={r.path}
            cx={xOf(r.commits)} cy={yOf(r.cxScore)} r={rOf(r.loc)}
            fill={`${c}55`} stroke={c} strokeWidth={1.2}
            style={{ cursor: 'pointer' }}
            onClick={() => onPick(r.path)}
          >
            <title>{`${r.path}\n热点分 ${r.score}｜提交 ${r.commits}｜复杂度 ${r.cxScore}｜${r.loc} 行｜${r.authors} 位作者`}</title>
          </circle>
        )
      })}
    </svg>
  )
}

function EmptyReport(): JSX.Element {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
      <div className="rl-muted">还没有体检报告</div>
      <div className="rl-hint">在「扫描」Tab 填入仓库路径开始体检</div>
    </div>
  )
}

// ── 热点 Tab ────────────────────────────────────────────────────────────────

function HotspotsTab({ report, selFile, fileDetail, onOpenFile, onClose }: {
  report: ScanReport | null
  selFile: string | null
  fileDetail: FileDetail | null
  onOpenFile: (p: string) => void
  onClose: () => void
}): JSX.Element {
  if (!report || report.status !== 'ok') return <EmptyReport />
  const rows = report.hotspots.slice(0, 200)
  const maxScore = Math.max(1, ...rows.map((r) => r.score))
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="rl-scroll" style={{ flex: 1 }}>
        <table className="rl-table">
          <thead>
            <tr>
              <th style={{ width: 60 }}>热点分</th>
              <th>文件</th>
              <th style={{ width: 56, textAlign: 'right' }}>提交</th>
              <th style={{ width: 90, textAlign: 'right' }}>增/删行</th>
              <th style={{ width: 64, textAlign: 'right' }}>代码行</th>
              <th style={{ width: 66, textAlign: 'right' }}>复杂度</th>
              <th style={{ width: 44, textAlign: 'right' }}>作者</th>
              <th style={{ width: 84 }}>最近改动</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.path} className={`click ${selFile === h.path ? 'sel' : ''}`} onClick={() => onOpenFile(h.path)}>
                <td>
                  <div className="rl-row" style={{ gap: 6 }}>
                    <b style={{ color: hotspotColor(h.score), width: 26, textAlign: 'right' }}>{h.score}</b>
                    <div style={{ width: 30 }}><Bar value={h.score} max={maxScore} color={hotspotColor(h.score)} /></div>
                  </div>
                </td>
                <td><div className="rl-path" title={`${h.path}（${h.lang}${h.complexityKnown ? '' : '，内容未读'}）`}>{h.path}</div></td>
                <td style={{ textAlign: 'right' }}>{h.commits}</td>
                <td style={{ textAlign: 'right' }} className="rl-muted">+{h.addedLines}/−{h.deletedLines}</td>
                <td style={{ textAlign: 'right' }}>{h.loc || '—'}</td>
                <td style={{ textAlign: 'right', color: h.cxScore >= 60 ? '#FBBF24' : undefined }}>{h.complexityKnown ? h.cxScore : '—'}</td>
                <td style={{ textAlign: 'right' }}>{h.authors}</td>
                <td className="rl-muted">{dateStr(h.lastTouch)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selFile && (
        <div className="rl-detail">
          <div className="rl-row" style={{ justifyContent: 'space-between' }}>
            <b className="rl-path" style={{ color: '#fff' }}>{selFile}</b>
            <button className="small" onClick={onClose}>收起</button>
          </div>
          {!fileDetail && <div className="rl-hint">加载中…</div>}
          {fileDetail && <FileDetailView d={fileDetail} />}
        </div>
      )}
    </div>
  )
}

function FileDetailView({ d }: { d: FileDetail }): JSX.Element {
  const s = d.summary
  const maxChurn = Math.max(1, ...d.timeline.map((b) => b.churn))
  return (
    <div style={{ marginTop: 8 }}>
      {s && (
        <StatChips items={[
          { label: '热点分', value: String(s.score), tone: s.score >= 55 ? 'err' : s.score >= 25 ? 'warn' : 'ok' },
          { label: '提交', value: String(s.commits) },
          { label: '增/删', value: `+${s.addedLines}/−${s.deletedLines}` },
          { label: '代码行', value: String(s.loc) },
          { label: '复杂度', value: String(s.cxScore) },
          { label: '作者', value: `${s.authors}（主 ${s.topAuthor} ${Math.round(s.topAuthorShare * 100)}%）` },
          { label: '最近', value: dateStr(s.lastTouch) },
        ]} />
      )}
      <div className="rl-label" style={{ marginTop: 8 }}>近 52 周变更（柱高 = 增删行数）</div>
      <div className="rl-spark">
        {d.timeline.map((b, i) => (
          <div key={i} style={{ height: `${Math.max(2, (b.churn / maxChurn) * 100)}%`, opacity: b.churn ? 1 : 0.25 }}
            title={`${b.weekStartIso}：${b.commits} 次提交，±${b.churn} 行`} />
        ))}
      </div>
      <div className="rl-row" style={{ gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }} className="rl-grow">
          <div className="rl-label">共变伙伴（同一提交中一起出现的文件 Top）</div>
          {d.coPartners.length === 0 && <div className="rl-hint rl-muted">无</div>}
          {d.coPartners.slice(0, 6).map((p) => (
            <div key={p.path} className="rl-row" style={{ fontSize: 11, gap: 6 }}>
              <span className="rl-path rl-grow">{p.path}</span>
              <span className="rl-muted" style={{ flex: 'none' }}>×{p.coCommits}</span>
            </div>
          ))}
        </div>
        <div style={{ minWidth: 200 }}>
          <div className="rl-label">作者分布</div>
          {d.authors.map((a) => (
            <div key={a.name} className="rl-row" style={{ fontSize: 11, gap: 6 }}>
              <span className="rl-grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              <span className="rl-muted" style={{ flex: 'none' }}>{a.commits}</span>
            </div>
          ))}
        </div>
      </div>
      {d.duplications.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="rl-label">涉及的重复块</div>
          {d.duplications.slice(0, 5).map((p, i) => (
            <div key={i} className="rl-hint">{p.a === d.path ? p.b : p.a} · {p.lines} 行重复</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 体检 Tab（耦合/重复/大对象/卫生/分支）───────────────────────────────────

function AuditTab({ report }: { report: ScanReport | null }): JSX.Element {
  // hooks 必须在早退之前（条件 hook 违规会让 React 报错）
  const [dupOpen, setDupOpen] = useState<number | null>(null)
  if (!report || report.status !== 'ok') return <EmptyReport />
  const stale = report.branches.filter((b) => Date.now() / 1000 - b.date > 30 * 86400)
  return (
    <div className="rl-scroll" style={{ flex: 1, padding: 12 }}>
      <div className="rl-section rl-card">
        <div className="rl-h3">时间耦合（同窗内总是被一起改的文件对——表面独立、实际一体）</div>
        {report.couples.length === 0 && <div className="rl-hint rl-muted">无显著共变对（≥3 次同提交且占比 ≥0.5）</div>}
        {report.couples.slice(0, 20).map((c, i) => (
          <div key={i} className="rl-row" style={{ fontSize: 11.5, padding: '3px 0', gap: 8, borderBottom: '1px solid #202027' }}>
            <span className="rl-badge" style={{ background: '#312A1A', color: '#FBBF24', flex: 'none' }}>{c.co}次</span>
            <span className="rl-path rl-grow" title={c.a}>{c.a}</span>
            <span className="rl-muted" style={{ flex: 'none' }}>⇄</span>
            <span className="rl-path rl-grow" title={c.b}>{c.b}</span>
            <span className="rl-muted" style={{ flex: 'none', width: 46, textAlign: 'right' }}>{Math.round(c.ratio * 100)}%</span>
          </div>
        ))}
      </div>

      <div className="rl-section rl-card">
        <div className="rl-h3">重复代码块（归一化行哈希，6 行窗口）</div>
        <div className="rl-hint" style={{ marginBottom: 6 }}>
          共 {report.dupSummary ? report.dupSummary.totalDupLines : 0} 行重复
          （占代码 {report.dupSummary ? (report.dupSummary.ratio * 100).toFixed(1) : '?'}%）
          {report.dupSummary && report.dupSummary.filesSkipped > 0 ? `；跳过大文件 ${report.dupSummary.filesSkipped} 个` : ''}
        </div>
        {report.duplications.pairs.length === 0 && <div className="rl-hint rl-muted">未检出 ≥6 行的重复块</div>}
        {report.duplications.pairs.slice(0, 30).map((p, i) => (
          <div key={i} style={{ borderBottom: '1px solid #202027' }}>
            <div className="rl-row click" style={{ padding: '4px 0', cursor: 'pointer', gap: 8 }} onClick={() => setDupOpen(dupOpen === i ? null : i)}>
              <span className="rl-badge" style={{ background: '#1E2A3A', color: '#93C5FD', flex: 'none' }}>{p.lines} 行</span>
              <span className="rl-path rl-grow" title={p.a}>{p.a}</span>
              <span className="rl-muted" style={{ flex: 'none' }}>⇄</span>
              <span className="rl-path rl-grow" title={p.b}>{p.b}</span>
            </div>
            {dupOpen === i && (
              <pre style={{ margin: '2px 0 8px', background: '#141418', padding: 6, borderRadius: 6, fontSize: 11 }}>
                {p.preview.join('\n')}
              </pre>
            )}
          </div>
        ))}
      </div>

      <div className="rl-section rl-card">
        <div className="rl-h3">提交卫生 × 巴士因子</div>
        <StatChips items={[
          { label: 'conventional', value: `${Math.round((report.hygiene ? report.hygiene.conventionalRate : 0) * 100)}%`, tone: (report.hygiene ? report.hygiene.conventionalRate : 0) >= 0.6 ? 'ok' : 'warn' },
          { label: '草率消息', value: String(report.hygiene ? report.hygiene.sloppy : 0), tone: (report.hygiene ? report.hygiene.sloppyRate : 0) > 0.2 ? 'warn' : 'ok' },
          { label: '巨提交(≥20文件)', value: String(report.hygiene ? report.hygiene.bigCommits : 0), tone: (report.hygiene ? report.hygiene.bigRate : 0) > 0.1 ? 'warn' : 'ok' },
          { label: '平均标题', value: `${report.hygiene ? report.hygiene.avgSubjectLen : 0} 字符` },
          { label: '巴士因子', value: String(report.busFactor ? report.busFactor.busFactor : '?'), tone: (report.busFactor ? report.busFactor.busFactor : 9) <= 2 ? 'warn' : 'ok' },
        ]} />
        <div style={{ marginTop: 8 }}>
          {((report.busFactor && report.busFactor.authors) || []).map((a) => (
            <div key={a.name} className="rl-row" style={{ fontSize: 11, gap: 8, marginBottom: 3 }}>
              <span style={{ width: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 'none' }}>{a.name}</span>
              <div className="rl-grow"><Bar value={a.commits} max={(report.busFactor && report.busFactor.authors[0].commits) || 1} color="#8B5CF6" /></div>
              <span className="rl-muted" style={{ width: 90, textAlign: 'right', flex: 'none' }}>{a.commits} 次 · {Math.round(a.share * 100)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rl-section rl-card">
        <div className="rl-h3">历史大对象（.git 里的体积大户）</div>
        {report.blobs.length === 0 && <div className="rl-hint rl-muted">无显著大对象</div>}
        {report.blobs.slice(0, 15).map((b) => (
          <div key={b.path} className="rl-row" style={{ fontSize: 11.5, gap: 8, padding: '3px 0' }}>
            <span className="rl-badge" style={{ background: b.mb >= 10 ? '#3A1E1E' : '#232329', color: b.mb >= 10 ? '#F87171' : '#A1A1AA', width: 62, textAlign: 'center', flex: 'none' }}>{b.mb}MB</span>
            <span className="rl-path rl-grow" title={b.path}>{b.path}</span>
            <span className="rl-muted" style={{ flex: 'none' }}>{b.versions} 版本</span>
          </div>
        ))}
      </div>

      <div className="rl-section rl-card">
        <div className="rl-h3">分支（{stale.length} / {report.branches.length} 个超过 30 天未动）</div>
        {report.branches.length === 0 && <div className="rl-hint rl-muted">无本地分支信息</div>}
        {report.branches.slice(0, 20).map((b) => {
          const ageDays = Math.floor((Date.now() / 1000 - b.date) / 86400)
          return (
            <div key={b.branch} className="rl-row" style={{ fontSize: 11.5, gap: 8, padding: '3px 0' }}>
              <span className="rl-badge" style={{ background: ageDays > 30 ? '#3A1E1E' : '#1E2A22', color: ageDays > 30 ? '#F87171' : '#34D399', flex: 'none' }}>{ageDays}天</span>
              <span className="mono" style={{ flex: 'none', color: '#93C5FD' }}>{b.branch}</span>
              <span className="rl-path rl-grow rl-muted">{b.subject}</span>
              <span className="rl-muted" style={{ flex: 'none' }}>{b.author}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 历史/设置 Tab ───────────────────────────────────────────────────────────

function HistoryTab(props: {
  runs: RunItem[]
  settings: Settings | null
  days: string; maxCommits: string
  setDays: (s: string) => void; setMaxCommits: (s: string) => void
  onLoadRun: (id: string) => void
  onSaveDefaults: () => void
  onSelftest: () => void
  selftest: { ok: boolean; total: number; failed: Array<{ name: string; error: string }>; git: string } | null
  selftesting: boolean
  onRestart: () => void
  onClearRecents: () => void
}): JSX.Element {
  const { runs, settings, days, maxCommits, setDays, setMaxCommits, onLoadRun, onSaveDefaults, onSelftest, selftest, selftesting, onRestart, onClearRecents } = props
  return (
    <div className="rl-scroll" style={{ flex: 1, padding: 12 }}>
      <div className="rl-section rl-card">
        <div className="rl-h3">扫描历史（最近 {runs.length} 次）</div>
        {runs.length === 0 && <div className="rl-hint rl-muted">还没有扫描记录</div>}
        {runs.map((r) => (
          <div key={r.runId} className="rl-row click" style={{ fontSize: 11.5, gap: 8, padding: '5px 0', cursor: 'pointer', borderBottom: '1px solid #202027' }} onClick={() => r.status === 'ok' && onLoadRun(r.runId)}>
            <span className="rl-dot" style={{ background: r.status === 'ok' ? '#34D399' : '#F87171', flex: 'none' }} />
            <span className="rl-badge" style={{ background: '#232329', flex: 'none', width: 64, textAlign: 'center' }}>
              {r.status === 'ok' ? `${r.health != null ? r.health : '?'}分` : '失败'}
            </span>
            <span className="rl-path rl-grow" title={r.path}>{r.path}</span>
            <span className="rl-muted" style={{ flex: 'none' }}>{r.commits != null ? `${r.commits} 提交` : ''}</span>
            <span className="rl-muted" style={{ flex: 'none', width: 90, textAlign: 'right' }}>{dateTimeStr(r.startedAt)}</span>
          </div>
        ))}
      </div>

      <div className="rl-section rl-card">
        <div className="rl-h3">默认扫描参数</div>
        <div className="rl-row" style={{ gap: 12 }}>
          <label className="rl-row" style={{ gap: 6 }}>
            <span className="rl-muted">时间窗（天）</span>
            <input style={{ width: 80 }} value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
          <label className="rl-row" style={{ gap: 6 }}>
            <span className="rl-muted">最多提交数</span>
            <input style={{ width: 90 }} value={maxCommits} onChange={(e) => setMaxCommits(e.target.value)} />
          </label>
          <button className="primary" onClick={onSaveDefaults}>保存默认</button>
        </div>
        {settings && settings.recentPaths.length > 0 && (
          <div className="rl-row" style={{ marginTop: 8 }}>
            <span className="rl-muted">最近路径 {settings.recentPaths.length} 条</span>
            <button className="small" onClick={onClearRecents}>清除</button>
          </div>
        )}
      </div>

      <div className="rl-section rl-card">
        <div className="rl-h3">离线自检与服务</div>
        <div className="rl-row" style={{ gap: 8 }}>
          <button className="primary" onClick={onSelftest} disabled={selftesting}>{selftesting ? '自检中…' : '跑自检'}</button>
          <button onClick={onRestart}>重启服务</button>
        </div>
        {selftest && (
          <div style={{ marginTop: 8 }}>
            <div className={selftest.ok ? 'rl-ok' : 'rl-err'}>
              {selftest.ok ? `✓ 自检 ${selftest.total}/${selftest.total} 通过` : `✗ ${selftest.total - selftest.failed.length}/${selftest.total} 通过`}
            </div>
            <div className="rl-hint rl-muted">git：{selftest.git}</div>
            {selftest.failed.map((f) => <div key={f.name} className="rl-err rl-hint">✗ {f.name}: {f.error}</div>)}
          </div>
        )}
      </div>

      <div className="rl-hint rl-muted">
        上限口径：文件 3000 / 单文件 1MB / 内容 30MB / 提交 2 万 / git log 输出 64MB，超出即截断并在警告中明示。
        历史报告在服务重启后丢失（kv 投影仍可查概况，文件下钻需重扫）。
      </div>
    </div>
  )
}
