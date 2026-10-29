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
 * 宿主调用统一走 window.__POLARIS_HOST_INVOKE__（主应用 main.tsx 挂载，环境感知：
 * 桌面 Tauri → IPC；手机 App / Web → HTTP 桥，与主前端同一 transport/token），
 * 旧版宿主回退 __TAURI_INTERNALS__.invoke（仅桌面）。
 * 插件管理面统一经 router_dispatch → cap.pluginDiscovery 总线（旧 plugin_* 命令已删除）。
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

/** 解析插件 tier：未设置时默认 demo */
function resolveTier(p: MarketPlugin): PluginTier {
  if (p.tier === 'production' || p.tier === 'beta') return p.tier
  return 'demo'
}

/** 官方商城索引源（多镜像兜底：raw 访问不稳时切 jsdelivr） */
const OFFICIAL_INDEX_SOURCES = [
  'https://raw.githubusercontent.com/misxzaiz/Polaris-plugin/main/index.json',
  'https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/index.json',
]

/** 本地/自定义商城源持久化 key（localStorage：面板与主前端同 window，随应用持久） */
const INDEX_SOURCE_KEY = 'polaris.marketplace.indexUrl'

/** 多源列表持久化 key（JSON 数组，替代 INDEX_SOURCE_KEY 的单源模式） */
const SOURCES_KEY = 'polaris.marketplace.sources'
/** 当前激活源 id 持久化 key */
const ACTIVE_SOURCE_KEY = 'polaris.marketplace.activeSourceId'

/** 商城源条目 */
interface MarketSource {
  id: string
  /** 显示名（默认从 URL 推导，可自定义） */
  name: string
  /** 索引 URL（http/https；官方源为 ''，走 OFFICIAL_INDEX_SOURCES 多镜像兜底） */
  url: string
  /** 内置官方源标记（不可删除、不可改名） */
  builtin?: boolean
  /** 最近使用时间戳（ms，用于快速回排序） */
  lastUsed: number
}

/** 官方源固定 id */
const OFFICIAL_SOURCE_ID = '__official__'

/** 从 URL 推导默认显示名 */
function defaultSourceName(url: string): string {
  if (!url) return '官方'
  try {
    const u = new URL(url)
    // 本地服务：127.0.0.1:8787 → "本地 8787"
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return `本地 ${u.port || 80}`
    return u.hostname
  } catch { return url.split('/').filter(Boolean).pop() || url }
}

/** 读全部商城源（含官方源占位；按 lastUsed 倒序） */
function getSources(): MarketSource[] {
  const official: MarketSource = { id: OFFICIAL_SOURCE_ID, name: '官方', url: '', builtin: true, lastUsed: 0 }
  try {
    const raw = localStorage.getItem(SOURCES_KEY)
    if (!raw) return [official]
    const list = JSON.parse(raw) as MarketSource[]
    const valid = list.filter(s => s && typeof s.id === 'string' && typeof s.url === 'string' && s.id !== OFFICIAL_SOURCE_ID)
    return [official, ...valid].sort((a, b) => b.lastUsed - a.lastUsed)
  } catch { return [official] }
}

/** 写全部用户源（不含官方占位；官方始终由 getSources 注入） */
function saveSources(list: MarketSource[]): void {
  const user = list.filter(s => !s.builtin)
  try { localStorage.setItem(SOURCES_KEY, JSON.stringify(user)) } catch { /* 受限存储静默 */ }
}

/** 读当前激活源 id（缺省官方） */
function getActiveSourceId(): string {
  try { return localStorage.getItem(ACTIVE_SOURCE_KEY) || OFFICIAL_SOURCE_ID } catch { return OFFICIAL_SOURCE_ID }
}

/** 写当前激活源 id */
function setActiveSourceId(id: string): void {
  try { localStorage.setItem(ACTIVE_SOURCE_KEY, id) } catch { /* 静默 */ }
}

/** 记录某源最近使用（更新 lastUsed 并持久化） */
function touchSource(id: string): void {
  const list = getSources().filter(s => s.id !== OFFICIAL_SOURCE_ID)
  const hit = list.find(s => s.id === id)
  if (!hit) return
  hit.lastUsed = Date.now()
  saveSources(list)
}

