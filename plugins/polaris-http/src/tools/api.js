// tools/api.js — API 请求客户端核心（v2 原型风格：模板/服务器/Auth/内联代码生成/响应双视图）
import { $, $$, uid, esc, el, METHODS, methodColor, bytes, ms, setStatus, copy, blankRow, renderKVRows } from '../core/dom.js'
import { store, clone } from '../core/store.js'
import { sendRequest, resolveVars, tryJSON, formatBytes, formatMs } from '../core/http.js'
import { toCurl, generateCode, parseCurl } from '../core/parser.js'
import { getByPath, collectPaths, renderJSONTree, renderTableView } from '../core/json-view.js'

// ===== 状态持久化 =====
const LS_TABS = 'polaris.http.tabs.v2', LS_COL = 'polaris.http.collections.v2', LS_ENV = 'polaris.http.envs.v2', LS_UI = 'polaris.http.ui.v2', LS_SRV = 'polaris.http.servers.v2', LS_TMPL = 'polaris.http.templates.v2'
let state = { tabs: [], activeTab: null, collections: [], envs: [], activeEnv: null }
let ui = { sideCollapsed: false, layout: 'h', reqW: 480, reqH: 220, proxyOn: false, resFont: 13, resTab: 'data', fullscreen: false, mode: 'http', curLang: 'curl' }
let servers = []
let templates = []
let _panelMode = false, _proxyBase = 'http://127.0.0.1:9872'
export function setApiPanelMode(on, proxyBase) { _panelMode = !!on; if (proxyBase) _proxyBase = proxyBase; if (on) { ui.proxyOn = true; persist() } }
// 模板 body↔form 同步锁
let _syncingForm = false

