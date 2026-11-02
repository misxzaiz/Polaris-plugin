/**
 * ResponseView.tsx —— 请求记录的共享渲染（响应区/历史详情/对比复用）
 * 全内联样式（宿主不加载 panel.css，见 dev-toolbox 踩坑记录）。
 */
import { useState } from 'react'
import type { ReqRecord, Finding } from './model'
import { SEVERITY_COLOR, SEVERITY_LABEL, fmtMs } from './model'

const S = {
  card: { border: '1px solid #30363D', borderRadius: 8, padding: 10, marginBottom: 8, background: 'rgba(110,118,129,0.08)' },
  mono: { fontFamily: 'Consolas, Monaco, monospace', fontSize: 12, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const },
  muted: { color: '#8B949E', fontSize: 12 },
  pre: { background: 'rgba(0,0,0,0.25)', border: '1px solid #30363D', borderRadius: 6, padding: 8, margin: '6px 0 0', maxHeight: 320, overflow: 'auto' as const },
}

export function statusColor(rec: ReqRecord): string {
  if (rec.error) return '#F85149'
  if (rec.streamInfo && rec.streamInfo.sawError) return '#F85149'
  return rec.ok ? '#3FB950' : '#F85149'
}

/** 诊断卡列表（error/warn 默认展开，info 折叠） */
export function FindingsList({ findings }: { findings?: Finding[] | null }) {
  const [showInfo, setShowInfo] = useState(false)
  if (!findings || !findings.length) return null
  const major = findings.filter((f) => f.severity !== 'info')
  const infos = findings.filter((f) => f.severity === 'info')
  return (
    <div style={{ marginTop: 8 }}>
      {major.map((f, i) => (
        <div key={`${f.id}-${i}`} style={{ ...S.card, borderLeft: `3px solid ${SEVERITY_COLOR[f.severity]}`, marginBottom: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: SEVERITY_COLOR[f.severity] }}>
            {SEVERITY_LABEL[f.severity]} · {f.title}
          </div>
          <div style={{ ...S.muted, marginTop: 4, lineHeight: 1.5 }}>{f.detail}</div>
          {f.fix ? <div style={{ ...S.muted, marginTop: 4, color: '#7EE787' }}>→ {f.fix}</div> : null}
        </div>
      ))}
      {infos.length ? (
        <div>
          <button
            onClick={() => setShowInfo(!showInfo)}
            style={{ background: 'none', border: 'none', color: '#58A6FF', cursor: 'pointer', fontSize: 12, padding: '2px 0' }}
          >
            {showInfo ? '▾' : '▸'} {infos.length} 条提示
          </button>
          {showInfo
            ? infos.map((f, i) => (
                <div key={`${f.id}-${i}`} style={{ ...S.card, borderLeft: '3px solid #58A6FF', marginBottom: 6 }}>
                  <div style={{ fontSize: 13, color: '#58A6FF' }}>提示 · {f.title}</div>
                  <div style={{ ...S.muted, marginTop: 4, lineHeight: 1.5 }}>{f.detail}</div>
                </div>
              ))
            : null}
        </div>
      ) : null}
    </div>
  )
}

/** 响应总览行：HTTP 状态 + 耗时 + TTFT + chunk + finish + 用量 */
function StatusLine({ rec }: { rec: ReqRecord }) {
  const si = rec.streamInfo
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'baseline', fontSize: 13 }}>
      <span style={{ fontWeight: 700, color: statusColor(rec), fontSize: 15 }}>
        {rec.error ? '网络失败' : `HTTP ${rec.status || '?'}`}
      </span>
      <span style={S.muted}>总耗时 {fmtMs(rec.ms)}</span>
      {si ? <span style={S.muted}>TTFT {fmtMs(si.ttftMs)}</span> : null}
      {si ? <span style={S.muted}>chunk {si.chunkCount}</span> : null}
      {si && si.tps ? <span style={S.muted}>{si.tps} tok/s（估）</span> : null}
      {si ? (
        <span style={S.muted}>
          终止：{si.finishReason || '无'}
          {si.doneMarker ? ' +[DONE]' : ''}
        </span>
      ) : null}
      {si && si.usage ? (
        <span style={S.muted}>
          用量 {si.usage.prompt ?? '?'} + {si.usage.completion ?? '?'} tok{si.usage.exact ? '' : '（估）'}
        </span>
      ) : null}
      <span style={S.muted}>{rec.at ? rec.at.replace('T', ' ').slice(5, 19) : ''}</span>
    </div>
  )
}

