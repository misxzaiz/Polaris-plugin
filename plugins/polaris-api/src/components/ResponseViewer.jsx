// components/ResponseViewer.jsx — 智能响应查看器
// 对象树/表格/原始/Headers/预览 + 增强过滤 + 路径下钻 + 智能单元格 + 下载/复制
// 零 emoji；React 非变异

import { useState, useEffect, useCallback, useMemo } from 'react'
import { store } from '../core/store.js'
import { formatBytes, formatMs } from '../core/http.js'
import { getByPath, collectPaths, parseFilter, astHighlightTerms, rowMatchesAST, cellMeta, fmtDate, fileName, tableCandidates, responseFields } from '../core/json-view.js'

export default function ResponseViewer({ onSendToChat, request }) {
  // response 直接从当前 tab 的 request.response 读取（MainPanel 发送后写入 tab.response）
  const response = request?.response
  const [viewMode, setViewMode] = useState('pretty')
  const [drillPath, setDrillPath] = useState('')
  const [filterText, setFilterText] = useState('')
  const [pretty, setPretty] = useState(true)
  const [treeOpen, setTreeOpen] = useState('auto') // 'auto' | 'all' | 'none'
  const [tableSel, setTableSel] = useState('')
  const [hiddenCols, setHiddenCols] = useState({})
  const [colOrder, setColOrder] = useState({})
  const [sort, setSort] = useState({})
  const [showPathMenu, setShowPathMenu] = useState(false)
  const [pathFilter, setPathFilter] = useState('')
  const [copied, setCopied] = useState(false)

  // 响应变化时重置视图状态（新请求到达时）
  useEffect(() => {
    if (response && !response.error) {
      setViewMode(response.parsed !== undefined ? (Array.isArray(response.parsed) ? 'table' : 'pretty') : (/text\/html/i.test(response.contentType) ? 'preview' : 'raw'))
      setDrillPath(''); setFilterText(''); setTableSel(''); setHiddenCols({}); setColOrder({}); setSort({})
    }
  }, [response])

  // 路径下钻数据
  const drilled = useMemo(() => {
    if (!response || response.error) return { data: undefined, hasJSON: false, canTable: false, canPreview: false }
    const root = response.parsed !== undefined ? response.parsed : undefined
    let data = root
    if (drillPath && root !== undefined) { const g = getByPath(root, drillPath); data = g.ok ? g.value : undefined }
    const hasJSON = data !== undefined
    const canTable = hasJSON && (Array.isArray(data) || (data && typeof data === 'object'))
    const canPreview = !drillPath && (/text\/html/i.test(response.contentType) || /^image\//i.test(response.contentType))
    return { data, hasJSON, canTable, canPreview }
  }, [response, drillPath])

  const paths = useMemo(() => response && !response.error && response.parsed !== undefined ? collectPaths(response.parsed) : [], [response])
  const { ast } = useMemo(() => parseFilter(filterText), [filterText])
  const plainText = useMemo(() => parseFilter(filterText).plainText, [filterText])
  const fields = useMemo(() => responseFields(drilled.data), [drilled.data])
  const candidates = useMemo(() => drilled.canTable ? tableCandidates(drilled.data) : [], [drilled.data, drilled.canTable])

  // 视图能力
  const caps = useMemo(() => ({
    table: drilled.canTable, pretty: drilled.hasJSON, raw: true, preview: drilled.canPreview, headers: true,
  }), [drilled])

  useEffect(() => { if (!caps[viewMode]) setViewMode(drilled.hasJSON ? 'pretty' : (drilled.canPreview ? 'preview' : 'raw')) }, [caps, viewMode, drilled])

  const copyResponse = useCallback(() => {
    if (!response || response.error) return
    const text = drilled.hasJSON ? JSON.stringify(drilled.data, null, 2) : (response.text || '')
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) }).catch(() => {})
  }, [response, drilled])

  const downloadResponse = useCallback(() => {
    if (!response || response.error) return
    let name = 'response'
    try { const u = new URL(response.url); name = u.pathname.split('/').pop() || 'response' } catch (e) {}
    let blobUrl, revoke = false
    if (response.isBinary && response.blobUrl && !drillPath) { blobUrl = response.blobUrl }
    else {
      const text = drilled.hasJSON ? JSON.stringify(drilled.data, null, 2) : response.text
      if (!/\./.test(name)) name += drilled.hasJSON ? '.json' : (/html/.test(response.contentType) ? '.html' : '.txt')
      blobUrl = URL.createObjectURL(new Blob([text], { type: response.contentType || 'text/plain' }))
      revoke = true
    }
    const a = document.createElement('a'); a.href = blobUrl; a.download = name; a.click()
    if (revoke) setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  }, [response, drilled, drillPath])

  const askAI = useCallback(() => {
    if (!onSendToChat || !response) return
    const summary = response.error
      ? `请求失败：${response.error}${response.corsHint ? '（疑似跨域）' : ''}`
      : `状态 ${response.status} ${response.statusText}，耗时 ${formatMs(response.timeMs)}，大小 ${formatBytes(response.size)}，类型 ${response.contentType}`
    const bodyPreview = response.parsed !== undefined ? JSON.stringify(response.parsed).slice(0, 2000) : (response.text || '').slice(0, 2000)
    const prompt = `分析以下 API 请求与响应，给出问题诊断或数据解读：\n\n请求：${request?.method || 'GET'} ${request?.url || ''}\n响应：${summary}\n响应体预览：\n${bodyPreview}`
    onSendToChat(prompt)
  }, [onSendToChat, response, request])

  if (!response) {
    return (
      <div className="pa-res-idle">
        <div className="pa-idle-big">就绪</div>
        <div className="pa-idle-text">输入 URL 点击发送，或从左侧集合载入请求</div>
        <div className="pa-idle-tips">
          多 Tab：顶部加号新建，双击重命名<br />
          环境：右上角切换，URL 用 {'{{baseUrl}}'} {'{{变量}}'}<br />
          导入：cURL / Postman / OpenAPI / HAR<br />
          跨域：顶栏「代理」经本地后端转发
        </div>
      </div>
    )
  }

  if (response.error) {
    return (
      <div className="pa-res-err">
        <div className="pa-err-head"><span className="pa-err-mark">!</span><span>请求失败</span></div>
        <div className="pa-err-msg">{response.error}</div>
        {response.corsHint && (
          <div className="pa-err-hint">
            <b>可能原因：</b>跨域 CORS、目标无响应、混合内容(HTTP/HTTPS)、网络不可达。
            <br />开启顶栏「代理」可绕过 CORS 限制。
          </div>
        )}
        <div className="pa-err-meta">耗时 {formatMs(response.timeMs)} · {response.url}</div>
      </div>
    )
  }

  const statusCls = response.status >= 500 ? 's5' : response.status >= 400 ? 's4' : response.status >= 300 ? 's3' : 's2'

  return (
    <div className="pa-res-viewer">
      {/* 状态栏 */}
      <div className="pa-res-statusbar">
        <span className={'pa-status-code ' + statusCls}>
          <span className="pa-status-dot" />
          {response.status} {response.statusText}
        </span>
        <span className="pa-res-meta">
          <span>耗时 <b>{formatMs(response.timeMs)}</b></span>
          <span>大小 <b>{formatBytes(response.size)}</b></span>
          {response.contentType && <span>类型 <b>{response.contentType.split(';')[0]}</b></span>}
        </span>
        <span className="pa-res-spacer" />
        <button className="pa-btn-icon" onClick={copyResponse} title="复制响应" data-copied={copied}>
          {copied ? '已复制' : '复制'}
        </button>
        <button className="pa-btn-icon" onClick={downloadResponse} title="下载响应">下载</button>
        {onSendToChat && <button className="pa-btn-icon" onClick={askAI} title="用 AI 分析响应">AI 分析</button>}
      </div>

      {/* 视图切换 */}
      <div className="pa-res-toolbar">
        <div className="pa-res-views">
          {caps.table && <button className={'pa-res-view-btn' + (viewMode === 'table' ? ' active' : '')} onClick={() => setViewMode('table')}>表格</button>}
          {caps.pretty && <button className={'pa-res-view-btn' + (viewMode === 'pretty' ? ' active' : '')} onClick={() => setViewMode('pretty')}>对象</button>}
          <button className={'pa-res-view-btn' + (viewMode === 'raw' ? ' active' : '')} onClick={() => setViewMode('raw')}>原始</button>
          {caps.preview && <button className={'pa-res-view-btn' + (viewMode === 'preview' ? ' active' : '')} onClick={() => setViewMode('preview')}>预览</button>}
          <button className={'pa-res-view-btn' + (viewMode === 'headers' ? ' active' : '')} onClick={() => setViewMode('headers')}>Headers</button>
        </div>
      </div>

      {/* 工具栏：路径下钻 + 过滤 */}
      {drilled.hasJSON && (
        <div className="pa-res-tools">
          {/* 路径下拉 */}
          <div className="pa-tool-path">
            <span className="pa-tool-label">路径</span>
            <div className="pa-pathdd">
              <button className="pa-pathdd-btn" onClick={(e) => { e.stopPropagation(); setShowPathMenu(!showPathMenu); setPathFilter('') }}>
                <span>{drillPath || '(根)'}</span><span className="pa-car">▾</span>
              </button>
              {showPathMenu && (
                <div className="pa-path-menu" onClick={(e) => e.stopPropagation()}>
                  <input className="pa-path-filter" placeholder="过滤路径 / 回车应用" value={pathFilter} onChange={(e) => setPathFilter(e.target.value)} spellCheck={false}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setDrillPath(pathFilter.trim()); setShowPathMenu(false) } if (e.key === 'Escape') setShowPathMenu(false) }} />
                  <div className="pa-path-list">
                    {paths.filter(p => !pathFilter || p.path.toLowerCase().includes(pathFilter.toLowerCase())).slice(0, 200).map((p, i) => (
                      <button key={i} className={'pa-path-opt' + (p.path === drillPath ? ' on' : '')} onClick={() => { setDrillPath(p.path); setShowPathMenu(false) }}>
                        <span className="pa-pp">{p.path === '' ? '(根)' : p.path}</span>
                        <span className={'pa-pk ' + p.kind}>{p.kind === 'array' ? `[${p.count}]` : p.kind === 'object' ? `{${p.count}}` : '·'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* 手动路径 */}
          <input className="pa-path-manual" placeholder="如 data.items[0].name" value={drillPath} onChange={(e) => setDrillPath(e.target.value)} spellCheck={false} />
          {/* 多表格选择 */}
          {viewMode === 'table' && candidates.length > 1 && (
            <select className="pa-table-sel" value={tableSel} onChange={(e) => setTableSel(e.target.value)}>
              {candidates.map((c, i) => <option key={i} value={c.path}>{c.label} ({c.count})</option>)}
            </select>
          )}
          {/* 过滤 */}
          <input className="pa-res-filter" placeholder="过滤 name:值 id>1 role:true -排除" value={filterText} onChange={(e) => setFilterText(e.target.value)} spellCheck={false} />
          {/* pretty 切换 */}
          {(viewMode === 'table' || viewMode === 'pretty') && (
            <button className={'pa-btn-icon' + (pretty ? ' active' : '')} onClick={() => setPretty(!pretty)} title="智能单元格（图片/时间戳）">
              {pretty ? '美化' : '原始'}
            </button>
          )}
          {viewMode === 'pretty' && (
            <>
              <button className="pa-btn-icon" onClick={() => setTreeOpen('all')} title="展开全部">展开</button>
              <button className="pa-btn-icon" onClick={() => setTreeOpen('none')} title="折叠全部">折叠</button>
            </>
          )}
        </div>
      )}

      {/* 响应体 */}
      <div className="pa-res-body">
        {viewMode === 'pretty' && drilled.hasJSON && <PrettyView data={drilled.data} filterAst={ast} plainText={plainText} pretty={pretty} treeOpen={treeOpen} hlTerms={astHighlightTerms(ast)} />}
        {viewMode === 'table' && drilled.canTable && <TableView data={drilled.data} tableSel={tableSel} setTableSel={setTableSel} ast={ast} plainText={plainText} pretty={pretty} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} colOrder={colOrder} setColOrder={setColOrder} sort={sort} setSort={setSort} />}
        {viewMode === 'raw' && <RawView data={drilled.data} text={response.text} />}
        {viewMode === 'preview' && <PreviewView response={response} />}
        {viewMode === 'headers' && <HeadersView headers={response.headers} />}
      </div>
    </div>
  )
}

