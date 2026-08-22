// components/RequestEditor.jsx — 请求编辑器
// 多 tab + 非变异 + URL↔params 双向同步 + cURL 导入导出 + 代码生成 + AI 协同
// 零 emoji；无 alert/prompt/confirm（用内联模态）

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { store, uid } from '../core/store.js'
import { resolveTemplates } from '../core/template.js'
import { parseCurl, toCurl, generateCode, detectImportType, parsePostmanCollection, parseOpenAPI, parseHAR } from '../core/parser.js'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const METHOD_COLORS = { GET: 'm-get', POST: 'm-post', PUT: 'm-put', PATCH: 'm-patch', DELETE: 'm-del', HEAD: 'm-other', OPTIONS: 'm-other' }
const COMMON_HEADERS = { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json', Authorization: 'Bearer ', 'Cache-Control': 'no-cache' }

const blankRow = () => ({ id: uid(), enabled: true, key: '', value: '' })

export default function RequestEditor({ onSendToChat, onSend, sending, activeTab, updateTab }) {
  const [envs, setEnvs] = useState(() => store.get('envs') || [])
  const [activeEnvId, setActiveEnvId] = useState(() => store.get('activeEnv'))
  const [showMethodMenu, setShowMethodMenu] = useState(false)
  const [showEnvMenu, setShowEnvMenu] = useState(false)
  const [showEnvManager, setShowEnvManager] = useState(false)
  const [showCurlImport, setShowCurlImport] = useState(false)
  const [curlInput, setCurlInput] = useState('')
  const [showCodeGen, setShowCodeGen] = useState(false)
  const [codeLang, setCodeLang] = useState('curl')
  const [toast, setToast] = useState('')

  useEffect(() => {
    const u1 = store.subscribe('envs', (v) => setEnvs(v || []))
    const u2 = store.subscribe('activeEnv', (v) => setActiveEnvId(v))
    return () => { u1(); u2() }
  }, [])

  const activeEnv = envs.find(e => e.id === activeEnvId)
  const request = activeTab

  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 1500) }, [])

  // URL 预览（变量解析）
  const urlPreview = useMemo(() => {
    if (!request?.url || request.url.indexOf('{{') < 0) return ''
    return resolveTemplates(request.url, activeEnv)
  }, [request?.url, activeEnv])
  const [urlPreviewState, setUrlPreviewState] = useState('')
  useEffect(() => { setUrlPreviewState(urlPreview) }, [urlPreview])

  const update = useCallback((patch) => { updateTab(activeTab.id, patch) }, [activeTab, updateTab])

  // URL 输入：仅更新 URL 字段，不自动改 params（避免双向冲突）
  const handleUrlInput = useCallback((e) => {
    update({ url: e.target.value })
  }, [update])

  // URL 失焦：把 URL 里的 query 同步到 params（单向：URL→params）
  const handleUrlBlur = useCallback(() => {
    if (!request?.url) return
    const qIdx = request.url.indexOf('?')
    if (qIdx < 0) return
    const query = request.url.slice(qIdx + 1)
    const baseUrl = request.url.slice(0, qIdx)
    if (!query) return
    const params = query.split('&').filter(Boolean).map(p => {
      const eq = p.indexOf('=')
      return eq >= 0
        ? { id: uid(), enabled: true, key: decodeURIComponent(p.slice(0, eq)), value: decodeURIComponent(p.slice(eq + 1)) }
        : { id: uid(), enabled: true, key: decodeURIComponent(p), value: '' }
    })
    params.push(blankRow())
    update({ url: baseUrl, params })
  }, [request, update])

  // params 编辑：同步回 URL（单向：params→URL）
  const syncParamsToUrl = useCallback((params) => {
    if (!request) return
    const base = request.url.split('?')[0]
    const qs = params.filter(p => p.enabled !== false && p.key).map(p => encodeURIComponent(p.key) + '=' + encodeURIComponent(p.value || '')).join('&')
    update({ params, url: qs ? base + '?' + qs : base })
  }, [request, update])

  // 键盘快捷键
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSend() }
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); showToast('请用侧栏「保存」按钮') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSend, showToast])

  // cURL 导入
  const handleCurlImport = useCallback(() => {
    try {
      const parsed = parseCurl(curlInput)
      update({ method: parsed.method, url: parsed.url, params: parsed.params, headers: parsed.headers, body: parsed.body, bodyType: parsed.bodyType, formBody: parsed.formBody })
      setShowCurlImport(false); setCurlInput('')
      showToast('cURL 已导入')
    } catch (e) { showToast('cURL 解析失败：' + e.message) }
  }, [curlInput, update, showToast])

  // 复制 cURL
  const handleCopyCurl = useCallback(() => {
    const curl = toCurl(request)
    navigator.clipboard.writeText(curl).then(() => showToast('cURL 已复制')).catch(() => {})
  }, [request, showToast])

  // 代码生成
  const generatedCode = useMemo(() => request ? generateCode(request, codeLang) : '', [request, codeLang])
  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(generatedCode).then(() => showToast(codeLang + ' 代码已复制')).catch(() => {})
  }, [generatedCode, codeLang, showToast])

  // AI 协同：生成请求
  const askAIGenerate = useCallback(() => {
    if (!onSendToChat) { showToast('AI 不可用'); return }
    onSendToChat('请根据我的描述生成一个 API 请求（method、URL、headers、body），我会描述需求：')
    showToast('已发送到聊天，请在主聊天描述需求')
  }, [onSendToChat, showToast])

  if (!request) return null

  return (
    <div className="pa-req-editor" onClick={() => { setShowMethodMenu(false); setShowEnvMenu(false) }}>
      {/* 请求栏 */}
      <div className="pa-req-bar">
        <div className="pa-method-wrap" onClick={(e) => e.stopPropagation()}>
          <button className={'pa-method-btn ' + (METHOD_COLORS[request.method] || 'm-other')} onClick={() => setShowMethodMenu(!showMethodMenu)}>
            {request.method || 'GET'} <span className="pa-car">▾</span>
          </button>
          {showMethodMenu && (
            <div className="pa-dropdown pa-method-menu">
              {METHODS.map(m => (
                <button key={m} className={'pa-dropdown-item ' + (METHOD_COLORS[m] || 'm-other') + (m === request.method ? ' active' : '')} onClick={() => { update({ method: m }); setShowMethodMenu(false) }}>{m}</button>
              ))}
            </div>
          )}
        </div>
        <div className="pa-url-wrap">
          <input className="pa-url-input" type="text" placeholder="请求 URL，支持 {{baseUrl}} {{变量}} 模板" value={request.url || ''} onChange={handleUrlInput} onBlur={handleUrlBlur} spellCheck={false} />
          {urlPreviewState && <div className="pa-url-preview">→ <span className="pa-url-resolved">{urlPreviewState}</span></div>}
        </div>
        <button className="pa-btn pa-btn-primary" onClick={onSend} disabled={sending}>{sending ? '发送中' : '发送'}<span className="pa-kbd">⌘↵</span></button>
        <button className="pa-btn" onClick={() => setShowCurlImport(!showCurlImport)} title="导入 cURL">cURL</button>
        <button className="pa-btn-icon" onClick={handleCopyCurl} title="复制为 cURL">复制</button>
        <button className="pa-btn-icon" onClick={() => setShowCodeGen(!showCodeGen)} title="代码生成">代码</button>
        {onSendToChat && <button className="pa-btn-icon" onClick={askAIGenerate} title="AI 生成请求">AI</button>}
      </div>

      {/* cURL 导入 */}
      {showCurlImport && (
        <div className="pa-curl-import">
          <textarea className="pa-curl-input" placeholder="粘贴 cURL 命令..." value={curlInput} onChange={(e) => setCurlInput(e.target.value)} rows={3} spellCheck={false} />
          <div className="pa-curl-actions">
            <button className="pa-btn" onClick={() => { setShowCurlImport(false); setCurlInput('') }}>取消</button>
            <button className="pa-btn pa-btn-primary" onClick={handleCurlImport} disabled={!curlInput.trim()}>解析并导入</button>
          </div>
        </div>
      )}

      {/* 代码生成 */}
      {showCodeGen && (
        <div className="pa-code-gen">
          <div className="pa-code-lang">
            {['curl', 'python', 'javascript', 'go', 'rust'].map(l => (
              <button key={l} className={'pa-code-lang-btn' + (codeLang === l ? ' active' : '')} onClick={() => setCodeLang(l)}>{l}</button>
            ))}
            <span className="pa-spacer" />
            <button className="pa-btn-icon" onClick={handleCopyCode}>复制</button>
          </div>
          <pre className="pa-code-out"><code>{generatedCode}</code></pre>
        </div>
      )}

      {/* 参数/Headers/Body */}
      <RequestTabs request={request} update={update} />

      {/* 环境切换 */}
      <div className="pa-env-bar" onClick={(e) => e.stopPropagation()}>
        <span className="pa-env-label">环境</span>
        <button className="pa-env-btn" onClick={() => setShowEnvMenu(!showEnvMenu)}>
          {activeEnv?.name || '无环境'} <span className="pa-car">▾</span>
        </button>
        {showEnvMenu && (
          <div className="pa-dropdown pa-env-menu">
            {envs.map(env => (
              <button key={env.id} className={'pa-dropdown-item' + (env.id === activeEnvId ? ' active' : '')} onClick={() => { store.set('activeEnv', env.id); setShowEnvMenu(false) }}>
                <span className="pa-env-dot" />{env.name}{env.baseUrl && <span className="pa-env-url">{env.baseUrl}</span>}
              </button>
            ))}
            <div className="pa-dropdown-divider" />
            <button className="pa-dropdown-item" onClick={() => { setShowEnvMenu(false); setShowEnvManager(true) }}>管理环境</button>
          </div>
        )}
        {activeEnv?.baseUrl && <span className="pa-env-baseurl">baseUrl: {activeEnv.baseUrl}</span>}
      </div>

      {showEnvManager && <EnvManager envs={envs} activeEnvId={activeEnvId} onClose={() => setShowEnvManager(false)} />}

      {toast && <div className="pa-toast">{toast}</div>}
    </div>
  )
}

