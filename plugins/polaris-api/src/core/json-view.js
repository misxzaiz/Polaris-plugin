// core/json-view.js — 智能响应渲染核心
// 路径下钻 + 增强过滤语法 + 智能单元格（图片/时间戳/链接）+ 对象树 + 表格
// 移植自 RELAY DevKit，适配 React 组件输出

import { formatBytes } from './http.js'

/** 路径下钻 */
export function getByPath(data, path) {
  if (!path || !path.trim()) return { ok: true, value: data }
  const parts = path.replace(/\[(\w+)\]/g, '.$1').split('.').map(s => s.trim()).filter(s => s !== '')
  let cur = data
  for (const p of parts) {
    if (cur == null) return { ok: false }
    if (Array.isArray(cur)) {
      const i = Number(p)
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) return { ok: false }
      cur = cur[i]
    } else if (typeof cur === 'object') {
      if (!(p in cur)) return { ok: false }
      cur = cur[p]
    } else return { ok: false }
  }
  return { ok: true, value: cur }
}

/** 自动识别可下钻路径（限深限量） */
export function collectPaths(root) {
  const out = [], seen = new Set()
  const push = (p, v) => {
    if (seen.has(p)) return
    seen.add(p)
    let kind = 'value', count
    if (Array.isArray(v)) { kind = 'array'; count = v.length }
    else if (v && typeof v === 'object') { kind = 'object'; count = Object.keys(v).length }
    out.push({ path: p, kind, count })
  }
  const walk = (v, path, depth) => {
    if (out.length > 250) return
    if (Array.isArray(v)) {
      if (v.length) { const ep = path ? path + '[0]' : '[0]'; push(ep, v[0]); if (v[0] && typeof v[0] === 'object' && depth < 4) walk(v[0], ep, depth + 1) }
    } else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) { const p = path ? path + '.' + k : k; push(p, v[k]); if (v[k] && typeof v[k] === 'object' && depth < 4) walk(v[k], p, depth + 1) }
    }
  }
  push('', root)
  walk(root, '', 0)
  return out
}

/* ===================== 增强过滤语法 ===================== */
/**
 * 语法：纯文本（向后兼容）、field:value、field=value、field>num、field:/regex/、*:value、-排除
 */
export function parseFilter(raw) {
  if (!raw || !raw.trim()) return { ast: [], plainText: '' }
  const ast = []
  let plainText = null
  const tokens = []
  let buf = '', inQ = false, qCh = ''
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (inQ) { if (ch === qCh) inQ = false; else buf += ch }
    else if (ch === '"' || ch === "'") { inQ = true; qCh = ch }
    else if (ch === ' ') { if (buf) { tokens.push(buf); buf = '' } }
    else buf += ch
  }
  if (buf) tokens.push(buf)
  const OPS_RE = /^(-?)([*\w.一-鿿-]+)(:|=|==|~|>=|>|<=|<)([\s\S]*)$/
  for (const tok of tokens) {
    const m = tok.match(OPS_RE)
    if (!m) {
      if (tok.startsWith('-') && tok.length > 1) ast.push({ type: 'text', value: tok.slice(1), negated: true })
      else { ast.push({ type: 'text', value: tok, negated: false }); plainText = plainText === null ? tok : plainText + ' ' + tok }
      continue
    }
    const [, neg, field, op, value] = m
    const negated = neg === '-'
    if (op === ':' && value.startsWith('/') && value.endsWith('/') && value.length > 1) {
      try { const rx = new RegExp(value.slice(1, -1), 'i'); ast.push({ type: 'field', field, op: '~', regex: rx, negated }) } catch (e) { ast.push({ type: 'text', value: tok, negated: false }) }
      continue
    }
    if (op === '~') {
      try { const src = value.startsWith('/') && value.endsWith('/') ? value.slice(1, -1) : value; const rx = new RegExp(src, 'i'); ast.push({ type: 'field', field, op: '~', regex: rx, negated }) } catch (e) { ast.push({ type: 'text', value: tok, negated: false }) }
      continue
    }
    if (op === '>' || op === '>=' || op === '<' || op === '<=') {
      const n = Number(value)
      if (!isNaN(n)) { ast.push({ type: 'field', field, op, numValue: n, negated }); continue }
      ast.push({ type: 'text', value: tok, negated: false }); plainText = plainText === null ? tok : plainText + ' ' + tok; continue
    }
    if (op === '=' || op === '==') {
      if (value === 'true') ast.push({ type: 'field', field, op: '=', boolValue: true, negated })
      else if (value === 'false') ast.push({ type: 'field', field, op: '=', boolValue: false, negated })
      else if (value === 'null') ast.push({ type: 'field', field, op: '=', nullValue: true, negated })
      else { const n = Number(value); if (!isNaN(n) && String(n) === value) ast.push({ type: 'field', field, op: '=', numValue: n, negated }); else ast.push({ type: 'field', field, op: '=', value, negated }) }
      continue
    }
    if (op === ':') {
      if (value.startsWith('-') && value.length > 1) ast.push({ type: 'field', field, op: ':', value: value.slice(1), negated: true })
      else if (field === '*') ast.push({ type: 'wildcard', op: ':', value, negated })
      else ast.push({ type: 'field', field, op: ':', value, negated })
      continue
    }
  }
  const hasFieldOps = ast.some(n => n.type === 'field' || n.type === 'wildcard')
  if (hasFieldOps) plainText = null
  return { ast, plainText: plainText || null }
}

