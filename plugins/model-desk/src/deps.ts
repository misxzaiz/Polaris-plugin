/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * model-desk 依赖注入 —— 迁入的 ModelProviderTab/TokenStatsTab 原依赖宿主 @/stores 等，
 * 插件内经 __POLARIS_APP_CORE__（appCoreBridge + chat-desk bootstrap 回挂）取同一实例。
 * 导出的即宿主 hook/对象本体（用法与宿主完全一致）；缺失时抛错（宿主太旧）。
 */

function core(): { stores: Record<string, any>; services: Record<string, any> } {
  const c = (globalThis as any).__POLARIS_APP_CORE__
  if (!c?.stores) throw new Error('宿主 App Core 未挂载：请把 Polaris 更新到较新版本后再打开本插件。')
  return c
}

/** 宿主 zustand hook 本体（调用方式与宿主一致：useModelProfileStore() / useModelProfileStore(sel)） */
export const useModelProfileStore: any = new Proxy({} as any, {
  get: (_t, p) => (core().stores.useModelProfileStore as any)[p as string],
})
export const useSessionConfig: any = new Proxy({} as any, {
  get: (_t, p) => (core().stores.useSessionConfig as any)[p as string],
})
export const useEngineMetadataStore: any = new Proxy({} as any, {
  get: (_t, p) => (core().stores.useEngineMetadataStore as any)[p as string],
})
export const useToastStore: any = new Proxy({} as any, {
  get: (_t, p) => (core().stores.useToastStore as any)[p as string],
})
export const useConfigStore: any = new Proxy({} as any, {
  get: (_t, p) => (core().stores.useConfigStore as any)[p as string],
})
export const sessionStoreManager: any = new Proxy({} as any, {
  get: (_t, p) => (core().stores.sessionStoreManager as any)[p as string],
})

/** getSessionDirectorySnapshot 等价（宿主 sessionDirectoryStore 的读投影） */
export function getSessionDirectorySnapshot(): { metadataMap: Map<string, any>; activeSessionId: string | null } {
  const s = core().stores.sessionStoreManager.getState()
  return { metadataMap: s.sessionMetadata, activeSessionId: s.activeSessionId }
}

export function getEngineDisplayName(...args: any[]): string {
  const svc = core().services
  const fn = svc.engineDisplay?.getEngineDisplayName ?? svc.getEngineDisplayName
  return fn(...args)
}

/** test_model_profile_connection / fetch_models_for_profile 直连宿主命令 */
export async function testModelProfileConnection(profile: unknown): Promise<any> {
  return core().services.transport.invoke('test_model_profile_connection', { profile })
}
export async function fetchModelsForProfile(profile: unknown): Promise<string[]> {
  return core().services.transport.invoke('fetch_models_for_profile', { profile })
}
