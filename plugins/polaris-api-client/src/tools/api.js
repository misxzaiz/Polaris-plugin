// tools/api.js — API 请求客户端：多 tab、集合、环境、模板、服务器、Auth、全局 Headers、代码生成、响应双视图
import { $, $$, uid, esc, el, METHODS, bytes, ms, methodColor, setStatus, copy } from '../core/dom.js'
import { BINARY, tryJSON } from '../core/http.js'
import { getByPath, collectPaths, viewRaw, viewObject, viewTable, toggleRawWrap, filterBar } from '../core/json-view.js'
import { parseCurl, toCurl, generateCode, detectImportType, parsePostmanCollection } from '../core/parser.js'
import { store, clone } from '../core/store.js'

// ===== 状态持久化 =====
const LS_TABS = 'pac.tabs.v2', LS_COL = 'pac.collections.v2', LS_ENV = 'pac.envs.v2', LS_UI = 'pac.ui.v2', LS_SRV = 'pac.servers.v2', LS_TMPL = 'pac.templates.v2'
let state = { tabs: [], activeTab: null, collections: [], envs: [], activeEnv: null }
let ui = { sideCollapsed: false, layout: 'v', reqH: 240, reqW: 520, proxyOn: false, resFont: 13, resTab: 'data', mode: 'http', curLang: 'curl', fullscreen: false }
let servers = []
let templates = []
let _panelMode = false, _proxyBase = 'http://127.0.0.1:9861'
let _syncingForm = false
let onSendToChat = null

export function setApiPanelMode(on, proxyBase) { _panelMode = !!on; if (proxyBase) _proxyBase = proxyBase; if (on) ui.proxyOn = true }

const blankRow = () => ({ id: uid(), on: true, k: '', v: '' })

function newTab(seed) {
  return Object.assign({
    id: uid(), name: '未命名请求', savedId: null, dirty: false,
    method: 'GET', url: '', params: [blankRow()], headers: [blankRow()],
    bodyType: 'none', body: '', formBody: [blankRow()],
    authType: 'bearer', authToken: '', authUsername: '', authPassword: '',
    reqTab: 'params', respView: 'object', respPath: '', respFilter: '', tableSel: null,
    prettyCells: true, colW: {}, treeOpen: 'auto', hiddenCols: {}, sort: {}, colOrder: {},
    response: null, _templateId: null, _formData: null,
  }, seed || {})
}

const activeTab = () => state.tabs.find(t => t.id === state.activeTab)

export function persist() {
  const tabs = state.tabs.map(t => { const c = { ...t }; delete c.response; return c })
  try {
    localStorage.setItem(LS_TABS, JSON.stringify({ tabs, activeTab: state.activeTab }))
    localStorage.setItem(LS_COL, JSON.stringify(state.collections))
    localStorage.setItem(LS_ENV, JSON.stringify({ envs: state.envs, activeEnv: state.activeEnv }))
    localStorage.setItem(LS_UI, JSON.stringify(ui))
    localStorage.setItem(LS_SRV, JSON.stringify(servers))
    localStorage.setItem(LS_TMPL, JSON.stringify(templates))
  } catch (e) { setStatus('本地保存失败：' + e.message, 'err') }
}

function load() {
  try { const t = JSON.parse(localStorage.getItem(LS_TABS) || 'null'); if (t && t.tabs && t.tabs.length) { state.tabs = t.tabs.map(x => newTab(x)); state.activeTab = t.activeTab } } catch (e) { }
  try { const c = JSON.parse(localStorage.getItem(LS_COL) || 'null'); if (Array.isArray(c)) state.collections = c } catch (e) { }
  try { const en = JSON.parse(localStorage.getItem(LS_ENV) || 'null'); if (en) { state.envs = en.envs || []; state.activeEnv = en.activeEnv || null } } catch (e) { }
  try { const u = JSON.parse(localStorage.getItem(LS_UI) || 'null'); if (u) ui = Object.assign(ui, u) } catch (e) { }
  try { const s = JSON.parse(localStorage.getItem(LS_SRV) || 'null'); if (Array.isArray(s)) servers = s } catch (e) { }
  try { const t = JSON.parse(localStorage.getItem(LS_TMPL) || 'null'); if (Array.isArray(t)) templates = t } catch (e) { }
  if (!state.collections.length || !state.envs.length) seed()
  if (!state.tabs.length) { const t = newTab(); state.tabs = [t]; state.activeTab = t.id }
  if (!activeTab()) state.activeTab = state.tabs[0].id
}

function sreq(name, method, url, extra) { return Object.assign({ id: uid(), name, method, url, params: [blankRow()], headers: [blankRow()], bodyType: 'none', body: '', formBody: [blankRow()] }, extra || {}) }

function seed() {
  if (!state.envs.length) {
    const demo = { id: uid(), name: 'Demo · jsonplaceholder', baseUrl: 'https://jsonplaceholder.typicode.com', vars: [{ id: uid(), on: true, k: 'token', v: 'demo-token-123' }] }
    const local = { id: uid(), name: '本地 Local', baseUrl: 'http://127.0.0.1:8080', vars: [blankRow()] }
    state.envs = [demo, local]; state.activeEnv = demo.id
  }
  if (!state.collections.length) {
    state.collections = [{
      id: uid(), name: '示例 · DEMO', collapsed: false, requests: [
        sreq('用户列表', 'GET', '{{baseUrl}}/users'),
        sreq('单个 Todo', 'GET', '{{baseUrl}}/todos/1'),
        sreq('新建 Post', 'POST', '{{baseUrl}}/posts', { bodyType: 'json', body: JSON.stringify({ title: 'hello', body: 'world', userId: 1 }, null, 2), headers: [{ id: uid(), on: true, k: 'Authorization', v: 'Bearer {{token}}' }, blankRow()] }),
      ]
    }]
  }
  if (!servers.length) {
    servers = [
      { id: uid(), name: '生产环境', url: 'https://api.example.com' },
      { id: uid(), name: '测试环境', url: 'https://test-api.example.com' },
      { id: uid(), name: '本地开发', url: 'http://localhost:8080' },
    ]
  }
  if (!templates.length) {
    templates = [
      { id: uid(), name: '创建用户', method: 'POST', url: '/api/users', bodyType: 'json', bodyFields: [{ name: 'name', label: '用户名', type: 'text', required: true }, { name: 'email', label: '邮箱', type: 'text', required: true }, { name: 'age', label: '年龄', type: 'number', required: false }] },
      { id: uid(), name: '查询用户', method: 'GET', url: '/api/users/{id}', bodyType: 'none', bodyFields: [{ name: 'id', label: '用户 ID', type: 'number', required: true }] },
    ]
  }
}

// ===== 变量解析 =====
function curEnv() { return state.envs.find(e => e.id === state.activeEnv) }

function resolveVars(str) {
  if (str == null || String(str).indexOf('{{') < 0) return str
  const env = curEnv()
  return String(str).replace(/\{\{\s*([\w.\-$]+)\s*\}\}/g, (m, key) => {
    if (key.startsWith('$')) return resolveDynamic(key)
    if (!env) return m
    if (key === 'baseUrl') return env.baseUrl || ''
    const v = (env.vars || []).find(r => r.on && r.k === key)
    return v ? v.v : m
  })
}

function resolveDynamic(key) {
  switch (key) {
    case '$guid': case '$uuid': return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (c === 'x' ? Math.random() * 16 | 0 : Math.random() * 16 | 0 & 0x3 | 0x8).toString(16))
    case '$timestamp': return String(Math.floor(Date.now() / 1000))
    case '$timestampMs': return String(Date.now())
    case '$isoTimestamp': return new Date().toISOString()
    case '$randomInt': return String(Math.floor(Math.random() * 10000))
    case '$randomFloat': return String(Math.random().toFixed(4))
    case '$localDate': return new Date().toISOString().slice(0, 10)
    case '$localTime': return new Date().toTimeString().slice(0, 8)
    default: return '{{' + key + '}}'
  }
}

// ===== 方法下拉 =====
function bindMethodMenu() {
  const menu = $('#methodMenu'); if (!menu) return
  METHODS.forEach(m => { const b = el('button', methodColor(m), m); b.onclick = () => { const t = activeTab(); t.method = m; markDirty(t); $('#methodMenu').classList.remove('open'); renderRequestBar(); renderReqEditor(); persist() }; menu.appendChild(b) })
}

function bindTopEvents() {
  const ms = $('#methodSel'); if (ms) ms.onclick = e => { e.stopPropagation(); $('#methodMenu').classList.toggle('open') }
  const es = $('#envSel'); if (es) es.onclick = e => { e.stopPropagation(); $('#envMenu').classList.toggle('open') }
  document.addEventListener('click', () => { const mm = $('#methodMenu'); if (mm) mm.classList.remove('open'); const em = $('#envMenu'); if (em) em.classList.remove('open'); $$('.path-menu').forEach(m => m.classList.remove('open')) })
}

