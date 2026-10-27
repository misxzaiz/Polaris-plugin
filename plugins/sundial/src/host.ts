/**
 * 宿主 API 访问层（日晷面板专用，与 feed-radar / clip-relay 同一模式）
 *
 * 面板数据全部走宿主暴露的 invoke 通道（window.__POLARIS_HOST_INVOKE__）：
 *   - 桌面 Tauri：直连后端 IPC
 *   - 手机浏览器 / Web：自动取正确服务地址并携带 Bearer token（Remote 源）
 *
 * 面板自身绝不直接 fetch 任何地址——ICS 订阅抓取由后台服务原生执行
 * （浏览器同源策略管不到服务进程），这是本插件跨域问题的根治点。
 */
export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke
}

function hostWindow(): HostGlobals & typeof globalThis {
  return window as unknown as HostGlobals & typeof globalThis
}

/** 获取宿主 invoke 通道；缺失时抛清晰错误（提示需更新主应用） */
export function getHostInvoke(): HostInvoke {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__
  if (!invoke) {
    throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）')
  }
  return invoke
}

/** 经 router_dispatch 调 cap（与主仓 router_dispatch 对齐） */
export async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<{ ok: boolean; result?: T; error?: string }>('router_dispatch', {
    req: { target, payload },
  })
  if (!res.ok) throw new Error(res.error || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

// cap.kv 四动作
export async function kvGet<T>(key: string): Promise<T | null> {
  const r = await capDispatch<{ value?: T }>('cap.kv', { action: 'get', key })
  return r && r.value !== undefined ? r.value : null
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value: value === undefined ? null : value })
}
export async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key })
}
export async function kvKeys(): Promise<string[]> {
  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' })
  return r && Array.isArray(r.keys) ? r.keys : []
}
