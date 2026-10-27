/**
 * 通信层 + 数据访问（口袋快传面板）
 *
 * 键空间契约（与 service/main.js、mcp/server.js 三方一致，权威描述见 README）：
 *   pdrop.settings            设置（面板/MCP 写，服务读；服务仅在缺失时引导写默认）
 *   pdrop.meta                服务心跳（服务写，60s）
 *   pdrop.items               投递清单投影（服务单写者；本地 meta.json 为权威）
 *   pdrop.cmd.<op>.<nonce>    命令键（面板/MCP 写，服务消费=先删后做）
 *   pdrop.result.<nonce>      命令结果（服务写，消费方读后删）
 *   pdrop.event.<13位ts>      事件流（服务写，保留 50 条）
 */
import { getHostInvoke } from './host'
// shared core 是三端口径的单一权威（尺寸/TTL 文案与手机页、MCP 输出一致）
import { formatBytes as coreFmtBytes, ttlLabel as coreTtlLabel } from '../shared/core.js'

export const fmtBytes = (n: number | undefined): string => coreFmtBytes(n as number)
export const ttlLabel = (expiresAt: number, now = Date.now()): string => coreTtlLabel(expiresAt, now)

export const PLUGIN_ID = 'pocket-drop'
export const SERVICE_ID = 'drop-service'
export const SERVICE_PORT = 9867

// ── 类型（与 service/main.js 写入结构对齐）─────────────────────────────────
export interface DropItem {
  id: string
  name: string
  size: number
  at: number
  expiresAt: number
  from: 'phone' | 'desktop' | 'ai'
  note?: string
}

export interface DropSettings {
  pin: string
  ttlHours: number
  maxSizeMb: number
  totalCapMb: number
}

export interface DropMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  degraded?: boolean
  port?: number
  lanUrl?: string
  lanUrls?: string[]
  dropDir?: string
  itemCount?: number
  storeBytes?: number
  settings?: DropSettings
}

export interface DropEvent {
  type: string
  at: number
  summary: string
}

// ── cap 通道 ───────────────────────────────────────────────────────────────
async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const invoke = getHostInvoke()
  const res = await invoke<{ ok: boolean; result?: T; error?: string }>(
    'router_dispatch', { req: { target, payload } },
  )
  if (!res || res.ok !== true) throw new Error((res && res.error) || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const r = await capDispatch<{ value?: T }>('cap.kv', { action: 'get', key }).catch(() => null)
  return r && r.value !== undefined ? r.value : null
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}
export async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key })
}
export async function kvKeys(): Promise<string[]> {
  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' })
  return Array.isArray(r.keys) ? r.keys : []
}

// ── 业务读取 ───────────────────────────────────────────────────────────────
export async function getMeta(): Promise<DropMeta | null> {
  return kvGet<DropMeta>('pdrop.meta')
}
export async function getItems(): Promise<DropItem[]> {
  const v = await kvGet<{ at: number; items: DropItem[] }>('pdrop.items')
  return v && Array.isArray(v.items) ? v.items : []
}
export async function getSettings(): Promise<DropSettings | null> {
  const v = await kvGet<DropSettings>('pdrop.settings')
  return v && typeof v === 'object' ? v : null
}
export async function saveSettings(s: DropSettings): Promise<void> {
  await kvSet('pdrop.settings', s)
}

export async function getEvents(limit = 50): Promise<DropEvent[]> {
  const keys = (await kvKeys()).filter((k) => k.startsWith('pdrop.event.')).sort().reverse().slice(0, limit)
  const out: DropEvent[] = []
  for (const k of keys) {
    const e = await kvGet<DropEvent>(k)
    if (e && typeof e === 'object') out.push(e)
  }
  return out
}

