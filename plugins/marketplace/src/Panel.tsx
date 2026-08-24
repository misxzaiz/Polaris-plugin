import { useState, useEffect, useCallback, useMemo } from 'react'

/**
 * Polaris 插件商城面板
 *
 * 两个标签：
 *   - 商城：拉取 index.json 浏览/搜索/一键安装，按 tier 等级分组，
 *     未设置 tier 的插件默认视为 demo（玩具）
 *   - 已装：读取本地已装插件，支持卸载 / 检查更新 / 应用更新
 *
 * 运行环境：宿主 webview，React 由 pluginModuleLoader shim 注入。
 * Tauri invoke 通过 window.__TAURI_INTERNALS__.invoke 调用（零外部依赖）。
 */

/* ---------- 类型定义 ---------- */

type PluginTier = 'production' | 'beta' | 'demo'

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
  tier?: PluginTier
  permissions?: Record<string, boolean>
  readme?: string
  screenshots?: string[]
  /** 历史版本列表（可选，由 index.json 的 versions 字段提供） */
  versions?: Array<{ version: string; downloadUrl: string; sha256?: string }>
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

/* ---------- 工具函数 ---------- */

const DEFAULT_INDEX = 'https://raw.githubusercontent.com/misxzaiz/Polaris-plugin/main/index.json'

/** 解析插件 tier：未设置时默认 demo */
function resolveTier(p: MarketPlugin): PluginTier {
  if (p.tier === 'production' || p.tier === 'beta') return p.tier
  return 'demo'
}

/** 调用 Tauri 命令（插件上下文零依赖） */
async function tauriInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (c: string, a?: Record<string, unknown>) => Promise<T> } }).__TAURI_INTERNALS__
  if (!internals?.invoke) {
    throw new Error('Tauri invoke 不可用（非 Tauri 环境或未授权）')
  }
  return internals.invoke(cmd, args)
}

interface OpResult { success: boolean; message?: string; error?: string }

