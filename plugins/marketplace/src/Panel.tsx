import { useState, useEffect, useCallback } from 'react'

/**
 * Polaris 插件商城面板
 *
 * 功能：
 *   - 拉取 index.json 渲染插件列表
 *   - 按关键字 / 分类过滤
 *   - 一键安装：调用 Tauri plugin_install_remote 命令
 *   - 查看插件详情（权限 / readme / 下载地址）
 *
 * 运行环境：宿主 webview，React 由 pluginModuleLoader shim 注入（不需打包进 bundle）。
 * Tauri invoke 通过 window.__TAURI_INTERNALS__.invoke 调用（零外部依赖）。
 */

interface MarketPlugin {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  category?: string
  tags?: string[]
  icon?: string
  homepage?: string
  repository?: string
  manifestUrl?: string
  downloadUrl?: string
  updateUrl?: string
  sha256?: string
  permissions?: Record<string, boolean>
  readme?: string
  screenshots?: string[]
}

interface IndexData {
  marketplace?: { name?: string; homepage?: string; description?: string }
  plugins: MarketPlugin[]
}

const DEFAULT_INDEX = 'https://raw.githubusercontent.com/misxzaiz/Polaris-plugin/main/index.json'

/** 调用 Tauri 命令（插件上下文零依赖） */
async function tauriInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (c: string, a?: Record<string, unknown>) => Promise<T> } }).__TAURI_INTERNALS__
  if (!internals?.invoke) {
    throw new Error('Tauri invoke 不可用（非 Tauri 环境或未授权）')
  }
  return internals.invoke(cmd, args)
}

interface InstallResult { success: boolean; message?: string; error?: string }

