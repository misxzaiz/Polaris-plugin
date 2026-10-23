/**
 * 宿主通道访问层（MultiChat）
 *
 * 双通道（主应用 main.tsx 已暴露，零新代码所需）：
 * - __POLARIS_HOST_INVOKE__  → invoke（router_dispatch / cap.kv / plugin_get/set_config）
 * - __POLARIS_HOST_LISTEN__  → listen（chat-event 实时订阅）
 */

import { hostWindow } from './types'

/** invoke 通道：router_dispatch 等同步/流式动作、cap.kv、插件配置 */
export function invokeHost<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__
  if (!invoke) {
    return Promise.reject(new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__'))
  }
  return invoke<T>(cmd, args)
}

/** listen 通道：订阅 chat-event（web/桌面 transport 统一入口） */
export async function listenHost<T = unknown>(
  event: string,
  cb: (payload: T) => void,
): Promise<() => void> {
  const listen = hostWindow().__POLARIS_HOST_LISTEN__
  if (!listen) {
    throw new Error('宿主 listen 不可用：需要主应用提供 __POLARIS_HOST_LISTEN__')
  }
  return listen<T>(event, cb)
}

export function hasHostSupport(): boolean {
  return !!hostWindow().__POLARIS_HOST_INVOKE__ && !!hostWindow().__POLARIS_HOST_LISTEN__
}