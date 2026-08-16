// components/CollectionPanel.jsx — 集合管理面板
// 支持多级文件夹、搜索、Postman/OpenAPI 导入、请求历史

import { useState, useEffect, useCallback } from 'react'
import { store, uid, clone } from '../core/store.js'
import { detectImportType, parsePostmanCollection, parseOpenAPI, parseHAR } from '../core/parser.js'

export default function CollectionPanel() {
  const [collections, setCollections] = useState(() => store.get('collections') || [])
  const [history, setHistory] = useState(() => store.get('history') || [])
  const [searchQuery, setSearchQuery] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importType, setImportType] = useState('')

  useEffect(() => {
    const unsub1 = store.subscribe('collections', (val) => setCollections(val || []))
    const unsub2 = store.subscribe('history', (val) => setHistory(val || []))
    return () => { unsub1(); unsub2() }
  }, [])

  // 把已保存的请求加载到编辑器
  const loadRequest = useCallback((savedReq) => {
    const request = {
      method: savedReq.method || 'GET',
      url: savedReq.url || '',
      params: clone(savedReq.params || [{ key: '', value: '', enabled: true }]),
      headers: clone(savedReq.headers || [{ key: '', value: '', enabled: true }]),
      body: savedReq.body || '',
      bodyType: savedReq.bodyType || 'none',
    }
    store.set('request', request)
  }, [])

  // 从历史记录载入
  const loadFromHistory = useCallback((historyItem) => {
    // 历史只存了基本信息，可以尝试重新发送
    const request = {
      method: historyItem.method || 'GET',
      url: historyItem.url || '',
      params: [{ key: '', value: '', enabled: true }],
      headers: [{ key: '', value: '', enabled: true }],
      body: '',
      bodyType: 'none',
    }
    store.set('request', request)
  }, [])

  // 删除集合项
  const deleteCollection = useCallback((folderId, reqId) => {
    const cols = store.get('collections') || []
    const folder = cols.find(f => f.id === folderId)
    if (folder) {
      folder.requests = folder.requests.filter(r => r.id !== reqId)
      store.set('collections', cols)
    }
  }, [])

  // 删除文件夹
  const deleteFolder = useCallback((folderId) => {
    const cols = (store.get('collections') || []).filter(f => f.id !== folderId)
    store.set('collections', cols)
  }, [])

  // 新建文件夹
  const addFolder = useCallback(() => {
    const name = prompt('文件夹名称：')
    if (!name) return
    const cols = store.get('collections') || []
    cols.push({
      id: uid(),
      name: name.trim(),
      requests: [],
    })
    store.set('collections', cols)
  }, [])

  // 重命名文件夹
  const renameFolder = useCallback((folderId) => {
    const cols = store.get('collections') || []
    const folder = cols.find(f => f.id === folderId)
    if (!folder) return
    const name = prompt('新名称：', folder.name)
    if (name) {
      folder.name = name.trim()
      store.set('collections', cols)
    }
  }, [])

  // 导入
  const handleImport = useCallback(() => {
    if (!importText.trim()) return
    const type = detectImportType(importText.trim())
    let result

    try {
      const data = JSON.parse(importText.trim())
      if (type === 'postman') {
        result = parsePostmanCollection(data)
      } else if (type === 'openapi') {
        result = parseOpenAPI(data)
      } else if (type === 'har') {
        result = parseHAR(data)
      } else {
        alert('无法识别的格式。支持：Postman Collection v2.1、OpenAPI 3.0、HAR')
        return
      }
    } catch (e) {
      // 如果是 cURL，用 cURL 导入
      if (type === 'curl') {
        // 单条 cURL 导入由 RequestEditor 处理
        alert('请粘贴到请求编辑器的「导入 cURL」中')
        return
      }
      alert('JSON 解析失败：' + e.message)
      return
    }

    if (!result || !result.items.length) {
      alert('未能解析出任何请求')
      return
    }

    // 导入到集合
    const cols = store.get('collections') || []
    const folder = {
      id: uid(),
      name: result.name || '导入的集合',
      requests: result.items.map(item => ({
        id: item.id || uid(),
        name: item.name,
        method: item.method || 'GET',
        url: item.url || '',
        params: item.params || [{ key: '', value: '', enabled: true }],
        headers: item.headers || [{ key: '', value: '', enabled: true }],
        body: item.body || '',
        bodyType: item.bodyType || 'none',
        savedAt: Date.now(),
      })),
    }
    cols.push(folder)
    store.set('collections', cols)
    setShowImport(false)
    setImportText('')
  }, [importText])

  // 检测导入类型
  const handleImportTextChange = useCallback((text) => {
    setImportText(text)
    if (text.trim()) {
      setImportType(detectImportType(text.trim()))
    } else {
      setImportType('')
    }
  }, [])

  // 过滤
  const filteredCollections = collections.map(folder => ({
    ...folder,
    requests: searchQuery
      ? folder.requests.filter(r =>
          r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (r.url || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (r.method || '').toLowerCase().includes(searchQuery.toLowerCase())
        )
      : folder.requests,
  })).filter(f => !searchQuery || f.requests.length > 0)

  const filteredHistory = searchQuery
    ? history.filter(h =>
        (h.url || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (h.method || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : history

  const [activeView, setActiveView] = useState('collections')

  return (
    <div className="api-collection-panel">
      {/* 搜索栏 */}
      <div className="api-col-search">
        <input
          type="text"
          placeholder="🔍 搜索请求…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          spellCheck={false}
        />
      </div>

      {/* 视图切换 */}
      <div className="api-col-views">
        <button
          className={'api-col-view-btn' + (activeView === 'collections' ? ' active' : '')}
          onClick={() => setActiveView('collections')}
        >
          集合
          <span className="api-col-count">{collections.reduce((s, f) => s + f.requests.length, 0)}</span>
        </button>
        <button
          className={'api-col-view-btn' + (activeView === 'history' ? ' active' : '')}
          onClick={() => setActiveView('history')}
        >
          历史
          <span className="api-col-count">{history.length}</span>
        </button>
      </div>

      {/* 集合视图 */}
      {activeView === 'collections' && (
        <div className="api-col-list">
          <div className="api-col-actions">
            <button className="api-btn-link" onClick={addFolder}>+ 新建文件夹</button>
            <button className="api-btn-link" onClick={() => setShowImport(!showImport)}>📥 导入</button>
          </div>

          {/* 导入面板 */}
          {showImport && (
            <div className="api-import-panel">
              <textarea
                className="api-import-textarea"
                placeholder="粘贴 Postman Collection / OpenAPI / HAR JSON…"
                value={importText}
                onChange={e => handleImportTextChange(e.target.value)}
                rows={5}
                spellCheck={false}
              />
              {importType && importType !== 'unknown' && (
                <div className="api-import-type">检测到格式：{importType}</div>
              )}
              <div className="api-import-actions">
                <button className="api-btn" onClick={() => setShowImport(false)}>取消</button>
                <button className="api-btn api-btn-primary" onClick={handleImport} disabled={!importText.trim()}>
                  导入
                </button>
              </div>
            </div>
          )}

          {/* 集合树 */}
          {filteredCollections.length === 0 ? (
            <div className="api-col-empty">
              {searchQuery ? '无匹配的请求' : '还没有保存的请求。\n发送请求后点击「保存」即可存入集合。'}
            </div>
          ) : (
            filteredCollections.map(folder => (
              <div key={folder.id} className="api-col-folder">
                <div className="api-col-folder-header">
                  <span className="api-col-folder-name">{folder.name}</span>
                  <span className="api-col-folder-count">{folder.requests.length}</span>
                  <button className="api-btn-icon-small" onClick={() => renameFolder(folder.id)} title="重命名">✎</button>
                  <button className="api-btn-icon-small" onClick={() => deleteFolder(folder.id)} title="删除文件夹">✕</button>
                </div>
                <div className="api-col-requests">
                  {folder.requests.map(req => (
                    <div key={req.id} className="api-col-request" onClick={() => loadRequest(req)}>
                      <span className={'api-col-method m-' + (req.method || 'GET').toLowerCase()}>{req.method}</span>
                      <span className="api-col-req-name">{req.name}</span>
                      <span className="api-col-req-url">{req.url}</span>
                      <button className="api-btn-icon-small" onClick={(e) => { e.stopPropagation(); deleteCollection(folder.id, req.id) }} title="删除">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 历史视图 */}
      {activeView === 'history' && (
        <div className="api-col-list">
          {filteredHistory.length === 0 ? (
            <div className="api-col-empty">
              {searchQuery ? '无匹配的历史记录' : '还没有请求历史。\n发送请求后会自动记录。'}
            </div>
          ) : (
            filteredHistory.map((item, idx) => (
              <div key={item.id || idx} className="api-col-request" onClick={() => loadFromHistory(item)}>
                <span className={'api-col-method m-' + (item.method || 'GET').toLowerCase()}>{item.method}</span>
                <span className="api-col-req-url">{item.url}</span>
                <span className={'api-col-status ' + (item.ok ? 'ok' : 'err')}>
                  {item.status || item.error || '?'}
                </span>
                <span className="api-col-time">{formatRelTime(item.timestamp)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function formatRelTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
  return Math.floor(diff / 86400000) + ' 天前'
}