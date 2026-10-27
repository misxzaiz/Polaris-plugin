/**
 * SessionReader —— 会话阅读器（搜索命中上下文 / 时光机打开共用）
 *
 * 经命令信箱读服务内存里的会话 blob（面板无 fs）；around 模式定位命中消息，
 * offset 模式从头翻页。
 */
import { useCallback, useEffect, useState } from 'react'
import { mailboxCall, SOURCE_LABEL, type OpenMessage, type OpenResult, type SiftEntry } from './model'

const PAGE = 40

function fmtTime(ts: string | number): string {
  const ms = typeof ts === 'number' ? ts : Date.parse(String(ts))
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function highlight(text: string, terms: string[]): Array<{ t: 'plain' | 'hit'; s: string }> {
  if (!terms.length || !text) return [{ t: 'plain', s: text }]
  const sorted = [...terms].sort((a, b) => b.length - a.length)
  const out: Array<{ t: 'plain' | 'hit'; s: string }> = []
  let i = 0
  outer: while (i < text.length) {
    for (const term of sorted) {
      if (term && text.startsWith(term, i)) {
        out.push({ t: 'hit', s: term })
        i += term.length
        continue outer
      }
    }
    const last = out[out.length - 1]
    if (last && last.t === 'plain') last.s += text[i]
    else out.push({ t: 'plain', s: text[i] })
    i++
  }
  return out
}

interface Props {
  sid: string
  around?: number | null
  terms?: string[]
  onClose: () => void
}

export default function SessionReader({ sid, around = null, terms = [], onClose }: Props) {
  const [entry, setEntry] = useState<SiftEntry | null>(null)
  const [messages, setMessages] = useState<OpenMessage[]>([])
  const [total, setTotal] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offset, setOffset] = useState<number | null>(around === null ? 0 : null)

  const load = useCallback(
    async (opts: { around?: number | null; offset?: number }) => {
      setLoading(true)
      setError('')
      const res = await mailboxCall<OpenResult>('open', { sid, limit: PAGE, maxChars: 2500, ...opts })
      if (res.ok && res.data) {
        const d = res.data
        if (d.error) setError(d.error)
        else {
          setEntry(d.entry || null)
          setMessages(d.messages || [])
          setTotal(d.total || 0)
          setTruncated(!!d.truncated)
        }
      } else {
        setError(res.error || '读取失败')
      }
      setLoading(false)
    },
    [sid],
  )

  useEffect(() => {
    load({ around, offset: around === null ? 0 : undefined })
  }, [load, around, sid])

  const atStart = offset !== null && offset <= 0
  const windowEnd = (offset ?? 0) + messages.length
  const atEnd = offset !== null && windowEnd >= total

  return (
    <div className="ts-card">
      <div className="ts-card-b" style={{ borderBottom: '1px solid #242C3A' }}>
        <div className="ts-row">
          <button className="ts-btn ghost sm" onClick={onClose}>
            ← 返回
          </button>
          <b style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry ? entry.title : '加载中…'}</b>
          {entry && (
            <span className={`ts-tag ${entry.source}`}>
              {SOURCE_LABEL[entry.source] || entry.source} · {total} 条
            </span>
          )}
        </div>
      </div>
      <div className="ts-card-b" style={{ padding: '10px 13px 14px' }}>
        {loading && (
          <div className="ts-sub" style={{ textAlign: 'center', padding: 14 }}>
            <span className="ts-spin" /> 正在经服务读取会话…
          </div>
        )}
        {!loading && error && <div className="ts-err" style={{ margin: 0 }}>{error}</div>}
        {!loading && !error && messages.length === 0 && <div className="ts-empty">这段没有可展示的对话内容。</div>}
        {!loading &&
          messages.map((m) => (
            <div key={m.i} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: m.role === 'user' ? '#79C0FF' : '#7EE787', marginBottom: 3 }}>
                {m.role === 'user' ? '用户' : 'AI'} · #{m.i} {fmtTime(m.ts) && `· ${fmtTime(m.ts)}`}
              </div>
              <div
                style={{
                  fontSize: 12,
                  lineHeight: 1.65,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: m.role === 'user' ? 'rgba(88,101,242,.07)' : 'transparent',
                  borderLeft: m.role === 'user' ? '2px solid #5865F2' : '2px solid #254a2b',
                  paddingLeft: 9,
                }}
              >
                {highlight(m.text, terms).map((seg, i) =>
                  seg.t === 'hit' ? (
                    <span key={i} className="ts-mark">
                      {seg.s}
                    </span>
                  ) : (
                    <span key={i}>{seg.s}</span>
                  ),
                )}
              </div>
            </div>
          ))}
        {!loading && !error && offset !== null && (
          <div className="ts-row" style={{ justifyContent: 'center', marginTop: 6 }}>
            <button className="ts-btn ghost sm" disabled={atStart} onClick={() => { const o = Math.max(0, (offset ?? 0) - PAGE); setOffset(o); load({ offset: o }) }}>
              上一页
            </button>
            <span className="ts-sub">
              {total > 0 ? `${Math.min(windowEnd, total)} / ${total}` : ''}
            </span>
            <button className="ts-btn ghost sm" disabled={atEnd} onClick={() => { const o = (offset ?? 0) + messages.length; setOffset(o); load({ offset: o }) }}>
              下一页
            </button>
          </div>
        )}
        {truncated && <div className="ts-sub" style={{ textAlign: 'center', marginTop: 6 }}>部分超长消息已截断展示。</div>}
      </div>
    </div>
  )
}