/** 新增/更新一个用户源（同名 URL 去重更新） */
function upsertSource(name: string, url: string): MarketSource {
  const list = getSources().filter(s => s.id !== OFFICIAL_SOURCE_ID)
  const existing = list.find(s => s.url === url)
  const id = existing?.id ?? `src-${Date.now().toString(36)}`
  const entry: MarketSource = {
    id,
    name: name.trim() || defaultSourceName(url),
    url,
    lastUsed: Date.now(),
  }
  const next = [entry, ...list.filter(s => s.id !== id)]
  saveSources(next)
  return entry
}

/** 删除用户源（官方/不存在返回 false） */
function removeSource(id: string): boolean {
  const list = getSources().filter(s => s.id !== OFFICIAL_SOURCE_ID)
  const next = list.filter(s => s.id !== id)
  if (next.length === list.length) return false
  saveSources(next)
  return true
}

/**
 * 迁移旧单源（INDEX_SOURCE_KEY）到多源结构。
 * 返回是否迁移了（幂等：旧 key 存在且非空且未迁移过才执行）。
 */
function migrateLegacySingleSource(): void {
  try {
    if (localStorage.getItem(SOURCES_KEY)) return // 已迁移过
    const legacy = (localStorage.getItem(INDEX_SOURCE_KEY) || '').trim()
    if (!legacy) return
    upsertSource(defaultSourceName(legacy), legacy)
    setActiveSourceId(getSources().find(s => s.url === legacy)?.id || OFFICIAL_SOURCE_ID)
    localStorage.removeItem(INDEX_SOURCE_KEY)
  } catch { /* 静默 */ }
}

/** 读当前激活源对象（找不到回退官方） */
function getActiveSource(): MarketSource {
  const id = getActiveSourceId()
  return getSources().find(s => s.id === id) || getSources()[0]
}

/** 带超时的 fetch（单源 10s，超时切下一镜像） */
function fetchWithTimeout(url: string, ms = 10_000): Promise<Response> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  return fetch(url, { cache: 'no-cache', signal: ac.signal }).finally(() => clearTimeout(timer))
}

/**
 * 索引加载时把相对 URL（downloadUrl / manifestUrl / updateUrl / versions[].downloadUrl）
 * 相对索引源解析为绝对地址——本地商城（127.0.0.1 静态服务）或任意镜像源
 * 的索引可直接写相对路径，安装时面板传绝对地址给宿主。
 */
