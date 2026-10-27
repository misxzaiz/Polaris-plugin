/**
 * 订阅源 Tab：加源（幂等）/ 源卡片（状态/启停/刷新/删除）/ OPML 导入导出
 */
import { useRef, useState } from 'react'
import {
  addFeed, saveFeedFields, removeFeed, refreshAll, refreshFeed,
  importOpml, parseOpml, buildOpml, timeAgo, hostOf,
  type RadarData,
} from './model'

export default function FeedsTab({ data, reload, showToast, goArticles }: {
  data: RadarData | null
  reload: () => Promise<unknown>
  showToast: (msg: string, bad?: boolean) => void
  goArticles: () => void
}) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState('')
  const [opmlOpen, setOpmlOpen] = useState(false)
  const [opmlText, setOpmlText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const feeds = [...(data?.feeds ?? [])].sort((a, b) =>
    (a.category || '未分类').localeCompare(b.category || '未分类') || a.title.localeCompare(b.title))

  const add = async () => {
    const u = url.trim()
    if (!/^https?:\/\//i.test(u)) { showToast('请输入公网 http(s) 的 RSS/Atom 地址', true); return }
    setBusy('add')
    try {
      const fid = await addFeed(u, { title: title.trim(), category: category.trim() })
      await refreshFeed(fid)
      setUrl(''); setTitle(''); setCategory('')
      await reload()
      showToast('已添加，正在抓取首期…')
    } catch (e) {
      showToast(`添加失败：${(e as Error).message}`, true)
    }
    setBusy('')
  }

  const doRefresh = async (fid?: string) => {
    setBusy(fid || 'all')
    try {
      if (fid) await refreshFeed(fid); else await refreshAll()
      showToast(fid ? '已触发该源立即刷新' : '已触发全部源立即刷新')
    } catch (e) {
      showToast(`刷新失败：${(e as Error).message}`, true)
    }
    setBusy('')
  }

  const toggleEnabled = async (fid: string, enabled: boolean) => {
    try { await saveFeedFields(fid, { enabled }); await reload() } catch (e) {
      showToast(`操作失败：${(e as Error).message}`, true)
    }
  }

  const forget = async (fid: string, name: string) => {
    if (!window.confirm(`删除订阅源「${name}」？其全部文章与星标都会一并删除，不可恢复。`)) return
    setBusy(fid)
    try {
      const n = await removeFeed(fid)
      await reload()
      showToast(`已删除（含 ${n} 篇文章）`)
    } catch (e) {
      showToast(`删除失败：${(e as Error).message}`, true)
    }
    setBusy('')
  }

  const onFile = async (file: File) => {
    const text = await file.text()
    const pre = parseOpml(text)
    if (pre.error) { showToast(pre.error, true); return }
    if (!window.confirm(`解析到 ${pre.found} 个订阅源，确认导入？`)) return
    setBusy('opml')
    try {
      const r = await importOpml(text)
      await refreshAll()
      await reload()
      showToast(`导入 ${r.ok} 个源（跳过 ${r.skip}），${r.categories} 个分组；已触发刷新`)
    } catch (e) {
      showToast(`导入失败：${(e as Error).message}`, true)
    }
    setBusy('')
  }

  const exportOpml = () => {
    const text = buildOpml(feeds.map((f) => ({ title: f.title, url: f.url, category: f.category })))
    setOpmlText(text)
    setOpmlOpen(true)
    try {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/xml' }))
      a.download = 'feed-radar.opml'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { /* 下载失败时文本框仍可手动复制 */ }
  }

  return (
    <div>
      <div className="fr-sec"><i className="fr-bar" />添加订阅<span className="fr-hint">RSS / Atom</span></div>
      <div className="fr-card">
        <div className="fr-card-b">
          <input className="fr-inp" placeholder="RSS/Atom 地址（https://…）" value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void add() }} />
          <div className="fr-row" style={{ marginTop: 8 }}>
            <input className="fr-inp" style={{ flex: 1 }} placeholder="显示名（可选）" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="fr-inp" style={{ flex: 1 }} placeholder="分组（可选，如 技术）" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="fr-actions">
            <button className="fr-btn sm" disabled={!!busy} onClick={add}>{busy === 'add' ? <span className="fr-spin" /> : '添加并抓取首期'}</button>
            <button className="fr-btn sm ghost" disabled={!!busy || feeds.length === 0} onClick={() => doRefresh()}>{busy === 'all' ? <span className="fr-spin" /> : '全部立即刷新'}</button>
          </div>
        </div>
      </div>

      <div className="fr-sec"><i className="fr-bar" />订阅源<span className="fr-hint">{feeds.length} 个源 · {feeds.filter((f) => f.enabled).length} 启用</span></div>
      {feeds.length === 0 ? (
        <div className="fr-empty">还没有订阅源。<br />粘贴一个 RSS/Atom 地址，或从 OPML 文件导入。</div>
      ) : (
        <div className="fr-card" style={{ padding: 0 }}>
          {feeds.map((f) => {
            const dotCls = f.lastStatus === 'ok' ? '#3FB950' : f.lastStatus === 'error' ? '#F85149' : '#8B95A7'
            const name = f.title || hostOf(f.url) || f.id
            return (
              <div key={f.id} className={`fr-feed ${f.enabled ? '' : 'off'}`}>
                <div className="fr-feed-h">
                  <i className="fr-dot" style={{ background: f.enabled ? dotCls : '#3d4657' }} />
                  <span className="fr-feed-t" title={f.url}>{name}</span>
                  {f.category && <span className="fr-tag">{f.category}</span>}
                  {f.unreadCount > 0 && <button className="fr-btn sm ghost" onClick={goArticles}>{f.unreadCount} 未读</button>}
                </div>
                <div className="fr-url">{f.url}</div>
                <div className="fr-feed-m">
                  <span>{f.itemCount} 篇</span>
                  <span>·</span>
                  <span>抓取 {timeAgo(f.lastFetchAt)}</span>
                  <span>·</span>
                  <span>{f.intervalMin > 0 ? `${f.intervalMin} 分钟/次` : `跟随全局（${data?.settings.pollMin ?? 15} 分钟）`}</span>
                  {f.consecutiveErrors ? <span style={{ color: '#F85149' }}>· 连续失败 {f.consecutiveErrors} 次</span> : null}
                </div>
                {f.lastError && <div className="fr-sub" style={{ color: '#F85149', marginTop: 3 }}>{f.lastError}</div>}
                <div className="fr-actions" style={{ marginTop: 7 }}>
                  <button className="fr-btn sm" disabled={!!busy} onClick={() => doRefresh(f.id)}>{busy === f.id ? <span className="fr-spin" /> : '刷新'}</button>
                  <button className="fr-btn sm ghost" onClick={() => toggleEnabled(f.id, !f.enabled)}>{f.enabled ? '停用' : '启用'}</button>
                  <button className="fr-btn sm danger" disabled={!!busy} onClick={() => forget(f.id, name)}>删除</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="fr-sec"><i className="fr-bar" />OPML 备份<span className="fr-hint">跨阅读器迁移</span></div>
      <div className="fr-card">
        <div className="fr-card-b">
          <div className="fr-actions" style={{ marginTop: 0 }}>
            <input ref={fileRef} type="file" accept=".opml,.xml,text/xml" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = '' }} />
            <button className="fr-btn sm ghost" disabled={!!busy} onClick={() => fileRef.current?.click()}>从文件导入</button>
            <button className="fr-btn sm ghost" disabled={feeds.length === 0} onClick={exportOpml}>导出全部</button>
          </div>
          {opmlOpen && (
            <div style={{ marginTop: 8 }}>
              <div className="fr-sub" style={{ marginBottom: 4 }}>已触发下载；移动端可直接复制下面的内容：</div>
              <textarea className="fr-ta" readOnly value={opmlText} onFocus={(e) => e.currentTarget.select()} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
