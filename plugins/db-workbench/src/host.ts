/**
 * 宿主 API 访问层（db-workbench 面板专用，与 pocket-host 同一模式）
 * 面板读 kv（拿 dbl.service 发现信息）全部走宿主 invoke → router_dispatch → cap.kv，
 * 桌面/Web/手机三端同源无跨域问题。查询流量走 127.0.0.1 直连 service（见 model.ts）。
 */
export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke
}

function hostWindow(): HostGlobals & typeof globalThis {
  return window as unknown as HostGlobals & typeof globalThis
}

/** 获取宿主 invoke 通道；缺失时抛清晰错误 */
export function getHostInvoke(): HostInvoke {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__
  if (!invoke) {
    throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）')
  }
  return invoke
}

export interface DispatchResponse<T> {
  ok: boolean
  result?: T
  error?: string
}

/** 经宿主读 cap.kv（面板侧唯一 kv 读路径） */
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const res = await getHostInvoke()<DispatchResponse<{ value: T }>>('router_dispatch', {
      req: { target: 'cap.kv', payload: { action: 'get', key } },
    })
    if (res && res.ok && res.result) return res.result.value !== undefined ? res.result.value : null
    return null
  } catch (_) {
    return null
  }
}
