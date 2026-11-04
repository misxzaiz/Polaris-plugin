import { useState, useEffect, useCallback, useMemo } from 'react'

/**
 * Polaris 插件商城面板
 *
 * 单视图「插件市场」：
 *   - 拉取 index.json 浏览/搜索/安装
 *   - 两个独立评分维度各自做徽标与排序，互不推导：
 *       tier      （功能评审 1-10）→ 🔧 N 徽标 + tier-desc/asc 排序
 *       usageTier （使用习惯 1-10）→ ⭐ N 徽标 + usage-desc/asc 排序
 *   - 「已装」化为筛选 chip（与分类筛选、搜索叠加），不再是平行 Tab
 *   - 详情为面板内 push 覆盖层（从右滑入），按安装状态分流操作：
 *     未装 → 版本选择 + 安装到 User/Project；已装 → 检查更新/应用更新/卸载
 *   - 分组视图按 category 分组（平铺为默认）
 *
 * 运行环境：宿主 webview，React 由 pluginModuleLoader shim 注入。
 * 宿主调用统一走 window.__POLARIS_HOST_INVOKE__（主应用 main.tsx 挂载，环境感知：
 * 桌面 Tauri → IPC；手机 App / Web → HTTP 桥，与主前端同一 transport/token），
 * 旧版宿主回退 __TAURI_INTERNALS__.invoke（仅桌面）。
 * 插件管理面统一经 router_dispatch → cap.pluginDiscovery 总线（旧 plugin_* 命令已删除）。
 */

/* ---------- 类型定义 ---------- */

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
  /** 功能评审分级（index.json 的 tier 字段，数字 1-10）；缺省按 0 */
  tier?: number
  permissions?: Record<string, boolean>
  readme?: string
  screenshots?: string[]
  /** 历史版本列表（可选，由 index.json 的 versions 字段提供） */
  versions?: Array<{ version: string; downloadUrl: string; sha256?: string }>
  /** 首次发布时间（ISO 8601，由 index.json 提供；缺失时前端兜底归入"未知"区） */
  createdAt?: string
  /** 最近发版时间（ISO 8601，由 index.json 提供；缺失时回退 createdAt） */
  updatedAt?: string
  /** 使用习惯分级（index.json 的 usageTier 字段，数字 1-10）；缺省按 0 */
  usageTier?: number
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

const CATEGORY_COLORS: Record<string, string> = {
  utility: '#3B82F6', mcp: '#8B5CF6', panel: '#10B981', media: '#EC4899',
  dev: '#F59E0B', productivity: '#06B6D4', integration: '#6366F1',
  'ai-engine': '#A855F7', fun: '#EC4899', demo: '#6B7280',
}

/** 评分档颜色：≥8 绿 / ≥5 黄 / 其余灰（缺失/0 归灰，且不显示徽标） */
function scoreColor(score?: number): string {
  if (typeof score !== 'number' || score <= 0) return '#6B7280'
  if (score >= 8) return '#34D399'
  if (score >= 5) return '#F5B73D'
  return '#6B7280'
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
    return `${msg}（远程模式下放行查看/检查更新/安装远程插件；卸载/本地安装/更新等其余写操作请在桌面端操作，或在 AI 会话中执行）`
  }
  return msg
}

/**
 * 经 cap.mcp:call 调 marketplace-server 的 proxy_fetch 工具，
 * 由桌面侧 MCP 进程代为 GET 索引并返回 JSON。
 *
 * 用途：手机/远程面板直 fetch 桌面本机商城源（如 http://127.0.0.1:8787）必失败——
 * 127.0.0.1 指向手机自身（拓扑错位）、http 资源在安全上下文被混合内容拦截。
 * cap.mcp:call 对已鉴权 Remote 放行（token 由 transport 注入），面板 invoke 桥已就绪，
 * MCP 进程跑在桌面宿主侧，本地服务对它天然可达。
 */
