/* eslint-disable @typescript-eslint/no-explicit-any */
/** dev-desk 依赖桥：宿主 aiEventBus 单例 + uuid，经 __POLARIS_APP_CORE__ 取。 */

function core(): any {
  const c = (globalThis as any).__POLARIS_APP_CORE__
  if (!c) throw new Error('宿主 App Core 未挂载：请把 Polaris 更新到较新版本。')
  return c
}

export function getEventBus(...args: any[]): any {
  return (core().services as any).hostAiEventBus ?? args[0]
}

export function generateUUID(): string {
  const g = globalThis as any
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
