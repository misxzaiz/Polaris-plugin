/**
 * services shim —— host 树里所有 `@/services/*` 导入经 alias 解析到本文件。
 * 一律懒解引用宿主单例（import 期不触发，循环依赖安全）；
 * 函数转发 + Proxy 对象两种形态，新增消费在 appCoreBridge 补挂即可。
 */
import { coreService } from '../core'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFn = (...args: any[]) => any

function fn(name: string, member: string): AnyFn {
  return ((...args: unknown[]) => {
    const svc = coreService<Record<string, AnyFn>>(name)
    const f = svc[member] as AnyFn
    return f(...args)
  }) as AnyFn
}

function lazyObj(name: string): Record<string, unknown> {
  return new Proxy({}, {
    get: (_t, prop) => (coreService<Record<string, unknown>>(name) as Record<string, unknown>)[prop as string],
  })
}

// ── transport（host 树 import { invoke, listen, currentMode, emit }）──
export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return (coreService<{ invoke: (c: string, a?: Record<string, unknown>) => Promise<unknown> }>('transport').invoke)(cmd, args) as Promise<T>
}
export function listen<T = unknown>(event: string, handler: (p: T) => void): Promise<() => void> {
  return (coreService<{ listen: (e: string, h: (p: unknown) => void) => Promise<() => void> }>('transport').listen)(event, handler as (p: unknown) => void) as Promise<() => void>
}
export const emit: AnyFn = (...args) => (coreService<{ emit: AnyFn }>('transport').emit)(...args)
export const manualReconnect: AnyFn = (...args) => (coreService<{ manualReconnect: AnyFn }>('transport').manualReconnect)(...args)
export const currentMode: string = coreService<{ currentMode: string }>('transport').currentMode

// ── aiChatDispatch ──
export function aiChatDispatch<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  return (coreService<{ aiChatDispatch: (p: Record<string, unknown>) => Promise<unknown> }>('aiChatDispatch').aiChatDispatch)(payload) as Promise<T>
}
import * as _aiChatDispatchLocal from '../host/services/aiChatDispatch'
export const aiChatDispatchStream: AnyFn = (...args) => ((_aiChatDispatchLocal as unknown as Record<string, AnyFn>).aiChatDispatchStream)(...args)

// ── dialogStorage ──
export const dialogStorageService: any = lazyObj('dialogStorageService')
export const maybeAutoMigrateOpfs: AnyFn = (...args) => (coreService<any>('maybeAutoMigrateOpfs'))(...args)

// ── eventRouter / eventBus ──
// P6：eventRouter 实现随域迁入插件（host/services/eventRouter），不再经宿主桥。
// 静态 import 自实现模块（无环：eventRouter → manager → shims/stores → core，
// shims/services 不被那条链引用）。
import { getEventRouter as _localGetEventRouter, resetEventRouter, ensureEventRouterInitialized } from '../host/services/eventRouter'
export const getEventRouter: AnyFn = (...args) => (_localGetEventRouter as AnyFn)(...args)
export { resetEventRouter, ensureEventRouterInitialized }
export const eventBus: any = lazyObj('eventBus')

// ── 跨端/静默服务 ──
export const remoteSessionFollower: any = lazyObj('remoteSessionFollower')
import * as _webReconnectResyncLocal from '../host/services/webReconnectResync'
export const resyncAfterResumeGap: AnyFn = (...args) => ((_webReconnectResyncLocal as unknown as Record<string, AnyFn>).resyncAfterResumeGap)(...args)
export const manualRefreshActiveSession: AnyFn = (...args) => ((_webReconnectResyncLocal as unknown as Record<string, AnyFn>).manualRefreshActiveSession)(...args)

// ── chatService（tauri/chatService.ts 具名导出）──
export const registerPendingQuestion: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('chatService').registerPendingQuestion)(...args)
export const answerQuestion: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('chatService').answerQuestion)(...args)
export const respondPluginCard: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('chatService').respondPluginCard)(...args)
export const getPendingQuestions: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('chatService').getPendingQuestions)(...args)
export const clearAnsweredQuestions: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('chatService').clearAnsweredQuestions)(...args)
export const registerPendingPlan: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('chatService').registerPendingPlan)(...args)
export const approvePlan: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('chatService').approvePlan)(...args)
export const rejectPlan: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('chatService').rejectPlan)(...args)
export const getPendingPlans: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('chatService').getPendingPlans)(...args)
export const clearProcessedPlans: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('chatService').clearProcessedPlans)(...args)
export const sendInput: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('chatService').sendInput)(...args)
export const saveChatToFile: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('chatService').saveChatToFile)(...args)

