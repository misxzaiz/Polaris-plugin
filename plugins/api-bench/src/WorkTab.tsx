/**
 * 压测页：目标表单（试金石预设）→ 发起/停止 → 实时进度与图表 → 报告卡片。
 * 运行数据走 /api/live 直连（800ms 轮询）；完成后报告直连取一次（kv 另有全量留档）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  opAction, opStart, getLive, loadReport, formFromSaved,
  type BenchReport, type BenchSample, type FormState, type LiveSnapshot, type SavedTarget, type ServiceMeta, type BenchSettings,
} from './model'
import { LatencyChart, RpsChart } from './charts'

interface WorkTabProps {
  meta: ServiceMeta | null
  settings: BenchSettings | null
  lastReport: BenchReport | null
  onRefresh: () => void
}

const DEMOS = (port: number) => ([
  { label: '试金石·极速', url: `http://127.0.0.1:${port}/demo/ok`, connections: 10, durationS: 5, note: '0ms 基线，验证工具链' },
  { label: '试金石·慢端点', url: `http://127.0.0.1:${port}/demo/slow?ms=200`, connections: 10, durationS: 10, note: '200ms 固定延迟' },
  { label: '试金石·抖动', url: `http://127.0.0.1:${port}/demo/flaky?p=0.2`, connections: 20, durationS: 10, note: '20% 概率 500' },
])

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

export function emptyForm(settings: BenchSettings | null): FormState {
  return {
    url: '',
    method: 'GET',
    headersText: '',
    body: '',
    connections: settings?.connections || 10,
    durationS: settings?.durationS || 10,
    timeoutS: settings?.timeoutS || 10,
    rate: '',
    pipelining: 1,
  }
}

export default function WorkTab({ meta, settings, lastReport, onRefresh }: WorkTabProps) {
  const [form, setForm] = useState<FormState>(() => emptyForm(settings))
  const [running, setRunning] = useState<LiveSnapshot | null>(null)
  const [samples, setSamples] = useState<BenchSample[]>([])
  const [report, setReport] = useState<BenchReport | null>(lastReport)
  const [err, setErr] = useState('')
  const [starting, setStarting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saved, setSaved] = useState<SavedTarget[]>([])
  const pollRef = useRef<number | null>(null)
  const finishSeenRef = useRef<string>('')

  // 设置变化时同步默认值（仅当表单还是初始值，避免覆盖用户输入）
  useEffect(() => {
    setForm((f) => (f.url ? f : { ...f, connections: settings?.connections || 10, durationS: settings?.durationS || 10, timeoutS: settings?.timeoutS || 10 }))
  }, [settings])

  const loadSaved = useCallback(async () => {
    if (!meta) return
    try {
      const r = await opAction(meta, 'targets_list')
      setSaved(r.ok && Array.isArray(r.items) ? r.items : [])
    } catch (_) { /* 服务未就绪 */ }
  }, [meta])

  useEffect(() => { loadSaved() }, [loadSaved])

  // 实时轮询：运行期 800ms；从运行 → 空闲的瞬间拉取完成报告
  useEffect(() => {
    if (!meta) return
    const tick = async () => {
      try {
        const r = await getLive(meta)
        if (!r.ok) return
        setRunning(r.live)
        setSamples(Array.isArray(r.samples) ? r.samples : [])
        if (!r.running && r.live === null && r.lastReportId && finishSeenRef.current !== r.lastReportId) {
          finishSeenRef.current = r.lastReportId
          const rep = await loadReport(r.lastReportId)
          if (rep) setReport(rep)
          onRefresh()
        }
      } catch (_) { /* 服务忙/未就绪：保旧值 */ }
    }
    tick()
    pollRef.current = window.setInterval(tick, 800)
    return () => { if (pollRef.current) window.clearInterval(pollRef.current) }
  }, [meta, onRefresh])

  const doStart = useCallback(async () => {
    if (!meta) return
    setErr('')
    setStarting(true)
    finishSeenRef.current = ''
    try {
      const r = await opStart(meta, form)
      if (!r.ok) { setErr(r.error || '启动失败'); return }
      setReport(null)
      setSamples([])
    } catch (e) {
      setErr(`服务不可达：${String((e as Error).message || e)}（面板从 cap.kv api-bench.meta 引导端口/token）`)
    } finally {
      setStarting(false)
    }
  }, [meta, form])

  const doStop = useCallback(async () => {
    if (!meta) return
    try { await opAction(meta, 'stop') } catch (_) { /* 轮询会反映结果 */ }
  }, [meta])

  const applyDemo = (d: { url: string; connections: number; durationS: number }) => {
    setForm((f) => ({ ...f, url: d.url, method: 'GET', connections: d.connections, durationS: d.durationS, body: '', headersText: '', rate: '' }))
  }

  const applySaved = (t: SavedTarget) => {
    setForm(formFromSaved(t))
  }

  const doSaveTarget = useCallback(async () => {
    if (!meta || !form.url) return
    try {
      const r = await opAction(meta, 'targets_save', {
        target: {
          url: form.url, method: form.method, name: form.url.replace(/^https?:\/\//, '').slice(0, 60),
          headers: parseHeadersLoose(form.headersText), body: form.body,
          connections: form.connections, durationS: form.durationS, timeoutS: form.timeoutS,
          rate: form.rate === '' ? null : Number(form.rate),
        },
      })
      if (!r.ok) setErr(r.error || '保存失败')
      loadSaved()
    } catch (e) {
      setErr(String((e as Error).message || e))
    }
  }, [meta, form, loadSaved])

  const isRunning = !!running
  const progress = running ? Math.min(100, (running.elapsedS / Math.max(running.durationS, 0.1)) * 100) : 0
  const activeReport = report

  return (
    <>
      {meta?.running && meta.running.source === 'mcp' && (
        <div className="ab-warncard">AI 正在压测（{meta.running.method} {meta.running.url}）——表单发起将排队拒绝，可到「历史」页看结果。</div>
      )}
      <div className="ab-sec">试金石<span className="ab-hint">内置演示端点，零配置验证工具链（压的是本插件服务进程）</span></div>
      <div className="ab-card"><div className="ab-card-b ab-chiprow">
        {meta ? DEMOS(meta.port).map((d) => (
          <button key={d.url} className="ab-btn ghost sm" title={d.note} onClick={() => applyDemo(d)}>{d.label}</button>
        )) : <span className="ab-sub">服务未连接，试金石不可用</span>}
      </div></div>

      <div className="ab-sec">目标配置</div>
      <div className="ab-card"><div className="ab-card-b">
        <div className="ab-fmrow">
          <select className="ab-sel" style={{ width: 96 }} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} disabled={isRunning}>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input className="ab-inp" placeholder="http://127.0.0.1:8080/api/users" value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })} disabled={isRunning} spellCheck={false} />
        </div>
        <div className="ab-fmgrid">
          <label>并发连接</label>
          <input className="ab-inp" type="number" min={1} max={1000} value={form.connections}
            onChange={(e) => setForm({ ...form, connections: Number(e.target.value) || 1 })} disabled={isRunning} />
          <label>持续秒数</label>
          <input className="ab-inp" type="number" min={1} max={300} value={form.durationS}
            onChange={(e) => setForm({ ...form, durationS: Number(e.target.value) || 1 })} disabled={isRunning} />
          <label>请求超时</label>
          <div className="ab-unitwrap"><input className="ab-inp" type="number" min={0.5} max={60} step={0.5} value={form.timeoutS}
            onChange={(e) => setForm({ ...form, timeoutS: Number(e.target.value) || 10 })} disabled={isRunning} /><span>秒</span></div>
        </div>
        <div>
          <button className="ab-link" onClick={() => setShowAdvanced(!showAdvanced)}>{showAdvanced ? '收起高级选项' : '高级选项（headers / body / 限速 / 管道）'}</button>
        </div>
        {showAdvanced && (
          <div className="ab-adv">
            <label className="ab-sub">请求头（每行一条 Name: value）</label>
            <textarea className="ab-inp" rows={3} value={form.headersText} placeholder={'Authorization: Bearer xxx\nContent-Type: application/json'}
              onChange={(e) => setForm({ ...form, headersText: e.target.value })} disabled={isRunning} spellCheck={false} />
            {form.method !== 'GET' && form.method !== 'HEAD' && (
              <>
                <label className="ab-sub">请求体（JSON/文本，≤1MB）</label>
                <textarea className="ab-inp" rows={3} value={form.body} placeholder='{"page": 1}'
                  onChange={(e) => setForm({ ...form, body: e.target.value })} disabled={isRunning} spellCheck={false} />
              </>
            )}
            <div className="ab-fmgrid">
              <label>速率上限</label>
              <div className="ab-unitwrap"><input className="ab-inp" type="number" min={1} placeholder="不限" value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })} disabled={isRunning} /><span>req/s</span></div>
              <label>管道复用</label>
              <input className="ab-inp" type="number" min={1} max={10} value={form.pipelining}
                onChange={(e) => setForm({ ...form, pipelining: Number(e.target.value) || 1 })} disabled={isRunning} />
            </div>
          </div>
        )}
        <div className="ab-btnrow">
          {!isRunning ? (
            <button className="ab-btn" onClick={doStart} disabled={!form.url.trim() || starting}>▶ 发起压测</button>
          ) : (
            <button className="ab-btn danger" onClick={doStop}>■ 中止</button>
          )}
          <button className="ab-btn ghost sm" onClick={doSaveTarget} disabled={!form.url.trim() || isRunning}>收藏目标</button>
          <span className="ab-sub" style={{ marginLeft: 'auto' }}>
            {form.url ? (() => {
              const scope = scopeHint(form.url)
              return scope === 'public' ? <span className="ab-warn">⚠ 公网目标：请确认拥有压测授权</span> : <span className="ab-ok">✓ {scopeLabel(scope)}</span>
            })() : null}
          </span>
        </div>
        {err && <div className="ab-err">{err}</div>}
        {saved.length > 0 && (
          <div className="ab-chiprow" style={{ marginTop: 8 }}>
            <span className="ab-sub">收藏：</span>
            {saved.map((t) => (
              <button key={t.id} className="ab-btn ghost sm" onClick={() => applySaved(t)} title={`${t.method} ${t.url}`}>{t.name || t.url.slice(0, 28)}</button>
            ))}
          </div>
        )}
      </div></div>

      {isRunning && running && (
        <>
          <div className="ab-sec">实时进度<span className="ab-hint">{running.method} {running.url}</span></div>
          <div className="ab-card"><div className="ab-card-b">
            <div className="ab-prog"><i style={{ width: `${progress}%` }} /></div>
            <div className="ab-sum">
              <div><b className="ab-num">{running.rps}</b><small>req/s 实时</small></div>
              <div><b className="ab-num">{running.latP97_5 != null ? `${Math.round(running.latP97_5)}` : '—'}<small style={{ fontSize: 11 }}>ms</small></b><small>p97.5（5s 窗口）</small></div>
              <div><b className="ab-num">{running.sent}</b><small>已发送</small></div>
              <div><b className="ab-num">{running.errs + running.non2xx}</b><small>错误+非2xx</small></div>
              <div><b className="ab-num">{Math.min(100, Math.round(progress))}%</b><small>{running.elapsedS}s / {running.durationS}s</small></div>
            </div>
            <RpsChart samples={samples} />
            <div style={{ height: 8 }} />
            <LatencyChart samples={samples} />
            {running.source === 'mcp' && <div className="ab-warn" style={{ marginTop: 6 }}>此压测由 AI 发起（MCP）</div>}
          </div></div>
        </>
      )}

      {activeReport && !isRunning && (
        <ReportView report={activeReport} />
      )}

      {!isRunning && !activeReport && (
        <div className="ab-empty">
          还没有报告。填入目标 URL →「发起压测」；或先点上面的试金石预设感受一次完整流程。<br />
          压测会真实打满配置的并发——先从 10 连接 × 10 秒开始。
        </div>
      )}
    </>
  )
}

