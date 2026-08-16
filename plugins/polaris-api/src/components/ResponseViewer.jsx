// components/ResponseViewer.jsx — 响应查看器
// 支持 JSON 树/表格/原始视图、路径下钻、错误诊断、响应对比

import { useState, useEffect, useCallback } from 'react'
import { store } from '../core/store.js'
import { formatBytes, formatMs } from '../core/http.js'

export default function ResponseViewer() {
  const [response, setResponse] = useState(() => store.get('response'))
  const [viewMode, setViewMode] = useState('pretty')
  const [drillPath, setDrillPath] = useState('')
  const [filterText, setFilterText] = useState('')
  const [compareMode, setCompareMode] = useState(false)

  useEffect(() => {
    const unsub = store.subscribe('response', (val) => {
      setResponse(val)
      if (val && !val.error) {
        setViewMode(val.parsed ? 'pretty' : 'raw')
      }
    })
    return () => unsub()
  }, [])

  // 路径下钻
  const getDrilledData = useCallback(() => {
    if (!response?.parsed) return { data: null, hasJSON: false }
    let data = response.parsed
    if (drillPath) {
      const parts = drillPath.split(/[.[\]]/).filter(Boolean)
      for (const p of parts) {
        if (data == null) return { data: null, hasJSON: false, error: '路径不存在' }
        data = data[p]
      }
    }
    const hasJSON = data !== undefined
    const canTable = hasJSON && (Array.isArray(data) || (data && typeof data === 'object'))
    const canPretty = hasJSON && typeof data === 'object'
    return { data, hasJSON, canTable, canPretty }
  }, [response, drillPath])

  const drilled = getDrilledData()

  // 收集路径
  const collectPaths = useCallback((obj, prefix = '') => {
    const paths = [{ path: prefix, kind: 'root' }]
    if (obj && typeof obj === 'object') {
      if (Array.isArray(obj)) {
        paths.push({ path: prefix || '', kind: 'array', count: obj.length })
        if (obj.length > 0 && typeof obj[0] === 'object') {
          paths.push(...collectPaths(obj[0], prefix ? prefix + '[0]' : '[0]'))
        }
      } else {
        const keys = Object.keys(obj)
        paths.push({ path: prefix || '', kind: 'object', count: keys.length })
        for (const key of keys.slice(0, 10)) {
          const val = obj[key]
          const childPath = prefix ? prefix + '.' + key : key
          if (val && typeof val === 'object') {
            paths.push(...collectPaths(val, childPath))
          }
        }
      }
    }
    return paths
  }, [])

  const paths = response?.parsed ? collectPaths(response.parsed) : []

  if (!response) {
    return (
      <div className="api-response-idle">
        <div className="api-idle-icon">⇅</div>
        <div className="api-idle-text">输入 URL 并点击发送</div>
        <div className="api-idle-hints">
          支持 REST API / GraphQL / WebSocket<br />
          可用 AI 辅助生成请求
        </div>
      </div>
    )
  }

  if (response.error) {
    return (
      <div className="api-response-error">
        <div className="api-error-header">
          <span className="api-error-icon">⚠</span>
          <span>请求失败</span>
        </div>
        <div className="api-error-message">{response.error}</div>
        {response.corsHint && (
          <div className="api-error-hint">
            <b>可能原因：</b>跨域 CORS、目标无响应、混合内容(HTTP/HTTPS)、或网络不可达。
            <br />👉 开启顶栏「代理」可绕过 CORS 限制。
          </div>
        )}
        <div className="api-error-meta">
          耗时 {formatMs(response.timeMs)} · {response.url}
        </div>
      </div>
    )
  }

  return (
    <div className="api-response-viewer">
      {/* 状态栏 */}
      <div className="api-res-statusbar">
        <span className={'api-status-code s' + Math.floor(response.status / 100)}>
          <span className="api-status-dot" />
          {response.status} {response.statusText}
        </span>
        <span className="api-res-meta">
          <span>耗时 <b>{formatMs(response.timeMs)}</b></span>
          <span>大小 <b>{formatBytes(response.size)}</b></span>
          <span>类型 <b>{response.contentType}</b></span>
        </span>
        <span className="api-res-spacer" />
        <button
          className={'api-btn-icon' + (compareMode ? ' active' : '')}
          onClick={() => setCompareMode(!compareMode)}
          title="对比模式"
        >
          ⇄
        </button>
      </div>

      {/* 视图切换 */}
      <div className="api-res-toolbar">
        <div className="api-res-views">
          {drilled.canTable && (
            <button className={'api-res-view-btn' + (viewMode === 'table' ? ' active' : '')} onClick={() => setViewMode('table')}>
              表格
            </button>
          )}
          {drilled.canPretty && (
            <button className={'api-res-view-btn' + (viewMode === 'pretty' ? ' active' : '')} onClick={() => setViewMode('pretty')}>
              对象
            </button>
          )}
          <button className={'api-res-view-btn' + (viewMode === 'raw' ? ' active' : '')} onClick={() => setViewMode('raw')}>
            原始
          </button>
          {!drillPath && response.contentType?.includes('html') && (
            <button className={'api-res-view-btn' + (viewMode === 'preview' ? ' active' : '')} onClick={() => setViewMode('preview')}>
              预览
            </button>
          )}
          <button className={'api-res-view-btn' + (viewMode === 'headers' ? ' active' : '')} onClick={() => setViewMode('headers')}>
            Headers
          </button>
        </div>

        {/* 路径下钻 */}
        {response.parsed && (
          <div className="api-res-path">
            <span className="api-res-label">路径</span>
            <select
              className="api-res-select"
              value={drillPath}
              onChange={e => setDrillPath(e.target.value)}
            >
              <option value="">(根)</option>
              {paths.slice(1).map((p, i) => (
                <option key={i} value={p.path}>
                  {p.path} {p.kind === 'array' ? `[${p.count}]` : p.kind === 'object' ? `{${p.count}}` : ''}
                </option>
              ))}
            </select>
            <input
              className="api-res-path-input"
              type="text"
              placeholder="手动输入路径如 data.items[0].name"
              value={drillPath}
              onChange={e => setDrillPath(e.target.value)}
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* 响应体 */}
      <div className="api-res-body">
        {viewMode === 'pretty' && <PrettyView data={drilled.data} filter={filterText} />}
        {viewMode === 'table' && <TableView data={drilled.data} filter={filterText} />}
        {viewMode === 'raw' && <RawView data={drilled.data} text={response.text} />}
        {viewMode === 'preview' && <PreviewView response={response} />}
        {viewMode === 'headers' && <HeadersView headers={response.headers} />}
      </div>
    </div>
  )
}

/* ===================== 子视图组件 ===================== */

function PrettyView({ data, filter }) {
  const [expanded, setExpanded] = useState({})

  if (data == null || data === undefined) {
    return <div className="api-res-empty">无数据</div>
  }

  if (typeof data !== 'object') {
    return <div className="api-res-scalar">{JSON.stringify(data)}</div>
  }

  const toggleExpand = (path) => {
    setExpanded(prev => ({ ...prev, [path]: !prev[path] }))
  }

  const renderValue = (value, key, path, depth = 0) => {
    if (depth > 10) return <span className="api-res-too-deep">…深度限制</span>

    const fullPath = path ? `${path}.${key}` : key
    const isExpanded = expanded[fullPath] !== false // 默认展开

    if (value === null) return <span className="api-res-null">null</span>
    if (typeof value === 'boolean') return <span className="api-res-bool">{String(value)}</span>
    if (typeof value === 'number') return <span className="api-res-num">{value}</span>
    if (typeof value === 'string') {
      // 尝试格式化字符串
      if (/^https?:\/\//.test(value)) {
        return <a className="api-res-link" href={value} target="_blank" rel="noreferrer">{value}</a>
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return <span className="api-res-date">{value}</span>
      }
      return <span className="api-res-str">"{value}"</span>
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="api-res-empty-arr">[]</span>
      const items = filter
        ? value.filter(item => JSON.stringify(item).toLowerCase().includes(filter.toLowerCase()))
        : value

      return (
        <div className="api-res-array">
          <span className="api-res-toggle" onClick={() => toggleExpand(fullPath)}>
            {isExpanded ? '▼' : '▶'} Array[{value.length}]
          </span>
          {isExpanded && (
            <div className="api-res-array-items">
              {items.map((item, i) => (
                <div key={i} className="api-res-array-item">
                  <span className="api-res-index">{i}: </span>
                  {renderValue(item, i, fullPath, depth + 1)}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value)
      if (keys.length === 0) return <span className="api-res-empty-obj">{}</span>
      const filteredKeys = filter
        ? keys.filter(k => k.toLowerCase().includes(filter.toLowerCase()) || JSON.stringify(value[k]).toLowerCase().includes(filter.toLowerCase()))
        : keys

      return (
        <div className="api-res-object">
          <span className="api-res-toggle" onClick={() => toggleExpand(fullPath)}>
            {isExpanded ? '▼' : '▶'} {'{'} {keys.length} {'}'}
          </span>
          {isExpanded && (
            <div className="api-res-object-items">
              {filteredKeys.map(k => (
                <div key={k} className="api-res-object-item">
                  <span className="api-res-key">"{k}": </span>
                  {renderValue(value[k], k, fullPath, depth + 1)}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    return <span>{String(value)}</span>
  }

  return (
    <div className="api-res-pretty">
      <div className="api-res-pretty-tools">
        <button className="api-btn-icon" onClick={() => setExpanded({})}>⊟ 折叠</button>
        <button className="api-btn-icon" onClick={() => {
          const all = {}
          const expandAll = (obj, path = '') => {
            if (obj && typeof obj === 'object') {
              for (const key of Object.keys(obj)) {
                const fullPath = path ? `${path}.${key}` : key
                all[fullPath] = true
                expandAll(obj[key], fullPath)
              }
            }
          }
          expandAll(data)
          setExpanded(all)
        }}>⊞ 展开</button>
        <input
          className="api-res-filter-input"
          type="text"
          placeholder="过滤字段..."
          onChange={e => { /* 父组件传 filter 进来 */ }}
          spellCheck={false}
        />
      </div>
      {renderValue(data, '', '', 0, 0)}
    </div>
  )
}

function TableView({ data, filter }) {
  if (!data) return <div className="api-res-empty">无数据</div>

  // 如果不是数组，转为单元素数组
  const rows = Array.isArray(data) ? data : [data]
  if (rows.length === 0) return <div className="api-res-empty">空数组</div>

  // 获取列
  const columns = new Set()
  rows.forEach(row => {
    if (row && typeof row === 'object') {
      Object.keys(row).forEach(k => columns.add(k))
    }
  })
  const cols = [...columns]

  const filteredRows = filter
    ? rows.filter(row => JSON.stringify(row).toLowerCase().includes(filter.toLowerCase()))
    : rows

  return (
    <div className="api-res-table-wrap">
      <table className="api-res-table">
        <thead>
          <tr>
            <th className="api-res-row-num">#</th>
            {cols.map(col => <th key={col}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row, i) => (
            <tr key={i}>
              <td className="api-res-row-num">{i}</td>
              {cols.map(col => (
                <td key={col} className="api-res-cell">
                  <CellValue value={row?.[col]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {filteredRows.length !== rows.length && (
        <div className="api-res-filter-info">
          显示 {filteredRows.length} / {rows.length} 行
        </div>
      )}
    </div>
  )
}

function CellValue({ value }) {
  if (value === null || value === undefined) return <span className="api-res-null">null</span>
  if (typeof value === 'boolean') return <span className="api-res-bool">{String(value)}</span>
  if (typeof value === 'number') return <span className="api-res-num">{value}</span>
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) {
      return <a className="api-res-link" href={value} target="_blank" rel="noreferrer" title={value}>🔗</a>
    }
    if (value.length > 100) return <span title={value}>{value.slice(0, 100)}…</span>
    return <span>{value}</span>
  }
  if (Array.isArray(value)) return <span className="api-res-badge">[{value.length}]</span>
  if (typeof value === 'object') return <span className="api-res-badge">{'{' + Object.keys(value).length + '}'}</span>
  return <span>{String(value)}</span>
}

function RawView({ data, text }) {
  const content = data !== undefined ? JSON.stringify(data, null, 2) : text
  return (
    <pre className="api-res-raw">
      <code>{content}</code>
    </pre>
  )
}

function PreviewView({ response }) {
  if (response.isBinary && response.blobUrl) {
    if (/^image\//.test(response.contentType)) {
      return (
        <div className="api-res-preview-img">
          <img src={response.blobUrl} alt="response" />
        </div>
      )
    }
    return <div className="api-res-empty">二进制响应（不可预览）</div>
  }
  if (response.contentType?.includes('html')) {
    return (
      <iframe
        className="api-res-preview-frame"
        sandbox=""
        srcDoc={response.text}
        title="response preview"
      />
    )
  }
  return <div className="api-res-empty">无可用预览</div>
}

function HeadersView({ headers }) {
  if (!headers || !Object.keys(headers).length) {
    return <div className="api-res-empty">无响应头</div>
  }
  return (
    <div className="api-res-headers">
      <table className="api-res-table">
        <thead>
          <tr>
            <th>Header</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(headers).map(([k, v]) => (
            <tr key={k}>
              <td className="api-res-header-key">{k}</td>
              <td className="api-res-header-value">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}