function resolveIndexUrls(data: IndexData, sourceUrl: string): void {
  if (!/^https?:\/\//i.test(sourceUrl)) return
  const resolve = (raw: string): string => {
    if (!raw || /^https?:\/\//i.test(raw)) return raw
    try { return new URL(raw, sourceUrl).toString() } catch { return raw }
  }
  for (const p of data.plugins) {
    p.downloadUrl = p.downloadUrl ? resolve(p.downloadUrl) : undefined
    p.manifestUrl = p.manifestUrl ? resolve(p.manifestUrl) : undefined
    p.updateUrl = p.updateUrl ? resolve(p.updateUrl) : undefined
    for (const v of p.versions || []) v.downloadUrl = resolve(v.downloadUrl)
  }
}

/**
 * 宿主调用通道（自适配）：
 * 1. __POLARIS_HOST_INVOKE__：主应用 main.tsx 挂载（批 7 宿主桥白名单），环境感知，首选；
 * 2. __TAURI_INTERNALS__.invoke：旧版桌面宿主裸 IPC 回退（手机壳无注册命令，必失败）。
 */
function getInvoke(): (cmd: string, args?: Record<string, unknown>) => Promise<unknown> {
  const g = window as unknown as {
    __POLARIS_HOST_INVOKE__?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
    __TAURI_INTERNALS__?: { invoke?: (c: string, a?: Record<string, unknown>) => Promise<unknown> }
  }
  if (typeof g.__POLARIS_HOST_INVOKE__ === 'function') return g.__POLARIS_HOST_INVOKE__
  if (g.__TAURI_INTERNALS__?.invoke) {
    const invoke = g.__TAURI_INTERNALS__.invoke
    return (cmd, args) => invoke(cmd, args)
  }
  throw new Error('宿主调用通道不可用：请更新 Polaris 主应用，或在手机 App 上先连接桌面端服务')
}

/** 错误翻译：把裸报错变成可操作的提示 */
function humanizeError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? '未知错误')
  if (/router_dispatch/i.test(msg) && /not found|unregistered|未注册/i.test(msg)) {
    return '宿主缺少 router_dispatch 命令：当前应用壳未注册后端命令（手机壳/旧版应用）。请更新 Polaris 主应用，或在手机 App 中先连接桌面端服务'
  }
  if (/HTTP 401|HTTP 403|认证失败|unauthorized|forbidden/i.test(msg)) {
    return '认证失败（HTTP 401/403）：远程桌面服务拒绝了请求。请在手机 App 中重新连接桌面端服务（设置 → 服务连接），确认 token 有效'
  }
  if (/Failed to fetch|NetworkError|网络不可达|load failed|fetch failed|network/i.test(msg)) {
    return '网络不可达：当前为远程/未连接模式，无法访问桌面端服务。请在手机 App 中先连接桌面端服务（设置 → 服务连接），或检查网络'
  }
  if (!/__POLARIS_HOST_INVOKE__/i.test(msg) && /deny|denied|拒绝|not allowed|permission/i.test(msg)) {
    return `${msg}（远程模式下仅放行查看/检查更新等只读操作；安装/卸载/更新请在桌面端操作，或在 AI 会话中执行）`
  }
  return msg
}

/** router_dispatch 返回形态（与 Polaris 后端 commands/router.rs RouterDispatchResponse 对应） */
interface DispatchResponse {
  msgId: string
  ok: boolean
  result: Record<string, unknown> | null
  error: string | null
  trace: string
}

/**
 * 经 Polaris 统一总线（router_dispatch → cap.pluginDiscovery）调用插件管理面。
 * 旧命令 plugin_install_remote / plugin_discover / plugin_uninstall_local /
 * plugin_check_update / plugin_apply_update 已删除，统一迁移到该总线协议
 * （见 Polaris src/services/pluginDiscoveryService.ts 同款调用）。
 */
async function dispatchPluginDiscovery(
  action: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let res: DispatchResponse
  try {
    res = await getInvoke()('router_dispatch', {
      req: { target: 'cap.pluginDiscovery', payload: { action, ...payload } },
    }) as DispatchResponse
  } catch (e) {
    throw new Error(humanizeError(e))
  }
  if (!res.ok) throw new Error(res.error ? humanizeError(res.error) : `cap.pluginDiscovery ${action} 失败`)
  return res.result || {}
}

interface OpResult { success: boolean; message?: string; error?: string }

