/**
 * conversationStoreUtils 桥转发（原 host/conversationStore 拷贝实现已移除）。
 * 全部导出 = 宿主 appCore.stores.conversationStoreUtils 命名空间同名函数。
 */
import { coreStore } from '../../shims/stores'

const hostUtils: any = new Proxy({}, {
  get: (_t, p) => coreStore<Record<string, any>>('conversationStoreUtils')[p as string],
})

export const resolveSessionEngine: any = (...args: unknown[]) => (hostUtils.resolveSessionEngine as any)(...args)
export const resolveAuxiliaryEngine: any = (...args: unknown[]) => (hostUtils.resolveAuxiliaryEngine as any)(...args)
export const resolveRuntimeConfigForEngine: any = (...args: unknown[]) => (hostUtils.resolveRuntimeConfigForEngine as any)(...args)
export const getDisabledPluginMcpServers: any = (...args: unknown[]) => (hostUtils.getDisabledPluginMcpServers as any)(...args)
export const resolveEffectiveProfileId: any = (...args: unknown[]) => (hostUtils.resolveEffectiveProfileId as any)(...args)
export const resolveEffectiveProfileMode: any = (...args: unknown[]) => (hostUtils.resolveEffectiveProfileMode as any)(...args)
export const isProfileModeWithoutProfile: any = (...args: unknown[]) => (hostUtils.isProfileModeWithoutProfile as any)(...args)
export const resolveChatError: any = (...args: unknown[]) => (hostUtils.resolveChatError as any)(...args)
export const isValidMessageStructure: any = (...args: unknown[]) => (hostUtils.isValidMessageStructure as any)(...args)
export const generateTitleFromMessage: any = (...args: unknown[]) => (hostUtils.generateTitleFromMessage as any)(...args)
export const buildWorkspacePrompts: any = (...args: unknown[]) => (hostUtils.buildWorkspacePrompts as any)(...args)
export const normalizeForInvoke: any = (...args: unknown[]) => (hostUtils.normalizeForInvoke as any)(...args)
