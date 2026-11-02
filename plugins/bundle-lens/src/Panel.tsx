/**
 * Panel.tsx —— 包体积透视台面板
 *
 * Tab 结构：扫描 / 总览 / 构成 / 重复·建议 / 历史
 * 数据面：127.0.0.1 直连服务（model.ts）；扫描进行中 1s 轮询进度。
 * 已知限制：Web(https) 部署模式下浏览器会拦 http://127.0.0.1 混合内容——
 * 桌面/手机 WebView 正常（与 repo-lens/dep-probe/stream-desk 面板直连面同款边界）。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, invalidateMeta, readMeta, SvcError } from './model'
import type { ModuleInfo, RunItem, ScanReport, ScanStatus, SelfTestResult, Settings } from './model'
import { restartService } from './host'
import { treemapLayout } from './treemap'
import {
  Bar, dateTimeStr, deltaColor, durStr, fmtBytes, fmtDelta, PanelStyle, StatChips, tileColor,
} from './ui'

const PLUGIN_ID = 'bundle-lens'
const SERVICE_ID = 'bundle-lens-server'
const APP_KEY = '(应用代码)'

type Tab = 'scan' | 'overview' | 'composition' | 'dups' | 'history'

/** 面积图条目：包 + 应用代码合并一张图 */
function buildTreemapItems(report: ScanReport): Array<{ key: string; value: number; isApp: boolean; conflicted: boolean }> {
  const conflicted = new Set((report.duplicates.versionConflicts || []).map((c) => c.name))
  const items = (report.packages || []).slice(0, 40).map((p) => ({
    key: p.name, value: p.bytes, isApp: false, conflicted: conflicted.has(p.name),
  }))
  if (report.totals.appBytes > 0) {
    items.push({ key: APP_KEY, value: report.totals.appBytes, isApp: true, conflicted: false })
  }
  return items
}

