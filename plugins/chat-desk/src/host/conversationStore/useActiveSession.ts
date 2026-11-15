/**
 * useActiveSession 桥转发（原 host/conversationStore 拷贝实现已移除）。
 * 全部导出 = 宿主 appCore.stores.useActiveSession 命名空间同名函数。
 */
import { coreStore } from '../../shims/stores'

const hostActive: any = new Proxy({}, {
  get: (_t, p) => coreStore<Record<string, any>>('useActiveSession')[p as string],
})

export const useSessionState: any = (...args: unknown[]) => (hostActive.useSessionState as any)(...args)
export const useActiveSessionMessages: any = (...args: unknown[]) => (hostActive.useActiveSessionMessages as any)(...args)
export const useActiveSessionStreaming: any = (...args: unknown[]) => (hostActive.useActiveSessionStreaming as any)(...args)
export const useActiveSessionKernelStreaming: any = (...args: unknown[]) => (hostActive.useActiveSessionKernelStreaming as any)(...args)
export const useActiveSessionError: any = (...args: unknown[]) => (hostActive.useActiveSessionError as any)(...args)
export const useActiveSessionActions: any = (...args: unknown[]) => (hostActive.useActiveSessionActions as any)(...args)
export const useActiveSessionBlockMaps: any = (...args: unknown[]) => (hostActive.useActiveSessionBlockMaps as any)(...args)
export const useHasPendingQuestion: any = (...args: unknown[]) => (hostActive.useHasPendingQuestion as any)(...args)
export const useHasActivePlan: any = (...args: unknown[]) => (hostActive.useHasActivePlan as any)(...args)
export const usePendingQuestions: any = (...args: unknown[]) => (hostActive.usePendingQuestions as any)(...args)
export const useActiveSessionConversationId: any = (...args: unknown[]) => (hostActive.useActiveSessionConversationId as any)(...args)
export const useActiveSessionInputDraft: any = (...args: unknown[]) => (hostActive.useActiveSessionInputDraft as any)(...args)
export const useActiveSessionPendingBriefing: any = (...args: unknown[]) => (hostActive.useActiveSessionPendingBriefing as any)(...args)
export const useActiveSessionPromptOptimize: any = (...args: unknown[]) => (hostActive.useActiveSessionPromptOptimize as any)(...args)
export const useActiveSessionPromptSuggestion: any = (...args: unknown[]) => (hostActive.useActiveSessionPromptSuggestion as any)(...args)
export const useActiveSessionUsage: any = (...args: unknown[]) => (hostActive.useActiveSessionUsage as any)(...args)
export const useActiveSessionWorkspace: any = (...args: unknown[]) => (hostActive.useActiveSessionWorkspace as any)(...args)
export const useActiveSessionStreamRate: any = (...args: unknown[]) => (hostActive.useActiveSessionStreamRate as any)(...args)
export const useSessionMessages: any = (...args: unknown[]) => (hostActive.useSessionMessages as any)(...args)
export const useSessionStreaming: any = (...args: unknown[]) => (hostActive.useSessionStreaming as any)(...args)
export const useSessionError: any = (...args: unknown[]) => (hostActive.useSessionError as any)(...args)
export const useSessionHistoryPaging: any = (...args: unknown[]) => (hostActive.useSessionHistoryPaging as any)(...args)
export const useSessionVisibleRange: any = (...args: unknown[]) => (hostActive.useSessionVisibleRange as any)(...args)
export const useSessionHasPendingQuestion: any = (...args: unknown[]) => (hostActive.useSessionHasPendingQuestion as any)(...args)
export const useSessionHasPendingCards: any = (...args: unknown[]) => (hostActive.useSessionHasPendingCards as any)(...args)