function newTab(seed) {
  return Object.assign({
    id: uid(), name: '未命名请求', savedId: null, dirty: false,
    method: 'GET', url: '', params: [blankRow()], headers: [blankRow()],
    bodyType: 'none', body: '', formBody: [blankRow()],
    authType: 'bearer', authToken: '', authUsername: '', authPassword: '',
    reqTab: 'params', respView: 'object', respPath: '', respFilter: '', tableSel: null,
    pretty: true, response: null,
    _templateId: null, _formData: null,
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
  } catch (e) { setStatus('本地保存失败', 'err') }
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

function seed() {
  if (!state.envs.length) {
    const demo = { id: uid(), name: 'Demo', baseUrl: 'https://jsonplaceholder.typicode.com', vars: [blankRow()] }
    const local = { id: uid(), name: '本地', baseUrl: 'http://127.0.0.1:8080', vars: [blankRow()] }
    state.envs = [demo, local]; state.activeEnv = demo.id
  }
  if (!state.collections.length) {
    state.collections = [{
      id: uid(), name: '示例', collapsed: false, requests: [
        sreq('用户列表', 'GET', '{{baseUrl}}/users'),
        sreq('单个 Todo', 'GET', '{{baseUrl}}/todos/1'),
        sreq('新建 Post', 'POST', '{{baseUrl}}/posts', { bodyType: 'json', body: JSON.stringify({ title: 'hello', body: 'world', userId: 1 }, null, 2), headers: [blankRow()] }),
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
function sreq(name, method, url, extra) { return Object.assign({ id: uid(), name, method, url, params: [blankRow()], headers: [blankRow()], bodyType: 'none', body: '', formBody: [blankRow()] }, extra || {}) }

// ===== 环境 =====
function curEnv() { return state.envs.find(e => e.id === state.activeEnv) }

function renderEnv() {
  const env = curEnv()
  $('#envName').textContent = env ? env.name : '无环境'
  $('#envSel').title = env && env.baseUrl ? 'baseUrl: ' + env.baseUrl : '未选择环境'
  const menu = $('#envMenu'); menu.innerHTML = ''
  state.envs.forEach(e => {
    const b = el('button', 'env-item' + (e.id === state.activeEnv ? ' on' : ''), '<span>' + esc(e.name) + '</span><small>' + esc(e.baseUrl || '(无 baseUrl)') + '</small>')
    b.onclick = () => { state.activeEnv = e.id; persist(); renderEnv(); updateUrlPreview(); $('#envMenu').classList.remove('open'); setStatus('已切换环境：' + e.name, 'ok') }
    menu.appendChild(b)
  })
  const none = el('button', 'env-item' + (!state.activeEnv ? ' on' : ''), '<span>无环境</span><small>不解析变量</small>')
  none.onclick = () => { state.activeEnv = null; persist(); renderEnv(); updateUrlPreview(); $('#envMenu').classList.remove('open') }
  menu.appendChild(none)
  const mng = el('button', 'env-item manage', '<span>管理环境...</span>')
  mng.onclick = () => { $('#envMenu').classList.remove('open'); openEnvManager() }
  menu.appendChild(mng)
}

function openEnvManager() {
  const bg = $('#modalBg'); const m = el('div', 'modal wide')
  let selId = state.activeEnv || (state.envs[0] && state.envs[0].id)
  function render() {
    const env = state.envs.find(e => e.id === selId)
    m.innerHTML = '<h3>环境与变量</h3><div class="sub">每个环境含 baseUrl 与一组变量；URL 中用 {{baseUrl}}、{{变量名}} 引用。</div>'
    const tabs = el('div', 'env-tabs')
    state.envs.forEach(e => { const b = el('button', 'env-tab' + (e.id === selId ? ' on' : ''), esc(e.name) + (e.id === state.activeEnv ? ' ●' : '')); b.onclick = () => { selId = e.id; render() }; tabs.appendChild(b) })
    const add = el('button', 'env-tab add', '+ 新建环境'); add.onclick = () => { const ne = { id: uid(), name: '环境 ' + (state.envs.length + 1), baseUrl: '', vars: [blankRow()] }; state.envs.push(ne); selId = ne.id; render() }
    tabs.appendChild(add); m.appendChild(tabs)
    if (env) {
      const f1 = el('div', 'field'); f1.innerHTML = '<label>环境名称</label>'; const i1 = el('input'); i1.value = env.name; i1.oninput = () => env.name = i1.value; f1.appendChild(i1); m.appendChild(f1)
      const f2 = el('div', 'field'); f2.innerHTML = '<label>baseUrl</label>'; const i2 = el('input'); i2.placeholder = 'http://127.0.0.1:8080'; i2.value = env.baseUrl || ''; i2.oninput = () => env.baseUrl = i2.value; f2.appendChild(i2); m.appendChild(f2)
      const f3 = el('div', 'field'); f3.innerHTML = '<label>变量</label>'; const host = el('div', 'env-vars'); if (!env.vars) env.vars = [blankRow()]; host.appendChild(renderKVRows(env.vars, { kPlace: '变量名', vPlace: '值', onChange: () => { persist() } })); f3.appendChild(host); m.appendChild(f3)
    }
    const acts = el('div', 'acts');
    if (env) { const del = el('button', 'btn ghost danger', '删除'); del.onclick = () => { confirmModal('删除环境「' + env.name + '」？', ok2 => { if (ok2) { state.envs = state.envs.filter(e => e.id !== env.id); if (state.activeEnv === env.id) state.activeEnv = state.envs[0] ? state.envs[0].id : null; selId = state.envs[0] && state.envs[0].id; render() } }) }; acts.appendChild(del) }
    const sp = el('div'); sp.style.flex = '1'; acts.appendChild(sp)
    if (env) { const use = el('button', 'btn', env.id === state.activeEnv ? '✓ 当前环境' : '设为当前'); use.onclick = () => { state.activeEnv = selId; persist(); renderEnv(); updateUrlPreview(); render() }; acts.appendChild(use) }
    const done = el('button', 'btn primary', '完成'); done.onclick = close; acts.appendChild(done)
    m.appendChild(acts)
  }
  function close() { state.envs.forEach(e => { if (e.vars) e.vars = e.vars.filter(r => r.key || r.value) }); persist(); renderEnv(); updateUrlPreview(); bg.classList.remove('open'); bg.innerHTML = '' }
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
      // 替换 URL 域名
      const t = activeTab()
      if (t && t.url) {
        try {
          const u = new URL(t.url.indexOf('{{') >= 0 ? t.url.replace(/\{\{[^}]+\}\}/g, 'x') : t.url)
          const newUrl = srv.url + u.pathname + u.search + u.hash
          t.url = newUrl; $('#url').value = newUrl; markDirty(t); updateUrlPreview(); persist()
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
    t.url = newUrl; $('#url').value = newUrl; markDirty(t); updateUrlPreview(); persist()
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
      row.innerHTML = '<input class="srv-input" value="' + esc(s.name) + '" placeholder="名称" /><input class="srv-input" value="' + esc(s.url) + '" placeholder="https://..." style="flex:1" />' +
        '<button class="btn icon ghost" style="font-size:14px;color:var(--err)" onclick="window.__delSrv(' + i + ')">×</button>'
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
  // 保存当前 form 数据再切换
  if (t._templateId && t._formData) { /* snapshot kept in _formData */ }
  t._templateId = tmpl.id
  t.method = tmpl.method; t.url = tmpl.url; t.bodyType = tmpl.bodyType || 'none'
  // 生成表单
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
  // 找出所有提前定义的 bodyFields 和 body 中额外字段
  const allFields = tmpl.bodyFields || []
  const extraKeys = new Set()
  if (tmpl.bodyType === 'json') {
    const t = activeTab()
    if (t && t.body) {
      try {
        const parsed = JSON.parse(t.body)
        Object.keys(parsed).forEach(k => { if (!allFields.find(f => f.name === k)) extraKeys.add(k) })
      } catch (e) { /* ignore */ }
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
    const inp = document.getElementById('tf-' + f.name) || $('#templateFields').querySelector('input[placeholder="' + f.name + '"],textarea[placeholder="' + f.name + '"]')
    if (inp) {
      if (f.type === 'number') data[f.name] = inp.value ? Number(inp.value) : null
      else if (f.type === 'checkbox') data[f.name] = inp.checked
      else data[f.name] = inp.value
    }
  })
  // 额外字段
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
  if (!rows.length || rows[rows.length - 1].key || rows[rows.length - 1].value) rows.push(blankRow())
  wrap.appendChild(renderKVRows(rows, { kPlace: 'Header 名', vPlace: 'Header 值', onChange: () => {
    const cleaned = rows.filter(r => r.key)
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

// ===== URL 预览 =====
function updateUrlPreview() {
  const t = activeTab()
  const box = $('#urlResolved')
  if (t && t.url && t.url.indexOf('{{') >= 0) {
    const env = curEnv()
    box.innerHTML = '→ <b>' + esc(resolveVars(t.url, env)) + '</b>'
    box.style.display = 'block'
  } else { box.style.display = 'none' }
}

// ===== 方法绑定 =====
function bindMethodMenu() {
  const menu = $('#methodMenu'); if (!menu) return
  METHODS.forEach(m => { const b = el('button', methodColor(m), m); b.onclick = () => { const t = activeTab(); if (t) { t.method = m; markDirty(t) }; $('#methodMenu').classList.remove('open'); renderRequestBar(); renderReqEditor(); persist() }; menu.appendChild(b) })
}

function bindTopEvents() {
  const ms = $('#methodSel'); if (ms) ms.onclick = e => { e.stopPropagation(); $('#methodMenu').classList.toggle('open') }
  const es = $('#envSel'); if (es) es.onclick = e => { e.stopPropagation(); $('#envMenu').classList.toggle('open') }
  document.addEventListener('click', () => { const mm = $('#methodMenu'); if (mm) mm.classList.remove('open'); const em = $('#envMenu'); if (em) em.classList.remove('open') })
}

// ===== Tab 条 =====
function renderTabs() {
  const bar = $('#tabbar'); bar.innerHTML = ''
  state.tabs.forEach(t => {
    const tab = el('div', 'rtab' + (t.id === state.activeTab ? ' active' : ''))
    tab.innerHTML = '<span class="tm ' + methodColor(t.method) + '">' + t.method + '</span><span class="tn">' + esc(t.name) + '</span>'
    if (t.dirty) tab.appendChild(el('span', 'dirty', '●'))
    const x = el('button', 'tx', '×'); x.onclick = e => { e.stopPropagation(); closeTab(t) }; tab.appendChild(x)
    tab.onclick = () => { state.activeTab = t.id; renderAll(); persist() }
    tab.querySelector('.tn').ondblclick = e => { e.stopPropagation(); promptModal('重命名 Tab', '输入新名称：', t.name, v => { if (v != null) { t.name = v.trim() || t.name; renderTabs(); persist() } }) }
    bar.appendChild(tab)
  })
  const add = el('button', 'tab-add', '+'); add.onclick = () => { const nt = newTab(); state.tabs.push(nt); state.activeTab = nt.id; renderAll(); persist() }
  bar.appendChild(add)
  $('#stTabs').textContent = state.tabs.length
}

// ===== 请求栏 =====
function renderRequestBar() {
  const t = activeTab()
  const lbl = $('#methodLabel'); if (lbl) { lbl.textContent = t.method; lbl.className = methodColor(t.method) }
  const urlIn = $('#url'); if (urlIn && document.activeElement !== urlIn) urlIn.value = t.url
  updateUrlPreview()
}

// ===== 请求编辑区 =====
function renderReqEditor() {
  const t = activeTab()
  $$('#reqSubtabs .subtab').forEach(b => b.classList.toggle('active', b.dataset.rt === t.reqTab))
  const pane = $('#reqPane'); pane.innerHTML = ''
  if (t.reqTab === 'params') {
    pane.appendChild(renderKVRows(t.params, { kPlace: '参数名', vPlace: '参数值', onChange: () => { markDirty(t); syncParamsToUrl(t); persist() } }))
  } else if (t.reqTab === 'headers') {
    const wrap = el('div')
    wrap.appendChild(renderKVRows(t.headers, { kPlace: 'Header 名', vPlace: 'Header 值', onChange: () => { markDirty(t); persist() } }))
    const suggest = el('div', 'suggest')
    const COMMON = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' }
    Object.entries(COMMON).forEach(([k, v]) => {
      const chip = el('button', 'chip', k)
      chip.onclick = () => { t.headers.pop(); t.headers.push({ id: uid(), enabled: true, key: k, value: v }); t.headers.push(blankRow()); persist(); renderReqEditor() }
      suggest.appendChild(chip)
    })
    wrap.appendChild(suggest)
    pane.appendChild(wrap)
  } else if (t.reqTab === 'body') {
    renderBodyEditor(pane, t)
  } else if (t.reqTab === 'auth') {
    renderAuthPane()
  } else if (t.reqTab === 'global') {
    renderGlobalHeadersPane()
  }
}

function renderBodyEditor(pane, t) {
  const bar = el('div', 'body-bar'); const seg = el('div', 'seg')
  ;[['none', '无'], ['json', 'JSON'], ['text', '文本'], ['form', 'Form']].forEach(([v, l]) => {
    const b = el('button', t.bodyType === v ? 'on' : '', l); b.onclick = () => { t.bodyType = v; markDirty(t); persist(); renderReqEditor() }; seg.appendChild(b)
  })
  bar.appendChild(seg); bar.appendChild(el('div', 'sp'))
  if (t.bodyType === 'json') { const fmt = el('button', 'tool', '格式化'); fmt.onclick = () => { try { t.body = JSON.stringify(JSON.parse(t.body), null, 2); renderReqEditor(); persist(); setStatus('JSON 已格式化', 'ok') } catch (e) { setStatus('JSON 无效', 'err') } }; bar.appendChild(fmt) }
  pane.appendChild(bar)
  if (t.bodyType === 'none') { pane.appendChild(el('div', 'body-none', '该请求没有 Body。选择 JSON / 文本 / Form 以编辑。')) }
  else if (t.bodyType === 'form') { const host = el('div'); host.style.cssText = 'height:calc(100% - 49px);overflow:auto'; host.appendChild(renderKVRows(t.formBody || [blankRow()], { kPlace: '字段名', vPlace: '字段值', onChange: () => { markDirty(t); persist() } })); pane.appendChild(host) }
  else {
    const ta = el('textarea', 'code'); ta.spellcheck = false; ta.placeholder = t.bodyType === 'json' ? '{\n  "key": "value"\n}' : '原始请求体…'; ta.value = t.body; ta.style.cssText = 'width:100%;min-height:80px;padding:10px;border-radius:4px;background:var(--bg);border:1px solid var(--line);font-size:12px;color:var(--ink);resize:vertical;tab-size:2'
    ta.addEventListener('input', () => { t.body = ta.value; markDirty(t); persist(); if (!_syncingForm) { t._formData = null } })
    ta.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart, en = ta.selectionEnd; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + 2; t.body = ta.value } })
    pane.appendChild(ta)
  }
}

function splitUrl(url) { const i = url.indexOf('?'); return i < 0 ? [url, ''] : [url.slice(0, i), url.slice(i + 1)] }

function syncParamsToUrl(t) {
  const [base] = splitUrl(t.url)
  const qs = t.params.filter(p => p.enabled !== false && p.key).map(p => encodeURIComponent(p.key) + '=' + encodeURIComponent(p.value)).join('&')
  t.url = qs ? base + '?' + qs : base
  const urlIn = $('#url'); if (document.activeElement !== urlIn) urlIn.value = t.url
  updateUrlPreview()
}

// ===== 发送 =====
async function send() {
  const t = activeTab()
  let url = resolveVars(t.url.trim(), curEnv())
  if (!url) { setStatus('请先输入 URL', 'warn'); $('#url').focus(); return }
  if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) url = 'https://' + url
  const qIdx = url.indexOf('?')
  let baseUrl = qIdx >= 0 ? url.slice(0, qIdx) : url
  const method = (t.method || 'GET').toUpperCase()
  const headers = {}
  if (t.headers) t.headers.filter(h => h.enabled !== false && h.key).forEach(h => headers[resolveVars(h.key, curEnv())] = resolveVars(h.value, curEnv()))
  // 全局 Headers
  const globalHeaders = getGlobalHeaders()
  globalHeaders.filter(h => h.enabled !== false && h.key).forEach(h => { if (!Object.keys(headers).some(k => k.toLowerCase() === h.key.toLowerCase())) headers[h.key] = h.value })
  // Auth
  if (t.authType === 'bearer' && t.authToken && !Object.keys(headers).some(k => k.toLowerCase() === 'authorization')) headers['Authorization'] = 'Bearer ' + t.authToken
  else if (t.authType === 'basic' && t.authUsername && t.authPassword && !Object.keys(headers).some(k => k.toLowerCase() === 'authorization')) {
    headers['Authorization'] = 'Basic ' + btoa(t.authUsername + ':' + t.authPassword)
  }
  if (t.params) {
    const qs = t.params.filter(p => p.enabled !== false && p.key).map(p => encodeURIComponent(resolveVars(p.key, curEnv())) + '=' + encodeURIComponent(resolveVars(p.value || '', curEnv()))).join('&')
    if (qs) baseUrl += '?' + qs
  }
  let body
  if (!['GET', 'HEAD'].includes(method)) {
    if (t.bodyType === 'json') { body = resolveVars(t.body || '', curEnv()); if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json' }
    else if (t.bodyType === 'text') { body = resolveVars(t.body || '', curEnv()) }
    else if (t.bodyType === 'form') { const fd = t.formBody || []; if (Array.isArray(fd)) { body = fd.filter(f => f.enabled !== false && f.key).map(f => encodeURIComponent(resolveVars(f.key, curEnv())) + '=' + encodeURIComponent(resolveVars(f.value || '', curEnv()))).join('&'); if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded' } }
  }

  const btn = $('#sendBtn'); btn.disabled = true; btn.innerHTML = '发送中…'
  $('#resStatus').style.display = 'none'; $('#resTabs').style.display = 'none'; $('#resTools').style.display = 'none'
  $('#resPane').innerHTML = '<div class="res-loading"><span class="spin"></span> 请求发送中…</div>'
  setStatus(method + ' ' + baseUrl + (ui.proxyOn ? ' · 经代理' : '') + ' …')
  let fetchUrl = baseUrl, fetchHeaders = headers
  if (ui.proxyOn) { fetchHeaders = Object.assign({}, headers, { 'X-Polaris-Target': baseUrl }); fetchUrl = _panelMode ? _proxyBase + '/__proxy' : '/__proxy' }
  const t0 = performance.now()
  try {
    if (t.response && t.response.blobUrl) { try { URL.revokeObjectURL(t.response.blobUrl) } catch (e) {} }
    const res = await fetch(fetchUrl, { method, headers: fetchHeaders, body, redirect: 'follow' })
    const blob = await res.blob(); const t1 = performance.now()
    const ct = res.headers.get('content-type') || ''; const isBin = /^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-|gzip)/i.test(ct)
    let text = ''; if (!isBin) text = await blob.text()
    const resHeaders = {}; res.headers.forEach((v, k) => resHeaders[k] = v)
    const parsed = tryJSON(text)
    t.response = {
      status: res.status, statusText: res.statusText, ok: res.ok, timeMs: t1 - t0, size: blob.size,
      contentType: ct, headers: resHeaders, text, isBinary: isBin, blobUrl: isBin ? URL.createObjectURL(blob) : null, url: baseUrl,
      parsed: parsed.ok ? parsed.value : undefined,
    }
    t.respPath = ''; t.respFilter = ''; t.tableSel = null
    t.respView = parsed.ok ? (Array.isArray(parsed.value) ? 'table' : 'object') : /text\/html/i.test(ct) ? 'raw' : 'raw'
    renderResponse()
    setStatus(method + ' ' + res.status + ' ' + res.statusText + ' · ' + ms(t1 - t0) + ' · ' + bytes(blob.size), res.ok ? 'ok' : 'warn')
  } catch (err) {
    const t1 = performance.now(); t.response = { error: err.message || String(err), timeMs: t1 - t0, url: baseUrl }; renderResponse()
    setStatus('请求失败：' + (err.message || err), 'err')
  } finally { btn.disabled = false; btn.innerHTML = '发送 <span class="k">⌘↵</span>' }
}

// ===== 响应渲染 =====
function getDrilled(t) {
  const r = t.response; const root = r && !r.error ? r.parsed : undefined
  let data = root
  // 业务数据视图：自动下钻到常见根路径
  if (ui.resTab === 'data' && root !== undefined) {
    for (const key of ['data', 'result', 'response', 'results', 'items', 'list']) {
      if (root && typeof root === 'object' && !Array.isArray(root) && key in root) {
        const g = getByPath(root, key); if (g.ok) { data = g.value; break }
      }
    }
  }
  if (t.respPath && root !== undefined) { const g = getByPath(root, t.respPath); if (g.ok) data = g.value; else data = undefined }
  const hasJSON = data !== undefined
  const canTable = hasJSON && (Array.isArray(data) || (data && typeof data === 'object'))
  return { data, hasJSON, canTable }
}

export function renderRespBody() {
  const t = activeTab(); if (!t || !t.response || t.response.error) return
  const d = getDrilled(t)
  const caps = { table: d.canTable, object: d.hasJSON, raw: true, headers: true }
  if (!caps[t.respView]) t.respView = d.hasJSON ? 'object' : 'raw'
  $$('#resViews .rv').forEach(b => { const v = b.dataset.rv; b.classList.toggle('active', v === t.respView); b.classList.toggle('disabled', !caps[v]) })
  const pane = $('#resPane')
  if (t.respView === 'raw') pane.innerHTML = '<pre class="raw-view">' + esc(t.response.text || '') + '</pre>'
  else if (t.respView === 'object') pane.innerHTML = renderJSONTree(d.data, { pretty: t.pretty })
  else if (t.respView === 'table') pane.innerHTML = renderTableView(d.data, { pretty: t.pretty })
  else if (t.respView === 'headers') pane.innerHTML = renderHeadersView(t.response.headers)
  // 应用字号
  pane.style.fontSize = ui.resFont + 'px'
}

function renderResponse() {
  const t = activeTab(); const r = t.response
  const pane = $('#resPane'), tabs = $('#resTabs'), sb = $('#resStatus'), tools = $('#resTools')
  if (!r) { tabs.style.display = 'none'; sb.style.display = 'none'; tools.style.display = 'none'; pane.innerHTML = '<div class="res-idle"><div class="big">准备就绪</div><div class="tips">输入 URL 点「发送」，或从左侧集合载入一个请求。<br>· 多 tab：顶部 ＋ 新建，双击标签可重命名<br>· 环境变量：右上角切换，URL 里用 {{baseUrl}}<br>· 导入 cURL：右上角粘贴 curl 命令一键解析<br>· 跨域：顶栏「代理」开启后经本地后端转发</div></div>'; return }
  if (r.error) { tabs.style.display = 'none'; sb.style.display = 'none'; tools.style.display = 'none'; pane.innerHTML = '<div class="res-err"><div class="ti">请求失败</div><div>' + esc(r.error) + '</div></div>'; return }
  sb.style.display = 'flex'
  tabs.style.display = 'flex'
  const cls = r.status >= 500 ? 's5' : r.status >= 400 ? 's4' : r.status >= 300 ? 's3' : 's2'
  sb.innerHTML = '<span class="status-chip ' + cls + '"><span class="dotc"></span>' + r.status + ' ' + esc(r.statusText) + '</span>' +
    '<span class="res-meta"><span>耗时 <b>' + ms(r.timeMs) + '</b></span><span>大小 <b>' + bytes(r.size) + '</b></span>' + (r.contentType ? '<span>类型 <b>' + esc(r.contentType.split(';')[0]) + '</b></span>' : '') + '</span>' +
    '<span class="sp"></span>' +
    '<button class="tool" onclick="window.__copyRes()">⧉ 复制</button>' +
    '<button class="tool" onclick="window.__dlRes()">↓ 下载</button>' +
    '<button class="tool" onclick="window.__exportCurl()">导出 cURL</button>' +
    '<button class="tool" onclick="window.__askAI()">✦ AI</button>'
  tools.style.display = 'flex'
  const baseHasJSON = r.parsed !== undefined
  if (baseHasJSON) {
    const pths = collectPaths(r.parsed)
    const pathHtml = '<select class="path-select" onchange="window.__setPath(this.value)"><option value="">(根)</option>' + pths.map(p => '<option value="' + esc(p.path) + '"' + (p.path === t.respPath ? ' selected' : '') + '>' + esc(p.path || '(根)') + '</option>').join('') + '</select>'
    // 已放在 res-toolbar 中
  }
  renderRespBody()
}

function renderHeadersView(headers) {
  if (!headers || !Object.keys(headers).length) return '<div class="res-empty">无响应头</div>'
  let html = '<div class="tbl-wrap"><table class="dt"><thead><tr><th>Header</th><th>Value</th></tr></thead><tbody>'
  for (const [k, v] of Object.entries(headers)) html += '<tr><td class="jt-key">' + esc(k) + '</td><td>' + esc(v) + '</td></tr>'
  html += '</tbody></table></div>'
  return html
}

// ===== 响应工具函数 =====
function changeFont(v) { ui.resFont = parseInt(v); persist(); const p = $('#resPane'); if (p) p.style.fontSize = v + 'px' }
function expandLevel(n) { $$('.jt-children').forEach(c => { c.style.display = 'block'; if (c.previousElementSibling) { const tog = c.previousElementSibling.querySelector('.jt-tog'); if (tog) tog.textContent = '▾' } }); setStatus('已展开', 'ok') }
function toggleFullscreen() { ui.fullscreen = !ui.fullscreen; const r = $('#resRegion') || $('#resPane')?.closest('.res-region'); if (r) { r.style.position = ui.fullscreen ? 'fixed' : ''; r.style.inset = ui.fullscreen ? '0' : ''; r.style.zIndex = ui.fullscreen ? '100' : ''; r.style.background = ui.fullscreen ? 'var(--bg)' : ''; setStatus(ui.fullscreen ? '全屏模式' : '退出全屏', 'ok') } }

// ===== Tab 操作 =====
function markDirty(t) { if (!t.dirty) { t.dirty = true; renderTabs() } }
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

// ===== 集合管理 =====
function renderSidebar() {
  const tree = $('#tree'); tree.innerHTML = ''
  const q = ($('#search').value || '').toLowerCase().trim()
  let total = 0
  if (!state.collections.length) tree.appendChild(el('div', 'tree-empty', '还没有保存的请求。'))
  state.collections.forEach(g => {
    const list = q ? g.requests.filter(r => !q || r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q)) : g.requests
    total += g.requests.length
    if (q && !list.length && !g.name.toLowerCase().includes(q)) return
    const gEl = el('div', 'group' + (g.collapsed && !q ? ' collapsed' : ''))
    const head = el('div', 'group-head')
    head.innerHTML = '<span class="caret">▾</span><span class="gname">' + esc(g.name) + '</span><span class="gcount">' + g.requests.length + '</span>'
    head.onclick = () => { g.collapsed = !g.collapsed; persist(); renderSidebar() }
    gEl.appendChild(head)
    const reqs = el('div', 'reqs')
    list.forEach(r => {
      const item = el('div', 'req-item' + (activeTab() && activeTab().savedId === r.id ? ' active' : ''))
      item.innerHTML = '<span class="mb ' + methodColor(r.method) + '">' + r.method + '</span><span class="rn">' + esc(r.name) + '</span>'
      item.onclick = () => openSaved(r)
      reqs.appendChild(item)
    })
    gEl.appendChild(reqs); tree.appendChild(gEl)
  })
  $('#stSaved').textContent = total
}

function openSaved(r) {
  const exist = state.tabs.find(t => t.savedId === r.id)
  if (exist) { state.activeTab = exist.id; renderAll(); return }
  const t = newTab({ name: r.name, savedId: r.id, method: r.method, url: r.url, params: clone(r.params || [blankRow()]), headers: clone(r.headers || [blankRow()]), bodyType: r.bodyType || 'none', body: r.body || '', formBody: clone(r.formBody || [blankRow()]) })
  if (!t.params.length) t.params = [blankRow()]; if (!t.headers.length) t.headers = [blankRow()]; if (!t.formBody.length) t.formBody = [blankRow()]
  state.tabs.push(t); state.activeTab = t.id; renderAll(); persist()
}

function saveCurrent() {
  const t = activeTab()
  if (t.savedId) {
    const f = findSaved(t.savedId)
    if (f) { Object.assign(f.r, snapshot(t)); f.r.name = t.name; t.dirty = false; persist(); renderTabs(); renderSidebar(); setStatus('已更新「' + t.name + '」', 'ok'); return }
  }
  const groupOpts = state.collections.map(g => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('')
  function doSave(vals, gid) {
    const g = state.collections.find(x => x.id === gid); if (!g) return
    const r = Object.assign({ id: uid(), name: vals.mName || '未命名请求' }, snapshot(t))
    g.requests.push(r); t.savedId = r.id; t.name = r.name; t.dirty = false; persist(); renderTabs(); renderSidebar(); setStatus('已保存到「' + g.name + '」', 'ok')
  }
  function handleGroupSelect(vals) {
    let gid = vals.mGroup
    if (gid === '__new' || !state.collections.length) {
      promptModal('新建分组', '输入新分组名称：', '新分组', gn => { if (gn) { const g = { id: uid(), name: gn, collapsed: false, requests: [] }; state.collections.push(g); gid = g.id; doSave(vals, gid) } })
      return
    }
    doSave(vals, gid)
  }
  openModal('保存请求', '把当前请求存入一个分组', [
    { label: '名称', id: 'mName', type: 'text', value: (t.url ? t.method + ' ' + shortUrl(t.url) : '未命名请求') },
    { label: '分组', id: 'mGroup', type: 'select', html: groupOpts + '<option value="__new">+ 新建分组…</option>' },
  ], handleGroupSelect)
}

function snapshot(t) { return { method: t.method, url: t.url, params: clone(t.params), headers: clone(t.headers), bodyType: t.bodyType, body: t.body, formBody: clone(t.formBody) } }
function findSaved(id) { for (const g of state.collections) { const r = g.requests.find(x => x.id === id); if (r) return { g, r } } return null }
function shortUrl(u) { try { const x = new URL(/^[a-z]+:\/\//i.test(u) ? u : 'https://' + u.replace(/^\{\{[^}]+\}\}/, 'http://x')); return (x.pathname && x.pathname.length > 1) ? x.pathname : x.hostname } catch (e) { return String(u).slice(0, 28) } }

// ===== cURL 导入/导出 =====
function openCurlImport() {
  const bg = $('#modalBg'); const m = el('div', 'modal')
  m.innerHTML = '<h3>导入 cURL</h3><div class="sub">粘贴一条 curl 命令，解析为新的请求 tab。</div>'
  const f = el('div', 'field'); f.innerHTML = '<label>cURL 命令</label>'; const ta = el('textarea', 'curl-ta'); ta.placeholder = "curl 'https://api.example.com/users' -H 'Authorization: Bearer xxx'"
  f.appendChild(ta); m.appendChild(f)
  const overwrite = el('div', 'field'); overwrite.innerHTML = '<label><input type="checkbox" id="curlOverwrite" checked /> 覆盖现有参数</label>'
  m.appendChild(overwrite)
  const acts = el('div', 'acts'); const sp = el('div'); sp.style.flex = '1'
  const c = el('button', 'btn ghost', '取消'); c.onclick = close
  const ok = el('button', 'btn primary', '解析并新建')
  ok.onclick = () => {
    const txt = ta.value.trim(); if (!txt) { setStatus('请粘贴 curl 命令', 'warn'); return }
    try {
      const parsed = parseCurl(txt); if (!parsed.url) { setStatus('未能解析出 URL', 'err'); return }
      const nt = newTab({ name: 'cURL: ' + shortUrl(parsed.url), method: parsed.method, url: parsed.url, bodyType: parsed.bodyType, body: parsed.body, headers: (parsed.headers.length ? parsed.headers : []).concat([blankRow()]) })
      state.tabs.push(nt); state.activeTab = nt.id; renderAll(); persist(); close(); setStatus('已从 cURL 导入：' + parsed.method + ' ' + parsed.url, 'ok')
    } catch (e) { setStatus('cURL 解析失败：' + e.message, 'err') }
  }
  acts.append(c, sp, ok); m.appendChild(acts)
  bg.innerHTML = ''; bg.appendChild(m); bg.classList.add('open'); ta.focus(); bg.onclick = e => { if (e.target === bg) close() }
  function close() { bg.classList.remove('open'); bg.innerHTML = '' }
}

function exportCurl() {
  const t = activeTab(); if (!t || !t.url) { setStatus('请先填写 URL', 'warn'); return }
  const curl = toCurl(t, curEnv())
  copy(curl, 'cURL 已复制')
}

// ===== AI 分析 =====
function askAI() {
  const t = activeTab(); const r = t.response
  if (!r || !onSendToChat) return
  const summary = r.error ? `请求失败：${r.error}` : `状态 ${r.status} ${r.statusText}，耗时 ${formatMs(r.timeMs)}，大小 ${formatBytes(r.size)}`
  const bodyPreview = r.parsed !== undefined ? JSON.stringify(r.parsed).slice(0, 2000) : (r.text || '').slice(0, 2000)
  const prompt = `分析以下 API 请求与响应，给出问题诊断或数据解读：\n\n请求：${t.method} ${t.url}\n响应：${summary}\n响应体预览：\n${bodyPreview}`
  onSendToChat(prompt)
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

// ===== 自定义模态对话框 =====
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
  m.innerHTML = '<h3>' + esc(title) + '</h3>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '')
  fields.forEach(f => { const fd = el('div', 'field'); fd.innerHTML = '<label>' + esc(f.label) + '</label>' + (f.type === 'select' ? '<select id="' + f.id + '">' + f.html + '</select>' : '<input id="' + f.id + '" type="text" value="' + esc(f.value || '') + '" />'); m.appendChild(fd) })
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

// ===== 全局窗口函数 =====
function setupGlobal() {
  window.__copyRes = () => { const t = activeTab(); const d = getDrilled(t); copy(d.hasJSON ? JSON.stringify(d.data, null, 2) : (t.response.text || ''), '已复制') }
  window.__dlRes = () => {
    const t = activeTab(); const r = t.response; if (!r || r.error) return
    const d = getDrilled(t); let name = 'response', text = d.hasJSON ? JSON.stringify(d.data, null, 2) : r.text
    try { const u = new URL(r.url); name = u.pathname.split('/').pop() || 'response' } catch (e) { }
    if (!/\./.test(name)) name += d.hasJSON ? '.json' : /html/.test(r.contentType) ? '.html' : '.txt'
    const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; a.click()
  }
  window.__askAI = () => askAI()
  window.__setPath = (p) => { const t = activeTab(); t.respPath = p; renderRespBody() }
  window.__setFilter = (f) => { const t = activeTab(); t.respFilter = f; renderRespBody() }
  window.__togglePretty = () => { const t = activeTab(); t.pretty = !t.pretty; renderRespBody() }
  window.__expandAll = () => { $$('.jt-children').forEach(c => c.style.display = 'block') }
  window.__collapseAll = () => { $$('.jt-children').forEach(c => c.style.display = 'none') }
  window.__jtToggle = (el) => { const next = el.nextElementSibling; if (next) { const h = next.style.display === 'none'; next.style.display = h ? 'block' : 'none'; el.querySelector('.jt-tog').textContent = h ? '▾' : '▸' } }
  window.__ctx = (e) => {
    e.preventDefault()
    const menu = $('#ctxMenu'); const td = e.target.closest('td'); const full = td?.getAttribute('data-full') || td?.textContent || ''
    menu.innerHTML = '<button class="ctx-item" onclick="navigator.clipboard.writeText(\'' + esc(full) + '\').then(()=>{$(\'#ctxMenu\').style.display=\'none\'})">复制值</button>' +
      '<button class="ctx-item" onclick="navigator.clipboard.writeText(\'' + esc(td?.textContent || '') + '\').then(()=>{$(\'#ctxMenu\').style.display=\'none\'})">复制单元格</button>' +
      '<div class="ctx-sep"></div>' +
      '<button class="ctx-item" onclick="$(\'#ctxMenu\').style.display=\'none\'">复制列名</button>'
    menu.style.display = 'block'
    menu.style.left = (e.clientX + 10) + 'px'; menu.style.top = (e.clientY + 10) + 'px'
    document.addEventListener('click', () => { menu.style.display = 'none' }, { once: true })
  }
  window.__onServerChange = (sel) => onServerChange(sel)
  window.__replaceServerUrl = () => replaceServerUrl()
  window.__onTemplateSelect = (sel) => onTemplateSelect(sel)
  window.__saveTemplate = () => saveTemplate()
  window.__copyCode = () => copyCode()
  window.__changeFont = (v) => changeFont(v)
  window.__expandLevel = (n) => expandLevel(n)
  window.__toggleFullscreen = () => toggleFullscreen()
  window.__exportCurl = () => exportCurl()
}

// ===== 事件绑定 =====
let onSendToChat = null
export function initApi(options = {}) {
  onSendToChat = options.onSendToChat || null
  bindMethodMenu(); bindTopEvents(); bindMainEvents(); setupGlobal()
  load()
  applyLayout(); applyProxyBtn()
  renderServers(); renderTemplates()
  renderAll()
}

function bindMainEvents() {
  const sendBtn = $('#sendBtn'); if (sendBtn) sendBtn.onclick = () => send()
  const layoutBtn = $('#layoutBtn'); if (layoutBtn) layoutBtn.onclick = () => { ui.layout = ui.layout === 'h' ? 'v' : 'h'; persist(); applyLayout(); setStatus('布局已切换为 ' + (ui.layout === 'h' ? '左右' : '上下'), 'ok') }
  const proxyBtn = $('#proxyBtn'); if (proxyBtn) proxyBtn.onclick = () => { ui.proxyOn = !ui.proxyOn; persist(); applyProxyBtn(); setStatus(ui.proxyOn ? '已开启跨域代理' : '已关闭跨域代理', 'ok') }
  const curlImport = $('#curlImportBtn'); if (curlImport) curlImport.onclick = () => openCurlImport()
  const curlBtn = $('#curlBtn'); if (curlBtn) curlBtn.onclick = () => exportCurl()
  const codeGen = $('#codeGenBtn'); if (codeGen) codeGen.onclick = () => toggleCodeGen()
  const aiBtn = $('#aiBtn'); if (aiBtn) aiBtn.onclick = () => askAI()
  const saveBtn = $('#saveBtn'); if (saveBtn) saveBtn.onclick = () => saveCurrent()
  const newGroup = $('#newGroup'); if (newGroup) newGroup.onclick = () => { promptModal('新建分组', '输入新分组名称：', '新分组', gn => { if (gn) { const g = { id: uid(), name: gn, collapsed: false, requests: [] }; state.collections.push(g); persist(); renderSidebar(); setStatus('已创建分组「' + gn + '」', 'ok') } }) }
  const search = $('#search'); if (search) search.oninput = () => renderSidebar()
  // 模式切换
  $$('#modeBar .mode-btn').forEach(b => b.onclick = () => {
    $$('#modeBar .mode-btn').forEach(x => x.classList.remove('active')); b.classList.add('active')
    ui.mode = b.dataset.mode; persist()
    $('#customPanel').style.display = ui.mode === 'custom' ? 'block' : 'none'
    if (ui.mode === 'custom') $('#customHint').style.display = 'block'
  })
  // 子标签页切换
  $$('#reqSubtabs .subtab').forEach(b => b.onclick = () => { const t = activeTab(); if (t) { t.reqTab = b.dataset.rt; persist(); renderReqEditor() } })
  $$('#resViews .rv').forEach(b => b.onclick = () => { const t = activeTab(); if (t && t.response) { t.respView = b.dataset.rv; renderRespBody() } })
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
  // 分栏拖拽
  const divider = $('#divider'); if (divider) divider.onmousedown = e => {
    e.preventDefault()
    const split = $('#split'), rec = split.getBoundingClientRect()
    const isH = ui.layout === 'h'
    let moved = false
    const onMove = ev2 => {
      const delta = isH ? (ev2.clientX - rec.left - 130) : (ev2.clientY - rec.top - 30)
      const v = Math.max(120, Math.min(isH ? split.clientWidth - 260 : split.clientHeight - 160, delta))
      if (isH) { ui.reqW = v; split.style.setProperty('--reqW', v + 'px') }
      else { ui.reqH = v; split.style.setProperty('--reqH', v + 'px') }
      moved = true
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); if (moved) persist() }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }
  document.addEventListener('click', () => { const m = $('#ctxMenu'); if (m) m.style.display = 'none' })
  const urlIn = $('#url'); if (urlIn) {
    urlIn.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); send() } }
    urlIn.oninput = () => { const t = activeTab(); const v = urlIn.value; t.url = v; updateUrlPreview(); markDirty(t); persist() }
  }
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send() }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); const t = activeTab(); if (t && t.bodyType === 'json') { try { t.body = JSON.stringify(JSON.parse(t.body), null, 2); renderReqEditor(); persist(); setStatus('JSON 已格式化', 'ok') } catch (e) { /* ignore */ } } }
  })
}

function renderAll() { renderTabs(); renderRequestBar(); renderReqEditor(); renderResponse(); renderSidebar(); renderEnv() }

function applyLayout() {
  const split = $('#split'); if (!split) return
  split.classList.toggle('h', ui.layout === 'h')
  const defH = _panelMode ? 180 : 220, defW = _panelMode ? 320 : 480
  split.style.setProperty('--reqH', (ui.reqH || defH) + 'px')
  split.style.setProperty('--reqW', (ui.reqW || defW) + 'px')
  const lb = $('#layoutBtn'); if (lb) lb.innerHTML = ui.layout === 'h' ? '⇅ 上下' : '⇄ 左右'
  const ls = $('#layoutStatus'); if (ls) ls.textContent = '布局: ' + (ui.layout === 'h' ? '左右' : '上下')
}

function applyProxyBtn() {
  const b = $('#proxyBtn'); if (!b) return
  b.innerHTML = ui.proxyOn ? '代理: 开' : '代理: 关'
  b.style.color = ui.proxyOn ? 'var(--brand)' : ''
  const ps = $('#proxyStatus'); if (ps) ps.textContent = '代理: ' + (ui.proxyOn ? '开' : '关')
}

export function getApiState() { return state }