// components/RequestEditor.jsx — 智能请求编辑器
// 统一编辑区，支持 URL 自动参数解析、语法高亮提示、代码生成

import { useState, useEffect, useRef, useCallback } from 'react'
import { store, uid } from '../core/store.js'
import { resolveTemplates } from '../core/template.js'
import { parseCurl, toCurl } from '../core/parser.js'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const COMMON_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  Authorization: 'Bearer ',
  'Cache-Control': 'no-cache',
  'User-Agent': 'Polaris-API/1.0',
}

const METHOD_COLORS = {
  GET: '#3fb950',
  POST: '#4493f8',
  PUT: '#d29922',
  PATCH: '#a371f7',
  DELETE: '#f85149',
  HEAD: '#8b949e',
  OPTIONS: '#8b949e',
}

export default function RequestEditor() {
  const [request, setRequest] = useState(() => store.get('request') || {})
  const [envs, setEnvs] = useState(() => store.get('envs') || [])
  const [activeEnvId, setActiveEnvId] = useState(() => store.get('activeEnv'))
  const [showMethodMenu, setShowMethodMenu] = useState(false)
  const [showEnvMenu, setShowEnvMenu] = useState(false)
  const [showEnvManager, setShowEnvManager] = useState(false)
  const [showImportMenu, setShowImportMenu] = useState(false)
  const [curlInput, setCurlInput] = useState('')
  const [showCurlImport, setShowCurlImport] = useState(false)
  const [urlPreview, setUrlPreview] = useState('')
  const urlRef = useRef(null)

  useEffect(() => {
    const unsub1 = store.subscribe('request', (val) => setRequest(val || {}))
    const unsub2 = store.subscribe('envs', (val) => setEnvs(val || []))
    const unsub3 = store.subscribe('activeEnv', (val) => setActiveEnvId(val))
    return () => { unsub1(); unsub2(); unsub3() }
  }, [])

  // 更新 URL 预览（变量解析）
  useEffect(() => {
    const env = envs.find(e => e.id === activeEnvId)
    const preview = resolveTemplates(request.url || '', env)
    setUrlPreview(preview !== request.url ? preview : '')
  }, [request.url, envs, activeEnvId])

  const activeEnv = envs.find(e => e.id === activeEnvId)

  const updateRequest = useCallback((patch) => {
    const updated = { ...request, ...patch }
    store.set('request', updated)
  }, [request])

  const handleMethodChange = useCallback((method) => {
    updateRequest({ method })
    setShowMethodMenu(false)
  }, [updateRequest])

  const handleUrlChange = useCallback((e) => {
    const url = e.target.value
    updateRequest({ url })
    // 自动解析 URL 参数
    const qIdx = url.indexOf('?')
    if (qIdx >= 0) {
      const queryStr = url.slice(qIdx + 1)
      if (queryStr) {
        const params = queryStr.split('&').filter(Boolean).map(p => {
          const eq = p.indexOf('=')
          return eq >= 0
            ? { key: decodeURIComponent(p.slice(0, eq)), value: decodeURIComponent(p.slice(eq + 1)), enabled: true }
            : { key: decodeURIComponent(p), value: '', enabled: true }
        })
        params.push({ key: '', value: '', enabled: true })
        updateRequest({ params })
      }
    }
  }, [updateRequest])

  const handleSend = useCallback(() => {
    // 触发发送（通过自定义事件通知 MainPanel 执行真正的请求）
    // RequestEditor 自身不监听该事件，避免与 MainPanel 形成双触发/循环
    window.dispatchEvent(new CustomEvent('polaris-api-send'))
  }, [])

  // 从 cURL 导入
  const handleCurlImport = useCallback(() => {
    try {
      const parsed = parseCurl(curlInput)
      updateRequest({
        method: parsed.method,
        url: parsed.url,
        params: parsed.params,
        headers: parsed.headers,
        body: parsed.body,
        bodyType: parsed.bodyType,
      })
      setShowCurlImport(false)
      setCurlInput('')
    } catch (e) {
      alert('cURL 解析失败：' + e.message)
    }
  }, [curlInput, updateRequest])

  // 复制为 cURL
  const handleCopyCurl = useCallback(() => {
    const curl = toCurl(request)
    navigator.clipboard.writeText(curl).then(() => {
      // 短暂提示
    }).catch(() => {})
  }, [request])

  // 环境管理
  const handleEnvChange = useCallback((envId) => {
    store.set('activeEnv', envId)
    setShowEnvMenu(false)
  }, [])

  const addEnv = useCallback(() => {
    const envs = store.get('envs') || []
    const newEnv = {
      id: uid(),
      name: '环境 ' + (envs.length + 1),
      baseUrl: '',
      vars: [{ key: '', value: '', enabled: true }],
    }
    store.set('envs', [...envs, newEnv])
    store.set('activeEnv', newEnv.id)
  }, [])

  const deleteEnv = useCallback((id) => {
    let envs = store.get('envs') || []
    envs = envs.filter(e => e.id !== id)
    store.set('envs', envs)
    if (store.get('activeEnv') === id) {
      store.set('activeEnv', envs[0]?.id || null)
    }
  }, [])

  const updateEnv = useCallback((id, patch) => {
    const envs = store.get('envs') || []
    const idx = envs.findIndex(e => e.id === id)
    if (idx >= 0) {
      envs[idx] = { ...envs[idx], ...patch }
      store.set('envs', envs)
    }
  }, [])

  // 键盘快捷键
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSend()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSend])

  return (
    <div className="api-request-editor">
      {/* 请求栏 */}
      <div className="api-req-bar">
        <div className="api-method-wrap">
          <button
            className="api-method-btn"
            style={{ color: METHOD_COLORS[request.method] || '#8b949e' }}
            onClick={() => setShowMethodMenu(!showMethodMenu)}
          >
            {request.method || 'GET'} ▾
          </button>
          {showMethodMenu && (
            <div className="api-dropdown-menu api-method-menu">
              {METHODS.map(m => (
                <button
                  key={m}
                  className={'api-dropdown-item' + (m === request.method ? ' active' : '')}
                  style={{ color: METHOD_COLORS[m] || '#8b949e' }}
                  onClick={() => handleMethodChange(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="api-url-wrap">
          <input
            ref={urlRef}
            className="api-url-input"
            type="text"
            placeholder="请求 URL，支持 {{baseUrl}} 和 {{变量}} 模板"
            value={request.url || ''}
            onChange={handleUrlChange}
            spellCheck={false}
          />
          {urlPreview && (
            <div className="api-url-preview">
              → <span className="api-url-resolved">{urlPreview}</span>
            </div>
          )}
        </div>

        <button className="api-btn api-btn-primary" onClick={handleSend}>
          发送
          <span className="api-kbd">⌘↵</span>
        </button>

        <div className="api-more-actions">
          <button className="api-btn-icon" onClick={() => setShowCurlImport(!showCurlImport)} title="导入 cURL">
            ⤓
          </button>
          <button className="api-btn-icon" onClick={handleCopyCurl} title="复制为 cURL">
            ⎘
          </button>
        </div>
      </div>

      {/* cURL 导入面板 */}
      {showCurlImport && (
        <div className="api-curl-import">
          <textarea
            className="api-curl-input"
            placeholder="粘贴 cURL 命令..."
            value={curlInput}
            onChange={e => setCurlInput(e.target.value)}
            rows={3}
            spellCheck={false}
          />
          <div className="api-curl-actions">
            <button className="api-btn" onClick={() => setShowCurlImport(false)}>取消</button>
            <button className="api-btn api-btn-primary" onClick={handleCurlImport}>解析并导入</button>
          </div>
        </div>
      )}

      {/* 参数/Headers/Body 编辑区 */}
      <div className="api-req-body">
        <RequestTabs request={request} updateRequest={updateRequest} />
      </div>

      {/* 环境切换 */}
      <div className="api-env-bar">
        <div className="api-env-selector">
          <span className="api-env-label">环境：</span>
          <button className="api-env-btn" onClick={() => setShowEnvMenu(!showEnvMenu)}>
            {activeEnv?.name || '无环境'} ▾
          </button>
          {showEnvMenu && (
            <div className="api-dropdown-menu api-env-menu">
              {envs.map(env => (
                <button
                  key={env.id}
                  className={'api-dropdown-item' + (env.id === activeEnvId ? ' active' : '')}
                  onClick={() => handleEnvChange(env.id)}
                >
                  <span className="api-env-dot" />
                  {env.name}
                  {env.baseUrl && <span className="api-env-url">{env.baseUrl}</span>}
                </button>
              ))}
              <div className="api-dropdown-divider" />
              <button className="api-dropdown-item" onClick={() => { setShowEnvMenu(false); setShowEnvManager(true) }}>
                ⚙ 管理环境
              </button>
            </div>
          )}
        </div>
        {activeEnv?.baseUrl && (
          <span className="api-env-baseurl">baseUrl: {activeEnv.baseUrl}</span>
        )}
      </div>

      {/* 环境管理器 */}
      {showEnvManager && (
        <EnvManager
          envs={envs}
          activeEnvId={activeEnvId}
          onUpdate={updateEnv}
          onDelete={deleteEnv}
          onAdd={addEnv}
          onClose={() => setShowEnvManager(false)}
        />
      )}
    </div>
  )
}

/* ===================== 内部组件 ===================== */

function RequestTabs({ request, updateRequest }) {
  const [activeTab, setActiveTab] = useState('params')

  const tabs = [
    { id: 'params', label: '参数', count: request.params?.filter(p => p.enabled !== false && p.key).length || 0 },
    { id: 'headers', label: 'Headers', count: request.headers?.filter(h => h.enabled !== false && h.key).length || 0 },
    { id: 'body', label: 'Body', badge: request.bodyType !== 'none' ? '●' : null },
  ]

  return (
    <div className="api-req-tabs">
      <div className="api-req-tab-bar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={'api-req-tab' + (activeTab === tab.id ? ' active' : '')}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.badge && <span className="api-badge">{tab.badge}</span>}
            {tab.count > 0 && <span className="api-count">{tab.count}</span>}
          </button>
        ))}
      </div>
      <div className="api-req-tab-content">
        {activeTab === 'params' && <ParamsEditor params={request.params || []} onChange={(params) => updateRequest({ params })} />}
        {activeTab === 'headers' && <HeadersEditor headers={request.headers || []} onChange={(headers) => updateRequest({ headers })} />}
        {activeTab === 'body' && <BodyEditor bodyType={request.bodyType || 'none'} body={request.body || ''} onChange={(patch) => updateRequest(patch)} />}
      </div>
    </div>
  )
}

function ParamsEditor({ params, onChange }) {
  const rows = [...params]

  const handleChange = (idx, field, value) => {
    rows[idx][field] = value
    onChange(rows)
  }

  const handleDelete = (idx) => {
    rows.splice(idx, 1)
    onChange(rows)
  }

  const handleAdd = () => {
    rows.push({ key: '', value: '', enabled: true })
    onChange(rows)
  }

  return (
    <div className="api-kv-editor">
      <table className="api-kv-table">
        <thead>
          <tr>
            <th className="api-kv-check"></th>
            <th className="api-kv-key">参数名</th>
            <th className="api-kv-value">参数值</th>
            <th className="api-kv-action"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className={!row.key && !row.value ? 'api-kv-blank' : ''}>
              <td>
                <input
                  type="checkbox"
                  checked={row.enabled !== false}
                  onChange={e => handleChange(idx, 'enabled', e.target.checked)}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="参数名"
                  value={row.key || ''}
                  onChange={e => handleChange(idx, 'key', e.target.value)}
                  spellCheck={false}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="参数值"
                  value={row.value || ''}
                  onChange={e => handleChange(idx, 'value', e.target.value)}
                  spellCheck={false}
                />
              </td>
              <td>
                <button className="api-btn-icon-small" onClick={() => handleDelete(idx)} title="删除">✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="api-btn-link" onClick={handleAdd}>+ 添加参数</button>
    </div>
  )
}

function HeadersEditor({ headers, onChange }) {
  const rows = [...headers]
  const [showSuggestions, setShowSuggestions] = useState(false)

  const handleChange = (idx, field, value) => {
    rows[idx][field] = value
    onChange(rows)
  }

  const handleDelete = (idx) => {
    rows.splice(idx, 1)
    onChange(rows)
  }

  const handleAdd = (key, value) => {
    rows.pop() // 移除最后的空白行
    rows.push({ key, value: value || '', enabled: true })
    rows.push({ key: '', value: '', enabled: true })
    onChange(rows)
  }

  return (
    <div className="api-kv-editor">
      <table className="api-kv-table">
        <thead>
          <tr>
            <th className="api-kv-check"></th>
            <th className="api-kv-key">Header 名</th>
            <th className="api-kv-value">Header 值</th>
            <th className="api-kv-action"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className={!row.key && !row.value ? 'api-kv-blank' : ''}>
              <td>
                <input
                  type="checkbox"
                  checked={row.enabled !== false}
                  onChange={e => handleChange(idx, 'enabled', e.target.checked)}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="Header 名"
                  value={row.key || ''}
                  onChange={e => {
                    handleChange(idx, 'key', e.target.value)
                    // 显示常用 header 建议
                    if (e.target.value && !e.target.value.includes(':')) setShowSuggestions(true)
                    else setShowSuggestions(false)
                  }}
                  spellCheck={false}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="Header 值"
                  value={row.value || ''}
                  onChange={e => handleChange(idx, 'value', e.target.value)}
                  spellCheck={false}
                />
              </td>
              <td>
                <button className="api-btn-icon-small" onClick={() => handleDelete(idx)} title="删除">✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {showSuggestions && (
        <div className="api-header-suggestions">
          {Object.keys(COMMON_HEADERS).map(h => (
            <button key={h} className="api-chip" onClick={() => handleAdd(h, COMMON_HEADERS[h])}>
              {h}
            </button>
          ))}
        </div>
      )}
      <button className="api-btn-link" onClick={() => handleAdd('', '')}>+ 添加 Header</button>
    </div>
  )
}

function BodyEditor({ bodyType, body, onChange }) {
  const types = [
    { id: 'none', label: '无' },
    { id: 'json', label: 'JSON' },
    { id: 'text', label: '文本' },
    { id: 'form', label: 'Form' },
    { id: 'xml', label: 'XML' },
  ]

  const handleFormat = () => {
    if (bodyType === 'json') {
      try {
        const formatted = JSON.stringify(JSON.parse(body), null, 2)
        onChange({ body: formatted })
      } catch (e) {
        // JSON 无效，不格式化
      }
    }
  }

  const handleTab = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.target
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const val = ta.value
      ta.value = val.slice(0, start) + '  ' + val.slice(end)
      ta.selectionStart = ta.selectionEnd = start + 2
      onChange({ body: ta.value })
    }
  }

  return (
    <div className="api-body-editor">
      <div className="api-body-type-bar">
        {types.map(t => (
          <button
            key={t.id}
            className={'api-body-type-btn' + (bodyType === t.id ? ' active' : '')}
            onClick={() => onChange({ bodyType: t.id })}
          >
            {t.label}
          </button>
        ))}
        {bodyType === 'json' && (
          <button className="api-btn-icon" onClick={handleFormat} title="格式化 JSON">
            ⟳
          </button>
        )}
      </div>

      {bodyType === 'none' && (
        <div className="api-body-empty">该请求没有 Body。选择 JSON / 文本 / Form 以编辑请求体。</div>
      )}

      {bodyType === 'form' && (
        <FormEditor body={body} onChange={(body) => onChange({ body })} />
      )}

      {(bodyType === 'json' || bodyType === 'text' || bodyType === 'xml') && (
        <textarea
          className="api-body-textarea"
          placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : '原始请求体…'}
          value={typeof body === 'string' ? body : ''}
          onChange={e => onChange({ body: e.target.value })}
          onKeyDown={handleTab}
          spellCheck={false}
        />
      )}
    </div>
  )
}