/** 响应正文渲染：流式 text/reasoning / 非流式 content / 错误体 / 网络错误 */
function BodyView({ rec }: { rec: ReqRecord }) {
  const si = rec.streamInfo
  if (si) {
    return (
      <div>
        {si.reasoning ? (
          <div>
            <div style={{ ...S.muted, marginTop: 8 }}>思考（reasoning）</div>
            <pre style={{ ...S.pre, color: '#B392F0' }}>{si.reasoning}</pre>
          </div>
        ) : null}
        <div style={{ ...S.muted, marginTop: 8 }}>正文</div>
        <pre style={S.pre}>{si.text || (si.sawError ? `（流内错误：${si.sawError.message || '?'}）` : '（空）')}</pre>
      </div>
    )
  }
  if (rec.content != null) {
    return (
      <div>
        <div style={{ ...S.muted, marginTop: 8 }}>正文</div>
        <pre style={S.pre}>{rec.content || '（空）'}</pre>
      </div>
    )
  }
  if (rec.parsedError) {
    return (
      <div>
        <div style={{ ...S.muted, marginTop: 8 }}>
          错误体 {rec.parsedError.providerCode ? `[${rec.parsedError.providerCode}]` : ''}
          {rec.parsedError.retryAfterMs ? ` · 建议 ${Math.round(rec.parsedError.retryAfterMs / 1000)}s 后重试` : ''}
        </div>
        <pre style={{ ...S.pre, color: '#FFA198' }}>{rec.parsedError.raw}</pre>
      </div>
    )
  }
  if (rec.error) {
    return <div style={{ ...S.muted, marginTop: 8, color: '#FFA198' }}>网络层错误：{rec.error}</div>
  }
  return <div style={{ ...S.muted, marginTop: 8 }}>（无响应体）</div>
}

/** SSE chunk 时间线（折叠） */
function Timeline({ rec }: { rec: ReqRecord }) {
  const [open, setOpen] = useState(false)
  if (!rec.streamInfo || !rec.timeline || !rec.timeline.length) return null
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ background: 'none', border: 'none', color: '#58A6FF', cursor: 'pointer', fontSize: 12, padding: '2px 0' }}
      >
        {open ? '▾' : '▸'} SSE chunk 时间线（{rec.timeline.length} 个网络帧，dt 为相对首帧毫秒）
      </button>
      {open ? (
        <div style={{ ...S.pre, maxHeight: 260 }}>
          {rec.timeline.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, borderBottom: '1px solid #21262D', padding: '2px 0' }}>
              <span style={{ color: '#8B949E', minWidth: 64 }}>+{r.dt}ms</span>
              <span style={{ color: '#8B949E', minWidth: 52 }}>{r.bytes}B</span>
              <span style={{ color: '#C9D1D9' }}>{r.preview}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** 完整请求记录渲染 */
export default function ResponseView({ record, showBody = true }: { record: ReqRecord; showBody?: boolean }) {
  const [showReq, setShowReq] = useState(false)
  return (
    <div style={S.card}>
      <StatusLine rec={record} />
      <div style={{ ...S.muted, marginTop: 4 }}>
        {record.endpoint ? `${record.endpoint.name} · ${record.endpoint.baseUrl} · key ${record.endpoint.keyMask}` : ''}
      </div>
      <button
        onClick={() => setShowReq(!showReq)}
        style={{ background: 'none', border: 'none', color: '#58A6FF', cursor: 'pointer', fontSize: 12, padding: '4px 0 0' }}
      >
        {showReq ? '▾' : '▸'} 请求详情（URL / 请求体 / 发送头）
      </button>
      {showReq ? (
        <div>
          <div style={{ ...S.mono, ...S.muted, marginTop: 4 }}>{record.url}</div>
          <pre style={{ ...S.pre, color: '#C9D1D9' }}>{JSON.stringify(record.body, null, 2)}</pre>
          <pre style={{ ...S.pre, color: '#8B949E' }}>
            {Object.entries(record.maskedHeaders || {}).map(([k, v]) => `${k}: ${v}`).join('\n')}
          </pre>
        </div>
      ) : null}
      {showBody ? <BodyView rec={record} /> : null}
      <Timeline rec={record} />
      <FindingsList findings={record.findings} />
    </div>
  )
}