function matchCond(val, node) {
  if (node.type === 'text') {
    const hit = String(val == null ? '' : typeof val === 'object' ? JSON.stringify(val) : val).toLowerCase().includes(node.value.toLowerCase())
    return node.negated ? !hit : hit
  }
  if (node.type === 'wildcard') {
    if (val && typeof val === 'object') {
      const en = Array.isArray(val) ? Object.values(val) : Object.values(val)
      const hit = en.some(v => String(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v).toLowerCase().includes(node.value.toLowerCase()))
      return node.negated ? !hit : hit
    }
    const hit = String(val == null ? '' : val).toLowerCase().includes(node.value.toLowerCase())
    return node.negated ? !hit : hit
  }
  const { op, negated } = node
  let v = val
  if (op === ':') {
    const hit = String(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v).toLowerCase().includes(node.value.toLowerCase())
    return negated ? !hit : hit
  }
  if (op === '=') {
    if (node.boolValue !== undefined) { const hit = (v === true || v === false) ? v === node.boolValue : String(v).toLowerCase() === '' + node.boolValue; return negated ? !hit : hit }
    if (node.nullValue) { const hit = v === null; return negated ? !hit : hit }
    if (node.numValue !== undefined) { const hit = (typeof v === 'number') ? v === node.numValue : Number(v) === node.numValue; return negated ? !hit : hit }
    const hit = String(v == null ? '' : v) === node.value; return negated ? !hit : hit
  }
  if (op === '~') { try { const hit = node.regex.test(String(v == null ? '' : v)); return negated ? !hit : hit } catch (e) { return false } }
  if (op === '>' || op === '>=' || op === '<' || op === '<=') {
    const nv = typeof v === 'number' ? v : Number(v)
    if (isNaN(nv)) return false
    let hit
    if (op === '>') hit = nv > node.numValue
    else if (op === '>=') hit = nv >= node.numValue
    else if (op === '<') hit = nv < node.numValue
    else hit = nv <= node.numValue
    return negated ? !hit : hit
  }
  return true
}

function matchRow(obj, ast) {
  if (!ast.length) return true
  for (const node of ast) {
    if (node.type === 'text' || node.type === 'wildcard') { if (!matchCond(obj, node)) return false; continue }
    if (node.type === 'field') {
      const fv = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj[node.field] : undefined
      if (fv === undefined) { if (!matchCond(obj, node)) return false }
      else { if (!matchCond(fv, node)) return false }
    }
  }
  return true
}

