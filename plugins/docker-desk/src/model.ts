/**
 * model.ts —— 面板侧 service API 客户端
 *
 * 发现链：宿主 kv `dkd.service` {port, token} → 直连 http://127.0.0.1:<port>。
 * 401/网络错误 → 失效缓存重读 kv 再试一次（服务重启端口漂移的自愈路径）。
 */
import { kvGet } from './host'

export interface ServiceInfo {
  port: number
  token: string
  startedAt?: number
  version?: string
  updatedAt?: number
}

export interface PortMap { IP?: string; PrivatePort: number; PublicPort?: number; Type: string }

export interface ContainerItem {
  id: string
  name: string
  image: string
  state: string
  stateText: string
  running: boolean
  status: string
  createdAt: number | null
  age: string
  ports: string[]
  composeProject: string
  composeService: string
}

export interface ComposeGroup { name: string; running: number; total: number; items: ContainerItem[] }

export interface Grouped { projects: ComposeGroup[]; loose: ContainerItem[] }

export interface EngineEndpoint { kind: string; target: string }

export interface EngineInfo {
  status: 'ok' | 'absent'
  endpoint: EngineEndpoint
  apiVersion?: string
  daemonVersion?: string
  os?: string
  osType?: string
  arch?: string
  error?: string
  code?: string
  version?: string
  eventsBuffered?: number
  pumpRunning?: boolean
  runningContainers?: number
  totalContainers?: number
  serviceUptimeMs?: number
}

export interface StatsSnap {
  name: string
  id: string
  cpuPct: number
  memUsed: number | null
  memLimit: number | null
  memPct: number | null
  netRx: number | null
  netTx: number | null
  blkRead: number | null
  blkWrite: number | null
}

export interface ImageItem {
  id: string
  repo: string
  tag: string
  tags: string[]
  size: number | null
  created: number | null
  containers: number
}

export interface DfSummary {
  imagesCount: number; imagesSize: number; danglingCount: number
  containersCount: number; containersSize: number
  volumesCount: number; volumesSize: number
  buildCacheCount: number; reclaimable: number; reclaimImages: number; reclaimBuildCache: number
}

export interface EventItem { time: number; type: string; action: string; actor: string; attrs: Record<string, string> }

export interface LogLine { stream: 'stdout' | 'stderr'; text: string }

export interface ContainersResp { ok: boolean; error?: string; engine?: EngineInfo; items?: ContainerItem[]; grouped?: Grouped }

export interface SelftestCheck { name: string; ok: boolean; detail: string }
export interface SelftestResp { ok: boolean; selftest?: { checks: SelftestCheck[]; passed: number; total: number; engineStatus?: string; at?: number } }

const KV_SERVICE = 'dkd.service'
const INFO_TTL_MS = 30000

let cached: { info: ServiceInfo; at: number } | null = null

export function invalidateService() { cached = null }

async function discover(): Promise<ServiceInfo | null> {
  const v = await kvGet<ServiceInfo>(KV_SERVICE)
  // 心跳过期（service 每 30s 心跳；被强杀时 kv 残留记录的 updatedAt 停滞）
  if (v && Number.isFinite(v.port) && typeof v.token === 'string' && v.token
    && !(v.updatedAt && Date.now() - v.updatedAt > 90000)) return v
  return null
}

export class ServiceError extends Error {
  kind: 'no-service' | 'http' | 'engine'
  detail?: string
  constructor(kind: ServiceError['kind'], message: string, detail?: string) {
    super(message)
    this.kind = kind
    this.detail = detail
  }
}

async function ensureInfo(): Promise<ServiceInfo> {
  if (cached && Date.now() - cached.at <= INFO_TTL_MS) return cached.info
  const info = await discover()
  if (!info) {
    throw new ServiceError('no-service', '后台服务未就绪（面板打开几秒后自动重试；若持续出现请重启 Polaris）')
  }
  cached = { info, at: Date.now() }
  return info
}

