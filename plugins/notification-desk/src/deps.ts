/* eslint-disable @typescript-eslint/no-explicit-any */
/** notification-desk 依赖桥：toastStore/类型/cn 经 __POLARIS_APP_CORE__ 取宿主实例。 */

function core(): any {
  const c = (globalThis as any).__POLARIS_APP_CORE__
  if (!c?.stores) throw new Error('宿主 App Core 未挂载：请把 Polaris 更新到较新版本。')
  return c
}

export const useToastStore: any = new Proxy(function () {}, {
  apply: (_t, _this, args) => (core().stores.useToastStore as any)(...args),
  get: (_t, prop) => {
    const hook = core().stores.useToastStore as any
    const v = hook?.[prop]
    return typeof v === 'function' ? v.bind(hook) : v
  },
})

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'session_complete'
export interface NotificationRecord {
  id: string
  type: ToastType
  title: string
  message?: string
  timestamp: number
  read?: boolean
  sessionId?: string
}

export type SessionMetadata = any

export function cn(...args: any[]): string {
  return (core().utils as any).cn(...args)
}