function FormEditor({ body, onChange }) {
  const rows = Array.isArray(body) ? body : [{ key: '', value: '', enabled: true }]

  const handleChange = (idx, field, value) => {
    if (Array.isArray(body)) {
      const newBody = [...body]
      newBody[idx][field] = value
      onChange(newBody)
    }
  }

  const handleAdd = () => {
    if (Array.isArray(body)) {
      onChange([...body, { key: '', value: '', enabled: true }])
    }
  }

  return (
    <div className="api-kv-editor">
      <table className="api-kv-table">
        <thead>
          <tr>
            <th className="api-kv-check"></th>
            <th className="api-kv-key">字段名</th>
            <th className="api-kv-value">字段值</th>
            <th className="api-kv-action"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              <td>
                <input
                  type="checkbox"
                  checked={row.enabled !== false}
                  onChange={e => handleChange(idx, 'enabled', e.target.checked)}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="字段名"
                  value={row.key || ''}
                  onChange={e => handleChange(idx, 'key', e.target.value)}
                  spellCheck={false}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="字段值"
                  value={row.value || ''}
                  onChange={e => handleChange(idx, 'value', e.target.value)}
                  spellCheck={false}
                />
              </td>
              <td>
                <button className="api-btn-icon-small" onClick={() => {
                  if (Array.isArray(body)) {
                    const newBody = body.filter((_, i) => i !== idx)
                    onChange(newBody.length ? newBody : [{ key: '', value: '', enabled: true }])
                  }
                }}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="api-btn-link" onClick={handleAdd}>+ 添加字段</button>
    </div>
  )
}

