/**
 * 宿主共享类型 re-export（settings-desk）
 *
 * Settings 域组件原从 `@/types` barrel 导入；插件内统一经本文件取单源类型
 * （config/theme/engineMetadata 与宿主 src/types 同源，host/config 取
 * chat-desk host/types 已验证零差异拷贝）。
 */
export type { Config, ConfigPatch, WebConfig, PerformanceFeatures, HealthStatus } from './types/config'
export type { EngineId, EngineMetadata, EngineCapabilities } from './types/engineMetadata'
export { getCapabilityLabels, getDistributionLabel } from './types/engineMetadata'
export type { ThemeId } from './types/theme'
export { isBuiltInThemeId } from './types/theme'
