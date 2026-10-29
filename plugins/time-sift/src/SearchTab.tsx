/**
 * SearchTab —— 全文检索：关键词 + 源/时间过滤 → 命中片段 → 阅读器
 *
 * 检索走命令信箱（服务持有倒排与 blob）；结果里的 terms 用于面板端高亮
 * （服务端只回片段原文，高亮口径由返回的命中术语决定，不臆造）。
 */
import { useState } from 'react'
import { mailboxCall, SOURCE_LABEL, type SearchHit, type SiftMeta, type SiftSource } from './model'
import SessionReader from './SessionReader'

const DAYS_OPTIONS: Array<[string, number]> = [
  ['不限时间', 0],
  ['近 1 天', 1],
  ['近 7 天', 7],
  ['近 30 天', 30],
  ['近一年', 365],
]

const SRC_CHIPS: Array<[SiftSource | '', string]> = [
  ['', '全部'],
  ['polaris', 'Polaris'],
  ['v2', '会话v2'],
  ['claude', 'Claude'],
  ['zcode', 'ZCode'],
]

function fmtDate(ms: number): string {
  if (!ms) return '?'
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

interface Props {
  meta: SiftMeta | null
}

export default function SearchTab({ meta }: Props) {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<SiftSource | ''>('')
  const [days, setDays] = useState(0)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [terms, setTerms] = useState<string[]>([])
  const [searched, setSearched] = useState('')
  const [openSid, setOpenSid] = useState<string | null>(null)
  const [openAround, setOpenAround] = useState<number | null>(null)

  const serviceBusy = !!(meta && meta.indexing && meta.indexing.phase !== 'idle' && meta.indexing.phase !== 'error')

  const runSearch = async () => {
    const q = query.trim()
    if (!q || searching) return
    setSearching(true)
    setError('')
    const res = await mailboxCall<{ hits?: SearchHit[]; terms?: string[]; total?: number; error?: string }>('search', {
      query: q,
      source: source || undefined,
      days: days || undefined,
      limit: 20,
    })
    if (res.ok && res.data) {
      if (res.data.error) setError(res.data.error)
      else {
        setHits(res.data.hits || [])
        setTerms(res.data.terms || [])
        setSearched(q)
      }
    } else {
      setError(res.error || '检索失败')
    }
    setSearching(false)
  }

  if (openSid) {
    return <SessionReader sid={openSid} around={openAround} terms={terms} onClose={() => setOpenSid(null)} />
  }

  return (
    <>
      <div className="ts-card">
        <div className="ts-card-b">
          <div className="ts-row">
            <input
              className="ts-inp"
              style={{ flex: 1, minWidth: 160 }}
              placeholder="搜你聊过的一切…（回车检索）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch()
              }}
            />
            <button className="ts-btn" onClick={runSearch} disabled={searching || !query.trim()}>
              {searching ? <span className="ts-spin" /> : '检索'}
            </button>
          </div>
          <div className="ts-row" style={{ marginTop: 8 }}>
            {SRC_CHIPS.map(([k, label]) => (
              <button key={k || 'all'} className={`ts-chip ${source === k ? 'on' : ''}`} onClick={() => setSource(k)}>
                {label}
              </button>
            ))}
            <select className="ts-sel" style={{ marginLeft: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {DAYS_OPTIONS.map(([label, v]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="ts-err">{error}</div>}
      {serviceBusy && !error && (
        <div className="ts-sub" style={{ padding: '0 18px 8px' }}>
          首次建索引进行中——现在能搜到的是已扫完的部分，扫完自动齐全。
        </div>
      )}

      {!searched && !error && (
        <div className="ts-empty">
          <b>会话记忆：找回你和 AI 聊过的一切</b>
          输入关键词搜历史会话——「上次那个 JSONL 解析 bug 怎么修的」「我聊过 XX 方案的会话」。
          <br />
          也可以直接在聊天里对 AI 说「帮我找找以前关于 XX 的会话」（sift_search 工具）。
        </div>
      )}

      {searched && !error && hits.length === 0 && !searching && (
        <div className="ts-empty">
          <b>没有命中「{searched}」</b>
          试试换关键词、放宽时间范围，或去掉来源筛选。
        </div>
      )}

      {hits.map((h) => (
        <div
          key={h.sid}
          className="ts-card ts-hit"
          onClick={() => {
            setOpenSid(h.sid)
            setOpenAround(h.snippet ? h.snippet.msgIndex : null)
          }}
        >
          <div className="ts-card-b">
            <div className="ts-row">
              <b style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</b>
              <span className={`ts-tag ${h.source}`}>{SOURCE_LABEL[h.source] || h.source}</span>
            </div>
            <div className="ts-sub" style={{ marginTop: 4 }}>
              {fmtDate(h.updatedAt)} · {h.msgCount} 条消息 · 命中 {h.hitCount} 处
            </div>
            {h.snippet && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: '#AAB3C5',
                  background: '#12151C',
                  border: '1px solid #222938',
                  borderRadius: 8,
                  padding: '7px 9px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {h.snippet.role === 'user' ? '用户：' : 'AI：'}
                <Highlight text={h.snippet.text} terms={terms} />
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  )
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  // 与 SessionReader 同一高亮口径：按服务返回的命中术语逐段切分
  if (!terms.length || !text) return <>{text}</>
  const sorted = [...terms].sort((a, b) => b.length - a.length)
  const nodes: React.ReactNode[] = []
  let plain = ''
  let i = 0
  let key = 0
  const flush = () => {
    if (plain) {
      nodes.push(<span key={key++}>{plain}</span>)
      plain = ''
    }
  }
  outer: while (i < text.length) {
    for (const term of sorted) {
      if (term && text.startsWith(term, i)) {
        flush()
        nodes.push(
          <span key={key++} className="ts-mark">
            {text.slice(i, i + term.length)}
          </span>,
        )
        i += term.length
        continue outer
      }
    }
    plain += text[i]
    i += 1
  }
  flush()
  return <>{nodes}</>
}
