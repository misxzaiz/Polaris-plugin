/**
 * 链路追踪台面板：trace 列表 + 瀑布图
 *
 * 数据面：cap.kv 投影（meta/idx/rec 每 2.5s 轮询；选中 trace 的 tl.trace.<id>
 * 全文同样轮询——晚到 span 会陆续落盘）。树组装/瀑布布局复用 shared/core
 * （与服务、MCP 同一份单一权威实现）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getIdx, getMeta, getTraceFull, readRecChunks, sendCommand,
  type SpanRec, type TlIdx, type TlMeta, type TraceFull, type TraceSummary,
} from './model'
import * as core from '../shared/core.js'

const META_FRESH_MS = 90 * 1000
const POLL_MS = 2500

const KIND_COLORS: Record<string, string> = {
  server: '#3fb950',
  client: '#58a6ff',
  producer: '#d29922',
  consumer: '#bc8cff',
  internal: '#8b949e',
  unspecified: '#6e7681',
}

function fmtClock(ms: number): string {
  if (!ms) return '-'
  const d = new Date(ms)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

function Toast({ msg, kind }: { msg: string; kind: string }) {
  return (
    <div style={{
      position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      padding: '8px 16px', borderRadius: 8, fontSize: 12, maxWidth: '80%',
      background: kind === 'good' ? 'rgba(63,185,80,.92)' : kind === 'bad' ? 'rgba(248,81,73,.92)' : 'rgba(59,130,246,.92)',
      color: '#fff', zIndex: 50,
    }}>{msg}</div>
  )
}

/** 瀑布行 */
function WaterfallRow({ span, depth, offsetPct, widthPct, expanded, onToggle }: {
  span: SpanRec; depth: number; offsetPct: number; widthPct: number
  expanded: boolean; onToggle: () => void
}) {
  const isErr = span.status.code === 'error'
  const color = isErr ? '#f85149' : (KIND_COLORS[span.kind] || KIND_COLORS.unspecified)
  return (
    <div>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', borderRadius: 6,
          cursor: 'pointer', background: expanded ? 'rgba(110,118,129,.15)' : 'transparent',
          borderBottom: '1px solid rgba(110,118,129,.12)', minHeight: 26,
        }}
      >
        <div style={{ flex: '0 0 42%', minWidth: 0, paddingLeft: depth * 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {depth > 0 && <span style={{ color: '#484f58' }}>└ </span>}
          <span style={{ fontSize: 10, color, marginRight: 4 }}>{span.kind === 'unspecified' ? '' : span.kind.toUpperCase()}</span>
          <span style={{ fontSize: 12, color: isErr ? '#f85149' : '#e6edf3' }}>{span.name}</span>
          <span style={{ fontSize: 10, color: '#6e7681', marginLeft: 6 }}>{span.service}</span>
          {isErr && <span style={{ fontSize: 10, color: '#f85149', marginLeft: 4 }}>⨯</span>}
        </div>
        <div style={{ flex: 1, position: 'relative', height: 14, background: 'rgba(110,118,129,.1)', borderRadius: 3 }}>
          <div
            title={`${span.name} · ${span.durationMs}ms`}
            style={{
              position: 'absolute', left: `${Math.min(offsetPct, 99.25)}%`, width: `${Math.min(widthPct, 100 - Math.min(offsetPct, 99.25))}%`,
              top: 2, height: 10, borderRadius: 3, minWidth: 3,
              background: color, opacity: isErr ? 1 : 0.75,
            }}
          />
        </div>
        <div style={{ flex: '0 0 64px', textAlign: 'right', fontSize: 11, color: isErr ? '#f85149' : '#8b949e', whiteSpace: 'nowrap' }}>
          {core.formatDuration(span.durationMs)}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '6px 10px 8px', marginLeft: depth * 14 + 8, background: 'rgba(110,118,129,.07)', borderRadius: 6, fontSize: 11, color: '#8b949e' }}>
          <div><span style={{ color: '#6e7681' }}>spanId</span> {span.spanId} · <span style={{ color: '#6e7681' }}>起点</span> +{core.formatDuration(span.startMs - (waterfallBase ?? 0))} · <span style={{ color: '#6e7681' }}>状态</span> {span.status.code}{span.status.message ? `（${span.status.message}）` : ''}</div>
          {Object.keys(span.attrs).length > 0 && (
            <div style={{ marginTop: 4 }}>
              {Object.keys(span.attrs).slice(0, 24).map((k) => (
                <div key={k} style={{ display: 'flex', gap: 6 }}>
                  <span style={{ color: '#79c0ff', flexShrink: 0 }}>{k}</span>
                  <span style={{ wordBreak: 'break-all' }}>{span.attrs[k]}</span>
                </div>
              ))}
            </div>
          )}
          {span.events.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {span.events.slice(0, 8).map((ev, i) => (
                <div key={i}>⚡ {ev.name}{Object.keys(ev.attrs).length ? ` — ${Object.keys(ev.attrs).map((k) => `${k}=${ev.attrs[k]}`).join('  ')}` : ''}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

let waterfallBase = 0

export default function Panel({ pluginId, onSendToChat }: { pluginId: string; onSendToChat?: (m: string) => void }) {
  const [meta, setMeta] = useState<TlMeta | null>(null)
  const [idx, setIdx] = useState<TlIdx | null>(null)
  const [traces, setTraces] = useState<TraceSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [onlyErr, setOnlyErr] = useState(false)
  const [selected, setSelected] = useState<string>('')
  const [full, setFull] = useState<TraceFull | null>(null)
  const [expandedSpan, setExpandedSpan] = useState<string>('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const loadedOnce = useRef(false)

  const showToast = useCallback((msg: string, kind = 'info') => {
    setToast({ msg, kind })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  const reload = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([getMeta(), getIdx()])
      const list = await readRecChunks(i?.chunkCount || 0)
      setMeta(m)
      setIdx(i)
      setTraces(list)
    } catch (_) { /* 首轮宿主未就绪：保持空态，下轮轮询 */ }
    setLoaded(true)
    if (!loadedOnce.current) loadedOnce.current = true
  }, [])

  useEffect(() => {
    void reload()
    const timer = setInterval(() => { void reload() }, POLL_MS)
    return () => clearInterval(timer)
  }, [reload])

  // 选中 trace 的全文投影轮询
  useEffect(() => {
    if (!selected) { setFull(null); return undefined }
    let alive = true
    const pull = async () => {
      const f = await getTraceFull(selected)
      if (alive) setFull(f)
    }
    void pull()
    const timer = setInterval(() => { void pull() }, POLL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [selected])

  const running = !!(meta && meta.lastTickAt && Date.now() - meta.lastTickAt < META_FRESH_MS)

  // 瀑布布局：core 单一权威（buildTrace/waterfallLayout），容错脏数据
  const layout = useMemo(() => {
    if (!full || !Array.isArray(full.spans) || !full.spans.length) return null
    try {
      const { ordered, depthBySpanId } = core.buildTrace(full.spans)
      const rows = core.waterfallLayout(ordered, depthBySpanId)
      const env = core.traceEnvelope(ordered)
      waterfallBase = env.base
      return { ordered, rows, env, spanCount: full.spans.length }
    } catch (_) { return null }
  }, [full])

  const shown = onlyErr ? traces.filter((t) => t.hasError) : traces

  const doClear = async () => {
    if (!confirmClear) { setConfirmClear(true); window.setTimeout(() => setConfirmClear(false), 4000); return }
    setConfirmClear(false)
    const r = await sendCommand('clear_all', { confirm: true })
    showToast(r.ok ? '已清空全部链路留痕' : `清空失败：${r.error || '未知'}`, r.ok ? 'good' : 'bad')
    if (r.ok) { setSelected(''); void reload() }
  }

  const copyEndpoint = async () => {
    const url = meta?.endpoint || (meta?.port ? `http://127.0.0.1:${meta.port}/v1/traces` : '')
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      showToast('端点已复制', 'good')
    } catch (_) {
      showToast(`端点：${url}`, 'info')
    }
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%', gap: 10, color: '#d4d4d8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5' }}>⛓ 链路追踪台</span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 8,
          background: running ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
          color: running ? '#3fb950' : '#f85149',
        }}>{running ? `收数中 :${meta?.port ?? ''}` : '服务离线'}</span>
        {meta?.degraded && running && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(210,153,34,.15)', color: '#d29922' }}>kv 降级（收数不受影响）</span>
        )}
        {running && (
          <span style={{ fontSize: 10, color: '#52525b' }}>
            {meta?.tracesTotal ?? 0} traces · {meta?.spansTotal ?? 0} spans
          </span>
        )}
        <span style={{ flex: 1 }} />
        {running && (
          <button
            onClick={copyEndpoint}
            title="复制 OTLP 端点（Content-Type: application/json）"
            style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: '1px solid #3f3f46', background: 'transparent', color: '#79c0ff', cursor: 'pointer' }}
          >复制端点</button>
        )}
        <button
          onClick={doClear}
          style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid',
            borderColor: confirmClear ? '#f85149' : '#3f3f46',
            background: confirmClear ? 'rgba(248,81,73,.2)' : 'transparent', color: confirmClear ? '#f85149' : '#a1a1aa',
          }}
        >{confirmClear ? '确认清空全部?' : '清空'}</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {!loaded && <div style={{ color: '#71717a', fontSize: 12 }}>读取数据中…</div>}
        {loaded && !running && (
          <div style={{ padding: 12, borderRadius: 8, border: '1px solid rgba(248,81,73,.35)', background: 'rgba(248,81,73,.08)', fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>
            后台服务未运行：OTLP 端点不可用。去 <b>设置→插件→链路追踪台</b> 启动服务（或检查端口 {meta?.port ?? '—'} 是否被占用）。
          </div>
        )}
        {loaded && running && (
          <div style={{ fontSize: 10, color: '#52525b', marginBottom: 6 }}>
            接入：OTel SDK 设 <code style={{ color: '#79c0ff' }}>OTEL_EXPORTER_OTLP_PROTOCOL=http/json</code>，端点
            <code style={{ color: '#79c0ff' }}> {meta?.endpoint || `http://127.0.0.1:${meta?.port ?? ''}/v1/traces`}</code>
            ；AI 排查用 MCP 工具 trace_lens_*。
          </div>
        )}

        {!selected && loaded && running && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 11, color: '#8b949e', display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={onlyErr} onChange={(e) => setOnlyErr(e.target.checked)} />
                只看错误链
              </label>
              <span style={{ fontSize: 10, color: '#52525b' }}>{shown.length} 条（新在前）</span>
            </div>
            {shown.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: '#71717a', fontSize: 12 }}>
                {onlyErr ? '最近没有错误链路。' : '还没有链路数据。把任意 OpenTelemetry SDK 的导出协议设为 http/json、端点指向上方地址，触发一次请求即可。'}
              </div>
            )}
            {shown.map((t) => (
              <div
                key={t.traceId}
                onClick={() => { setSelected(t.traceId); setExpandedSpan('') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid rgba(110,118,129,.2)', marginBottom: 6, background: 'rgba(110,118,129,.06)',
                }}
              >
                <span style={{ fontSize: 10, color: '#6e7681', flexShrink: 0 }}>{fmtClock(t.startedAt)}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#e6edf3' }}>
                  {t.rootName}
                  <span style={{ fontSize: 10, color: '#6e7681', marginLeft: 6 }}>{t.rootService}{t.spanCount > 1 ? ` +${t.spanCount - 1}` : ''}</span>
                </span>
                {t.hasError && <span style={{ fontSize: 10, color: '#f85149', flexShrink: 0 }}>⨯{t.errCount}</span>}
                <span style={{ fontSize: 11, color: t.durationMs >= 1000 ? '#d29922' : '#8b949e', flexShrink: 0 }}>{core.formatDuration(t.durationMs)}</span>
              </div>
            ))}
          </div>
        )}

        {selected && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <button
                onClick={() => setSelected('')}
                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #3f3f46', background: 'transparent', color: '#a1a1aa', cursor: 'pointer' }}
              >← 返回列表</button>
              <span style={{ fontSize: 12, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {layout ? `${layout.ordered[0]?.name} · ${layout.ordered.length}/${layout.spanCount} spans · ${core.formatDuration(layout.env.durationMs)}` : '加载中…'}
              </span>
              <span style={{ flex: 1 }} />
              {selected && <span style={{ fontSize: 10, color: '#52525b' }}>{selected.slice(0, 16)}…</span>}
            </div>
            {!layout && full && <div style={{ color: '#71717a', fontSize: 12 }}>该 trace 已不在全文投影（仅保留最近 {12} 条）；用 AI 工具 trace_lens_get 查留痕文件里的全文。</div>}
            {!full && <div style={{ color: '#71717a', fontSize: 12 }}>加载 trace 全文…</div>}
            {layout && (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', border: '1px solid rgba(110,118,129,.2)', borderRadius: 8, padding: 4 }}>
                {layout.rows.map((r: { spanId: string; depth: number; offsetPct: number; widthPct: number }) => {
                  const span = layout.ordered.find((s) => s.spanId === r.spanId) as SpanRec
                  if (!span) return null
                  return (
                    <WaterfallRow
                      key={r.spanId}
                      span={span}
                      depth={r.depth}
                      offsetPct={r.offsetPct}
                      widthPct={r.widthPct}
                      expanded={expandedSpan === r.spanId}
                      onToggle={() => setExpandedSpan(expandedSpan === r.spanId ? '' : r.spanId)}
                    />
                  )
                })}
                {layout.rows.length === 0 && <div style={{ color: '#71717a', fontSize: 12 }}>空 trace。</div>}
              </div>
            )}
          </div>
        )}
      </div>

      {toast && <Toast msg={toast.msg} kind={toast.kind} />}

      <div style={{ fontSize: 10, color: '#52525b' }}>
        数据只存本机（spans.jsonl + 本机 kv），无外发路径；span 属性可能含敏感数据，共享屏幕时注意。
      </div>
    </div>
  )
}
