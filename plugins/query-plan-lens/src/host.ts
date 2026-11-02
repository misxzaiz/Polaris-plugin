/**
 * host.ts —— 宿主桥封装（house 范式，对齐 data-query/log-lens）
 *
 * 面板绝不直接 fetch 任何地址：全部经 window.__POLARIS_HOST_INVOKE__ →
 * router_dispatch → cap.http（宿主 Rust 侧转发到 127.0.0.1 服务）。
 * 桌面 / Web / 手机同一条路，天然无 CORS，也不给服务开 CORS 头。
 * 服务发现与鉴权：cap.kv `qpl.service` { port, token }（服务侧写入）。
 */

export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke
}

function hostWindow(): HostGlobals & typeof globalThis {
  return window as unknown as HostGlobals & typeof globalThis
}

export function getHostInvoke(): HostInvoke {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__
  if (!invoke) {
    throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）')
  }
  return invoke
}

export interface CapEnvelope<T> { ok: boolean; result?: T; error?: string }

export async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<CapEnvelope<T>>('router_dispatch', { req: { target, payload } })
  if (!res || res.ok !== true) throw new Error((res && res.error) || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

export interface ServiceMeta { port: number; token: string; version?: string }

export interface KvEnvelope { value?: unknown }

/** 读服务发现元数据（经宿主 cap.kv，全端可达）；kv get 返回 {value} 包装，须拆一层 */
export async function loadServiceMeta(): Promise<ServiceMeta | null> {
  try {
    const v = await capDispatch<KvEnvelope>('cap.kv', { action: 'get', key: 'qpl.service' })
    const meta = v && v.value ? (v.value as ServiceMeta) : (v as unknown as ServiceMeta)
    if (meta && typeof meta.port === 'number' && meta.port > 0) return meta
    return null
  } catch (_) {
    return null
  }
}

export interface HttpResult {
  status: number
  statusText?: string
  ok: boolean
  body: string
  isBase64?: boolean
  timeMs?: number
}

/** 调本地服务：经 cap.http；非 2xx 或 ok:false 时抛出服务给的用户可读错误 */
export async function api<T>(
  path: string,
  body?: unknown,
  meta: ServiceMeta | null = null,
  timeoutMs = 150000,
): Promise<T> {
  if (!meta) throw new Error('服务未就绪：未读到 qpl.service 元数据（请稍候或重启插件服务）')
  const payload: Record<string, unknown> = {
    action: 'request',
    method: 'POST',
    url: `http://127.0.0.1:${meta.port}/${path}`,
    headers: { Authorization: `Bearer ${meta.token || ''}` },
    timeoutMs,
  }
  if (body !== undefined) {
    payload.body = JSON.stringify(body)
    payload.bodyType = 'json'
  }
  const r = await capDispatch<HttpResult>('cap.http', payload)
  let parsed: unknown = null
  try { parsed = JSON.parse(r.body) } catch (_) { /* 原样抛错 */ }
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>
  if (r.status >= 400 || obj.ok === false) {
    throw new Error(String(obj.error || `服务 HTTP ${r.status}`))
  }
  if (!parsed) throw new Error(`服务响应不可解析：${String(r.body).slice(0, 200)}`)
  return parsed as T
}
