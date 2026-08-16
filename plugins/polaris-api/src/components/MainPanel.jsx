// components/MainPanel.jsx — 主面板组件
// 将 RequestEditor / ResponseViewer / CollectionPanel / AIChat 组装在一起

import { useState, useEffect, useCallback } from 'react'
import { store } from '../core/store.js'
import { sendRequest } from '../core/http.js'
import RequestEditor from './RequestEditor.jsx'
import ResponseViewer from './ResponseViewer.jsx'
import CollectionPanel from './CollectionPanel.jsx'
import AIChat from './AIChat.jsx'

export default function MainPanel() {
  const [sidebarView, setSidebarView] = useState(() => store.get('ui.sidebarView') || 'collections')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => store.get('ui.sidebarCollapsed') || false)
  const [proxyEnabled, setProxyEnabled] = useState(() => store.get('ui.proxyEnabled') || false)
  const [layout, setLayout] = useState(() => store.get('ui.layout') || 'vertical')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const unsub = store.subscribe('ui', (val) => {
      if (val) {
        setSidebarView(val.sidebarView || 'collections')
        setSidebarCollapsed(val.sidebarCollapsed || false)
        setProxyEnabled(val.proxyEnabled || false)
      }
    })
    return () => unsub()
  }, [])

  // 发送请求
  const handleSend = useCallback(async () => {
    if (sending) return
    setSending(true)

    const request = store.get('request')
    const envs = store.get('envs') || []
    const activeEnvId = store.get('activeEnv')
    const env = envs.find(e => e.id === activeEnvId)
    request._env = env

    const result = await sendRequest(request, {
      proxyEnabled,
      proxyBase: 'http://127.0.0.1:9870',
    })

    store.set('response', result)

    // 记录历史
    const history = store.get('history') || []
    history.unshift({
      id: Date.now().toString(36),
      method: request.method || 'GET',
      url: request.url || '',
      status: result.status || 0,
      timeMs: result.timeMs || 0,
      ok: result.ok || false,
      error: result.error || null,
      timestamp: Date.now(),
    })
    if (history.length > 100) history.length = 100
    store.set('history', history)

    setSending(false)
  }, [sending, proxyEnabled])

  // 监听「发送」事件
  useEffect(() => {
    const handler = () => handleSend()
    window.addEventListener('polaris-api-send', handler)
    return () => window.removeEventListener('polaris-api-send', handler)
  }, [handleSend])

  const toggleSidebar = useCallback(() => {
    const collapsed = !sidebarCollapsed
    setSidebarCollapsed(collapsed)
    store.set('ui', { ...store.get('ui'), sidebarCollapsed: collapsed })
  }, [sidebarCollapsed])

  const toggleProxy = useCallback(() => {
    const enabled = !proxyEnabled
    setProxyEnabled(enabled)
    store.set('ui', { ...store.get('ui'), proxyEnabled: enabled })
  }, [proxyEnabled])

  const toggleLayout = useCallback(() => {
    const newLayout = layout === 'vertical' ? 'horizontal' : 'vertical'
    setLayout(newLayout)
    store.set('ui', { ...store.get('ui'), layout: newLayout })
  }, [layout])

  return (
    <div className="api-main-panel">
      {/* 顶部栏 */}
      <header className="api-topbar">
        <div className="api-topbar-brand">
          <span className="api-logo-dot" />
          <span className="api-logo-text">Polaris API</span>
        </div>

        <div className="api-topbar-nav">
          <button
            className={'api-topbar-nav-btn' + (sidebarView === 'collections' ? ' active' : '')}
            onClick={() => { setSidebarView('collections'); store.set('ui', { ...store.get('ui'), sidebarView: 'collections' }) }}
          >
            📁 集合
          </button>
          <button
            className={'api-topbar-nav-btn' + (sidebarView === 'history' ? ' active' : '')}
            onClick={() => { setSidebarView('history'); store.set('ui', { ...store.get('ui'), sidebarView: 'history' }) }}
          >
            🕐 历史
          </button>
          <button
            className={'api-topbar-nav-btn' + (sidebarView === 'ai' ? ' active' : '')}
            onClick={() => { setSidebarView('ai'); store.set('ui', { ...store.get('ui'), sidebarView: 'ai' }) }}
          >
            ✦ AI
          </button>
        </div>

        <span className="api-spacer" />

        <button className={'api-topbar-btn' + (proxyEnabled ? ' active' : '')} onClick={toggleProxy} title="跨域代理">
          🛡 代理{proxyEnabled ? ': 开' : ': 关'}
        </button>
        <button className="api-topbar-btn" onClick={toggleLayout} title="切换布局">
          {layout === 'vertical' ? '⇅ 上下' : '⇄ 左右'}
        </button>
        <button className="api-topbar-btn" onClick={toggleSidebar} title="折叠/展开侧栏">
          {sidebarCollapsed ? '☰' : '✕'}
        </button>
      </header>

      {/* 主区域 */}
      <div className={'api-main-area layout-' + layout}>
        {/* 侧边栏 */}
        {!sidebarCollapsed && (
          <aside className="api-sidebar">
            {sidebarView === 'ai' ? (
              <AIChat />
            ) : (
              <CollectionPanel />
            )}
          </aside>
        )}

        {/* 主工作区 */}
        <div className="api-workarea">
          {/* 请求编辑区 */}
          <div className="api-request-section">
            <RequestEditor />
          </div>

          {/* 分隔线 */}
          <div className="api-divider" />

          {/* 响应区 */}
          <div className="api-response-section">
            <ResponseViewer />
          </div>
        </div>
      </div>

      {/* 状态栏 */}
      <footer className="api-statusbar">
        <span className="api-status-msg" id="apiStatusMsg">
          {sending ? '请求发送中…' : '就绪'}
        </span>
        <span className="api-status-info">
          <span>代理: {proxyEnabled ? '开' : '关'}</span>
          <span>布局: {layout === 'vertical' ? '上下' : '左右'}</span>
        </span>
      </footer>
    </div>
  )
}