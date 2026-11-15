import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const src = resolve(root, 'src')
const shims = resolve(src, 'shims')

// 与 scripts/build.mjs 的 alias 语义一致（会话域单实例 + shims 转发）。
// 显式清单：只列测试触达面；@/ 兜底指 src/（host 自带实现/类型）。
export default defineConfig({
  resolve: {
    alias: [
      // 测试环境：会话域指向插件内真实现（vi.mock 按宿主原路径 mock 才能命中）。
      // 面板运行时的单实例约束由 bootstrap 反向桥保证，与测试解析无关。
      { find: '@/stores/conversationStore/sessionStoreManager', replacement: resolve(src, 'host/conversationStore/sessionStoreManager.ts') },
      { find: '@/stores/conversationStore/useActiveSession', replacement: resolve(src, 'host/conversationStore/useActiveSession.ts') },
      { find: '@/stores/conversationStore/conversationStoreUtils', replacement: resolve(src, 'host/conversationStore/conversationStoreUtils.ts') },
      { find: '@/stores/conversationStore/types', replacement: resolve(src, 'host/conversationStore/types.ts') },
      { find: '@/stores/conversationStore', replacement: resolve(src, 'host/conversationStore/index.ts') },
      { find: /^@\/hooks\/.+$/, replacement: resolve(shims, 'hooks.ts') },
      { find: '@/hooks', replacement: resolve(shims, 'hooks.ts') },
      { find: '@/utils/ansiToHtml', replacement: resolve(shims, 'ansiToHtml.ts') },
      { find: '@/utils/cache', replacement: resolve(shims, 'cache.ts') },
      { find: '@/utils/clipboard', replacement: resolve(shims, 'clipboard.ts') },
      { find: '@/utils/conversationRounds', replacement: resolve(shims, 'conversationRounds.ts') },
      { find: '@/utils/diffExtractor', replacement: resolve(shims, 'diffExtractor.ts') },
      { find: '@/utils/engineCapabilities', replacement: resolve(shims, 'engineCapabilities.ts') },
      { find: '@/utils/engineDisplay', replacement: resolve(shims, 'engineDisplay.ts') },
      { find: '@/utils/engineHealth', replacement: resolve(shims, 'engineHealth.ts') },
      { find: '@/utils/formatTokens', replacement: resolve(shims, 'formatTokens.ts') },
      { find: '@/utils/highlight', replacement: resolve(shims, 'highlight.ts') },
      { find: '@/utils/language', replacement: resolve(shims, 'language.ts') },
      { find: '@/utils/lightweightMarkdown', replacement: resolve(shims, 'lightweightMarkdown.tsx') },
      { find: '@/utils/logger', replacement: resolve(shims, 'logger.ts') },
      { find: '@/utils/lru-cache', replacement: resolve(shims, 'lru-cache.ts') },
      { find: '@/utils/mermaid-config', replacement: resolve(shims, 'mermaid-config.ts') },
      { find: '@/utils/messageCompactor', replacement: resolve(shims, 'messageCompactor.ts') },
      { find: '@/utils/patchParser', replacement: resolve(shims, 'patchParser.ts') },
      { find: '@/utils/path', replacement: resolve(shims, 'path.ts') },
      { find: '@/utils/performanceFeatures', replacement: resolve(shims, 'performanceFeatures.ts') },
      { find: '@/utils/sanitizeMermaidSvg', replacement: resolve(shims, 'sanitizeMermaidSvg.ts') },
      { find: '@/utils/sessionExport', replacement: resolve(shims, 'sessionExport.ts') },
      { find: '@/utils/syntaxHighlight', replacement: resolve(shims, 'syntaxHighlight.ts') },
      { find: '@/utils/toolConfig', replacement: resolve(shims, 'toolConfig.ts') },
      { find: '@/utils/toolInputExtractor', replacement: resolve(shims, 'toolInputExtractor.ts') },
      { find: '@/utils/toolSummary', replacement: resolve(shims, 'toolSummary.ts') },
      { find: '@/utils/uuid', replacement: resolve(shims, 'uuid.ts') },
      { find: '@/utils/workspacePath', replacement: resolve(shims, 'workspacePath.ts') },
      { find: '@/utils', replacement: resolve(shims, 'utils.ts') },
      { find: '@/components/Chat', replacement: resolve(src, 'host/Chat') },
      { find: '@/ai-runtime', replacement: resolve(src, 'host/ai-runtime') },
      { find: '@/session-v2', replacement: resolve(src, 'host/session-v2') },
      { find: '@/engines', replacement: resolve(src, 'host/engines') },
      { find: '@/types/attachment', replacement: resolve(src, 'types/attachment.ts') },
      { find: '@/types/browserContext', replacement: resolve(src, 'types/browserContext.ts') },
      { find: '@/types/chat', replacement: resolve(src, 'types/chat.ts') },
      { find: '@/types/config', replacement: resolve(src, 'types/config.ts') },
      { find: '@/types/context', replacement: resolve(src, 'types/context.ts') },
      { find: '@/types/engineMetadata', replacement: resolve(src, 'types/engineMetadata.ts') },
      { find: '@/types/errors', replacement: resolve(src, 'types/errors.ts') },
      { find: '@/types/fileEditor', replacement: resolve(src, 'types/fileEditor.ts') },
      { find: '@/types/fileExplorer', replacement: resolve(src, 'types/fileExplorer.ts') },
      { find: '@/types/modelProfile', replacement: resolve(src, 'types/modelProfile.ts') },
      { find: '@/types/promptSnippet', replacement: resolve(src, 'types/promptSnippet.ts') },
      { find: '@/types/scmDiff', replacement: resolve(src, 'types/scmDiff.ts') },
      { find: '@/types/sessionConfig', replacement: resolve(src, 'types/sessionConfig.ts') },
      { find: '@/types/skill', replacement: resolve(src, 'types/skill.ts') },
      { find: '@/types/terminalScript', replacement: resolve(src, 'types/terminalScript.ts') },
      { find: '@/types/workspace', replacement: resolve(src, 'types/workspace.ts') },
      { find: '@/types', replacement: resolve(src, 'types/index.ts') },
      { find: '@/components', replacement: resolve(shims, 'misc.ts') },
      { find: '@/plugin-system/uiFrameTypes', replacement: resolve(src, 'host/plugin-system/uiFrameTypes.ts') },
      { find: '@/plugin-system/chatCardRegistry', replacement: resolve(src, 'host/plugin-system/chatCardRegistry.ts') },
      { find: '@/plugin-system/types', replacement: resolve(src, 'host/plugin-system/types.ts') },
      { find: '@/plugin-system', replacement: resolve(shims, 'misc.ts') },
      { find: '@/i18n', replacement: resolve(shims, 'i18n.ts') },
      { find: /^@\/stores\/.+$/, replacement: resolve(shims, 'stores.ts') },
      { find: '@/stores', replacement: resolve(shims, 'stores.ts') },
      { find: '@/services/capSlashCommand', replacement: resolve(src, 'host/services/capSlashCommand.ts') },
      { find: /^@\/services\/.+$/, replacement: resolve(shims, 'services.ts') },
      { find: '@/services', replacement: resolve(shims, 'services.ts') },
      { find: 'react-i18next', replacement: resolve(shims, 'i18n.ts') },
      { find: '@/', replacement: `${src}/` },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    server: {
      deps: {
        inline: ['react-i18next', 'i18next'],
      },
    },
    setupFiles: ['vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'src/host/session-v2/tests/**', 'src/host/conversationStore/**', 'src/host/Chat/**', 'src/host/engines/**', 'src/host/services/dispatchTaskService.test.ts'],
  },
})
