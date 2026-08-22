// components/CollectionPanel.jsx — 集合管理 + 请求历史 + 导入导出
// 树形分组 + 搜索 + 保存/载入 + Postman/OpenAPI/HAR 导入 + 集合导出
// 零 emoji；无 prompt/confirm（用内联确认）

import { useState, useEffect, useCallback, useMemo } from 'react'
import { store, uid, clone } from '../core/store.js'
import { detectImportType, parsePostmanCollection, parseOpenAPI, parseHAR } from '../core/parser.js'

const blankRow = () => ({ id: uid(), enabled: true, key: '', value: '' })

export default function CollectionPanel({ tabs, activeTabId, onOpenSaved, onNewTabFromRequest, onSaveCurrent }) {
  const [view, setView] = useState('collections') // collections | history
  const [collections, setCollections] = useState(() => store.get('collections') || [])
  const [history, setHistory] = useState(() => store.get('history') || [])
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importType, setImportType] = useState('')
  const [confirmDel, setConfirmDel] = useState(null) // { type: 'folder'|'request', id, folderId? }

  useEffect(() => {
    const u1 = store.subscribe('collections', (v) => setCollections(v || []))
    const u2 = store.subscribe('history', (v) => setHistory(v || []))
    return () => { u1(); u2() }
  }, [])

  const handleImportTextChange = useCallback((text) => {
    setImportText(text)
    setImportType(text.trim() ? detectImportType(text.trim()) : '')
  }, [])

  const handleImport = useCallback(() => {
    if (!importText.trim()) return
    const type = detectImportType(importText.trim())
    let result
    try {
      const data = JSON.parse(importText.trim())
      if (type === 'postman') result = parsePostmanCollection(data)
      else if (type === 'openapi') result = parseOpenAPI(data)
      else if (type === 'har') result = parseHAR(data)
      else { setImportType('unknown'); return }
    } catch (e) { return }
    if (!result || !result.items.length) return
    const cols = store.get('collections') || []
    cols.push({
      id: uid(), name: result.name || '导入的集合', collapsed: false,
      requests: result.items.map(item => ({
        id: item.id || uid(), name: item.name, method: item.method || 'GET', url: item.url || '',
        params: item.params || [blankRow()], headers: item.headers || [blankRow()],
        body: item.body || '', bodyType: item.bodyType || 'none', formBody: item.formBody || [blankRow()],
      })),
    })
    store.set('collections', cols)
    setShowImport(false); setImportText(''); setImportType('')
  }, [importText])

  // 导出集合
  const handleExport = useCallback(() => {
    const data = JSON.stringify({ exportedAt: new Date().toISOString(), collections, envs: store.get('envs') || [] }, null, 2)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    a.download = 'polaris-api-export.json'
    a.click()
  }, [collections])

  const handleFileImport = useCallback((e) => {
    const f = e.target.files[0]
    if (!f) return
    const rd = new FileReader()
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result)
        const cols = Array.isArray(d) ? d : d.collections
        if (Array.isArray(cols)) {
          cols.forEach(g => { g.id = uid(); (g.requests || []).forEach(r => r.id = r.id || uid()) })
          store.set('collections', (store.get('collections') || []).concat(cols))
        }
      } catch (err) {}
      e.target.value = ''
    }
    rd.readAsText(f)
  }, [])

  // 文件夹操作（非变异）
  const addFolder = useCallback(() => {
    const cols = store.get('collections') || []
    const newFolder = { id: uid(), name: '新分组 ' + (cols.length + 1), collapsed: false, requests: [] }
    store.set('collections', [...cols, newFolder])
  }, [])

  const renameFolder = useCallback((folderId, name) => {
    const cols = store.get('collections') || []
    store.set('collections', cols.map(f => f.id === folderId ? { ...f, name } : f))
  }, [])

  const deleteFolder = useCallback((folderId) => {
    const cols = store.get('collections') || []
    store.set('collections', cols.filter(f => f.id !== folderId))
    setConfirmDel(null)
  }, [])

  const deleteRequest = useCallback((folderId, reqId) => {
    const cols = store.get('collections') || []
    store.set('collections', cols.map(f => f.id === folderId ? { ...f, requests: f.requests.filter(r => r.id !== reqId) } : f))
    setConfirmDel(null)
  }, [])

  const filteredCollections = useMemo(() => collections.map(f => ({
    ...f,
    requests: search ? f.requests.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || (r.url || '').toLowerCase().includes(search.toLowerCase()) || (r.method || '').toLowerCase().includes(search.toLowerCase())) : f.requests,
  })).filter(f => !search || f.requests.length > 0 || f.name.toLowerCase().includes(search.toLowerCase())), [collections, search])

  const filteredHistory = useMemo(() => search ? history.filter(h => (h.url || '').toLowerCase().includes(search.toLowerCase()) || (h.method || '').toLowerCase().includes(search.toLowerCase())) : history, [history, search])

  return (
    <div className="pa-col-panel">
      {/* 搜索 */}
      <div className="pa-col-search">
        <input type="text" placeholder="搜索请求..." value={search} onChange={(e) => setSearch(e.target.value)} spellCheck={false} />
      </div>

      {/* 视图切换 */}
      <div className="pa-col-views">
        <button className={'pa-col-view-btn' + (view === 'collections' ? ' active' : '')} onClick={() => setView('collections')}>
          集合<span className="pa-col-count">{collections.reduce((s, f) => s + f.requests.length, 0)}</span>
        </button>
        <button className={'pa-col-view-btn' + (view === 'history' ? ' active' : '')} onClick={() => setView('history')}>
          历史<span className="pa-col-count">{history.length}</span>
        </button>
      </div>

      {/* 集合视图 */}
      {view === 'collections' && (
        <div className="pa-col-list">
          <div className="pa-col-actions">
            <button className="pa-btn-link" onClick={onSaveCurrent}>保存当前</button>
            <button className="pa-btn-link" onClick={addFolder}>+ 分组</button>
            <button className="pa-btn-link" onClick={() => setShowImport(!showImport)}>导入</button>
            <button className="pa-btn-link" onClick={handleExport}>导出</button>
            <input type="file" accept="application/json,.json" style={{ display: 'none' }} id="pa-file-import" onChange={handleFileImport} />
            <button className="pa-btn-link" onClick={() => document.getElementById('pa-file-import').click()}>文件</button>
          </div>

          {showImport && (
            <div className="pa-import-panel">
              <textarea className="pa-import-textarea" placeholder="粘贴 Postman Collection / OpenAPI / HAR JSON..." value={importText} onChange={(e) => handleImportTextChange(e.target.value)} rows={5} spellCheck={false} />
              {importType && importType !== 'unknown' && <div className="pa-import-type">检测到：{importType}</div>}
              <div className="pa-import-actions">
                <button className="pa-btn" onClick={() => { setShowImport(false); setImportText('') }}>取消</button>
                <button className="pa-btn pa-btn-primary" onClick={handleImport} disabled={!importText.trim()}>导入</button>
              </div>
            </div>
          )}

          {filteredCollections.length === 0 ? (
            <div className="pa-col-empty">{search ? '无匹配请求' : '还没有保存的请求。发送请求后点击「保存当前」即可存入集合。'}</div>
          ) : filteredCollections.map(folder => (
            <div key={folder.id} className="pa-col-folder">
              <div className="pa-col-folder-header">
                <span className="pa-col-folder-name" contentEditable suppressContentEditableWarning onBlur={(e) => renameFolder(folder.id, e.target.textContent.trim() || folder.name)}>{folder.name}</span>
                <span className="pa-col-folder-count">{folder.requests.length}</span>
                <button className="pa-btn-icon-small" onClick={() => setConfirmDel({ type: 'folder', id: folder.id })} title="删除分组">✕</button>
              </div>
              <div className="pa-col-requests">
                {folder.requests.map(req => (
                  <div key={req.id} className="pa-col-request" onClick={() => onOpenSaved(req)}>
                    <span className={'pa-col-method ' + ('m-' + (req.method || 'GET').toLowerCase())}>{req.method}</span>
                    <span className="pa-col-req-name">{req.name}</span>
                    <span className="pa-col-req-url">{req.url}</span>
                    <button className="pa-btn-icon-small" onClick={(e) => { e.stopPropagation(); setConfirmDel({ type: 'request', id: req.id, folderId: folder.id }) }} title="删除">✕</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 历史视图 */}
      {view === 'history' && (
        <div className="pa-col-list">
          {filteredHistory.length === 0 ? (
            <div className="pa-col-empty">{search ? '无匹配历史' : '还没有请求历史。发送请求后会自动记录。'}</div>
          ) : filteredHistory.map((item, idx) => (
            <div key={item.id || idx} className="pa-col-request" onClick={() => onNewTabFromRequest(item)}>
              <span className={'pa-col-method ' + ('m-' + (item.method || 'GET').toLowerCase())}>{item.method}</span>
              <span className="pa-col-req-url">{item.url}</span>
              <span className={'pa-col-status ' + (item.ok ? 'ok' : 'err')}>{item.status || item.error || '?'}</span>
              <span className="pa-col-time">{formatRelTime(item.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 删除确认 */}
      {confirmDel && (
        <div className="pa-confirm-overlay" onClick={() => setConfirmDel(null)}>
          <div className="pa-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="pa-confirm-msg">确认删除？</div>
            <div className="pa-confirm-actions">
              <button className="pa-btn" onClick={() => setConfirmDel(null)}>取消</button>
              <button className="pa-btn pa-btn-danger" onClick={() => confirmDel.type === 'folder' ? deleteFolder(confirmDel.id) : deleteRequest(confirmDel.folderId, confirmDel.id)}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatRelTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  return Math.floor(diff / 86400000) + '天前'
}