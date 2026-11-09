/**
 * Personal Hub 面板 — 登录 / 链接收藏管理 / 配置
 *
 * 外部插件模式（对齐 agnes 面板范式）：
 * - 配置持久化：hostInvoke('plugin_get_config' / 'plugin_set_config') →
 *   config.json 的 plugins["personal-hub"]（与 MCP server 共用同一份）
 * - 数据面：Supabase REST 经宿主 cap.http 转发（无 CORS；与 MCP server 同一后端）
 * - 字段级加密：description 用 crypto-js 口令模式（AES-128-CBC + Salted__ +
 *   EVP_BytesToKey），与 MCP server / 主仓金标 personal_hub_crypto.rs 完全兼容
 *
 * 运行环境：宿主 webview，React 由 pluginModuleLoader shim 注入（--external:react）。
 */

import { useEffect, useState, useCallback } from 'react'
import CryptoJS from 'crypto-js'

const PLUGIN_ID = 'personal-hub'

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface PhConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  sessionToken: string
  encryptionKey: string
}

interface LinkItem {
  id: string
  title: string
  type: 'navigation' | 'bookmark' | 'todo' | 'note'
  url?: string | null
  description?: string | null
  is_encrypted?: boolean
  tags?: string[] | null
  priority?: string | null
  due_date?: string | null
  completed?: boolean
  created_at?: string
}

const TYPE_LABELS: Record<string, string> = {
  navigation: '导航',
  bookmark: '收藏',
  todo: '待办',
  note: '笔记',
}

// ── 通信层（与 agnes 面板同一范式） ───────────────────────────────────────────

async function hostInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const invoker = (window as unknown as {
    __POLARIS_HOST_INVOKE__?: (c: string, a?: Record<string, unknown>) => Promise<T>
  }).__POLARIS_HOST_INVOKE__
  if (invoker) return invoker(cmd, args)
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: (c: string, a?: Record<string, unknown>) => Promise<T> }
  }).__TAURI_INTERNALS__
  if (internals?.invoke) return internals.invoke(cmd, args)
  throw new Error('宿主 invoke 不可用（需在 Polaris 内运行）')
}

async function loadConfig(): Promise<PhConfig> {
  const cfg = await hostInvoke<Record<string, unknown>>('plugin_get_config', { pluginId: PLUGIN_ID })
  return {
    supabaseUrl: (cfg.supabaseUrl as string) || 'https://nynpqrwsautudqblxoir.supabase.co',
    supabaseAnonKey:
      (cfg.supabaseAnonKey as string) ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55bnBxcndzYXV0dWRxYmx4b2lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3MDkzMDksImV4cCI6MjA3ODI4NTMwOX0.rz79QkbbSEQPsrSdbYYFL-nuV_MwdAWhf4-gQ0j_fz4',
    sessionToken: (cfg.sessionToken as string) || '',
    encryptionKey: (cfg.encryptionKey as string) || '',
  }
}

async function saveConfig(patch: Partial<PhConfig>): Promise<void> {
  await hostInvoke('plugin_set_config', { pluginId: PLUGIN_ID, patch })
}

async function capHttpRequest(opts: {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}): Promise<{ status: number; ok: boolean; body: string }> {
  const res = await hostInvoke<{ ok: boolean; result?: Record<string, unknown>; error?: string | null }>(
    'router_dispatch',
    {
      req: {
        target: 'cap.http',
        payload: {
          action: 'request',
          method: opts.method,
          url: opts.url,
          headers: opts.headers || {},
          body: opts.body || '',
          bodyType: opts.bodyType || 'text',
          timeoutMs: 20000,
        },
      },
    },
  )
  if (!res || !res.ok) throw new Error((res && res.error) || 'cap.http 转发失败')
  const result = (res.result || {}) as Record<string, unknown>
  return {
    status: Number(result.status) || 0,
    ok: !!result.ok,
    body: String(result.body ?? ''),
  }
}

