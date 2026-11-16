/* eslint-disable @typescript-eslint/no-explicit-any */
/** 宿主共享实例代理：stores/services/hooks/plugin-system/components 全取 __POLARIS_APP_CORE__ */

function core(): any {
  const c = (globalThis as any).__POLARIS_APP_CORE__
  if (!c?.stores) throw new Error('宿主 App Core 未挂载：请把 Polaris 更新到较新版本后再打开本插件。')
  return c
}

function forward(kind: string, name: string): any {
  const fn = (...args: any[]) => {
    const hook = core()[kind][name]
    if (typeof hook !== 'function') throw new Error(`宿主 ${kind}.${name} 不可用`)
    return hook(...args)
  }
  return new Proxy(fn, {
    get: (_t, prop) => {
      const v = (core()[kind][name] as any)[prop]
      return typeof v === 'function' ? v.bind(core()[kind][name]) : v
    },
  })
}

export const useTabStore: any = forward('stores', 'useTabStore')
export const useFileEditorStore: any = forward('stores', 'useFileEditorStore')
export const useWorkspaceStore: any = forward('stores', 'useWorkspaceStore')
export const useOverlayStore: any = forward('stores', 'useOverlayStore')
export const useConfigStore: any = forward('stores', 'useConfigStore')
export const useThemeStore: any = forward('stores', 'useThemeStore')
export const useEditorSettingsStore: any = forward('stores', 'useEditorSettingsStore')
export const useEditorContextStore: any = forward('stores', 'useEditorContextStore')
export const useNarrowTabStore: any = forward('stores', 'useNarrowTabStore')
export const useCommandStore: any = forward('stores', 'useCommandStore')
export const useViewStore: any = forward('stores', 'useViewStore')
export const useFileExplorerStore: any = forward('stores', 'useFileExplorerStore')
export const useToastStore: any = forward('stores', 'useToastStore')

export const services: any = new Proxy({}, { get: (_t, p) => core().services[p] })
export const eventBus: any = new Proxy({}, { get: (_t, p) => core().services.eventBus[p] })
export const tauri: any = new Proxy({}, { get: (_t, p) => core().services.tauri[p] })
export const pluginSystem: any = new Proxy({}, { get: (_t, p) => core().pluginSystem[p] })
export const hostComponents: any = new Proxy({}, { get: (_t, p) => core().components[p] })

export const listen: any = (...args: any[]) => core().services.transport.listen(...args)
export const invoke: any = (...args: any[]) => core().services.transport.invoke(...args)
export const currentMode: string = core().services.transport.currentMode

export function useTransitionState(...args: any[]): any {
  return core().hooks.useTransitionState(...args)
}

export function getEngineDisplayName(...args: any[]): string {
  const metadatas = core().stores.useEngineMetadataStore.getState().metadatas || []
  const id = args[0]
  const meta = metadatas.find((mm: any) => mm.id === id)
  return meta?.displayName || meta?.name || String(id ?? 'Claude Code')
}

export const fileService: any = new Proxy({}, { get: (_t, p) => core().services.tauri[p] })

/** 宿主 utils/tauri 任意函数兜底转发 */
function forwardAny(path: string, name: string): any {
  return (...args: any[]) => {
    const c = core()
    const fn = c.services.tauri?.[name] ?? c.services[name] ?? c.utils?.[name]
    if (typeof fn !== 'function') throw new Error('宿主 ' + name + ' 不可用')
    return fn(...args)
  }
}
export const createLogger: any = forwardAny('utils', 'createLogger')
export const formatFileSize: any = forwardAny('utils', 'formatFileSize')
export const fsGetFileInfo: any = forwardAny('tauri', 'fsGetFileInfo')
export const generateUUID: any = forwardAny('tauri', 'generateUUID')
export const normalizePath: any = forwardAny('utils', 'normalizePath')
export const openInDefaultApp: any = forwardAny('tauri', 'openInDefaultApp')
export const importFn: any = forwardAny('tauri', 'import')