// ===== 侧栏 =====
function renderSidebar() {
  const tree = $('#tree'); tree.innerHTML = ''
  const q = ($('#search').value || '').toLowerCase().trim()
  let total = 0, shown = 0
  if (!state.collections.length) tree.appendChild(el('div', 'tree-empty', '还没有任何分组。<br>点击右上角 ＋ 新建一个。'))
  state.collections.forEach(g => {
    const matched = g.requests.filter(r => !q || r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q))
    total += g.requests.length
    if (q && !matched.length && !g.name.toLowerCase().includes(q)) return
    const list = q ? matched : g.requests; shown += list.length
    const gEl = el('div', 'group' + (g.collapsed && !q ? ' collapsed' : ''))
    const head = el('div', 'group-head')
    head.innerHTML = `<span class="caret">▼</span><span class="gname">${esc(g.name)}</span><span class="gcount">${g.requests.length}</span>`
    const act = el('span', 'gact')
    const ren = el('button', 'x', '✎'); ren.title = '重命名'; ren.onclick = e => { e.stopPropagation(); renameGroup(g) }
    const del = el('button', 'x', '🗑'); del.title = '删除分组'; del.onclick = e => { e.stopPropagation(); deleteGroup(g) }
    act.append(ren, del); head.appendChild(act)
    head.onclick = () => { g.collapsed = !g.collapsed; persist(); renderSidebar() }
    gEl.appendChild(head)
    const reqs = el('div', 'reqs')
    list.forEach(r => {
      const item = el('div', 'req-item' + (activeTab() && activeTab().savedId === r.id ? ' active' : ''))
      item.innerHTML = `<span class="mb ${methodColor(r.method)}">${r.method}</span><span class="rn">${esc(r.name)}</span>`
      const x = el('button', 'rx', '✕'); x.title = '删除'; x.onclick = e => { e.stopPropagation(); deleteSaved(g, r) }
      item.appendChild(x); item.onclick = () => openSaved(r); reqs.appendChild(item)
    })
    gEl.appendChild(reqs); tree.appendChild(gEl)
  })
  if (q && shown === 0) tree.appendChild(el('div', 'tree-empty', '没有匹配「' + esc(q) + '」的请求。'))
  $('#stSaved').textContent = total
}

// ===== 环境切换 =====
function renderEnv() {
  const env = curEnv()
  $('#envName').textContent = env ? env.name : '无环境'
  $('#envSel').title = env && env.baseUrl ? ('baseUrl: ' + env.baseUrl) : '未选择环境'
  const menu = $('#envMenu'); menu.innerHTML = ''
  state.envs.forEach(e => {
    const b = el('button', 'env-item' + (e.id === state.activeEnv ? ' on' : ''), `<span>${esc(e.name)}</span><small>${esc(e.baseUrl || '(无 baseUrl)')}</small>`)
    b.onclick = () => { state.activeEnv = e.id; persist(); renderEnv(); renderRequestBar(); $('#envMenu').classList.remove('open'); setStatus('已切换环境：' + e.name, 'ok') }
    menu.appendChild(b)
  })
  const none = el('button', 'env-item' + (!state.activeEnv ? ' on' : ''), '<span>无环境</span><small>不解析变量</small>')
  none.onclick = () => { state.activeEnv = null; persist(); renderEnv(); renderRequestBar(); $('#envMenu').classList.remove('open') }
  menu.appendChild(none)
  const mng = el('button', 'env-item manage', '<span>⚙ 管理环境与变量…</span>'); mng.onclick = () => { $('#envMenu').classList.remove('open'); openEnvManager() }
  menu.appendChild(mng)
}

function openEnvManager() {
  const bg = $('#modalBg'); const m = el('div', 'modal wide')
  let selId = state.activeEnv || (state.envs[0] && state.envs[0].id)
  function render() {
    const env = state.envs.find(e => e.id === selId)
    m.innerHTML = `<h3>环境与变量</h3><div class="sub">每个环境含一个请求服务 <b>baseUrl</b>(ip+端口) 与一组变量；在 URL / Header / Body 中用 <b>{{baseUrl}}</b>、<b>{{变量名}}</b> 引用，发送时解析。</div>`
    const tabs = el('div', 'env-tabs')
    state.envs.forEach(e => { const b = el('button', 'env-tab' + (e.id === selId ? ' on' : ''), esc(e.name) + (e.id === state.activeEnv ? ' ●' : '')); b.onclick = () => { selId = e.id; render() }; tabs.appendChild(b) })
    const add = el('button', 'env-tab add', '＋ 新建环境'); add.onclick = () => { const ne = { id: uid(), name: '环境 ' + (state.envs.length + 1), baseUrl: '', vars: [blankRow()] }; state.envs.push(ne); selId = ne.id; render() }
    tabs.appendChild(add); m.appendChild(tabs)
    if (env) {
      const f1 = el('div', 'field'); f1.innerHTML = '<label>环境名称</label>'; const i1 = el('input'); i1.value = env.name; i1.oninput = () => env.name = i1.value; f1.appendChild(i1); m.appendChild(f1)
      const f2 = el('div', 'field'); f2.innerHTML = '<label>请求服务 baseUrl（ip + 端口）</label>'; const i2 = el('input'); i2.placeholder = 'http://127.0.0.1:8080'; i2.value = env.baseUrl || ''; i2.oninput = () => env.baseUrl = i2.value; f2.appendChild(i2); m.appendChild(f2)
      const f3 = el('div', 'field'); f3.innerHTML = '<label>变量</label>'; const host = el('div', 'env-vars'); if (!env.vars) env.vars = [blankRow()]; host.appendChild(kvEditor(env.vars, { kPlace: '变量名', vPlace: '值', onChange: () => { } })); f3.appendChild(host); m.appendChild(f3)
    } else m.appendChild(el('div', 'field', '还没有环境，点「＋ 新建环境」。'))
    const acts = el('div', 'acts')
    if (env) { const del = el('button', 'btn ghost danger', '删除'); del.onclick = () => { confirmModal('删除环境「' + env.name + '」？', ok2 => { if (ok2) { state.envs = state.envs.filter(e => e.id !== env.id); if (state.activeEnv === env.id) state.activeEnv = state.envs[0] ? state.envs[0].id : null; selId = state.envs[0] && state.envs[0].id; render() } }) }; acts.appendChild(del) }
    const sp = el('div'); sp.style.flex = '1'; acts.appendChild(sp)
    if (env) { const use = el('button', 'btn', env.id === state.activeEnv ? '✓ 当前环境' : '设为当前'); use.onclick = () => { state.activeEnv = selId; persist(); renderEnv(); renderRequestBar(); render() }; acts.appendChild(use) }
    const done = el('button', 'btn primary', '完成'); done.onclick = close; acts.appendChild(done)
    m.appendChild(acts)
  }
  function close() { state.envs.forEach(e => { if (e.vars) e.vars = e.vars.filter(r => r.k || r.v) }); persist(); renderEnv(); renderRequestBar(); bg.classList.remove('open'); bg.innerHTML = '' }
  bg.innerHTML = ''; bg.appendChild(m); bg.classList.add('open'); bg.onclick = e => { if (e.target === bg) close() }
  render()
}

// ===== 服务器选择器 =====
function renderServers() {
  const sel = $('#serverSelect'); if (!sel) return
  sel.innerHTML = '<option value="">无</option>'
  servers.forEach(s => { const o = el('option'); o.value = s.id; o.textContent = s.name + ' (' + s.url + ')'; sel.appendChild(o) })
  const add = el('option'); add.value = '__manage'; add.textContent = '⚙ 管理服务器...'; sel.appendChild(add)
}

function onServerChange(sel) {
  if (sel.value === '__manage') { sel.value = ''; openServerManager(); return }
  const badge = $('#serverBadge'), text = $('#serverBadgeText')
  if (sel.value) {
    const srv = servers.find(s => s.id === sel.value)
    if (srv) {
      text.textContent = srv.name + ': ' + srv.url
      badge.style.display = 'flex'
      const t = activeTab()
      if (t && t.url) {
        try {
          const u = new URL(t.url.indexOf('{{') >= 0 ? t.url.replace(/\{\{[^}]+\}\}/g, 'x') : t.url)
          const newUrl = srv.url + u.pathname + u.search + u.hash
          t.url = newUrl; $('#url').value = newUrl; markDirty(t); updateResolvedPreview(); persist()
        } catch (e) { /* ignore */ }
      }
    }
  } else { badge.style.display = 'none' }
}

function replaceServerUrl() {
  const sel = $('#serverSelect'); if (!sel.value) return
  const srv = servers.find(s => s.id === sel.value); if (!srv) return
  const t = activeTab(); if (!t || !t.url) return
  try {
    const u = new URL(t.url.indexOf('{{') >= 0 ? t.url.replace(/\{\{[^}]+\}\}/g, 'x') : t.url)
    const newUrl = srv.url + u.pathname + u.search + u.hash
    t.url = newUrl; $('#url').value = newUrl; markDirty(t); updateResolvedPreview(); persist()
    setStatus('已替换服务器 URL', 'ok')
  } catch (e) { setStatus('URL 无效', 'warn') }
}

