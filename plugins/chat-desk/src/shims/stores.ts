/**
 * stores shim —— host 树的 `@/stores`（barrel）与 `@/stores/xxxStore` 导入。
 * 全部转发宿主单例（appCore.stores）。zustand 的 useStore 直接复用宿主实例。
 */
import { coreStore } from '../core'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyStore = { getState: () => any; subscribe: (cb: () => void) => () => void; setState: (p: any) => void }

function store(name: string): AnyStore {
  return coreStore<AnyStore>(name)
}

/** useXxxStore 形态：可直接调用（selector）也可 .getState() */
function useStoreHook(name: string) {
  const s = store(name)
  const hook = (selector?: (state: any) => any): any =>
    selector ? selector(s.getState()) : s.getState()
  hook.getState = () => s.getState()
  hook.subscribe = (cb: () => void) => s.subscribe(cb)
  hook.setState = (p: any) => s.setState(p)
  return hook
}

export const useConfigStore = useStoreHook('useConfigStore') as any
export const useWorkspaceStore = useStoreHook('useWorkspaceStore') as any
export const useViewStore = useStoreHook('useViewStore') as any
export const useToastStore = useStoreHook('useToastStore') as any
export const useInputUIStore = useStoreHook('useInputUIStore') as any
export const useUiSlotStore = useStoreHook('useUiSlotStore') as any
export const useThemeStore = useStoreHook('useThemeStore') as any
export const useModelProfileStore = useStoreHook('useModelProfileStore') as any
export const useSessionConfig = useStoreHook('useSessionConfig') as any
export const useEngineMetadataStore = useStoreHook('useEngineMetadataStore') as any
export const useCliInfoStore = useStoreHook('useCliInfoStore') as any
export const useAgentStore = useStoreHook('useAgentStore') as any
export const useCapCatalogStore = useStoreHook('useCapCatalogStore') as any
export const usePluginStore = useStoreHook('usePluginStore') as any
export const useOverlayStore = useStoreHook('useOverlayStore') as any
export const useSnippetStore = useStoreHook('useSnippetStore') as any
export const useSkillStore = useStoreHook('useSkillStore') as any
export const useFileEditorStore = useStoreHook('useFileEditorStore') as any
export const useCompactHandoffStore = useStoreHook('useCompactHandoffStore') as any
export const useDispatchStore = useStoreHook('useDispatchStore') as any

// sessionStoreManager（宿主 zustand store，非 hook 命名）
export const sessionStoreManager: AnyStore = store('sessionStoreManager')

// ── 非 hook 具名导出（宿主单例转发）──
export function getSessionConfig(): any {
  return useSessionConfig.getState().config
}
export function selectSlotFill(slots: Record<string, unknown> | undefined, slotId: string): any {
  if (!slots) return null
  return (slots as Record<string, any>)[slotId] ?? null
}

// ── 会话域转发（host/conversationStore 同实例，host 树相对引用不可达时经桥取）──
export * from '../host/conversationStore/sessionStoreManager'
export * from '../host/conversationStore/useActiveSession'
export * from '../host/conversationStore/conversationStoreUtils'

// ── uiSlotStore 类型（宿主同形定义）──
export type SlotId = string
export interface SlotFill {
  kind: string
  component?: unknown
  props?: Record<string, unknown>
  order?: number
}

export interface InputBanner {
  tone?: string
  title?: string
  message?: string
  [k: string]: unknown
}
