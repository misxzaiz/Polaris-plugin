/**
 * 回调流 Tab：实时捕获列表 + 详情（头/体/转发结果/重放/复制 cURL）
 */
import { useMemo, useState } from 'react'
import { prettyBodyText, toCurl } from '../../shared/core.js'
import { copyText, fmtBytes, fmtTime, sendCommand, type Bucket, type Capture, type WhsMeta } from '../model'
import type { PanelData, Toast } from '../Panel'

interface Props {
  data: PanelData
  running: boolean
  reload: () => Promise<PanelData>
  showToast: Toast
  onSendToChat?: (m: string) => void
  onGoTab: (id: 'live' | 'buckets' | 'stats' | 'settings') => void
}

const METHOD_COLOR: Record<string, string> = {
  GET: '#3fb950', POST: '#d29922', PUT: '#58a6ff', PATCH: '#bc8cff',
  DELETE: '#f85149', HEAD: '#8b949e', OPTIONS: '#8b949e',
}

function statusColor(s: number | undefined): string {
  if (!s) return '#8b949e'
  if (s < 300) return '#3fb950'
  if (s < 400) return '#58a6ff'
  if (s < 500) return '#d29922'
  return '#f85149'
}

export default function LiveTab({ data, running, reload, showToast, onSendToChat, onGoTab }: Props) {
  const [bucketFilter, setBucketFilter] = useState('')
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replaying, setReplaying] = useState(false)

  const buckets: Bucket[] = data.settings?.buckets || []
  const meta: WhsMeta | null = data.meta

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return data.captures.filter((c) => {
      if (bucketFilter && c.bucketId !== bucketFilter) return false
      if (!kw) return true
      return `${c.path} ${c.query} ${c.method} ${c.sourceIp} ${c.kind === 'text' ? c.bodyText : ''}`.toLowerCase().includes(kw)
    })
  }, [data.captures, bucketFilter, q])

  const selected = filtered.find((c) => c.id === selectedId) || data.captures.find((c) => c.id === selectedId) || null

  const bucketTag = (id: string): string => buckets.find((b) => b.id === id)?.name || id

  const doReplay = async (c: Capture) => {
    const bucket = buckets.find((b) => b.id === c.bucketId)
    if (!bucket?.forwardUrl) {
      showToast('该桶未配置转发地址：去「桶与地址」页配置，或重放时手动指定目标', 'bad')
      return
    }
    if (!window.confirm(`重放会向 ${bucket.forwardUrl} 再发一次真实请求（${c.method} ${c.path}）。继续？`)) return
    setReplaying(true)
    try {
      const r = await sendCommand('replay', { captureId: c.id, bucketId: c.bucketId }, 25000)
      if (r.ok) showToast(`重放成功：响应 ${r.status}（${r.latencyMs}ms）`, 'good')
      else showToast(`重放失败：${r.error || '未知'}`, 'bad')
    } catch (e) {
      showToast(`重放失败：${(e as Error).message}`, 'bad')
    } finally {
      setReplaying(false)
      void reload()
    }
  }

  const hostPort = `127.0.0.1:${meta?.port || 9869}`

  if (!running) {
    return <div style={{ color: '#71717a', fontSize: 12 }}>服务离线，无法显示实时捕获。启动服务后这里会显示进来的每一条回调。</div>
  }
  if (!buckets.length) {
    return (
      <div style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.8, padding: '8px 4px' }}>
        <div style={{ color: '#f4f4f5', fontSize: 14, marginBottom: 6 }}>先建一个捕获桶</div>
        桶 = 一条专属捕获路径（/hook/&lt;secret&gt;）。把回调地址配到第三方（或把内网穿透隧道指向
        <code style={{ color: '#93c5fd' }}> 127.0.0.1:{meta?.port || 9869}</code>）就能在这里看到每一条回调。
        <div style={{ marginTop: 10 }}>
          <button onClick={() => onGoTab('buckets')} style={btnPrimary}>去「桶与地址」建桶</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      {/* 过滤条 */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => setBucketFilter('')}
          style={chip(bucketFilter === '')}
        >全部 {data.captures.length}</button>
        {buckets.map((b) => (
          <button key={b.id} onClick={() => setBucketFilter(b.id)} style={chip(bucketFilter === b.id)}>
            {b.name} {data.captures.filter((c) => c.bucketId === b.id).length}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜路径/体/来源 IP…"
          style={{
            flex: 1, minWidth: 120, fontSize: 12, padding: '5px 8px', borderRadius: 6,
            border: '1px solid #3f3f46', background: '#18181b', color: '#d4d4d8', minHeight: 28,
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flex: 1, minHeight: 0 }}>
        {/* 列表 */}
        <div style={{ flex: selected ? 5 : 1, minWidth: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.length === 0 && (
            <div style={{ color: '#71717a', fontSize: 12, padding: 12, lineHeight: 1.8 }}>
              {data.captures.length === 0 ? (
                <>
                  还没有回调进来。三步开跑：
                  <br />1. 复制桶的捕获地址（<b>桶与地址</b> 页）
                  <br />2. 配到第三方回调 URL，或把 ngrok/natapp 等隧道指向 <code style={{ color: '#93c5fd' }}>127.0.0.1:{meta?.port || 9869}</code>
                  <br />3. 触发一次回调，这里实时出现
                  {onSendToChat && (
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => void onSendToChat('给我 Webhook 调试台的回调地址')} style={btnPrimary}>让 AI 给我回调地址</button>
                    </div>
                  )}
                </>
              ) : '当前过滤条件下没有匹配记录。'}
            </div>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', width: '100%',
                padding: '7px 9px', borderRadius: 8, cursor: 'pointer', fontSize: 12, minHeight: 36,
                border: `1px solid ${c.id === selectedId ? '#3b82f6' : '#27272a'}`,
                background: c.id === selectedId ? 'rgba(59,130,246,.08)' : '#18181b',
                color: '#d4d4d8',
              }}
            >
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(255,255,255,.06)', color: METHOD_COLOR[c.method] || '#d4d4d8', minWidth: 44, textAlign: 'center',
              }}>{c.method}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e4e4e7' }}>
                {c.path}{c.query ? <span style={{ color: '#71717a' }}>?{c.query}</span> : null}
              </span>
              <span style={{ fontSize: 10, color: '#71717a', whiteSpace: 'nowrap' }}>{bucketTag(c.bucketId)}</span>
              <span style={{ fontSize: 10, color: statusColor(c.responded?.status), whiteSpace: 'nowrap' }}>
                {c.responded?.status ?? '-'}{c.forward ? (c.forward.ok ? ' ⤍' : ' ⤍✕') : ''}
              </span>
              <span style={{ fontSize: 10, color: '#52525b', whiteSpace: 'nowrap' }}>{fmtTime(c.receivedAt)}</span>
            </button>
          ))}
        </div>

        {/* 详情 */}
        {selected && (
          <div style={{ flex: 4, minWidth: 0, overflowY: 'auto', border: '1px solid #27272a', borderRadius: 8, padding: 10, background: '#131316', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: METHOD_COLOR[selected.method] || '#f4f4f5' }}>{selected.method}</span>
              <span style={{ fontSize: 12, color: '#e4e4e7', wordBreak: 'break-all' }}>
                {selected.path}{selected.query ? `?${selected.query}` : ''}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#71717a', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>{fmtTime(selected.receivedAt)}</span>
              <span>来源 {selected.sourceIp}</span>
              <span>{selected.kind} {fmtBytes(selected.size)}{selected.truncated || selected.previewTruncated ? '（截断）' : ''}</span>
              <span>桶 {bucketTag(selected.bucketId)}</span>
              <span style={{ color: statusColor(selected.responded?.status) }}>应答 {selected.responded?.status ?? '-'}</span>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => void doReplay(selected)} disabled={replaying} style={btnAction(replaying)}>↻ 重放到转发地址</button>
              <button onClick={() => { void copyText(`http://${hostPort}${selected.path}${selected.query ? `?${selected.query}` : ''}`).then((ok) => showToast(ok ? '已复制 URL' : '复制失败', ok ? 'good' : 'bad')) }} style={btnGhost}>复制 URL</button>
              <button onClick={() => { void copyText(toCurl(selected, hostPort)).then((ok) => showToast(ok ? '已复制 cURL' : '复制失败', ok ? 'good' : 'bad')) }} style={btnGhost}>复制 cURL</button>
              <button onClick={() => setSelectedId(null)} style={btnGhost}>关闭</button>
            </div>

            {selected.forward && (
              <div style={{
                fontSize: 11, padding: 8, borderRadius: 6, lineHeight: 1.6,
                border: `1px solid ${selected.forward.ok ? 'rgba(63,185,80,.35)' : 'rgba(248,81,73,.35)'}`,
                background: selected.forward.ok ? 'rgba(63,185,80,.07)' : 'rgba(248,81,73,.07)',
              }}>
                <b style={{ color: selected.forward.ok ? '#3fb950' : '#f85149' }}>
                  转发 {selected.forward.ok ? selected.forward.status : '失败'}
                </b>
                <span style={{ color: '#71717a' }}> → {selected.forward.url}（{selected.forward.latencyMs}ms）</span>
                {selected.forward.error && <div style={{ color: '#fca5a5' }}>{selected.forward.error}</div>}
                {selected.forward.bodyPreview && <div style={{ color: '#a1a1aa', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{selected.forward.bodyPreview.slice(0, 600)}</div>}
              </div>
            )}

            <div>
              <div style={sectionTitle}>请求头（{Object.keys(selected.headers || {}).length}）</div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', lineHeight: 1.7, color: '#a1a1aa', wordBreak: 'break-all' }}>
                {Object.entries(selected.headers || {}).map(([k, v]) => (
                  <div key={k}><span style={{ color: '#93c5fd' }}>{k}</span>: {String(v).slice(0, 300)}</div>
                ))}
              </div>
            </div>

            <div style={{ minHeight: 0 }}>
              <div style={sectionTitle}>请求体（{selected.kind}，{fmtBytes(selected.size)}）</div>
              <pre style={{
                margin: 0, padding: 8, borderRadius: 6, background: '#09090b', border: '1px solid #27272a',
                fontSize: 11, fontFamily: 'monospace', color: '#e4e4e7',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 320, overflowY: 'auto',
              }}>
                {selected.kind === 'text'
                  ? prettyBodyText(selected.bodyText || '（空）')
                  : selected.kind === 'binary'
                    ? `（二进制 ${fmtBytes(selected.size)}${selected.bodyBase64 ? `，base64 前 200 字符: ${selected.bodyBase64.slice(0, 200)}` : ''}）`
                    : '（空体）'}
              </pre>
              {selected.previewTruncated && (
                <div style={{ fontSize: 10, color: '#d29922', marginTop: 4 }}>面板仅显示预览；全文在服务端留痕文件（AI 可用 hook_get 读全文）。</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const chip = (active: boolean): React.CSSProperties => ({
  fontSize: 11, padding: '4px 10px', borderRadius: 14, cursor: 'pointer', minHeight: 26,
  border: `1px solid ${active ? '#3b82f6' : '#3f3f46'}`,
  background: active ? 'rgba(59,130,246,.15)' : 'transparent',
  color: active ? '#93c5fd' : '#a1a1aa', whiteSpace: 'nowrap',
})
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#e4e4e7', marginBottom: 4 }
const btnPrimary: React.CSSProperties = {
  fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', minHeight: 30,
  border: '1px solid #3b82f6', background: 'rgba(59,130,246,.18)', color: '#93c5fd',
}
const btnAction = (disabled: boolean): React.CSSProperties => ({
  fontSize: 11, padding: '5px 10px', borderRadius: 6, cursor: disabled ? 'wait' : 'pointer', minHeight: 28,
  border: '1px solid rgba(210,153,34,.5)', background: 'rgba(210,153,34,.12)', color: '#e3b341',
})
const btnGhost: React.CSSProperties = ({
  fontSize: 11, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 28,
  border: '1px solid #3f3f46', background: 'transparent', color: '#a1a1aa',
} as React.CSSProperties)