function openServerManager() {
  const bg = $('#modalBg'); const m = el('div', 'modal')
  m.innerHTML = '<h3>管理服务器</h3><div class="sub">服务器列表用于快速替换 URL 域名。</div>'
  const list = el('div'); list.style.cssText = 'max-height:240px;overflow:auto'
  function renderList() {
    list.innerHTML = ''
    servers.forEach((s, i) => {
      const row = el('div', 'srv-row')
      row.innerHTML = '<input class="srv-input" value="' + esc(s.name) + '" placeholder="名称" /><input class="srv-input" value="' + esc(s.url) + '" placeholder="https://..." style="flex:1" />' + '<button class="btn icon ghost" style="font-size:14px;color:var(--err)" onclick="window.__delSrv(' + i + ')">×</button>'
      const ni = row.querySelectorAll('input')[0], ui = row.querySelectorAll('input')[1]
      ni.oninput = () => { s.name = ni.value; persist() }
      ui.oninput = () => { s.url = ui.value; persist() }
      list.appendChild(row)
    })
  }
  renderList()
  m.appendChild(list)
  const acts = el('div', 'acts'); const sp = el('div'); sp.style.flex = '1'
  const add = el('button', 'btn', '+ 添加服务器'); add.onclick = () => { servers.push({ id: uid(), name: '新服务器', url: 'https://' }); renderList(); persist() }
  const done = el('button', 'btn primary', '完成'); done.onclick = close
  acts.append(add, sp, done); m.appendChild(acts)
  bg.innerHTML = ''; bg.appendChild(m); bg.classList.add('open')
  bg.onclick = e => { if (e.target === bg) close() }
  window.__delSrv = (i) => { servers.splice(i, 1); renderList(); persist(); renderServers() }
  function close() { bg.classList.remove('open'); bg.innerHTML = ''; renderServers() }
}

// ===== 模板系统 =====
function renderTemplates() {
  const sel = $('#templateSelect'); if (!sel) return
  sel.innerHTML = '<option value="">请选择...</option>'
  templates.forEach(t => { const o = el('option'); o.value = t.id; o.textContent = t.name + ' (' + t.method + ' ' + t.url + ')'; sel.appendChild(o) })
}

function onTemplateSelect(sel) {
  const t = activeTab(); if (!t) return
  if (!sel.value) { $('#templateForm').style.display = 'none'; $('#customHint').style.display = 'none'; return }
  const tmpl = templates.find(x => x.id === sel.value)
  if (!tmpl) return
  t._templateId = tmpl.id
  t.method = tmpl.method; t.url = tmpl.url; t.bodyType = tmpl.bodyType || 'none'
  generateTemplateForm(tmpl, t._formData || {})
  $('#customHint').style.display = 'block'
  markDirty(t); persist(); renderRequestBar(); renderReqEditor()
}

function saveTemplate() {
  const t = activeTab(); if (!t) return
  promptModal('保存模板', '输入模板名称：', t.name + ' 模板', name => {
    if (!name) return
    const fields = []
    if (t.bodyType === 'json' && t.body) {
      try { Object.keys(JSON.parse(t.body)).forEach(k => fields.push({ name: k, label: k, type: 'text', required: false })) } catch (e) { /* ignore */ }
    }
    const tmpl = { id: uid(), name, method: t.method, url: t.url, bodyType: t.bodyType, bodyFields: fields.length ? fields : [{ name: 'param', label: '参数', type: 'text', required: false }] }
    templates.push(tmpl); persist(); renderTemplates(); setStatus('已保存模板「' + name + '」', 'ok')
  })
}