/** 写命令键并等结果（服务 tick 4s；15s 兜底） */
export async function sendCommand<T = { ok: boolean; error?: string; itemId?: string; dest?: string; count?: number; name?: string }>(
  op: string, payload: Record<string, unknown>, timeoutMs = 15000,
): Promise<T> {
  const nonce = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e8).toString(36)}`
  const resultKey = `pdrop.result.${nonce}`
  await kvSet(`pdrop.cmd.${op}.${nonce}`, { op, nonce, ...payload, at: Date.now() })
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const r = await kvGet<T>(resultKey)
    if (r && typeof r === 'object') { await kvDel(resultKey).catch(() => {}); return r }
    if (Date.now() > deadline) throw new Error('服务未在 15 秒内响应（可能未运行：去下方服务管理卡启动）')
    await new Promise((res) => setTimeout(res, 700))
  }
}

// ── 服务管理（cap.pluginServiceManager；start 需 discover 自举）────────────
export interface ServiceStatusRow {
  pluginId?: string
  serviceId?: string
  id?: string
  status?: string | boolean
  running?: boolean
  lastError?: string
}

export async function listServiceStatus(): Promise<ServiceStatusRow[]> {
  const r = await capDispatch<unknown>('cap.pluginServiceManager', { action: 'list_status' })
  return Array.isArray(r) ? (r as ServiceStatusRow[]) : []
}

interface DiscoverResponse {
  plugins?: Array<{
    id: string
    installPath: string
    contributes?: { services?: Record<string, unknown>[] }
  }>
}

/** start 必须带 installPath + contribution（后端 toBackendContribution 形态，缺字段=启动失败） */
export async function serviceStart(): Promise<void> {
  const disc = await capDispatch<DiscoverResponse>('cap.pluginDiscovery', { action: 'discover' })
  const self = (disc.plugins ?? []).find((p) => p.id === PLUGIN_ID)
  if (!self) throw new Error('插件发现里找不到 pocket-drop（插件未正确安装？）')
  const svc = self.contributes?.services?.find((s) => s.id === SERVICE_ID)
  if (!svc) throw new Error('manifest 里没有 drop-service 服务贡献')
  await capDispatch('cap.pluginServiceManager', {
    action: 'start',
    pluginId: PLUGIN_ID,
    installPath: self.installPath,
    contribution: {
      id: SERVICE_ID,
      type: (svc.type as string) ?? (svc.serviceType as string) ?? 'http',
      command: svc.command,
      argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
      port: svc.port ?? null,
      healthCheck: svc.healthCheck ?? null,
      healthCheckTimeout: svc.healthCheckTimeout ?? null,
      autoStart: svc.autoStart ?? true,
      restartOnFailure: svc.restartOnFailure ?? true,
      maxRestarts: svc.maxRestarts ?? 10,
      description: svc.description ?? null,
    },
  })
}

export async function serviceAction(action: 'stop' | 'restart'): Promise<void> {
  await capDispatch('cap.pluginServiceManager', { action, pluginId: PLUGIN_ID, serviceId: SERVICE_ID })
}

// ── 服务 HTTP 直连（127.0.0.1，localhost 免混合内容；CORS 由自家服务放行）──
export function serviceBase(meta: DropMeta | null): string {
  return `http://127.0.0.1:${(meta && meta.port) || SERVICE_PORT}`
}

/** 上传一个文件（XHR 带进度）。失败抛错——调用方给出替代路径指引 */
export function uploadFile(base: string, pin: string, file: File, onProgress?: (pct: number) => void): Promise<DropItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${base}/u?pin=${encodeURIComponent(pin)}&name=${encodeURIComponent(file.name || '未命名文件')}`)
    xhr.setRequestHeader('x-drop-from', 'desktop')
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) onProgress(Math.round((ev.loaded / ev.total) * 100))
    }
    xhr.onload = () => {
      let j: { ok?: boolean; item?: DropItem; error?: string } = {}
      try { j = JSON.parse(xhr.responseText) } catch (_) { /* 非 JSON */ }
      if (xhr.status === 200 && j.ok && j.item) resolve(j.item)
      else reject(new Error(j.error || `HTTP ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('网络错误（服务未运行或被 webview 拦截）'))
    xhr.send(file)
  })
}

/** 删除投递条目 */
export async function deleteItem(base: string, pin: string, id: string): Promise<void> {
  const res = await fetch(`${base}/f/${id}?pin=${encodeURIComponent(pin)}`, { method: 'DELETE' })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j.error || `HTTP ${res.status}`)
  }
}

/** 下载投递条目到本地（blob → 触发浏览器保存） */
export async function downloadItem(base: string, pin: string, it: DropItem): Promise<void> {
  const res = await fetch(`${base}/f/${it.id}?pin=${encodeURIComponent(pin)}&dl=1`)
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j.error || `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = it.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

// ── 工具 ───────────────────────────────────────────────────────────────────
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (_) {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch (_) {
      return false
    }
  }
}

export function timeAgo(ts: number | undefined, now = Date.now()): string {
  if (!ts) return '从未'
  const d = Math.max(0, now - ts)
  if (d < 10_000) return '刚刚'
  if (d < 60_000) return `${Math.floor(d / 1000)} 秒前`
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分钟前`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小时前`
  return `${Math.floor(d / 86_400_000)} 天前`
}

export function icoFor(name: string): string {
  const ext = name.toLowerCase().split('.').pop() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic'].includes(ext)) return '🖼️'
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return '🎬'
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return '🎵'
  if (ext === 'pdf') return '📕'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️'
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext)) return '📄'
  return '📦'
}
