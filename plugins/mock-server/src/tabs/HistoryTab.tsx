/**
 * HistoryTab —— 请求历史（新在前；内存 500 条，服务重启清空）
 * 数据来自 mck.hist.<n> 分块镜像（cap.kv 投影），敏感请求头服务侧已脱敏。
 */
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PanelData } from '../Panel'
import type { HistRec } from '../model'
import { core, fmtTime, sendCommand } from '../model'

export default function HistoryTab({ data, running, showToast }: { data: PanelData; running: boolean; showToast: (m: string, k?: 'good' | 'bad' | 'info') => void }) {
  const [q, setQ] = useState('')
  const [statusCls, setStatusCls] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  const rows = useMemo(() => {
    let list = data.history
    if (q.trim()) {
      const kw = q.trim().toLowerCase()
      list = list.filter((r) => `${r.method} ${r.path} ${r.query} ${r.reqBodyPreview}`.toLowerCase().includes(kw))
    }
    if (statusCls) list = list.filter((r) => Math.floor(r.status / 100) === statusCls)
    return list
  }, [data.history, q, statusCls])

  const clear = async () => {
    if (!running) { showToast('服务未运行', 'bad'); return }
    if (!window.confirm('清空全部请求历史？（不可恢复；路由不受影响）')) return
    setClearing(true)
    const r = await sendCommand('clear_history', { confirm: true }, 20000)
    setClearing(false)
    if (!r.ok) { showToast(r.error || '清空失败', 'bad'); return }
    showToast('历史已清空', 'good')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜方法/路径/请求体…" style={{
          flex: 1, minWidth: 160, padding: '6px 8px', fontSize: 12, borderRadius: 6,
          background: '#18181b', border: '1px solid #3f3f46', color: '#e4e4e7', outline: 'none',
        }} />
        {[0, 2, 4, 5].map((cls) => (
          <button key={cls} onClick={() => setStatusCls(cls)} style={{
            padding: '4px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
            border: '1px solid', minHeight: 26,
            borderColor: statusCls === cls ? '#3b82f6' : '#3f3f46',
            background: statusCls === cls ? 'rgba(59,130,246,.15)' : 'transparent',
            color: statusCls === cls ? '#93c5fd' : '#a1a1aa',
          }}>{cls === 0 ? '全部' : `${cls}xx`}</button>
        ))}
        <button onClick={clear} disabled={clearing} style={{ ...ghostBtn(), color: '#f85149' }}>{clearing ? '清空中…' : '清空'}</button>
      </div>

      <div style={{ fontSize: 11, color: '#71717a' }}>
        内存保留最近 500 条（服务重启清空）；idx 计数 {data.idx?.count ?? 0} · 累计 {data.idx?.total ?? 0}
      </div>

      {!rows.length && (
        <div style={{ padding: 20, textAlign: 'center', color: '#71717a', fontSize: 12 }}>
          {data.history.length ? '没有符合过滤条件的记录。' : '还没有请求。把前端 baseURL 指向服务地址后调一次接口，这里就会出现记录。'}
        </div>
      )}

      {rows.map((r) => (
        <div key={r.id} style={{ padding: 8, borderRadius: 8, background: 'rgba(39,39,42,.5)', border: '1px solid #3f3f46' }}>
          <div
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: 11, color: '#52525b' }}>{fmtTime(r.at)}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa' }}>{r.method}</span>
            <code style={{ fontSize: 12, color: '#e4e4e7' }}>{r.path}{r.query ? `?${r.query}` : ''}</code>
            <span style={{ fontSize: 11, color: statusColor(r.status), fontWeight: 700 }}>{r.status}</span>
            {r.delayMs > 0 && <span style={{ fontSize: 10, color: '#d29922' }}>+{r.delayMs}ms</span>}
            <span style={{ fontSize: 10, color: '#52525b' }}>{r.durMs}ms</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: r.matchedRouteId ? '#3fb950' : '#f85149' }}>
              {r.matchedRouteName ? `路由[${r.matchedRouteName}]` : '未匹配→404诊断'}
            </span>
          </div>
          {expanded === r.id && <HistDetail r={r} />}
        </div>
      ))}
    </div>
  )
}

export function HistDetail({ r }: { r: HistRec }) {
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #3f3f46', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div>
        <div style={{ color: '#71717a', marginBottom: 2 }}>请求头（敏感字段已脱敏）</div>
        <pre style={preStyle}>{Object.entries(r.reqHeaders || {}).map(([k, v]) => `${k}: ${v}`).join('\n') || '（无）'}</pre>
      </div>
      <div>
        <div style={{ color: '#71717a', marginBottom: 2 }}>
          请求体（{r.reqBodyKind}{r.reqBodySize ? ` ${r.reqBodySize}B` : ''}{r.reqBodyTruncated ? '，已截断' : ''}）
        </div>
        <pre style={preStyle}>{r.reqBodyKind === 'empty' ? '（空）' : core.prettyJson(r.reqBodyPreview)}</pre>
      </div>
      <div style={{ color: '#52525b' }}>来源 {r.sourceIp || '-'} · 应答 {r.respBytes}B · {r.matchedRouteId || '无路由'}</div>
    </div>
  )
}

const preStyle: CSSProperties = {
  margin: 0, padding: 8, background: '#09090b', borderRadius: 6, fontSize: 11,
  maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#a1a1aa',
}

function statusColor(s: number): string {
  if (s < 300) return '#3fb950'
  if (s < 400) return '#d29922'
  if (s < 500) return '#f0883e'
  return '#f85149'
}

function ghostBtn(): CSSProperties {
  return {
    padding: '4px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
    background: 'transparent', border: '1px solid #3f3f46', color: '#a1a1aa', minHeight: 26,
  }
}