function generateTemplateForm(tmpl, savedData) {
  const form = $('#templateFields'); if (!form) return
  form.innerHTML = ''
  const allFields = tmpl.bodyFields || []
  const extraKeys = new Set()
  if (tmpl.bodyType === 'json') {
    const t = activeTab()
    if (t && t.body) {
      try { Object.keys(JSON.parse(t.body)).forEach(k => { if (!allFields.find(f => f.name === k)) extraKeys.add(k) }) } catch (e) { /* ignore */ }
    }
  }
  allFields.forEach(f => {
    const div = el('div', 'tf-field')
    const val = savedData[f.name] || ''
    const req = f.required ? ' <span class="tf-req">*</span>' : ''
    div.innerHTML = '<label>' + esc(f.label) + req + '</label>'
    if (f.type === 'json') { const ta = el('textarea'); ta.placeholder = f.name; ta.value = val; ta.oninput = () => syncFormToBody(); div.appendChild(ta) }
    else if (f.type === 'number') { const inp = el('input'); inp.type = 'number'; inp.placeholder = f.name; inp.value = val; inp.oninput = () => syncFormToBody(); div.appendChild(inp) }
    else if (f.type === 'checkbox') { const lb = el('label'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = val === true || val === 'true'; cb.onchange = () => syncFormToBody(); lb.appendChild(cb); lb.appendChild(document.createTextNode(' ' + esc(f.label))); div.appendChild(lb) }
    else { const inp = el('input'); inp.type = 'text'; inp.placeholder = f.name; inp.value = val; inp.oninput = () => syncFormToBody(); div.appendChild(inp) }
    form.appendChild(div)
  })
  extraKeys.forEach(k => {
    const div = el('div', 'tf-field')
    div.innerHTML = '<label>' + esc(k) + ' <span class="tf-extra">(额外)</span></label>'
    const inp = el('input'); inp.type = 'text'; inp.placeholder = k; inp.value = savedData[k] || ''
    inp.oninput = () => syncFormToBody(); div.appendChild(inp)
    form.appendChild(div)
  })
  $('#templateForm').style.display = 'block'
}

function syncFormToBody() {
  if (_syncingForm) return
  const t = activeTab(); if (!t) return
  const tmpl = templates.find(x => x.id === t._templateId); if (!tmpl) return
  const fields = tmpl.bodyFields || []
  const data = {}
  fields.forEach(f => {
    const inp = $('#templateFields').querySelector('input[placeholder="' + f.name + '"],textarea[placeholder="' + f.name + '"]')
    if (inp) {
      if (f.type === 'number') data[f.name] = inp.value ? Number(inp.value) : null
      else if (f.type === 'checkbox') data[f.name] = inp.checked
      else data[f.name] = inp.value
    }
  })
  $$('#templateFields .tf-field').forEach(fd => {
    const lbl = fd.querySelector('label')
    const inp = fd.querySelector('input,textarea')
    if (lbl && inp && lbl.textContent.includes('(额外)')) {
      const key = lbl.textContent.replace(/\s*\(额外\)\s*/, '').trim()
      if (key && !fields.find(f => f.name === key)) data[key] = inp.value
    }
  })
  t._formData = data
  if (t.bodyType === 'json') {
    t.body = JSON.stringify(data, null, 2)
    _syncingForm = true
    renderReqEditor()
    _syncingForm = false
  }
  markDirty(t); persist()
}

// ===== 全局 Headers =====
function getGlobalHeaders() { return store.get('globalHeaders') || [] }

function renderGlobalHeadersPane() {
  const t = activeTab(); if (!t || t.reqTab !== 'global') return
  const pane = $('#reqPane'); pane.innerHTML = ''
  const wrap = el('div')
  const hint = el('div', 'gh-hint', '全局 Headers 自动合并到所有请求。若请求中已有同名 Header，以请求为准。')
  wrap.appendChild(hint)
  const headers = getGlobalHeaders()
  const rows = clone(headers)
  if (!rows.length || rows[rows.length - 1].k || rows[rows.length - 1].v) rows.push(blankRow())
  wrap.appendChild(kvEditor(rows, { kPlace: 'Header 名', vPlace: 'Header 值', onChange: () => {
    const cleaned = rows.filter(r => r.k)
    store.set('globalHeaders', cleaned)
  } }))
  pane.appendChild(wrap)
}

// ===== Auth 标签页 =====
function renderAuthPane() {
  const t = activeTab(); if (!t || t.reqTab !== 'auth') return
  const pane = $('#reqPane'); pane.innerHTML = ''
  const wrap = el('div', 'auth-panel')
  const seg = el('div', 'seg')
  ;[['bearer', 'Bearer Token'], ['basic', 'Basic Auth']].forEach(([v, l]) => {
    const b = el('button', t.authType === v ? 'on' : '', l); b.onclick = () => { t.authType = v; markDirty(t); persist(); renderAuthPane() }; seg.appendChild(b)
  })
  wrap.appendChild(seg)
  if (t.authType === 'bearer') {
    const f = el('div', 'auth-field'); f.innerHTML = '<label>Token</label>'
    const inp = el('input'); inp.type = 'password'; inp.value = t.authToken || ''; inp.placeholder = 'eyJhbGciOiJIUzI1NiIs...'
    inp.onfocus = () => inp.type = 'text'; inp.onblur = () => { if (!inp.value) inp.type = 'password' }
    inp.oninput = () => { t.authToken = inp.value; markDirty(t); persist() }
    f.appendChild(inp); wrap.appendChild(f)
  } else {
    const f1 = el('div', 'auth-field'); f1.innerHTML = '<label>用户名</label>'
    const i1 = el('input'); i1.type = 'text'; i1.value = t.authUsername || ''; i1.placeholder = 'admin'
    i1.oninput = () => { t.authUsername = i1.value; markDirty(t); persist() }; f1.appendChild(i1); wrap.appendChild(f1)
    const f2 = el('div', 'auth-field'); f2.innerHTML = '<label>密码</label>'
    const i2 = el('input'); i2.type = 'password'; i2.value = t.authPassword || ''
    i2.onfocus = () => i2.type = 'text'; i2.onblur = () => { if (!i2.value) i2.type = 'password' }
    i2.oninput = () => { t.authPassword = i2.value; markDirty(t); persist() }; f2.appendChild(i2); wrap.appendChild(f2)
  }
  const hint = el('div', 'auth-hint', '自动填充到 Authorization 头')
  wrap.appendChild(hint)
  pane.appendChild(wrap)
}

// ===== tab 条 =====
function renderTabs() {
  const bar = $('#tabbar'); bar.innerHTML = ''
  state.tabs.forEach(t => {
    const tab = el('div', 'rtab' + (t.id === state.activeTab ? ' active' : ''))
    tab.innerHTML = `<span class="tm ${methodColor(t.method)}">${t.method}</span><span class="tn">${esc(t.name)}</span>`
    if (t.dirty) tab.appendChild(el('span', 'dirty'))
    const x = el('button', 'tx', '×'); x.title = '关闭'; x.onclick = e => { e.stopPropagation(); closeTab(t) }; tab.appendChild(x)
    tab.onclick = () => { state.activeTab = t.id; renderAll(); persist() }
    tab.querySelector('.tn').ondblclick = e => { e.stopPropagation(); promptModal('重命名 Tab', '输入新名称：', t.name, v => { if (v) { t.name = v.trim() || t.name; renderTabs(); persist() } }) }
    bar.appendChild(tab)
  })
  const add = el('button', 'tab-add', '+'); add.title = '新建请求 tab'; add.onclick = () => { const nt = newTab(); state.tabs.push(nt); state.activeTab = nt.id; renderAll(); persist() }
  bar.appendChild(add)
  $('#stTabs').textContent = state.tabs.length
}

// ===== 请求栏 =====
function renderRequestBar() {
  const t = activeTab()
  const lbl = $('#methodLabel'); lbl.textContent = t.method; lbl.className = methodColor(t.method)
  const urlIn = $('#url'); if (document.activeElement !== urlIn) urlIn.value = t.url
  updateResolvedPreview()
}

function updateResolvedPreview() {
  const t = activeTab(); const box = $('#urlResolved')
  if (t.url && t.url.indexOf('{{') >= 0) { const r = resolveVars(t.url); box.innerHTML = '→ <b>' + esc(r) + '</b>' } else box.innerHTML = ''
}

// ===== 请求编辑区 =====
const countRows = rows => rows.filter(r => r.on && (r.k || r.v)).length

function renderReqEditor() {
  const t = activeTab()
  $$('#reqSubtabs .subtab').forEach(b => b.classList.toggle('active', b.dataset.rt === t.reqTab))
  const pane = $('#reqPane'); pane.innerHTML = ''
  if (t.reqTab === 'params') {
    pane.appendChild(kvEditor(t.params, { kPlace: '参数名', vPlace: '参数值', onChange: () => { markDirty(t); syncParamsToUrl(t); persist() } }))
  } else if (t.reqTab === 'headers') {
    pane.appendChild(kvEditor(t.headers, { kPlace: 'Header 名', vPlace: 'Header 值', onChange: () => { markDirty(t); persist() } }))
  } else if (t.reqTab === 'body') {
    renderBodyEditor(pane, t)
  } else if (t.reqTab === 'auth') {
    renderAuthPane()
  } else if (t.reqTab === 'global') {
    renderGlobalHeadersPane()
  }
}

function kvEditor(rows, opts) {
  const wrap = el('div', 'kv')
  function ensureBlank() { if (!rows.length || rows[rows.length - 1].k || rows[rows.length - 1].v) rows.push(blankRow()) }
  function rowEl(r) {
    const isLast = () => rows[rows.length - 1] === r
    const row = el('div', 'kv-row' + ((!r.k && !r.v) ? ' blank' : ''))
    const ck = el('label', 'ck'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = r.on; cb.onchange = () => { r.on = cb.checked; opts.onChange() }; ck.appendChild(cb)
    const ki = el('input', 'k'); ki.type = 'text'; ki.placeholder = opts.kPlace; ki.value = r.k; ki.spellcheck = false
    const vi = el('input', 'v'); vi.type = 'text'; vi.placeholder = opts.vPlace; vi.value = r.v; vi.spellcheck = false
    const onInput = () => { r.k = ki.value; r.v = vi.value; row.classList.toggle('blank', !r.k && !r.v); if ((r.k || r.v) && isLast()) { const nr = blankRow(); rows.push(nr); wrap.appendChild(rowEl(nr)) } opts.onChange() }
    ki.addEventListener('input', onInput); vi.addEventListener('input', onInput)
    const rm = el('button', 'rm', '✕'); rm.title = '删除该行'; rm.onclick = () => { const i = rows.indexOf(r); if (i > -1) rows.splice(i, 1); rebuild(); opts.onChange() }
    row.append(ck, ki, vi, rm); return row
  }
  function rebuild() { wrap.innerHTML = ''; ensureBlank(); rows.forEach(r => wrap.appendChild(rowEl(r))) }
  rebuild(); return wrap
}

function renderBodyEditor(pane, t) {
  const bar = el('div', 'body-bar'); const seg = el('div', 'seg')
  ;[['none', '无'], ['json', 'JSON'], ['text', '文本'], ['form', 'Form']].forEach(([v, l]) => { const b = el('button', t.bodyType === v ? 'on' : '', l); b.onclick = () => { t.bodyType = v; markDirty(t); persist(); renderReqEditor() }; seg.appendChild(b) })
  bar.appendChild(seg); bar.appendChild(el('div', 'sp'))
  if (t.bodyType === 'json') { const fmt = el('button', 'tool', '格式化'); fmt.onclick = () => { try { t.body = JSON.stringify(JSON.parse(t.body), null, 2); renderReqEditor(); persist(); setStatus('JSON 已格式化', 'ok') } catch (e) { setStatus('JSON 无效：' + e.message, 'err') } }; bar.appendChild(fmt) }
  pane.appendChild(bar)
  if (t.bodyType === 'none') { pane.appendChild(el('div', 'body-none', '该请求没有 Body。<br>选择 JSON / 文本 / Form 以编辑请求体。')) }
  else if (t.bodyType === 'form') { const host = el('div'); host.style.cssText = 'height:calc(100% - 49px);overflow:auto'; host.appendChild(kvEditor(t.formBody, { kPlace: '字段名', vPlace: '字段值', onChange: () => { markDirty(t); persist() } })); pane.appendChild(host) }
  else {
    const ta = el('textarea', 'code'); ta.spellcheck = false; ta.placeholder = t.bodyType === 'json' ? '{\n  "key": "value"\n}' : '原始请求体…'; ta.value = t.body; ta.style.height = 'calc(100% - 49px)'
    ta.addEventListener('input', () => { t.body = ta.value; markDirty(t); persist(); if (!_syncingForm) t._formData = null })
    ta.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart, en = ta.selectionEnd; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + 2; t.body = ta.value } })
    pane.appendChild(ta)
  }
}

function splitUrl(url) { const i = url.indexOf('?'); return i < 0 ? [url, ''] : [url.slice(0, i), url.slice(i + 1)] }

function syncParamsToUrl(t) {
  const [base] = splitUrl(t.url)
  const qs = t.params.filter(r => r.on && r.k).map(r => encodeURIComponent(r.k) + '=' + encodeURIComponent(r.v)).join('&')
  t.url = qs ? base + '?' + qs : base
  const urlIn = $('#url'); if (document.activeElement !== urlIn) urlIn.value = t.url
  updateResolvedPreview()
}

function syncUrlToParams(t) {
  const [, query] = splitUrl(t.url); const rows = []
  if (query) query.split('&').forEach(p => { if (!p) return; const [k, ...rest] = p.split('='); rows.push({ id: uid(), on: true, k: decodeURIComponent(k || ''), v: decodeURIComponent((rest.join('=') || '').replace(/\+/g, ' ')) }) })
  rows.push(blankRow()); t.params = rows
}