async function proxyFetchIndex(url: string): Promise<IndexData> {
  const res = await getInvoke()('router_dispatch', {
    req: {
      target: 'cap.mcp',
      payload: {
        action: 'call',
        mcpServerId: 'marketplace-server',
        tool: 'proxy_fetch',
        arguments: { url },
      },
    },
  }) as DispatchResponse
  if (!res.ok) throw new Error(res.error || 'proxy_fetch 调度失败')
  const result = res.result as { ok?: boolean; resultJson?: string | null; error?: string; isError?: boolean }
  if (result.error) throw new Error(`proxy_fetch: ${result.error}`)
  if (result.isError || !result.resultJson) throw new Error('proxy_fetch 返回空结果（商城源不可达或返回非 JSON）')
  const parsed = JSON.parse(result.resultJson) as { error?: string; data?: IndexData }
  if (parsed.error) throw new Error(parsed.error)
  if (!parsed.data || !Array.isArray(parsed.data.plugins)) throw new Error('proxy_fetch 返回的索引格式无效')
  return parsed.data
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

/**
 * 排序键：
 *   - default=索引原序（平铺或 category 分组内均走原序）
 *   - tier-desc/asc=功能评审排序（tier 缺失按 0，归末尾）
 *   - usage-desc/asc=使用习惯排序（usageTier 缺失按 0，归末尾）
 *   - updated/created=时间排序（升降序）
 */
type SortKey = 'default' | 'tier-desc' | 'tier-asc' | 'usage-desc' | 'usage-asc' | 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc'

/** 排序选项配置（下拉用） */
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'default', label: '默认' },
  { value: 'tier-desc', label: '🔧 功能最高' },
  { value: 'tier-asc', label: '🔧 功能最低' },
  { value: 'usage-desc', label: '⭐ 使用最高' },
  { value: 'usage-asc', label: '⭐ 使用最低' },
  { value: 'updated-desc', label: '最新更新' },
  { value: 'updated-asc', label: '最早更新' },
  { value: 'created-desc', label: '最新创建' },
  { value: 'created-asc', label: '最早创建' },
]

/**
 * 数值评分排序（通用：tier / usageTier）。
 * 缺失按 0 处理，排末尾；同分按名称升序作次序。
 */
function sortByScore(list: MarketPlugin[], field: 'tier' | 'usageTier', dir: 'desc' | 'asc'): MarketPlugin[] {
  const sign = dir === 'desc' ? -1 : 1
  const withScore = list.filter(p => typeof p[field] === 'number' && (p[field] as number) > 0)
  const without = list.filter(p => !(typeof p[field] === 'number' && (p[field] as number) > 0))
  withScore.sort((a, b) => {
    const diff = ((b[field] as number) - (a[field] as number)) * sign
    if (diff !== 0) return diff
    return (a.name || a.id).localeCompare(b.name || b.id)
  })
  without.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
  return [...withScore, ...without]
}

/**
 * 组内/平铺排序。
 * 缺字段兜底：
 *   - 时间排序：updatedAt 缺失 → 回退 createdAt → 再缺失 → 视为"未知"区固定排末尾
 *     （无论升降序都排末尾，避免淹没在最旧区，也避免自定义源旧索引无字段时报错）。
 *   - 评分排序：缺失按 0 处理，排末尾；同分按名称升序作次序。
 */
function sortWithinTier(list: MarketPlugin[], sort: SortKey): MarketPlugin[] {
  if (sort === 'default') return list
  if (sort === 'tier-desc' || sort === 'tier-asc') {
    return sortByScore(list, 'tier', sort === 'tier-desc' ? 'desc' : 'asc')
  }
  if (sort === 'usage-desc' || sort === 'usage-asc') {
    return sortByScore(list, 'usageTier', sort === 'usage-desc' ? 'desc' : 'asc')
  }
  const [field, dir] = sort.split('-') as ['updated' | 'created', 'desc' | 'asc']
  const key = field === 'updated' ? 'updatedAt' : 'createdAt'
  const timeOf = (p: MarketPlugin): number | null => {
    const v = p[key] || (field === 'updated' ? p.createdAt : null)
    if (!v) return null
    const t = new Date(v).getTime()
    return isNaN(t) ? null : t
  }
  const withTime = list.filter(p => timeOf(p) !== null)
  const without = list.filter(p => timeOf(p) === null)
  withTime.sort((a, b) => {
    const ta = timeOf(a)!, tb = timeOf(b)!
    return dir === 'desc' ? tb - ta : ta - tb
  })
  return [...withTime, ...without]
}

