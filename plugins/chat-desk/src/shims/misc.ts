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
// K-F2 真机实证：这里若顶层直接读 core().components.X，shims/misc init（blob 求值期）
// 会把「面板尚未回挂时的 undefined」固化进 const，SessionCell 渲染 <undefined> 报
// Element type is invalid（SessionCell2）。改为惰性转发：运行时每次访问取桥上最新值。
function lazyComponent(name: string): any {
  return new Proxy(function () {}, {
    get: (_t, p) => {
      const v = (core().components as Record<string, any>)[name]
      return v?.[p as string]
    },
    apply: (_t, _this, args) => {
      const v = (core().components as Record<string, any>)[name]
      return typeof v === 'function' ? v(...args) : v
    },
    construct: (_t, args) => {
      const v = (core().components as Record<string, any>)[name]
      return new v(...args)
    },
  })
}
export const Button: any = lazyComponent('Button')
export const JsonTreeView: any = lazyComponent('JsonTreeView')
export const OverlayGuard: any = lazyComponent('OverlayGuard')
export const ConfirmDialog: any = lazyComponent('ConfirmDialog')
export const Modal: any = lazyComponent('Modal')
export const DropdownMenu: any = lazyComponent('DropdownMenu')
export const DiffViewer: any = lazyComponent('DiffViewer')
export const WorkspaceBadge: any = lazyComponent('WorkspaceBadge')
export const WorkspaceMenu: any = lazyComponent('WorkspaceMenu')
export const WorkspaceSearchInput: any = lazyComponent('WorkspaceSearchInput')
export const useWorkspaceFilter: any = new Proxy({}, { get: (_t, p) => (core().components as Record<string, any>).useWorkspaceFilter?.[p as string] })
export const CreateWorkspaceModal: any = lazyComponent('CreateWorkspaceModal')
export const Icons: any = new Proxy({}, { get: () => (core().components as Record<string, any>).Icons })

// ── @tauri-apps/api/core ──
export function convertFileSrc(path: string): string {
  return (core().tauri as Record<string, any>).convertFileSrc(path)
}

export function listPluginMcpServerStatuses(pluginStates: unknown) {
  return (core().pluginSystem as Record<string, any>).listPluginMcpServerStatuses?.(pluginStates) ?? []
}

// ── schedulerStoreUtils（宿主保留，dispatchTaskService 消费）──
export const parseEventToLog: any = (...args: unknown[]) =>
  ((globalThis as unknown as { __POLARIS_APP_CORE__: any }).__POLARIS_APP_CORE__.services.schedulerStoreUtils.parseEventToLog)(...args)

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
// 同理惰性：IconSend 等在 blob 求值期读桥会固化 undefined。
// Proxy target 必须是 function（React 以 typeof type==='function' 判组件；target 为 {} 会被判 object → Element type is invalid）。
function lazyIcon(name: string): any {
  return new Proxy(function () {}, {
    get: (_t, p) => (core().components as Record<string, any>).Icons?.[name]?.[p as string],
    // React 渲染函数组件时会 call type(props)；转发到桥上真组件。
    apply: (_t, _this, args) => {
      const v = (core().components as Record<string, any>).Icons?.[name]
      return typeof v === 'function' ? v(...args) : v
    },
    construct: (_t, args) => {
      const v = (core().components as Record<string, any>).Icons?.[name]
      return new v(...args)
    },
  })
}
export const IconSend: any = lazyIcon('IconSend')
export const IconStop: any = lazyIcon('IconStop')
export const IconPaperclip: any = lazyIcon('IconPaperclip')
