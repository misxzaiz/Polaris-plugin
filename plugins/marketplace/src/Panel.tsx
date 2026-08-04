import { useState, useEffect, useCallback } from 'react'

/**
 * Polaris 插件商城面板
 *
 * 两个标签：
 *   - 商城：拉取 index.json 浏览/搜索/一键安装
 *   - 已装：读取本地已装插件，支持卸载 / 检查更新 / 应用更新
 *
 * 运行环境：宿主 webview，React 由 pluginModuleLoader shim 注入。
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

/** 已装插件（Polaris manifest） */
interface InstalledPlugin {
  id: string
  name: string
  version: string
  description?: string
  builtin?: boolean
  enabledByDefault?: boolean
  installPath?: string
  source?: { kind?: string; workspacePath?: string }
  origin?: { repository?: string; updateUrl?: string; downloadUrl?: string }
}

interface UpdateCheck {
  pluginId: string
  currentVersion: string
  latestVersion?: string
  updateAvailable: boolean
  downloadUrl?: string
  error?: string
  checking?: boolean
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

interface OpResult { success: boolean; message?: string; error?: string }

async function installPlugin(plugin: MarketPlugin, scope: 'user' | 'project'): Promise<OpResult> {
  if (!plugin.downloadUrl) return { success: false, error: '该插件未提供 downloadUrl' }
  try {
    return await tauriInvoke<OpResult>('plugin_install_remote', { sourceUrl: plugin.downloadUrl, scope })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function discoverInstalled(): Promise<InstalledPlugin[]> {
  try {
    const res = await tauriInvoke<{ plugins: InstalledPlugin[]; errors: unknown[] }>('plugin_discover', {})
    return Array.isArray(res.plugins) ? res.plugins : []
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e))
  }
}

async function uninstallPlugin(installPath: string): Promise<OpResult> {
  try {
    return await tauriInvoke<OpResult>('plugin_uninstall_local', { installPath })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

interface UpdateResult { pluginId: string; currentVersion: string; latestVersion?: string; updateAvailable: boolean; downloadUrl?: string; error?: string }

async function checkUpdate(installPath: string): Promise<UpdateResult> {
  try {
    const r = await tauriInvoke<UpdateResult>('plugin_check_update', { installPath })
    return { ...r, pluginId: r.pluginId }
  } catch (e) {
    return { pluginId: '', currentVersion: '', updateAvailable: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function applyUpdate(installPath: string): Promise<OpResult> {
  try {
    return await tauriInvoke<OpResult>('plugin_apply_update', { installPath })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  utility: '#3B82F6', mcp: '#8B5CF6', panel: '#10B981', media: '#EC4899',
  dev: '#F59E0B', productivity: '#06B6D4', integration: '#6366F1',
}

export default function MarketplacePanel({ pluginId: _pluginId }: { pluginId: string }) {
  const [tab, setTab] = useState<'market' | 'installed'>('market')

  // 商城状态
  const [index, setIndex] = useState<IndexData | null>(null)
  const [mLoading, setMLoading] = useState(true)
  const [mError, setMError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('')
  const [selected, setSelected] = useState<MarketPlugin | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [installMsg, setInstallMsg] = useState<string | null>(null)

  // 已装状态
  const [installed, setInstalled] = useState<InstalledPlugin[]>([])
  const [iLoading, setILoading] = useState(false)
  const [iError, setIError] = useState<string | null>(null)
  const [updates, setUpdates] = useState<Record<string, UpdateResult>>({})
  const [opLoading, setOpLoading] = useState<string | null>(null)
  const [opMsg, setOpMsg] = useState<string | null>(null)

  const loadIndex = useCallback(async () => {
    setMLoading(true); setMError(null)
    try {
      const res = await fetch(DEFAULT_INDEX, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setIndex(await res.json())
    } catch (e) { setMError(e instanceof Error ? e.message : String(e)) }
    finally { setMLoading(false) }
  }, [])

  const loadInstalled = useCallback(async () => {
    setILoading(true); setIError(null)
    try { setInstalled(await discoverInstalled()) }
    catch (e) { setIError(e instanceof Error ? e.message : String(e)) }
    finally { setILoading(false) }
  }, [])

  useEffect(() => { loadIndex() }, [loadIndex])
  useEffect(() => { if (tab === 'installed') loadInstalled() }, [tab, loadInstalled])

  const refreshAfterOp = useCallback(async () => {
    await loadInstalled()
    setUpdates({})
  }, [loadInstalled])

  const handleInstall = async (p: MarketPlugin, scope: 'user' | 'project') => {
    setInstalling(p.id); setInstallMsg(null)
    const r = await installPlugin(p, scope)
    setInstallMsg(r.success ? `✓ ${p.name} 安装成功${r.message ? '：' + r.message : ''}` : `✗ 安装失败：${r.error ?? '未知错误'}`)
    setInstalling(null)
  }

  const handleUninstall = async (p: InstalledPlugin) => {
    if (!p.installPath) return
    if (!confirm(`确认卸载 ${p.name}（${p.id}）？`)) return
    setOpLoading(`uninstall-${p.id}`); setOpMsg(null)
    const r = await uninstallPlugin(p.installPath)
    setOpMsg(r.success ? `✓ ${p.name} 已卸载` : `✗ 卸载失败：${r.error ?? '未知错误'}`)
    setOpLoading(null)
    if (r.success) await refreshAfterOp()
  }

  const handleCheckUpdate = async (p: InstalledPlugin) => {
    if (!p.installPath) return
    setOpLoading(`check-${p.id}`); setOpMsg(null)
    const r = await checkUpdate(p.installPath)
    setUpdates(prev => ({ ...prev, [p.id]: r }))
    setOpLoading(null)
    if (r.error) setOpMsg(`✗ 检查 ${p.name} 更新失败：${r.error}`)
    else if (r.updateAvailable) setOpMsg(`✓ ${p.name} 有新版本：${r.currentVersion} → ${r.latestVersion}`)
    else setOpMsg(`✓ ${p.name} 已是最新（${r.currentVersion}）`)
  }

  const handleApplyUpdate = async (p: InstalledPlugin) => {
    if (!p.installPath) return
    setOpLoading(`apply-${p.id}`); setOpMsg(null)
    const r = await applyUpdate(p.installPath)
    setOpMsg(r.success ? `✓ ${p.name} 更新成功${r.message ? '：' + r.message : ''}` : `✗ 更新失败：${r.error ?? '未知错误'}`)
    setOpLoading(null)
    if (r.success) await refreshAfterOp()
  }

  const handleCheckAll = async () => {
    const list = installed.filter(p => p.installPath && !p.builtin)
    for (const p of list) {
      setUpdates(prev => ({ ...prev, [p.id]: { pluginId: p.id, currentVersion: p.version, updateAvailable: false, checking: true } }))
      const r = await checkUpdate(p.installPath!)
      setUpdates(prev => ({ ...prev, [p.id]: r }))
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13 }}>
      {/* Tab 切换 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #3F3F46' }}>
        <TabBtn active={tab === 'market'} onClick={() => setTab('market')} label="商城" />
        <TabBtn active={tab === 'installed'} onClick={() => setTab('installed')} label={`已装${installed.length ? ` (${installed.filter(p => !p.builtin).length})` : ''}`} />
      </div>

      {tab === 'market' ? (
        <MarketView
          index={index} loading={mLoading} error={mError} query={query} setQuery={setQuery}
          category={category} setCategory={setCategory} selected={selected} setSelected={(p) => { setSelected(p); setInstallMsg(null) }}
          installing={installing} installMsg={installMsg} onInstall={handleInstall} onReload={loadIndex}
        />
      ) : (
        <InstalledView
          installed={installed} loading={iLoading} error={iError} updates={updates}
          opLoading={opLoading} opMsg={opMsg} onReload={loadInstalled}
          onUninstall={handleUninstall} onCheckUpdate={handleCheckUpdate}
          onApplyUpdate={handleApplyUpdate} onCheckAll={handleCheckAll}
        />
      )}
    </div>
  )
}

/* ---------------- 商城视图 ---------------- */

interface MarketViewProps {
  index: IndexData | null
  loading: boolean
  error: string | null
  query: string
  setQuery: (s: string) => void
  category: string
  setCategory: (s: string) => void
  selected: MarketPlugin | null
  setSelected: (p: MarketPlugin | null) => void
  installing: string | null
  installMsg: string | null
  onInstall: (p: MarketPlugin, scope: 'user' | 'project') => void
  onReload: () => void
}

function MarketView(props: MarketViewProps) {
  const { index, loading, error, query, setQuery, category, setCategory, selected, setSelected,
    installing, installMsg, onInstall, onReload } = props

  if (loading) return <div style={{ padding: 24, color: '#8E8E93' }}>加载商城索引中…</div>
  if (error) return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#EF4444' }}>加载失败：{error}</div>
      <button onClick={onReload} style={btnStyle}>重试</button>
    </div>
  )

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

  return (
    <>
      <div style={{ padding: '12px 12px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索插件…"
          style={{ flex: 1, padding: '6px 10px', background: '#25252B', border: '1px solid #3F3F46', borderRadius: 6, color: '#F8F8F8', fontSize: 12, outline: 'none' }} />
        <button onClick={onReload} title="刷新索引" style={{ ...btnStyle, padding: '6px 10px' }}>↻</button>
      </div>
      {categories.length > 0 && (
        <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <CategoryChip active={!category} onClick={() => setCategory('')} label="全部" />
          {categories.map(c => <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)} label={c} color={CATEGORY_COLORS[c]} />)}
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, color: '#8E8E93', textAlign: 'center' }}>未找到匹配插件</div>
        ) : filtered.map(p => (
          <div key={p.id} onClick={() => setSelected(p)}
            style={{ padding: 10, marginBottom: 8, borderRadius: 8, cursor: 'pointer',
              background: selected?.id === p.id ? '#2D2D33' : '#25252B',
              border: `1px solid ${selected?.id === p.id ? '#3B82F6' : '#3F3F46'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 10, color: '#8E8E93' }}>v{p.version}</div>
            </div>
            <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 4, lineHeight: 1.4 }}>{p.description || '—'}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {p.category && <span style={tagStyle(CATEGORY_COLORS[p.category] || '#6B7280')}>{p.category}</span>}
              {(p.tags || []).slice(0, 3).map(t => <span key={t} style={tagStyle('#6B7280')}>{t}</span>)}
            </div>
          </div>
        ))}
      </div>
      {selected && (
        <div style={{ borderTop: '1px solid #3F3F46', padding: 12, background: '#1F1F24', maxHeight: '45%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          {selected.readme && <pre style={preStyle}>{selected.readme}</pre>}
          {installMsg && <div style={{ fontSize: 11, color: installMsg.startsWith('✓') ? '#10B981' : '#EF4444' }}>{installMsg}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={() => onInstall(selected, 'user')} disabled={installing === selected.id}
              style={{ ...btnStyle, flex: 1, opacity: installing === selected.id ? 0.6 : 1 }}>
              {installing === selected.id ? '安装中…' : '安装到 User'}
            </button>
            <button onClick={() => onInstall(selected, 'project')} disabled={installing === selected.id}
              style={{ ...btnStyle, opacity: installing === selected.id ? 0.6 : 1 }}>安装到 Project</button>
          </div>
          <div style={{ fontSize: 9, color: '#6B7280', wordBreak: 'break-all' }}>{selected.downloadUrl}</div>
        </div>
      )}
    </>
  )
}

/* ---------------- 已装视图 ---------------- */

interface InstalledViewProps {
  installed: InstalledPlugin[]
  loading: boolean
  error: string | null
  updates: Record<string, UpdateResult>
  opLoading: string | null
  opMsg: string | null
  onReload: () => void
  onUninstall: (p: InstalledPlugin) => void
  onCheckUpdate: (p: InstalledPlugin) => void
  onApplyUpdate: (p: InstalledPlugin) => void
  onCheckAll: () => void
}

function InstalledView(props: InstalledViewProps) {
  const { installed, loading, error, updates, opLoading, opMsg, onReload, onUninstall, onCheckUpdate, onApplyUpdate, onCheckAll } = props

  if (loading) return <div style={{ padding: 24, color: '#8E8E93' }}>读取已装插件中…</div>
  if (error) return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#EF4444' }}>读取失败：{error}</div>
      <button onClick={onReload} style={btnStyle}>重试</button>
    </div>
  )

  const external = installed.filter(p => !p.builtin)
  const builtin = installed.filter(p => p.builtin)

  return (
    <>
      <div style={{ padding: '10px 12px', display: 'flex', gap: 8, borderBottom: '1px solid #3F3F46' }}>
        <button onClick={onReload} style={{ ...btnStyle, flex: 1 }}>↻ 刷新</button>
        <button onClick={onCheckAll} disabled={external.length === 0}
          style={{ ...btnStyle, flex: 1, opacity: external.length === 0 ? 0.5 : 1 }}>检查全部更新</button>
      </div>
      {opMsg && <div style={{ padding: '8px 12px', fontSize: 11, color: opMsg.startsWith('✓') ? '#10B981' : '#EF4444', borderBottom: '1px solid #3F3F46' }}>{opMsg}</div>}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {external.length === 0 && builtin.length === 0 ? (
          <div style={{ padding: 24, color: '#8E8E93', textAlign: 'center' }}>未发现已装插件</div>
        ) : (
          <>
            {external.length > 0 && <SectionLabel>外部安装（{external.length}）</SectionLabel>}
            {external.map(p => <InstalledCard key={p.id} p={p} updates={updates} opLoading={opLoading}
              onUninstall={onUninstall} onCheckUpdate={onCheckUpdate} onApplyUpdate={onApplyUpdate} />)}
            {builtin.length > 0 && <SectionLabel>内置（{builtin.length}）</SectionLabel>}
            {builtin.map(p => (
              <div key={p.id} style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: '#1F1F24', border: '1px solid #2A2A30' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: '#8E8E93' }}>v{p.version}</div>
                </div>
                <div style={{ fontSize: 10, color: '#6B7280', marginTop: 4 }}>{p.id} · 内置</div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  )
}

function InstalledCard({ p, updates, opLoading, onUninstall, onCheckUpdate, onApplyUpdate }: {
  p: InstalledPlugin
  updates: Record<string, UpdateResult>
  opLoading: string | null
  onUninstall: (p: InstalledPlugin) => void
  onCheckUpdate: (p: InstalledPlugin) => void
  onApplyUpdate: (p: InstalledPlugin) => void
}) {
  const u = updates[p.id]
  const checking = u?.checking || opLoading === `check-${p.id}`
  const applying = opLoading === `apply-${p.id}`
  const uninstalling = opLoading === `uninstall-${p.id}`

  return (
    <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: '#25252B', border: '1px solid #3F3F46' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
        <div style={{ fontSize: 10, color: '#8E8E93' }}>v{p.version}</div>
      </div>
      <div style={{ fontSize: 10, color: '#6B7280', marginTop: 4, wordBreak: 'break-all' }}>
        {p.id}{p.source?.kind ? ` · ${p.source.kind}` : ''}
      </div>
      {p.description && <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 4 }}>{p.description}</div>}

      {u && !u.checking && (
        <div style={{ marginTop: 6, fontSize: 11, padding: '4px 8px', borderRadius: 4,
          background: u.updateAvailable ? '#10B98122' : '#3F3F46',
          color: u.updateAvailable ? '#10B981' : '#8E8E93' }}>
          {u.error ? `检查失败：${u.error}`
            : u.updateAvailable ? `↑ 有更新：${u.currentVersion} → ${u.latestVersion}`
            : `✓ 已是最新（${u.currentVersion}）`}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onCheckUpdate(p)} disabled={checking || applying || uninstalling}
          style={{ ...miniBtn, opacity: checking ? 0.6 : 1 }}>
          {checking ? '检查中…' : '检查更新'}
        </button>
        <button onClick={() => onApplyUpdate(p)} disabled={!u?.updateAvailable || applying || uninstalling}
          style={{ ...miniBtn, background: applying ? '#3B82F644' : '#3B82F622', color: '#3B82F6', borderColor: '#3B82F6', opacity: (!u?.updateAvailable || applying) ? 0.5 : 1 }}>
          {applying ? '更新中…' : '应用更新'}
        </button>
        <button onClick={() => onUninstall(p)} disabled={checking || applying || uninstalling}
          style={{ ...miniBtn, color: '#EF4444', borderColor: '#7F1D1D', opacity: uninstalling ? 0.6 : 1 }}>
          {uninstalling ? '卸载中…' : '卸载'}
        </button>
      </div>
    </div>
  )
}

/* ---------------- 小组件 ---------------- */

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '10px 12px', fontSize: 12, cursor: 'pointer',
      border: 'none', borderBottom: active ? '2px solid #3B82F6' : '2px solid transparent',
      background: 'transparent', color: active ? '#F8F8F8' : '#8E8E93', fontWeight: active ? 600 : 400,
    }}>{label}</button>
  )
}

function CategoryChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
      border: `1px solid ${active ? (color || '#3B82F6') : '#3F3F46'}`,
      background: active ? (color || '#3B82F6') + '22' : 'transparent',
      color: active ? (color || '#3B82F6') : '#8E8E93',
    }}>{label}</button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, color: '#6B7280', marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</div>
}

const btnStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, border: '1px solid #3F3F46',
  background: '#2D2D33', color: '#F8F8F8', fontSize: 12, cursor: 'pointer',
}

const miniBtn: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 5, border: '1px solid #3F3F46',
  background: '#2D2D33', color: '#B4B4B8', fontSize: 11, cursor: 'pointer',
}

function tagStyle(color: string): React.CSSProperties {
  return { fontSize: 10, padding: '1px 6px', borderRadius: 4, background: color + '33', color }
}

const preStyle: React.CSSProperties = {
  fontSize: 11, color: '#B4B4B8', background: '#25252B', padding: 8, borderRadius: 6,
  margin: 0, maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap',
}
