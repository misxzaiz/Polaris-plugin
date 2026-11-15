/**
 * stores shim —— host 树的 `@/stores`（barrel）与 `@/stores/xxxStore` 导入。
 * 全部转发宿主单例（appCore.stores）。
 *
 * 订阅语义（多窗口网格不刷新根因修复，2026-11-15）：
 * 宿主导出的 useViewStore 等本身就是 zustand create() 产出的订阅型 hook
 * （内部 useSyncExternalStore）。此前的 useStoreHook 自造「裸读」包装——每次
 * 渲染直接 getState()，宿主 store 更新不触发面板重渲染，导致 MultiSessionGrid
 * 只显示首帧快照（新会话能对话但网格不出现）。这里直接转发宿主原 hook 实例，
 * 并补挂 getState/subscribe/setState（宿主 hook 自带 getState/subscribe/
 * setState，assign 仅兜底桥上缺成员的形态）。
 */
import { useSyncExternalStore } from 'react'
import { coreStore } from '../core'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyStore = { getState: () => any; subscribe: (cb: () => void) => () => void; setState: (p: any) => void }

function store(name: string): AnyStore {
  return coreStore<AnyStore>(name)
}

/** useXxxStore 形态：优先转发宿主原 zustand hook（订阅型）；桥上缺原 hook 时回退裸读 */
function useStoreHook(name: string) {
  const host = coreStore(name) as
    | (((selector?: (s: any) => any) => any) & Partial<AnyStore>)
    | undefined
  if (typeof host === 'function') {
    const hook = ((selector?: (s: any) => any): any => host(selector)) as any
    hook.getState = host.getState ?? (() => store(name).getState())
    hook.subscribe = host.subscribe ?? ((cb: () => void) => store(name).subscribe(cb))
    hook.setState = host.setState ?? ((p: any) => store(name).setState(p))
    return hook
  }
  // 兜底：宿主桥未暴露原 hook（不应发生）——保持旧裸读形态
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
export const sessionStoreManager: any = store('sessionStoreManager')

// ── 非 hook 具名导出（宿主单例转发）──
export function getSessionConfig(): any {
  return useSessionConfig.getState().config
}
export function selectSlotFill(slots: Record<string, unknown> | undefined, slotId: string): any {
  if (!slots) return null
  return (slots as Record<string, any>)[slotId] ?? null
}

// ── 会话域转发（宿主单实例）：全部经 appCore.stores 桥取，禁用 host/ 拷贝模块 ──
const hostActive: any = new Proxy({}, {
  get: (_t, p) => {
    const ua = coreStore<Record<string, any>>('useActiveSession') as Record<string, any>
    const v = ua[p as string]
    if (typeof v === 'function') return v
    // 宿主命名空间缺该导出 → 用 sessionStoreManager 派生（选择器型 hook）
    const sm: any = coreStore<any>('sessionStoreManager')
    if (p === 'useActiveSessionId') return () => sm.getState().activeSessionId
    if (p === 'useSessionMetadataList') return () => { const m = sm.getState().sessionMetadata; return m ? [...m.values()] : [] }
    if (p === 'useSessionManagerActions2') return () => {
      // 宿主版从 manager actions 命名空间取；桥上 store 即 manager 实例
      const st = sm.getState()
      return { switchSession: (id: string) => st.switchSession(id), closeSession: (id: string) => st.deleteSession(id), createSession: st.createSession, createSessionFromHistory: st.createSessionFromHistory, renameSession: (id: string, title: string) => st.updateSessionTitle(id, title) }
    }
    return undefined
  },
})
export function useActiveSessionId(): any {
  const sm: any = coreStore<any>('sessionStoreManager')
  return useSyncExternalStore(
    (cb: () => void) => sm.subscribe(cb),
    () => sm.getState().activeSessionId,
    () => sm.getState().activeSessionId,
  )
}
// 宿主版缓存数组语义：Map 引用不变时复用上次数组（防无限渲染）
let cachedMetadataMap: any = null
let cachedMetadataArray: any[] | null = null
export function useSessionMetadataList(): any {
  const sm: any = coreStore<any>('sessionStoreManager')
  return useSyncExternalStore(
    (cb: () => void) => sm.subscribe(cb),
    () => {
      const m = sm.getState().sessionMetadata
      if (m === cachedMetadataMap && cachedMetadataArray !== null) return cachedMetadataArray
      cachedMetadataMap = m
      cachedMetadataArray = m ? Array.from(m.values()) : []
      return cachedMetadataArray
    },
    () => [],
  )
}
export const useActiveSessionActions: any = (...args: unknown[]) => (hostActive.useActiveSessionActions as any)(...args)
export const useActiveSessionMessages: any = (...args: unknown[]) => (hostActive.useActiveSessionMessages as any)(...args)
export const useActiveSessionStreaming: any = (...args: unknown[]) => (hostActive.useActiveSessionStreaming as any)(...args)
export const useActiveSessionError: any = (...args: unknown[]) => (hostActive.useActiveSessionError as any)(...args)
export const useActiveSessionConversationId: any = (...args: unknown[]) => (hostActive.useActiveSessionConversationId as any)(...args)
export const useActiveSessionWorkspace: any = (...args: unknown[]) => (hostActive.useActiveSessionWorkspace as any)(...args)
export const useActiveSessionInputDraft: any = (...args: unknown[]) => (hostActive.useActiveSessionInputDraft as any)(...args)
export const useActiveSessionPendingQueue: any = (...args: unknown[]) => (hostActive.useActiveSessionPendingQueue as any)(...args)
export const useActiveSessionPendingBriefing: any = (...args: unknown[]) => (hostActive.useActiveSessionPendingBriefing as any)(...args)
export const useActiveSessionPromptOptimize: any = (...args: unknown[]) => (hostActive.useActiveSessionPromptOptimize as any)(...args)
export const useActiveSessionPromptSuggestion: any = (...args: unknown[]) => (hostActive.useActiveSessionPromptSuggestion as any)(...args)
export const useActiveSessionStreamRate: any = (...args: unknown[]) => (hostActive.useActiveSessionStreamRate as any)(...args)
export const useActiveSessionUsage: any = (...args: unknown[]) => (hostActive.useActiveSessionUsage as any)(...args)
export const useActiveSessionKernelStreaming: any = (...args: unknown[]) => (hostActive.useActiveSessionKernelStreaming as any)(...args)
export const useSessionState: any = (...args: unknown[]) => (hostActive.useSessionState as any)(...args)
export const useSessionStreaming: any = (...args: unknown[]) => (hostActive.useSessionStreaming as any)(...args)
export const useHasActivePlan: any = (...args: unknown[]) => (hostActive.useHasActivePlan as any)(...args)
export const useHasPendingQuestion: any = (...args: unknown[]) => (hostActive.useHasPendingQuestion as any)(...args)
export const useSessionHasPendingQuestion: any = (...args: unknown[]) => (hostActive.useSessionHasPendingQuestion as any)(...args)
export const useSessionHasPendingCards: any = (...args: unknown[]) => (hostActive.useSessionHasPendingCards as any)(...args)
export const conversationStoreUtils: any = new Proxy({}, { get: (_t, p) => (coreStore<Record<string, any>>('conversationStoreUtils') as Record<string, any>)[p as string] })

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

export function useSessionManagerActions(): any {
  const sm: any = coreStore<any>('sessionStoreManager')
  const st = sm.getState()
  return {
    switchSession: (id: string) => st.switchSession(id),
    closeSession: (id: string) => st.deleteSession(id),
    createSession: st.createSession,
    createSessionFromHistory: st.createSessionFromHistory,
    renameSession: (id: string, title: string) => st.updateSessionTitle(id, title),
  }
}
// SessionCell 等按会话订阅元数据（标题/状态/工作区联动刷新）
export function useSessionMetadata(sessionId: string | null): any {
  const sm: any = coreStore<any>('sessionStoreManager')
  return useSyncExternalStore(
    (cb: () => void) => sm.subscribe(cb),
    () => (sessionId ? sm.getState().sessionMetadata.get(sessionId) ?? null : null),
    () => null,
  )
}

export { coreStore }

// ── 会话域工具函数（宿主 conversationStoreUtils / modelProfileStore 同源转发）──
export function resolveEffectiveProfileId(...args: unknown[]): any {
  const u = coreStore<Record<string, any>>('conversationStoreUtils').resolveEffectiveProfileId
  return u(...args)
}
export function resolveSessionEngine(...args: unknown[]): any {
  const u = coreStore<Record<string, any>>('conversationStoreUtils').resolveSessionEngine
  return u(...args)
}
export function findStoreByConversationId(...args: unknown[]): any {
  const sm: any = coreStore<any>('sessionStoreManager')
  if (typeof sm.findStoreByConversationId === 'function') return sm.findStoreByConversationId(...args)
  // 宿主版为模块级函数：从 useActiveSession 命名空间兜底
  const ua = coreStore<Record<string, any>>('useActiveSession')
  if (typeof ua.findStoreByConversationId === 'function') return ua.findStoreByConversationId(...args)
  return null
}
