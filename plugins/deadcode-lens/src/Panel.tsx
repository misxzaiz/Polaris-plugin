/**
 * Panel.tsx —— 死代码透视台面板
 *
 * Tab 结构：扫描 / 报告 / 历史 / 设置
 * 数据面：127.0.0.1 直连服务（model.ts）；扫描进行中 1s 轮询进度。
 * 样式：JS 内嵌 <style>（宿主只加载 manifest contributes.styles 与 JS，
 * dist/panel.css 不会被加载——dev-toolbox 实测结论），类名 dcl- 前缀防撞。
 * 已知限制：Web(https) 部署模式下浏览器会拦 http://127.0.0.1 混合内容——
 * 桌面/手机 WebView 正常（house 面板直连面同款边界）。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, invalidateMeta, fmtBytes, fmtTime, SvcError } from './model'
import type { Report, RunItem, Settings } from './model'
import { restartService } from './host'

const PLUGIN_ID = 'deadcode-lens'
const SERVICE_ID = 'deadcode-lens-server'

type Tab = 'scan' | 'report' | 'history' | 'settings'
type Kind = 'all' | 'files' | 'exports' | 'deps' | 'unresolved' | 'cycles'

const KIND_LABEL: Record<Kind, string> = {
  all: '全部', files: '死文件', exports: '未使用导出', deps: '依赖', unresolved: '悬空导入', cycles: '循环依赖',
}

// ── 样式 ────────────────────────────────────────────────────────────────────
const STYLE = `
.dcl-panel { display:flex; flex-direction:column; height:100%; min-height:0; font-size:13px; color:var(--polaris-text, #d1d5db); background:var(--polaris-bg, transparent); }
.dcl-panel button { cursor:pointer; }
.dcl-tabs { display:flex; gap:2px; padding:8px 10px 0; border-bottom:1px solid var(--polaris-border,#374151); }
.dcl-tab { background:none; border:none; color:var(--polaris-text-2,#9ca3af); padding:6px 12px; font-size:13px; border-bottom:2px solid transparent; }
.dcl-tab.active { color:var(--polaris-text,#e5e7eb); border-bottom-color:#3b82f6; }
.dcl-statusbar { display:flex; align-items:center; gap:8px; padding:6px 12px; font-size:12px; color:var(--polaris-text-2,#9ca3af); border-bottom:1px solid var(--polaris-border,#374151); }
.dcl-dot { width:8px; height:8px; border-radius:50%; flex:none; }
.dcl-badge { font-size:11px; padding:1px 8px; border-radius:8px; }
.dcl-scroll { flex:1; overflow:auto; min-height:0; padding:12px; display:flex; flex-direction:column; gap:10px; }
.dcl-card { background:var(--polis-card,rgba(255,255,255,.04)); border:1px solid var(--polaris-border,#374151); border-radius:8px; padding:10px 12px; }
.dcl-label { display:block; font-size:12px; color:var(--polaris-text-2,#9ca3af); margin-bottom:4px; }
.dcl-input, .dcl-textarea { width:100%; box-sizing:border-box; background:var(--polaris-input,#1f2937); color:var(--polaris-text,#e5e7eb); border:1px solid var(--polaris-border,#374151); border-radius:6px; padding:6px 9px; font-size:13px; }
.dcl-textarea { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; resize:vertical; }
.dcl-btn { background:#2563eb; color:#fff; border:none; border-radius:6px; padding:7px 16px; font-size:13px; }
.dcl-btn:disabled { opacity:.5; cursor:default; }
.dcl-btn2 { background:rgba(255,255,255,.08); color:var(--polaris-text,#e5e7eb); border:1px solid var(--polaris-border,#374151); border-radius:6px; padding:5px 12px; font-size:12px; }
.dcl-chips { display:flex; flex-wrap:wrap; gap:6px; }
.dcl-chip { background:rgba(255,255,255,.06); border:1px solid var(--polaris-border,#374151); color:var(--polaris-text-2,#9ca3af); border-radius:12px; padding:2px 10px; font-size:12px; }
.dcl-chip:hover { color:var(--polaris-text,#e5e7eb); }
.dcl-stats { display:flex; flex-wrap:wrap; gap:8px; }
.dcl-stat { flex:1 1 100px; background:rgba(255,255,255,.04); border:1px solid var(--polaris-border,#374151); border-radius:8px; padding:8px 10px; }
.dcl-stat .n { font-size:20px; font-weight:600; }
.dcl-stat .t { font-size:11px; color:var(--polaris-text-2,#9ca3af); }
.dcl-progress { height:6px; border-radius:3px; background:rgba(255,255,255,.08); overflow:hidden; }
.dcl-progress > div { height:100%; background:#3b82f6; transition:width .3s; }
.dcl-filters { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.dcl-fbtn { background:rgba(255,255,255,.06); border:1px solid var(--polaris-border,#374151); color:var(--polaris-text-2,#9ca3af); border-radius:6px; padding:4px 10px; font-size:12px; }
.dcl-fbtn.active { background:#1d4ed833; border-color:#3b82f6; color:#93c5fd; }
.dcl-item { border:1px solid var(--polaris-border,#374151); border-radius:6px; padding:7px 10px; display:flex; flex-direction:column; gap:4px; }
.dcl-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.dcl-mono { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; word-break:break-all; }
.dcl-reason { font-size:11px; padding:1px 7px; border-radius:8px; flex:none; }
.dcl-evi { font-size:11px; color:var(--polaris-text-2,#9ca3af); padding-left:8px; border-left:2px solid var(--polaris-border,#374151); word-break:break-all; }
.dcl-muted { color:var(--polaris-text-2,#9ca3af); font-size:12px; }
.dcl-warn { background:#78350f33; border:1px solid #b4530966; color:#fcd34d; border-radius:6px; padding:6px 10px; font-size:12px; }
.dcl-ok { background:#064e3b33; border:1px solid #05966966; color:#6ee7b7; border-radius:6px; padding:6px 10px; font-size:12px; }
.dcl-err { background:#7f1d1d33; border:1px solid #dc262666; color:#fca5a5; border-radius:6px; padding:6px 10px; font-size:12px; }
.dcl-why { background:rgba(0,0,0,.25); border:1px solid var(--polaris-border,#374151); border-radius:6px; padding:8px 10px; display:flex; flex-direction:column; gap:4px; }
`

function PanelStyle(): JSX.Element { return <style>{STYLE}</style> }

// ── 小组件 ──────────────────────────────────────────────────────────────────
function Stat({ n, t, color }: { n: number | string; t: string; color?: string }) {
  return (
    <div className="dcl-stat">
      <div className="n" style={color ? { color } : undefined}>{n}</div>
      <div className="t">{t}</div>
    </div>
  )
}

function ReasonBadge({ reason }: { reason: string }) {
  const map: Record<string, [string, string, string]> = {
    'no-importer': ['零引用', '#7f1d1d55', '#fca5a5'],
    'only-dead-importers': ['仅被死文件引用', '#78350f55', '#fcd34d'],
    ok: ['成功', '#064e3b55', '#6ee7b7'],
    err: ['失败', '#7f1d1d55', '#fca5a5'],
  }
  const [label, bg, fg] = map[reason] || [reason, '#37415155', '#9ca3af']
  return <span className="dcl-reason" style={{ background: bg, color: fg }}>{label}</span>
}

function SuggestBadge({ s }: { s: string }) {
  const map: Record<string, [string, string, string]> = {
    delete: ['可删', '#7f1d1d55', '#fca5a5'],
    unexport: ['去 export', '#78350f55', '#fcd34d'],
    review: ['需人工确认', '#1e3a5f55', '#93c5fd'],
    tooling: ['工具链', '#1e3a5f55', '#93c5fd'],
  }
  const [label, bg, fg] = map[s] || [s, '#37415155', '#9ca3af']
  return <span className="dcl-reason" style={{ background: bg, color: fg }}>{label}</span>
}

// ── 主面板 ──────────────────────────────────────────────────────────────────
export default function Panel(): JSX.Element {
  const [tab, setTab] = useState<Tab>('scan')
  const [svcErr, setSvcErr] = useState<string | null>(null)
  const [degraded, setDegraded] = useState(false) // 降级 = kv 里有旧报告但服务不在

  // 扫描
  const [root, setRoot] = useState('')
  const [entriesText, setEntriesText] = useState('')
  const [ignoreText, setIgnoreText] = useState('')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [busy, setBusy] = useState<{ runId: string; phase: string; done: number; total: number } | null>(null)
  const [scanErr, setScanErr] = useState<string | null>(null)

  // 报告
  const [report, setReport] = useState<Report | null>(null)
  const [kind, setKind] = useState<Kind>('all')
  const [q, setQ] = useState('')
  const [whyPath, setWhyPath] = useState<string | null>(null)
  const [whyData, setWhyData] = useState<Record<string, unknown> | null>(null)
  const [copied, setCopied] = useState(false)

  // 历史
  const [runs, setRuns] = useState<RunItem[]>([])

  // 设置
  const [selftest, setSelftest] = useState<{ ok: boolean; total: number; failed: number; checks: { name: string; ok: boolean; expect: string; got: string }[] } | null>(null)
  const [selftestBusy, setSelftestBusy] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rootRef = useRef(root)
  rootRef.current = root

  const guard = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn()
      setSvcErr(null)
      setDegraded(false)
    } catch (e) {
      if (e instanceof SvcError) {
        setSvcErr(e.message)
        setDegraded(e.offline)
      } else {
        setSvcErr(e instanceof Error ? e.message : String(e))
      }
    }
  }, [])

  const loadSettings = useCallback(() => { void guard(async () => {
    const r = await api.settings()
    setSettings(r.settings)
    if (!rootRef.current && r.settings.recentRoots?.length) setRoot(r.settings.recentRoots[0])
    if (r.settings.ignorePrefixes?.length && !ignoreText) setIgnoreText(r.settings.ignorePrefixes.join('\n'))
  }) }, [guard, ignoreText])

  const loadHistory = useCallback(() => { void guard(async () => {
    const r = await api.history()
    setRuns(r.runs || [])
  }) }, [guard])

  const loadReport = useCallback((runId: string) => { void guard(async () => {
    const r = await api.report(runId)
    setReport(r.report)
    setTab('report')
  }) }, [guard])

  const loadLatest = useCallback(() => { void guard(async () => {
    const r = await api.latest()
    if (r.runId) {
      const rep = await api.report(r.runId)
      setReport(rep.report)
    }
  }) }, [guard])

  useEffect(() => {
    loadSettings()
    loadLatest()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startScan = useCallback(() => { void guard(async () => {
    const r = rootRef.current.trim()
    if (!r) { setScanErr('请填扫描根目录'); return }
    setScanErr(null)
    const entries = entriesText.split('\n').map((x) => x.trim()).filter(Boolean)
    const ignorePrefixes = ignoreText.split('\n').map((x) => x.trim()).filter(Boolean)
    const { runId } = await api.scan(r, entries, ignorePrefixes)
    setBusy({ runId, phase: '准备', done: 0, total: 0 })
    void api.saveSettings({ root: r, ignorePrefixes }).catch(() => undefined)
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => {
      void guard(async () => {
        const st = await api.run(runId)
        setBusy({ runId, phase: st.run.progress.phase, done: st.run.progress.done, total: st.run.progress.total })
        if (st.run.status === 'done' || st.run.status === 'error') {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          setBusy(null)
          if (st.run.status === 'error') setScanErr(st.run.error || '扫描失败')
          else await loadReport(runId)
        }
      }).catch(() => undefined)
    }, 900)
  }) }, [guard, entriesText, ignoreText, loadReport])

  const askWhy = useCallback((p: string) => { void guard(async () => {
    setWhyPath(p); setWhyData(null)
    const r = await api.why(p)
    setWhyData(r.why || { error: '无数据' })
  }) }, [guard])

  const exportMd = useCallback(() => { void guard(async () => {
    if (!report) return
    const md = reportToMd(report)
    try { await navigator.clipboard.writeText(md); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch (_) { setCopied(false) }
  }) }, [guard, report])

  const runSelftest = useCallback(() => { void guard(async () => {
    setSelftestBusy(true)
    try {
      const r = await api.selftest()
      setSelftest(r.selftest)
      if (!r.selftest.ok) setSvcErr(`自检失败 ${r.selftest.failed}/${r.selftest.total}`)
    } finally { setSelftestBusy(false) }
  }) }, [guard])

  const doRestart = useCallback(() => { void guard(async () => {
    await restartService(PLUGIN_ID, SERVICE_ID)
    invalidateMeta()
    await new Promise((r) => setTimeout(r, 1200))
    loadLatest()
  }) }, [guard, loadLatest])

  const counts = report?.counts

  return (
    <div className="dcl-panel">
      <PanelStyle />
      <div className="dcl-tabs">
        {(['scan', 'report', 'history', 'settings'] as Tab[]).map((k) => (
          <button key={k} className={`dcl-tab ${tab === k ? 'active' : ''}`}
            onClick={() => { setTab(k); if (k === 'history') loadHistory(); if (k === 'settings') loadSettings(); if (k === 'report' && !report) loadLatest() }}>
            {k === 'scan' ? '扫描' : k === 'report' ? '报告' : k === 'history' ? '历史' : '设置'}
          </button>
        ))}
      </div>
      <div className="dcl-statusbar">
        <span className="dcl-dot" style={{ background: svcErr ? '#F87171' : degraded ? '#FBBF24' : '#34D399' }} />
        <span>{svcErr ? '服务异常' : '引擎离线 · 文件只读 · 零网络'}</span>
        {busy && <span className="dcl-badge" style={{ background: '#1D4ED822', color: '#60A5FA' }}>扫描中</span>}
        <span style={{ flex: 1 }} />
        {svcErr && <button className="dcl-btn2" onClick={doRestart}>重启服务</button>}
      </div>
      {svcErr && <div className="dcl-err" style={{ margin: '10px 12px 0' }}>{svcErr}</div>}

      {tab === 'scan' && (
        <div className="dcl-scroll">
          <div className="dcl-card">
            <label className="dcl-label">扫描根目录（项目/仓库根；扫描 src 子目录也可以——会自动向上找 tsconfig/package.json）</label>
            <input className="dcl-input" value={root} placeholder="如 D:\space\base\Polaris 或 D:\space\base\Polaris\src"
              onChange={(e) => setRoot(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !busy) startScan() }} />
            {settings?.recentRoots?.length ? (
              <div className="dcl-chips" style={{ marginTop: 8 }}>
                {settings.recentRoots.map((r) => (
                  <button key={r} className="dcl-chip" onClick={() => setRoot(r)}>{r}</button>
                ))}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="dcl-btn" onClick={startScan} disabled={!!busy}>{busy ? '扫描中…' : '开始体检'}</button>
              <span style={{ flex: 1 }} />
              <span className="dcl-muted" style={{ alignSelf: 'center' }}>{counts ? `上次：${counts.files} 文件 / ${report?.meta.durationMs}ms` : ''}</span>
            </div>
            {busy && (
              <div style={{ marginTop: 10 }}>
                <div className="dcl-progress"><div style={{ width: busy.total ? `${Math.round((busy.done / busy.total) * 100)}%` : '30%' }} /></div>
                <div className="dcl-muted" style={{ marginTop: 4 }}>{busy.phase}{busy.total ? ` ${busy.done}/${busy.total}` : ''}</div>
              </div>
            )}
            {scanErr && <div className="dcl-warn" style={{ marginTop: 10 }}>{scanErr}</div>}
          </div>

          <details className="dcl-card">
            <summary className="dcl-label" style={{ cursor: 'pointer' }}>高级选项（补充入口 / 忽略前缀）</summary>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label className="dcl-label">补充入口（每行一个相对路径；import 图看不见的运行时入口，如 mcp/server.js、service/main.js）</label>
                <textarea className="dcl-textarea" rows={3} value={entriesText} onChange={(e) => setEntriesText(e.target.value)} />
              </div>
              <div>
                <label className="dcl-label">忽略路径前缀（每行一个；命中的文件不进发现列表）</label>
                <textarea className="dcl-textarea" rows={3} value={ignoreText} onChange={(e) => setIgnoreText(e.target.value)} />
              </div>
            </div>
          </details>

          {report && (
            <div className="dcl-stats">
              <Stat n={counts!.files} t="扫描文件" />
              <Stat n={counts!.orphanFiles} t="死文件" color={counts!.orphanFiles ? '#fca5a5' : undefined} />
              <Stat n={counts!.unusedExports} t="未使用导出" color={counts!.unusedExports ? '#fcd34d' : undefined} />
              <Stat n={counts!.unusedDeps} t="未使用依赖" color={counts!.unusedDeps ? '#fcd34d' : undefined} />
              <Stat n={counts!.unresolvedImports} t="悬空导入" color={counts!.unresolvedImports ? '#fca5a5' : undefined} />
              <Stat n={counts!.cycles} t="循环依赖" color={counts!.cycles ? '#fbbf24' : undefined} />
            </div>
          )}
          {report?.warnings?.length ? <div className="dcl-warn">{report.warnings.slice(0, 6).map((w, i) => <div key={i}>· {w}</div>)}</div> : null}
        </div>
      )}

      {tab === 'report' && (
        <div className="dcl-scroll">
          {!report ? <div className="dcl-muted">还没有报告——先去「扫描」Tab 跑一次体检。</div> : (
            <>
              <div className="dcl-filters">
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => {
                  const n = k === 'all' ? report.orphanFiles.length + report.unusedExports.length + report.deps.unused.length + report.unresolvedImports.length + report.cycles.length
                    : k === 'files' ? report.orphanFiles.length
                    : k === 'exports' ? report.unusedExports.length
                    : k === 'deps' ? report.deps.unused.length
                    : k === 'unresolved' ? report.unresolvedImports.length
                    : report.cycles.length
                  return (
                    <button key={k} className={`dcl-fbtn ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
                      {KIND_LABEL[k]} {n > 0 && <b>{n}</b>}
                    </button>
                  )
                })}
                <input className="dcl-input" style={{ width: 160, marginLeft: 'auto' }} placeholder="过滤…" value={q} onChange={(e) => setQ(e.target.value)} />
                <button className="dcl-btn2" onClick={exportMd}>{copied ? '已复制 ✓' : '复制 MD 报告'}</button>
              </div>
              {report.meta.noEntryMode && <div className="dcl-warn">未发现任何入口：死文件/导出维度已跳过（只报依赖/悬空/循环）。可在「扫描」Tab 补充入口。</div>}
              <FindingsList report={report} kind={kind} q={q} onWhy={askWhy} />
              {whyPath && (
                <div className="dcl-why">
                  <div className="dcl-row">
                    <b className="dcl-mono">{whyPath}</b>
                    <span style={{ flex: 1 }} />
                    <button className="dcl-btn2" onClick={() => { setWhyPath(null); setWhyData(null) }}>收起</button>
                  </div>
                  {!whyData ? <div className="dcl-muted">加载证据…</div> : <WhyView w={whyData} />}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="dcl-scroll">
          {runs.length === 0 ? <div className="dcl-muted">暂无历史。</div> : runs.map((r) => (
            <button key={r.id} className="dcl-item" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => loadReport(r.id)}>
              <div className="dcl-row">
                <span className="dcl-mono">{r.id}</span>
                <ReasonBadge reason={r.status === 'done' ? 'ok' : 'err'} />
                <span style={{ flex: 1 }} />
                <span className="dcl-muted">{fmtTime(r.startedAt)}</span>
              </div>
              <div className="dcl-mono dcl-muted">{r.root}</div>
              {r.counts && (
                <div className="dcl-muted">
                  死文件 {r.counts.orphanFiles} · 导出 {r.counts.unusedExports} · 依赖 {r.counts.unusedDeps} · 悬空 {r.counts.unresolvedImports} · 循环 {r.counts.cycles}
                </div>
              )}
              {r.error && <div className="dcl-err">{r.error}</div>}
            </button>
          ))}
        </div>
      )}

      {tab === 'settings' && (
        <div className="dcl-scroll">
          <div className="dcl-card">
            <div className="dcl-row">
              <button className="dcl-btn2" onClick={runSelftest} disabled={selftestBusy}>{selftestBusy ? '自检中…' : '运行离线自检'}</button>
              <span className="dcl-muted">内置虚拟项目验证引擎全管道（零网络零盘）</span>
            </div>
            {selftest && (
              <div style={{ marginTop: 8 }}>
                <div className={selftest.ok ? 'dcl-ok' : 'dcl-err'}>
                  {selftest.ok ? `自检通过 ${selftest.total}/${selftest.total}` : `自检失败 ${selftest.failed}/${selftest.total}`}
                </div>
                <div style={{ marginTop: 6 }}>
                  {selftest.checks.map((c) => (
                    <div key={c.name} className="dcl-evi" style={{ color: c.ok ? undefined : '#fca5a5' }}>
                      {c.ok ? '✓' : '✗'} {c.name}（期望 {c.expect}｜实际 {c.got}）
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="dcl-card">
            <label className="dcl-label">忽略路径前缀（每行一个，随扫描生效）</label>
            <textarea className="dcl-textarea" rows={3} value={ignoreText} onChange={(e) => setIgnoreText(e.target.value)} onBlur={() => { void api.saveSettings({ ignorePrefixes: ignoreText.split('\n').map((x) => x.trim()).filter(Boolean) }).catch(() => undefined) }} />
          </div>
          <div className="dcl-card dcl-muted">
            <div><b style={{ color: 'var(--polaris-text,#e5e7eb)' }}>安全边界</b></div>
            <div>· 引擎完全离线：零外部网络请求、零系统命令</div>
            <div>· 文件只读；唯一写入 = kv 投影（本机数据根）</div>
            <div>· 服务仅监听 127.0.0.1，Bearer token 鉴权（timingSafe 比对）</div>
            <div>· 已知边界：Vue SFC 不解析；monorepo 跨包引用按外部依赖处理；Web(https) 模式浏览器拦 127.0.0.1 混合内容（桌面/手机正常）</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 发现列表 ────────────────────────────────────────────────────────────────
function FindingsList({ report, kind, q, onWhy }: { report: Report; kind: Kind; q: string; onWhy: (p: string) => void }) {
  const needle = q.trim().toLowerCase()
  const hit = (s: string) => !needle || s.toLowerCase().includes(needle)

  const items: JSX.Element[] = []
  if ((kind === 'all' || kind === 'files') && report.orphanFiles.length) {
    const list = report.orphanFiles.filter((o) => hit(o.path))
    if (list.length) items.push(<SectionTitle key="t-files" n={list.length} label="死文件" />)
    for (const o of list.slice(0, kind === 'files' ? 400 : 40)) {
      items.push(
        <div key={`f-${o.path}`} className="dcl-item">
          <div className="dcl-row">
            <ReasonBadge reason={o.reason} />
            <span className="dcl-mono" style={{ flex: 1 }}>{o.path}</span>
            <span className="dcl-muted">{fmtBytes(o.bytes)} · {o.loc} 行</span>
            <button className="dcl-btn2" onClick={() => onWhy(o.path)}>为什么</button>
          </div>
          {o.importerCount > 0 && <div className="dcl-evi">引用者（全部已死）：{o.importers.join('、')}{o.importerCount > o.importers.length ? ` 等 ${o.importerCount} 个` : ''}</div>}
        </div>,
      )
    }
  }
  if ((kind === 'all' || kind === 'exports') && report.unusedExports.length) {
    const list = report.unusedExports.filter((x) => hit(x.path) || hit(x.name))
    if (list.length) items.push(<SectionTitle key="t-exp" n={list.length} label="未使用导出" />)
    for (const x of list.slice(0, kind === 'exports' ? 800 : 40)) {
      items.push(
        <div key={`e-${x.path}::${x.name}`} className="dcl-item">
          <div className="dcl-row">
            <SuggestBadge s={x.suggestion} />
            <span className="dcl-mono" style={{ flex: 1 }}>{x.path} <b style={{ color: '#93c5fd' }}>::{x.name}</b>{x.typeOnly ? ' (type)' : ''}</span>
            <button className="dcl-btn2" onClick={() => onWhy(x.path)}>为什么</button>
          </div>
          <div className="dcl-evi">
            {x.suggestion === 'delete' ? '全仓无导入者，且本文件内也无其他引用 → 整个声明可删'
              : x.suggestion === 'unexport' ? '本文件内部还有使用 → 只需去掉 export 关键字（保留声明）'
              : 'default 导出：确认运行时加载方式后再处理'}
          </div>
        </div>,
      )
    }
  }
  if ((kind === 'all' || kind === 'deps') && report.deps.unused.length) {
    const list = report.deps.unused.filter((d) => hit(d.name))
    if (list.length) items.push(<SectionTitle key="t-dep" n={list.length} label={`未使用依赖（${report.deps.checked}）`} />)
    for (const d of list.slice(0, 100)) {
      items.push(
        <div key={`d-${d.name}`} className="dcl-item">
          <div className="dcl-row">
            <SuggestBadge s={d.tooling ? 'tooling' : 'review'} />
            <span className="dcl-mono" style={{ flex: 1 }}>{d.name}</span>
            <span className="dcl-muted">{d.kind === 'dep' ? 'dependencies' : 'devDependencies'}</span>
          </div>
          {d.note && <div className="dcl-evi">{d.note}</div>}
        </div>,
      )
    }
  }
  if ((kind === 'all' || kind === 'unresolved') && report.unresolvedImports.length) {
    const list = report.unresolvedImports.filter((u) => hit(u.importer) || hit(u.specifier))
    if (list.length) items.push(<SectionTitle key="t-un" n={list.length} label="悬空导入（解析失败 = 真 bug）" />)
    for (const u of list.slice(0, 200)) {
      items.push(
        <div key={`u-${u.importer}-${u.specifier}`} className="dcl-item">
          <div className="dcl-row">
            <span className="dcl-reason" style={{ background: '#7f1d1d55', color: '#fca5a5' }}>断链</span>
            <span className="dcl-mono" style={{ flex: 1 }}>{u.importer} → <b style={{ color: '#fca5a5' }}>{u.specifier}</b></span>
          </div>
          <div className="dcl-evi">{u.note}</div>
        </div>,
      )
    }
  }
  if ((kind === 'all' || kind === 'cycles') && report.cycles.length) {
    const list = report.cycles.filter((c) => !needle || c.files.some((f) => hit(f)))
    if (list.length) items.push(<SectionTitle key="t-cy" n={list.length} label="循环依赖" />)
    for (const c of list.slice(0, 60)) {
      items.push(
        <div key={`c-${c.files.join('|')}`} className="dcl-item">
          <div className="dcl-row">
            <span className="dcl-reason" style={{ background: '#78350f55', color: '#fcd34d' }}>{c.size} 文件</span>
            {c.truncated && <span className="dcl-muted">{c.truncated}</span>}
          </div>
          <div className="dcl-evi dcl-mono">{c.files.join(' → ')}{c.truncated ? ' → …' : ''}</div>
        </div>,
      )
    }
  }
  if (!items.length) return <div className="dcl-muted">该类别没有发现（或被过滤词挡住）。</div>
  return <>{items}</>
}

function SectionTitle({ n, label }: { n: number; label: string }) {
  return <div style={{ fontSize: 12, color: 'var(--polaris-text-2,#9ca3af)', marginTop: 4 }}>{label} · {n}</div>
}

function WhyView({ w }: { w: Record<string, unknown> }) {
  if (w.error) return <div className="dcl-err">{String(w.error)}</div>
  const importers = (w.importers || []) as Record<string, unknown>[]
  return (
    <>
      <div className="dcl-row">
        <SuggestBadge s={w.verdict === '可达' ? 'review' : 'delete'} />
        <b>{String(w.verdict)}</b>
        {w.isEntry ? <span className="dcl-reason" style={{ background: '#1e3a5f55', color: '#93c5fd' }}>入口（{String(w.isEntry)}）</span> : null}
        {w.globCovered ? <span className="dcl-reason" style={{ background: '#1e3a5f55', color: '#93c5fd' }}>import.meta.glob 覆盖</span> : null}
        <span className="dcl-muted">{String(w.bytes)}B · 引用者 {String(w.importerCount)} 个 · 出边 {String(w.importsCount)} 条</span>
      </div>
      {importers.length ? (
        <div>
          <div className="dcl-label">谁引用它</div>
          {importers.slice(0, 15).map((im, i) => (
            <div key={i} className="dcl-evi dcl-mono">
              {String(im.from)}（{im.reachable ? '活' : '死'}）import {im.namespace ? '* as ns' : im.dynamic ? `动态 (${String(im.spec)})` : (im.names as string[] | undefined)?.join(', ') || (im.side ? 'side-effect' : String(im.spec))}
            </div>
          ))}
        </div>
      ) : <div className="dcl-evi">无任何文件 import 它</div>}
      <div>
        <div className="dcl-label">导出消费</div>
        <div className="dcl-evi">已消费：{(w.exportsUsed as string[] | undefined)?.join('、') || '（无）'}</div>
        <div className="dcl-evi">未消费：{(w.exportsUnused as string[] | undefined)?.join('、') || '（无）'}</div>
      </div>
    </>
  )
}

// ── Markdown 导出 ───────────────────────────────────────────────────────────
function reportToMd(r: Report): string {
  const L: string[] = []
  L.push(`# 死代码体检报告`, '', `- 根：见扫描记录（runId 见历史）`, `- 文件 ${r.counts.files} · 边 ${r.meta.edgesTotal} · 耗时 ${r.meta.durationMs}ms · 引擎 v${r.meta.version}`, '')
  L.push(`| 类别 | 数量 |`, `|---|---:|`)
  L.push(`| 死文件 | ${r.counts.orphanFiles} |`, `| 未使用导出 | ${r.counts.unusedExports} |`, `| 未使用依赖 | ${r.counts.unusedDeps} |`, `| 悬空导入 | ${r.counts.unresolvedImports} |`, `| 循环依赖 | ${r.counts.cycles} |`, '')
  if (r.orphanFiles.length) {
    L.push(`## 死文件`, '')
    for (const o of r.orphanFiles) L.push(`- \`${o.path}\`（${o.reason === 'no-importer' ? '零引用' : '仅被死文件引用'}${o.importerCount ? `，引用者 ${o.importers.join('/')}` : ''}）`)
    L.push('')
  }
  if (r.unusedExports.length) {
    L.push(`## 未使用导出`, '')
    for (const x of r.unusedExports) L.push(`- \`${x.path}\` 的 \`${x.name}\` → ${x.suggestion === 'delete' ? '可删' : x.suggestion === 'unexport' ? '去 export' : '需确认'}`)
    L.push('')
  }
  if (r.deps.unused.length) {
    L.push(`## 未使用依赖`, '')
    for (const d of r.deps.unused) L.push(`- \`${d.name}\`（${d.tooling ? '工具链类，确认 CI/hook 后处理' : '确认无配置/脚本引用后移除'}）${d.note ? `：${d.note}` : ''}`)
    L.push('')
  }
  if (r.unresolvedImports.length) {
    L.push(`## 悬空导入`, '')
    for (const u of r.unresolvedImports) L.push(`- \`${u.importer}\` → \`${u.specifier}\`（${u.note}）`)
    L.push('')
  }
  if (r.cycles.length) {
    L.push(`## 循环依赖`, '')
    for (const c of r.cycles) L.push(`- ${c.files.map((f) => `\`${f}\``).join(' → ')}${c.truncated ? `（${c.truncated}）` : ''}`)
    L.push('')
  }
  if (r.warnings.length) {
    L.push(`## 警告`, '')
    for (const w of r.warnings) L.push(`- ${w}`)
  }
  return L.join('\n')
}