// ===== 发送 =====
async function send() {
  const t = activeTab()
  let url = resolveVars(t.url.trim())
  if (!url) { setStatus('请先输入 URL', 'warn'); $('#url').focus(); return }
  if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) url = 'https://' + url
  const headers = {}
  t.headers.filter(r => r.on && r.k).forEach(r => headers[resolveVars(r.k)] = resolveVars(r.v))
  // 全局 Headers
  const globalHeaders = getGlobalHeaders()
  globalHeaders.filter(h => h.on !== false && h.k).forEach(h => { if (!Object.keys(headers).some(k => k.toLowerCase() === h.k.toLowerCase())) headers[h.k] = h.v })
  // Auth
  if (t.authType === 'bearer' && t.authToken && !Object.keys(headers).some(k => k.toLowerCase() === 'authorization')) headers['Authorization'] = 'Bearer ' + t.authToken
  else if (t.authType === 'basic' && t.authUsername && t.authPassword && !Object.keys(headers).some(k => k.toLowerCase() === 'authorization')) {
    headers['Authorization'] = 'Basic ' + btoa(t.authUsername + ':' + t.authPassword)
  }
  let body
  const method = t.method
  if (!['GET', 'HEAD'].includes(method)) {
    if (t.bodyType === 'json') { body = resolveVars(t.body); if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json' }
    else if (t.bodyType === 'text') { body = resolveVars(t.body) }
    else if (t.bodyType === 'form') { body = t.formBody.filter(r => r.on && r.k).map(r => encodeURIComponent(resolveVars(r.k)) + '=' + encodeURIComponent(resolveVars(r.v))).join('&'); if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded' }
  }
  const btn = $('#sendBtn'); btn.disabled = true; btn.innerHTML = '发送中…'
  $('#resTabs').style.display = 'none'; $('#resStatus').style.display = 'none'; $('#resTools').style.display = 'none'
  $('#resPane').innerHTML = '<div class="res-loading"><span class="spin"></span> 请求发送中…</div>'
  setStatus(method + ' ' + url + (ui.proxyOn ? ' · 经代理' : '') + ' …')
  let fetchUrl = url, fetchHeaders = headers
  if (ui.proxyOn) { fetchHeaders = Object.assign({}, headers, { 'X-Polaris-Target': url }); fetchUrl = _panelMode ? _proxyBase + '/__proxy' : '/__proxy' }
  const t0 = performance.now()
  try {
    if (t.response && t.response.blobUrl) { try { URL.revokeObjectURL(t.response.blobUrl) } catch (e) { } }
    const res = await fetch(fetchUrl, { method, headers: fetchHeaders, body, redirect: 'follow' })
    const blob = await res.blob(); const t1 = performance.now()
    const ct = res.headers.get('content-type') || ''; const isBin = BINARY.test(ct)
    let text = ''; if (!isBin) text = await blob.text()
    const resHeaders = {}; res.headers.forEach((v, k) => resHeaders[k] = v)
    const parsed = tryJSON(text)
    t.response = {
      status: res.status, statusText: res.statusText, ok: res.ok, timeMs: t1 - t0, size: blob.size,
      contentType: ct, headers: resHeaders, text, isBinary: isBin, blobUrl: isBin ? URL.createObjectURL(blob) : null, url,
      parsed: parsed.ok ? parsed.value : undefined,
    }
    t.respPath = ''; t.respFilter = ''; t.tableSel = null; t.colW = {}; t.treeOpen = 'auto'; t.hiddenCols = {}; t.sort = {}
    t.respView = parsed.ok ? (Array.isArray(parsed.value) ? 'table' : 'object') : /text\/html/i.test(ct) ? 'preview' : (isBin && /^image\//i.test(ct)) ? 'preview' : 'raw'
    renderResponse()
    setStatus(method + ' ' + res.status + ' ' + res.statusText + ' · ' + ms(t1 - t0) + ' · ' + bytes(blob.size), res.ok ? 'ok' : 'warn')
  } catch (err) {
    const t1 = performance.now(); t.response = { error: err.message || String(err), timeMs: t1 - t0, url }; renderResponse()
    setStatus('请求失败：' + (err.message || err), 'err')
  } finally { btn.disabled = false; btn.innerHTML = '发送 <span class="k">⌘↵</span>' }
}

// ===== 路径下钻（响应态） =====
function getDrilled(t) {
  const r = t.response; const root = r && !r.error ? r.parsed : undefined
  let data = root, drillErr = false
  // 业务数据视图自动下钻
  if (ui.resTab === 'data' && root !== undefined && !t.respPath) {
    for (const key of ['data', 'result', 'response', 'results', 'items', 'list']) {
      if (root && typeof root === 'object' && !Array.isArray(root) && key in root) {
        const g = getByPath(root, key); if (g.ok) { data = g.value; break }
      }
    }
  }
  if (t.respPath && root !== undefined) { const g = getByPath(root, t.respPath); if (g.ok) data = g.value; else { drillErr = true; data = undefined } }
  const hasJSON = data !== undefined
  const canTable = hasJSON && (Array.isArray(data) || (data && typeof data === 'object'))
  const canPrev = !!r && !t.respPath && (/text\/html/i.test(r.contentType) || /^image\//i.test(r.contentType))
  return { data, drillErr, hasJSON, canTable, canPrev }
}

function apiResponseFields(data) {
  if (!data) return []
  if (Array.isArray(data) && data.length && data[0] && typeof data[0] === 'object' && !Array.isArray(data[0])) return Object.keys(data[0])
  if (data && typeof data === 'object' && !Array.isArray(data)) return Object.keys(data)
  return []
}

// ===== 响应渲染 =====
function renderResponse() {
  const t = activeTab(); const r = t.response
  const pane = $('#resPane'), tabs = $('#resTabs'), sb = $('#resStatus'), tools = $('#resTools')
  if (!r) { tabs.style.display = 'none'; sb.style.display = 'none'; tools.style.display = 'none'; pane.innerHTML = '<div class="res-idle"><div class="big">准备就绪</div>输入 URL 点「发送」，或从左侧集合载入一个请求。</div>'; return }
  if (r.error) { tabs.style.display = 'none'; sb.style.display = 'none'; tools.style.display = 'none'
    const corsHint = /Failed to fetch|NetworkError|load failed/i.test(r.error)
    pane.innerHTML = `<div class="res-err"><div class="ti">⚠ 请求失败</div><div>${esc(r.error)}</div>` +
      (corsHint ? `<div class="hintbox"><b>可能原因：</b>跨域 CORS、目标无响应、混合内容(HTTP/HTTPS)、或网络不可达。` + (ui.proxyOn ? `<br>代理已开启，请确保已运行服务端。` : `<br>👉 点顶栏「代理」开启中继代理，可绕过 CORS 限制。`) + `</div>` : '') +
      `<div style="margin-top:10px;color:var(--dimmer);font-size:11px">耗时 ${ms(r.timeMs)} · ${esc(r.url)}</div></div>`; return }
  sb.style.display = 'flex'
  tabs.style.display = 'flex'
  const cls = r.status >= 500 ? 's5' : r.status >= 400 ? 's4' : r.status >= 300 ? 's3' : 's2'
  const color = `var(--${cls})`
  sb.innerHTML = `<span class="status-chip" style="color:${color}"><span class="dotc" style="background:${color}"></span>${r.status} ${esc(r.statusText)}</span>` +
    `<span class="res-meta"><span>耗时 <b>${ms(r.timeMs)}</b></span><span>大小 <b>${bytes(r.size)}</b></span>${r.contentType ? `<span>类型 <b>${esc(r.contentType.split(';')[0])}</b></span>` : ''}</span>` +
    `<span class="sp"></span>` +
    `<button class="tool" onclick="window.__copyRes()">⧉ 复制</button>` +
    `<button class="tool" onclick="window.__dlRes()">↓ 下载</button>` +
    `<button class="tool" onclick="window.__exportCurl()">cURL 导出</button>` +
    `<button class="tool" onclick="window.__askAI()">✦ AI</button>`
  // 工具栏
  const baseHasJSON = r.parsed !== undefined
  if (baseHasJSON) {
    tools.style.display = 'flex'
    tools.innerHTML = ''
    const pths = collectPaths(r.parsed)
    const ddWrap = el('div', 'ti path'); ddWrap.innerHTML = '<span class="lbl">路径</span>'
    const dd = el('div', 'pathdd')
    const ddBtn = el('button', 'pathdd-btn'); ddBtn.type = 'button'
    const setLbl = () => { ddBtn.innerHTML = `<span>${t.respPath ? esc(t.respPath) : '选择路径'}</span><span class="pcar">▼</span>` }
    setLbl()
    const menu = el('div', 'path-menu')
    const fbox = el('input', 'path-filter'); fbox.placeholder = '过滤路径 / 输入后回车应用'; fbox.spellcheck = false
    const list = el('div', 'path-list')
    const apply = p => { t.respPath = p; persist(); setLbl(); menu.classList.remove('open'); renderRespBody() }
    const fill = () => {
      list.innerHTML = ''; const kw = fbox.value.toLowerCase().trim(); let n = 0
      pths.forEach(p => {
        if (n >= 200) return; const lab = p.path === '' ? '(根)' : p.path; if (kw && !lab.toLowerCase().includes(kw)) return; n++
        const o = el('button', 'path-opt' + (p.path === t.respPath ? ' on' : '')); o.type = 'button'
        o.innerHTML = `<span class="pp">${esc(lab)}</span><span class="pk ${p.kind}">${p.kind === 'array' ? '[ ] ' + p.count : p.kind === 'object' ? '{ } ' + p.count : '·'}</span>`
        o.onclick = () => apply(p.path); list.appendChild(o)
      })
      if (!n) list.innerHTML = '<div class="path-empty">无匹配路径。<br>回车可直接应用输入的路径。</div>'
    }
    fbox.addEventListener('input', fill)
    fbox.addEventListener('keydown', e => { if (e.key === 'Enter') apply(fbox.value.trim()); if (e.key === 'Escape') menu.classList.remove('open') })
    ddBtn.onclick = e => { e.stopPropagation(); const willOpen = !menu.classList.contains('open'); $$('.path-menu').forEach(x => x.classList.remove('open')); $('#methodMenu').classList.remove('open'); $('#envMenu').classList.remove('open'); if (willOpen) { menu.classList.add('open'); fbox.value = ''; fill(); setTimeout(() => fbox.focus(), 0) } }
    menu.addEventListener('click', e => e.stopPropagation())
    menu.append(fbox, list); dd.append(ddBtn, menu); ddWrap.appendChild(dd)
    const man = el('div', 'ti manual'); man.innerHTML = '<span class="lbl">手动</span>'; const pi = el('input'); pi.id = 'respPathIn'; pi.placeholder = '如 data.items[0].name'; pi.value = t.respPath || ''; pi.spellcheck = false
    pi.addEventListener('input', () => { t.respPath = pi.value; persist(); setLbl(); renderRespBody() }); man.appendChild(pi)
    const drilled = getDrilled(t)
    const apiFields = apiResponseFields(drilled.data)
    const flt = filterBar(t, () => { persist(); renderRespBody() }, apiFields)
    tools.append(ddWrap, man, flt)
  } else tools.style.display = 'none'
  renderRespBody()
}

export function renderRespBody() {
  const t = activeTab(); const r = t.response; if (!r || r.error) return
  const d = getDrilled(t)
  const caps = { table: d.canTable, object: d.hasJSON, raw: true, preview: d.canPrev, headers: true }
  if (!caps[t.respView]) t.respView = d.hasJSON ? 'object' : (d.canPrev ? 'preview' : 'raw')
  // 已在响应双视图标签中控制
  const isT = t.respView === 'table', isO = t.respView === 'object', isR = t.respView === 'raw'
  const pretty = t.prettyCells !== false
  const pane = $('#resPane'); pane.innerHTML = ''
  pane.style.fontSize = ui.resFont + 'px'
  if (d.drillErr) { pane.innerHTML = '<div class="prev-none">路径 <b>' + esc(t.respPath) + '</b> 在响应中不存在。</div>'; return }
  const v = t.respView
  if (v === 'raw') pane.appendChild(viewRaw(r, d.data))
  else if (v === 'object') pane.appendChild(viewObject(d.data, t))
  else if (v === 'table') pane.appendChild(viewTable(d.data, t))
  else if (v === 'preview') pane.appendChild(viewPreview(r))
  else pane.appendChild(viewHeaders(r))
}

function viewPreview(r) {
  if (/^image\//i.test(r.contentType) && r.blobUrl) { const w = el('div', 'prev-img-wrap'); const img = el('img'); img.src = r.blobUrl; w.appendChild(img); return w }
  if (/text\/html/i.test(r.contentType)) { const f = el('iframe', 'prev-frame'); f.sandbox = ''; f.srcdoc = r.text; return f }
  return el('div', 'prev-none', '无可预览内容（仅支持 HTML 与图片预览）。')
}

function viewHeaders(r) {
  const wrap = el('div', 'tbl-wrap'); const tbl = el('table', 'dt'); const keys = Object.keys(r.headers || {})
  tbl.innerHTML = '<thead><tr><th>Header</th><th>Value</th></tr></thead>'; const tb = el('tbody')
  if (!keys.length) tb.innerHTML = '<tr><td colspan="2" style="color:var(--dimmer)">（无可见响应头 — 浏览器可能限制了部分头）</td></tr>'
  keys.forEach(k => { const tr = el('tr'); tr.innerHTML = `<td style="color:var(--j-key);white-space:nowrap">${esc(k)}</td><td>${esc(r.headers[k])}</td>`; tb.appendChild(tr) })
  tbl.appendChild(tb); wrap.appendChild(tbl); return wrap
}

// ===== cURL 导入 =====
function openCurlImport() {
  const bg = $('#modalBg'); const m = el('div', 'modal')
  m.innerHTML = '<h3>导入 cURL</h3><div class="sub">粘贴一条 curl 命令，解析为新的请求 tab。</div>'
  const f = el('div', 'field'); f.innerHTML = '<label>cURL 命令</label>'; const ta = el('textarea', 'curl-ta'); ta.placeholder = "curl 'https://api.example.com/users' -H 'Authorization: Bearer xxx'"
  f.appendChild(ta); m.appendChild(f)
  const acts = el('div', 'acts'); const sp = el('div'); sp.style.flex = '1'
  const c = el('button', 'btn ghost', '取消'); c.onclick = close
  const ok = el('button', 'btn primary', '解析并新建')
  ok.onclick = () => {
    const txt = ta.value.trim(); if (!txt) { setStatus('请粘贴 curl 命令', 'warn'); return }
    try {
      const p = parseCurl(txt); if (!p.url) { setStatus('未能解析出 URL', 'err'); return }
      const nt = newTab({ name: 'cURL: ' + shortUrl(p.url), method: p.method, url: p.url, bodyType: p.bodyType, body: p.body,
        headers: (p.headers.length ? p.headers.map(h => ({ id: uid(), on: true, k: h.k, v: h.v })) : []).concat([blankRow()]) })
      syncUrlToParams(nt); nt.dirty = true; state.tabs.push(nt); state.activeTab = nt.id; renderAll(); persist(); close(); setStatus('已从 cURL 导入：' + p.method + ' ' + p.url, 'ok')
    } catch (e) { setStatus('cURL 解析失败：' + e.message, 'err') }
  }
  acts.append(c, sp, ok); m.appendChild(acts)
  bg.innerHTML = ''; bg.appendChild(m); bg.classList.add('open'); ta.focus(); bg.onclick = e => { if (e.target === bg) close() }
  function close() { bg.classList.remove('open'); bg.innerHTML = '' }
}

// ===== 保存 / 载入 / 分组 =====
function markDirty(t) { if (!t.dirty) { t.dirty = true; renderTabs() } }

function findSaved(id) { for (const g of state.collections) { const r = g.requests.find(x => x.id === id); if (r) return { g, r } } return null }

function snapshot(t) { return { method: t.method, url: t.url, params: JSON.parse(JSON.stringify(t.params)), headers: JSON.parse(JSON.stringify(t.headers)), bodyType: t.bodyType, body: t.body, formBody: JSON.parse(JSON.stringify(t.formBody)) } }

function shortUrl(u) { try { const x = new URL(/^[a-z]+:\/\//i.test(u) ? u : 'https://' + u.replace(/^\{\{[^}]+\}\}/, 'http://x')); return (x.pathname && x.pathname.length > 1) ? x.pathname : x.hostname } catch (e) { return String(u).slice(0, 28) } }

function saveCurrent() {
  const t = activeTab()
  if (t.savedId) { const f = findSaved(t.savedId); if (f) { Object.assign(f.r, snapshot(t)); f.r.name = t.name; t.dirty = false; persist(); renderTabs(); renderSidebar(); setStatus('已更新「' + t.name + '」', 'ok'); return } }
  const groupOpts = state.collections.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')
  openModal('保存请求', '把当前请求存入一个分组', [
    { label: '名称', id: 'mName', type: 'text', value: (t.url ? t.method + ' ' + shortUrl(t.url) : '未命名请求') },
    { label: '分组', id: 'mGroup', type: 'select', html: groupOpts + '<option value="__new">＋ 新建分组…</option>' },
  ], vals => {
    let gid = vals.mGroup
    if (gid === '__new' || !state.collections.length) { promptModal('新建分组', '新分组名称：', '新分组', gn => { if (gn) { const g = { id: uid(), name: gn, collapsed: false, requests: [] }; state.collections.push(g); gid = g.id; doSave(vals, gid) } }); return }
    doSave(vals, gid)
  })
  function doSave(vals, gid) {
    const g = state.collections.find(x => x.id === gid); if (!g) return
    const r = Object.assign({ id: uid(), name: vals.mName || '未命名请求' }, snapshot(t))
    g.requests.push(r); t.savedId = r.id; t.name = r.name; t.dirty = false; persist(); renderTabs(); renderSidebar(); setStatus('已保存到「' + g.name + '」', 'ok')
  }
}

function openSaved(r) {
  const exist = state.tabs.find(t => t.savedId === r.id); if (exist) { state.activeTab = exist.id; renderAll(); return }
  const t = newTab({ name: r.name, savedId: r.id, method: r.method, url: r.url, params: JSON.parse(JSON.stringify(r.params || [blankRow()])), headers: JSON.parse(JSON.stringify(r.headers || [blankRow()])), bodyType: r.bodyType || 'none', body: r.body || '', formBody: JSON.parse(JSON.stringify(r.formBody || [blankRow()])) })
  if (!t.params.length) t.params = [blankRow()]; if (!t.headers.length) t.headers = [blankRow()]; if (!t.formBody.length) t.formBody = [blankRow()]
  state.tabs.push(t); state.activeTab = t.id; renderAll(); persist(); setStatus('已载入「' + r.name + '」')
}

function deleteSaved(g, r) { confirmModal('删除已保存的请求「' + r.name + '」？', ok2 => { if (!ok2) return; g.requests = g.requests.filter(x => x.id !== r.id); state.tabs.forEach(t => { if (t.savedId === r.id) { t.savedId = null; t.dirty = true } }); persist(); renderSidebar(); renderTabs() }) }

function renameGroup(g) { promptModal('重命名分组', '分组名称：', g.name, n => { if (n) { g.name = n.trim() || g.name; persist(); renderSidebar() } }) }

function deleteGroup(g) { confirmModal('删除分组「' + g.name + '」及其中 ' + g.requests.length + ' 个请求？', ok2 => { if (!ok2) return; const ids = g.requests.map(r => r.id); state.collections = state.collections.filter(x => x.id !== g.id); state.tabs.forEach(t => { if (ids.includes(t.savedId)) { t.savedId = null; t.dirty = true } }); persist(); renderSidebar(); renderTabs() }) }

// ===== tab 操作 =====
function closeTab(t) {
  if (t.dirty && (t.url || t.savedId)) { confirmModal('该 tab 有未保存修改，仍要关闭？', ok2 => { if (ok2) doClose() }); return }
  doClose()
  function doClose() {
    const i = state.tabs.indexOf(t); state.tabs.splice(i, 1)
    if (!state.tabs.length) { const nt = newTab(); state.tabs.push(nt); state.activeTab = nt.id }
    else if (state.activeTab === t.id) state.activeTab = state.tabs[Math.max(0, i - 1)].id
    renderAll(); persist()
  }
}

// ===== 通用模态 =====
function confirmModal(msg, onOk) {
  const bg = $('#modalBg'); const m = el('div', 'modal')
  m.innerHTML = '<h3>确认</h3><div class="sub">' + esc(msg) + '</div>'
  const acts = el('div', 'acts'); const sp = el('div'); sp.style.flex = '1'
  const cancel = el('button', 'btn ghost', '取消'); cancel.onclick = close
  const ok = el('button', 'btn primary danger', '确定'); ok.onclick = () => { close(); onOk(true) }
  acts.append(sp, cancel, ok); m.appendChild(acts)
  bg.innerHTML = ''; bg.appendChild(m); bg.classList.add('open')
  m.querySelector('button.danger')?.focus()
  m.addEventListener('keydown', e => { if (e.key === 'Escape') close() })
  bg.onclick = e => { if (e.target === bg) close() }
  function close() { bg.classList.remove('open'); bg.innerHTML = ''; onOk(false) }
}

function promptModal(title, label, defaultValue, onOk) {
  const bg = $('#modalBg'); const m = el('div', 'modal')
  m.innerHTML = '<h3>' + esc(title) + '</h3><div class="sub">' + esc(label) + '</div>'
  const f = el('div', 'field'); const input = el('input'); input.type = 'text'; input.value = defaultValue || ''; f.appendChild(input); m.appendChild(f)
  const acts = el('div', 'acts'); const sp = el('div'); sp.style.flex = '1'
  const cancel = el('button', 'btn ghost', '取消'); cancel.onclick = close
  const ok = el('button', 'btn primary', '确定'); ok.onclick = () => { const v = input.value.trim(); if (v) { close(); onOk(v) } }
  acts.append(sp, cancel, ok); m.appendChild(acts)
  bg.innerHTML = ''; bg.appendChild(m); bg.classList.add('open')
  input.focus(); input.select()
  m.addEventListener('keydown', e => { if (e.key === 'Enter' && input.value.trim()) { ok.click() }; if (e.key === 'Escape') close() })
  bg.onclick = e => { if (e.target === bg) close() }
  function close() { bg.classList.remove('open'); bg.innerHTML = ''; onOk(null) }
}

function openModal(title, sub, fields, onOk) {
  const bg = $('#modalBg'); const m = el('div', 'modal')
  m.innerHTML = `<h3>${esc(title)}</h3>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}`
  fields.forEach(f => { const fd = el('div', 'field'); fd.innerHTML = `<label>${esc(f.label)}</label>` + (f.type === 'select' ? `<select id="${f.id}">${f.html}</select>` : `<input id="${f.id}" type="text" value="${esc(f.value || '')}" />`); m.appendChild(fd) })
  const acts = el('div', 'acts'); const sp = el('div'); sp.style.flex = '1'
  const cancel = el('button', 'btn ghost', '取消'); cancel.onclick = close
  const ok = el('button', 'btn primary', '确定'); ok.onclick = () => { const vals = {}; fields.forEach(f => vals[f.id] = $('#' + f.id, m).value); if (onOk(vals) !== false) close() }
  acts.append(sp, cancel, ok); m.appendChild(acts)
  bg.innerHTML = ''; bg.appendChild(m); bg.classList.add('open')
  const first = m.querySelector('input,select'); if (first) { first.focus(); if (first.select) first.select() }
  m.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName !== 'SELECT') ok.click(); if (e.key === 'Escape') close() })
  bg.onclick = e => { if (e.target === bg) close() }
  function close() { bg.classList.remove('open'); bg.innerHTML = '' }
}

// ===== 导入 / 导出集合 =====
function bindImportExport() {
  const eb = $('#exportBtn'); if (eb) eb.onclick = () => { const data = JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), collections: state.collections, envs: state.envs }, null, 2); const a = el('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = 'pac-export.json'; a.click(); setStatus('已导出集合与环境', 'ok') }
  const ib = $('#importBtn'); if (ib) ib.onclick = () => $('#fileInput').click()
  const fi = $('#fileInput'); if (fi) fi.onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader()
    rd.onload = () => { try { const d = JSON.parse(rd.result); const cols = Array.isArray(d) ? d : d.collections; if (!Array.isArray(cols)) throw new Error('格式不符'); cols.forEach(g => { g.id = uid(); (g.requests || []).forEach(r => r.id = uid()) }); state.collections = state.collections.concat(cols); if (d.envs && Array.isArray(d.envs)) { d.envs.forEach(en => { en.id = uid() }); state.envs = state.envs.concat(d.envs); renderEnv() } persist(); renderSidebar(); setStatus('已导入 ' + cols.length + ' 个分组', 'ok') } catch (err) { setStatus('导入失败：' + err.message, 'err') } $('#fileInput').value = '' }
    rd.readAsText(f)
  }
}

// ===== 响应工具 =====
function downloadResp() {
  const t = activeTab(); const r = t.response; if (!r || r.error) return
  const d = getDrilled(t); let name = 'response'
  try { const u = new URL(r.url); name = (u.pathname.split('/').pop() || 'response') } catch (e) { }
  let blobUrl, revoke = false
  if (r.isBinary && r.blobUrl && !t.respPath) { blobUrl = r.blobUrl } else {
    const text = d.hasJSON ? JSON.stringify(d.data, null, 2) : r.text
    if (!/\./.test(name)) name += d.hasJSON ? '.json' : /html/.test(r.contentType) ? '.html' : '.txt'
    blobUrl = URL.createObjectURL(new Blob([text], { type: r.contentType || 'text/plain' })); revoke = true
  }
  const a = el('a'); a.href = blobUrl; a.download = name; a.click()
  if (revoke) setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  setStatus('已下载 ' + name, 'ok')
}

// ===== AI 分析 =====
function askAI() {
  const t = activeTab(); const r = t.response
  if (!r || !onSendToChat) return
  const summary = r.error ? `请求失败：${r.error}` : `状态 ${r.status} ${r.statusText}，耗时 ${ms(r.timeMs)}，大小 ${bytes(r.size)}`
  const bodyPreview = r.parsed !== undefined ? JSON.stringify(r.parsed).slice(0, 2000) : (r.text || '').slice(0, 2000)
  const prompt = `分析以下 API 请求与响应，给出问题诊断或数据解读：\n\n请求：${t.method} ${t.url}\n响应：${summary}\n响应体预览：\n${bodyPreview}`
  onSendToChat(prompt)
}

// ===== cURL 导出 =====
function exportCurl() {
  const t = activeTab(); if (!t || !t.url) { setStatus('请先填写 URL', 'warn'); return }
  const curl = toCurl(t, curEnv())
  copy(curl, 'cURL 已复制')
}

// ===== 内联代码生成 =====
function toggleCodeGen() {
  const panel = $('#codeGenPanel'); if (!panel) return
  const open = panel.style.display !== 'block'
  panel.style.display = open ? 'block' : 'none'
  if (open) generateCodeGen()
}

function generateCodeGen() {
  const t = activeTab(); if (!t || !t.url) { $('#codeOutput').textContent = '请先填写 URL'; return }
  try {
    const code = generateCode(t, ui.curLang || 'curl', curEnv())
    $('#codeOutput').textContent = code || '代码生成失败'
  } catch (e) { $('#codeOutput').textContent = '代码生成失败：' + e.message }
}

function switchLang(btn, lang) {
  ui.curLang = lang; persist()
  $$('#codeGenPanel .lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang))
  generateCodeGen()
}

function copyCode() {
  const code = $('#codeOutput')?.textContent
  if (code) copy(code, '代码已复制')
}

// ===== 响应工具函数 =====
function changeFont(v) { ui.resFont = parseInt(v); persist(); const p = $('#resPane'); if (p) p.style.fontSize = v + 'px' }

function expandLevel(n) { $$('.jt-children').forEach(c => { c.style.display = 'block'; if (c.previousElementSibling) { const tog = c.previousElementSibling.querySelector('.jt-tog'); if (tog) tog.textContent = '▾' } }); setStatus('已展开', 'ok') }

function toggleFullscreen() {
  ui.fullscreen = !ui.fullscreen
  const r = $('#resRegion') || $('#resPane')?.closest('.res-region')
  if (r) { r.style.position = ui.fullscreen ? 'fixed' : ''; r.style.inset = ui.fullscreen ? '0' : ''; r.style.zIndex = ui.fullscreen ? '100' : ''; r.style.background = ui.fullscreen ? 'var(--bg)' : ''; setStatus(ui.fullscreen ? '全屏模式' : '退出全屏', 'ok') }
}

// ===== 全局窗口函数 =====
function setupGlobal() {
  window.__copyRes = () => { const t = activeTab(); const d = getDrilled(t); if (!t.response || t.response.error) return; copy(d.hasJSON ? JSON.stringify(d.data, null, 2) : (t.response.text || ''), '已复制') }
  window.__dlRes = () => downloadResp()
  window.__exportCurl = () => exportCurl()
  window.__askAI = () => askAI()
  window.__setPath = (p) => { const t = activeTab(); t.respPath = p; renderRespBody() }
  window.__setFilter = (f) => { const t = activeTab(); t.respFilter = f; renderRespBody() }
  window.__togglePretty = () => { const t = activeTab(); t.prettyCells = (t.prettyCells === false); persist(); renderRespBody() }
  window.__expandAll = () => { $$('.jt-children').forEach(c => c.style.display = 'block') }
  window.__collapseAll = () => { $$('.jt-children').forEach(c => c.style.display = 'none') }
  window.__jtToggle = (el) => { const next = el.nextElementSibling; if (next) { const h = next.style.display === 'none'; next.style.display = h ? 'block' : 'none'; el.querySelector('.jt-tog').textContent = h ? '▾' : '▸' } }
  window.__onServerChange = (sel) => onServerChange(sel)
  window.__replaceServerUrl = () => replaceServerUrl()
  window.__onTemplateSelect = (sel) => onTemplateSelect(sel)
  window.__saveTemplate = () => saveTemplate()
  window.__copyCode = () => copyCode()
  window.__changeFont = (v) => changeFont(v)
  window.__expandLevel = (n) => expandLevel(n)
  window.__toggleFullscreen = () => toggleFullscreen()
}

// ===== 事件绑定 =====
function bindEvents() {
  $('#sendBtn').onclick = send
  $('#saveBtn').onclick = saveCurrent
  $('#curlBtn').onclick = () => copy(toCurl(activeTab(), curEnv()), 'cURL 已复制')
  $('#curlImportBtn').onclick = openCurlImport
  $('#codeGenBtn').onclick = toggleCodeGen
  const url = $('#url')
  if (url) {
    url.addEventListener('input', e => { const t = activeTab(); t.url = e.target.value; markDirty(t); updateResolvedPreview() })
    url.addEventListener('change', e => { const t = activeTab(); t.url = e.target.value; syncUrlToParams(t); if (t.reqTab === 'params') renderReqEditor(); persist() })
    url.addEventListener('keydown', e => { if (e.key === 'Enter') send() })
  }
  $$('#reqSubtabs .subtab').forEach(b => b.onclick = () => { activeTab().reqTab = b.dataset.rt; renderReqEditor(); persist() })
  // 模式切换
  $$('#modeBar .mode-btn').forEach(b => b.onclick = () => {
    $$('#modeBar .mode-btn').forEach(x => x.classList.remove('active')); b.classList.add('active')
    ui.mode = b.dataset.mode; persist()
    $('#customPanel').style.display = ui.mode === 'custom' ? 'block' : 'none'
    if (ui.mode === 'custom') $('#customHint').style.display = 'block'
  })
  // 响应双视图切换
  $$('#resTabs .res-tab').forEach(b => {
    if (b.dataset.rt) b.onclick = () => {
      $$('#resTabs .res-tab').forEach(x => x.classList.remove('active')); b.classList.add('active')
      ui.resTab = b.dataset.rt; persist()
      if (activeTab()?.response) renderRespBody()
    }
  })
  // 代码生成语言切换
  $$('#codeGenPanel .lang-btn').forEach(b => b.onclick = () => switchLang(b, b.dataset.lang))
  const srch = $('#search'); if (srch) srch.addEventListener('input', renderSidebar)
  const ng = $('#newGroup'); if (ng) ng.onclick = () => { promptModal('新建分组', '新分组名称：', '新分组', n => { if (n) { state.collections.push({ id: uid(), name: n.trim(), collapsed: false, requests: [] }); persist(); renderSidebar() } }) }
  const lb = $('#layoutBtn'); if (lb) lb.onclick = () => { ui.layout = ui.layout === 'h' ? 'v' : 'h'; applyLayout(); persist() }
  const pb = $('#proxyBtn'); if (pb) pb.onclick = () => { ui.proxyOn = !ui.proxyOn; applyProxyBtn(); persist(); setStatus(ui.proxyOn ? '已开启跨域代理' : '已关闭代理 · 浏览器直连', 'ok') }
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send() }
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveCurrent() }
  })
}

