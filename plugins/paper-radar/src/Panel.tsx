/**
 * 论文雷达面板外壳：头部（状态）+ 三 Tab（今日 / 收藏 / 主题）
 *
 * 数据源：cap.kv paper.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零外网请求；外网抓取由后台服务原生执行（跨域问题的根本解法）。
 * 轮询：可见时每 10s 拉一次榜单与心跳。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadTopics, loadSettings, loadMeta, loadRecentFeeds, loadFavs,
  addTopic, removeTopic, toggleTopic, saveSettings,
  favPaper, toggleFavRead, removeFav,
  kvGet, K, todayStr, fmtDate, timeAgo, DEFAULT_SETTINGS,
  type FeedDay, type Topic, type FavRow, type Paper, type Settings, type PaperMeta,
} from './model'

const css = `
.pr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.pr-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.pr-body{flex:1;overflow-y:auto;padding:0 0 24px}
.pr-body::-webkit-scrollbar{width:9px;height:9px}
.pr-body::-webkit-scrollbar-track{background:transparent}
.pr-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.pr-page{max-width:560px;margin:0 auto}

/* 头部 */
.pr-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.pr-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#B087F5,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.pr-tt{flex:1;min-width:0}
.pr-tt b{font-size:15px;display:block}
.pr-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.pr-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.pr-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.pr-dot.stale{background:#D29922}
.pr-dot.down{background:#F85149}
.pr-tabs{display:flex;gap:4px}
.pr-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer}
.pr-tab:hover{color:#E6EAF2}
.pr-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.pr-badge{position:absolute;top:0;right:2px;background:#B087F5;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.pr-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.pr-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#B087F5,#58A6FF);flex-shrink:0}
.pr-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.pr-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.pr-card-b{padding:11px 13px}
.pr-empty{color:#8B95A7;font-size:12px;padding:30px 18px;text-align:center;line-height:1.9}
.pr-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.pr-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.pr-toast.bad{border-color:#54262c;color:#FF8A9A}
.pr-spin{display:inline-block;width:11px;height:11px;border:2px solid #3d4657;border-top-color:#58A6FF;border-radius:50%;animation:pr-spin .8s linear infinite;vertical-align:-1px}
@keyframes pr-spin{to{transform:rotate(360deg)}}

/* 论文卡片 */
.pr-paper{border-bottom:1px solid #1d2330;padding:11px 13px}
.pr-paper:last-child{border-bottom:none}
.pr-paper-t{display:flex;gap:8px;align-items:baseline}
.pr-score{flex-shrink:0;font-size:9.5px;color:#B087F5;font-weight:700;border:1px solid #3a2f5c;border-radius:5px;padding:1px 5px}
.pr-paper h4{font-size:13px;margin:0 0 4px;font-weight:600;line-height:1.45}
.pr-paper h4 a{color:#D9E6FF;text-decoration:none}
.pr-paper h4 a:hover{text-decoration:underline}
.pr-a{font-size:10.5px;color:#8B95A7;margin-bottom:3px}
.pr-meta{font-size:10px;color:#5C6678;display:flex;gap:8px;flex-wrap:wrap;margin-bottom:5px}
.pr-verdict{font-size:11px;color:#9FB3D9;line-height:1.55;margin-bottom:6px}
.pr-actions{display:flex;gap:6px;align-items:center}
.pr-btn{background:#3a3055;border:none;color:#C9C9FF;border-radius:7px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:600}
.pr-btn:hover{filter:brightness(1.15)}
.pr-btn:disabled{opacity:.45;cursor:not-allowed}
.pr-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.pr-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}

/* 主题设置 */
.pr-topic{display:flex;align-items:center;gap:10px;padding:9px 13px;border-bottom:1px solid #1d2330}
.pr-topic:last-child{border-bottom:none}
.pr-topic-l{flex:1;min-width:0}
.pr-topic-l b{font-size:12.5px;display:block}
.pr-topic-l small{font-size:10.5px;color:#8B95A7;display:block;line-height:1.5}
.pr-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.pr-toggle.on{background:#7a5cc8}
.pr-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.pr-toggle.on i{left:18px}
.pr-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.pr-inp:focus{outline:none;border-color:#7a5cc8}
.pr-inp::placeholder{color:#4d5566}
.pr-lbl{font-size:11px;color:#8B95A7;margin:10px 0 3px;display:block}
`

type Tab = 'today' | 'favs' | 'topics'

export default function PaperRadarPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('today')
  const [feeds, setFeeds] = useState<FeedDay[]>([])
  const [favRows, setFavRows] = useState<FavRow[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [meta, setMeta] = useState<PaperMeta | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const reload = useCallback(async () => {
    try {
      const [f, m, t, s] = await Promise.all([
        loadRecentFeeds(5),
        loadMeta(),
        loadTopics(),
        loadSettings(),
      ])
      setFeeds(f)
      setMeta(m)
      setTopics(t)
      setSettings(s)
      setLoadErr('')
    } catch (e) {
      setLoadErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    let alive = true
    const poll = async () => {
      if (document.visibilityState === 'hidden' || !alive) return
      await reload()
    }
    poll()
    const timer = setInterval(poll, 10000)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [reload])

  const reloadFavs = useCallback(async () => {
    try { setFavRows(await loadFavs()) } catch (_) { /* 静默 */ }
  }, [])

  useEffect(() => {
    reloadFavs()
  }, [reloadFavs, tab])

  // 心跳判定
  const heartbeat = (() => {
    if (!meta) return { cls: 'down', text: '服务未报告心跳' }
    const last = meta.lastTickAt
    if (!last) return { cls: 'down', text: '服务未报告心跳' }
    const age = Date.now() - last
    if (age < 3 * 3600 * 1000) return { cls: 'ok', text: `服务在线 · ${meta.status || 'ok'}${meta.date ? ` · ${meta.date}` : ''}` }
    return { cls: 'stale', text: `心跳停滞 ${Math.round(age / 3600000)} 小时` }
  })()

  return (
    <div className="pr-root">
      <style>{css}</style>
      <div className="pr-top">
        <div className="pr-logo">📚</div>
        <div className="pr-tt">
          <b>论文雷达</b>
          <small><i className={`pr-dot ${heartbeat.cls}`} />{heartbeat.text}</small>
        </div>
        <div className="pr-tabs">
          {([['today', '今日'], ['favs', '收藏'], ['topics', '主题']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`pr-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'favs' && favRows.length > 0 && (
                <span className="pr-badge">{favRows.length > 99 ? '99+' : favRows.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="pr-body">
        <div className="pr-page">
          {loadErr && <div className="pr-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}

          {tab === 'today' && <>
            {feeds.length === 0 && !loadErr && (
              <div className="pr-empty">
                今日榜单还没生成。<br />
                · 首次需要后台服务启动后跑一次扫描（设置 → 插件 → 论文雷达）<br />
                · 或对 AI 说「帮我搜今天的论文」，AI 会触发扫描<br />
                · 已配置主题后，每日自动生成榜单
              </div>
            )}
            {feeds.map((feed) => (
              <div key={feed.date}>
                <div className="pr-sec">
                  <span className="pr-bar" />
                  {feed.date === todayStr() ? '📌 今日值得读' : feed.date}
                  <span className="pr-hint">{feed.count} 篇 · {feed.generatedAt ? timeAgo(feed.generatedAt) : ''}</span>
                </div>
                <div className="pr-card">
                  {feed.items.map((p, i) => <PaperCard key={p.id} paper={p} rank={i + 1} />)}
                </div>
              </div>
            ))}
          </>}

          {tab === 'favs' && (
            favRows.length === 0
              ? <div className="pr-empty">还没有收藏。对 AI 说「收藏这篇论文 _id_」即可入库。</div>
              : <div className="pr-card">
                  {favRows.map((r) => (
                    <div key={r.fav.id} className="pr-paper">
                      <div className="pr-paper-t">
                        <h4><a href={`https://arxiv.org/abs/${r.fav.id}`} target="_blank" rel="noreferrer">{r.fav.id}</a></h4>
                        <span className="pr-score">{r.fav.read ? '已读' : '未读'}</span>
                      </div>
                      {r.fav.note && <div className="pr-verdict">📝 {r.fav.note}</div>}
                      <div className="pr-meta">收藏于 {fmtDate(r.fav.favoritedAt)}</div>
                      <div className="pr-actions">
                        <button className="pr-btn" onClick={() => toggleFavRead(r.fav.id, !r.fav.read).then(reloadFavs)}>
                          {r.fav.read ? '标未读' : '标已读'}
                        </button>
                        <button className="pr-btn ghost" onClick={() => window.open(`https://arxiv.org/abs/${r.fav.id}`, '_blank')}>打开</button>
                        <button className="pr-btn danger" onClick={() => removeFav(r.fav.id).then(reloadFavs)}>删除</button>
                      </div>
                    </div>
                  ))}
                </div>
          )}

          {tab === 'topics' && (
            <div>
              <div className="pr-sec"><span className="pr-bar" />关注主题<span className="pr-hint">关键词命中决定每日榜单</span></div>
              <div className="pr-card">
                {topics.length === 0 && <div className="pr-empty">还没有主题。添加一个，比如「多模态」「diffusion」。</div>}
                {topics.map((t) => (
                  <div key={t.id} className="pr-topic">
                    <div className="pr-topic-l">
                      <b>{t.name}</b>
                      <small>{t.keywords.join(' · ')}</small>
                    </div>
                    <button className={`pr-toggle ${t.enabled ? 'on' : ''}`} onClick={() => toggleTopic(t.id, !t.enabled)}><i /></button>
                    <button className="pr-btn danger" onClick={() => removeTopic(t.id).then(reload)}>✕</button>
                  </div>
                ))}
              </div>
              <AddTopicForm onAdded={() => { reload(); showToast('已添加主题，下次扫描生效') }} />
              <div className="pr-sec"><span className="pr-bar" />抓取设置</div>
              <div className="pr-card">
                <div className="pr-topic">
                  <div className="pr-topic-l"><b>每主题拉取</b><small>每个主题从 arXiv 拉取的最新论文数</small></div>
                  <input className="pr-inp" type="number" min={1} max={50} value={settings.perTopic}
                    onChange={(e) => setSettings({ ...settings, perTopic: Number(e.target.value) || 15 })} />
                </div>
                <div className="pr-topic">
                  <div className="pr-topic-l"><b>每日上榜</b><small>榜单保留的最值得读条数</small></div>
                  <input className="pr-inp" type="number" min={1} max={30} value={settings.dailyTop}
                    onChange={(e) => setSettings({ ...settings, dailyTop: Number(e.target.value) || 12 })} />
                </div>
                <div className="pr-topic">
                  <div className="pr-topic-l"><b>扫描间隔</b><small>每几小时扫描一次（小时）</small></div>
                  <input className="pr-inp" type="number" min={1} max={24} value={settings.scanIntervalHours}
                    onChange={(e) => setSettings({ ...settings, scanIntervalHours: Number(e.target.value) || 8 })} />
                </div>
                <div className="pr-topic">
                  <button className="pr-btn" style={{ marginLeft: 'auto' }} onClick={() => saveSettings(settings).then(() => showToast('设置已保存'))}>
                    保存设置
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && <div className={`pr-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

// ── 论文卡片 ─────────────────────────────────────────────────────────────────
function PaperCard({ paper, rank }: { paper: Paper; rank: number }) {
  const authors = (paper.authors || []).slice(0, 5).join(', ') + ((paper.authors || []).length > 5 ? ` 等${paper.authors.length}人` : '')
  const cats = (paper.categories || []).slice(0, 3).join(' ')
  const date = paper.published ? fmtDate(paper.published) : ''
  return (
    <div className="pr-paper">
      <span className="pr-score">#{rank} rel {paper.score || 0}</span>
      <h4><a href={paper.url} target="_blank" rel="noreferrer">{paper.title}</a></h4>
      <div className="pr-a">{authors || '未知'}</div>
      <div className="pr-meta">
        {date && <span>📅 {date}</span>}
        {cats && <span>🏷 {cats}</span>}
        {paper.topMatches?.length ? <span>🎯 {paper.topMatches.slice(0, 3).map((m) => m.word).join(' · ')}</span> : null}
      </div>
      {paper.verdict && <div className="pr-verdict">💡 {paper.verdict}</div>}
    </div>
  )
}

// ── 添加主题表单 ──────────────────────────────────────────────────────────────
function AddTopicForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [keywords, setKeywords] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    const kws = keywords.split(/[,，]/).map((k) => k.trim().toLowerCase()).filter(Boolean)
    if (!name.trim() || !kws.length) { setErr('请填写主题名和至少一个关键词'); return }
    setBusy(true); setErr('')
    try {
      await addTopic(name.trim(), kws)
      setName(''); setKeywords('')
      onAdded()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="pr-card pr-card-b">
      <label className="pr-lbl">添加主题</label>
      <input className="pr-inp" placeholder="名称，如 多模态模型" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="pr-lbl">关键词（逗号分隔）</label>
      <input className="pr-inp" placeholder="multimodal, vision language model" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      {err && <div className="pr-err">{err}</div>}
      <div style={{ marginTop: 8, textAlign: 'right' }}>
        <button className="pr-btn" disabled={busy} onClick={submit}>{busy ? '添加中…' : '＋ 添加'}</button>
      </div>
    </div>
  )
}