/* ===================== 对象树 ===================== */
function PrettyView({ data, filterAst, plainText, pretty, treeOpen, hlTerms }) {
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    if (treeOpen === 'all') {
      const all = {}
      const expand = (obj, path = '') => { if (obj && typeof obj === 'object') for (const key of Object.keys(obj)) { const fp = path ? path + '.' + key : key; all[fp] = true; expand(obj[key], fp) } }
      expand(data)
      setExpanded(all)
    } else if (treeOpen === 'none') { setExpanded({}) }
  }, [treeOpen, data])

  if (data === undefined) return <div className="pa-res-empty">无数据</div>
  if (data === null) return <div className="pa-res-null">null</div>
  if (typeof data !== 'object') return <div className="pa-res-scalar">{JSON.stringify(data)}</div>

  const hlText = (s, terms) => {
    if (!terms || !terms.length) return s
    const lower = s.toLowerCase()
    let result = s
    for (const t of [...terms].sort((a, b) => b.length - a.length)) {
      const tl = t.toLowerCase()
      const idx = lower.indexOf(tl)
      if (idx >= 0) result = result.slice(0, idx) + '⟨' + result.slice(idx, idx + tl.length) + '⟩' + result.slice(idx + tl.length)
    }
    return result
  }

  const renderNode = (key, value, path, depth) => {
    if (depth > 12) return <span className="pa-jt-deep">深度限制</span>
    const fp = path ? path + '.' + key : key
    const isObj = value && typeof value === 'object'
    const keyHTML = key != null ? <>{<span className="pa-jt-key">{hlText(String(key), hlTerms)}</span>}<span className="pa-jt-colon">: </span></> : null

    if (!isObj) {
      const meta = cellMeta(value, key, pretty)
      let valEl
      if (meta.kind === 'null') valEl = <span className="pa-jt-null">null</span>
      else if (meta.kind === 'image') valEl = <span className="pa-jt-img"><img src={meta.url} alt="" loading="lazy" onError={(e) => e.target.style.display = 'none'} /><span className="pa-jt-imgn">{fileName(meta.url)}</span></span>
      else if (meta.kind === 'time') valEl = <span className="pa-jt-ts">{fmtDate(meta.date)} <span className="pa-jt-prev">({meta.raw})</span></span>
      else if (meta.kind === 'number') valEl = <span className="pa-jt-num">{hlText(String(value), hlTerms)}</span>
      else if (meta.kind === 'bool') valEl = <span className="pa-jt-bool">{String(value)}</span>
      else valEl = <span className="pa-jt-str">"{hlText(String(value), hlTerms)}"</span>
      return <div className="pa-jt-row" key={fp}>{keyHTML}{valEl}</div>
    }

    const arr = Array.isArray(value)
    const entries = arr ? value.map((v, i) => [i, v]) : Object.entries(value)
    const open = treeOpen === 'all' ? true : treeOpen === 'none' ? false : (expanded[fp] !== false && depth < 1)
    const prev = arr ? `[...] ${entries.length}` : `{...} ${entries.length}`
    return (
      <div className="pa-jt-node" key={fp}>
        <div className={'pa-jt-row expandable' + (open ? '' : ' closed')} onClick={() => setExpanded(p => ({ ...p, [fp]: !p[fp] }))}>
          <span className="pa-jt-tog">{open ? '▾' : '▸'}</span>
          {keyHTML}
          <span className="pa-jt-prev">{arr ? '[' : '{'}{!open ? ' ' + prev + ' ' : ''}{arr ? ']' : '}'}</span>
        </div>
        {open && (
          <div className="pa-jt-children">
            {entries.map(([k, v]) => renderNode(k, v, fp, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return <div className="pa-jt">{renderNode(null, data, '', 0)}</div>
}

/* ===================== 表格 ===================== */
function TableView({ data, tableSel, setTableSel, ast, plainText, pretty, hiddenCols, setHiddenCols, colOrder, setColOrder, sort, setSort }) {
  const candidates = tableCandidates(data)
  const sel = candidates.find(c => c.path === tableSel) || candidates[0]
  if (!sel) return <div className="pa-res-empty">无可表格化数据</div>

  const pathKey = sel.path || '__root'
  const d = sel.data

  if (Array.isArray(d) && sel.path !== '__self') {
    const objs = d.length && d.every(x => x && typeof x === 'object' && !Array.isArray(x))
    if (objs) {
      let cols = []
      d.forEach(o => Object.keys(o).forEach(k => { if (!cols.includes(k)) cols.push(k) }))
      const savedOrder = colOrder[pathKey] || []
      if (savedOrder.length) { cols = savedOrder.filter(c => cols.includes(c)).concat(cols.filter(c => !savedOrder.includes(c))) }
      const hidden = hiddenCols[pathKey] || {}
      const visibleCols = cols.filter(c => !hidden[c])
      const filtered = d.filter(o => rowMatchesAST(o, ast, plainText))
      const sortCfg = sort[pathKey]
      let sorted = filtered
      if (sortCfg && sortCfg.col) {
        sorted = [...filtered].sort((a, b) => {
          const va = a[sortCfg.col], vb = b[sortCfg.col]
          if (va == null && vb == null) return 0
          if (va == null) return 1
          if (vb == null) return -1
          if (typeof va === 'number' && typeof vb === 'number') return sortCfg.dir === 'asc' ? va - vb : vb - va
          const cmp = String(va).localeCompare(String(vb))
          return sortCfg.dir === 'asc' ? cmp : -cmp
        })
      }
      return (
        <div className="pa-tbl-wrap">
          {cols.length >= 4 && (
            <div className="pa-col-picker">
              <span className="pa-col-toggle">列 {visibleCols.length}/{cols.length}</span>
              {cols.map(c => (
                <button key={c} className={'pa-col-chip' + (hidden[c] ? '' : ' on')} onClick={() => {
                  const h = { ...(hiddenCols[pathKey] || {}) }
                  if (h[c]) delete h[c]; else h[c] = true
                  setHiddenCols({ ...hiddenCols, [pathKey]: h })
                }}>{c}</button>
              ))}
            </div>
          )}
          <table className="pa-tbl">
            <thead>
              <tr>
                <th className="pa-idx">#</th>
                {visibleCols.map(c => {
                  let arrow = ''
                  if (sortCfg && sortCfg.col === c) arrow = sortCfg.dir === 'asc' ? ' ▲' : ' ▼'
                  return <th key={c} className="pa-sortable" onClick={() => {
                    const cur = sort[pathKey]
                    let newDir = 'asc'
                    if (cur && cur.col === c) newDir = cur.dir === 'asc' ? 'desc' : (cur.dir === 'desc' ? null : 'asc')
                    const ns = { ...sort }
                    if (newDir) ns[pathKey] = { col: c, dir: newDir }; else delete ns[pathKey]
                    setSort(ns)
                  }}>{c}{arrow}</th>
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((o, i) => (
                <tr key={i}>
                  <td className="pa-idx">{i}</td>
                  {visibleCols.map(c => <Cell key={c} value={o[c]} colKey={c} pretty={pretty} />)}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pa-tbl-note">数组 {sorted.length}/{d.length} 行 × {visibleCols.length} 列</div>
        </div>
      )
    }
    // 基础类型数组
    const filtered = d.filter(v => rowMatchesAST({ v }, ast, plainText))
    return (
      <div className="pa-tbl-wrap">
        <table className="pa-tbl"><thead><tr><th className="pa-idx">#</th><th>value</th></tr></thead>
          <tbody>{filtered.map((v, i) => <tr key={i}><td className="pa-idx">{i}</td><Cell value={v} pretty={pretty} /></tr>)}</tbody>
        </table>
        <div className="pa-tbl-note">数组 {filtered.length}/{d.length} 项</div>
      </div>
    )
  }

  // 对象键值
  const entries = Object.entries(d).filter(([k, v]) => rowMatchesAST({ [k]: v }, ast, plainText))
  return (
    <div className="pa-tbl-wrap">
      <table className="pa-tbl"><thead><tr><th>key</th><th>value</th></tr></thead>
        <tbody>{entries.map(([k, v]) => <tr key={k}><td className="pa-jt-key">{k}</td><Cell value={v} colKey={k} pretty={pretty} /></tr>)}</tbody>
      </table>
      <div className="pa-tbl-note">对象 {entries.length}/{Object.keys(d).length} 字段</div>
    </div>
  )
}

function Cell({ value, colKey, pretty }) {
  const meta = cellMeta(value, colKey, pretty)
  if (meta.kind === 'null') return <td className="pa-cell"><span className="pa-jt-null">null</span></td>
  if (meta.kind === 'undefined') return <td className="pa-cell"><span className="pa-jt-null">—</span></td>
  if (meta.kind === 'image') return <td className="pa-cell"><img className="pa-cell-img" src={meta.url} alt="" loading="lazy" onError={(e) => e.target.style.display = 'none'} /></td>
  if (meta.kind === 'time') return <td className="pa-cell"><span className="pa-jt-ts">{fmtDate(meta.date)}</span></td>
  if (meta.kind === 'number') return <td className="pa-cell"><span className="pa-jt-num">{value}</span></td>
  if (meta.kind === 'bool') return <td className="pa-cell"><span className="pa-jt-bool">{String(value)}</span></td>
  if (meta.kind === 'object') return <td className="pa-cell"><span className="pa-cell-obj">{meta.text}</span></td>
  return <td className="pa-cell"><span className="pa-jt-str">{String(value)}</span></td>
}

function RawView({ data, text }) {
  const content = data !== undefined ? JSON.stringify(data, null, 2) : text
  return <pre className="pa-res-raw"><code>{content}</code></pre>
}

function PreviewView({ response }) {
  if (response.isBinary && response.blobUrl) {
    if (/^image\//.test(response.contentType)) return <div className="pa-res-preview-img"><img src={response.blobUrl} alt="response" /></div>
    return <div className="pa-res-empty">二进制响应（不可预览）</div>
  }
  if (response.contentType?.includes('html')) return <iframe className="pa-res-preview-frame" sandbox="" srcDoc={response.text} title="preview" />
  return <div className="pa-res-empty">无可预览内容</div>
}

function HeadersView({ headers }) {
  if (!headers || !Object.keys(headers).length) return <div className="pa-res-empty">无响应头</div>
  return (
    <div className="pa-res-headers">
      <table className="pa-tbl">
        <thead><tr><th>Header</th><th>Value</th></tr></thead>
        <tbody>{Object.entries(headers).map(([k, v]) => <tr key={k}><td className="pa-jt-key">{k}</td><td>{v}</td></tr>)}</tbody>
      </table>
    </div>
  )
}