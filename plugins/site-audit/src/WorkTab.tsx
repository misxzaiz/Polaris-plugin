/**
 * 体检 Tab：发起表单（种子 URL + 护栏参数）+ 实时进度卡 + 试金石预设
 * 实时进度自轮询 /api/live（800ms，可见时才拉）；完成后自动跳报告 Tab。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  opStart, opAction, getLive, formFromSettings,
  core,
  type AuditReport, type AuditSettings, type FormState, type LiveSnapshot, type ServiceMeta,
} from './model'

const PHASE_LABEL: Record<string, string> = {
  seed: '锚定范围',
  robots: '读取 robots.txt',
  sitemap: '读取 sitemap',
  crawl: '爬取页面',
  external: '外链核查',
  done: '生成报告',
}

export function eventLabel(type: string): string {
  const meta = (core.ISSUE_TYPES as Record<string, { label: string }>)[type]
  return meta ? meta.label : type
}

interface WorkTabProps {
  meta: ServiceMeta | null
  settings: AuditSettings | null
  lastReport: AuditReport | null
  onRefresh: () => void
  onOpenReport: (auditId: string | null | undefined) => void
  onSendToChat?: (message: string) => void | Promise<void>
  /** SSR/测试注入的初始实时快照（正常运行时为空，进度由轮询驱动） */
  initialLive?: LiveSnapshot | null
}

