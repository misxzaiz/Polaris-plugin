/* eslint-disable @typescript-eslint/no-explicit-any */
/** 统一宿主/本地依赖出口（K-F2 会话 chrome 迁入的引用面）。
 *  运行时转发 shims/services 与本地 store；类型在 tsc 由同名声明兜底。 */

export {
  // shims/services 转发的总线能力
  aiChatDispatch,
  aiChatDispatchStream,
  addClaudePermissionRules,
  buildCapDetailBlock,
  buildCapDigestBlock,
  buildCapReferenceBlock,
  consumeCapUiDispatch,
  currentMode,
  dialogStorageService,
  dispatchFromUser,
  eventBus,
  getDefaultCompactInstruction,
  getEventRouter,
  getTracker,
  getUserSystemPrompt,
  invoke,
  listen,
  matchCaps,
  openExternalLink,
  packForReference,
  parseAgentSlashCommand,
  parseAssaultSlashCommand,
  parseCapSlashCommand,
  parseDispatchSlashCommand,
  parseNexusSlashCommand,
  parseWorkspaceReferences,
  resetEventRouter,
  resetTracker,
  resolveTemplateVariables,
  rewriteDispatchPromptWithAgent,
  saveMarkdownImage,
  // K-F2：promptOptimize / promptHistory / cliSlashCommands / handoff / packager
  runPromptOptimize,
  cancelPromptOptimize,
  usePromptOptimizePreview,
  readStoredOptimizeConfig,
  storeOptimizeConfig,
  readPromptHistoryEntries,
  persistPromptHistoryEntries,
  getCliCommandSuggestions,
  matchBlockedCliCommand,
  loadConversationMessages,
  packToFile,
  saveChatToFile,
} from './shims/services'

export {
  useDispatchStore,
  useFileEditorStore,
  useInputUIStore,
  useModelProfileStore,
  useOverlayStore,
  usePluginStore,
  useSkillStore,
  useSnippetStore,
  useThemeStore,
  useToastStore,
  useUiSlotStore,
  useViewStore,
  useWorkspaceStore,
} from './shims/stores'
export {
  useContainerWidth,
  useDebouncedCallback,
  useNowTicker,
  useWindowSize,
  useFileSearch,
} from './shims/hooks'

// stores 侧符号（selectSlotFill/sessionStoreManager 等在 shims/stores）
export {
  selectSlotFill,
  sessionStoreManager,
  useCapCatalogStore,
  useCompactHandoffStore,
  useConfigStore,
} from './shims/stores'

// 常量
export { NEXUS_SCENARIOS } from './shims/services'

// 本地同源 store（会话域）
export {
  sessionDirectoryStore,
} from './sessionDirectoryStore'

// chatExport 域内实现
export { exportToMarkdown as exportConversation, generateFileName as buildExportFilename } from './chatExport'

// 类型与谓词（chatExport/BlockCardOverrideHost 消费）
export type { ChatMessage, AssistantChatMessage, UserChatMessage, ContentBlock } from './types/chat'
export { isTextBlock, isToolCallBlock, isSystemMessage } from './types/chat'

// ── K-F2 补齐：host 树经 deps 引用的类型与纯函数 ──
export type { EngineId } from './host/types/config'
export { getChatDisplayStyleVars } from './host/types/config'
export type { ThinkingBlock, QuestionBlock, PluginCardBlock, TaskBoardItem, TaskBoardBlock, ContextCompactBlock } from './types/chat'
export type { Workspace } from './host/types/workspace'
export type { StreamRateSnapshot } from './host/types/streamRate'
export type { TransferMode, TransferModeInput } from './host/services/conversationPackager/types'
export type { QuickWorkspaceInfo, QuickSessionInfo } from './QuickSwitchPanel/types'

// ── K-F2 第二批：host 树经 deps 引用的其余类型 ──
export type { AgentRunBlock, FormBlock, FormFieldSchema, PermissionDenialBlock, PermissionRequestBlock, PermissionScope, PlanModeBlock, PlanModeStatus, QuestionItem, SubAnswer, TextBlock, ToolCallBlock, ToolStatus } from './host/types/chat'
export type { CapCatalogEntry } from './host/services/capSlashCommand'
export type { CollapsibleBlockGroup, ThinkingStep } from './host/Chat/chatUtils/types'
export type { ConversationActions, ConversationState, ConversationStore, SessionManagerActions, SessionMetadata, SessionStoreManager } from './host/conversationStore/types'
export type { ConversationStoreInstance } from './host/conversationStore/createConversationStore'
export type { FileMatch } from './shims/services'
export type { HandoffMode } from './host/services/contextCompactHandoff'
export type { InputBanner } from './shims/stores'
export type { KernelEvent } from './host/session-v2/kernel/types'
export type { PackToFileResult } from './host/services/conversationPackager/types'
export type { PluginChatCardComponent, PluginChatCardContribution } from './host/plugin-system/types'
export type { PromptOptimizeConfig } from './host/services/promptOptimizeService'
export type { QuickSwitchPanelProps } from './QuickSwitchPanel/types'
export type { SlotFill, SlotId } from './shims/stores'
export type { QuestionOption } from './host/ai-runtime/event'
export { readNewSessionPrefs, persistNewSessionPrefs } from './newSessionPrefsService'

export type { CompactHandoffStage } from './host/services/contextCompactHandoff'
export type { CliCommandSuggestion } from './shims/services'
export type { SystemChatMessage } from './host/types/chat'
export type { EventRouter } from './shims/services'

export type { ContextBlock } from './host/conversationStore/types'
export type { PluginChatCardLoader } from './host/plugin-system/types'
export type { SessionManagerState } from './host/conversationStore/types'