/* ===================== 智能单元格 ===================== */
const IMG_URL_RE = /^(?:https?:)?\/\/[^\s'"]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)(?:[?#][^\s'"]*)?$/i
function isImgUrl(s) { if (typeof s !== 'string') return false; s = s.trim(); return /^data:image\//i.test(s) || IMG_URL_RE.test(s) }
function keyIsTime(key) { if (key == null) return false; return /(_at\b|\bat$|date|time|timestamp|\bts\b|created|updated|modified|expire|publish|issued|deleted|lastseen|lastlogin|epoch)/i.test(String(key)) }
function tsInfo(key, v) {
  if (typeof v === 'string') {
    const s = v.trim()
    if (/^\d{4}-\d{2}-\d{2}([T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+\-]\d{2}:?\d{2})?)?$/.test(s)) { const d = new Date(s); if (!isNaN(+d)) return { date: d } }
    if (keyIsTime(key) && /^\d{10}$|^\d{13}$/.test(s)) { const n = Number(s); const d = new Date(s.length === 13 ? n : n * 1000); if (!isNaN(+d)) return { date: d } }
    return null
  }
  if (typeof v === 'number' && keyIsTime(key) && isFinite(v)) {
    if (v >= 1e12 && v < 4e12) return { date: new Date(v) }
    if (v >= 1e9 && v < 4e9) return { date: new Date(v * 1000) }
  }
  return null
}

/** 计算表格候选（多表格） */
export function tableCandidates(data) {
  const out = []
  if (Array.isArray(data)) { out.push({ label: '根数组', path: '', data, count: data.length }); return out }
  if (data && typeof data === 'object') {
    const scan = (obj, prefix, depth) => {
      for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? prefix + '.' + k : k
        if (Array.isArray(v)) out.push({ label: path, path, data: v, count: v.length })
        else if (v && typeof v === 'object' && depth < 1) scan(v, path, depth + 1)
      }
    }
    scan(data, '', 0)
    out.push({ label: '对象本身(键值)', path: '__self', data, count: Object.keys(data).length })
  }
  return out
}

/** 收集 AST 高亮词 */
export function astHighlightTerms(ast) {
  const terms = []
  for (const n of ast) {
    if (n.type === 'text') terms.push(n.value)
    else if (n.type === 'wildcard') terms.push(n.value)
    else if (n.type === 'field' && n.op === ':') terms.push(n.value)
    else if (n.type === 'field' && n.op === '=' && n.value) terms.push(n.value)
  }
  return terms
}

/** 行级过滤匹配（对外暴露，供 React 表格组件用） */
export function rowMatchesAST(obj, ast, plainText) {
  if (!ast.length && !plainText) return true
  if (ast.length) return matchRow(obj, ast)
  const q = plainText.toLowerCase()
  return Object.values(obj).some(v => String(typeof v === 'object' ? JSON.stringify(v) : v).toLowerCase().includes(q))
}

/** 单元格智能渲染元数据（供 React 单元格组件用） */
export function cellMeta(value, key, pretty) {
  if (value === null) return { kind: 'null' }
  if (value === undefined) return { kind: 'undefined' }
  if (typeof value === 'object') return { kind: 'object', text: JSON.stringify(value) }
  if (pretty && typeof value === 'string' && isImgUrl(value)) return { kind: 'image', url: value }
  if (pretty) { const ts = tsInfo(key, value); if (ts) return { kind: 'time', date: ts.date, raw: value } }
  if (typeof value === 'number') return { kind: 'number', text: String(value) }
  if (typeof value === 'boolean') return { kind: 'bool', text: String(value) }
  return { kind: 'string', text: String(value) }
}

/** 格式化时间戳为可读 */
export function fmtDate(d) {
  const p = n => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
}

/** 文件名提取 */
export function fileName(u) {
  if (/^data:/i.test(u)) return '内嵌图片'
  try { const x = new URL(u, location.href); return decodeURIComponent(x.pathname.split('/').pop() || u).slice(0, 42) } catch (e) { return String(u).split(/[?#]/)[0].split('/').pop().slice(0, 42) }
}

/** 收集当前数据的顶层字段名（过滤栏 autocomplete） */
export function responseFields(data) {
  if (!data) return []
  if (Array.isArray(data) && data.length && data[0] && typeof data[0] === 'object' && !Array.isArray(data[0])) return Object.keys(data[0])
  if (data && typeof data === 'object' && !Array.isArray(data)) return Object.keys(data)
  return []
}

export { formatBytes }
