/**
 * RoutesTab —— 路由表 + 编辑器 + 模板速查
 * CRUD 全走 model.saveRoute/deleteRoute（cap.kv 控制面）；「试一发」走 cmd 信箱。
 */
import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { PanelData, Toast } from '../Panel'
import { baseUrl, core, deleteRoute, saveRoute, sendCommand, type MockRoute } from '../model'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ANY']

const METHOD_COLOR: Record<string, string> = {
  GET: '#3fb950', POST: '#d29922', PUT: '#58a6ff', PATCH: '#bc8cff',
  DELETE: '#f85149', HEAD: '#8b949e', OPTIONS: '#8b949e', ANY: '#39c5cf',
}

interface EditorState {
  id: string
  name: string
  method: string
  path: string
  status: string
  bodyType: 'json' | 'text' | 'empty'
  body: string
  headersText: string
  delayMs: string
  errorRate: string
  errorStatus: string
  enabled: boolean
}

function emptyEditor(): EditorState {
  return { id: '', name: '', method: 'GET', path: '/api/', status: '200', bodyType: 'json', body: '{"ok":true,"data":{}}', headersText: '', delayMs: '0', errorRate: '0', errorStatus: '500', enabled: true }
}
function toEditor(r: MockRoute): EditorState {
  return {
    id: r.id, name: r.name, method: r.method, path: r.path, status: String(r.status),
    bodyType: r.bodyType, body: r.body,
    headersText: Object.entries(r.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n'),
    delayMs: String(r.delayMs), errorRate: String(r.errorRate), errorStatus: String(r.errorStatus), enabled: r.enabled,
  }
}
function parseHeadersText(text: string): { headers: Record<string, string>; error: string } {
  const headers: Record<string, string> = {}
  for (const line of String(text || '').split('\n')) {
    const t = line.trim()
    if (!t) continue
    const i = t.indexOf(':')
    if (i <= 0) return { headers: {}, error: `响应头格式不对（应为 Key: Value）：${t.slice(0, 40)}` }
    headers[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return { headers, error: '' }
}

export default function RoutesTab({ data, running, reload, showToast }: { data: PanelData; running: boolean; reload: () => Promise<PanelData>; showToast: Toast }) {
  const [editing, setEditing] = useState<EditorState | null>(null)
  const [busy, setBusy] = useState(false)
  const [cheatOpen, setCheatOpen] = useState(false)
  const routes = data.settings?.routes || []

  const save = async () => {
    if (!editing) return
    if (!editing.path.trim()) { showToast('路径不能为空', 'bad'); return }
    const hs = parseHeadersText(editing.headersText)
    if (hs.error) { showToast(hs.error, 'bad'); return }
    setBusy(true)
    const r = await saveRoute({
      id: editing.id || undefined,
      name: editing.name || undefined,
      method: editing.method,
      path: editing.path.trim(),
      status: parseInt(editing.status, 10) || 200,
      bodyType: editing.bodyType,
      body: editing.body,
      headers: hs.headers,
      delayMs: parseInt(editing.delayMs, 10) || 0,
      errorRate: parseInt(editing.errorRate, 10) || 0,
      errorStatus: parseInt(editing.errorStatus, 10) || 500,
      enabled: editing.enabled,
    })
    setBusy(false)
    if (!r.ok) { showToast(r.error || '保存失败', 'bad'); return }
    showToast(`已保存（服务 3s 内生效）${r.warnings && r.warnings.length ? `：${r.warnings[0]}` : ''}`, 'good')
    setEditing(null)
    await reload()
  }

  const remove = async (r: MockRoute) => {
    const res = await deleteRoute(r.id)
    if (!res.ok) { showToast(res.error || '删除失败', 'bad'); return }
    showToast('已删除（3s 内生效）', 'good')
    await reload()
  }

  const toggle = async (r: MockRoute) => {
    const res = await saveRoute({ ...r, enabled: !r.enabled, id: r.id })
    if (!res.ok) { showToast(res.error || '操作失败', 'bad'); return }
    await reload()
  }

  const tryIt = async (r: MockRoute) => {
    if (!running) { showToast('服务未运行，无法试发', 'bad'); return }
    setBusy(true)
    showToast('试发中…', 'info')
    const res = await sendCommand('test_route', { routeId: r.id }, 25000)
    setBusy(false)
    if (!res.ok) { showToast(res.error || '试发失败', 'bad'); return }
    const tr = res as unknown as { status: number; request: string; bodyPreview: string; error?: string }
    showToast(`${tr.request} → ${tr.status} ${String(tr.bodyPreview || '').slice(0, 80)}`, tr.status < 400 ? 'good' : 'bad')
  }

  const dup = (r: MockRoute) => {
    setEditing(toEditor({ ...r, id: '', name: `${r.name} 副本`, builtin: false }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setEditing(emptyEditor())} style={btnPrimary()}>＋ 新建路由</button>
        <button onClick={() => setCheatOpen(!cheatOpen)} style={btnGhost()}>{cheatOpen ? '收起模板速查' : '📖 模板速查'}</button>
        <span style={{ fontSize: 11, color: '#71717a' }}>共 {routes.length} 条（上限 {core.MAX_ROUTES}）</span>
      </div>

      {cheatOpen && (
        <div style={card('rgba(59,130,246,.06)', 'rgba(59,130,246,.25)')}>
          <div style={{ fontSize: 11, color: '#93c5fd', lineHeight: 1.9 }}>
            响应体里可插 <code>{'{{...}}'}</code> 模板（改完 3s 生效；未识别的表达式按字面返回方便发现拼写错误）：
            <br />· 数据：<code>{'{{int 1,99}}'}</code> <code>{'{{float 0,1,2}}'}</code> <code>{'{{bool}}'}</code> <code>{'{{uuid}}'}</code> <code>{'{{counter}}'}</code> <code>{'{{pick a|b|c}}'}</code>
            <br />· 中文真实感：<code>{'{{cname}}'}</code> 姓名 <code>{'{{city}}'}</code> 城市 <code>{'{{phone}}'}</code> 手机号 <code>{'{{ctitle 12}}'}</code> 标题 <code>{'{{csentence 10,20}}'}</code> 句子 <code>{'{{cparagraph 3}}'}</code> 段落
            <br />· 英文：<code>{'{{name}}'}</code> <code>{'{{email}}'}</code> <code>{'{{word}}'}</code> <code>{'{{sentence 6,14}}'}</code> <code>{'{{paragraph 3}}'}</code>
            <br />· 时间：<code>{'{{date}}'}</code> <code>{'{{datetime}}'}</code> <code>{'{{timestamp}}'}</code> <code>{'{{dateRange -30,0}}'}</code>
            <br />· 请求回显：<code>{'{{req.path.id}}'}</code> <code>{'{{req.query.tag}}'}</code> <code>{'{{req.header.X-Token}}'}</code> <code>{'{{req.body.a.b}}'}</code>
            <br />· 字面输出 <code>{'{{'}</code>：写 <code>{'\\{{'}</code>
          </div>
        </div>
      )}

      {editing && (
        <div style={card('rgba(63,185,80,.05)', 'rgba(63,185,80,.3)')}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f4f4f5', marginBottom: 8 }}>{editing.id ? `编辑路由 ${editing.id}` : '新建路由'}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <select value={editing.method} onChange={(e) => setEditing({ ...editing, method: e.target.value })} style={input(90)}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input value={editing.path} onChange={(e) => setEditing({ ...editing, path: e.target.value })} placeholder="/api/users/:id（:参数，* 结尾通配）" style={input(260, 'monospace')} />
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="备注名（可选）" style={input(140)} />
            <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} style={input(80)}>
              {[200, 201, 204, 301, 302, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={editing.bodyType} onChange={(e) => setEditing({ ...editing, bodyType: e.target.value as EditorState['bodyType'] })} style={input(90)}>
              <option value="json">JSON</option>
              <option value="text">文本</option>
              <option value="empty">空体</option>
            </select>
            <label style={{ fontSize: 11, color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} />启用
            </label>
          </div>
          <textarea
            value={editing.body}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            placeholder={'响应体，支持 {{模板}}。例如：\n{"code":0,"data":[{"id":{{int 1,99}},"name":"{{cname}}"}]}'}
            rows={6}
            style={{ ...input(0, 'monospace'), width: '100%', resize: 'vertical', marginBottom: 6, display: editing.bodyType === 'empty' ? 'none' : undefined }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: 11, color: '#a1a1aa' }}>延迟 ms</label>
            <input value={editing.delayMs} onChange={(e) => setEditing({ ...editing, delayMs: e.target.value })} style={input(70)} />
            <label style={{ fontSize: 11, color: '#a1a1aa' }}>错误率 %</label>
            <input value={editing.errorRate} onChange={(e) => setEditing({ ...editing, errorRate: e.target.value })} style={input(60)} />
            <label style={{ fontSize: 11, color: '#a1a1aa' }}>错误状态</label>
            <input value={editing.errorStatus} onChange={(e) => setEditing({ ...editing, errorStatus: e.target.value })} style={input(70)} />
          </div>
          <input
            value={editing.headersText}
            onChange={(e) => setEditing({ ...editing, headersText: e.target.value })}
            placeholder="自定义响应头（每行一个 Key: Value，可选）"
            style={{ ...input(0, 'monospace'), width: '100%', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={busy} style={btnPrimary()}>{busy ? '保存中…' : '保存'}</button>
            <button onClick={() => setEditing(null)} style={btnGhost()}>取消</button>
          </div>
        </div>
      )}

      {!routes.length && (
        <div style={{ padding: 20, textAlign: 'center', color: '#71717a', fontSize: 12 }}>
          还没有路由。点「新建路由」造一个，或直接在对话里说「帮我造一个 GET /api/users 的 mock」。
        </div>
      )}

      {routes.map((r) => (
        <div key={r.id} style={card('rgba(39,39,42,.5)', '#3f3f46')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: `${METHOD_COLOR[r.method] || '#8b949e'}22`, color: METHOD_COLOR[r.method] || '#8b949e',
            }}>{r.method}</span>
            <code style={{ fontSize: 12, color: '#e4e4e7' }}>{r.path}</code>
            <span style={{ fontSize: 11, color: '#71717a' }}>→ {r.status}</span>
            {r.delayMs > 0 && <span style={badge('rgba(210,153,34,.15)', '#d29922')}>慢 {r.delayMs}ms</span>}
            {r.errorRate > 0 && <span style={badge('rgba(248,81,73,.15)', '#f85149')}>错 {r.errorRate}%</span>}
            {r.builtin && <span style={badge('rgba(59,130,246,.15)', '#93c5fd')}>示例</span>}
            <span style={{ flex: 1 }} />
            <button onClick={() => toggle(r)} style={{ ...btnGhost(), color: r.enabled ? '#3fb950' : '#71717a' }}>{r.enabled ? '✓ 启用中' : '已停用'}</button>
            <button onClick={() => tryIt(r)} style={btnGhost()}>试一发</button>
            <button onClick={() => setEditing(toEditor(r))} style={btnGhost()}>编辑</button>
            <button onClick={() => dup(r)} style={btnGhost()}>复制</button>
            <button onClick={() => remove(r)} style={{ ...btnGhost(), color: '#f85149' }}>删除</button>
          </div>
          <div style={{ fontSize: 11, color: '#71717a', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span>{r.name}</span>
            <span>{baseUrl(data.meta)}<b style={{ color: '#52525b' }}>{r.path}</b></span>
            <span>体 {r.body.length}B</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 样式 ───────────────────────────────────────────────────────────────────
function card(bg: string, border: string): CSSProperties {
  return { padding: 10, borderRadius: 8, background: bg, border: `1px solid ${border}` }
}
function input(w: number, fontFamily?: string): CSSProperties {
  return {
    width: w || undefined, padding: '6px 8px', fontSize: 12, borderRadius: 6,
    background: '#18181b', border: '1px solid #3f3f46', color: '#e4e4e7', outline: 'none',
    fontFamily: fontFamily || undefined,
  }
}
function btnPrimary(): CSSProperties {
  return {
    padding: '6px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
    background: 'rgba(59,130,246,.2)', border: '1px solid #3b82f6', color: '#93c5fd', minHeight: 30,
  }
}
function btnGhost(): CSSProperties {
  return {
    padding: '4px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
    background: 'transparent', border: '1px solid #3f3f46', color: '#a1a1aa', minHeight: 26,
  }
}
function badge(bg: string, color: string): CSSProperties {
  return { fontSize: 10, padding: '2px 6px', borderRadius: 4, background: bg, color }
}