export default function WorkTab({ meta, settings, lastReport, onRefresh, onOpenReport, initialLive }: WorkTabProps) {
  const [form, setForm] = useState<FormState>(() => formFromSettings(settings))
  const [live, setLive] = useState<LiveSnapshot | null>(initialLive || null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const wasRunningRef = useRef(false)

  useEffect(() => { setForm(formFromSettings(settings)) }, [settings])

  // 实时轮询：可见时才拉；运行结束瞬间全量刷新并跳报告
  useEffect(() => {
    if (!meta) return
    let alive = true
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const r = await getLive(meta)
        if (!alive) return
        setLive(r.live)
        setError(r.ok === false && r.error ? r.error : '')
        if (wasRunningRef.current && !r.running) {
          wasRunningRef.current = false
          onRefresh()
          if (r.lastReportId) onOpenReport(r.lastReportId)
        }
        wasRunningRef.current = r.running
      } catch { /* 服务未起：留空 */ }
    }
    tick()
    const t = setInterval(tick, 800)
    return () => { alive = false; clearInterval(t) }
  }, [meta, onRefresh, onOpenReport])

  const start = useCallback(async () => {
    if (!meta) return
    setBusy(true)
    setError('')
    try {
      const r = await opStart(meta, form)
      if (!r.ok) {
        setError(r.busy ? `${r.error}（可在下方进度卡中止后再发起）` : (r.error || '发起失败'))
        return
      }
      wasRunningRef.current = true
    } catch (e) {
      setError(`服务连接失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }, [meta, form])

  const stop = useCallback(async () => {
    if (!meta) return
    try { await opAction(meta, 'stop') } catch { /* 忽略 */ }
  }, [meta])

  const running = !!live
  const demoUrl = meta ? `http://127.0.0.1:${meta.port}/demo/` : ''
  const pct = live ? Math.min(100, Math.round((live.pagesDone / Math.max(live.maxPages, 1)) * 100)) : 0

  return (
    <>
      <div className="sa-sec"><span className="sa-bar" />发起体检<span className="sa-hint">默认遵守 robots.txt · 同站深爬 · 外链只验存活</span></div>
      <div className="sa-card">
        <div className="sa-card-b">
          <div className="sa-fmrow">
            <input
              className="sa-inp"
              placeholder="种子 URL，如 https://example.com/ 或本机开发站 http://127.0.0.1:4173/"
              value={form.url}
              disabled={running || busy || !meta}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter' && !running && !busy) start() }}
            />
            <button className="sa-btn" disabled={running || busy || !meta || !form.url.trim()} onClick={start}>开始体检</button>
          </div>
          <div className="sa-fmrow">
            <span className="sa-sub">试金石：</span>
            <button className="sa-btn ghost sm" disabled={running || busy || !meta}
              onClick={() => setForm((f) => ({ ...f, url: demoUrl }))}>
              填入内置试金石站
            </button>
            {meta && <span className="sa-sub">（{demoUrl}，含 404/重定向链/缺alt/慢页/robots 排除/sitemap 孤岛，零配置验证工具链）</span>}
          </div>
          <div className="sa-fmgrid">
            <label>最多页数</label>
            <div className="sa-unitwrap">
              <input className="sa-inp" type="number" min={core.LIMITS.maxPages.min} max={core.LIMITS.maxPages.max}
                value={form.maxPages} disabled={running} onChange={(e) => setForm((f) => ({ ...f, maxPages: Number(e.target.value) || 0 }))} />
              <span>5~{core.LIMITS.maxPages.max}</span>
            </div>
            <label>同站间隔</label>
            <div className="sa-unitwrap">
              <input className="sa-inp" type="number" min={core.LIMITS.delayMs.min} max={core.LIMITS.delayMs.max}
                value={form.delayMs} disabled={running} onChange={(e) => setForm((f) => ({ ...f, delayMs: Number(e.target.value) || 0 }))} />
              <span>ms（礼貌爬取，robots Crawl-delay 更严时从其规定）</span>
            </div>
            <label>单页超时</label>
            <div className="sa-unitwrap">
              <input className="sa-inp" type="number" min={core.LIMITS.timeoutS.min} max={core.LIMITS.timeoutS.max}
                value={form.timeoutS} disabled={running} onChange={(e) => setForm((f) => ({ ...f, timeoutS: Number(e.target.value) || 0 }))} />
              <span>秒（2~30）</span>
            </div>
            <label>并发数</label>
            <div className="sa-unitwrap">
              <input className="sa-inp" type="number" min={core.LIMITS.concurrency.min} max={core.LIMITS.concurrency.max}
                value={form.concurrency} disabled={running} onChange={(e) => setForm((f) => ({ ...f, concurrency: Number(e.target.value) || 0 }))} />
              <span>1~12</span>
            </div>
            <label>慢页阈值</label>
            <div className="sa-unitwrap">
              <input className="sa-inp" type="number" min={core.LIMITS.slowMs.min} max={core.LIMITS.slowMs.max}
                value={form.slowMs} disabled={running} onChange={(e) => setForm((f) => ({ ...f, slowMs: Number(e.target.value) || 0 }))} />
              <span>ms</span>
            </div>
            <label>检查开关</label>
            <div className="sa-chiprow">
              <label className="sa-sub"><input type="checkbox" checked={form.respectRobots} disabled={running}
                onChange={(e) => setForm((f) => ({ ...f, respectRobots: e.target.checked }))} /> 遵守 robots.txt</label>
              <label className="sa-sub"><input type="checkbox" checked={form.checkExternal} disabled={running}
                onChange={(e) => setForm((f) => ({ ...f, checkExternal: e.target.checked }))} /> 核查外链（只验存活）</label>
              <label className="sa-sub"><input type="checkbox" checked={form.checkAssets} disabled={running}
                onChange={(e) => setForm((f) => ({ ...f, checkAssets: e.target.checked }))} /> 核查图片/样式/脚本</label>
            </div>
          </div>
          {error && <div className="sa-err">{error}</div>}
          {!meta && <div className="sa-sub">服务未连接：请确认插件已启用；宿主拉起服务后即可发起。</div>}
        </div>
      </div>

      {running && live && (
        <>
          <div className="sa-sec"><span className="sa-bar" />进行中<span className="sa-hint">auditId={live.auditId} · 来源 {live.source === 'mcp' ? 'AI' : '面板'}</span></div>
          <div className="sa-card">
            <div className="sa-card-b">
              <div className="sa-row-h" style={{ marginBottom: 6 }}>
                <span className="sa-tag">{PHASE_LABEL[live.phase] || live.phase}</span>
                <span className="sa-mono sa-sub" style={{ wordBreak: 'break-all' }}>{live.seed}</span>
              </div>
              <div className="sa-prog"><i style={{ width: `${pct}%` }} /></div>
              <div className="sa-sum">
                <div><b className="sa-num">{live.pagesDone}</b><small>已爬页面 / 上限 {live.maxPages}</small></div>
                <div><b className="sa-num">{live.queueLen}</b><small>队列待爬</small></div>
                <div><b className="sa-num">{live.assetsDone}</b><small>资源核查</small></div>
                <div><b className="sa-num">{live.externalDone}{live.externalTotal ? `/${live.externalTotal}` : ''}</b><small>外链核查</small></div>
                <div><b className={`sa-num ${live.errors ? 'sa-bad' : ''}`} style={live.errors ? { color: '#FF8A9A' } : undefined}>{live.errors}</b><small>异常</small></div>
                <div><b className="sa-num">{live.elapsedS}s</b><small>已用时</small></div>
              </div>
              {live.scopeHosts.length > 0 && <div className="sa-sub">范围 host：{live.scopeHosts.join(' + ')}</div>}
              {live.current.length > 0 && <div className="sa-sub">进行中：{live.current.join(' · ')}</div>}
              {live.recentEvents.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {live.recentEvents.slice(-6).reverse().map((e, i) => (
                    <div className="sa-evrow" key={`${e.at}-${i}`}>
                      <span className="sa-tag">{eventLabel(e.type)}</span>
                      <span className="sa-mono" style={{ wordBreak: 'break-all' }}>{e.url}</span>
                      {e.detail && <span className="sa-muted">{e.detail}</span>}
                    </div>
                  ))}
                </div>
              )}
              <div className="sa-btnrow">
                <button className="sa-btn danger" onClick={stop}>中止体检</button>
                <span className="sa-sub">中止后已爬到的部分会保留成报告。</span>
              </div>
            </div>
          </div>
        </>
      )}

      {!running && lastReport && (
        <>
          <div className="sa-sec"><span className="sa-bar" />最近一次体检<span className="sa-hint">{lastReport.at.replace('T', ' ').slice(0, 16)}</span></div>
          <div className="sa-card">
            <div className="sa-card-b">
              <div className="sa-row-h" style={{ marginBottom: 6 }}>
                <span className={`sa-badge ${lastReport.score.value >= 90 ? 'good' : lastReport.score.value >= 70 ? 'warn' : 'bad'}`}>{lastReport.score.value}/100</span>
                <span className="sa-mono sa-sub" style={{ wordBreak: 'break-all' }}>{lastReport.seed.url}</span>
                {lastReport.aborted && <span className="sa-tag">已中止·部分结果</span>}
              </div>
              <div className="sa-sub">{lastReport.score.verdict.oneLine}</div>
              <div className="sa-btnrow">
                <button className="sa-btn ghost sm" onClick={() => onOpenReport(lastReport.auditId)}>查看完整报告</button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