function EnvManager({ envs, activeEnvId, onUpdate, onDelete, onAdd, onClose }) {
  const [editId, setEditId] = useState(activeEnvId || envs[0]?.id)
  const editEnv = envs.find(e => e.id === editId)

  return (
    <div className="api-modal-overlay" onClick={onClose}>
      <div className="api-modal api-env-manager" onClick={e => e.stopPropagation()}>
        <div className="api-modal-header">
          <h3>环境与变量管理</h3>
          <button className="api-btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="api-modal-body">
          <div className="api-env-list">
            {envs.map(env => (
              <div
                key={env.id}
                className={'api-env-list-item' + (env.id === editId ? ' active' : '')}
                onClick={() => setEditId(env.id)}
              >
                <span className="api-env-dot" />
                <span className="api-env-name">{env.name}</span>
                {env.id === activeEnvId && <span className="api-env-active">●</span>}
                <button className="api-btn-icon-small" onClick={(e) => { e.stopPropagation(); onDelete(env.id) }}>✕</button>
              </div>
            ))}
            <button className="api-btn-link" onClick={onAdd}>+ 新建环境</button>
          </div>
          {editEnv && (
            <div className="api-env-form">
              <div className="api-field">
                <label>环境名称</label>
                <input
                  type="text"
                  value={editEnv.name}
                  onChange={e => onUpdate(editEnv.id, { name: e.target.value })}
                />
              </div>
              <div className="api-field">
                <label>baseUrl（IP + 端口）</label>
                <input
                  type="text"
                  placeholder="http://127.0.0.1:8080"
                  value={editEnv.baseUrl || ''}
                  onChange={e => onUpdate(editEnv.id, { baseUrl: e.target.value })}
                />
              </div>
              <div className="api-field">
                <label>变量</label>
                {(editEnv.vars || []).map((v, idx) => (
                  <div key={idx} className="api-env-var-row">
                    <input
                      type="checkbox"
                      checked={v.enabled !== false}
                      onChange={e => {
                        const vars = [...(editEnv.vars || [])]
                        vars[idx] = { ...vars[idx], enabled: e.target.checked }
                        onUpdate(editEnv.id, { vars })
                      }}
                    />
                    <input
                      type="text"
                      placeholder="变量名"
                      value={v.key || ''}
                      onChange={e => {
                        const vars = [...(editEnv.vars || [])]
                        vars[idx] = { ...vars[idx], key: e.target.value }
                        onUpdate(editEnv.id, { vars })
                      }}
                    />
                    <input
                      type="text"
                      placeholder="变量值"
                      value={v.value || ''}
                      onChange={e => {
                        const vars = [...(editEnv.vars || [])]
                        vars[idx] = { ...vars[idx], value: e.target.value }
                        onUpdate(editEnv.id, { vars })
                      }}
                    />
                    <button className="api-btn-icon-small" onClick={() => {
                      const vars = (editEnv.vars || []).filter((_, i) => i !== idx)
                      onUpdate(editEnv.id, { vars: vars.length ? vars : [{ key: '', value: '', enabled: true }] })
                    }}>✕</button>
                  </div>
                ))}
                <button className="api-btn-link" onClick={() => {
                  const vars = [...(editEnv.vars || []), { key: '', value: '', enabled: true }]
                  onUpdate(editEnv.id, { vars })
                }}>+ 添加变量</button>
              </div>
              <div className="api-field">
                <button
                  className={'api-btn' + (editEnv.id === activeEnvId ? ' api-btn-primary' : '')}
                  onClick={() => store.set('activeEnv', editEnv.id)}
                >
                  {editEnv.id === activeEnvId ? '✓ 当前环境' : '设为当前环境'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}