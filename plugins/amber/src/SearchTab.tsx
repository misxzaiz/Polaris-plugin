/**
 * 检索 Tab：全文检索（命令信箱 → 服务 BM25-lite → 结果槽轮询）。
 * 快速过滤（标题/摘要子串）走本地零延迟；全文检索走服务端。
 */
import { useMemo, useState } from 'react'
import { fullSearch, type AmberData, type AmberSearchHit } from './model'

export default function SearchTab({ data, reload, showToast, openItem }: {
  data: AmberData | null
  reload: () => Promise<unknown>
  showToast: (msg: string, bad?: boolean) => void
  openItem: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<{ q: string; total: number; hits: AmberSearchHit[] } | null>(null)

  // 本地快速过滤：条目标题/摘要子串（零延迟，随输入出结果）
  const localHits = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw || kw.length < 2) return []
    return (data?.items ?? [])
      .filter((a) => `${a.title}|${a.excerpt}`.toLowerCase().includes(kw))
      .slice(0, 8)
  }, [data?.items, q])

  const corpus = data?.meta?.items ?? data?.items.filter((a) => a.status === 'ok').length ?? 0

  const doSearch = async () => {
    const query = q.trim()
    if (!query || searching) return
    setSearching(true)
    setResult(null)
    try {
      const r = await fullSearch(query, 15, 30)
      if (!r) {
        showToast('检索超时（语料大时首检偏慢，稍后重试）', true)
      } else if (r.error) {
        showToast(`检索失败：${r.error}`, true)
      } else {
        setResult({ q: query, total: r.total ?? 0, hits: r.hits ?? [] })
      }
    } catch (e) {
      showToast(`检索失败：${(e as Error).message}`, true)
    }
    setSearching(false)
    await reload()
  }

  return (
    <div>
      <div className="am-sec"><i className="am-bar" />全文检索<span className="am-hint">覆盖 {corpus} 篇封存正文（BM25-lite）</span></div>
      <div className="am-card">
        <div className="am-card-b" style={{ display: 'flex', gap: 6 }}>
          <input className="am-inp" style={{ flex: 1 }} placeholder="在封存正文里找…（支持中英文）"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }} />
          <button className="am-btn amber" disabled={searching || !q.trim()} onClick={doSearch}>
            {searching ? <span className="am-spin" /> : '检索'}
          </button>
        </div>
      </div>

      {searching && (
        <div className="am-card">
          <div className="am-card-b am-sub"><span className="am-spin" /> 服务端检索中（每次约 2–15 秒，视语料规模）…</div>
        </div>
      )}

      {localHits.length > 0 && !result && (
        <div>
          <div className="am-sec"><i className="am-bar" />标题/摘要快速匹配</div>
          <div className="am-card" style={{ padding: 0 }}>
            {localHits.map((a) => (
              <div key={a.id} className="am-hit" onClick={() => openItem(a.id)}>
                <div className="am-art-t" style={{ fontSize: 12 }}>{a.title || a.url}</div>
                {a.excerpt && <div className="am-hit-s">{a.excerpt.slice(0, 120)}…</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div>
          <div className="am-sec"><i className="am-bar" />「{result.q}」<span className="am-hint">命中 {result.hits.length} / 语料 {result.total} 篇</span></div>
          {result.hits.length === 0 ? (
            <div className="am-empty">没有命中。<br />换个说法，或确认这篇真的封存过（检索只覆盖封存正文）。</div>
          ) : (
            <div className="am-card" style={{ padding: 0 }}>
              {result.hits.map((h, i) => (
                <div key={h.id} className="am-hit" onClick={() => openItem(h.id)}>
                  <div className="am-art-t" style={{ fontSize: 12 }}>{i + 1}. {h.title || h.id}</div>
                  <div className="am-hit-s">{h.snippet}</div>
                  <div className="am-art-m">
                    <span>{h.host}</span>
                    <span>· 相关度 {h.score}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!result && !searching && localHits.length === 0 && (
        <div className="am-empty">
          检索覆盖**封存正文的全部文字**（不只是标题）。<br />
          也可以在聊天里问 AI：「我收藏的内容里有没有讲 XX 的？」（amber_search）
        </div>
      )}
    </div>
  )
}
