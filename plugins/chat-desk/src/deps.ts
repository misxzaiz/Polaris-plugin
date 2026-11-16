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
  getChatDisplayStyleVars,
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
export { exportConversation, buildExportFilename } from './chatExport'

// 类型与谓词（chatExport/BlockCardOverrideHost 消费）
export type { ChatMessage, AssistantChatMessage, UserChatMessage, ContentBlock } from './types/chat'
export { isTextBlock, isToolCallBlock, isSystemMessage } from './types/chat'
