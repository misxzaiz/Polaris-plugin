/**
 * chat-desk bridgeTransport —— transport.invoke 等价（P3.b）
 *
 * 插件内不能 import 宿主 @/services/transport（会拽入宿主 bundle 循环）；
 * 统一经 __POLARIS_HOST_INVOKE__ 直达同款命令面。tauri/web 双端由宿主桥内部
 * 分流（桌面=IPC，Web=HTTP），本模块无感知。
 */
import { getHostInvoke } from './bridge'

export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return getHostInvoke()<T>(cmd, args)
}

/** 事件订阅：宿主桥 __POLARIS_HOST_LISTEN__（chat-event 已按 chatEvents 授权过滤） */
export function listen<T = unknown>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  const g = window as unknown as {
    __POLARIS_HOST_LISTEN__?: (event: string, handler: (payload: unknown) => void) => Promise<() => void>
  }
  const fn = g.__POLARIS_HOST_LISTEN__
  if (!fn) return Promise.resolve(() => {})
  return fn(event, handler as (payload: unknown) => void) as Promise<() => void>
}