async function installPlugin(plugin: MarketPlugin, scope: 'user' | 'project', version?: string): Promise<OpResult> {
  // 如果指定了版本号，从 versions 中查找对应 downloadUrl
  if (version && version !== plugin.version && plugin.versions) {
    const target = plugin.versions.find(v => v.version === version)
    if (!target?.downloadUrl) return { success: false, error: `未找到插件 ${plugin.id} 的版本 ${version}` }
    try {
      return await dispatchPluginDiscovery('install_remote', { sourceUrl: target.downloadUrl, scope }) as unknown as OpResult
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  // 默认安装最新版
  if (!plugin.downloadUrl) return { success: false, error: '该插件未提供 downloadUrl' }
  try {
    return await dispatchPluginDiscovery('install_remote', { sourceUrl: plugin.downloadUrl, scope }) as unknown as OpResult
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function discoverInstalled(): Promise<InstalledPlugin[]> {
  try {
    const res = await dispatchPluginDiscovery('discover', {}) as unknown as { plugins: InstalledPlugin[]; errors: unknown[] }
    return Array.isArray(res.plugins) ? res.plugins : []
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e))
  }
}

async function uninstallPlugin(installPath: string): Promise<OpResult> {
  try {
    return await dispatchPluginDiscovery('uninstall_local', { installPath }) as unknown as OpResult
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

interface UpdateResult { pluginId: string; currentVersion: string; latestVersion?: string; updateAvailable: boolean; downloadUrl?: string; error?: string }

async function checkUpdate(installPath: string): Promise<UpdateResult> {
  try {
    const r = await dispatchPluginDiscovery('check_update', { installPath }) as unknown as UpdateResult
    return { ...r, pluginId: r.pluginId }
  } catch (e) {
    return { pluginId: '', currentVersion: '', updateAvailable: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function applyUpdate(installPath: string): Promise<OpResult> {
  try {
    return await dispatchPluginDiscovery('apply_update', { installPath }) as unknown as OpResult
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
  const [sourceUsed, setSourceUsed] = useState<string>('')

  // 多源状态：源列表 + 当前激活 id（挂载时迁移旧单源）
  const [sources, setSources] = useState<MarketSource[]>(() => {
    migrateLegacySingleSource()
    return getSources()
  })
  const [activeSourceId, setActiveId] = useState<string>(() => getActiveSourceId())

  // 已装状态
  const [installed, setInstalled] = useState<InstalledPlugin[]>([])
  const [iLoading, setILoading] = useState(false)
  const [iError, setIError] = useState<string | null>(null)
  const [updates, setUpdates] = useState<Record<string, UpdateResult>>({})
  const [opLoading, setOpLoading] = useState<string | null>(null)
  const [opMsg, setOpMsg] = useState<string | null>(null)

  /**
   * 加载索引（单源语义：只拉当前激活源，不聚合多源插件）。
   * sourceId 缺省用当前激活源；官方源（url=''）走 OFFICIAL_INDEX_SOURCES 多镜像。
   */
  const loadIndex = useCallback(async (sourceId?: string) => {
    const sid = sourceId ?? getActiveSourceId()
    const src = getSources().find(s => s.id === sid) || getSources()[0]
    setMLoading(true); setMError(null); setSourceUsed('')
    try {
      // 候选源：激活源是官方 → 官方多镜像；自定义 → 该源 URL（失败不自动落官方，保持语义清晰）
      const candidates = src.url ? [src.url] : OFFICIAL_INDEX_SOURCES
      let lastError = ''
      for (const source of candidates) {
        try {
          const res = await fetchWithTimeout(source)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data: IndexData = await res.json()
          if (!Array.isArray(data?.plugins)) throw new Error('索引格式无效（缺少 plugins 数组）')
          // 相对 downloadUrl/manifestUrl 等相对索引源解析为绝对地址（本地商城支持的关键）
          resolveIndexUrls(data, source)
          setIndex(data); setSourceUsed(src.url ? source : src.name)
          touchSource(sid)
          setActiveId(sid)
          return
        } catch (e) {
          lastError = e instanceof DOMException && e.name === 'AbortError' ? `${source} 超时（10s）` : `${source}：${e instanceof Error ? e.message : String(e)}`
        }
      }
      throw new Error(lastError || '所有索引源均不可达')
    } catch (e) { setMError(e instanceof Error ? e.message : String(e)) }
    finally { setMLoading(false) }
  }, [])

  /** 切换激活商城源（快速回：更新 lastUsed + 重新加载该源） */
  const switchSource = useCallback((id: string) => {
    setActiveId(id)
    setActiveSourceId(id)
    setSelected(null); setSelectedVersion(''); setInstallMsg(null)
    void loadIndex(id)
  }, [loadIndex])

  /** 添加/更新一个用户源并切换过去（同名 URL 去重） */
  const applyIndexSource = useCallback((name: string, url: string) => {
    const entry = upsertSource(name, url)
    setSources(getSources())
    setActiveId(entry.id)
    setActiveSourceId(entry.id)
    setSelected(null); setSelectedVersion(''); setInstallMsg(null)
    void loadIndex(entry.id)
  }, [loadIndex])

  /** 删除一个用户源；若删的是激活源则回退官方 */
  const deleteSource = useCallback((id: string) => {
    if (id === OFFICIAL_SOURCE_ID) return
    if (!removeSource(id)) return
    setSources(getSources())
    if (getActiveSourceId() === id) {
      setActiveId(OFFICIAL_SOURCE_ID)
      setActiveSourceId(OFFICIAL_SOURCE_ID)
      void loadIndex(OFFICIAL_SOURCE_ID)
    }
  }, [loadIndex])

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
          installing={installing} installMsg={installMsg} onInstall={handleInstall}
          onReload={() => void loadIndex()}
          sourceUsed={sourceUsed}
          sources={sources} activeSourceId={activeSourceId}
          onSwitchSource={switchSource} onAddSource={applyIndexSource} onDeleteSource={deleteSource}
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
  /** 当前生效的索引源（空 = 加载中/失败未定），展示 + 设置面板 */
  sourceUsed: string
  /** 全部商城源（含官方占位，按 lastUsed 倒序） */
  sources: MarketSource[]
  /** 当前激活源 id */
  activeSourceId: string
  /** 切换激活源（快速回） */
  onSwitchSource: (id: string) => void
  /** 添加/更新用户源（name + url）并切换 */
  onAddSource: (name: string, url: string) => void
  /** 删除用户源 */
  onDeleteSource: (id: string) => void
}

function MarketView(props: MarketViewProps) {
  const { index, loading, error, query, setQuery, category, setCategory,
    tierFilter, setTierFilter, selected, setSelected,
    selectedVersion, setSelectedVersion,
    installing, installMsg, onInstall, onReload,
    sourceUsed, sources, activeSourceId, onSwitchSource, onAddSource, onDeleteSource } = props

  // —— 派生数据（所有 hooks 必须在条件 return 之前，否则跨渲染 hook 数量
  //     不一致 → React Rules of Hooks 违规 #310）——
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

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SourceBar sources={sources} activeSourceId={activeSourceId}
        onSwitchSource={onSwitchSource} onAddSource={onAddSource} onDeleteSource={onDeleteSource} sourceUsed={sourceUsed} />
      <div style={{ padding: 24, color: '#8E8E93' }}>加载商城索引中…</div>
    </div>
  )
  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SourceBar sources={sources} activeSourceId={activeSourceId}
        onSwitchSource={onSwitchSource} onAddSource={onAddSource} onDeleteSource={onDeleteSource} sourceUsed={sourceUsed} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: '#EF4444', wordBreak: 'break-all' }}>加载失败：{error}</div>
        <div style={{ fontSize: 11, color: '#8E8E93', lineHeight: 1.5 }}>
          切换其他商城源重试，或检查网络后刷新。
        </div>
        <button onClick={onReload} style={s.btn}>重试</button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 搜索栏 */}
      <div style={{ padding: '12px 12px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索插件…"
          style={{ flex: 1, padding: '6px 10px', background: '#25252B', border: '1px solid #3F3F46', borderRadius: 6, color: '#F8F8F8', fontSize: 12, outline: 'none' }} />
        <button onClick={onReload} title="刷新索引" style={{ ...s.btn, padding: '6px 10px' }}>↻</button>
      </div>

      {/* 商城源切换条（常驻，快速回）：官方 + 用户源 chips + 添加 */}
      <SourceBar sources={sources} activeSourceId={activeSourceId}
        onSwitchSource={onSwitchSource} onAddSource={onAddSource} onDeleteSource={onDeleteSource} sourceUsed={sourceUsed} />

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

/* ========================================================================
   商城源切换条（常驻：官方 + 用户源 chips + 添加/删除）
   ======================================================================== */

interface SourceBarProps {
  sources: MarketSource[]
  activeSourceId: string
  onSwitchSource: (id: string) => void
  onAddSource: (name: string, url: string) => void
  onDeleteSource: (id: string) => void
  sourceUsed: string
}

function SourceBar({ sources, activeSourceId, onSwitchSource, onAddSource, onDeleteSource, sourceUsed }: SourceBarProps) {
  const [adding, setAdding] = useState(false)
  const [sourceDraft, setSourceDraft] = useState('')
  const [sourceNameDraft, setSourceNameDraft] = useState('')
  const isLocalSource = /^file:\/\//i.test(sourceDraft) || /^[a-zA-Z]:[\\/]/.test(sourceDraft) || sourceDraft.startsWith('\\\\')

  const submitAdd = () => {
    const url = sourceDraft.trim()
    if (!/^https?:\/\//i.test(url)) { setAdding(true); return }
    onAddSource(sourceNameDraft, url)
    setSourceDraft(''); setSourceNameDraft(''); setAdding(false)
  }

  return (
    <>
      {/* 源 chips 条（快速回）：官方 + 用户源 + 添加 */}
      <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#6B7280', marginRight: 2 }}>源</span>
        {sources.map(src => {
          const active = src.id === activeSourceId
          const isOfficial = src.id === OFFICIAL_SOURCE_ID
          return (
            <span key={src.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <button
                onClick={() => onSwitchSource(src.id)}
                title={src.url || '官方多镜像'}
                style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `1px solid ${active ? '#3B82F6' : '#3F3F46'}`,
                  background: active ? '#3B82F622' : 'transparent',
                  color: active ? '#3B82F6' : '#8E8E93',
                }}
              >{src.name}</button>
              {!isOfficial && (
                <button onClick={() => onDeleteSource(src.id)} title="删除该源"
                  style={{ fontSize: 9, padding: '1px 4px', borderRadius: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: '#6B7280' }}>×</button>
              )}
            </span>
          )
        })}
        <button onClick={() => setAdding(o => !o)} title="添加商城源"
          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, cursor: 'pointer', border: '1px dashed #3F3F46', background: 'transparent', color: '#6B7280' }}>+ 添加源</button>
      </div>

      {/* 添加源表单 */}
      {adding && (
        <div style={{ margin: '0 12px 8px', padding: 10, borderRadius: 8, background: '#1F1F24', border: '1px solid #3F3F46', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#B4B4B8', fontWeight: 600 }}>添加商城源</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={sourceNameDraft}
              onChange={e => setSourceNameDraft(e.target.value)}
              placeholder="名称（可选，如 本地商城）"
              style={{ width: '32%', padding: '5px 8px', background: '#25252B', border: '1px solid #3F3F46', borderRadius: 6, color: '#F8F8F8', fontSize: 11, outline: 'none' }}
            />
            <input
              value={sourceDraft}
              onChange={e => setSourceDraft(e.target.value)}
              placeholder="索引 URL（必填，http/https），如 http://127.0.0.1:8787/index.json"
              style={{ flex: 1, padding: '5px 8px', background: '#25252B', border: '1px solid #3F3F46', borderRadius: 6, color: '#F8F8F8', fontSize: 11, outline: 'none', wordBreak: 'break-all' }}
            />
            <button onClick={submitAdd} style={{ ...s.btn, padding: '4px 10px' }}>添加</button>
            <button onClick={() => { setAdding(false); setSourceDraft(''); setSourceNameDraft('') }} style={{ ...s.miniBtn, padding: '4px 10px' }}>取消</button>
          </div>
          {isLocalSource && (
            <div style={{ fontSize: 10, color: '#F59E0B', lineHeight: 1.5 }}>
              ⚠ 浏览器/面板无法直接 fetch 本地路径（file:// 或盘符路径）。请先在商城目录启动本地静态服务：
              <code style={{ color: '#F8F8F8' }}>node scripts/serve-market.js D:\你的商城目录 8787</code>
              ，然后填 <code style={{ color: '#F8F8F8' }}>http://127.0.0.1:8787/index.json</code>。
            </div>
          )}
          <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.5 }}>
            • 本地商城：索引里的 downloadUrl 可写相对路径（相对 index.json）或本地绝对路径（zip 或插件目录；桌面端直接本机安装，仅 Tauri 生效）<br />
            • 官方源（多镜像 raw.githubusercontent → cdn.jsdelivr）恒在列表首项，点击即回<br />
            • 切换源只加载当前源索引（不聚合多源插件）
          </div>
          {sourceUsed && <div style={{ fontSize: 10, color: '#10B981', wordBreak: 'break-all' }}>当前源：{sourceUsed}</div>}
        </div>
      )}
    </>
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