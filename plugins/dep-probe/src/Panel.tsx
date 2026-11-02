/**
 * Panel.tsx —— 依赖体检台面板
 *
 * Tab 结构：扫描 / 报告 / 历史 / 设置
 * 数据面：127.0.0.1 直连服务（model.ts）；扫描进行中 1s 轮询进度。
 * 已知限制：Web(https) 部署模式下浏览器会拦 http://127.0.0.1 混合内容——
 * 桌面/手机 WebView 正常（与 stream-desk/api-bench/imgforge 面板直连面同款边界）。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, invalidateMeta, readMeta, SvcError } from './model'
import type { Finding, IgnoreRule, RunItem, ScanProgress, ScanReport, ScanStatus, Sev, Settings } from './model'
import { restartService } from './host'
import {
  dateTimeStr, FindingList, PanelStyle, SevBadge, SevDot, sevColor, StatChips, timeStr,
} from './ui'
import { SEV_LABEL } from './ui'

const PLUGIN_ID = 'dep-probe'
const SERVICE_ID = 'dep-probe-server'
const SEVS: Sev[] = ['critical', 'high', 'medium', 'low', 'unknown']

type Tab = 'scan' | 'report' | 'history' | 'settings'

export default function Panel({ pluginId }: { pluginId: string; onSendToChat?: (msg: string) => void }): JSX.Element {
  const [tab, setTab] = useState<Tab>('scan')
  const [svcDown, setSvcDown] = useState<string | null>(null)
  const [degraded, setDegraded] = useState(false)
  const [metaInfo, setMetaInfo] = useState<{ version: string; uptime: number; kvEndpoint: string | null; osvBase: string } | null>(null)

  // 扫描 Tab
  const [pathsText, setPathsText] = useState('')
  const [busy, setBusy] = useState<ScanStatus | null>(null)
  const [scanErr, setScanErr] = useState<string | null>(null)

  // 报告 Tab
  const [report, setReport] = useState<ScanReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)

  // 历史 Tab
  const [runs, setRuns] = useState<RunItem[]>([])

  // 设置 Tab
  const [settings, setSettings] = useState<Settings | null>(null)
  const [selftest, setSelftest] = useState<{ ok: boolean; checks: string[] } | null>(null)

  const runIdRef = useRef<string | null>(null)

  const loadRuns = useCallback(async () => {
    try { const r = await api.runs(); setRuns(r.runs); setDegraded(!!r.degraded) } catch (_) { /* 忽略 */ }
  }, [])

  const loadSettings = useCallback(async () => {
    try { const r = await api.settings(); setSettings(r.settings); setDegraded(r.degraded) } catch (_) { /* 忽略 */ }
  }, [])

  const loadReport = useCallback(async (runId: string) => {
    setReportLoading(true)
    try {
      const r = await api.report(runId)
      setReport(r.report)
      setDegraded(false)
    } catch (e) { setScanErr((e as Error).message) } finally { setReportLoading(false) }
  }, [])

  // ── 首次挂载：meta + 最近路径 + 最近报告 ──
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
        const meta = await api.meta()
        setMetaInfo({ version: meta.version, uptime: meta.uptime, kvEndpoint: meta.kvEndpoint, osvBase: meta.osvBase })
        setDegraded(meta.degraded)
        setSvcDown(null)
      } catch (e) { setSvcDown((e as Error).message) }
      try {
        const s = await api.settings()
        if (alive) {
          setSettings(s.settings)
          if (s.settings.recentPaths.length) setPathsText(s.settings.recentPaths.join('\n'))
        }
      } catch (_) { /* 忽略 */ }
      try {
        const r = await api.runs()
        if (alive && r.runs.length) { setRuns(r.runs); await loadReport('latest') }
      } catch (_) { /* 忽略 */ }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 轮询：进行中 1s；否则 3s 轻心跳（busy 标志）──
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (!alive) return
      try {
        const rid = runIdRef.current
        if (rid) {
          const st = await api.scanStatus(rid)
          if (!alive) return
          setBusy(st.status === 'running' ? st : null)
          if (st.status === 'done' && st.report) {
            runIdRef.current = null
            setReport(st.report)
            setScanErr(null)
            loadRuns()
          } else if (st.status === 'error') {
            runIdRef.current = null
            setScanErr(st.progress.error || st.error || '扫描失败')
            loadRuns()
          }
        } else {
          const meta = await api.meta()
          if (!alive) return
          setSvcDown(null)
          setMetaInfo({ version: meta.version, uptime: meta.uptime, kvEndpoint: meta.kvEndpoint, osvBase: meta.osvBase })
          setDegraded(meta.degraded)
        }
      } catch (e) {
        if (alive) setSvcDown((e as Error).message)
      }
      timer = setTimeout(tick, runIdRef.current ? 1_000 : 3_000)
    }
    timer = setTimeout(tick, 1_200)
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [loadRuns])

  const startScan = useCallback(async () => {
    const paths = pathsText.split('\n').map((s) => s.trim()).filter(Boolean)
    if (!paths.length) { setScanErr('请先填入至少一个路径（目录或 lockfile 文件，每行一个）'); return }
    setScanErr(null)
    try {
      const { runId } = await api.scan(paths)
      runIdRef.current = runId
      const st = await api.scanStatus(runId)
      setBusy(st)
    } catch (e) {
      if (e instanceof SvcError && e.status === 409) setScanErr('已有扫描在进行中，请等待完成')
      else setScanErr((e as Error).message)
    }
  }, [pathsText])

  const openRun = useCallback((runId: string) => {
    setTab('report')
    void loadReport(runId)
  }, [loadReport])

  const addIgnore = useCallback(async (f: Finding) => {
    const reason = window.prompt(`忽略 ${f.pkg} / ${f.vulnId} 的理由（会留档）`, '误报/已确认无风险')
    if (reason == null) return
    const rule: IgnoreRule = { pkg: f.pkg, vulnId: f.vulnId, reason: reason || '（未填写）', at: Date.now() }
    const next = { ...(settings || { ignores: [], recentPaths: [] }), ignores: [...(settings?.ignores || []), rule] }
    try {
      const r = await api.saveSettings({ ignores: next.ignores })
      setSettings(r.settings)
      // 忽略后重算当前报告视图（服务端下次扫描才持久生效；本地先把该发现滤掉展示）
      setReport((rep) => (rep ? {
        ...rep,
        findings: rep.findings.filter((x) => !(x.pkg === f.pkg && x.vulnId === f.vulnId)),
        findingCount: Math.max(0, rep.findingCount - 1),
        ignoredCount: rep.ignoredCount + 1,
      } : rep))
    } catch (e) { setScanErr((e as Error).message) }
  }, [settings])

  const removeIgnore = useCallback(async (rule: IgnoreRule) => {
    if (!settings) return
    const next = settings.ignores.filter((x) => !(x.pkg === rule.pkg && x.vulnId === rule.vulnId && x.at === rule.at))
    try { const r = await api.saveSettings({ ignores: next }); setSettings(r.settings) } catch (e) { setScanErr((e as Error).message) }
  }, [settings])

  const doRestart = useCallback(async () => {
    try {
      await restartService(PLUGIN_ID, SERVICE_ID)
      invalidateMeta()
      setSvcDown(null)
      setBusy(null)
      runIdRef.current = null
    } catch (e) { setScanErr(`重启失败：${(e as Error).message}`) }
  }, [])

  const doSelftest = useCallback(async () => {
    try { setSelftest(await api.selftest()) } catch (e) { setSelftest({ ok: false, checks: [(e as Error).message] }) }
  }, [])

  return (
    <div className="depprobe-panel">
      <PanelStyle />
      <div className="dp-tabs">
        {([['scan', '扫描'], ['report', '报告'], ['history', '历史'], ['settings', '设置']] as Array<[Tab, string]>).map(([k, label]) => (
          <button key={k} className={`dp-tab ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); if (k === 'history') loadRuns(); if (k === 'settings') loadSettings() }}>{label}</button>
        ))}
      </div>
      <div className="dp-statusbar">
        <span className="dp-dot" style={{ background: svcDown ? '#F87171' : degraded ? '#FBBF24' : '#34D399' }} />
        <span>{svcDown ? `服务不可达：${svcDown}` : degraded ? '降级模式（kv 不可达，仅当前会话可见）' : `服务正常 v${metaInfo?.version || '…'} · OSV: ${metaInfo?.osvBase || '…'}`}</span>
        <span style={{ flex: 1 }} />
        {busy && <span className="dp-badge" style={{ background: '#1D4ED822', color: '#60A5FA' }}>扫描中</span>}
      </div>

      {tab === 'scan' && (
        <ScanTab
          pathsText={pathsText} setPathsText={setPathsText}
          busy={busy} scanErr={scanErr} onStart={startScan}
          lastReport={report} onOpenReport={() => setTab('report')}
        />
      )}
      {tab === 'report' && (
        <ReportTab report={report} loading={reportLoading} onIgnore={addIgnore} />
      )}
      {tab === 'history' && (
        <HistoryTab runs={runs} onOpen={openRun} />
      )}
      {tab === 'settings' && (
        <SettingsTab
          settings={settings} metaInfo={metaInfo} degraded={degraded}
          selftest={selftest} onSelftest={doSelftest} onRestart={doRestart}
          onRemoveIgnore={removeIgnore}
        />
      )}
    </div>
  )
}

// ── 扫描 Tab ────────────────────────────────────────────────────────────────
function ScanTab({ pathsText, setPathsText, busy, scanErr, onStart, lastReport, onOpenReport }: {
  pathsText: string
  setPathsText: (v: string) => void
  busy: ScanStatus | null
  scanErr: string | null
  onStart: () => void
  lastReport: ScanReport | null
  onOpenReport: () => void
}): JSX.Element {
  return (
    <div className="dp-scroll" style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="dp-card">
        <label className="dp-label">体检范围（每行一个目录或 lockfile 文件；目录递归发现 lockfile，最多 4 层深，自动跳过 node_modules / target 等）</label>
        <textarea
          style={{ width: '100%', minHeight: 88, resize: 'vertical' }}
          placeholder={'D:\\space\\base\\Polaris-plugin\nD:\\space\\base\\Polaris\\src-tauri\\Cargo.lock'}
          value={pathsText}
          onChange={(e) => setPathsText(e.target.value)}
          disabled={!!busy}
        />
        <div className="dp-row" style={{ marginTop: 8 }}>
          <button className="primary" disabled={!!busy || !pathsText.trim()} onClick={onStart}>开始体检</button>
          <span className="dp-hint">受支持：package-lock.json / pnpm-lock.yaml / Cargo.lock / requirements*.txt / go.mod</span>
        </div>
        {scanErr && <div className="dp-err" style={{ marginTop: 6 }}>{scanErr}</div>}
      </div>

      {busy && (
        <div className="dp-card">
          <div className="dp-row" style={{ marginBottom: 6 }}>
            <span className="dp-badge" style={{ background: '#1D4ED822', color: '#60A5FA' }}>{phaseLabel(busy.progress.phase)}</span>
            <span className="dp-hint">{Math.round(busy.elapsedMs / 1000)}s · runId {busy.runId}</span>
          </div>
          <div className="dp-hint">{phaseDetail(busy.progress)}</div>
        </div>
      )}

      {lastReport && !busy && (
        <div className="dp-card">
          <div className="dp-row">
            <span className="dp-hint">最近报告：{lastReport.error ? <span className="dp-err">失败</span> : `${lastReport.findingCount} 条发现（${lastReport.repos.length} 仓 / ${lastReport.packageCount} 包）`}</span>
            <span style={{ flex: 1 }} />
            <button className="small" onClick={onOpenReport}>查看报告 →</button>
          </div>
        </div>
      )}

      <div className="dp-card">
        <div className="dp-label">工作方式</div>
        <div className="dp-hint">
          本插件把 lockfile 里的依赖版本与 <b>OSV.dev</b>（Google 运营的开源漏洞库，聚合 GitHub Advisory / RustSec / PyPI 等）比对。
          网络只出站到 api.osv.dev；文件只读；报告落本机（cap.kv），可被 AI 经 MCP 七工具读取解读。报告≠安全保证：只覆盖已知漏洞与已钉版本。
        </div>
      </div>
    </div>
  )
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'discover': return '① 发现 lockfile'
    case 'parse': return '② 解析依赖清单'
    case 'query': return '③ 比对 OSV 漏洞库'
    case 'details': return '④ 补全漏洞详情'
    case 'done': return '完成'
    case 'error': return '失败'
    default: return phase
  }
}

function phaseDetail(p: ScanProgress): string {
  switch (p.phase) {
    case 'discover': return `已发现 ${p.filesFound} 个 lockfile…`
    case 'parse': return `已解析 ${p.filesFound} 个文件中的 ${p.packages} 个包…`
    case 'query': return `OSV 批量查询 ${p.queriedBatches}/${p.totalBatches || '?'} 批（${p.packages} 包）…`
    case 'details': return `补全漏洞详情 ${p.detailsFetched}/${p.totalDetails || '?'} …`
    default: return ''
  }
}

// ── 报告 Tab ────────────────────────────────────────────────────────────────
function ReportTab({ report, loading, onIgnore }: { report: ScanReport | null; loading: boolean; onIgnore: (f: Finding) => void }): JSX.Element {
  const [sevFilter, setSevFilter] = useState<Sev | 'all'>('all')
  const [repoFilter, setRepoFilter] = useState<string>('all')

  if (loading) return <div className="dp-hint dp-scroll" style={{ flex: 1, padding: 14 }}>报告加载中…</div>
  if (!report) return <div className="dp-hint dp-scroll" style={{ flex: 1, padding: 14 }}>暂无报告——先在「扫描」Tab 跑一次体检。</div>
  if (report.error) {
    return (
      <div className="dp-scroll" style={{ flex: 1, padding: 12 }}>
        <div className="dp-card dp-err">扫描失败：{report.error}</div>
        {(report.warnings || []).length > 0 && <WarningsCard warnings={report.warnings} />}
      </div>
    )
  }

  const repos = report.repos || []
  const findings = (report.findings || []).filter((f) => {
    if (sevFilter !== 'all' && f.severity !== sevFilter) return false
    if (repoFilter !== 'all' && f.repoDir !== repoFilter) return false
    return true
  })
  const topFix = (report.fixPlan || []).filter((p) => p.to).slice(0, 8)

  const chips: Array<{ label: string; value: string; tone?: 'ok' | 'warn' | 'err' | 'muted' }> = [
    { label: '仓库', value: String(repos.length) },
    { label: '包', value: String(report.packageCount) },
    { label: '发现', value: String(report.findingCount), tone: report.findingCount > 0 ? 'err' : 'ok' },
    ...SEVS.map((s): { label: string; value: string; tone?: 'ok' | 'warn' | 'err' | 'muted' } => ({
      label: SEV_LABEL[s],
      value: String(report.counts[s] || 0),
      tone: s === 'critical' && report.counts[s] ? 'err' : s === 'high' && report.counts[s] ? 'warn' : 'muted',
    })),
    ...(report.ignoredCount ? [{ label: '已忽略', value: String(report.ignoredCount), tone: 'muted' as const }] : []),
    { label: '完成', value: timeStr(report.finishedAt), tone: 'muted' as const },
  ]

  return (
    <div className="dp-scroll" style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <StatChips items={chips} />
      {report.truncated && <div className="dp-warn dp-hint">发现超过 800 条上限，展示已截断——建议缩小范围或先处理高危。</div>}

      {topFix.length > 0 && (
        <div className="dp-card">
          <div className="dp-label" style={{ marginBottom: 6 }}>最小修复方案（升到该版本即可消除对应全部已知漏洞）</div>
          {topFix.map((p) => (
            <div key={`${p.ecosystem}:${p.pkg}`} className="dp-row" style={{ padding: '3px 0', flexWrap: 'wrap' }}>
              <SevBadge sev={p.severity} />
              <span className="mono" style={{ fontSize: 11.5 }}>{p.pkg}</span>
              <span className="dp-muted mono" style={{ fontSize: 11 }}>{p.from} → <span className="dp-ok">{p.to}</span></span>
              <span className="dp-hint">消除 {p.vulnIds.length} 个漏洞</span>
            </div>
          ))}
        </div>
      )}

      <div className="dp-row" style={{ flexWrap: 'wrap' }}>
        <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value as Sev | 'all')} style={{ width: 96 }}>
          <option value="all">全部等级</option>
          {SEVS.map((s) => <option key={s} value={s}>{SEV_LABEL[s]}（{report.counts[s] || 0}）</option>)}
        </select>
        <select value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="all">全部仓库</option>
          {repos.map((r) => <option key={r.dir} value={r.dir}>{r.dir}</option>)}
        </select>
        <span className="dp-hint">{findings.length} 条匹配</span>
      </div>

      <div className="dp-card" style={{ padding: 0, overflow: 'hidden' }}>
        <FindingList findings={findings} emptyHint="（当前过滤条件下无发现）" onIgnore={onIgnore} />
      </div>

      {repos.length > 0 && (
        <div className="dp-card">
          <div className="dp-label" style={{ marginBottom: 6 }}>范围明细</div>
          {repos.map((r) => (
            <div key={r.dir} className="dp-hint" style={{ padding: '2px 0' }}>
              <span className="mono">{r.dir}</span> — {r.packageCount} 包（{r.files.map((f) => `${f.ecosystem}×${f.count}`).join('、')}）
            </div>
          ))}
        </div>
      )}

      {(report.warnings || []).length > 0 && <WarningsCard warnings={report.warnings} />}
    </div>
  )
}

function WarningsCard({ warnings }: { warnings: string[] }): JSX.Element {
  return (
    <div className="dp-card" style={{ marginTop: 8 }}>
      <div className="dp-label dp-warn" style={{ marginBottom: 4 }}>警告（报告可能不完整）</div>
      {warnings.slice(0, 30).map((w, i) => <div key={i} className="dp-hint dp-warn" style={{ wordBreak: 'break-all' }}>· {w}</div>)}
    </div>
  )
}

// ── 历史 Tab ────────────────────────────────────────────────────────────────
function HistoryTab({ runs, onOpen }: { runs: RunItem[]; onOpen: (runId: string) => void }): JSX.Element {
  if (!runs.length) return <div className="dp-hint dp-scroll" style={{ flex: 1, padding: 14 }}>暂无扫描历史。</div>
  return (
    <div className="dp-scroll" style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {runs.map((r) => (
        <div key={r.runId} className="dp-card dp-row" style={{ cursor: 'pointer' }} onClick={() => onOpen(r.runId)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dp-row">
              <span>{dateTimeStr(r.startedAt)}</span>
              <span className="dp-muted" style={{ fontSize: 11 }}>{r.runId}{r.truncated ? ' [截断]' : ''}</span>
            </div>
            <div className="dp-hint">{r.repos} 仓 / {r.packageCount} 包 / 发现 {r.findingCount}</div>
          </div>
          <div className="dp-row" style={{ gap: 4 }}>
            {SEVS.map((s) => (r.counts[s] ? (
              <span key={s} className="dp-badge" style={{ background: `${sevColor(s)}22`, color: sevColor(s) }}>
                {SEV_LABEL[s]} {r.counts[s]}
              </span>
            ) : null))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 设置 Tab ────────────────────────────────────────────────────────────────
function SettingsTab({ settings, metaInfo, degraded, selftest, onSelftest, onRestart, onRemoveIgnore }: {
  settings: Settings | null
  metaInfo: { version: string; uptime: number; kvEndpoint: string | null; osvBase: string } | null
  degraded: boolean
  selftest: { ok: boolean; checks: string[] } | null
  onSelftest: () => void
  onRestart: () => void
  onRemoveIgnore: (rule: IgnoreRule) => void
}): JSX.Element {
  const ignores = settings?.ignores || []
  const recent = settings?.recentPaths || []
  return (
    <div className="dp-scroll" style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="dp-card">
        <div className="dp-row">
          <span className="dp-label" style={{ margin: 0 }}>服务状态</span>
          <span style={{ flex: 1 }} />
          <button className="small" onClick={onRestart}>重启服务</button>
          <button className="small" onClick={onSelftest}>离线自检</button>
        </div>
        <div className="dp-hint" style={{ marginTop: 4 }}>
          v{metaInfo?.version || '?'} · 运行 {metaInfo ? Math.round(metaInfo.uptime / 1000) : '?'}s · kv {metaInfo?.kvEndpoint || '（未连接）'} · OSV {metaInfo?.osvBase || '?'}
          {degraded && <span className="dp-warn"> · 降级模式（kv 不可达，报告仅本次会话可见）</span>}
        </div>
        {selftest && (
          <div style={{ marginTop: 8 }}>
            <div className={selftest.ok ? 'dp-ok' : 'dp-err'}>{selftest.ok ? '✅ 自检通过' : '❌ 自检失败'}</div>
            <pre className="dp-hint" style={{ whiteSpace: 'pre-wrap' }}>{selftest.checks.join('\n')}</pre>
          </div>
        )}
      </div>

      <div className="dp-card">
        <div className="dp-label">忽略规则（{ignores.length}）——报告生成时生效；必须锚定包名或漏洞 ID</div>
        {ignores.length === 0 && <div className="dp-hint">暂无。可在报告里对某条发现点「忽略此包此漏洞」。</div>}
        {ignores.map((ig, i) => (
          <div key={`${ig.pkg}:${ig.vulnId}:${ig.at}:${i}`} className="dp-row" style={{ padding: '3px 0' }}>
            <span className="mono" style={{ fontSize: 11.5 }}>{ig.pkg || '（全部包）'}</span>
            <span className="dp-id mono" style={{ color: '#93C5FD', fontSize: 11 }}>{ig.vulnId || '（全部漏洞）'}</span>
            <span className="dp-hint dp-grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ig.reason}</span>
            <button className="small" onClick={() => onRemoveIgnore(ig)}>删除</button>
          </div>
        ))}
      </div>

      {recent.length > 0 && (
        <div className="dp-card">
          <div className="dp-label">最近体检路径（已预填到扫描页）</div>
          {recent.map((p) => <div key={p} className="dp-hint mono" style={{ wordBreak: 'break-all' }}>· {p}</div>)}
        </div>
      )}

      <div className="dp-card">
        <div className="dp-label">安全边界</div>
        <div className="dp-hint">
          网络只出站到 api.osv.dev（不接受任何传入 URL）；文件只读；不执行系统命令；
          服务仅监听 127.0.0.1 且全部 API 需要 Bearer token；漏洞详情缓存落 appConfigDir/dep-probe/cache（TTL 7 天，仅公告元数据）。
        </div>
      </div>
    </div>
  )
}