async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, retry = true): Promise<T> {
  const info = await ensureInfo()
  const base = `http://127.0.0.1:${info.port}`
  let resp: Response
  try {
    resp = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${info.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    // 连接失败大概率是服务重启端口漂移：失效缓存重试一次
    invalidateService()
    if (retry) return request<T>(method, path, body, false)
    throw new ServiceError('http', `无法连接后台服务（${(e as Error).message}）`)
  }
  if (resp.status === 401 && retry) {
    invalidateService()
    return request<T>(method, path, body, false)
  }
  let parsed: { ok?: boolean; error?: string; engine?: EngineInfo } | null = null
  try { parsed = (await resp.json()) as { ok?: boolean; error?: string; engine?: EngineInfo } } catch (_) { /* 非 JSON */ }
  if (!resp.ok || (parsed && parsed.ok === false)) {
    const msg = (parsed && parsed.error) || `HTTP ${resp.status}`
    throw new ServiceError('engine', msg)
  }
  return parsed as T
}

export const api = {
  engine: () => request<{ ok: boolean; engine: EngineInfo; events?: { buffered: number; pumpRunning: boolean } }>('GET', '/api/engine'),
  containers: (all = true) => request<ContainersResp>('GET', `/api/containers?all=${all ? '1' : '0'}`),
  containerAction: (id: string, action: 'start' | 'stop' | 'restart', timeout?: number) =>
    request<{ ok: boolean }>('POST', `/api/containers/${encodeURIComponent(id)}/${action}`, timeout !== undefined ? { timeout } : {}),
  containerRemove: (id: string, confirm: string, force: boolean) =>
    request<{ ok: boolean }>('POST', `/api/containers/${encodeURIComponent(id)}/remove`, { confirm, force }),
  inspect: (id: string) => request<{ ok: boolean; name: string; inspect: Record<string, unknown> }>('GET', `/api/containers/${encodeURIComponent(id)}/inspect`),
  statsAll: () => request<{ ok: boolean; items: StatsSnap[] }>('GET', '/api/stats'),
  statsOne: (id: string) => request<{ ok: boolean; items: StatsSnap[] }>('GET', `/api/stats?nameOrId=${encodeURIComponent(id)}`),
  logsOnce: (id: string, tail: number) => request<{ ok: boolean; lines: LogLine[]; truncated: boolean }>('GET', `/api/containers/${encodeURIComponent(id)}/logs?tail=${tail}`),
  /** follow 流式日志：返回原始 Response（调用方用 reader 消费；首次调用会先做服务发现） */
  logsFollow: async (id: string, tail: number): Promise<Response> => {
    const info = await ensureInfo()
    return fetch(`http://127.0.0.1:${info.port}/api/containers/${encodeURIComponent(id)}/logs?tail=${tail}&follow=1`, {
      headers: { Authorization: `Bearer ${info.token}` },
    })
  },
  images: () => request<{ ok: boolean; items: ImageItem[] }>('GET', '/api/images'),
  imageRemove: (idOrName: string, confirm: string) => request<{ ok: boolean }>('POST', `/api/images/${encodeURIComponent(idOrName)}/remove`, { confirm }),
  df: () => request<{ ok: boolean; df: DfSummary }>('GET', '/api/df'),
  events: (limit = 200) => request<{ ok: boolean; items: EventItem[]; pumpRunning: boolean }>('GET', `/api/events?limit=${limit}`),
  selftest: () => request<SelftestResp>('POST', '/api/selftest', {}),
}

/** 面板「问 AI」：把当前日志打包成语义化文本交给宿主发送 */
export function logsToPrompt(name: string, lines: LogLine[], maxChars = 8000): string {
  const body = lines
    .map((l) => `${l.stream === 'stderr' ? '[ERR] ' : ''}${l.text}`)
    .join('\n')
  const clipped = body.length > maxChars ? `${body.slice(-maxChars)}\n…（更早内容已截断，保留尾部）` : body
  return `以下是我本机 Docker 容器「${name}」的最近日志。请分析：1) 有没有错误或异常模式；2) 最可能的根因；3) 建议的下一步排查动作。\n\n\`\`\`\n${clipped}\n\`\`\``
}