function applyProxyBtn() {
  const b = $('#proxyBtn'); if (!b) return
  b.innerHTML = ui.proxyOn ? '🛡 代理:开' : '🛡 代理:关'
  b.style.color = ui.proxyOn ? 'var(--brand)' : ''
  b.style.borderColor = ui.proxyOn ? 'var(--brand)' : ''
}

function bindDividerDrag() {
  const div = $('#divider'), split = $('#split'); if (!div || !split) return
  let dragging = false
  div.addEventListener('mousedown', e => { dragging = true; document.body.style.cursor = ui.layout === 'h' ? 'col-resize' : 'row-resize'; document.body.style.userSelect = 'none'; e.preventDefault() })
  document.addEventListener('mousemove', e => {
    if (!dragging) return; const r = split.getBoundingClientRect()
    if (ui.layout === 'h') { const w = Math.max(160, Math.min(Math.max(60, r.width - 180), e.clientX - r.left)); ui.reqW = w; split.style.setProperty('--reqW', w + 'px') }
    else { const h = Math.max(80, Math.min(Math.max(80, r.height - 120), e.clientY - r.top)); ui.reqH = h; split.style.setProperty('--reqH', h + 'px') }
  })
  document.addEventListener('mouseup', () => { if (dragging) { dragging = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; persist() } })
}