/* ===================== 请求 Tab 区 ===================== */
function RequestTabs({ request, update }) {
  const [activeTab, setActiveTab] = useState('params')
  const params = request.params || [blankRow()]
  const headers = request.headers || [blankRow()]
  const tabs = [
    { id: 'params', label: '参数', count: params.filter(p => p.enabled !== false && p.key).length },
    { id: 'headers', label: 'Headers', count: headers.filter(h => h.enabled !== false && h.key).length },
    { id: 'body', label: 'Body', badge: request.bodyType !== 'none' },
  ]
  return (
    <div className="pa-req-tabs">
      <div className="pa-req-tab-bar">
        {tabs.map(t => (
          <button key={t.id} className={'pa-req-tab' + (activeTab === t.id ? ' active' : '')} onClick={() => setActiveTab(t.id)}>
            {t.label}
            {t.badge && <span className="pa-badge-dot" />}
            {t.count > 0 && <span className="pa-count">{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="pa-req-tab-content">
        {activeTab === 'params' && <KVEditor rows={params} onChange={(rows) => update({ params: rows })} keyPlaceholder="参数名" valuePlaceholder="参数值" />}
        {activeTab === 'headers' && <KVEditor rows={headers} onChange={(rows) => update({ headers: rows })} keyPlaceholder="Header 名" valuePlaceholder="Header 值" suggestions={COMMON_HEADERS} />}
        {activeTab === 'body' && <BodyEditor bodyType={request.bodyType || 'none'} body={request.body || ''} formBody={request.formBody} update={update} />}
      </div>
    </div>
  )
}

/* ===================== KV 编辑器（非变异） ===================== */
function KVEditor({ rows, onChange, keyPlaceholder, valuePlaceholder, suggestions }) {
  const [showSuggest, setShowSuggest] = useState(false)
  const updateRow = (idx, patch) => {
    const newRows = rows.map((r, i) => i === idx ? { ...r, ...patch } : r)
    // 自动追加空行
    if (idx === rows.length - 1 && (patch.key || patch.value)) newRows.push(blankRow())
    onChange(newRows)
  }
  const deleteRow = (idx) => onChange(rows.filter((_, i) => i !== idx))
  const addRow = (key, value) => {
    const newRows = [...rows]
    if (newRows.length && !newRows[newRows.length - 1].key && !newRows[newRows.length - 1].value) newRows.pop()
    newRows.push({ id: uid(), enabled: true, key, value: value || '' })
    newRows.push(blankRow())
    onChange(newRows)
  }
  return (
    <div className="pa-kv">
      <table className="pa-kv-table">
        <thead><tr><th className="pa-kv-check"></th><th>{keyPlaceholder}</th><th>{valuePlaceholder}</th><th></th></tr></thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id || idx} className={!row.key && !row.value ? 'pa-kv-blank' : ''}>
              <td><input type="checkbox" checked={row.enabled !== false} onChange={(e) => updateRow(idx, { enabled: e.target.checked })} /></td>
              <td><input type="text" placeholder={keyPlaceholder} value={row.key || ''} onChange={(e) => { updateRow(idx, { key: e.target.value }); if (suggestions && e.target.value) setShowSuggest(true) }} spellCheck={false} /></td>
              <td><input type="text" placeholder={valuePlaceholder} value={row.value || ''} onChange={(e) => updateRow(idx, { value: e.target.value })} spellCheck={false} /></td>
              <td><button className="pa-btn-icon-small" onClick={() => deleteRow(idx)} title="删除">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {suggestions && showSuggest && (
        <div className="pa-suggestions">
          {Object.keys(suggestions).filter(h => !rows.some(r => r.key === h)).map(h => (
            <button key={h} className="pa-chip" onClick={() => { addRow(h, suggestions[h]); setShowSuggest(false) }}>{h}</button>
          ))}
        </div>
      )}
      <button className="pa-btn-link" onClick={() => onChange([...rows, blankRow()])}>+ 添加</button>
    </div>
  )
}

/* ===================== Body 编辑器 ===================== */
function BodyEditor({ bodyType, body, formBody, update }) {
  const types = [['none', '无'], ['json', 'JSON'], ['text', '文本'], ['form', 'Form'], ['xml', 'XML']]
  const formatJSON = () => {
    if (bodyType === 'json') { try { update({ body: JSON.stringify(JSON.parse(body), null, 2) }) } catch (e) {} }
  }
  const handleTab = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.target
      const s = ta.selectionStart, en = ta.selectionEnd
      const val = ta.value
      ta.value = val.slice(0, s) + '  ' + val.slice(en)
      ta.selectionStart = ta.selectionEnd = s + 2
      update({ body: ta.value })
    }
  }
  return (
    <div className="pa-body-editor">
      <div className="pa-body-type-bar">
        {types.map(([v, l]) => <button key={v} className={'pa-body-type-btn' + (bodyType === v ? ' active' : '')} onClick={() => update({ bodyType: v })}>{l}</button>)}
        {bodyType === 'json' && <button className="pa-btn-icon" onClick={formatJSON} title="格式化 JSON">格式化</button>}
      </div>
      {bodyType === 'none' && <div className="pa-body-empty">该请求没有 Body。选择 JSON / 文本 / Form / XML 以编辑。</div>}
      {bodyType === 'form' && <KVEditor rows={Array.isArray(formBody) ? formBody : [blankRow()]} onChange={(rows) => update({ formBody: rows })} keyPlaceholder="字段名" valuePlaceholder="字段值" />}
      {(bodyType === 'json' || bodyType === 'text' || bodyType === 'xml') && (
        <textarea className="pa-body-textarea" placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : '原始请求体...'} value={typeof body === 'string' ? body : ''} onChange={(e) => update({ body: e.target.value })} onKeyDown={handleTab} spellCheck={false} />
      )}
    </div>
  )
}

/* ===================== 环境管理器（模态） ===================== */
function EnvManager({ envs, activeEnvId, onClose }) {
  const [editId, setEditId] = useState(activeEnvId || envs[0]?.id)
  const editEnv = envs.find(e => e.id === editId)
  const updateEnv = (id, patch) => {
    const newEnvs = envs.map(e => e.id === id ? { ...e, ...patch } : e)
    store.set('envs', newEnvs)
  }
  const addEnv = () => {
    const ne = { id: uid(), name: '环境 ' + (envs.length + 1), baseUrl: '', vars: [blankRow()] }
    store.set('envs', [...envs, ne])
    store.set('activeEnv', ne.id)
    setEditId(ne.id)
  }
  const deleteEnv = (id) => {
    const newEnvs = envs.filter(e => e.id !== id)
    store.set('envs', newEnvs)
    if (activeEnvId === id) store.set('activeEnv', newEnvs[0]?.id || null)
    if (editId === id) setEditId(newEnvs[0]?.id)
  }
  return (
    <div className="pa-modal-overlay" onClick={onClose}>
      <div className="pa-modal pa-env-manager" onClick={(e) => e.stopPropagation()}>
        <div className="pa-modal-header"><h3>环境与变量</h3><button className="pa-btn-icon" onClick={onClose}>✕</button></div>
        <div className="pa-modal-body">
          <div className="pa-env-list">
            {envs.map(env => (
              <div key={env.id} className={'pa-env-list-item' + (env.id === editId ? ' active' : '')} onClick={() => setEditId(env.id)}>
                <span className="pa-env-dot" />{env.name}{env.id === activeEnvId && <span className="pa-env-active">●</span>}
                <button className="pa-btn-icon-small" onClick={(e) => { e.stopPropagation(); deleteEnv(env.id) }}>✕</button>
              </div>
            ))}
            <button className="pa-btn-link" onClick={addEnv}>+ 新建环境</button>
          </div>
          {editEnv && (
            <div className="pa-env-form">
              <div className="pa-field"><label>环境名称</label><input type="text" value={editEnv.name} onChange={(e) => updateEnv(editEnv.id, { name: e.target.value })} /></div>
              <div className="pa-field"><label>baseUrl（IP + 端口）</label><input type="text" placeholder="http://127.0.0.1:8080" value={editEnv.baseUrl || ''} onChange={(e) => updateEnv(editEnv.id, { baseUrl: e.target.value })} /></div>
              <div className="pa-field"><label>变量</label>
                <div className="pa-env-vars">
                  <KVEditor rows={editEnv.vars || [blankRow()]} onChange={(rows) => updateEnv(editEnv.id, { vars: rows })} keyPlaceholder="变量名" valuePlaceholder="值" />
                </div>
              </div>
              <button className={'pa-btn' + (editEnv.id === activeEnvId ? ' pa-btn-primary' : '')} onClick={() => store.set('activeEnv', editEnv.id)}>{editEnv.id === activeEnvId ? '当前环境' : '设为当前'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}