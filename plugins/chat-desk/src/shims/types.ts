/**
 * types shim —— host 树 `@/types`（barrel）与 `@/types/chat` 等导入。
 * Chat 域类型随 host 树自带；config/workspace/errors 等从宿主拷贝为本地类型文件。
 * 全部为 type-only re-export，无运行时代价。
 */
export * from '../host/types/chat'
export * from '../host/types/config'
export * from '../host/types/workspace'
export * from '../host/types/fileExplorer'
export * from '../host/types/fileEditor'
export * from '../host/types/context'
export * from '../host/types/scmDiff'
export * from '../host/types/terminalScript'
export * from '../host/types/attachment'
export * from '../host/types/errors'
export * from '../host/types/modelProfile'
export * from '../host/types/engineMetadata'
export * from '../host/types/browserContext'
export * from '../host/types/promptSnippet'
export * from '../host/types/skill'
export * from '../host/types/sessionConfig'
// src/types/index 与上面 host/types 同名文件双 re-export 会让 esbuild 报
// 「Ambiguous import has multiple matching exports」（toAppError/ErrorSource 等）。
// host/types 已覆盖 src/types 全部同名集合，这里只补 host 树没有的 session 域类型。
export * from '../types/session'
