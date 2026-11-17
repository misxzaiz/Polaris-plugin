/**
 * plugin-system 类型 re-export（settings-desk）
 *
 * PluginTab/PluginConfigForm 原从 `@/plugin-system/types` 导入；类型为纯 TS
 * 无运行时，直接同源拷贝（chat-desk host/plugin-system/types 同款做法）。
 */
export type {
  PolarisPluginManifest,
  PluginConfigFieldSchema,
  PluginConfigSchema,
  PluginViewContribution,
  PluginPanelContribution,
  PluginMcpServerContribution,
  PluginStyleContribution,
  PluginChatCardContribution,
  PluginEngineContribution,
  PluginHookContribution,
  PluginOverlayContribution,
  PluginToolProviderContribution,
  PluginUiTemplateContribution,
  PluginPermissionDeclaration,
  PluginLeftPanelType,
  PluginOriginMetadata,
  PluginManifestSource,
  PluginDevLinkInfo,
} from './psTypes'