// ── 恢复/交接/压缩/优化/历史/派发 ──
import * as _localSessionRestore from '../host/services/sessionRestore'
export const restoreFromHistory: AnyFn = (...args) => ((_localSessionRestore as unknown as Record<string, AnyFn>).restoreFromHistory)(...args)
export const forkSession: AnyFn = (...args) => ((_localSessionRestore as unknown as Record<string, AnyFn>).forkSession)(...args)
export const ensureWorkspace: AnyFn = (...args) => ((_localSessionRestore as unknown as Record<string, AnyFn>).ensureWorkspace)(...args)
export const loadMessagesForItem: AnyFn = (...args) => ((_localSessionRestore as unknown as Record<string, AnyFn>).loadMessagesForItem)(...args)
export const loadBackendMessages: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('sessionArchive').loadBackendMessages)(...args)
export const aiHistoryDispatch: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('aiHistoryDispatch').aiHistoryDispatch)(...args)

export const getHandoffEligibility: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('sessionHandoff').getHandoffEligibility)(...args)
export const handoffSessionToNewSession: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('sessionHandoff').handoffSessionToNewSession)(...args)
export const getHistoryHandoffEligibility: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('sessionHandoff').getHistoryHandoffEligibility)(...args)
export const handoffHistorySessionToNewSession: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('sessionHandoff').handoffHistorySessionToNewSession)(...args)
export const loadConversationMessages: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('sessionHandoff').loadConversationMessages)(...args)

import * as _localCCH from '../host/services/contextCompactHandoff'
export const compactAndHandoff: AnyFn = (...args) => ((_localCCH as unknown as Record<string, AnyFn>).compactAndHandoff)(...args)
export type CompactHandoffStage = import('../host/services/contextCompactHandoff').CompactHandoffStage
export type CompactHandoffParams = import('../host/services/contextCompactHandoff').CompactHandoffParams
export const requestCompactHandoff: AnyFn = (...args) => ((_localCCH as unknown as Record<string, AnyFn>).compactAndHandoff)(...args)
export const cancelCompactHandoff: AnyFn = (...args) => ((_localCCH as unknown as Record<string, AnyFn>).getDefaultCompactInstruction)(...args)

import * as _localPromptOptimize from '../host/services/promptOptimizeService'
export const runPromptOptimize: AnyFn = (...args) => ((_localPromptOptimize as unknown as Record<string, AnyFn>).runPromptOptimize)(...args)
export const cancelPromptOptimize: AnyFn = (...args) => ((_localPromptOptimize as unknown as Record<string, AnyFn>).cancelPromptOptimize)(...args)
export const readStoredOptimizeConfig: AnyFn = (...args) => ((_localPromptOptimize as unknown as Record<string, AnyFn>).readStoredOptimizeConfig)(...args)
export const storeOptimizeConfig: AnyFn = (...args) => ((_localPromptOptimize as unknown as Record<string, AnyFn>).storeOptimizeConfig)(...args)
export const usePromptOptimizePreview: AnyFn = (...args) => ((_localPromptOptimize as unknown as Record<string, AnyFn>).usePromptOptimizePreview)(...args)

export const promptHistoryKey: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('promptHistoryService').promptHistoryKey)(...args)
export const readPromptHistoryEntries: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('promptHistoryService').readPromptHistoryEntries)(...args)
export const persistPromptHistoryEntries: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('promptHistoryService').persistPromptHistoryEntries)(...args)

export const parseDispatchSlashCommand: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('dispatchTaskService').parseDispatchSlashCommand)(...args)
export const dispatchFromUser: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('dispatchTaskService').dispatchFromUser)(...args)
export const initDispatchTaskListener: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('dispatchTaskService').initDispatchTaskListener)(...args)

// ── 流速/UIDispatch/斜杠命令目录 ──
export const getTracker: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('streamRateTracker').getTracker)(...args)
export const resetTracker: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('streamRateTracker').resetTracker)(...args)
export const dropTracker: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('streamRateTracker').dropTracker)(...args)
export const estimateTokens: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('streamRateTracker').estimateTokens)(...args)

export const consumeCapUiDispatch: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('uiDispatchService').consumeCapUiDispatch)(...args)
export const dispatchCapUiAction: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('uiDispatchService').dispatchCapUiAction)(...args)

export const parseCapSlashCommand: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('capSlashCommand').parseCapSlashCommand)(...args)
export const matchCaps: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('capSlashCommand').matchCaps)(...args)
export const buildCapDigestBlock: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('capSlashCommand').buildCapDigestBlock)(...args)
export const buildCapDetailBlock: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('capSlashCommand').buildCapDetailBlock)(...args)
export const buildCapReferenceBlock: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('capSlashCommand').buildCapReferenceBlock)(...args)