function parseHeadersLoose(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim()
    const idx = t.indexOf(':')
    if (idx <= 0) continue
    const k = t.slice(0, idx).trim()
    const v = t.slice(idx + 1).trim()
    if (k && v) out[k] = v
  }
  return out
}

function scopeHint(url: string): string {
  try {
    const u = new URL(url)
    const h = u.hostname.toLowerCase()
    if (h === 'localhost' || h === '::1' || /^127\./.test(h)) return 'loopback'
    if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /\.local$/i.test(h)) return 'private'
    const m172 = /^172\.(\d+)\./.exec(h)
    if (m172) { const n = Number(m172[1]); if (n >= 16 && n <= 31) return 'private' }
    return 'public'
  } catch (_) { return 'invalid' }
}

function scopeLabel(scope: string): string {
  return scope === 'loopback' ? '本机目标' : scope === 'private' ? '内网目标' : scope === 'public' ? '公网目标' : 'URL 未就绪'
}

function pctClass(v: number): string {
  if (v < 100) return 'ab-ok'
  if (v < 500) return 'ab-warn'
  return 'ab-bad'
}

/** 报告卡片：摘要 + 延迟表 + 状态码 + 结论（与 AI/MCP 同一份 schema） */
export function ReportView({ report }: { report: BenchReport }) {
  const s = report.summary
  const l = s.latencies
  const dist = Object.entries(s.statusDist).sort((a, b) => b[1] - a[1]).slice(0, 8)
  return (
    <>
      <div className="ab-sec">压测报告<span className="ab-hint">{report.at.replace('T', ' ').slice(0, 16)} · runId {report.runId}</span></div>
      <div className="ab-card"><div className="ab-card-b">
        <div className="ab-row-h">
          <span className="ab-mono" style={{ fontWeight: 700 }}>{report.target.method}</span>
          <span className="ab-mono ab-sub" style={{ wordBreak: 'break-all' }}>{report.target.url}</span>
          <span className="ab-tag">{report.target.connections} 连接 × {s.durationS}s</span>
          {report.target.rate ? <span className="ab-tag">限速 {report.target.rate}/s</span> : null}
          {report.target.scope === 'public' ? <span className="ab-badge warn">公网目标</span> : null}
          {s.aborted ? <span className="ab-badge bad">已中止（部分结果）</span> : null}
        </div>
        <div className="ab-sum" style={{ marginTop: 10 }}>
          <div><b className="ab-num">{s.rpsMean}</b><small>平均 req/s（峰值 {s.rpsPeak}）</small></div>
          <div><b className={`ab-num ${pctClass(l.p97_5)}`}>{l.p97_5}</b><small>p97.5 延迟 ms</small></div>
          <div><b className={`ab-num ${pctClass(l.p50)}`}>{l.p50}</b><small>p50 延迟 ms</small></div>
          <div><b className={`ab-num ${s.errors + s.timeouts === 0 ? 'ab-ok' : 'ab-bad'}`}>{s.errors + s.timeouts}</b><small>错误+超时</small></div>
          <div><b className="ab-num">{s.non2xxPct}%</b><small>非 2xx（{s.non2xx}）</small></div>
        </div>
        <RpsChart samples={s.samples} />
        <div style={{ height: 8 }} />
        <LatencyChart samples={s.samples} />
      </div></div>

      <div className="ab-sec">延迟分位<span className="ab-hint">autocannon 直方图（HDR）</span></div>
      <div className="ab-card">
        <table className="ab-tb">
          <thead><tr><th>均值</th><th>σ</th><th>min</th><th>p50</th><th>p75</th><th>p90</th><th>p97.5</th><th>p99</th><th>p99.9</th><th>max</th></tr></thead>
          <tbody><tr className="ab-num">
            <td>{l.mean}</td><td>{l.stddev}</td><td>{l.min}</td><td>{l.p50}</td><td>{l.p75}</td><td>{l.p90}</td><td>{l.p97_5}</td><td>{l.p99}</td><td>{l.p99_9}</td><td>{l.max}</td>
          </tr></tbody>
        </table>
        <div className="ab-card-b ab-sub">单位 ms · 共 {s.totalRequests} 请求 / {s.sentRequests} 发送 · 吞吐均值 {Math.round(s.bytesMean / 1024)}KB/s · 总 {Math.round(s.bytesTotal / 1024)}KB</div>
      </div>

      <div className="ab-sec">状态码分布</div>
      <div className="ab-card"><div className="ab-card-b ab-chiprow">
        {dist.length ? dist.map(([code, n]) => (
          <span key={code} className={`ab-badge ${code.startsWith('2') || code.startsWith('3') ? 'good' : 'bad'}`}>{code} × {n}</span>
        )) : <span className="ab-sub">（无响应记录）</span>}
      </div></div>

      <div className="ab-sec">结论</div>
      <div className="ab-card"><div className="ab-card-b">
        <div>{report.verdict.oneLine}</div>
        {report.verdict.notes.map((n, i) => <div key={i} className="ab-sub" style={{ marginTop: 4 }}>· {n}</div>)}
      </div></div>
    </>
  )
}
