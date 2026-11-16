/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * model-desk 依赖注入 —— 迁入的 ModelProviderTab/TokenStatsTab 原依赖宿主 @/stores 等，
 * 插件内经 __POLARIS_APP_CORE__（appCoreBridge + chat-desk bootstrap 回挂）取同一实例。
 *
 * 导出的每个 useXxx 是「可调用 + 可取静态成员」的转发代理：
 * - useModelProfileStore() / useModelProfileStore(selector) → zustand hook 调用
 * - useModelProfileStore.getState() / .setState() → zustand 静态成员
 * 缺失时抛错（宿主太旧），不静默降级。
 */

function core(): { stores: Record<string, any>; services: Record<string, any> } {
  const c = (globalThis as any).__POLARIS_APP_CORE__
  if (!c?.stores) throw new Error('宿主 App Core 未挂载：请把 Polaris 更新到较新版本后再打开本插件。')
  return c
}

/** 造一个「调用即转发宿主 hook，属性访问即转发宿主 hook 静态成员」的代理函数 */
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

export const useModelProfileStore: any = forwardStore('useModelProfileStore')
export const useSessionConfig: any = forwardStore('useSessionConfig')
export const useEngineMetadataStore: any = forwardStore('useEngineMetadataStore')
export const useToastStore: any = forwardStore('useToastStore')
export const useConfigStore: any = forwardStore('useConfigStore')
export const sessionStoreManager: any = forwardStore('sessionStoreManager')

/** getSessionDirectorySnapshot 等价（宿主 sessionDirectoryStore 的读投影） */
export function getSessionDirectorySnapshot(): { metadataMap: Map<string, any>; activeSessionId: string | null } {
  const s = core().stores.sessionStoreManager.getState()
  return { metadataMap: s.sessionMetadata, activeSessionId: s.activeSessionId }
}

/** 引擎显示名（与宿主 utils/engineDisplay.getEngineDisplayName 同源逻辑：元数据动态取，未知回退 id） */
export function getEngineDisplayName(engineId?: string | null): string {
  if (!engineId) return 'Claude Code'
  const metadatas = core().stores.useEngineMetadataStore.getState().metadatas || []
  const meta = metadatas.find((m: any) => m.id === engineId)
  return meta?.displayName || meta?.name || String(engineId)
}

/** test_model_profile_connection / fetch_models_for_profile 直连宿主命令 */
export async function testModelProfileConnection(profile: unknown): Promise<any> {
  return core().services.transport.invoke('test_model_profile_connection', { profile })
}
export async function fetchModelsForProfile(profile: unknown): Promise<string[]> {
  return core().services.transport.invoke('fetch_models_for_profile', { profile })
}