export const getCliCommandSuggestions: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('cliSlashCommands').getCliCommandSuggestions)(...args)
export const matchBlockedCliCommand: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('cliSlashCommands').matchBlockedCliCommand)(...args)
export const parseAssaultSlashCommand: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('cliSlashCommands').parseAssaultSlashCommand)(...args)
export const CLI_SUGGESTED_COMMANDS = coreService<Record<string, unknown>>('cliSlashCommands').CLI_SUGGESTED_COMMANDS
export const CLI_KNOWN_HIDDEN_COMMANDS = coreService<Record<string, unknown>>('cliSlashCommands').CLI_KNOWN_HIDDEN_COMMANDS
export const CLI_BLOCKED_COMMANDS = coreService<Record<string, unknown>>('cliSlashCommands').CLI_BLOCKED_COMMANDS

export const parseNexusSlashCommand: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('agentSlashCommand').parseNexusSlashCommand)(...args)
export const parseAgentSlashCommand: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('agentSlashCommand').parseAgentSlashCommand)(...args)
export const rewriteDispatchPromptWithAgent: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('agentSlashCommand').rewriteDispatchPromptWithAgent)(...args)
export const NEXUS_SCENARIOS: readonly string[] = (coreService<{ NEXUS_SCENARIOS: readonly string[] }>('agentSlashCommand').NEXUS_SCENARIOS)

// ── 打包/偏好/文件搜索/权限/图片/外链 ──
export const packForReference: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('conversationPackager').packForReference)(...args)
export const packToFile: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('conversationPackager').packToFile)(...args)
export const packToSummary: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('conversationPackager').packToSummary)(...args)

export const readNewSessionPrefs: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('newSessionPrefsService').readNewSessionPrefs)(...args)
export const persistNewSessionPrefs: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('newSessionPrefsService').persistNewSessionPrefs)(...args)

export const searchFiles: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('fileSearch').searchFiles)(...args)

export const addClaudePermissionRules: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('claudeSettingsService').addClaudePermissionRules)(...args)
export const readClaudeSettings: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('claudeSettingsService').readClaudeSettings)(...args)
export const writeClaudeSettings: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('claudeSettingsService').writeClaudeSettings)(...args)
export const getClaudeSettingsPath: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('claudeSettingsService').getClaudeSettingsPath)(...args)

export const saveMarkdownImage: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('imageSaveService').saveMarkdownImage)(...args)

export const registerExternalLinkGlobalHandler: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('linkExternal').registerExternalLinkGlobalHandler)(...args)
export const openExternal: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('linkExternal').openExternal)(...args)

// ── workspaceReference / transport/detector / contextCompactHandoff 补充转发 ──
export const getUserSystemPrompt: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('workspaceReference').getUserSystemPrompt)(...args)
export const parseWorkspaceReferences: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('workspaceReference').parseWorkspaceReferences)(...args)
export const resolveTemplateVariables: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('workspaceReference').resolveTemplateVariables)(...args)
export const detectClientDescriptor: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('detector').detectClientDescriptor)(...args)
export const getDefaultCompactInstruction: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('contextCompactHandoff').getDefaultCompactInstruction)(...args)


// ── 类型 re-export（host 树 import type 消费；与宿主服务文件同形）──
export type { CapCatalogEntry } from '../host/types/capCatalog'
export type { TokenUsageSummary } from '../host/types/tokenUsage'

// ── 类型/别名补齐（与宿主服务文件同形）──
export const openExternalLink: AnyFn = (...args) => (coreService<Record<string, AnyFn>>('linkExternal').openExternal)(...args)
export type HandoffMode = 'newSession' | 'copyPrompt'
export type PromptOptimizeMode = 'quick' | 'deep'
export type OptimizeDirection = 'structured' | 'convergent' | 'divergent' | 'elaborate' | 'custom'
export interface FileMatch { name: string; relativePath: string; fullPath: string; isDir: boolean; extension?: string; size?: number }
export interface CliCommandSuggestion { name: string; argumentHint?: string; descKey: string; description?: string }
export interface PromptOptimizeConfig { engineId?: string; mode?: PromptOptimizeMode; modelProfileId?: string; model?: string; direction?: OptimizeDirection; customDirectionText?: string; [k: string]: unknown }
export function isListableRemote(s: { status: string; endedAt?: number }): boolean {
  return s.status !== 'ended' || !s.endedAt
}
export type EventRouter = ReturnType<typeof getEventRouter>
export type StreamRateSnapshot = import('../host/types/streamRate').StreamRateSnapshot
