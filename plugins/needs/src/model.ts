/**
 * 需求库面板数据模型：kv 面（cap.kv needs.*，经宿主 invoke）+ API 面（自家服务，经宿主 cap.http 转发）。
 * 乐观锁：所有更新必须带 show/list 返回的 mtimeMs；冲突（code=NEEDS_CONFLICT）抛给 UI 引导重读。
 */
import { getHostInvoke } from './host'

export interface NeedsMeta { port: number; token: string; version?: string; startedAt?: string }
export interface Row {
  id: string; file: string; title: string; status: string; priority: string
  tags: string[]; origin: string; created: string; updated: string
  spec: string; delivered: string; pendingClarify: number; mtimeMs: number
}
export interface ShowResult { file: string; title: string; raw: string; mtimeMs: number }
export interface ConfigInfo { root: string; source: string; entryCount: number; hasReadme: boolean; hasPrompts?: boolean; saved?: boolean }

export const STATUS_ORDER = ['idea', 'analyzed', 'specd', 'approved', 'building', 'delivered', 'published', 'shelved'] as const
export const STATUS_LABEL: Record<string, string> = {
  idea: '想法', analyzed: '已分析', specd: '已写spec', approved: '已拍板',
  building: '实施中', delivered: '已交付', published: '已上架', shelved: '搁置',
}
export const PRIORITY_LABEL: Record<string, string> = { high: '高', medium: '中', low: '低' }

// ── kv 面（capDispatch 双重解包：res.result 与 value 各一层，缺一不可）────────
async function kvGet(key: string): Promise<unknown> {
  const invoke = getHostInvoke()
  const res = await invoke<Record<string, unknown>>('router_dispatch', {
    req: { target: 'cap.kv', payload: { action: 'get', key } },
  })
  if (!res || (res as { ok?: boolean }).ok === false) {
    throw new Error(String((res as { error?: unknown })?.error || 'cap.kv get 失败'))
  }
  const result = (res as { result?: unknown }).result ?? res
  if (result && typeof result === 'object' && 'value' in (result as Record<string, unknown>)) {
    return (result as Record<string, unknown>).value
  }
  return result
}

export async function getMeta(): Promise<NeedsMeta> {
  const m = await kvGet('needs.meta')
  if (!m || typeof m !== 'object') return null as unknown as NeedsMeta
  const meta = m as Partial<NeedsMeta>
  if (typeof meta.token !== 'string' || !meta.token || typeof meta.port !== 'number' || !meta.port) {
    return null as unknown as NeedsMeta
  }
  return meta as NeedsMeta
}

// ── API 面 ───────────────────────────────────────────────────────────────────
// 服务访问（agnes/image-recognition 已验证范式）：面板不直连服务端口，一律经宿主
// router_dispatch → cap.http 转发到 127.0.0.1:<port>。请求由宿主进程发出（PC 本机），
// 手机/Web/桌面任何环境都无跨域与可达性问题；服务只绑 127.0.0.1 不暴露局域网。
export class NeedsApiError extends Error {
  code?: string
  actualMtimeMs?: number
  constructor(msg: string, code?: string, actualMtimeMs?: number) {
    super(msg)
    this.code = code
    this.actualMtimeMs = actualMtimeMs
  }
}

interface CapHttpResult {
  status?: number
  statusText?: string
  body?: string
  isBase64?: boolean
}

async function api<T>(meta: NeedsMeta, path: string, body: Record<string, unknown>): Promise<T> {
  const invoke = getHostInvoke()
  const res = await invoke<{ ok?: boolean; error?: unknown; result?: CapHttpResult }>('router_dispatch', {
    req: {
      target: 'cap.http',
      payload: {
        action: 'request',
        method: 'POST',
        url: `http://127.0.0.1:${meta.port}/api/${path}`,
        headers: { 'Content-Type': 'application/json', 'X-Needs-Token': meta.token },
        body: JSON.stringify(body),
        bodyType: 'json',
        timeoutMs: 30000,
      },
    },
  })
  if (!res || res.ok === false) {
    throw new NeedsApiError(String(res?.error || 'cap.http 转发失败（宿主通道不可用）'))
  }
  const http = res.result ?? {}
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(String(http.body ?? ''))
  } catch {
    json = null
  }
  if (!json) throw new NeedsApiError(`服务响应不可解析（HTTP ${http.status ?? '?'}）`)
  if (json.ok !== true) throw new NeedsApiError(String(json.error || '请求失败'), json.code as string | undefined, json.actualMtimeMs as number | undefined)
  return json as T
}

export const apiList = (meta: NeedsMeta, filter: { status?: string; tag?: string; q?: string } = {}) =>
  api<{ root: string; rows: Row[] }>(meta, 'list', filter)
export const apiShow = (meta: NeedsMeta, id: string) => api<ShowResult>(meta, 'show', { id })
export const apiAdd = (meta: NeedsMeta, args: { title: string; oneLiner?: string; priority?: string; tags?: string[]; slug?: string }) =>
  api<{ id: string; file: string; title: string; mtimeMs: number }>(meta, 'add', args)
export const apiUpdate = (meta: NeedsMeta, args: {
  id: string; fields?: Record<string, unknown>
  append?: { section: string; text: string }; expectedMtimeMs: number
}) => api<{ file: string; done: string; mtimeMs: number }>(meta, 'update', args)
export const apiHandoff = (meta: NeedsMeta, id: string, stage: string) =>
  api<{ file: string; stage: string; text: string }>(meta, 'handoff', { id, stage })
export const apiConfig = (meta: NeedsMeta, root?: string) =>
  api<ConfigInfo>(meta, 'config', root ? { root } : {})
export const apiProbe = (meta: NeedsMeta, path: string) =>
  api<{ path: string; exists: boolean; isDir: boolean }>(meta, 'probe', { path })
