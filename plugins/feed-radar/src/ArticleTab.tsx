/**
 * 文章 Tab：未读流（源/关键词过滤）+ 阅读视图（正文由服务抓取抽取）+ 星标/已读 + 发给 AI
 */
import { useMemo, useState } from 'react'
import {
  markArticle, pullContent, timeStr, timeAgo, hostOf,
  type RadarArticle, type RadarContent, type RadarData,
} from './model'

const PAGE_SIZE = 80

export default function ArticleTab({ data, reload, showToast, onSendToChat }: {
  data: RadarData | null
  reload: () => Promise<unknown>
  showToast: (msg: string, bad?: boolean) => void
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [feedFilter, setFeedFilter] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(true)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [reading, setReading] = useState<RadarArticle | null>(null)
  const [content, setContent] = useState<RadarContent | null>(null)
  const [pulling, setPulling] = useState(false)

  const feedName = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of data?.feeds ?? []) m.set(f.id, f.title || hostOf(f.url) || f.id)
    return m
  }, [data?.feeds])

  const list = useMemo(() => {
    let arr = data?.articles ?? []
    if (unreadOnly) arr = arr.filter((a) => !a.read)
    if (feedFilter) arr = arr.filter((a) => a.feedId === feedFilter)
    const q = query.trim().toLowerCase()
    if (q) arr = arr.filter((a) => (a.title || '').toLowerCase().includes(q) || (a.excerpt || '').toLowerCase().includes(q))
    return arr.slice(0, limit)
  }, [data?.articles, unreadOnly, feedFilter, query, limit])

  const openArticle = async (a: RadarArticle) => {
    setReading(a)
    setContent(null)
    setPulling(false)
    if (!a.read) {
      try { await markArticle(a, { read: true }); await reload() } catch { /* 文章可能已被清理 */ }
    }
  }

  const pull = async (a: RadarArticle) => {
    setPulling(true)
    setContent(null)
    try {
      const c = await pullContent(a.id)
      if (c) setContent(c)
      else showToast('正文抓取超时（服务可能未运行）', true)
    } catch (e) {
      showToast(`正文抓取失败：${(e as Error).message}`, true)
    }
    setPulling(false)
  }

  const toggle = async (a: RadarArticle, patch: { read?: boolean; star?: boolean }) => {
    try {
      await markArticle(a, patch)
      await reload()
      if (reading?.id === a.id) setReading({ ...a, ...patch } as RadarArticle)
    } catch (e) {
      showToast(`操作失败：${(e as Error).message}`, true)
    }
  }

  const sendToChat = async (a: RadarArticle) => {
    if (!onSendToChat) { showToast('当前宿主不支持发送到聊天', true); return }
    const parts = [`请读这篇文章并给我要点总结：${a.title || '(无标题)'}`]
    if (a.link) parts.push(a.link)
    if (content?.ok && content.text) parts.push(`\n正文节选：\n${content.text.slice(0, 3000)}`)
    await onSendToChat(parts.join('\n'))
    showToast('已发送到聊天')
  }

  // ── 阅读视图 ──
  if (reading) {
    const a = reading
    return (
      <div>
        <div className="fr-read-h">
          <button className="fr-btn sm ghost" onClick={() => { setReading(null); setContent(null) }}>← 返回</button>
          <div style={{ flex: 1 }} />
          <button className={`fr-btn sm ${a.star ? 'star' : 'ghost'}`} onClick={() => toggle(a, { star: !a.star })}>{a.star ? '★ 已收藏' : '☆ 收藏'}</button>
          <button className="fr-btn sm ghost" onClick={() => toggle(a, { read: false })}>标为未读</button>
          <button className="fr-btn sm" onClick={() => sendToChat(a)}>发给 AI</button>
        </div>
        <div className="fr-read-t">{a.title || '(无标题)'}</div>
        <div className="fr-read-m">
          <span>{feedName.get(a.feedId) || a.feedId}</span>
          <span>·</span>
          <span>{a.publishedAt ? timeStr(a.publishedAt) : ''}</span>
          {a.link && <a className="fr-read-l" style={{ margin: 0, padding: 0 }} href={a.link} target="_blank" rel="noreferrer">原文链接 ↗</a>}
        </div>
        {(a.excerpt || !content) && (
          <div className="fr-read-c" style={{ color: '#8B95A7', fontStyle: a.excerpt ? 'normal' : 'italic' }}>
            {a.excerpt || (pulling ? '正在抓取正文…' : '暂无摘要，点下方按钮抓取正文')}
          </div>
        )}
        {pulling && <div className="fr-read-c"><span className="fr-spin" /> 服务正在抓取原文并抽取主干…（最长约 25 秒）</div>}
        {content && (content.ok
          ? <div className="fr-read-c">{content.text}</div>
          : <div className="fr-err">正文抓取失败：{content.error || '未知错误'}</div>)}
        {!content && !pulling && (
          <div className="fr-actions" style={{ padding: '0 16px' }}>
            <button className="fr-btn sm" onClick={() => pull(a)}>抓取正文</button>
          </div>
        )}
        {content?.ok && (
          <div className="fr-actions" style={{ padding: '0 16px' }}>
            <button className="fr-btn sm ghost" onClick={() => sendToChat(a)}>把正文发给 AI 总结</button>
          </div>
        )}
      </div>
    )
  }

  // ── 列表视图 ──
  const total = data?.articles.length ?? 0
  const shownUnread = list.filter((a) => !a.read).length
  return (
    <div>
      <div className="fr-sec"><i className="fr-bar" />文章流<span className="fr-hint">未读 {data?.unreadTotal ?? 0} / 共 {total}</span></div>
      <div className="fr-card">
        <div className="fr-card-b" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="fr-inp" style={{ flex: 2, minWidth: 120 }} placeholder="搜标题/摘要…" value={query}
            onChange={(e) => { setQuery(e.target.value); setLimit(PAGE_SIZE) }} />
          <select className="fr-sel" style={{ flex: 1, minWidth: 100 }} value={feedFilter}
            onChange={(e) => { setFeedFilter(e.target.value); setLimit(PAGE_SIZE) }}>
            <option value="">全部来源</option>
            {(data?.feeds ?? []).map((f) => (
              <option key={f.id} value={f.id}>{f.title || hostOf(f.url)}</option>
            ))}
          </select>
          <button className={`fr-btn sm ${unreadOnly ? '' : 'ghost'}`} onClick={() => { setUnreadOnly(!unreadOnly); setLimit(PAGE_SIZE) }}>
            {unreadOnly ? '只看未读' : '全部'}
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="fr-empty">
          {total === 0
            ? <>还没有文章。<br />先到「订阅源」添加一个 RSS/Atom 地址，<br />服务会在下个周期（或点「立即刷新」）抓取入库。</>
            : unreadOnly ? <>当前过滤下没有未读文章。<br />切到「全部」可查看已读内容。</> : <>没有匹配的文章。</>}
        </div>
      ) : (
        <div className="fr-card" style={{ padding: 0 }}>
          {list.map((a) => (
            <div key={a.id} className={`fr-art ${a.read ? 'read' : ''}`} onClick={() => openArticle(a)}>
              <i className={`fr-unread ${a.read ? 'off' : ''}`} />
              <div className="fr-art-main">
                <div className="fr-art-t">{a.title || '(无标题)'}</div>
                {a.excerpt && <div className="fr-art-x">{a.excerpt}</div>}
                <div className="fr-art-m">
                  <span>{feedName.get(a.feedId) || a.feedId}</span>
                  <span>·</span>
                  <span>{timeAgo(a.publishedAt || a.createdAt)}</span>
                  {a.star && <span>· ★</span>}
                </div>
              </div>
              <button className={`fr-star ${a.star ? 'on' : ''}`} title="收藏" onClick={(e) => { e.stopPropagation(); toggle(a, { star: !a.star }) }}>
                {a.star ? '★' : '☆'}
              </button>
            </div>
          ))}
          {total > list.length && (
            <div style={{ padding: '10px 0', textAlign: 'center' }}>
              <button className="fr-btn sm ghost" onClick={() => setLimit(limit + PAGE_SIZE)}>加载更多（还有 {total - list.length} 条）</button>
            </div>
          )}
        </div>
      )}
      {list.length > 0 && unreadOnly && shownUnread > 0 && (
        <div className="fr-actions" style={{ padding: '0 18px' }}>
          <button className="fr-btn sm ghost" onClick={async () => {
            for (const a of list) { if (!a.read) { try { await markArticle(a, { read: true }) } catch { /* 忽略单条失败 */ } } }
            await reload(); showToast('本页已全部标为已读')
          }}>本页全部标为已读</button>
        </div>
      )}
    </div>
  )
}
