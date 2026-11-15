/**
 * host.ts —— 宿主 API 访问层（行数透视台面板）
 *
 * 面板经宿主 invoke 通道（window.__POLARIS_HOST_INVOKE__）读 cap.kv 的
 * loclens.meta 拿服务 {port, token}，之后数据面直连 127.0.0.1 服务。
 * 工作区跟随走 __POLARIS_WORKSPACE_API__（polaris-git 同款契约）。
 *
 * 宿主 invoke 仅用于：meta 读取、设置读写、服务重启自救（cap.pluginServiceManager）。
 * repo-lens / stream-desk / dep-probe 生产同款契约，勿改协议。
 */

export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

interface WorkspaceSnapshot {
  id: string
  name: string
  path: string
}

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke
  __POLARIS_HOST_WORKSPACE__?: string
  __POLARIS_WORKSPACE_API__?: {
    list: () => WorkspaceSnapshot[]
    currentId: () => string | null
    subscribe: (listener: () => void) => () => void
  }
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

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const r = await capDispatch<{ value?: T }>('cap.kv', { action: 'get', key })
    return r && r.value !== undefined ? r.value : null
  } catch (_) { return null }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}

/** 服务重启自救（mcp-probe 同款契约） */
export async function restartService(pluginId: string, serviceId: string): Promise<void> {
  await capDispatch('cap.pluginServiceManager', { action: 'restart', pluginId, serviceId })
}

// ---------------------------------------------------------------------------
// 工作区跟随（冷启动自动绑定；polaris-git bridge 同款契约）
// ---------------------------------------------------------------------------

export function currentWorkspacePath(): string | null {
  const api = hostWindow().__POLARIS_WORKSPACE_API__
  if (api) {
    const id = api.currentId()
    if (id) {
      const ws = api.list().find((w) => w.id === id)
      if (ws?.path) return ws.path
    }
  }
  const direct = hostWindow().__POLARIS_HOST_WORKSPACE__
  return typeof direct === 'string' && direct ? direct : null
}

/** 订阅工作区变化；注册时立即以当前值回调一次（冷启动快照） */
export function onWorkspaceChanged(handler: (path: string | null) => void): () => void {
  let last = currentWorkspacePath()
  handler(last)
  const api = hostWindow().__POLARIS_WORKSPACE_API__
  if (!api) return () => {}
  return api.subscribe(() => {
    const next = currentWorkspacePath()
    if (next !== last) {
      last = next
      handler(next)
    }
  })
}
