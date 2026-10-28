/**
 * 池子 Tab：快捕表单（面板直捕，同样自动匹配池中相关想法）+ 过滤检索 + 列表。
 * 捕获命中相关旧想法时给「去对话里盘一盘」入口（经宿主 onSendToChat）。
 */
import { useMemo, useState } from 'react'
import {
  captureIdea, searchIdeas, KINDS, MATURITIES, kindLabel, matLabel, fmtDueRelative,
  timeAgo, type Idea,
} from './model'

interface Props {
  ideas: Idea[]
  reload: () => Promise<Idea[]>
  showToast: (msg: string, kind?: 'bad' | 'good') => void
  onOpenIdea: (id: string) => void
  onSendToChat: (msg: string) => void | Promise<void>
}

type StatusFilter = 'active' | 'archived' | 'done'

export default function PondTab({ ideas, reload, showToast, onOpenIdea, onSendToChat }: Props) {
  const [title, setTitle] = useState('')
  const [raw, setRaw] = useState('')
  const [tagsInp, setTagsInp] = useState('')
  const [kind, setKind] = useState('idea')
  const [url, setUrl] = useState('')
  const [capBusy, setCapBusy] = useState(false)
  const [capResult, setCapResult] = useState<{ title: string; related: Idea[] } | null>(null)

  const [keyword, setKeyword] = useState('')
  const [tag, setTag] = useState('')
  const [kindF, setKindF] = useState('')
  const [statusF, setStatusF] = useState<StatusFilter>('active')

  const tagPool = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of ideas) for (const t of i.tags || []) m.set(t, (m.get(t) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t)
  }, [ideas])

  const found = useMemo(() => {
    const f: { keyword?: string; tag?: string; kind?: string; status?: string } = { status: statusF }
    if (keyword.trim()) f.keyword = keyword.trim()
    if (tag) f.tag = tag
    if (kindF) f.kind = kindF
    return searchIdeas(ideas, f).sort((a, b) => b.updatedAt - a.updatedAt)
  }, [ideas, keyword, tag, kindF, statusF])

  const doCapture = async () => {
    if (!title.trim() || capBusy) return
    setCapBusy(true)
    try {
      const tags = tagsInp.split(/[,，#]+/).map((s) => s.trim()).filter(Boolean).slice(0, 6)
      const res = await captureIdea({
        title: title.trim(), raw: raw.trim() || undefined, kind,
        tags: tags.length ? tags : undefined,
        url: url.trim() || undefined,
      })
      if (!res.ok || !res.idea) {
        showToast(res.error || '入池失败', 'bad')
        return
      }
      setCapResult({ title: res.idea.title, related: (res.related || []).map((r) => r.idea) })
      setTitle(''); setRaw(''); setTagsInp(''); setUrl('')
      showToast('已入池，3 天后首访')
      await reload()
    } finally {
      setCapBusy(false)
    }
  }

  return (
    <>
      <div className="lx-sec">
        <span className="lx-bar" />
        快捕入池
        <span className="lx-hint">一句话即可，别管格式</span>
      </div>
      <div className="lx-card">
        <div className="lx-card-b">
          <input
            className="lx-inp"
            placeholder="一句话概括这个念头（必填）"
            value={title}
            maxLength={60}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doCapture() }}
          />
          <textarea
            className="lx-inp lx-ta"
            style={{ marginTop: 8 }}
            placeholder="展开说说（可空）：它想解决什么？为什么现在想到？"
            value={raw}
            maxLength={2000}
            onChange={(e) => setRaw(e.target.value)}
          />
          <div className="lx-row" style={{ marginTop: 8 }}>
            <select className="lx-sel" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
            <input
              className="lx-inp"
              style={{ flex: 1, minWidth: 0 }}
              placeholder="标签（逗号分，决定星系归属）"
              value={tagsInp}
              onChange={(e) => setTagsInp(e.target.value)}
            />
          </div>
          <div className="lx-row" style={{ marginTop: 8 }}>
            <input
              className="lx-inp"
              style={{ flex: 1, minWidth: 0 }}
              placeholder="来源链接（可选，只存线索不做抓取）"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button className="lx-btn" disabled={capBusy || !title.trim()} onClick={doCapture}>入池</button>
          </div>
          {capResult && (
            <div style={{ marginTop: 10 }}>
              <div className="lx-sub">已入池「{capResult.title}」，3 天后回访见。</div>
              {capResult.related.length > 0 && (
                <div className="lx-card" style={{ margin: '8px 0 0' }}>
                  <div className="lx-card-b">
                    <div className="lx-sub" style={{ color: '#F0B47A' }}>⚠️ 池中已有相关想法（可能重复/可合并）：</div>
                    {capResult.related.map((r) => (
                      <div key={r.id} className="lx-relrow" onClick={() => onOpenIdea(r.id)}>
                        {matLabel(r.maturity)} · {r.title}
                      </div>
                    ))}
                    <div className="lx-editrow">
                      <button
                        className="lx-btn ghost sm"
                        onClick={() => onSendToChat(
                          `灵犀，我刚入池了「${capResult.title}」，池里说有几个相关旧想法，帮我一起盘一盘：它们是重复、可合并，还是该互相链接？`,
                        )}
                      >
                        去对话里盘一盘
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="lx-sec">
        <span className="lx-bar" />
        池中想法 {found.length}
        <span className="lx-hint">点开看时间线与动作</span>
      </div>
      <div className="lx-card">
        <div className="lx-card-b">
          <div className="lx-row">
            <input
              className="lx-inp"
              style={{ flex: 1, minWidth: 120 }}
              placeholder="搜关键词…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <select className="lx-sel" value={statusF} onChange={(e) => setStatusF(e.target.value as StatusFilter)}>
              <option value="active">在池</option>
              <option value="archived">归档</option>
              <option value="done">已落地</option>
            </select>
            <select className="lx-sel" value={kindF} onChange={(e) => setKindF(e.target.value)}>
              <option value="">全部类型</option>
              {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </div>
          {tagPool.length > 0 && (
            <div className="lx-row" style={{ marginTop: 8 }}>
              <span className={`lx-chip ${tag === '' ? 'on' : ''}`} onClick={() => setTag('')}>全部</span>
              {tagPool.map((t) => (
                <span key={t} className={`lx-chip ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? '' : t)}>#{t}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: '2px 13px 10px' }}>
          {found.length === 0 && <div className="lx-empty">没有符合条件的想法。</div>}
          {found.map((idea) => {
            const dueBadge = idea.status === 'active' && idea.revisit.dueAt > 0 && idea.revisit.dueAt <= Date.now()
            const dueTxt = idea.status === 'active' && idea.revisit.dueAt > 0
              ? ` · 回访${fmtDueRelative(idea.revisit.dueAt, Date.now())}`
              : ''
            return (
              <div className="lx-idea" key={idea.id} onClick={() => onOpenIdea(idea.id)}>
                <span
                  className="lx-dot"
                  style={{
                    background: idea.status === 'active'
                      ? '#8B7CF6'
                      : idea.status === 'done' ? '#7EE2A0' : '#3a4152',
                    opacity: idea.status === 'archived' ? 0.6 : 1,
                  }}
                />
                <div className="lx-idea-main">
                  <b>{idea.title}</b>
                  <small>
                    {kindLabel(idea.kind)}·{matLabel(idea.maturity)}
                    {(idea.tags || []).length ? ` · #${idea.tags.join(' #')}` : ''}
                    {dueTxt} · {timeAgo(idea.createdAt)}
                  </small>
                </div>
                {dueBadge && <span className="lx-badge over">到期</span>}
              </div>
            )
          })}
        </div>
      </div>
      <div className="lx-legend">
        {MATURITIES.map((m) => <span key={m.key}>{m.label}：{m.desc}</span>)}
      </div>
    </>
  )
}
