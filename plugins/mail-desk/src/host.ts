/**
 * 宿主 API 访问层(邮件调试台面板)
 *
 * 与 mock-server / daw-studio 同一范式:面板数据走宿主暴露的 invoke 通道
 * (window.__POLARIS_HOST_INVOKE__),cap.kv 读服务发现,cap.http 转发数据面——
 * 请求由宿主进程发出,桌面/手机/Web 全端无跨域与可达性问题。
 */
export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke
  __POLARIS_SEND_TO_CHAT__?: (msg: string) => void
}

function hostWindow(): HostGlobals & typeof globalThis {
  return window as unknown as HostGlobals & typeof globalThis
}

/** 获取宿主 invoke 通道;缺失时抛清晰错误 */
export function getHostInvoke(): HostInvoke {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__
  if (!invoke) {
    throw new Error('宿主 invoke 不可用:需要主应用提供 __POLARIS_HOST_INVOKE__(请更新 Polaris 主应用)')
  }
  return invoke
}

export interface CapEnvelope<T> { ok: boolean; result?: T; error?: string }

/** 与主仓 router_dispatch 对齐的标准封装 */
export async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<CapEnvelope<T>>('router_dispatch', { req: { target, payload } })
  if (!res || res.ok !== true) throw new Error((res && res.error) || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

// ── cap.kv 四动作(get 容忍键消失)─────────────────────────────────────────
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

// ── 发送到当前 AI 会话(dev-toolbox 同款桥)────────────────────────────────
export function sendToChat(text: string): boolean {
  const fn = hostWindow().__POLARIS_SEND_TO_CHAT__
  if (typeof fn !== 'function') return false
  fn(text)
  return true
}

export function hasSendToChat(): boolean {
  if (typeof window === 'undefined') return false
  return typeof hostWindow().__POLARIS_SEND_TO_CHAT__ === 'function'
}

/** 重启服务(daw-studio 范式:restart 失败 not registered 时降级 autostart 重扫) */
export async function restartService(pluginId: string, serviceId: string): Promise<void> {
  await capDispatch('cap.pluginServiceManager', { action: 'restart', pluginId, serviceId })
}
export async function autostartServices(): Promise<void> {
  await capDispatch('cap.pluginServiceManager', { action: 'autostart' })
}
