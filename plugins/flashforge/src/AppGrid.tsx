/**
 * 应用架：搜索 + 类型筛选 + 卡片网格（跨端同一 ff.apps 索引）。
 * 「新造好」= pushedAt 在 48h 内（AI ff_push 后手机端一眼可见）。
 */
import { useMemo, useState } from 'react'
import type { AppEntry } from './model'

const KIND_ICONS: Record<string, string> = { game: '🎮', tool: '🛠️', teach: '🎓' }
const KIND_LABELS: Record<string, string> = { game: '游戏', tool: '工具', teach: '教具' }
const NEW_MS = 48 * 3600 * 1000

function fmtTime(ts: number) {
  if (!ts) return '-'
  const d = new Date(ts)
  const now = Date.now()
  const diff = now - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 24 * 3600_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtSize(n: number) {
  return n >= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`
}

export function AppGrid(props: {
  apps: AppEntry[]
  bestScores: Record<string, number | null>
  onOpen: (id: string) => void
  onQuickPrompt: (text: string) => void
}) {
  const { apps, bestScores, onOpen, onQuickPrompt } = props
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | 'game' | 'tool' | 'teach'>('all')

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return apps.filter((a) => {
      if (kind !== 'all' && a.kind !== kind) return false
      if (!kw) return true
      return a.title.toLowerCase().includes(kw) || a.tags.some((t) => t.toLowerCase().includes(kw))
    })
  }, [apps, q, kind])

  const isNew = (a: AppEntry) => !!a.pushedAt && Date.now() - a.pushedAt < NEW_MS

  return (
    <div className="ff-grid-wrap">
      {apps.length === 0 ? (
        <div className="ff-empty">
          <div className="ff-empty-icon">⚒️</div>
          <div className="ff-empty-title">应用架还是空的</div>
          <div className="ff-empty-sub">在聊天里对 AI 说一句话，它就会现场造一个能玩的小应用放进这里。</div>
          <div className="ff-empty-prompts">
            {[
              '帮我造一个霓虹贪吃蛇游戏，要能记分',
              '做个番茄钟小工具，25 分钟一轮带提示音',
              '造一个乘法口诀练习教具，答对加分',
            ].map((p) => (
              <button key={p} type="button" className="ff-btn ff-btn-ghost ff-prompt" onClick={() => onQuickPrompt(p)}>
                「{p}」
              </button>
            ))}
          </div>
          <div className="ff-empty-sub">造好后面板与手机端立即可玩，版本可回退，家人同玩一张高分榜。</div>
        </div>
      ) : (
        <>
          <div className="ff-toolbar">
            <input
              className="ff-search"
              placeholder="搜索应用/标签…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="ff-kinds">
              {(['all', 'game', 'tool', 'teach'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`ff-chip${kind === k ? ' ff-chip-on' : ''}`}
                  onClick={() => setKind(k)}
                >
                  {k === 'all' ? '全部' : KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="ff-grid">
            {list.map((a) => {
              const best = bestScores[a.id]
              return (
                <button type="button" key={a.id} className="ff-card" onClick={() => onOpen(a.id)}>
                  <div className="ff-card-top">
                    <span className="ff-card-icon">{KIND_ICONS[a.kind] || '📦'}</span>
                    {isNew(a) && <span className="ff-badge-new">新造好</span>}
                  </div>
                  <div className="ff-card-title">{a.title}</div>
                  <div className="ff-card-meta">
                    {KIND_LABELS[a.kind]} · v{a.head}（{a.versions.length}版） · {fmtSize(a.size)}
                  </div>
                  <div className="ff-card-meta ff-card-dim">
                    更新 {fmtTime(a.updatedAt)}
                    {best !== undefined && best !== null ? ` · 🏆 ${best}` : ''}
                  </div>
                  {a.tags.length > 0 && (
                    <div className="ff-card-tags">{a.tags.map((t) => <span key={t} className="ff-tag">{t}</span>)}</div>
                  )}
                </button>
              )
            })}
            {list.length === 0 && <div className="ff-nomatch">没有匹配的应用。</div>}
          </div>
        </>
      )}
    </div>
  )
}
