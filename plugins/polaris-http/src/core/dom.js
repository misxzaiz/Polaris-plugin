// core/dom.js — DOM 工具函数（RELAY 移植）
// 作用域隔离、元素创建、格式化、转义

let _root = document

export function setRoot(el) { _root = el || document }
export function root() { return _root }

export function $(sel, ctx) { return (ctx || _root).querySelector(sel) }
export function $$(sel, ctx) { return (ctx || _root).querySelectorAll(sel) }

export function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

export function esc(s) {
  if (s == null) return ''
  const d = document.createElement('div')
  d.textContent = String(s)
  return d.innerHTML
}

export function el(tag, cls, html) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
export const METHOD_COLORS = { GET: '#3fb950', POST: '#4493f8', PUT: '#d29922', PATCH: '#a371f7', DELETE: '#f85149', HEAD: '#8b949e', OPTIONS: '#8b949e' }
export function methodColor(m) { return METHOD_COLORS[m] || '#8b949e' }

export function bytes(n) {
  if (n == null) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1048576).toFixed(2) + ' MB'
}

export function ms(n) {
  if (n == null) return '—'
  if (n < 1000) return Math.round(n) + ' ms'
  return (n / 1000).toFixed(2) + ' s'
}

export function setStatus(msg, type) {
  const el = $('#statusMsg')
  if (!el) return
  el.textContent = msg
  el.className = type ? 'msg ' + type : 'msg'
}

export function copy(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    setStatus(label || '已复制', 'ok')
  }).catch(() => {})
}

export const blankRow = () => ({ id: uid(), enabled: true, key: '', value: '' })

export function renderKVRows(rows, opts) {
  const wrap = el('div', 'kv')
  function ensureBlank() { if (!rows.length || rows[rows.length - 1].key || rows[rows.length - 1].value) rows.push(blankRow()) }
  function rebuild() {
    wrap.innerHTML = ''
    ensureBlank()
    rows.forEach((r, i) => {
      const row = el('div', 'kv-row' + ((!r.key && !r.value) ? ' blank' : ''))
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = r.enabled !== false
      cb.onchange = () => { r.enabled = cb.checked; opts.onChange?.() }
      const ki = el('input', 'k'); ki.type = 'text'; ki.placeholder = opts.kPlace || 'Key'; ki.value = r.key || ''; ki.spellcheck = false
      const vi = el('input', 'v'); vi.type = 'text'; vi.placeholder = opts.vPlace || 'Value'; vi.value = r.value || ''; vi.spellcheck = false
      const onInput = () => {
        r.key = ki.value; r.value = vi.value
        row.classList.toggle('blank', !r.key && !r.value)
        if ((r.key || r.value) && i === rows.length - 1) { rows.push(blankRow()); rebuild(); opts.onChange?.(); return }
        opts.onChange?.()
      }
      ki.addEventListener('input', onInput); vi.addEventListener('input', onInput)
      const rm = el('button', 'rm', '✕')
      rm.onclick = () => { rows.splice(i, 1); rebuild(); opts.onChange?.() }
      const ck = el('label', 'ck'); ck.appendChild(cb)
      row.append(ck, ki, vi, rm)
      wrap.appendChild(row)
    })
  }
  rebuild()
  return wrap
}