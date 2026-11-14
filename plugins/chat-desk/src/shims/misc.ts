/**
 * misc shim —— host 树剩余 `@/...` 导入的兜底解析：
 * - i18n：宿主 i18next 实例（词条在宿主 bundle；useTranslation 包装 t）
 * - mobile/platform：纯函数本地复制
 * - plugin-system：registry/chatCardRegistry/types（经 appCore.pluginSystem）
 * - components/*：非 Chat 宿主组件（Common/Diff/Session/Workspace）
 * - @tauri-apps/api/core convertFileSrc
 */
import type { AppCore } from '../core'

/* eslint-disable @typescript-eslint/no-explicit-any */

function core(): AppCore {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (globalThis as unknown as { __POLARIS_APP_CORE__: AppCore }).__POLARIS_APP_CORE__
}

// ── i18n ──
export const i18n: any = new Proxy({}, {
  get: (_t, prop) => {
    const inst = (core().i18n as Record<string, any>)
    return inst ? inst[prop as string] : undefined
  },
})

export function useTranslation(ns?: string) {
  const inst = (core().i18n as Record<string, any>)
  return {
    t: (key: string, opts?: any) => inst.t(key, { ns, ...opts }),
    i18n: inst,
  }
}

// ── mobile/platform ──
export function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}
export function isMobileTauriRuntime(): boolean {
  return isMobileUserAgent() && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
export const isWeb = (): boolean => !isTauri()

// ── plugin-system ──
export const pluginRegistry: any = new Proxy({}, {
  get: (_t, prop) => (core().pluginSystem as Record<string, any>).pluginRegistry[prop as string],
})
export const chatCardRegistry: any = new Proxy({}, {
  get: (_t, prop) => (core().pluginSystem as Record<string, any>).chatCardRegistry[prop as string],
})
export function listEnabledPluginMcpServers(pluginStates: unknown): any {
  return (core().pluginSystem as Record<string, any>).listEnabledPluginMcpServers(pluginStates)
}

// ── components（宿主共享 UI 件）──
export const Button: any = (core().components as Record<string, any>).Button
export const JsonTreeView: any = (core().components as Record<string, any>).JsonTreeView
export const OverlayGuard: any = (core().components as Record<string, any>).OverlayGuard
export const ConfirmDialog: any = (core().components as Record<string, any>).ConfirmDialog
export const Modal: any = (core().components as Record<string, any>).Modal
export const DropdownMenu: any = (core().components as Record<string, any>).DropdownMenu
export const DiffViewer: any = (core().components as Record<string, any>).DiffViewer
export const WorkspaceBadge: any = (core().components as Record<string, any>).WorkspaceBadge
export const WorkspaceMenu: any = (core().components as Record<string, any>).WorkspaceMenu
export const WorkspaceSearchInput: any = (core().components as Record<string, any>).WorkspaceSearchInput
export const useWorkspaceFilter: any = (core().components as Record<string, any>).useWorkspaceFilter
export const CreateWorkspaceModal: any = (core().components as Record<string, any>).CreateWorkspaceModal
export const Icons: any = new Proxy({}, { get: () => (core().components as Record<string, any>).Icons })

// ── @tauri-apps/api/core ──
export function convertFileSrc(path: string): string {
  return (core().tauri as Record<string, any>).convertFileSrc(path)
}

export function listPluginMcpServerStatuses(pluginStates: unknown) {
  return (core().pluginSystem as Record<string, any>).listPluginMcpServerStatuses?.(pluginStates) ?? []
}

// ── 相对引用兜底（host 树 ../xxxStore 等，别名分流至本文件）──
export {
  useConfigStore, useWorkspaceStore, useViewStore, useToastStore, useInputUIStore,
  useUiSlotStore, useThemeStore, useModelProfileStore, useSessionConfig,
  useEngineMetadataStore, useCliInfoStore, useAgentStore, useCapCatalogStore,
  usePluginStore, useOverlayStore, useSnippetStore, useSkillStore, useFileEditorStore,
  useCompactHandoffStore, useDispatchStore, sessionStoreManager,
} from './stores'

// ── sessionConfigStore 的非 hook 导出（宿主单例转发）──
export function getSessionConfig(): any {
  return (core().stores as Record<string, any>).useSessionConfig.getState().config
}

// ── modelProfileStore 的非 hook 导出（宿主单例转发）──
export function getActiveModelProfile(): any {
  return (core().stores as Record<string, any>).useModelProfileStore.getState().getActiveProfile?.()
    ?? (core().stores as Record<string, any>).useModelProfileStore.getState().activeProfile
}
export function getModelProfileById(id: string | null | undefined): any {
  const s = (core().stores as Record<string, any>).useModelProfileStore.getState()
  return s.profiles?.find?.((p: any) => p.id === id)
}

// ── Icons（宿主 Common/Icons 共享）──
export const IconSend: any = (core().components as Record<string, any>).Icons.IconSend
export const IconStop: any = (core().components as Record<string, any>).Icons.IconStop
export const IconPaperclip: any = (core().components as Record<string, any>).Icons.IconPaperclip