function Treemap({ report }: { report: ScanReport }): JSX.Element {
  const [size, setSize] = useState({ w: 0, h: 260 })
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: 260 })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const items = buildTreemapItems(report)
  const rects = size.w > 0 ? treemapLayout(items, 0, 0, size.w, size.h) : []
  const minPixels = 60 // 太小的格子不渲染文字
  return (
    <div ref={ref} className="bl-treemap" style={{ height: 260 }}>
      {rects.map((r) => {
        const it = items.find((x) => x.key === r.key)!
        return (
          <div
            key={r.key}
            className="bl-tile"
            title={`${r.key}：${fmtBytes(r.value)}（${Math.round((r.value / Math.max(1, report.totals.totalBytes)) * 100)}%）${it.conflicted ? '，⚠ 多份安装' : ''}`}
            style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: tileColor(it.key, it.isApp, it.conflicted) }}
          >
            {r.w > minPixels && r.h > 26 ? (
              <>
                <div className="t-name">{r.key}</div>
                <div className="t-size">{fmtBytes(r.value)}</div>
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default function Panel({ onSendToChat }: {
  pluginId?: string
  onSendToChat?: (msg: string) => void | Promise<void>
}): JSX.Element {
  const [tab, setTab] = useState<Tab>('scan')
  const [svcDown, setSvcDown] = useState<string | null>(null)
  const [degraded, setDegraded] = useState(false)
  const [meta, setMeta] = useState<{ version: string; uptime: number } | null>(null)

  // 扫描
  const [path, setPath] = useState('')
  const [recentPaths, setRecentPaths] = useState<string[]>([])
  const [busy, setBusy] = useState<ScanStatus | null>(null)
  const [scanErr, setScanErr] = useState<string | null>(null)

  // 报告
  const [report, setReport] = useState<ScanReport | null>(null)
  const [moduleFilter, setModuleFilter] = useState('')

  // 历史/自检
  const [runs, setRuns] = useState<RunItem[]>([])
  const [selftest, setSelftest] = useState<SelfTestResult | null>(null)
  const [selftesting, setSelftesting] = useState(false)

  const pollRef = useRef<number | null>(null)

  const loadRuns = useCallback(async () => {
    try { const r = await api.runs(); setRuns(r.runs); setDegraded(!!r.degraded) } catch (_) { /* 服务未起 */ }
  }, [])

  const loadReport = useCallback(async (runId: string) => {
    try {
      const r = await api.report(runId)
      setReport(r.report)
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
        if (m.settings) { setRecentPaths(m.settings.recentPaths); if (m.settings.recentPaths[0]) setPath(m.settings.recentPaths[0]) }
        if (m.lastRunId) await loadReport(m.lastRunId)
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
    if (!path.trim()) { setScanErr('请填写构建产物目录路径（如 D:\\proj\\dist）'); return }
    try {
      const r = await api.scan(path.trim())
      setBusy({ runId: r.runId, status: 'running', phase: 'queued', progress: 0, message: '排队中' })
    } catch (e) {
      if (e instanceof SvcError && e.status === 409) { setScanErr('已有扫描在进行中，请等待完成'); return }
      setScanErr((e as Error).message)
    }
  }, [path])

  const runSelftest = useCallback(async () => {
    setSelftesting(true)
    setSelftest(null)
    try { setSelftest(await api.selftest()) } catch (e) { setScanErr((e as Error).message) } finally { setSelftesting(false) }
  }, [])

  const retrySvc = useCallback(async () => {
    try {
      await restartService(PLUGIN_ID, SERVICE_ID)
      invalidateMeta()
      setSvcDown(null)
    } catch (e) { setSvcDown((e as Error).message) }
  }, [])

  const sendSummary = useCallback(async () => {
    if (!report || !onSendToChat) return
    const t = report.totals
    const kb = (n: number) => fmtBytes(n)
    const top = (report.packages || []).slice(0, 8).map((p, i) => `${i + 1}. ${p.name}${p.versions.length ? `@${p.versions.join('/')}` : ''}：${kb(p.bytes)}（${p.fileCount} 文件${p.roots.length > 1 ? `，⚠ ${p.roots.length} 份安装` : ''}）`).join('\n')
    const conflicts = (report.duplicates.versionConflicts || []).slice(0, 5).map((c) => `- ${c.name}${c.versions.length ? `（${c.versions.join('/')}）` : ''}：${c.roots} 份独立安装，共 ${kb(c.bytes)}`).join('\n')
    const text = [
      `包体积透视（${report.dir}）`,
      `总体积 ${kb(t.totalBytes)}：${t.chunks} chunks（${t.chunksNoMap} 无 map），映射覆盖 ${Math.round(t.mapCoverage * 100)}%`,
      `依赖 ${kb(t.vendorBytes)} vs 应用 ${kb(t.appBytes)}；${t.pkgCount} 个包 / ${t.moduleCount} 个源模块`,
      report.diff ? `对比上次：${fmtDelta(report.diff.totalDelta)}（${kb(report.diff.totalPrev)} → ${kb(report.diff.totalNow)}）` : '',
      conflicts ? `⚠ 同包多份安装：\n${conflicts}` : '重复安装：无',
      '',
      'Top 包：',
      top,
      report.suggestions.length ? `\n建议：\n${report.suggestions.slice(0, 5).map((s) => `- [${s.level}] ${s.title}`).join('\n')}` : '',
      report.warnings.length ? `\n⚠ ${report.warnings.join('；')}` : '',
    ].filter(Boolean).join('\n')
    await onSendToChat(text)
  }, [report, onSendToChat])

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  const t = report && report.totals
  const conflictedNames = new Set(report ? (report.duplicates.versionConflicts || []).map((c) => c.name) : [])

  return (
    <div className="bl-panel">
      <PanelStyle />
      <div className="bl-tabs">
        {([['scan', '扫描'], ['overview', '总览'], ['composition', '构成'], ['dups', '重复·建议'], ['history', '历史']] as Array<[Tab, string]>).map(([k, label]) => (
          <button key={k} className={`bl-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <div className="bl-statusbar">
        <span className="bl-dot" style={{ background: degraded ? '#FBBF24' : svcDown ? '#F87171' : '#34D399' }} />
        <span className="bl-grow">
          {svcDown ? `服务不可达：${svcDown}` : degraded ? '宿主 kv 桥降级（服务可用，报告不投影三端）' : meta ? `服务 v${meta.version} · 运行 ${durStr(meta.uptime)}` : '连接服务中…'}
        </span>
        {(svcDown || degraded) && <button className="small" onClick={retrySvc}>重启服务</button>}
        {report && tab !== 'scan' && onSendToChat && <button className="small" onClick={sendSummary}>发送到聊天</button>}
      </div>

      {tab === 'scan' && (
        <div className="bl-scroll" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="bl-card">
            <label className="bl-label">构建产物目录（vite/webpack/esbuild/rollup 产物均可，如 D:\proj\dist；不是源码目录）</label>
            <div className="bl-row">
              <input className="bl-grow mono" value={path} placeholder="D:\space\base\Polaris\dist" onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !busy) startScan() }} />
              <button className="primary" disabled={!!busy} onClick={startScan}>{busy ? '透视中…' : '开始透视'}</button>
            </div>
            {recentPaths.length > 0 && (
              <div className="bl-row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
                {recentPaths.map((p) => (
                  <button key={p} className="small" onClick={() => setPath(p)} title={p}>{p.length > 42 ? `…${p.slice(-40)}` : p}</button>
                ))}
              </div>
            )}
            {busy && (
              <div style={{ marginTop: 10 }}>
                <div className="bl-row" style={{ justifyContent: 'space-between', fontSize: 11, color: '#9CA3AF' }}>
                  <span>{busy.message || busy.phase}</span><span>{Math.round((busy.progress || 0) * 100)}%</span>
                </div>
                <Bar value={(busy.progress || 0) * 100} />
              </div>
            )}
            {scanErr && <div className="bl-err" style={{ marginTop: 8 }}>{scanErr}</div>}
          </div>
          <div className="bl-card bl-hint">
            <div>· 解析的是 sourcemap（<code>*.js.map</code>）；构建没开 sourcemap 也能扫（仅文件级体积，vite 开启：<code>build: {'{ sourcemap: true }'}</code>）</div>
            <div>· sourcemap 含源码——全程不出本机，只读扫描，零网络出站</div>
            <div>· 对同一目录第二次扫描起，自动与上次生成逐包 diff（优化前后验收）</div>
            <div className="bl-row" style={{ marginTop: 8 }}>
              <button className="small" onClick={runSelftest} disabled={selftesting}>{selftesting ? '自检中…' : '运行内置自检'}</button>
              {selftest && (
                <span className={selftest.ok ? 'bl-ok' : 'bl-err'}>
                  自检 {selftest.ok ? '通过' : '失败'}：{selftest.total - selftest.failed.length}/{selftest.total}
                  {!selftest.ok && `（${selftest.failed.map((f) => `${f.name}: ${f.error}`).join('；')}）`}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'overview' && (
        <div className="bl-scroll" style={{ padding: 12 }}>
          {!report || !t ? <div className="bl-muted" style={{ padding: 20, textAlign: 'center' }}>还没有报告——先去「扫描」Tab 透视一个产物目录</div> : (
            <>
              <div className="bl-card bl-section">
                <div className="bl-h3 bl-row" style={{ justifyContent: 'space-between' }}>
                  <span className="bl-path bl-grow" title={report.dir}>{report.dir}</span>
                  <span className="bl-muted">{dateTimeStr(report.finishedAt)} · {durStr(t.durationMs)}</span>
                </div>
                <StatChips items={[
                  { label: '总体积', value: fmtBytes(t.totalBytes) },
                  { label: 'chunks', value: `${t.chunks}${t.chunksNoMap ? `（${t.chunksNoMap} 无map）` : ''}`, tone: t.chunksNoMap ? 'warn' : undefined },
                  { label: '映射覆盖', value: `${Math.round(t.mapCoverage * 100)}%`, tone: t.mapCoverage < 0.85 ? 'warn' : 'ok' },
                  { label: '依赖/应用', value: `${Math.round((t.vendorBytes / Math.max(1, t.totalBytes)) * 100)}% / ${Math.round((t.appBytes / Math.max(1, t.totalBytes)) * 100)}%`, tone: t.vendorBytes / Math.max(1, t.totalBytes) > 0.85 ? 'warn' : undefined },
                  { label: 'npm 包', value: String(t.pkgCount) },
                  { label: '源模块', value: String(t.moduleCount) },
                ]} />
                {report.diff && (
                  <div className="bl-row" style={{ marginTop: 8, fontSize: 11.5 }}>
                    <span className="bl-muted">vs 上次（{report.diff.prevRunId}）：</span>
                    <b style={{ color: deltaColor(report.diff.totalDelta) }}>{fmtDelta(report.diff.totalDelta)}</b>
                    <span className="bl-muted">（{fmtBytes(report.diff.totalPrev)} → {fmtBytes(report.diff.totalNow)}）</span>
                    {report.diff.packages.slice(0, 4).map((p) => (
                      <span key={p.name} className="bl-badge" style={{ background: '#232329', color: deltaColor(p.delta) }}>
                        {p.name} {fmtDelta(p.delta)}
                      </span>
                    ))}
                  </div>
                )}
                {report.warnings.length > 0 && (
                  <div className="bl-warn bl-hint" style={{ marginTop: 8 }}>⚠ {report.warnings.join('；')}</div>
                )}
              </div>
              <div className="bl-section">
                <div className="bl-h3">包体积排行（Top 30）</div>
                <table className="bl-table">
                  <thead><tr><th>#</th><th>包</th><th>体积</th><th style={{ width: '34%' }}></th><th>占比</th><th>文件</th><th>版本</th></tr></thead>
                  <tbody>
                    {report.packages.slice(0, 30).map((p, i) => (
                      <tr key={p.name}>
                        <td className="bl-muted">{i + 1}</td>
                        <td className="bl-path" title={p.name} style={{ maxWidth: 240 }}>
                          {p.roots.length > 1 ? <span className="bl-warn">⚠ </span> : null}{p.name}
                        </td>
                        <td className="mono">{fmtBytes(p.bytes)}</td>
                        <td><Bar value={p.bytes} max={report.packages[0].bytes} color={tileColor(p.name, false, conflictedNames.has(p.name))} /></td>
                        <td className="bl-muted">{Math.round((p.bytes / Math.max(1, t.totalBytes)) * 100)}%</td>
                        <td className="bl-muted">{p.fileCount}</td>
                        <td className="bl-muted">{p.versions.join('/') || '—'}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="bl-muted">—</td>
                      <td><b>{APP_KEY}</b></td>
                      <td className="mono">{fmtBytes(t.appBytes)}</td>
                      <td><Bar value={t.appBytes} max={report.packages[0].bytes} color="#1D4ED8" /></td>
                      <td className="bl-muted">{Math.round((t.appBytes / Math.max(1, t.totalBytes)) * 100)}%</td>
                      <td className="bl-muted">—</td>
                      <td className="bl-muted">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="bl-section">
                <div className="bl-h3">chunk 清单（{report.chunks.length}）</div>
                <table className="bl-table">
                  <thead><tr><th>文件</th><th>体积</th><th>映射</th><th>包数</th><th>里面的大头</th></tr></thead>
                  <tbody>
                    {report.chunks.slice(0, 40).map((c) => (
                      <tr key={c.relPath}>
                        <td className="bl-path" title={c.relPath} style={{ maxWidth: 260 }}>{c.relPath}</td>
                        <td className="mono">{fmtBytes(c.bytes)}</td>
                        <td>{c.hasMap ? <span className={c.mappedBytes / Math.max(1, c.bytes) > 0.85 ? 'bl-ok' : 'bl-warn'}>{Math.round((c.mappedBytes / Math.max(1, c.bytes)) * 100)}%</span> : <span className="bl-err">无 map</span>}</td>
                        <td className="bl-muted">{c.pkgCount || '—'}</td>
                        <td className="bl-hint">{(c.topPkgs || []).slice(0, 3).map((p) => `${p.name} ${fmtBytes(p.bytes)}`).join('、') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'composition' && (
        <div className="bl-scroll" style={{ padding: 12 }}>
          {!report ? <div className="bl-muted" style={{ padding: 20, textAlign: 'center' }}>还没有报告——先去「扫描」Tab</div> : (
            <>
              <div className="bl-section">
                <div className="bl-h3">面积图（包 Top40 + 应用代码；红色 = 有多份安装）</div>
                <Treemap report={report} />
                <div className="bl-legend">
                  <span><i style={{ background: '#1D4ED8' }} />应用代码</span>
                  <span><i style={{ background: 'hsl(0, 62%, 38%)' }} />多份安装（重复依赖）</span>
                  <span><i style={{ background: 'hsl(180, 46%, 34%)' }} />npm 包（按名配色）</span>
                </div>
              </div>
              <div className="bl-section">
                <div className="bl-row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <div className="bl-h3">源模块（{report.modules.length}）</div>
                  <input className="mono" style={{ width: 200 }} placeholder="过滤路径/包名…" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} />
                </div>
                <table className="bl-table">
                  <thead><tr><th>源文件 / 包内模块</th><th>归属</th><th>体积</th><th>所在 chunk</th></tr></thead>
                  <tbody>
                    {report.modules
                      .filter((m) => !moduleFilter || m.source.toLowerCase().includes(moduleFilter.toLowerCase()) || (m.pkg || '').toLowerCase().includes(moduleFilter.toLowerCase()))
                      .slice(0, 120)
                      .map((m: ModuleInfo) => (
                        <tr key={`${m.source}`}>
                          <td className="bl-path" title={m.source} style={{ maxWidth: 340 }}>{m.source}</td>
                          <td>{m.pkg ? <span className="bl-badge" style={{ background: '#232329' }}>{m.pkg}</span> : <span className="bl-badge" style={{ background: '#1D4ED8', color: '#fff' }}>app</span>}</td>
                          <td className="mono">{fmtBytes(m.bytes)}</td>
                          <td className="bl-muted">{m.chunks.length > 1 ? <span className="bl-warn">{m.chunks.length} 个 chunk ⚠</span> : report.chunks[m.chunks[0]] ? report.chunks[m.chunks[0]].relPath : '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {report.modules.length > 120 && <div className="bl-muted bl-hint" style={{ marginTop: 4 }}>只显示前 120 个（按体积降序），用过滤缩小范围</div>}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'dups' && (
        <div className="bl-scroll" style={{ padding: 12 }}>
          {!report ? <div className="bl-muted" style={{ padding: 20, textAlign: 'center' }}>还没有报告——先去「扫描」Tab</div> : (
            <>
              <div className="bl-section">
                <div className="bl-h3">确定性建议（{report.suggestions.length}）</div>
                {report.suggestions.length === 0 && <div className="bl-ok bl-hint">没有发现明显问题 ✓</div>}
                {report.suggestions.map((s) => (
                  <div key={s.id + s.title} className="bl-card" style={{ marginBottom: 6, borderLeft: `3px solid ${s.level === 'warn' ? '#FBBF24' : '#3B82F6'}` }}>
                    <div className="bl-row">
                      <span className={`bl-badge ${s.level === 'warn' ? 'bl-warn' : ''}`} style={{ background: s.level === 'warn' ? '#3A2E12' : '#16233B' }}>{s.level === 'warn' ? '警告' : '优化'}</span>
                      <b>{s.title}</b>
                    </div>
                    <div className="bl-hint" style={{ marginTop: 4 }}>{s.detail}</div>
                  </div>
                ))}
              </div>
              <div className="bl-section">
                <div className="bl-h3">同包多份独立安装（{report.duplicates.versionConflicts.length}）</div>
                {report.duplicates.versionConflicts.length === 0 && <div className="bl-ok bl-hint">无 ✓</div>}
                <table className="bl-table">
                  <tbody>
                    {report.duplicates.versionConflicts.map((c) => (
                      <tr key={c.name}>
                        <td className="bl-path" title={c.name} style={{ maxWidth: 220 }}><span className="bl-warn">⚠</span> {c.name}</td>
                        <td className="mono">{fmtBytes(c.bytes)}</td>
                        <td className="bl-muted">{c.roots} 份安装</td>
                        <td className="bl-muted">{c.versions.join(' / ') || '版本未知'}</td>
                        <td className="bl-muted">{c.files} 个文件</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bl-section">
                <div className="bl-h3">同源文件打进多个 chunk（{report.duplicates.chunkDupes.length}）</div>
                {report.duplicates.chunkDupes.length === 0 && <div className="bl-ok bl-hint">无 ✓</div>}
                <table className="bl-table">
                  <tbody>
                    {report.duplicates.chunkDupes.slice(0, 20).map((d) => (
                      <tr key={d.source}>
                        <td className="bl-path" title={d.source} style={{ maxWidth: 280 }}>{d.source}</td>
                        <td className="mono">{fmtBytes(d.totalBytes)}</td>
                        <td className="bl-muted">{d.chunkCount} chunks</td>
                        <td className="bl-warn">重复 ~{fmtBytes(d.wasteBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bl-section">
                <div className="bl-h3">异路径完全同内容（{report.duplicates.contentDupes.length}）</div>
                {report.duplicates.contentDupes.length === 0 && <div className="bl-ok bl-hint">无 ✓</div>}
                {report.duplicates.contentDupes.slice(0, 20).map((d) => (
                  <div key={d.hash} className="bl-card" style={{ marginBottom: 6 }}>
                    <div className="bl-row" style={{ justifyContent: 'space-between' }}>
                      <b>{d.paths.length} 份 × {fmtBytes(d.bytes)}</b>
                      <span className="bl-warn">重复 ~{fmtBytes(d.wasteBytes)}</span>
                    </div>
                    <div className="bl-hint" style={{ wordBreak: 'break-all' }}>{d.paths.join('\n')}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="bl-scroll" style={{ padding: 12 }}>
          <div className="bl-h3">扫描历史（{runs.length}）</div>
          <table className="bl-table">
            <thead><tr><th>时间</th><th>目录</th><th>状态</th><th>总体积</th><th>包数</th><th>覆盖</th><th>耗时</th><th></th></tr></thead>
            <tbody>
              {runs.length === 0 && <tr><td colSpan={8} className="bl-muted">暂无扫描记录</td></tr>}
              {runs.map((r) => (
                <tr key={r.runId} className={report && report.runId === r.runId ? 'click sel' : 'click'}>
                  <td className="bl-muted">{dateTimeStr(r.startedAt)}</td>
                  <td className="bl-path" title={r.path} style={{ maxWidth: 240 }}>{r.path}</td>
                  <td>{r.status === 'ok' ? <span className="bl-ok">完成</span> : r.status === 'error' ? <span className="bl-err" title={r.error}>失败</span> : <span className="bl-warn">进行中</span>}</td>
                  <td className="mono">{r.totalBytes != null ? fmtBytes(r.totalBytes) : '—'}</td>
                  <td className="bl-muted">{r.pkgCount ?? '—'}</td>
                  <td className="bl-muted">{r.mapCoverage != null ? `${Math.round(r.mapCoverage * 100)}%` : '—'}</td>
                  <td className="bl-muted">{durStr(r.durationMs)}</td>
                  <td>{r.status === 'ok' && <button className="small" onClick={() => { setTab('overview'); loadReport(r.runId) }}>查看</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {degraded && <div className="bl-warn bl-hint" style={{ marginTop: 8 }}>宿主 kv 桥降级：历史索引可能不完整（服务内存里的仍可看）</div>}
        </div>
      )}
    </div>
  )
}