async function installPlugin(plugin: MarketPlugin, scope: 'user' | 'project', version?: string): Promise<OpResult> {
  // 如果指定了版本号，从 versions 中查找对应 downloadUrl
  if (version && version !== plugin.version && plugin.versions) {
    const target = plugin.versions.find(v => v.version === version)
    if (!target?.downloadUrl) return { success: false, error: `未找到插件 ${plugin.id} 的版本 ${version}` }
    try {
      return await tauriInvoke<OpResult>('plugin_install_remote', { sourceUrl: target.downloadUrl, scope })
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  // 默认安装最新版
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

/* ---------- 样式常量 ---------- */

const TIER_CONFIG: Record<PluginTier, { label: string; color: string; bg: string; border: string }> = {
  production: { label: 'Production', color: '#34D399', bg: '#065F4622', border: '#065F4644' },
  beta: { label: 'Beta', color: '#60A5FA', bg: '#1E40AF22', border: '#1E40AF44' },
  demo: { label: 'Demo', color: '#6B7280', bg: '#3F3F4622', border: '#3F3F4644' },
}

const CATEGORY_COLORS: Record<string, string> = {
  utility: '#3B82F6', mcp: '#8B5CF6', panel: '#10B981', media: '#EC4899',
  dev: '#F59E0B', productivity: '#06B6D4', integration: '#6366F1',
  'ai-engine': '#A855F7', fun: '#EC4899', demo: '#6B7280',
}

const s: Record<string, React.CSSProperties> = {
  btn: {
    padding: '6px 12px', borderRadius: 6, border: '1px solid #3F3F46',
    background: '#2D2D33', color: '#F8F8F8', fontSize: 12, cursor: 'pointer',
  },
  miniBtn: {
    padding: '4px 10px', borderRadius: 5, border: '1px solid #3F3F46',
    background: '#2D2D33', color: '#B4B4B8', fontSize: 11, cursor: 'pointer',
  },
  pre: {
    fontSize: 11, color: '#B4B4B8', background: '#25252B', padding: 8, borderRadius: 6,
    margin: 0, maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap',
  },
}

/* ---------- 主面板 ---------- */

export default function MarketplacePanel({ pluginId: _pluginId }: { pluginId: string }) {
  const [tab, setTab] = useState<'market' | 'installed'>('market')

  // 商城状态
  const [index, setIndex] = useState<IndexData | null>(null)
  const [mLoading, setMLoading] = useState(true)
  const [mError, setMError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('')
  const [tierFilter, setTierFilter] = useState<PluginTier | 'all'>('all')
  const [selected, setSelected] = useState<MarketPlugin | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<string>('')
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
    const version = selectedVersion && selectedVersion !== p.version ? selectedVersion : undefined
    const r = await installPlugin(p, scope, version)
    setInstallMsg(r.success ? `✓ ${p.name} ${version ? 'v' + version : ''} 安装成功${r.message ? '：' + r.message : ''}` : `✗ 安装失败：${r.error ?? '未知错误'}`)
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
          index={index} loading={mLoading} error={mError}
          query={query} setQuery={setQuery}
          category={category} setCategory={setCategory}
          tierFilter={tierFilter} setTierFilter={setTierFilter}
          selected={selected} setSelected={(p) => { setSelected(p); setSelectedVersion(''); setInstallMsg(null) }}
          selectedVersion={selectedVersion} setSelectedVersion={setSelectedVersion}
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

/* ========================================================================
   商城视图
   ======================================================================== */

interface MarketViewProps {
  index: IndexData | null
  loading: boolean
  error: string | null
  query: string
  setQuery: (s: string) => void
  category: string
  setCategory: (s: string) => void
  tierFilter: PluginTier | 'all'
  setTierFilter: (s: PluginTier | 'all') => void
  selected: MarketPlugin | null
  setSelected: (p: MarketPlugin | null) => void
  selectedVersion: string
  setSelectedVersion: (s: string) => void
  installing: string | null
  installMsg: string | null
  onInstall: (p: MarketPlugin, scope: 'user' | 'project') => void
  onReload: () => void
}

function MarketView(props: MarketViewProps) {
  const { index, loading, error, query, setQuery, category, setCategory,
    tierFilter, setTierFilter, selected, setSelected,
    selectedVersion, setSelectedVersion,
    installing, installMsg, onInstall, onReload } = props

  if (loading) return <div style={{ padding: 24, color: '#8E8E93' }}>加载商城索引中…</div>
  if (error) return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#EF4444' }}>加载失败：{error}</div>
      <button onClick={onReload} style={s.btn}>重试</button>
    </div>
  )

  const plugins = index?.plugins ?? []
  const categories = Array.from(new Set(plugins.map(p => p.category).filter(Boolean) as string[]))

  // 过滤
  const filtered = useMemo(() => {
    return plugins.filter(p => {
      const t = resolveTier(p)
      if (tierFilter !== 'all' && t !== tierFilter) return false
      if (category && p.category !== category) return false
      if (query.trim()) {
        const q = query.toLowerCase()
        const hay = [p.id, p.name, p.description, (p.tags || []).join(' ')].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [plugins, tierFilter, category, query])

  // 按 tier 分组
  const grouped = useMemo(() => {
    const groups: Record<PluginTier, MarketPlugin[]> = { production: [], beta: [], demo: [] }
    for (const p of filtered) {
      groups[resolveTier(p)].push(p)
    }
    return groups
  }, [filtered])

  const tierOrder: PluginTier[] = ['production', 'beta', 'demo']
  const tierLabels: Record<PluginTier, string> = { production: '生产可用', beta: '测试阶段', demo: '演示玩具' }
  const hasAny = tierOrder.some(t => grouped[t].length > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 搜索栏 */}
      <div style={{ padding: '12px 12px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索插件…"
          style={{ flex: 1, padding: '6px 10px', background: '#25252B', border: '1px solid #3F3F46', borderRadius: 6, color: '#F8F8F8', fontSize: 12, outline: 'none' }} />
        <button onClick={onReload} title="刷新索引" style={{ ...s.btn, padding: '6px 10px' }}>↻</button>
      </div>

      {/* 过滤栏：等级 + 分类 */}
      <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* 等级过滤 */}
        <span style={{ fontSize: 10, color: '#6B7280', marginRight: 2 }}>等级</span>
        {(['all', 'production', 'beta', 'demo'] as const).map(t => (
          <FilterChip
            key={t}
            active={tierFilter === t}
            onClick={() => setTierFilter(t)}
            label={t === 'all' ? '全部' : TIER_CONFIG[t].label}
            color={t === 'all' ? '#6B7280' : TIER_CONFIG[t].color}
          />
        ))}
        <span style={{ width: 1, height: 14, background: '#3F3F46', margin: '0 2px' }} />
        {/* 分类过滤 */}
        <span style={{ fontSize: 10, color: '#6B7280', marginRight: 2 }}>分类</span>
        <FilterChip active={!category} onClick={() => setCategory('')} label="全部" color="#6B7280" />
        {categories.map(c => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)} label={c} color={CATEGORY_COLORS[c] || '#6B7280'} />
        ))}
      </div>

      {/* 提示条：未设置 tier 的插件默认视为 demo */}
      <div style={{ margin: '0 12px 6px', padding: '4px 8px', borderRadius: 4, background: '#3F3F4622', fontSize: 10, color: '#6B7280', lineHeight: 1.4 }}>
        💡 未标注等级的插件默认视为 <strong style={{ color: '#6B7280' }}>Demo</strong>，仅已标注 <span style={{ color: '#34D399' }}>Production</span> 或 <span style={{ color: '#60A5FA' }}>Beta</span> 的插件才算可用
      </div>

      {/* 列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {!hasAny ? (
          <div style={{ padding: 24, color: '#8E8E93', textAlign: 'center' }}>未找到匹配插件</div>
        ) : (
          tierOrder.map(tier => {
            const list = grouped[tier]
            if (list.length === 0) return null
            const cfg = TIER_CONFIG[tier]
            return (
              <div key={tier} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <span style={{ color: cfg.color }}>{cfg.label}</span>
                  <span style={{ color: '#6B7280', fontWeight: 400, marginLeft: 4 }}>{tierLabels[tier]} · {list.length}</span>
                </div>
                {list.map(p => (
                  <MarketItem
                    key={p.id}
                    plugin={p}
                    tier={resolveTier(p)}
                    selected={selected?.id === p.id}
                    onClick={() => setSelected(p)}
                  />
                ))}
              </div>
            )
          })
        )}
      </div>

      {/* 详情面板 */}
      {selected && (
        <DetailPanel
          plugin={selected}
          tier={resolveTier(selected)}
          selectedVersion={selectedVersion}
          setSelectedVersion={setSelectedVersion}
          installing={installing}
          installMsg={installMsg}
          onClose={() => setSelected(null)}
          onInstall={onInstall}
        />
      )}
    </div>
  )
}

/* ---------- 商城列表项 ---------- */

function MarketItem({ plugin, tier, selected, onClick }: {
  plugin: MarketPlugin
  tier: PluginTier
  selected: boolean
  onClick: () => void
}) {
  const cfg = TIER_CONFIG[tier]
  const isDemo = tier === 'demo'

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 10, padding: 10, borderRadius: 8, cursor: 'pointer',
        marginBottom: 6, border: `1px solid ${selected ? '#3B82F6' : 'transparent'}`,
        background: selected ? '#2D2D33' : '#25252B',
        opacity: isDemo ? 0.55 : 1,
        transition: 'opacity 0.15s, background 0.15s',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = '#2A2A30' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = '#25252B' }}
    >
      {/* 左侧图标 */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 14, flexShrink: 0, marginTop: 2,
        background: cfg.bg, color: cfg.color,
      }}>
        {plugin.icon === 'BookOpen' ? '📖' : plugin.icon === 'Terminal' ? '⚡' : plugin.icon === 'Target' ? '🎯' : plugin.icon === 'Beaker' ? '🧪' : plugin.icon === 'Activity' ? '📊' : plugin.icon === 'GitPullRequest' ? '🔀' : plugin.icon === 'Bot' ? '🤖' : '🧩'}
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: isDemo ? '#6B7280' : '#F8F8F8' }}>{plugin.name}</span>
          <span style={{ fontSize: 10, color: '#6B7280' }}>v{plugin.version}</span>
          <TierBadge tier={tier} />
        </div>
        {plugin.description && (
          <div style={{ fontSize: 11, color: isDemo ? '#6B7280' : '#8E8E93', marginTop: 3, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {plugin.description}
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
          {plugin.category && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: (CATEGORY_COLORS[plugin.category] || '#6B7280') + '33', color: CATEGORY_COLORS[plugin.category] || '#6B7280' }}>
              {plugin.category}
            </span>
          )}
          {(plugin.tags || []).slice(0, 2).map(t => (
            <span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#3F3F4633', color: '#6B7280' }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- 详情面板 ---------- */

function DetailPanel({ plugin, tier, selectedVersion, setSelectedVersion, installing, installMsg, onClose, onInstall }: {
  plugin: MarketPlugin
  tier: PluginTier
  selectedVersion: string
  setSelectedVersion: (s: string) => void
  installing: string | null
  installMsg: string | null
  onClose: () => void
  onInstall: (p: MarketPlugin, scope: 'user' | 'project') => void
}) {
  // 收集可用的版本列表
  const allVersions = useMemo(() => {
    const versions = plugin.versions || []
    // 确保当前最新版也在列表中
    if (!versions.find(v => v.version === plugin.version)) {
      return [{ version: plugin.version, downloadUrl: plugin.downloadUrl || '', sha256: plugin.sha256 }, ...versions]
    }
    return versions
  }, [plugin])

  // 当前选中的版本对象
  const currentVersion = selectedVersion || plugin.version

  return (
    <div style={{
      borderTop: '1px solid #3F3F46', padding: 12, background: '#1F1F24',
      maxHeight: '40%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{plugin.name}</span>
            <TierBadge tier={tier} />
          </div>
          <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{plugin.id} · v{plugin.version}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8E8E93', cursor: 'pointer', padding: '2px 6px', fontSize: 14 }}>✕</button>
      </div>

      {plugin.description && (
        <div style={{ fontSize: 12, color: '#B4B4B8', lineHeight: 1.5 }}>{plugin.description}</div>
      )}

      {plugin.permissions && Object.keys(plugin.permissions).length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#8E8E93', marginBottom: 2 }}>权限</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Object.entries(plugin.permissions).filter(([, v]) => v).map(([k]) => (
              <span key={k} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#3F3F46', color: '#F8B4B8' }}>{k}</span>
            ))}
          </div>
        </div>
      )}

      {/* 版本选择器 */}
      {allVersions.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: '#8E8E93', whiteSpace: 'nowrap' }}>版本：</label>
          <select
            value={currentVersion}
            onChange={e => setSelectedVersion(e.target.value)}
            style={{
              flex: 1, padding: '5px 8px', background: '#25252B', border: '1px solid #3F3F46',
              borderRadius: 6, color: '#F8F8F8', fontSize: 12, outline: 'none', cursor: 'pointer',
            }}
          >
            {allVersions.map(v => (
              <option key={v.version} value={v.version}>
                v{v.version}{v.version === plugin.version ? ' (最新)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {plugin.readme && <pre style={s.pre}>{plugin.readme}</pre>}
      {installMsg && <div style={{ fontSize: 11, color: installMsg.startsWith('✓') ? '#10B981' : '#EF4444' }}>{installMsg}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        <button onClick={() => onInstall(plugin, 'user')} disabled={installing === plugin.id}
          style={{ ...s.btn, flex: 1, opacity: installing === plugin.id ? 0.6 : 1 }}>
          {installing === plugin.id ? '安装中…' : `安装到 User${currentVersion !== plugin.version ? ' (v' + currentVersion + ')' : ''}`}
        </button>
        <button onClick={() => onInstall(plugin, 'project')} disabled={installing === plugin.id}
          style={{ ...s.btn, opacity: installing === plugin.id ? 0.6 : 1 }}>
          安装到 Project{currentVersion !== plugin.version ? ' (v' + currentVersion + ')' : ''}
        </button>
      </div>

      {plugin.downloadUrl && (
        <div style={{ fontSize: 9, color: '#6B7280', wordBreak: 'break-all' }}>
          {currentVersion !== plugin.version
            ? allVersions.find(v => v.version === currentVersion)?.downloadUrl || plugin.downloadUrl
            : plugin.downloadUrl}
        </div>
      )}
    </div>
  )
}

/* ========================================================================
   已装视图（保持不变）
   ======================================================================== */

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
      <button onClick={onReload} style={s.btn}>重试</button>
    </div>
  )

  const external = installed.filter(p => !p.builtin)
  const builtin = installed.filter(p => p.builtin)

  return (
    <>
      <div style={{ padding: '10px 12px', display: 'flex', gap: 8, borderBottom: '1px solid #3F3F46' }}>
        <button onClick={onReload} style={{ ...s.btn, flex: 1 }}>↻ 刷新</button>
        <button onClick={onCheckAll} disabled={external.length === 0}
          style={{ ...s.btn, flex: 1, opacity: external.length === 0 ? 0.5 : 1 }}>检查全部更新</button>
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
          style={{ ...s.miniBtn, opacity: checking ? 0.6 : 1 }}>
          {checking ? '检查中…' : '检查更新'}
        </button>
        <button onClick={() => onApplyUpdate(p)} disabled={!u?.updateAvailable || applying || uninstalling}
          style={{ ...s.miniBtn, background: applying ? '#3B82F644' : '#3B82F622', color: '#3B82F6', borderColor: '#3B82F6', opacity: (!u?.updateAvailable || applying) ? 0.5 : 1 }}>
          {applying ? '更新中…' : '应用更新'}
        </button>
        <button onClick={() => onUninstall(p)} disabled={checking || applying || uninstalling}
          style={{ ...s.miniBtn, color: '#EF4444', borderColor: '#7F1D1D', opacity: uninstalling ? 0.6 : 1 }}>
          {uninstalling ? '卸载中…' : '卸载'}
        </button>
      </div>
    </div>
  )
}

/* ========================================================================
   小组件
   ======================================================================== */

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '10px 12px', fontSize: 12, cursor: 'pointer',
      border: 'none', borderBottom: active ? '2px solid #3B82F6' : '2px solid transparent',
      background: 'transparent', color: active ? '#F8F8F8' : '#8E8E93', fontWeight: active ? 600 : 400,
    }}>{label}</button>
  )
}

function FilterChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
      border: `1px solid ${active ? color : '#3F3F46'}`,
      background: active ? color + '22' : 'transparent',
      color: active ? color : '#8E8E93',
      transition: 'background 0.15s, color 0.15s',
    }}>{label}</button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, color: '#6B7280', marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</div>
}

function TierBadge({ tier }: { tier: PluginTier }) {
  const cfg = TIER_CONFIG[tier]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
      letterSpacing: '0.3px', textTransform: 'uppercase',
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color }} />
      {cfg.label}
    </span>
  )
}