/** 把 ISO 时间格式化为 YYYY-MM-DD（列表内降噪） */
function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function MarketplacePanel({ pluginId: _pluginId }: { pluginId: string }) {
  // 商城状态
  const [index, setIndex] = useState<IndexData | null>(null)
  const [mLoading, setMLoading] = useState(true)
  const [mError, setMError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('')
  const [installedFilter, setInstalledFilter] = useState(false)
  const [sort, setSort] = useState<SortKey>('default')
  const [flatView, setFlatView] = useState(true)
  const [selected, setSelected] = useState<MarketPlugin | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
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
          let data: IndexData
          try {
            const res = await fetchWithTimeout(source)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            data = await res.json()
          } catch (directErr) {
            // 直 fetch 失败 → 桌面侧代理中转（cap.mcp:call → proxy_fetch）。
            // 覆盖：手机/远程面板访问桌面本机源（拓扑错位/混合内容）、官方镜像全挂时
            // 借桌面网络旁路。MCP server 不可用（旧版插件/宿主未启动 MCP）时抛原错误。
            try {
              data = await proxyFetchIndex(source)
            } catch {
              throw directErr
            }
          }
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
    setSelected(null); setDetailOpen(false); setSelectedVersion(''); setInstallMsg(null)
    void loadIndex(id)
  }, [loadIndex])

  /** 添加/更新一个用户源并切换过去（同名 URL 去重） */
  const applyIndexSource = useCallback((name: string, url: string) => {
    const entry = upsertSource(name, url)
    setSources(getSources())
    setActiveId(entry.id)
    setActiveSourceId(entry.id)
    setSelected(null); setDetailOpen(false); setSelectedVersion(''); setInstallMsg(null)
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

  // 单视图：挂载即加载索引 + 已装（已装数据供徽标/筛选/详情分流，不再依赖 Tab 切换）
  useEffect(() => { loadIndex() }, [loadIndex])
  useEffect(() => { loadInstalled() }, [loadInstalled])

  const refreshAfterOp = useCallback(async () => {
    await loadInstalled()
    setUpdates({})
  }, [loadInstalled])

  /** 已装判定：商城插件 id 命中已装列表 */
  const isInstalled = useCallback((p: MarketPlugin): InstalledPlugin | undefined =>
    installed.find(i => i.id === p.id), [installed])

  const openDetail = useCallback((p: MarketPlugin) => {
    setSelected(p); setDetailOpen(true); setSelectedVersion(''); setInstallMsg(null)
  }, [])

  const closeDetail = useCallback(() => {
    setDetailOpen(false)
    // 保留 selected 与筛选/搜索态：返回时列表位置与筛选不变，仅收起覆盖层
  }, [])

  const handleInstall = async (p: MarketPlugin, scope: 'user' | 'project') => {
    setInstalling(p.id); setInstallMsg(null)
    const version = selectedVersion && selectedVersion !== p.version ? selectedVersion : undefined
    const r = await installPlugin(p, scope, version)
    setInstallMsg(r.success ? `✓ ${p.name} ${version ? 'v' + version : ''} 安装成功${r.message ? '：' + r.message : ''}` : `✗ 安装失败：${r.error ?? '未知错误'}`)
    setInstalling(null)
    // 安装成功后刷新已装，列表徽标即时更新（原 handleInstall 缺此步，补上）
    if (r.success) await loadInstalled()
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

  const installedCount = installed.filter(p => !p.builtin).length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13, position: 'relative', overflow: 'hidden' }}>
      {/* 顶栏：单一入口「插件市场」+ 刷新；已装筛选态显示「检查全部更新」 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid #3F3F46', flexShrink: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8,
          background: '#3B82F6', color: '#fff', display: 'flex', alignItems: 'center', gap: 5,
        }}>
          🧩 插件市场
          <span style={{ fontSize: 9, background: 'rgba(255,255,255,.2)', padding: '1px 6px', borderRadius: 8 }}>
            {index?.plugins?.length ?? 0}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {installedFilter && installedCount > 0 && (
          <button onClick={handleCheckAll} title="检查全部已装插件更新"
            style={{ ...s.btn, padding: '6px 10px', fontSize: 11, minHeight: 32 }}>
            检查全部更新
          </button>
        )}
        <button onClick={() => void loadIndex()} title="刷新索引"
          style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #3F3F46', background: '#2D2D33', color: '#B4B4B8', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ↻
        </button>
      </div>

      <MarketView
        index={index} loading={mLoading} error={mError}
        query={query} setQuery={setQuery}
        category={category} setCategory={setCategory}
        installedFilter={installedFilter} setInstalledFilter={setInstalledFilter}
        installedCount={installedCount}
        sort={sort} setSort={setSort}
        flatView={flatView} setFlatView={setFlatView}
        selected={selected} detailOpen={detailOpen}
        openDetail={openDetail} closeDetail={closeDetail}
        selectedVersion={selectedVersion} setSelectedVersion={setSelectedVersion}
        installing={installing} installMsg={installMsg} onInstall={handleInstall}
        onReload={() => void loadIndex()}
        sourceUsed={sourceUsed}
        sources={sources} activeSourceId={activeSourceId}
        onSwitchSource={switchSource} onAddSource={applyIndexSource} onDeleteSource={deleteSource}
        installed={installed} isInstalled={isInstalled} updates={updates}
        opLoading={opLoading} opMsg={opMsg}
        onUninstall={handleUninstall} onCheckUpdate={handleCheckUpdate} onApplyUpdate={handleApplyUpdate}
      />
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
  installedFilter: boolean
  setInstalledFilter: (b: boolean) => void
  installedCount: number
  sort: SortKey
  setSort: (s: SortKey) => void
  flatView: boolean
  setFlatView: (b: boolean) => void
  selected: MarketPlugin | null
  detailOpen: boolean
  openDetail: (p: MarketPlugin) => void
  closeDetail: () => void
  selectedVersion: string
  setSelectedVersion: (s: string) => void
  installing: string | null
  installMsg: string | null
  onInstall: (p: MarketPlugin, scope: 'user' | 'project') => void
  onReload: () => void
  sourceUsed: string
  sources: MarketSource[]
  activeSourceId: string
  onSwitchSource: (id: string) => void
  onAddSource: (name: string, url: string) => void
  onDeleteSource: (id: string) => void
  installed: InstalledPlugin[]
  isInstalled: (p: MarketPlugin) => InstalledPlugin | undefined
  updates: Record<string, UpdateResult>
  opLoading: string | null
  opMsg: string | null
  onUninstall: (p: InstalledPlugin) => void
  onCheckUpdate: (p: InstalledPlugin) => void
  onApplyUpdate: (p: InstalledPlugin) => void
}

function MarketView(props: MarketViewProps) {
  const { index, loading, error, query, setQuery, category, setCategory,
    installedFilter, setInstalledFilter, installedCount,
    sort, setSort, flatView, setFlatView,
    selected, detailOpen, openDetail, closeDetail,
    selectedVersion, setSelectedVersion,
    installing, installMsg, onInstall, onReload,
    sourceUsed, sources, activeSourceId, onSwitchSource, onAddSource, onDeleteSource,
    installed, isInstalled, updates, opLoading, opMsg,
    onUninstall, onCheckUpdate, onApplyUpdate } = props

  // —— 派生数据（所有 hooks 必须在条件 return 之前，否则跨渲染 hook 数量
  //     不一致 → React Rules of Hooks 违规 #310）——
  const plugins = index?.plugins ?? []
  const categories = Array.from(new Set(plugins.map(p => p.category).filter(Boolean) as string[]))

  // 过滤：分类 + 已装 + 搜索（全部叠加）
  const filtered = useMemo(() => {
    return plugins.filter(p => {
      if (category && p.category !== category) return false
      if (installedFilter && !installed.some(i => i.id === p.id)) return false
      if (query.trim()) {
        const q = query.toLowerCase()
        const hay = [p.id, p.name, p.description, (p.tags || []).join(' ')].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [plugins, category, installedFilter, query, installed])

  // 分组（按 category）或平铺，均经 sortWithinTier 组内/整体排序
  const groupedByCategory = useMemo(() => {
    const groups: Record<string, MarketPlugin[]> = {}
    for (const p of filtered) {
      const key = p.category || '未分类'
      ;(groups[key] || (groups[key] = [])).push(p)
    }
    for (const k of Object.keys(groups)) groups[k] = sortWithinTier(groups[k], sort)
    return groups
  }, [filtered, sort])

  // 平铺：整体走 sortWithinTier（default 时保持索引原序）
  const flatList = useMemo(() => sortWithinTier(filtered, sort), [filtered, sort])

  const categoryOrder = Object.keys(groupedByCategory).sort((a, b) => a.localeCompare(b))
  const hasAny = flatView ? flatList.length > 0 : categoryOrder.some(c => groupedByCategory[c].length > 0)
  // 时间行仅在时间排序时显示（评分排序不显示时间）
  const showTime = sort.startsWith('updated') || sort.startsWith('created')
  const timeField = sort.startsWith('updated') ? 'updated' : 'created'

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* 工具栏：搜索 + 平铺/分组切换一行 */}
      <div style={{ padding: '8px 10px', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索插件名称、ID、标签…"
          style={{ flex: 1, minWidth: 0, padding: '7px 8px', background: '#25252B', border: '1px solid #3F3F46', borderRadius: 6, color: '#F8F8F8', fontSize: 12, outline: 'none' }} />
        <button onClick={() => setFlatView(true)} title="平铺（不分组）"
          style={{ fontSize: 10, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 32,
            border: `1px solid ${flatView ? '#3B82F6' : '#3F3F46'}`, background: flatView ? '#3B82F622' : '#2D2D33',
            color: flatView ? '#3B82F6' : '#8E8E93' }}>平铺</button>
        <button onClick={() => setFlatView(false)} title="按分类分组"
          style={{ fontSize: 10, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 32,
            border: `1px solid ${!flatView ? '#3B82F6' : '#3F3F46'}`, background: !flatView ? '#3B82F622' : '#2D2D33',
            color: !flatView ? '#3B82F6' : '#8E8E93' }}>分组</button>
      </div>

      {/* 商城源切换条（常驻，快速回）：官方 + 用户源 chips + 添加 */}
      <SourceBar sources={sources} activeSourceId={activeSourceId}
        onSwitchSource={onSwitchSource} onAddSource={onAddSource} onDeleteSource={onDeleteSource} sourceUsed={sourceUsed} />

      {/* 筛选 chips 行：状态 + 分类（手机端横滑） */}
      <div style={{ padding: '0 10px 6px', display: 'flex', gap: 4, alignItems: 'center', overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: '#6B7280', marginRight: 1, flexShrink: 0 }}>状态</span>
        <FilterChip active={!installedFilter} onClick={() => setInstalledFilter(false)} label="全部" color="#6B7280" />
        <FilterChip active={installedFilter} onClick={() => setInstalledFilter(true)} label={`已装 ${installedCount}`} color="#34D399" />
        <span style={{ width: 1, height: 12, background: '#3F3F46', flexShrink: 0, margin: '0 2px' }} />
        <span style={{ fontSize: 9, color: '#6B7280', marginRight: 1, flexShrink: 0 }}>分类</span>
        <FilterChip active={!category} onClick={() => setCategory('')} label="全部" color="#6B7280" />
        {categories.map(c => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)} label={c} color={CATEGORY_COLORS[c] || '#6B7280'} />
        ))}
      </div>

      {/* 排序行 */}
      <div style={{ padding: '2px 10px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: '#6B7280' }}>排序</span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${sort === 'default' ? '#3F3F46' : '#3B82F6'}`,
              background: sort === 'default' ? '#25252B' : '#3B82F622',
              color: sort === 'default' ? '#B4B4B8' : '#3B82F6',
              outline: 'none',
            }}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <span style={{ fontSize: 10, color: '#6B7280' }}>{filtered.length} 个{installedFilter ? '（已装）' : ''}</span>
      </div>

      {/* 操作结果提示条 */}
      {opMsg && (
        <div style={{ padding: '6px 10px', fontSize: 11, color: opMsg.startsWith('✓') ? '#10B981' : '#EF4444', borderBottom: '1px solid #3F3F46', flexShrink: 0 }}>
          {opMsg}
        </div>
      )}

      {/* 列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 12px' }}>
        {!hasAny ? (
          <div style={{ padding: 24, color: '#8E8E93', textAlign: 'center' }}>未找到匹配插件</div>
        ) : flatView ? (
          flatList.map(p => (
            <MarketItem
              key={p.id}
              plugin={p}
              installedInfo={isInstalled(p)}
              updateInfo={updates[p.id]}
              selected={selected?.id === p.id}
              onClick={() => openDetail(p)}
              showTime={showTime}
              timeField={timeField}
            />
          ))
        ) : (
          categoryOrder.map(cat => {
            const list = groupedByCategory[cat]
            if (list.length === 0) return null
            const color = CATEGORY_COLORS[cat] || '#6B7280'
            return (
              <div key={cat} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <span style={{ color }}>{cat}</span>
                  <span style={{ color: '#6B7280', fontWeight: 400, marginLeft: 4 }}>· {list.length}</span>
                </div>
                {list.map(p => (
                  <MarketItem
                    key={p.id}
                    plugin={p}
                    installedInfo={isInstalled(p)}
                    updateInfo={updates[p.id]}
                    selected={selected?.id === p.id}
                    onClick={() => openDetail(p)}
                    showTime={showTime}
                    timeField={timeField}
                  />
                ))}
              </div>
            )
          })
        )}
      </div>

      {/* 详情 push 覆盖层（面板内全屏，从右滑入；‹ 返回保留筛选/搜索态） */}
      {selected && (
        <DetailPanel
          plugin={selected}
          installedInfo={isInstalled(selected)}
          updateInfo={updates[selected.id]}
          open={detailOpen}
          selectedVersion={selectedVersion}
          setSelectedVersion={setSelectedVersion}
          installing={installing}
          installMsg={installMsg}
          opLoading={opLoading}
          onClose={closeDetail}
          onInstall={onInstall}
          onUninstall={onUninstall}
          onCheckUpdate={onCheckUpdate}
          onApplyUpdate={onApplyUpdate}
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
      {/* 源 chips 条（快速回）：官方 + 用户源 + 添加（手机端横滑） */}
      <div style={{ padding: '0 10px 8px', display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: '#6B7280', marginRight: 2, flexShrink: 0 }}>源</span>
        {sources.map(src => {
          const active = src.id === activeSourceId
          const isOfficial = src.id === OFFICIAL_SOURCE_ID
          return (
            <span key={src.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <button
                onClick={() => onSwitchSource(src.id)}
                title={src.url || '官方多镜像'}
                style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 10, cursor: 'pointer', minHeight: 28,
                  border: `1px solid ${active ? '#3B82F6' : '#3F3F46'}`,
                  background: active ? '#3B82F622' : 'transparent',
                  color: active ? '#3B82F6' : '#8E8E93',
                  whiteSpace: 'nowrap',
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
          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, cursor: 'pointer', border: '1px dashed #3F3F46', background: 'transparent', color: '#6B7280', whiteSpace: 'nowrap', flexShrink: 0 }}>+ 添加源</button>
      </div>

      {/* 添加源表单 */}
      {adding && (
        <div style={{ margin: '0 10px 8px', padding: 10, borderRadius: 8, background: '#1F1F24', border: '1px solid #3F3F46', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#B4B4B8', fontWeight: 600 }}>添加商城源</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={sourceNameDraft}
              onChange={e => setSourceNameDraft(e.target.value)}
              placeholder="名称（可选，如 本地商城）"
              style={{ width: '32%', minWidth: 120, padding: '5px 8px', background: '#25252B', border: '1px solid #3F3F46', borderRadius: 6, color: '#F8F8F8', fontSize: 11, outline: 'none' }}
            />
            <input
              value={sourceDraft}
              onChange={e => setSourceDraft(e.target.value)}
              placeholder="索引 URL（必填，http/https），如 http://127.0.0.1:8787/index.json"
              style={{ flex: 1, minWidth: 200, padding: '5px 8px', background: '#25252B', border: '1px solid #3F3F46', borderRadius: 6, color: '#F8F8F8', fontSize: 11, outline: 'none', wordBreak: 'break-all' }}
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

function MarketItem({ plugin, installedInfo, updateInfo, selected, onClick, showTime, timeField }: {
  plugin: MarketPlugin
  installedInfo: InstalledPlugin | undefined
  updateInfo: UpdateResult | undefined
  selected: boolean
  onClick: () => void
  showTime: boolean
  timeField: 'updated' | 'created'
}) {
  // 时间行：依据当前排序字段取对应时间；updatedAt 缺失回退 createdAt
  const timeVal = showTime
    ? (timeField === 'updated' ? (plugin.updatedAt || plugin.createdAt) : plugin.createdAt)
    : undefined

  // 徽标：已装 → 「已装 vX」或金色「↑ 可更新至 vX」；未装 → 无 tier 徽标（状态优先）
  const hasUpdate = updateInfo?.updateAvailable
  const renderStatusBadge = () => {
    if (installedInfo) {
      if (hasUpdate) {
        return (
          <span style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 4, flexShrink: 0, fontWeight: 600,
            background: '#F5B73D22', color: '#F5B73D', border: '1px solid #F5B73D44',
          }}>↑ 可更新至 v{plugin.version}</span>
        )
      }
      return (
        <span style={{
          fontSize: 9, padding: '1px 6px', borderRadius: 4, flexShrink: 0, fontWeight: 600,
          background: '#34D39922', color: '#34D399', border: '1px solid #34D39944',
        }}>✓ 已装 v{installedInfo.version}</span>
      )
    }
    return null
  }

  // 两个独立评分徽标：🔧 功能（tier）/ ⭐ 使用（usageTier），各自缺失不显示
  const tierScore = plugin.tier
  const showTier = typeof tierScore === 'number' && tierScore > 0
  const usageScore = plugin.usageTier
  const showUsage = typeof usageScore === 'number' && usageScore > 0

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 10, padding: 10, borderRadius: 8, cursor: 'pointer', minHeight: 48,
        marginBottom: 6, border: `1px solid ${selected ? '#3B82F6' : 'transparent'}`,
        background: selected ? '#2D2D33' : '#25252B',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = '#2A2A30' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = '#25252B' }}
    >
      {/* 左侧图标 */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 14, flexShrink: 0, marginTop: 2,
        background: '#3B82F622', color: '#3B82F6',
      }}>
        {plugin.icon === 'BookOpen' ? '📖' : plugin.icon === 'Terminal' ? '⚡' : plugin.icon === 'Target' ? '🎯' : plugin.icon === 'Beaker' ? '🧪' : plugin.icon === 'Activity' ? '📊' : plugin.icon === 'GitPullRequest' ? '🔀' : plugin.icon === 'Bot' ? '🤖' : '🧩'}
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#F8F8F8' }}>{plugin.name}</span>
          <span style={{ fontSize: 10, color: '#6B7280' }}>v{plugin.version}</span>
          {renderStatusBadge()}
          {/* 评分徽标靠右挤齐 */}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            {showTier && (
              <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(tierScore) }}>🔧{tierScore}</span>
            )}
            {showUsage && (
              <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(usageScore) }}>⭐{usageScore}</span>
            )}
          </span>
        </div>
        {plugin.description && (
          <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 3, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {plugin.description}
          </div>
        )}
        {/* 时间行：仅时间排序时显示，让排序依据可视化 */}
        {showTime && (
          timeVal ? (
            <div style={{ fontSize: 9, color: '#6B7280', marginTop: 4 }}>
              {timeField === 'updated' ? '更新于' : '创建于'} {fmtDate(timeVal)}
            </div>
          ) : (
            <div style={{ fontSize: 9, color: '#EF4444', fontStyle: 'italic', marginTop: 4 }}>
              ⓘ 时间未知（索引缺字段，兜底归入末尾）
            </div>
          )
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

/* ---------- 详情面板（push 覆盖层） ---------- */

function DetailPanel({ plugin, installedInfo, updateInfo, open, selectedVersion, setSelectedVersion, installing, installMsg, opLoading, onClose, onInstall, onUninstall, onCheckUpdate, onApplyUpdate }: {
  plugin: MarketPlugin
  installedInfo: InstalledPlugin | undefined
  updateInfo: UpdateResult | undefined
  open: boolean
  selectedVersion: string
  setSelectedVersion: (s: string) => void
  installing: string | null
  installMsg: string | null
  opLoading: string | null
  onClose: () => void
  onInstall: (p: MarketPlugin, scope: 'user' | 'project') => void
  onUninstall: (p: InstalledPlugin) => void
  onCheckUpdate: (p: InstalledPlugin) => void
  onApplyUpdate: (p: InstalledPlugin) => void
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

  const isInstalled = !!installedInfo
  const hasUpdate = updateInfo?.updateAvailable
  const checking = updateInfo?.checking || opLoading === `check-${plugin.id}`
  const applying = opLoading === `apply-${plugin.id}`
  const uninstalling = opLoading === `uninstall-${plugin.id}`
  const tierScore = plugin.tier
  const showTier = typeof tierScore === 'number' && tierScore > 0
  const usageScore = plugin.usageTier
  const showUsage = typeof usageScore === 'number' && usageScore > 0

  const permList = plugin.permissions
    ? Object.entries(plugin.permissions).filter(([, v]) => v).map(([k]) => k)
    : []

  // 已装来源描述
  const sourceDesc = installedInfo?.source?.kind
    ? (installedInfo.source.kind === 'user' ? 'User 安装' : installedInfo.source.kind === 'project' ? 'Project 安装' : installedInfo.source.kind)
    : installedInfo?.builtin ? '内置' : '—'

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20, background: '#1C1C24',
      transform: open ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* 顶栏：‹ 返回 + 名称 */}
      <div style={{ padding: 10, borderBottom: '1px solid #3F3F46', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onClose} title="返回"
          style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#2D2D33', color: '#B4B4B8', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          ‹
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plugin.name}</div>
          <div style={{ fontSize: 10, color: '#6B7280' }}>{plugin.id} · v{plugin.version}</div>
        </div>
      </div>

      {/* 详情主体 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* hero：图标 + 名称 + 徽标 + 评分 */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 24, flexShrink: 0,
            background: '#3B82F622', color: '#3B82F6',
          }}>
            {plugin.icon === 'BookOpen' ? '📖' : plugin.icon === 'Terminal' ? '⚡' : plugin.icon === 'Target' ? '🎯' : plugin.icon === 'Beaker' ? '🧪' : plugin.icon === 'Activity' ? '📊' : plugin.icon === 'GitPullRequest' ? '🔀' : plugin.icon === 'Bot' ? '🤖' : '🧩'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{plugin.name}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              {isInstalled && (
                <>
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 600, background: '#34D39922', color: '#34D399', border: '1px solid #34D39944' }}>已装 v{installedInfo!.version}</span>
                  {hasUpdate && (
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 600, background: '#F5B73D22', color: '#F5B73D', border: '1px solid #F5B73D44' }}>↑ 可更新至 v{plugin.version}</span>
                  )}
                </>
              )}
              {showTier && (
                <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(tierScore) }}>🔧 功能 {tierScore}/10</span>
              )}
              {showUsage && (
                <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(usageScore) }}>⭐ 使用 {usageScore}/10</span>
              )}
            </div>
          </div>
        </div>

        {/* 描述 */}
        {plugin.description && (
          <div style={{ fontSize: 12, color: '#B4B4B8', lineHeight: 1.6 }}>{plugin.description}</div>
        )}

        {/* 信息行表（ID/当前版本/最新版本/来源/分类/创建/更新/权限） */}
        <div style={{ border: '1px solid #3F3F46', borderRadius: 8, overflow: 'hidden' }}>
          <InfoRow k="ID" v={plugin.id} />
          <InfoRow k="最新版本" v={`v${plugin.version}`} />
          {isInstalled && (
            <InfoRow k="当前版本" v={`v${installedInfo!.version}${hasUpdate ? `（最新 v${plugin.version}）` : ''}`} />
          )}
          {isInstalled && <InfoRow k="来源" v={sourceDesc} />}
          <InfoRow k="分类" v={plugin.category || '—'} />
          {showTier && <InfoRow k="🔧 功能评分" v={`${tierScore}/10`} />}
          {showUsage && <InfoRow k="⭐ 使用评分" v={`${usageScore}/10`} />}
          <InfoRow k="创建时间" v={plugin.createdAt ? fmtDate(plugin.createdAt) : '（未记录）'} />
          <InfoRow k="最后更新" v={plugin.updatedAt ? fmtDate(plugin.updatedAt) : '（未记录）'} />
          {/* 权限行 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', fontSize: 10, borderBottom: 'none', gap: 10 }}>
            <span style={{ color: '#6B7280', flexShrink: 0 }}>权限</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {permList.length > 0 ? permList.map(k => (
                <span key={k} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#F0616D1A', color: '#F0616D' }}>{k}</span>
              )) : <span style={{ fontSize: 9, color: '#6B7280' }}>无特殊权限</span>}
            </div>
          </div>
        </div>

        {/* 版本选择器（仅未装时显示） */}
        {!isInstalled && allVersions.length > 1 && (
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

        {/* 操作结果提示 */}
        {(installMsg || (updateInfo && !updateInfo.checking)) && (
          <div style={{ fontSize: 11, padding: '6px 8px', borderRadius: 4, lineHeight: 1.5,
            background: (installMsg || updateInfo?.error || updateInfo?.updateAvailable) ? (installMsg?.startsWith('✓') || updateInfo?.updateAvailable ? '#10B98122' : '#EF444422') : '#3F3F46',
            color: installMsg ? (installMsg.startsWith('✓') ? '#10B981' : '#EF4444')
              : updateInfo?.error ? '#EF4444'
              : updateInfo?.updateAvailable ? '#10B981' : '#8E8E93' }}>
            {installMsg || (updateInfo?.error ? `检查失败：${updateInfo.error}`
              : updateInfo?.updateAvailable ? `↑ 有更新：${updateInfo.currentVersion} → ${updateInfo.latestVersion}`
              : `✓ 已是最新（${updateInfo?.currentVersion}）`)}
          </div>
        )}

        {/* 操作区：按安装状态分流 */}
        {isInstalled ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 16 }}>
            <button onClick={() => onCheckUpdate(installedInfo!)} disabled={checking || applying || uninstalling}
              style={{ ...s.btn, flex: 1, minWidth: 96, minHeight: 40, opacity: checking ? 0.6 : 1 }}>
              {checking ? '检查中…' : '检查更新'}
            </button>
            <button onClick={() => onApplyUpdate(installedInfo!)} disabled={!hasUpdate || applying || uninstalling}
              style={{ ...s.btn, flex: 1, minWidth: 96, minHeight: 40, background: applying ? '#3B82F644' : '#3B82F622', color: '#3B82F6', borderColor: '#3B82F6', opacity: (!hasUpdate || applying) ? 0.5 : 1, fontWeight: 600 }}>
              {applying ? '更新中…' : '↑ 应用更新'}
            </button>
            <button onClick={() => onUninstall(installedInfo!)} disabled={checking || applying || uninstalling}
              style={{ ...s.btn, flex: 1, minWidth: 96, minHeight: 40, color: '#F0616D', borderColor: '#7F1D1D', opacity: uninstalling ? 0.6 : 1 }}>
              {uninstalling ? '卸载中…' : '卸载'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 16 }}>
            <button onClick={() => onInstall(plugin, 'user')} disabled={installing === plugin.id}
              style={{ ...s.btn, flex: 1, minWidth: 96, minHeight: 40, background: '#3B82F6', borderColor: '#3B82F6', color: '#fff', fontWeight: 600, opacity: installing === plugin.id ? 0.6 : 1 }}>
              {installing === plugin.id ? '安装中…' : `⬇ 安装到 User${currentVersion !== plugin.version ? ' (v' + currentVersion + ')' : ''}`}
            </button>
            <button onClick={() => onInstall(plugin, 'project')} disabled={installing === plugin.id}
              style={{ ...s.btn, flex: 1, minWidth: 96, minHeight: 40, opacity: installing === plugin.id ? 0.6 : 1 }}>
              安装到 Project{currentVersion !== plugin.version ? ' (v' + currentVersion + ')' : ''}
            </button>
          </div>
        )}

        {/* 二期预留：启用/停用、端口管理（D10，不实现宿主侧逻辑） */}
        {/*
          <div style={{ display:'flex', gap:8 }}>
            <button>启用/停用</button>
            <button>端口管理</button>
          </div>
        */}

        {/* 未装时显示下载地址 */}
        {!isInstalled && plugin.downloadUrl && (
          <div style={{ fontSize: 9, color: '#6B7280', wordBreak: 'break-all', lineHeight: 1.4 }}>
            {currentVersion !== plugin.version
              ? allVersions.find(v => v.version === currentVersion)?.downloadUrl || plugin.downloadUrl
              : plugin.downloadUrl}
          </div>
        )}
      </div>
    </div>
  )
}

/** 信息行表的一行（k-v，带分隔线） */
function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', fontSize: 10, borderBottom: '1px solid #3F3F46', gap: 10 }}>
      <span style={{ color: '#6B7280', flexShrink: 0 }}>{k}</span>
      <span style={{ color: '#B4B4B8', textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
    </div>
  )
}

/* ========================================================================
   小组件
   ======================================================================== */

function FilterChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 10, padding: '3px 8px', borderRadius: 12, cursor: 'pointer', minHeight: 28,
      border: `1px solid ${active ? color : '#3F3F46'}`,
      background: active ? color + '22' : 'transparent',
      color: active ? color : '#8E8E93',
      whiteSpace: 'nowrap', flexShrink: 0,
      transition: 'background 0.15s, color 0.15s',
    }}>{label}</button>
  )
}
