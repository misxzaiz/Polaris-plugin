/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * storage-desk 依赖注入 —— 迁入组件原依赖宿主 @/services、@/stores，
 * 插件内经 __POLARIS_APP_CORE__（appCoreBridge）取同一实例。
 * dataRootService/historyPrefsStore 为插件本地同源实现。
 */

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
export function isWeb(): boolean {
  return !isTauri()
}

function core(): { stores: Record<string, any>; services: Record<string, any> } {
  const c = (globalThis as any).__POLARIS_APP_CORE__
  if (!c?.stores) throw new Error('宿主 App Core 未挂载：请把 Polaris 更新到较新版本后再打开本插件。')
  return c
}

function forwardStore(name: string): any {
  const fn = (...args: any[]) => {
    const hook = core().stores[name]
    if (typeof hook !== 'function') throw new Error(`宿主 ${name} 不可用`)
    return hook(...args)
  }
  return new Proxy(fn, {
    get: (_t, prop) => {
      const hook = core().stores[name]
      const v = (hook as any)[prop]
      return typeof v === 'function' ? v.bind(hook) : v
    },
  })
}

export const useHistoryPrefsStore: any = forwardStore('useHistoryPrefsStore')

/** 宿主 opfsHelpers（appCoreBridge 补挂）：OPFS 迁移/统计/清理四函数 */
function opfsHelpers(): Record<string, any> {
  const h = core().services.opfsHelpers
  if (!h) throw new Error('宿主 opfsHelpers 不可用：请把 Polaris 更新到较新版本后再打开本插件。')
  return h
}
export const isOpfsMigrated = (): boolean => opfsHelpers().isOpfsMigrated()
export const probeOpfsDialogCount = (): Promise<number> => opfsHelpers().probeOpfsDialogCount()
export const migrateOpfsToTauri = (...args: any[]): Promise<any> => opfsHelpers().migrateOpfsToTauri(...args)
export const clearOpfsDialogs = (...args: any[]): Promise<any> => opfsHelpers().clearOpfsDialogs(...args)

/** 与宿主 opfsMigration.ts 同构（结构化复制，宿主为唯一实现） */
export interface OpfsMigrationItemError {
  name: string
  error: string
}
export interface OpfsMigrationReport {
  total: number
  success: number
  skipped: number
  failed: number
  errors: OpfsMigrationItemError[]
  flagged: boolean
}
