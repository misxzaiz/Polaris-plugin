// 面板外壳：搜索 + 分类侧栏 + 收藏（kv 持久化，只存工具 id 不存任何输入）
import { useEffect, useMemo, useState } from 'react'
import { KV_FAVS, KV_LAST, kvGet, kvSet } from './model'
import { CATEGORIES, TOOLS, findTool, searchTools, type ToolMeta } from './tools'

export default function DevToolboxPanel() {
  const [toolId, setToolId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [favs, setFavs] = useState<string[]>([])
  const [kvFailed, setKvFailed] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([kvGet<string[]>(KV_FAVS), kvGet<string>(KV_LAST)])
      .then(([f, l]) => {
        if (!alive) return
        if (Array.isArray(f)) setFavs(f.filter((x) => typeof x === 'string'))
        if (typeof l === 'string' && findTool(l)) setToolId(l)
      })
      .catch(() => {
        if (alive) setKvFailed(true) // kv 不可用只影响记忆功能，不阻塞工具本身
      })
    return () => {
      alive = false
    }
  }, [])

  const select = (id: string) => {
    setToolId(id)
    if (!kvFailed) kvSet(KV_LAST, id).catch(() => setKvFailed(true))
  }

  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]
    setFavs(next)
    if (!kvFailed) kvSet(KV_FAVS, next).catch(() => setKvFailed(true))
  }

  const results = useMemo(() => searchTools(query), [query])
  const active: ToolMeta = (toolId ? findTool(toolId) : null) ?? TOOLS[0]
  const favTools = favs.map(findTool).filter((t): t is ToolMeta => !!t)
  const searching = query.trim() !== ''

  const renderToolButton = (t: ToolMeta) => (
    <button
      key={t.id}
      className={`dtb-toolbtn${t.id === active.id ? ' dtb-toolbtn-on' : ''}`}
      onClick={() => select(t.id)}
      title={t.desc}
    >
      <span className="dtb-toolicon">{t.icon}</span>
      <span className="dtb-toolname">{t.name}</span>
      <span
        className={`dtb-star${favs.includes(t.id) ? ' dtb-star-on' : ''}`}
        title={favs.includes(t.id) ? '取消收藏' : '收藏'}
        onClick={(e) => {
          e.stopPropagation()
          toggleFav(t.id)
        }}
      >
        {favs.includes(t.id) ? '★' : '☆'}
      </span>
    </button>
  )

  const Active = active.component

  return (
    <div className="dtb-root">
      <aside className="dtb-side">
        <input
          className="dtb-search"
          value={query}
          placeholder="搜索工具（如 jwt、哈希、cron…）"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="dtb-toollist">
          {!searching && favTools.length > 0 ? (
            <div className="dtb-cat">
              <div className="dtb-catlabel">★ 收藏</div>
              {favTools.map(renderToolButton)}
            </div>
          ) : null}
          {CATEGORIES.map((cat) => {
            const list = results.filter((t) => t.category === cat.id)
            if (list.length === 0) return null
            return (
              <div className="dtb-cat" key={cat.id}>
                <div className="dtb-catlabel">{cat.label}</div>
                {list.map(renderToolButton)}
              </div>
            )
          })}
          {results.length === 0 ? <div className="dtb-dim dtb-pad8">没有匹配「{query}」的工具</div> : null}
        </div>
        <div className="dtb-sidefoot">
          {TOOLS.length} 个工具 · 全部本地计算
          {kvFailed ? <span className="dtb-dim">（状态记忆不可用）</span> : null}
        </div>
      </aside>
      <main className="dtb-main">
        <header className="dtb-head">
          <span className="dtb-headicon">{active.icon}</span>
          <div>
            <h2 className="dtb-headtitle">{active.name}</h2>
            <div className="dtb-headdesc">{active.desc}</div>
          </div>
        </header>
        <div className="dtb-body">
          <Active />
        </div>
        <footer className="dtb-foot">
          隐私：所有计算在本地完成，工具输入不写入任何存储；「发到会话」会把显式选择的结果发送到当前 AI 会话。
        </footer>
      </main>
    </div>
  )
}