async function installPlugin(plugin: MarketPlugin, scope: 'user' | 'project'): Promise<InstallResult> {
  if (!plugin.downloadUrl) return { success: false, error: '该插件未提供 downloadUrl' }
  try {
    return await tauriInvoke<InstallResult>('plugin_install_remote', {
      sourceUrl: plugin.downloadUrl,
      scope,
    })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  utility: '#3B82F6',
  mcp: '#8B5CF6',
  panel: '#10B981',
  media: '#EC4899',
  dev: '#F59E0B',
  productivity: '#06B6D4',
  integration: '#6366F1',
}

export default function MarketplacePanel({ pluginId }: { pluginId: string }) {
  const [index, setIndex] = useState<IndexData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('')
  const [selected, setSelected] = useState<MarketPlugin | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [installMsg, setInstallMsg] = useState<string | null>(null)

  const loadIndex = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(DEFAULT_INDEX, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as IndexData
      setIndex(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadIndex() }, [loadIndex])

  const plugins = index?.plugins ?? []
  const categories = Array.from(new Set(plugins.map(p => p.category).filter(Boolean) as string[]))

  const filtered = plugins.filter(p => {
    if (category && p.category !== category) return false
    if (query.trim()) {
      const q = query.toLowerCase()
      const hay = [p.id, p.name, p.description, (p.tags || []).join(' ')].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const handleInstall = async (p: MarketPlugin, scope: 'user' | 'project') => {
    setInstalling(p.id)
    setInstallMsg(null)
    const result = await installPlugin(p, scope)
    setInstallMsg(result.success
      ? `✓ ${p.name} 安装成功${result.message ? '：' + result.message : ''}`
      : `✗ 安装失败：${result.error ?? '未知错误'}`)
    setInstalling(null)
  }

  if (loading) {
    return <div style={{ padding: 24, color: '#8E8E93', fontSize: 13 }}>加载商城索引中…</div>
  }

  if (error) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: '#EF4444', fontSize: 13 }}>加载失败：{error}</div>
        <button onClick={loadIndex} style={btnStyle}>重试</button>
      </div>
    )
  }

  const sidebarStyle: React.CSSProperties = {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: '#1A1A1F', color: '#F8F8F8', fontSize: 13,
  }

  return (
    <div style={sidebarStyle}>
      {/* 顶栏：搜索 + 刷新 */}
      <div style={{ padding: '12px 12px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索插件…"
          style={{ flex: 1, padding: '6px 10px', background: '#25252B', border: '1px solid #3F3F46', borderRadius: 6, color: '#F8F8F8', fontSize: 12, outline: 'none' }}
        />
        <button onClick={loadIndex} title="刷新索引" style={{ ...btnStyle, padding: '6px 10px' }}>↻</button>
      </div>

      {/* 分类过滤 */}
      {categories.length > 0 && (
        <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <CategoryChip active={!category} onClick={() => setCategory('')} label="全部" />
          {categories.map(c => (
            <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)} label={c} color={CATEGORY_COLORS[c]} />
          ))}
        </div>
      )}

      {/* 列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, color: '#8E8E93', textAlign: 'center' }}>未找到匹配插件</div>
        ) : filtered.map(p => (
          <div
            key={p.id}
            onClick={() => { setSelected(p); setInstallMsg(null) }}
            style={{
              padding: 10, marginBottom: 8, borderRadius: 8, cursor: 'pointer',
              background: selected?.id === p.id ? '#2D2D33' : '#25252B',
              border: `1px solid ${selected?.id === p.id ? '#3B82F6' : '#3F3F46'}`,
              transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 10, color: '#8E8E93' }}>v{p.version}</div>
            </div>
            <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 4, lineHeight: 1.4 }}>
              {p.description || '—'}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {p.category && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: (CATEGORY_COLORS[p.category] || '#6B7280') + '33', color: CATEGORY_COLORS[p.category] || '#6B7280' }}>
                  {p.category}
                </span>
              )}
              {(p.tags || []).slice(0, 3).map(t => (
                <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#3F3F46', color: '#B4B4B8' }}>{t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 底部：详情 + 安装 */}
      {selected && (
        <div style={{
          borderTop: '1px solid #3F3F46', padding: 12, background: '#1F1F24',
          maxHeight: '45%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{selected.name}</div>
              <div style={{ fontSize: 10, color: '#8E8E93' }}>{selected.id} · v{selected.version}</div>
            </div>
            <button onClick={() => setSelected(null)} style={{ ...btnStyle, padding: '2px 8px' }}>✕</button>
          </div>

          {selected.description && <div style={{ fontSize: 12, color: '#B4B4B8', lineHeight: 1.5 }}>{selected.description}</div>}

          {selected.permissions && Object.keys(selected.permissions).length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: '#8E8E93', marginBottom: 2 }}>权限</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {Object.entries(selected.permissions).filter(([, v]) => v).map(([k]) => (
                  <span key={k} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#3F3F46', color: '#F8B4B8' }}>{k}</span>
                ))}
              </div>
            </div>
          )}

          {selected.readme && (
            <pre style={{ fontSize: 11, color: '#B4B4B8', background: '#25252B', padding: 8, borderRadius: 6, margin: 0, maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {selected.readme}
            </pre>
          )}

          {installMsg && (
            <div style={{ fontSize: 11, color: installMsg.startsWith('✓') ? '#10B981' : '#EF4444' }}>{installMsg}</div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={() => handleInstall(selected, 'user')}
              disabled={installing === selected.id}
              style={{ ...btnStyle, flex: 1, opacity: installing === selected.id ? 0.6 : 1 }}
            >
              {installing === selected.id ? '安装中…' : '安装到 User'}
            </button>
            <button
              onClick={() => handleInstall(selected, 'project')}
              disabled={installing === selected.id}
              style={{ ...btnStyle, opacity: installing === selected.id ? 0.6 : 1 }}
            >
              安装到 Project
            </button>
          </div>
          <div style={{ fontSize: 9, color: '#6B7280', wordBreak: 'break-all' }}>
            {selected.downloadUrl}
          </div>
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, border: '1px solid #3F3F46',
  background: '#2D2D33', color: '#F8F8F8', fontSize: 12, cursor: 'pointer',
}

function CategoryChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 10, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
        border: `1px solid ${active ? (color || '#3B82F6') : '#3F3F46'}`,
        background: active ? (color || '#3B82F6') + '22' : 'transparent',
        color: active ? (color || '#3B82F6') : '#8E8E93',
      }}
    >
      {label}
    </button>
  )
}
