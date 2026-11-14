/**
 * utils shim —— host 树 `@/utils/*` 导入。
 * 纯函数工具（uuid/path/formatTokens 等）本地实现同源复制；
 * 依赖宿主态的（logger/engineDisplay/highlight/performance）转发宿主或轻量实现。
 */

// ── logger ──
type Level = 'debug' | 'info' | 'warn' | 'error'
function mkLogger(scope: string) {
  const emit = (level: Level, msg: string, args: unknown[]) => {
    if (level === 'debug') return
    const text = `[chat-desk] ${scope} ${msg}`.trim()
    // eslint-disable-next-line no-console
    console[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log'](text, ...args)
  }
  return {
    debug: (m: string, ...a: unknown[]) => emit('debug', m, a),
    info: (m: string, ...a: unknown[]) => emit('info', m, a),
    warn: (m: string, ...a: unknown[]) => emit('warn', m, a),
    error: (m: string, ...a: unknown[]) => emit('error', m, a),
  }
}
const loggers = new Map<string, ReturnType<typeof mkLogger>>()
export function createLogger(scope: string) {
  let lg = loggers.get(scope)
  if (!lg) { lg = mkLogger(scope); loggers.set(scope, lg) }
  return lg
}
export const logger = createLogger('utils')

// ── 同源复制模块 re-export（与宿主 utils/* 逐文件对齐）──
export { generateUUID } from './uuid'
export * from './path'
export { formatTokens, formatTokensStrict } from './formatTokens'
export { copyToClipboard } from './clipboard'
export { normalizeEngineId, getEngineDisplayName, getEngineFullName } from './engineDisplay'
export { getEngineSelectors, getEngineEffortOptions, getEnginePermissionOptions } from './engineCapabilities'
export { getSelectedEngineHealth } from './engineHealth'
export { isEditTool, isWriteTool, extractEditDiff, extractWriteInfo } from './diffExtractor'
export { parseApplyPatch } from './patchParser'
export { MessageCompactor, isCompacted } from './messageCompactor'
export { groupConversationRounds, findCurrentRoundIndexForRange, getRoundScrollTargetIndex } from './conversationRounds'
export { markdownCache } from './cache'
export { highlightCache, LANGUAGE_DISPLAY_NAMES } from './highlight'
export { getLanguageFromPath } from './language'
export { ProgressiveStreamingMarkdown } from './lightweightMarkdown'
export { getMermaidConfig } from './mermaid-config'
export { sanitizeMermaidSvg } from './sanitizeMermaidSvg'
export { highlightCode } from './syntaxHighlight'
export { ansiToHtml } from './ansiToHtml'
export { MCP_TOOL_PREFIX, extractToolKeyInfo, getToolCategoryDescription, getToolConfig, getToolDisplayName, getToolShortName } from './toolConfig'
export { extractCommand, extractFilePath, extractFullFilePath, extractRelativeDirFromPath, extractRelativeDir, extractFullCommand, extractSearchQuery, normalizeCommandForDisplay } from './toolInputExtractor'
export { calculateDuration, formatDuration, escapeRegExp, stripAnsiCodes, parseGrepMatches, generateCollapsedSummary } from './toolSummary'
export { usePerformanceFlag } from './performanceFeatures'

export { modKey } from './path'
