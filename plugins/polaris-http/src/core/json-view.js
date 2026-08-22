// core/json-view.js — 智能响应渲染（RELAY 移植）
// 对象树/表格/路径下钻/增强过滤/智能单元格/右键/tooltip

export function getByPath(obj, path) {
  if (!path) return { ok: true, value: obj }
  const parts = path.split(/[.[\]]/).filter(Boolean)
  let val = obj
  for (const p of parts) {
    if (val == null || !(p in val)) return { ok: false }
    val = val[p]
  }
  return { ok: true, value: val }
}

export function collectPaths(obj, prefix = '') {
  const paths = [{ path: '', kind: typeof obj === 'object' ? (Array.isArray(obj) ? 'array' : 'object') : 'scalar', count: Array.isArray(obj) ? obj.length : (obj && typeof obj === 'object' ? Object.keys(obj).length : 0) }]
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? prefix + '.' + k : k
      const kind = Array.isArray(v) ? 'array' : (v && typeof v === 'object' ? 'object' : 'scalar')
      const count = Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0)
      paths.push({ path: p, kind, count })
      if ((kind === 'array' || kind === 'object') && count > 0 && count < 100) {
        paths.push(...collectPaths(v, p))
      }
    }
  }
  return paths
}

export function parseFilter(text) {
  if (!text || !text.trim()) return { ast: [], plainText: '' }
  const tokens = [], parts = text.match(/(?:[^\s"]+|"[^"]*")+/g) || []
  for (const p of parts) {
    const trimmed = p.replace(/"/g, '')
    const colon = trimmed.indexOf(':')
    if (colon > 0) tokens.push({ type: 'field', field: trimmed.slice(0, colon), value: trimmed.slice(colon + 1), raw: trimmed })
    else if (trimmed.startsWith('-')) tokens.push({ type: 'negate', value: trimmed.slice(1), raw: trimmed })
    else tokens.push({ type: 'text', value: trimmed, raw: trimmed })
  }
  return { ast: tokens, plainText: text }
}

export function astHighlightTerms(ast) {
  return ast.filter(t => t.type === 'text').map(t => t.value)
}

export function rowMatchesAST(obj, ast, plainText) {
  if (!ast.length) return true
  const str = JSON.stringify(obj || '')
  for (const t of ast) {
    if (t.type === 'field') {
      const val = obj[t.field]
      if (val == null) return false
      if (String(val) !== t.value && !String(val).toLowerCase().includes(t.value.toLowerCase())) return false
    } else if (t.type === 'negate') { if (str.toLowerCase().includes(t.value.toLowerCase())) return false }
    else { if (!str.toLowerCase().includes(t.value.toLowerCase())) return false }
  }
  return true
}

export function cellMeta(value, key, pretty) {
  if (value === null || value === undefined) return { kind: value === null ? 'null' : 'undefined', text: '' }
  if (typeof value === 'number') return { kind: 'number', text: String(value) }
  if (typeof value === 'boolean') return { kind: 'bool', text: String(value) }
  if (typeof value === 'object') return { kind: 'object', text: JSON.stringify(value).slice(0, 60) }
  if (pretty && typeof value === 'string') {
    if (/^https?:\/\/\S+\.(png|jpg|jpeg|gif|svg|webp)/i.test(value)) return { kind: 'image', url: value, text: value }
    if (/^https?:\/\//.test(value)) return { kind: 'link', url: value, text: value }
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) return { kind: 'time', date: new Date(value), raw: value, text: value }
  }
  return { kind: 'string', text: value }
}

export function fmtDate(date) {
  if (!date || isNaN(date.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

export function fileName(url) {
  try { return new URL(url).pathname.split('/').pop() || url } catch (e) { return url }
}

export function tableCandidates(data) {
  const candidates = []
  if (Array.isArray(data)) {
    if (data.length && data.every(x => x && typeof x === 'object' && !Array.isArray(x))) candidates.push({ path: '__root', data, label: '(根)', count: data.length })
    candidates.push({ path: '__self', data, label: '(值列表)', count: data.length })
  } else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (Array.isArray(v) && v.length && v.every(x => x && typeof x === 'object' && !Array.isArray(x))) candidates.push({ path: k, data: v, label: k, count: v.length })
    }
  }
  return candidates
}

export function responseFields(data) {
  if (!data) return []
  if (Array.isArray(data) && data.length && data[0] && typeof data[0] === 'object' && !Array.isArray(data[0])) return Object.keys(data[0])
  if (data && typeof data === 'object' && !Array.isArray(data)) return Object.keys(data)
  return []
}

export function renderJSONTree(data, opts = {}) {
  const { depth = 0, maxDepth = 12, filterAst = [], plainText = '', pretty = false, expanded = {} } = opts
  if (depth > maxDepth) return '<span class="jt-deep">深度限制</span>'
  if (data === null) return '<span class="jt-null">null</span>'
  if (data === undefined) return '<span class="jt-null">—</span>'
  if (typeof data !== 'object') return renderScalar(data, opts)
  const arr = Array.isArray(data)
  const entries = arr ? data.map((v, i) => [i, v]) : Object.entries(data)
  let html = '<div class="jt-node">'
  html += '<div class="jt-row expandable" onclick="window.__jtToggle(this)">'
  html += '<span class="jt-tog">▾</span>'
  html += '<span class="jt-prev">' + (arr ? '[' : '{') + (arr ? ' ' + entries.length + ' items' : ' ' + entries.length + ' keys') + (arr ? ']' : '}') + '</span>'
  html += '</div><div class="jt-children">'
  for (const [k, v] of entries) {
    const keyHTML = '<span class="jt-key">' + esc(String(k)) + '</span><span class="jt-colon">: </span>'
    html += '<div class="jt-row">' + keyHTML
    if (v !== null && typeof v === 'object') {
      html += renderJSONTree(v, { ...opts, depth: depth + 1 })
    } else {
      html += renderScalar(v, { ...opts, key: k })
    }
    html += '</div>'
  }
  html += '</div></div>'
  return html
}

function renderScalar(value, opts = {}) {
  if (value === null) return '<span class="jt-null">null</span>'
  if (value === undefined) return '<span class="jt-null">—</span>'
  const meta = cellMeta(value, opts.key, opts.pretty)
  if (meta.kind === 'null') return '<span class="jt-null">null</span>'
  if (meta.kind === 'image') return '<span class="jt-img"><img src="' + esc(meta.url) + '" alt="" loading="lazy" style="width:24px;height:24px;border-radius:50%;vertical-align:middle" /><span class="jt-imgn" style="font-size:10px;color:var(--dimmer);margin-left:4px">' + esc(fileName(meta.url)) + '</span></span>'
  if (meta.kind === 'link') return '<span class="jt-link" style="color:var(--brand);word-break:break-all">' + esc(meta.text) + '</span>'
  if (meta.kind === 'time') return '<span class="jt-ts" style="color:var(--m-put)">' + esc(fmtDate(meta.date)) + '</span>'
  if (meta.kind === 'number') return '<span class="jt-num">' + esc(String(value)) + '</span>'
  if (meta.kind === 'bool') return '<span class="jt-bool">' + esc(String(value)) + '</span>'
  if (meta.kind === 'string') return '<span class="jt-str">"' + esc(String(value)) + '"</span>'
  return '<span class="jt-str">"' + esc(String(value)) + '"</span>'
}

function esc(s) {
  if (s == null) return ''
  const d = document.createElement('div')
  d.textContent = String(s)
  return d.innerHTML
}

export function renderTableView(data, opts = {}) {
  const { ast, plainText, filterText, pretty, hiddenCols, colOrder, sort, tableSel } = opts
  const candidates = tableCandidates(data)
  const sel = candidates.find(c => c.path === tableSel) || candidates[0]
  if (!sel) return '<div class="res-empty">无可表格化数据</div>'
  const d = sel.data
  if (Array.isArray(d) && sel.path !== '__self') {
    const objs = d.length && d.every(x => x && typeof x === 'object' && !Array.isArray(x))
    if (objs) {
      let cols = []; d.forEach(o => Object.keys(o).forEach(k => { if (!cols.includes(k)) cols.push(k) }))
      const hidden = hiddenCols || {}
      const visibleCols = cols.filter(c => !hidden[c])
      const filtered = d.filter(o => rowMatchesAST(o, ast, plainText))
      let html = '<div class="tbl-wrap"><table class="dt"><thead><tr><th class="idx">#</th>'
      for (const c of visibleCols) {
        let arrow = ''
        if (sort && sort.col === c) arrow = sort.dir === 'asc' ? ' ▲' : ' ▼'
        html += '<th class="sortable" data-col="' + esc(c) + '">' + esc(c) + arrow + '<span class="col-grip"></span></th>'
      }
      html += '</tr></thead><tbody>'
      let sorted = filtered
      if (sort && sort.col) {
        sorted = [...filtered].sort((a, b) => {
          const va = a[sort.col], vb = b[sort.col]
          if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1
          if (typeof va === 'number' && typeof vb === 'number') return sort.dir === 'asc' ? va - vb : vb - va
          return sort.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
        })
      }
      for (let i = 0; i < sorted.length; i++) {
        const o = sorted[i]
        html += '<tr oncontextmenu="window.__ctx(event)"><td class="idx">' + i + '</td>'
        for (const c of visibleCols) {
          const v = o[c]
          const meta = cellMeta(v, c, pretty)
          if (meta.kind === 'null') html += '<td><span class="jt-null">null</span></td>'
          else if (meta.kind === 'image') html += '<td><img src="' + esc(meta.url) + '" style="width:24px;height:24px;border-radius:50%" loading="lazy" /></td>'
          else if (meta.kind === 'time') html += '<td><span class="jt-ts">' + esc(fmtDate(meta.date)) + '</span></td>'
          else if (meta.kind === 'number') html += '<td><span class="jt-num">' + esc(String(v)) + '</span></td>'
          else if (meta.kind === 'bool') html += '<td><span class="jt-bool">' + esc(String(v)) + '</span></td>'
          else if (meta.kind === 'object') html += '<td><span class="jt-str">' + esc(meta.text) + '</span></td>'
          else html += '<td><span class="jt-str">' + esc(String(v || '')) + '</span></td>'
        }
        html += '</tr>'
      }
      html += '</tbody></table></div><div class="tbl-note">数组 ' + filtered.length + '/' + d.length + ' 行</div>'
      return html
    }
    // 基础类型数组
    const filtered = d.filter(v => rowMatchesAST({ v }, ast, plainText))
    let html = '<div class="tbl-wrap"><table class="dt"><thead><tr><th class="idx">#</th><th>value</th></tr></thead><tbody>'
    for (let i = 0; i < filtered.length; i++) html += '<tr><td class="idx">' + i + '</td><td>' + esc(String(filtered[i])) + '</td></tr>'
    html += '</tbody></table></div><div class="tbl-note">数组 ' + filtered.length + '/' + d.length + ' 项</div>'
    return html
  }
  // 对象键值
  const entries = Object.entries(d).filter(([k, v]) => rowMatchesAST({ [k]: v }, ast, plainText))
  let html = '<div class="tbl-wrap"><table class="dt"><thead><tr><th>key</th><th>value</th></tr></thead><tbody>'
  for (const [k, v] of entries) {
    const meta = cellMeta(v, k, pretty)
    let val = ''
    if (meta.kind === 'null') val = '<span class="jt-null">null</span>'
    else if (meta.kind === 'image') val = '<img src="' + esc(meta.url) + '" style="width:24px;height:24px;border-radius:50%" loading="lazy" />'
    else if (meta.kind === 'time') val = '<span class="jt-ts">' + esc(fmtDate(meta.date)) + '</span>'
    else if (meta.kind === 'number') val = '<span class="jt-num">' + esc(String(v)) + '</span>'
    else val = '<span class="jt-str">' + esc(String(v)) + '</span>'
    html += '<tr><td class="jt-key">' + esc(k) + '</td><td>' + val + '</td></tr>'
  }
  html += '</tbody></table></div><div class="tbl-note">对象 ' + entries.length + '/' + Object.keys(d).length + ' 字段</div>'
  return html
}