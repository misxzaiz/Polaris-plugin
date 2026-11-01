/**
 * 宿主 API 访问层（日志透视台面板）
 *
 * 面板数据面走宿主暴露的 invoke 通道（window.__POLARIS_HOST_INVOKE__）：
 *   - cap.kv：设置持久化 + 服务心跳（lls.meta 端口发现）
 *   - cap.http：面板 → 本机日志服务（127.0.0.1，宿主后端 reqwest 直连，
 *     无 CORS/混合内容/禁发头问题；Remote 来源宿主默认 deny → 面板显式提示）
 *
 * 面板自身绝不直接 fetch 任何地址（跨域治理；与 house 范式一致）。
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

// ── cap.kv 四动作 ───────────────────────────────────────────────────────────
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const r = await capDispatch<{ value?: T }>('cap.kv', { action: 'get', key })
    return r && r.value !== undefined ? r.value : null
  } catch (_) {
    return null
  }
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}
export async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key })
}

// ── cap.http → 本机服务 ─────────────────────────────────────────────────────
export interface HttpResult {
  status: number
  ok?: boolean
  body: string
  isBase64?: boolean
  contentType?: string
  timeMs?: number
}

/** 经宿主 cap.http 访问本机服务（回环直连，无 CORS 面） */
export async function httpGetViaHost(url: string, timeoutMs = 30000): Promise<HttpResult> {
  const r = await capDispatch<HttpResult>('cap.http', {
    action: 'request', method: 'GET', url, timeoutMs,
  })
  if (!r || typeof r.status !== 'number') throw new Error('cap.http 返回异常')
  return r
}

/** POST JSON（源管理等写操作；服务只写 cap.kv 设置，不碰日志文件） */
export async function httpPostViaHost(url: string, body: unknown, timeoutMs = 15000): Promise<HttpResult> {
  const r = await capDispatch<HttpResult>('cap.http', {
    action: 'request', method: 'POST', url, timeoutMs,
    body: JSON.stringify(body ?? {}), bodyType: 'json',
  })
  if (!r || typeof r.status !== 'number') throw new Error('cap.http 返回异常')
  return r
}
