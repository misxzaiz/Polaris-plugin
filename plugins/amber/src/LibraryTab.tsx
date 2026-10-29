/**
 * 收藏 Tab：封存输入（URL+标签）→ 服务封存 → 条目流 → 阅读视图。
 * 阅读视图支持「选中正文 → 存金句摘录」「重封存更新快照」「删除」。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  sealUrl, reSeal, markItem, readBody, addQuote, deleteItem,
  timeAgo, timeStr, hostOf,
  type AmberBody, type AmberData, type AmberItem,
} from './model'

const PAGE_SIZE = 60

type StatusFilter = '' | 'unread' | 'starred' | 'pending' | 'error'

export default function LibraryTab({ data, reload, showToast, onSendToChat, selectedId, onConsumeSelected }: {
  data: AmberData | null
  reload: () => Promise<unknown>
  showToast: (msg: string, bad?: boolean) => void
  onSendToChat?: (message: string) => void | Promise<void>
  selectedId: string
  onConsumeSelected: () => void
}) {
  const [url, setUrl] = useState('')
  const [tags, setTags] = useState('')
  const [sealing, setSealing] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [tagFilter, setTagFilter] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [readingId, setReadingId] = useState('')
  const [body, setBody] = useState<AmberBody | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [hasSelection, setHasSelection] = useState(false)

  // 跨 Tab 跳转（检索/摘录 → 阅读）
  useEffect(() => {
    if (selectedId) {
      setReadingId(selectedId)
      onConsumeSelected()
    }
  }, [selectedId, onConsumeSelected])

  const item = useMemo(
    () => data?.items.find((x) => x.id === readingId) ?? null,
    [data?.items, readingId],
  )

  // 正文按需读：条目 rev 变化（封存完成/重试）后重读
  useEffect(() => {
    let alive = true
    setBody(null)
    if (!readingId || !item || item.status !== 'ok') return
    readBody(readingId).then((b) => { if (alive) setBody(b) }).catch(() => { /* 正文读失败保持空态 */ })
    return () => { alive = false }
  }, [readingId, item?.rev, item?.status])

  // 打开阅读即标已读
  useEffect(() => {
    if (item && !item.read) {
      markItem(item, { read: true }).then(reload).catch(() => { /* 条目可能已被清理 */ })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingId])

  // 选区检测（阅读视图内）
  useEffect(() => {
    if (!readingId) return
    const onUp = () => {
      const sel = window.getSelection()
      setHasSelection(!!sel && !sel.isCollapsed && !!contentRef.current && sel.anchorNode !== null && contentRef.current.contains(sel.anchorNode))
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchend', onUp)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchend', onUp)
    }
  }, [readingId])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const it of data?.items ?? []) for (const t of it.tags || []) s.add(t)
    return [...s].sort()
  }, [data?.items])

  const list = useMemo(() => {
    let arr = data?.items ?? []
    if (statusFilter === 'unread') arr = arr.filter((a) => !a.read)
    else if (statusFilter === 'starred') arr = arr.filter((a) => a.star)
    else if (statusFilter === 'pending') arr = arr.filter((a) => a.status === 'pending')
    else if (statusFilter === 'error') arr = arr.filter((a) => a.status === 'error')
    if (tagFilter) arr = arr.filter((a) => (a.tags || []).includes(tagFilter))
    const q = query.trim().toLowerCase()
    if (q) arr = arr.filter((a) => `${a.title}|${a.excerpt}|${a.url}`.toLowerCase().includes(q))
    return arr.slice(0, limit)
  }, [data?.items, statusFilter, tagFilter, query, limit])

  const doSeal = async () => {
    if (!url.trim() || sealing) return
    setSealing(true)
    try {
      await sealUrl(url, tags)
      await reload()
      showToast('已下发封存命令，稍候入列')
      setUrl('')
      setTags('')
    } catch (e) {
      showToast(`封存失败：${(e as Error).message}`, true)
    }
    setSealing(false)
  }

  const toggle = async (a: AmberItem, patch: { read?: boolean; star?: boolean; tags?: string[] }) => {
    try {
      await markItem(a, patch)
      await reload()
    } catch (e) {
      showToast(`操作失败：${(e as Error).message}`, true)
    }
  }

  const removeTag = async (a: AmberItem, tag: string) => {
    await toggle(a, { tags: (a.tags || []).filter((t) => t !== tag) })
  }

  const doReSeal = async (a: AmberItem) => {
    try {
      await reSeal(a.id)
      showToast('已下发重封存命令（快照将更新）')
      await reload()
    } catch (e) {
      showToast(`操作失败：${(e as Error).message}`, true)
    }
  }

  const doDelete = async (a: AmberItem) => {
    if (!window.confirm(`删除这条网页封存？「${a.title || a.url}」\n封存正文与相关摘录会一并删除，不可恢复。`)) return
    try {
      await deleteItem(a.id)
      setReadingId('')
      await reload()
      showToast('已删除')
    } catch (e) {
      showToast(`删除失败：${(e as Error).message}`, true)
    }
  }

  const doQuote = async (a: AmberItem) => {
    const sel = window.getSelection()
    const text = sel ? sel.toString().trim() : ''
    if (!text) { showToast('先在正文里选中一段文字', true); return }
    const note = window.prompt('备注（可选，可留空）：', '') ?? ''
    try {
      const added = await addQuote(a, a.id, text, note)
      await reload()
      showToast(added ? '已存为金句摘录' : '这段话之前已摘录过（内容级去重）')
    } catch (e) {
      showToast(`摘录失败：${(e as Error).message}`, true)
    }
  }

  const sendToChat = async (a: AmberItem) => {
    if (!onSendToChat) { showToast('当前宿主不支持发送到聊天', true); return }
    const parts = [`请读这篇我封存的文章并给我要点总结：${a.title || '(无标题)'}`, a.url]
    if (body?.ok && body.text) parts.push(`\n封存正文节选：\n${body.text.slice(0, 3000)}`)
    await onSendToChat(parts.join('\n'))
    showToast('已发送到聊天')
  }

  // ── 阅读视图 ──
  if (readingId) {
    if (!item) {
      return (
        <div>
          <div className="am-read-h">
            <button className="am-btn sm ghost" onClick={() => setReadingId('')}>← 返回</button>
          </div>
          <div className="am-empty">这条网页封存已被删除或不存在。</div>
        </div>
      )
    }
    const a = item
    return (
      <div>
        <div className="am-read-h">
          <button className="am-btn sm ghost" onClick={() => { setReadingId(''); setBody(null) }}>← 返回</button>
          <div style={{ flex: 1 }} />
          <button className={`am-btn sm ${a.star ? 'star' : 'ghost'}`} onClick={() => toggle(a, { star: !a.star })}>{a.star ? '★ 已星标' : '☆ 星标'}</button>
          <button className="am-btn sm ghost" onClick={() => toggle(a, { read: false })}>标为未读</button>
          <button className="am-btn sm ghost" onClick={() => doReSeal(a)}>↻ 重封存</button>
          <button className="am-btn sm danger" onClick={() => doDelete(a)}>删除</button>
        </div>
        <div className="am-read-t">{a.title || '(无标题)'}</div>
        <div className="am-read-m">
          <span>{a.host || hostOf(a.url)}</span>
          {a.byline && <span>· {a.byline}</span>}
          {!!a.publishedAt && <span>· 发布于 {timeStr(a.publishedAt)}</span>}
          <span>· 第 {a.sealCount || 1} 次封存 {timeStr(a.sealedAt || a.createdAt)}{a.firstSealedAt && a.sealCount > 1 ? `（首封 ${timeStr(a.firstSealedAt)}）` : ''}</span>
          {!!a.wordCount && <span>· {a.wordCount} 字</span>}
          {body?.ok && body.charset && body.charset !== 'utf-8' && <span>· {body.charset}</span>}
          <a className="am-read-l" style={{ margin: 0, padding: 0 }} href={a.url} target="_blank" rel="noreferrer">原文链接 ↗</a>
        </div>
        {!!a.tags?.length && (
          <div className="am-read-m">
            {a.tags.map((t) => (
              <button key={t} className="am-tag" style={{ cursor: 'pointer' }} title="移除标签" onClick={() => removeTag(a, t)}>{t} ✕</button>
            ))}
          </div>
        )}
        {a.status === 'pending' && (
          <div className="am-read-c"><span className="am-spin" /> 正在封存快照…（服务抓取并抽取中，约 5–25 秒）</div>
        )}
        {a.status === 'error' && (
          <div>
            <div className="am-err">封存失败：{a.error || '未知错误'}</div>
            <div className="am-actions" style={{ padding: '0 16px' }}>
              <button className="am-btn sm" onClick={() => doReSeal(a)}>重试封存</button>
            </div>
          </div>
        )}
        {a.status === 'ok' && (body?.ok
          ? <div className="am-read-c" ref={contentRef}>{body.text}</div>
          : <div className="am-read-c"><span className="am-spin" /> 正在读取快照…</div>)}
        {a.status === 'ok' && body?.ok && (
          <div className="am-actions" style={{ padding: '0 16px' }}>
            <button className="am-btn sm amber" disabled={!hasSelection} onClick={() => doQuote(a)}>✂ 摘录选中文字</button>
            <button className="am-btn sm ghost" onClick={() => sendToChat(a)}>发给 AI 总结</button>
          </div>
        )}
        {(data?.quotes ?? []).filter((q) => q.itemId === a.id).length > 0 && (
          <div style={{ padding: '4px 0' }}>
            <div className="am-sec"><i className="am-bar" />本条摘录</div>
            {(data?.quotes ?? []).filter((q) => q.itemId === a.id).map((q) => (
              <div key={q.qid} className="am-quote-b">
                「{q.text}」
                {q.note && <div style={{ color: '#8B95A7', marginTop: 4 }}>—— {q.note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── 列表视图 ──
  const total = data?.items.length ?? 0
  const pendingCount = data?.items.filter((a) => a.status === 'pending').length ?? 0
  return (
    <div>
      <div className="am-sec"><i className="am-bar" />封存一个网页<span className="am-hint">抓取由后台服务原生执行（无跨域）</span></div>
      <div className="am-card">
        <div className="am-card-b" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input className="am-inp" style={{ flex: 3, minWidth: 160 }} placeholder="粘贴 URL，如 https://example.com/post/1…"
            value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doSeal() }} />
          <input className="am-inp" style={{ flex: 1, minWidth: 90 }} placeholder="标签（可选）"
            value={tags} onChange={(e) => setTags(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doSeal() }} />
          <button className="am-btn amber" disabled={sealing || !url.trim()} onClick={doSeal}>
            {sealing ? <span className="am-spin" /> : '封存'}
          </button>
        </div>
      </div>

      <div className="am-sec"><i className="am-bar" />收藏<span className="am-hint">共 {total}{pendingCount ? ` · ${pendingCount} 条封存中` : ''}</span></div>
      <div className="am-card">
        <div className="am-card-b" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="am-inp" style={{ flex: 2, minWidth: 120 }} placeholder="搜标题/摘要/URL…" value={query}
            onChange={(e) => { setQuery(e.target.value); setLimit(PAGE_SIZE) }} />
          <select className="am-sel" style={{ flex: 1, minWidth: 88 }} value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setLimit(PAGE_SIZE) }}>
            <option value="">全部</option>
            <option value="unread">未读</option>
            <option value="starred">星标</option>
            <option value="pending">封存中</option>
            <option value="error">失败</option>
          </select>
          <select className="am-sel" style={{ flex: 1, minWidth: 88 }} value={tagFilter}
            onChange={(e) => { setTagFilter(e.target.value); setLimit(PAGE_SIZE) }}>
            <option value="">全部标签</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="am-empty">
          {total === 0
            ? <>还没有收藏。<br />在上面贴一个 URL 点「封存」，或在聊天里对 AI 说<br />「把 https://… 存进网页封存」。</>
            : <>当前过滤下没有条目。</>}
        </div>
      ) : (
        <div className="am-card" style={{ padding: 0 }}>
          {list.map((a) => (
            <div key={a.id} className={`am-art ${a.read ? 'read' : ''}`} onClick={() => setReadingId(a.id)}>
              <i className={`am-unread ${a.read ? 'off' : ''}`} />
              <div className="am-art-main">
                <div className="am-art-t">
                  {a.status === 'pending' && <span className="am-spin" style={{ marginRight: 5 }} />}
                  {a.status === 'error' && <span style={{ color: '#F85149', marginRight: 5 }}>⚠</span>}
                  {a.title || a.url}
                </div>
                {a.excerpt && <div className="am-art-x">{a.excerpt}</div>}
                <div className="am-art-m">
                  <span>{a.host || hostOf(a.url)}</span>
                  <span>·</span>
                  <span>{timeAgo(a.sealedAt || a.createdAt)}</span>
                  {!!a.wordCount && <span>· {a.wordCount} 字</span>}
                  {(a.tags || []).slice(0, 3).map((t) => <span key={t} className="am-tag">{t}</span>)}
                  {a.star && <span>· ★</span>}
                </div>
              </div>
              <button className={`am-star ${a.star ? 'on' : ''}`} title="星标" onClick={(e) => { e.stopPropagation(); toggle(a, { star: !a.star }) }}>
                {a.star ? '★' : '☆'}
              </button>
            </div>
          ))}
          {total > list.length && (
            <div style={{ padding: '10px 0', textAlign: 'center' }}>
              <button className="am-btn sm ghost" onClick={() => setLimit(limit + PAGE_SIZE)}>加载更多（还有 {total - list.length} 条）</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
