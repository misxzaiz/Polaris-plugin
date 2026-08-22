// components/MainPanel.jsx — 主面板
// 多 tab 编排 + 布局 + 代理 + 发送 + 历史(完整快照可还原) + 侧栏
// 零 emoji；非变异

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { store, uid, clone } from '../core/store.js'
import { sendRequest } from '../core/http.js'
import { resolveTemplates } from '../core/template.js'
import RequestEditor from './RequestEditor.jsx'
import ResponseViewer from './ResponseViewer.jsx'
import CollectionPanel from './CollectionPanel.jsx'

const blankRow = () => ({ id: uid(), enabled: true, key: '', value: '' })

function newTab(seed) {
  return Object.assign({
    id: uid(), name: '未命名请求', savedId: null, dirty: false,
    method: 'GET', url: '', params: [blankRow()], headers: [blankRow()],
    bodyType: 'none', body: '', formBody: [blankRow()], response: null,
  }, seed || {})
}

export default function MainPanel({ onSendToChat }) {
  const [tabs, setTabs] = useState(() => store.get('tabs') || [newTab()])
  const [activeTabId, setActiveTabId] = useState(() => store.get('activeTabId') || tabs[0]?.id)
  const [ui, setUi] = useState(() => store.get('ui') || { sidebarCollapsed: false, layout: 'vertical', proxyEnabled: false, sidebarView: 'collections' })
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState('')
  const [confirmClose, setConfirmClose] = useState(null)

  // 初始化：无 tab 时建一个
  useEffect(() => {
    if (!store.get('tabs') || !store.get('tabs').length) {
      const t = newTab()
      store.set('tabs', [t]); store.set('activeTabId', t.id)
      setTabs([t]); setActiveTabId(t.id)
    }
    // 确保有环境
    if (!store.get('envs') || !store.get('envs').length) {
      store.set('envs', [{ id: uid(), name: '默认环境', baseUrl: '', vars: [blankRow()] }])
      store.set('activeEnv', store.get('envs')[0].id)
    }
  }, [])

  const persistTabs = useCallback((newTabs, newActiveId) => {
    // tabs 持久化时不存 response（体积大）
    const persistable = newTabs.map(t => { const c = { ...t }; delete c.response; return c })
    store.set('tabs', persistable)
    if (newActiveId !== undefined) store.set('activeTabId', newActiveId)
  }, [])

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) || tabs[0], [tabs, activeTabId])

  // 非变异更新 tab
  const updateTab = useCallback((tabId, patch) => {
    setTabs(prev => {
      const newTabs = prev.map(t => t.id === tabId ? { ...t, ...patch, dirty: true } : t)
      persistTabs(newTabs)
      return newTabs
    })
  }, [persistTabs])

  // 发送请求
  const handleSend = useCallback(async () => {
    if (!activeTab || sending) return
    setSending(true)
    const request = clone(activeTab)
    const envs = store.get('envs') || []
    const env = envs.find(e => e.id === store.get('activeEnv'))
    request._env = env

    const result = await sendRequest(request, { proxyEnabled: ui.proxyEnabled, proxyBase: 'http://127.0.0.1:9870' })

    // 更新 tab 的 response（非变异）
    setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, response: result } : t))

    // 记录历史（完整快照，可还原）
    const history = store.get('history') || []
    history.unshift({
      id: uid(), method: request.method || 'GET', url: request.url || '',
      status: result.status || 0, timeMs: result.timeMs || 0, ok: result.ok || !result.error,
      error: result.error || null, timestamp: Date.now(),
      // 完整请求快照（可还原）
      snapshot: { method: request.method, url: request.url, params: request.params, headers: request.headers, body: request.body, bodyType: request.bodyType, formBody: request.formBody },
    })
    if (history.length > 100) history.length = 100
    store.set('history', history)

    setSending(false)
    if (result.error) setToast('请求失败：' + result.error)
    else setToast(result.status + ' ' + (result.statusText || ''))
    setTimeout(() => setToast(''), 2500)
  }, [activeTab, sending, ui.proxyEnabled])

  // 新建 tab
  const addTab = useCallback(() => {
    const t = newTab()
    setTabs(prev => { const nt = [...prev, t]; persistTabs(nt, t.id); return nt })
    setActiveTabId(t.id)
    setUi(prev => { const u = { ...prev, sidebarCollapsed: false }; store.set('ui', u); return u })
  }, [persistTabs])

  // 关闭 tab（带 dirty 确认）
  const closeTab = useCallback((tabId) => {
    const tab = tabs.find(t => t.id === tabId)
    if (tab && tab.dirty && (tab.url || tab.savedId)) {
      setConfirmClose(tabId)
      return
    }
    doCloseTab(tabId)
  }, [tabs])

  const doCloseTab = useCallback((tabId) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId)
      const nt = prev.filter(t => t.id !== tabId)
      if (!nt.length) { const t = newTab(); nt.push(t); persistTabs([t], t.id); setActiveTabId(t.id); return nt }
      if (activeTabId === tabId) {
        const newActive = nt[Math.max(0, idx - 1)].id
        setActiveTabId(newActive)
        persistTabs(nt, newActive)
      } else persistTabs(nt)
      return nt
    })
    setConfirmClose(null)
  }, [activeTabId, persistTabs])

  // 重命名 tab（双击）
  const renameTab = useCallback((tabId, name) => {
    setTabs(prev => { const nt = prev.map(t => t.id === tabId ? { ...t, name } : t); persistTabs(nt); return nt })
  }, [persistTabs])

  // 打开已保存请求
  const openSaved = useCallback((savedReq) => {
    // 已打开则切换
    const exist = tabs.find(t => t.savedId === savedReq.id)
    if (exist) { setActiveTabId(exist.id); return }
    const t = newTab({
      name: savedReq.name, savedId: savedReq.id, method: savedReq.method, url: savedReq.url,
      params: clone(savedReq.params || [blankRow()]), headers: clone(savedReq.headers || [blankRow()]),
      bodyType: savedReq.bodyType || 'none', body: savedReq.body || '', formBody: clone(savedReq.formBody || [blankRow()]),
    })
    setTabs(prev => { const nt = [...prev, t]; persistTabs(nt, t.id); return nt })
    setActiveTabId(t.id)
  }, [tabs, persistTabs])

  // 从历史快照新建 tab（可还原完整请求）
  const newTabFromRequest = useCallback((item) => {
    const snap = item.snapshot || { method: item.method, url: item.url }
    const t = newTab({
      name: (item.method || 'GET') + ' ' + shortUrl(item.url), method: snap.method || item.method || 'GET',
      url: snap.url || item.url || '',
      params: clone(snap.params || [blankRow()]), headers: clone(snap.headers || [blankRow()]),
      bodyType: snap.bodyType || 'none', body: snap.body || '', formBody: clone(snap.formBody || [blankRow()]),
    })
    setTabs(prev => { const nt = [...prev, t]; persistTabs(nt, t.id); return nt })
    setActiveTabId(t.id)
  }, [persistTabs])

  // 保存当前到集合
  const saveCurrent = useCallback(() => {
    if (!activeTab) return
    if (activeTab.savedId) {
      // 更新已保存
      const cols = store.get('collections') || []
      const newCols = cols.map(f => ({
        ...f,
        requests: f.requests.map(r => r.id === activeTab.savedId ? {
          ...r, name: activeTab.name, method: activeTab.method, url: activeTab.url,
          params: clone(activeTab.params), headers: clone(activeTab.headers),
          body: activeTab.body, bodyType: activeTab.bodyType, formBody: clone(activeTab.formBody),
        } : r),
      }))
      store.set('collections', newCols)
      setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, dirty: false } : t))
      setToast('已更新「' + activeTab.name + '」')
    } else {
      // 新保存到第一个分组（或新建）
      const cols = store.get('collections') || []
      let folder = cols[0]
      if (!folder) { folder = { id: uid(), name: '默认分组', collapsed: false, requests: [] }; cols.push(folder) }
      const newReq = {
        id: uid(), name: activeTab.name || ((activeTab.method || 'GET') + ' ' + shortUrl(activeTab.url)),
        method: activeTab.method, url: activeTab.url,
        params: clone(activeTab.params), headers: clone(activeTab.headers),
        body: activeTab.body, bodyType: activeTab.bodyType, formBody: clone(activeTab.formBody),
      }
      folder.requests.push(newReq)
      store.set('collections', cols)
      setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, savedId: newReq.id, dirty: false } : t))
      setToast('已保存到「' + folder.name + '」')
    }
    setTimeout(() => setToast(''), 2000)
  }, [activeTab])

  const toggleSidebar = useCallback(() => {
    setUi(prev => { const u = { ...prev, sidebarCollapsed: !prev.sidebarCollapsed }; store.set('ui', u); return u })
  }, [])
  const toggleProxy = useCallback(() => {
    setUi(prev => { const u = { ...prev, proxyEnabled: !prev.proxyEnabled }; store.set('ui', u); return u })
  }, [])
  const toggleLayout = useCallback(() => {
    setUi(prev => { const u = { ...prev, layout: prev.layout === 'vertical' ? 'horizontal' : 'vertical' }; store.set('ui', u); return u })
  }, [])

  if (!activeTab) return null

  return (
    <div className="pa-main">
      {/* 顶部栏 */}
      <header className="pa-topbar">
        <span className="pa-brand"><span className="pa-brand-dot" />Polaris API</span>
        {/* Tab 条 */}
        <div className="pa-tabbar">
          {tabs.map(t => (
            <div key={t.id} className={'pa-rtab' + (t.id === activeTabId ? ' active' : '')} onClick={() => setActiveTabId(t.id)}>
              <span className={'pa-tm ' + ('m-' + (t.method || 'GET').toLowerCase())}>{t.method}</span>
              <span className="pa-tn" contentEditable suppressContentEditableWarning onBlur={(e) => renameTab(t.id, e.target.textContent.trim() || t.name)} onClick={(e) => e.stopPropagation()}>{t.name}</span>
              {t.dirty && <span className="pa-dirty">●</span>}
              <button className="pa-tx" onClick={(e) => { e.stopPropagation(); closeTab(t.id) }}>×</button>
            </div>
          ))}
          <button className="pa-tab-add" onClick={addTab} title="新建请求">+</button>
        </div>
        <span className="pa-spacer" />
        <button className={'pa-top-btn' + (ui.proxyEnabled ? ' active' : '')} onClick={toggleProxy} title="跨域代理">代理{ui.proxyEnabled ? ':开' : ':关'}</button>
        <button className="pa-top-btn" onClick={toggleLayout} title="切换布局">{ui.layout === 'vertical' ? '上下' : '左右'}</button>
        <button className="pa-top-btn" onClick={toggleSidebar} title="折叠侧栏">{ui.sidebarCollapsed ? '展开' : '折叠'}</button>
      </header>

      {/* 主区域 */}
      <div className={'pa-main-area layout-' + ui.layout}>
        {!ui.sidebarCollapsed && (
          <aside className="pa-sidebar">
            <CollectionPanel tabs={tabs} activeTabId={activeTabId} onOpenSaved={openSaved} onNewTabFromRequest={newTabFromRequest} onSaveCurrent={saveCurrent} />
          </aside>
        )}
        <div className="pa-workarea">
          <div className="pa-req-section">
            <RequestEditor onSendToChat={onSendToChat} onSend={handleSend} sending={sending} activeTab={activeTab} updateTab={updateTab} />
          </div>
          <div className="pa-divider" />
          <div className="pa-res-section">
            <ResponseViewer onSendToChat={onSendToChat} request={activeTab} />
          </div>
        </div>
      </div>

      {/* 状态栏 */}
      <footer className="pa-statusbar">
        <span className="pa-status-msg">{toast || (sending ? '请求发送中...' : '就绪')}</span>
        <span className="pa-status-info">
          <span>TABS <b>{tabs.length}</b></span>
          <span>代理: {ui.proxyEnabled ? '开' : '关'}</span>
        </span>
      </footer>

      {/* 关闭确认 */}
      {confirmClose && (
        <div className="pa-confirm-overlay" onClick={() => setConfirmClose(null)}>
          <div className="pa-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="pa-confirm-msg">该请求有未保存修改，仍要关闭？</div>
            <div className="pa-confirm-actions">
              <button className="pa-btn" onClick={() => setConfirmClose(null)}>取消</button>
              <button className="pa-btn pa-btn-danger" onClick={() => doCloseTab(confirmClose)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function shortUrl(u) {
  if (!u) return '未命名'
  try { const x = new URL(/^[a-z]+:\/\//i.test(u) ? u : 'https://' + u.replace(/^\{\{[^}]+\}\}/, 'http://x')); return (x.pathname && x.pathname.length > 1) ? x.pathname : x.hostname } catch (e) { return String(u).slice(0, 28) }
}