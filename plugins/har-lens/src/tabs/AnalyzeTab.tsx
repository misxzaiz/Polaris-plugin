/**
 * 分析 Tab：打开 HAR → 概览卡 → 瀑布图 + 请求清单（过滤）→ 单条详情抽屉
 * 行级时相条用 core.rowSegments（与服务同一几何）；所有文本为服务侧已脱敏投影。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  core, readRows, getRowsIdx, sendCommand, fmtBytes, fmtMs, statusColor, PHASE_COLORS,
  type PanelData, type HarRow, type EntryDetail,
} from '../model'

type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

const FILTERS: Array<{ id: string; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'errors', label: '错误' },
  { id: 'slow', label: '最慢' },
  { id: 'large', label: '最大' },
  { id: 'dup', label: '重复' },
]

export default function AnalyzeTab({ data, running, reload, showToast }: {
  data: PanelData
  running: boolean
  reload: () => Promise<PanelData>
  showToast: Toast
}) {
  const [pathInput, setPathInput] = useState('')
  const [opening, setOpening] = useState(false)
  const [rows, setRows] = useState<HarRow[]>([])
  const [rowsTruncated, setRowsTruncated] = useState(false)
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState<EntryDetail | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const lastPath = useRef('')

  const report = data.report
  const activePath = data.meta?.activePath || ''

  const refreshRows = useCallback(async (force = false) => {
    const p = activePath || report?.path || ''
    if (!p) { setRows([]); return }
    if (!force && lastPath.current === p && rows.length) return
    lastPath.current = p
    const idx = await getRowsIdx()
    if (!idx || !idx.chunkCount) { setRows([]); return }
    setRowsTruncated(!!idx.truncated)
    setRows(await readRows())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, report?.path])

  useEffect(() => { void refreshRows() }, [refreshRows])

  const open = async (p?: string) => {
    const target = (p || pathInput).trim()
    if (!target) { showToast('请填写 .har 文件路径', 'bad'); return }
    setOpening(true)
    showToast('解析中：大文件需数秒…', 'info')
    const r = await sendCommand('open', { path: target }, 90000)
    setOpening(false)
    if (!r.ok) { showToast(`打开失败：${r.error || '未知'}`, 'bad'); await reload(); return }
    showToast(`已打开 ${r.entryCount} 条请求`, 'good')
    await reload()
    lastPath.current = ''
    await refreshRows(true)
  }

  const openDetail = async (i: number) => {
    setDetailBusy(true)
    setDetail(null)
    const r = await sendCommand<{ entry: EntryDetail }>('entry', { index: i }, 20000)
    setDetailBusy(false)
    if (!r.ok || !r.entry) { showToast(`取详情失败：${r.error || '未知'}`, 'bad'); return }
    setDetail(r.entry)
  }

  const baseRows: HarRow[] = (() => {
    if (filter === 'errors') return report?.errors || []
    if (filter === 'slow') return report?.slowTop || []
    if (filter === 'large') return report?.largeTop || []
    return rows
  })()
  const kw = q.trim().toLowerCase()
  const shown = kw ? baseRows.filter((r) => (`${r.m} ${r.u}`).toLowerCase().includes(kw)) : baseRows

  const span = Math.max(1, report?.spanMs || 1)
  const statusCounts = report?.statusCounts || {}
  const statusTotal = Object.values(statusCounts).reduce((a, b) => a + b, 0) || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 打开栏 */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void open() }}
          placeholder="C:\\Users\\me\\Downloads\\trace.har"
          disabled={!running || opening || data.meta?.busy}
          style={{ flex: 1, minWidth: 220, padding: '7px 10px', fontSize: 12, borderRadius: 8, border: '1px solid #3f3f46', background: '#18181b', color: '#e4e4e7' }}
        />
        <button
          onClick={() => void open()}
          disabled={!running || opening || data.meta?.busy}
          style={{ padding: '7px 16px', fontSize: 12, borderRadius: 8, cursor: 'pointer', border: '1px solid #3b82f6', background: 'rgba(59,130,246,.2)', color: '#93c5fd', minHeight: 32 }}
        >{opening || data.meta?.state === 'parsing' ? '解析中…' : '打开'}</button>
        <button
          onClick={() => { lastPath.current = ''; void refreshRows(true); void reload() }}
          style={{ padding: '7px 10px', fontSize: 12, borderRadius: 8, cursor: 'pointer', border: '1px solid #3f3f46', background: 'transparent', color: '#a1a1aa', minHeight: 32 }}
        >刷新</button>
      </div>
      {data.hist.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#52525b' }}>最近:</span>
          {data.hist.slice(0, 5).map((h) => (
            <button
              key={h.path}
              onClick={() => { setPathInput(h.path); void open(h.path) }}
              title={h.path}
              style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, cursor: 'pointer', border: '1px solid #3f3f46', background: 'transparent', color: '#71717a', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >{h.path.split(/[\\/]/).pop()} · {h.entryCount}条</button>
          ))}
        </div>
      )}
      {data.meta?.state === 'error' && data.meta.error && (
        <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(248,81,73,.4)', background: 'rgba(248,81,73,.08)', fontSize: 12, color: '#fca5a5' }}>上次打开出错：{data.meta.error}</div>
      )}

      {/* 空态 */}
      {!report && (
        <div style={{ padding: 18, borderRadius: 8, border: '1px dashed #3f3f46', fontSize: 12, color: '#71717a', lineHeight: 1.9 }}>
          <div style={{ color: '#a1a1aa', fontWeight: 600, marginBottom: 4 }}>还没有打开 HAR</div>
          <div>1. Chrome/Edge：F12 → Network → 操作页面 → 右键请求列表 → <b>Save all as HAR</b> / ⬇ 导出</div>
          <div>2. Firefox：F12 → Network → 齿轮 → <b>Save All As HAR</b></div>
          <div>3. 把 .har 文件路径贴到上面点「打开」——解析、审计、脱敏全在本机完成</div>
        </div>
      )}

      {/* 概览 */}
      {report && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            {[
              { k: '请求', v: `${report.entryCount}${report.truncatedEntries ? '+' : ''}`, s: report.creator || '' },
              { k: '跨度', v: fmtMs(report.spanMs), s: `请耗时合计 ${fmtMs(report.timeSumMs)}` },
              { k: '传输', v: fmtBytes(report.transferBytes), s: `体合计 ${fmtBytes(report.bodyBytes)}` },
              { k: 'p50 / p95', v: `${fmtMs(report.times.p50)} / ${fmtMs(report.times.p95)}`, s: `max ${fmtMs(report.times.max)}` },
              { k: '错误', v: `${report.errorCount}`, s: `缓存命中 ${report.cachedCount} · 重定向 ${report.redirectCount}` },
            ].map((c) => (
              <div key={c.k} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #3f3f46', background: 'rgba(63,63,70,.25)' }}>
                <div style={{ fontSize: 10, color: '#71717a' }}>{c.k}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5' }}>{c.v}</div>
                <div style={{ fontSize: 9, color: '#52525b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.s}</div>
              </div>
            ))}
          </div>

          {/* 状态分布条 */}
          <div>
            <div style={{ fontSize: 11, color: '#71717a', marginBottom: 4 }}>状态分布</div>
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#27272a' }}>
              {(['2xx', '3xx', '4xx', '5xx', '0/abort'] as const).map((cls) => {
                const n = statusCounts[cls] || 0
                if (!n) return null
                const color = cls === '2xx' ? '#3fb950' : cls === '3xx' ? '#58a6ff' : cls === '4xx' ? '#d29922' : '#f85149'
                return <div key={cls} style={{ width: `${(n / statusTotal) * 100}%`, background: color }} title={`${cls}: ${n}`} />
              })}
            </div>
            <div style={{ fontSize: 10, color: '#52525b', marginTop: 3 }}>
              {(['2xx', '3xx', '4xx', '5xx', '0/abort'] as const).map((cls) => `${cls} ${statusCounts[cls] || 0}`).join(' · ')}
            </div>
          </div>

          {/* 域 TOP */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(report.domains || []).slice(0, 8).map((d) => (
              <span key={d.h} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(88,166,255,.1)', color: '#79c0ff' }}>
                {d.h} · {d.n}条 · {fmtBytes(d.bytes)}
              </span>
            ))}
          </div>
        </>
      )}

      {/* 重复组 */}
      {report && report.dupUncached.length > 0 && (
        <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(210,153,34,.4)', background: 'rgba(210,153,34,.08)', fontSize: 11, color: '#e3b341' }}>
          <b>疑似无缓存重复</b>（同方法+URL，无 304/缓存证据）：
          {report.dupUncached.slice(0, 4).map((g) => (
            <div key={g.key} style={{ marginTop: 2 }}>{g.count} 次 · 合计 {fmtMs(g.timeSumMs)} · {g.key.length > 110 ? `${g.key.slice(0, 110)}…` : g.key}</div>
          ))}
        </div>
      )}

      {/* 过滤 + 搜索 */}
      {report && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '4px 12px', fontSize: 11, borderRadius: 8, cursor: 'pointer',
                border: '1px solid', minHeight: 26,
                borderColor: filter === f.id ? '#3b82f6' : '#3f3f46',
                background: filter === f.id ? 'rgba(59,130,246,.15)' : 'transparent',
                color: filter === f.id ? '#93c5fd' : '#a1a1aa',
              }}
            >{f.label}</button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索方法/URL…"
            style={{ flex: 1, minWidth: 140, padding: '5px 10px', fontSize: 11, borderRadius: 8, border: '1px solid #3f3f46', background: '#18181b', color: '#e4e4e7' }}
          />
          <span style={{ fontSize: 10, color: '#52525b' }}>{shown.length} 条{rowsTruncated ? '（投影已截断）' : ''}</span>
        </div>
      )}

      {/* 瀑布图 + 清单 */}
      {report && shown.length > 0 && (
        <div style={{ border: '1px solid #3f3f46', borderRadius: 8, overflow: 'hidden' }}>
          {/* 图例 + 轴 */}
          <div style={{ display: 'flex', gap: 10, padding: '6px 10px', fontSize: 9, color: '#71717a', borderBottom: '1px solid #27272a', flexWrap: 'wrap' }}>
            {Object.entries(PHASE_COLORS).map(([k, c]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 8, height: 8, background: c, borderRadius: 2, display: 'inline-block' }} />
                {{ blocked: '排队', dns: 'DNS', connect: '连接', ssl: 'TLS', send: '发送', wait: '等待', receive: '下载', gap: '其他' }[k]}
              </span>
            ))}
            <span style={{ marginLeft: 'auto' }}>总轴 {fmtMs(span)}</span>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {shown.slice(0, 300).map((r) => {
              const segs = core.rowSegments(r)
              return (
                <div
                  key={`${r.i}`}
                  onClick={() => void openDetail(r.i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', cursor: 'pointer',
                    borderBottom: '1px solid #1c1c1f', background: detail && detail.i === r.i ? 'rgba(59,130,246,.1)' : 'transparent',
                  }}
                >
                  <span style={{ width: 22, fontSize: 9, color: '#52525b', textAlign: 'right', flexShrink: 0 }}>#{r.i}</span>
                  <span style={{ width: 34, fontSize: 10, fontWeight: 600, color: '#a1a1aa', flexShrink: 0 }}>{r.m}</span>
                  <span style={{ width: 26, fontSize: 10, color: statusColor(r.s), flexShrink: 0, fontWeight: 700 }}>{r.s || '−'}</span>
                  <span style={{ flex: 1, fontSize: 10, color: '#d4d4d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 80 }} title={r.u}>{r.u}</span>
                  <span style={{ width: 56, fontSize: 9, color: '#71717a', textAlign: 'right', flexShrink: 0 }}>{fmtMs(r.t)}</span>
                  <span style={{ width: 54, fontSize: 9, color: '#71717a', textAlign: 'right', flexShrink: 0 }}>{fmtBytes(r.sz)}</span>
                  {/* 瀑布条 */}
                  <span style={{ width: 130, height: 10, position: 'relative', background: '#18181b', borderRadius: 2, flexShrink: 0, overflow: 'hidden' }}>
                    {segs.map((sg, gi) => (
                      <span
                        key={gi}
                        title={`${sg.k} ${fmtMs(sg.d)}`}
                        style={{ position: 'absolute', left: `${(sg.s / span) * 100}%`, width: `${Math.max(0.4, (sg.d / span) * 100)}%`, top: 0, bottom: 0, background: PHASE_COLORS[sg.k] || '#555' }}
                      />
                    ))}
                  </span>
                  {r.flags && <span style={{ width: 44, fontSize: 8, color: '#d29922', flexShrink: 0 }}>{r.flags}</span>}
                </div>
              )
            })}
          </div>
          {shown.length > 300 && <div style={{ padding: '4px 10px', fontSize: 10, color: '#52525b' }}>仅显示前 300 条（用搜索/过滤缩小范围）</div>}
        </div>
      )}

      {/* 详情抽屉 */}
      {detailBusy && <div style={{ fontSize: 11, color: '#71717a' }}>取详情中…</div>}
      {detail && !detailBusy && (
        <div style={{ border: '1px solid #3b82f6', borderRadius: 8, padding: 10, fontSize: 11, background: 'rgba(59,130,246,.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <b style={{ color: '#93c5fd' }}>#{detail.i} {detail.method} {detail.status} {detail.statusText}</b>
            <button onClick={() => setDetail(null)} style={{ border: 'none', background: 'transparent', color: '#71717a', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
          <div style={{ wordBreak: 'break-all', color: '#d4d4d8', marginBottom: 4 }}>{detail.url}</div>
          <div style={{ color: '#71717a', marginBottom: 6 }}>
            {detail.httpVersion} · 服务端 {detail.serverIp || '?'} · 开始 {detail.startedAt} · 总 {fmtMs(detail.time)}
            {detail.cache ? ` · ${detail.cache}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {Object.entries(detail.timings).map(([k, v]) => (
              <span key={k} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'rgba(63,63,70,.4)', color: v < 0 ? '#52525b' : '#d4d4d8' }}>
                {k}: {v < 0 ? '−' : fmtMs(v)}
              </span>
            ))}
          </div>
          {detail.query.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: '#71717a' }}>Query: </span>
              <span style={{ wordBreak: 'break-all', color: '#a1a1aa' }}>{detail.query.map(([k, v]) => `${k}=${v}`).join('&').slice(0, 400)}</span>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <HeadList title="请求头（敏感值已掩码）" pairs={detail.reqHeaders} />
            <HeadList title="响应头（敏感值已掩码）" pairs={detail.resHeaders} />
          </div>
          {(detail.reqBody.text || detail.resBody.text) && (
            <div style={{ marginTop: 8 }}>
              {detail.reqBody.text && <BodyBox label={`请求体预览（已脱敏${detail.reqBody.truncated ? '，截断' : ''}）`} text={detail.reqBody.text} />}
              {detail.resBody.text && <BodyBox label={`响应体预览（已脱敏${detail.resBody.truncated ? '，截断' : ''}）`} text={detail.resBody.text} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HeadList({ title, pairs }: { title: string; pairs: Array<[string, string]> }) {
  if (!pairs.length) return null
  return (
    <div>
      <div style={{ fontSize: 10, color: '#71717a', marginBottom: 2 }}>{title}</div>
      <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid #27272a', borderRadius: 6, padding: 4 }}>
        {pairs.slice(0, 40).map(([n, v], i) => (
          <div key={i} style={{ fontSize: 10, lineHeight: 1.6, wordBreak: 'break-all' }}>
            <span style={{ color: '#79c0ff' }}>{n}</span>: <span style={{ color: '#a1a1aa' }}>{v.length > 90 ? `${v.slice(0, 90)}…` : v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BodyBox({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 4 }}>
      <button onClick={() => setOpen(!open)} style={{ border: 'none', background: 'transparent', color: '#71717a', fontSize: 10, cursor: 'pointer', padding: 0 }}>
        {open ? '▾' : '▸'} {label}
      </button>
      {open && (
        <pre style={{ margin: '4px 0 0', padding: 6, background: '#18181b', border: '1px solid #27272a', borderRadius: 6, fontSize: 10, maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#a1a1aa' }}>{text}</pre>
      )}
    </div>
  )
}