function bindCellTooltip() {
  const tip = $('#cellTip'); if (!tip) return
  let on = false
  const wantShow = td => { const full = td.getAttribute('data-full'); if (full == null || full === '') return null; const truncated = td.scrollWidth > td.clientWidth + 1; return (truncated || full.length > 56) ? full : null }
  document.addEventListener('mouseover', e => {
    const x = e.target; if (!(x instanceof Element)) return; const td = x.closest('td[data-full]'); if (!td) { if (on) { tip.classList.remove('show'); on = false } return }
    const full = wantShow(td); if (full == null) { if (on) { tip.classList.remove('show'); on = false } return }
    tip.textContent = full.length > 2000 ? full.slice(0, 2000) + '…' : full; tip.classList.add('show'); on = true
  })
  document.addEventListener('mousemove', e => {
    if (!on) return; const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight
    let x = e.clientX + pad, y = e.clientY + pad
    if (x + w > innerWidth - 8) x = e.clientX - w - pad
    if (y + h > innerHeight - 8) y = e.clientY - h - pad
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px'
  })
  document.addEventListener('mouseout', e => { const x = e.target; if (!(x instanceof Element)) return; if (x.closest('td[data-full]')) { tip.classList.remove('show'); on = false } })
}

function applyLayout() {
  const split = $('#split'); if (!split) return
  split.classList.toggle('h', ui.layout === 'h')
  const defH = _panelMode ? 180 : 240, defW = _panelMode ? 320 : 520
  split.style.setProperty('--reqH', (ui.reqH || defH) + 'px')
  split.style.setProperty('--reqW', (ui.reqW || defW) + 'px')
  const lb = $('#layoutBtn'); if (lb) lb.innerHTML = ui.layout === 'h' ? '⇅ 上下' : '⇄ 左右'
}

function renderAll() { renderTabs(); renderRequestBar(); renderReqEditor(); renderResponse(); renderSidebar(); renderEnv() }

export function initApi(options = {}) {
  onSendToChat = options.onSendToChat || null
  bindMethodMenu(); bindTopEvents(); bindImportExport(); bindEvents(); bindDividerDrag(); bindCellTooltip(); setupGlobal()
  load()
  if (_panelMode) { ui.layout = 'v'; ui.sideCollapsed = true }
  const main = $('#main'); if (main) main.classList.toggle('collapsed', ui.sideCollapsed)
  applyLayout(); applyProxyBtn()
  renderServers(); renderTemplates()
  renderAll()
}

export function getApiState() { return state }
export { activeTab as getActiveTab }