async function supabaseFetch<T>(
  cfg: PhConfig,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const url = `${cfg.supabaseUrl.replace(/\/+$/, '')}${path}`
  const headers: Record<string, string> = {
    apikey: cfg.supabaseAnonKey,
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.sessionToken}`,
  }
  if (method === 'PATCH' || method === 'POST') headers.Prefer = 'return=representation'
  const r = await capHttpRequest({
    method,
    url,
    headers,
    body: body === undefined ? '' : JSON.stringify(body),
  })
  if (!r.ok) {
    throw new Error(`Supabase 返回 ${r.status}: ${String(r.body || '').slice(0, 300)}`)
  }
  return (r.body ? JSON.parse(r.body) : null) as T
}

// ── 字段加密（crypto-js 口令模式 = Salted__ + EVP_BytesToKey(MD5)，服务端可解） ──

function encryptDescription(text: string, key: string): string {
  return CryptoJS.AES.encrypt(text, key).toString()
}

function decryptDescription(text: string | null | undefined, isEncrypted: boolean, key: string): string {
  if (!text) return ''
  if (!isEncrypted) return text
  if (!key) return '[已加密 — 需配置密钥]'
  try {
    const s = CryptoJS.AES.decrypt(text, key).toString(CryptoJS.enc.Utf8)
    return s || '[解密失败]'
  } catch {
    return '[解密失败]'
  }
}

// ── 组件 ──────────────────────────────────────────────────────────────────────

export default function PersonalHubPanel() {
  const [cfg, setCfg] = useState<PhConfig | null>(null)
  const [items, setItems] = useState<LinkItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<'links' | 'config'>('links')
  const [editing, setEditing] = useState<Partial<LinkItem> | null>(null)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [configForm, setConfigForm] = useState({ supabaseUrl: '', supabaseAnonKey: '', encryptionKey: '' })

  const refresh = useCallback(async (c: PhConfig) => {
    if (!c.sessionToken) {
      setItems([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const list = await supabaseFetch<LinkItem[]>(
        c,
        '/rest/v1/links?select=*&order=created_at.desc&limit=200',
      )
      setItems(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig().then((c) => {
      setCfg(c)
      setConfigForm({
        supabaseUrl: c.supabaseUrl,
        supabaseAnonKey: c.supabaseAnonKey,
        encryptionKey: c.encryptionKey,
      })
      void refresh(c)
    })
  }, [refresh])

  const authed = !!(cfg && cfg.sessionToken)

  async function handleLogin() {
    if (!cfg) return
    setError('')
    setNotice('')
    setLoading(true)
    try {
      const r = await capHttpRequest({
        method: 'POST',
        url: `${cfg.supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`,
        headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginForm.email, password: loginForm.password }),
      })
      const data = JSON.parse(r.body || '{}')
      const token = data?.access_token
      if (!r.ok || !token) {
        throw new Error(data?.error_description || data?.msg || `登录失败（${r.status}）`)
      }
      const next = { ...cfg, sessionToken: token }
      await saveConfig({ sessionToken: token })
      setCfg(next)
      setNotice('登录成功')
      setLoginForm({ email: '', password: '' })
      void refresh(next)
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    if (!cfg) return
    const next = { ...cfg, sessionToken: '' }
    await saveConfig({ sessionToken: '' })
    setCfg(next)
    setItems([])
    setNotice('已退出登录（本地会话令牌已清除）')
  }

  async function handleSaveConfig() {
    if (!cfg) return
    setError('')
    try {
      const next = { ...cfg, ...configForm, sessionToken: '' }
      await saveConfig({
        supabaseUrl: configForm.supabaseUrl,
        supabaseAnonKey: configForm.supabaseAnonKey,
        encryptionKey: configForm.encryptionKey,
        sessionToken: '',
      })
      setCfg(next)
      setNotice('配置已保存；Supabase 端点/密钥变更后需重新登录')
      setItems([])
    } catch (e) {
      setError(String((e as Error).message || e))
    }
  }

  async function handleSaveItem() {
    if (!cfg || !editing) return
    setError('')
    setLoading(true)
    try {
      const desc = (editing.description || '').trim()
      const encrypt = !!cfg.encryptionKey && desc.length > 0
      const body: Record<string, unknown> = {
        title: (editing.title || '').trim() || '无标题',
        type: editing.type || 'bookmark',
        url: editing.url || null,
        description: encrypt ? encryptDescription(desc, cfg.encryptionKey) : desc,
        is_encrypted: encrypt,
        tags: editing.tags && editing.tags.length ? editing.tags : null,
        priority: editing.priority || null,
        due_date: editing.due_date || null,
        completed: !!editing.completed,
      }
      if (editing.id) {
        body.updated_at = 'now()'
        await supabaseFetch(cfg, `/rest/v1/links?id=eq.${encodeURIComponent(editing.id)}`, 'PATCH', body)
      } else {
        await supabaseFetch(cfg, '/rest/v1/links', 'POST', body)
      }
      setEditing(null)
      setNotice(editing.id ? '已更新' : '已创建')
      void refresh(cfg)
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!cfg) return
    setError('')
    try {
      await supabaseFetch(cfg, `/rest/v1/links?id=eq.${encodeURIComponent(id)}`, 'DELETE')
      setItems((prev) => prev.filter((it) => it.id !== id))
      setNotice('已删除')
    } catch (e) {
      setError(String((e as Error).message || e))
    }
  }

  async function toggleCompleted(item: LinkItem) {
    if (!cfg) return
    try {
      await supabaseFetch(cfg, `/rest/v1/links?id=eq.${encodeURIComponent(item.id)}`, 'PATCH', {
        completed: !item.completed,
        updated_at: 'now()',
      })
      void refresh(cfg)
    } catch (e) {
      setError(String((e as Error).message || e))
    }
  }

  if (!cfg) {
    return <div style={{ padding: 16, color: 'var(--pv-text-muted, #888)' }}>加载配置中…</div>
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid var(--pv-border, #33354a)',
    background: 'var(--pv-bg-input, transparent)',
    color: 'inherit',
    fontSize: 12,
  }
  const btnStyle: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid var(--pv-border, #33354a)',
    background: 'var(--pv-bg-interactive, #2b2d42)',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 12,
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong style={{ fontSize: 14 }}>个人空间</strong>
        <button
          role="tab"
          onClick={() => setTab('links')}
          style={{ ...btnStyle, opacity: tab === 'links' ? 1 : 0.55 }}
        >
          链接
        </button>
        <button
          role="tab"
          onClick={() => setTab('config')}
          style={{ ...btnStyle, opacity: tab === 'config' ? 1 : 0.55 }}
        >
          设置
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.6 }}>
          {authed ? '已登录' : '未登录'}
        </span>
      </div>

      {error && <div style={{ color: '#e5646c', fontSize: 12, whiteSpace: 'pre-wrap' }}>{error}</div>}
      {notice && <div style={{ color: '#3fb27f', fontSize: 12 }}>{notice}</div>}

      {tab === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12 }}>
            Supabase URL
            <input
              style={inputStyle}
              value={configForm.supabaseUrl}
              onChange={(e) => setConfigForm({ ...configForm, supabaseUrl: e.target.value })}
              placeholder="https://xxx.supabase.co"
            />
          </label>
          <label style={{ fontSize: 12 }}>
            Supabase Anon Key
            <textarea
              style={{ ...inputStyle, minHeight: 56, fontFamily: 'monospace' }}
              value={configForm.supabaseAnonKey}
              onChange={(e) => setConfigForm({ ...configForm, supabaseAnonKey: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            字段加密密钥（description；留空 = 不加密）
            <input
              style={inputStyle}
              type="password"
              value={configForm.encryptionKey}
              onChange={(e) => setConfigForm({ ...configForm, encryptionKey: e.target.value })}
            />
          </label>
          <button style={btnStyle} onClick={handleSaveConfig}>
            保存配置（会清除本地会话，需重新登录）
          </button>
          <p style={{ fontSize: 11, opacity: 0.6, margin: 0 }}>
            数据存储在 Supabase（远端）；加密密钥仅保存在本机配置，用于 description 字段的字段级加密。
          </p>
        </div>
      )}

      {tab === 'links' && !authed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
          <p style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>
            使用 Supabase 账号邮箱登录后即可同步个人链接/待办/笔记。
          </p>
          <input
            style={inputStyle}
            placeholder="邮箱"
            value={loginForm.email}
            onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
          />
          <input
            style={inputStyle}
            type="password"
            placeholder="密码"
            value={loginForm.password}
            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleLogin()
            }}
          />
          <button style={btnStyle} onClick={handleLogin} disabled={loading}>
            登录
          </button>
        </div>
      )}

      {tab === 'links' && authed && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={btnStyle} onClick={() => setEditing({ type: 'bookmark' })}>
              + 新建
            </button>
            <button style={btnStyle} onClick={() => void refresh(cfg)}>
              刷新
            </button>
            <button style={{ ...btnStyle, marginLeft: 'auto' }} onClick={handleLogout}>
              退出登录
            </button>
          </div>

          {loading && <div style={{ fontSize: 12, opacity: 0.6 }}>加载中…</div>}
          {!loading && !items.length && (
            <div style={{ fontSize: 12, opacity: 0.6 }}>暂无条目——点击「+ 新建」添加第一条。</div>
          )}

          {items.map((it) => (
            <div
              key={it.id}
              style={{
                border: '1px solid var(--pv-border, #33354a)',
                borderRadius: 8,
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {it.type === 'todo' && (
                  <input
                    type="checkbox"
                    checked={!!it.completed}
                    onChange={() => void toggleCompleted(it)}
                  />
                )}
                <strong style={{ fontSize: 13 }}>{it.title}</strong>
                <span style={{ fontSize: 10, opacity: 0.6, border: '1px solid currentColor', borderRadius: 4, padding: '0 4px' }}>
                  {TYPE_LABELS[it.type] || it.type}
                </span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button
                    style={{ ...btnStyle, padding: '2px 8px' }}
                    onClick={() =>
                      setEditing({
                        ...it,
                        description: decryptDescription(it.description, it.is_encrypted, cfg.encryptionKey),
                      })
                    }
                  >
                    编辑
                  </button>
                  <button
                    style={{ ...btnStyle, padding: '2px 8px', color: '#e5646c' }}
                    onClick={() => void handleDelete(it.id)}
                  >
                    删除
                  </button>
                </span>
              </div>
              {it.url && (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: '#6aa1ff', wordBreak: 'break-all' }}
                >
                  {it.url}
                </a>
              )}
              {it.description && (
                <div style={{ fontSize: 12, opacity: 0.8, whiteSpace: 'pre-wrap' }}>
                  {decryptDescription(it.description, it.is_encrypted, cfg.encryptionKey)}
                </div>
              )}
              {!!it.tags?.length && (
                <div style={{ fontSize: 10, opacity: 0.6 }}>
                  {it.tags.map((t) => `#${t}`).join(' ')}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {editing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--pv-bg-elevated, #1b1d2e)',
              border: '1px solid var(--pv-border, #33354a)',
              borderRadius: 10,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              width: 'min(420px, 92vw)',
              maxHeight: '86vh',
              overflow: 'auto',
              color: 'inherit',
            }}
          >
            <strong>{editing.id ? '编辑条目' : '新建条目'}</strong>
            <input
              style={inputStyle}
              placeholder="标题"
              value={editing.title || ''}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
            <select
              style={inputStyle}
              value={editing.type || 'bookmark'}
              onChange={(e) => setEditing({ ...editing, type: e.target.value as LinkItem['type'] })}
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              style={inputStyle}
              placeholder="URL（导航/收藏类）"
              value={editing.url || ''}
              onChange={(e) => setEditing({ ...editing, url: e.target.value })}
            />
            <textarea
              style={{ ...inputStyle, minHeight: 64 }}
              placeholder={
                cfg.encryptionKey
                  ? '描述（保存时将以字段加密密钥加密）'
                  : '描述（未配置加密密钥，明文存储）'
              }
              value={editing.description || ''}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />
            <input
              style={inputStyle}
              placeholder="标签（逗号分隔）"
              value={(editing.tags || []).join(',')}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btnStyle} onClick={() => setEditing(null)}>
                取消
              </button>
              <button style={btnStyle} onClick={() => void handleSaveItem()} disabled={loading}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
