/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * settings-desk 依赖桥 —— 迁入的 Settings 域组件原依赖宿主 @/stores、@/services 等，
 * 插件内经 __POLARIS_APP_CORE__（appCoreBridge）取同一实例；后端命令经
 * __POLARIS_HOST_INVOKE__（main.tsx 白名单桥）。
 *
 * 转发代理语义与 model-desk deps.ts 一致：调用即转发宿主 hook/函数，
 * 属性访问即转发宿主静态成员；缺失时抛错（宿主太旧），不静默降级。
 */

function core(): { stores: Record<string, any>; services: Record<string, any>; components: Record<string, any>; hooks: Record<string, any> } {
  const c = (globalThis as any).__POLARIS_APP_CORE__
  if (!c?.stores) throw new Error('宿主 App Core 未挂载：请把 Polaris 更新到较新版本后再打开本插件。')
  return c
}

function forwardStore(name: string): any {
  const fn = (...args: any[]) => {
    const hook = core().stores[name]
    if (typeof hook !== 'function') throw new Error(`宿主 ${name} 不可用`)
    return hook(...args)
  }
  return new Proxy(fn, {
    get: (_t, prop) => {
      const hook = core().stores[name]
      const v = (hook as any)[prop]
      return typeof v === 'function' ? v.bind(hook) : v
    },
  })
}

function forwardService(ns: 'services', name: string): any {
  const fn = (...args: any[]) => {
    const v = core()[ns][name]
    if (typeof v !== 'function') throw new Error(`宿主 ${name} 不可用`)
    return v(...args)
  }
  return new Proxy(fn, {
    get: (_t, prop) => {
      const v = core()[ns][name]
      const m = (v as any)?.[prop]
      return typeof m === 'function' ? m.bind(v) : m
    },
  })
}

// ── stores ──
export const useConfigStore: any = forwardStore('useConfigStore')
export const useToastStore: any = forwardStore('useToastStore')
export const useWorkspaceStore: any = forwardStore('useWorkspaceStore')
export const usePluginStore: any = forwardStore('usePluginStore')
export const usePluginServiceStore: any = forwardStore('usePluginServiceStore')
export const useEngineMetadataStore: any = forwardStore('useEngineMetadataStore')
export const useThemeStore: any = forwardStore('useThemeStore')
export const useFocusModeStore: any = forwardStore('useFocusModeStore')

// ── hooks ──
export const useContainerWidth: any = (...args: any[]) => core().hooks.useContainerWidth(...args)

// ── components（宿主共享 UI 件）──
export const Button: any = (...args: any[]) => core().components.Button(...args)
export const ExternalLink: any = (...args: any[]) => core().components.ExternalLink(...args)

// ── plugin-system ──
export const pluginRegistry: any = new Proxy({}, { get: (_t, p) => (core().pluginSystem as any).pluginRegistry?.[p] })
export const listPluginMcpServerStatuses: any = (...args: any[]) => core().pluginSystem.listPluginMcpServerStatuses(...args)
export const listEnabledPluginMcpServers: any = (...args: any[]) => core().pluginSystem.listEnabledPluginMcpServers(...args)
export const getPluginIconComponent: any = (...args: any[]) => core().services.getPluginIconComponent(...args)
export const pluginServiceManager: any = new Proxy({}, { get: (_t, p) => (core().services.pluginServiceManager as any)?.[p] })
export const pluginConfig: any = new Proxy({}, { get: (_t, p) => (core().services.pluginConfig as any)?.[p] })

// ── transport ──
export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return (core().services.transport.invoke as (c: string, a?: Record<string, unknown>) => Promise<T>)(cmd, args)
}
export function listen<T = unknown>(event: string, handler: (p: T) => void): Promise<() => void> {
  return (core().services.transport.listen as (e: string, h: (p: unknown) => void) => Promise<() => void>)(event, handler as (p: unknown) => void)
}
export const currentMode: string = core().services.transport.currentMode

// ── services 命名空间转发（settings 域消费的宿主服务单例）──
export const pluginDiscoveryService: any = new Proxy({}, { get: (_t, p) => (core().services.pluginDiscoveryService as any)?.[p] })
export const pluginToolService: any = new Proxy({}, { get: (_t, p) => (core().services.pluginToolService as any)?.[p] })
export const mcpHealthService: any = new Proxy({}, { get: (_t, p) => (core().services.mcpHealthService as any)?.[p] })
export const dataRootService: any = new Proxy({}, { get: (_t, p) => (core().services.dataRootService as any)?.[p] })
export const autolaunchService: any = new Proxy({}, { get: (_t, p) => (core().services.autolaunchService as any)?.[p] })
export const appUpdateService: any = new Proxy({}, { get: (_t, p) => (core().services.appUpdateService as any)?.[p] })
export const updateService: any = new Proxy({}, { get: (_t, p) => (core().services.updateService as any)?.[p] })
export const systemPromptStore: any = new Proxy({}, { get: (_t, p) => (core().services.systemPromptStore as any)?.[p] })
export const windowService: any = new Proxy({}, { get: (_t, p) => (core().services.windowService as any)?.[p] })
export const configService: any = new Proxy({}, { get: (_t, p) => (core().services.configService as any)?.[p] })

// 具名转发（tabs 直接 import { fn } from '../deps'）
export const listMcpHealthStatuses: any = (...args: any[]) => core().services.mcpHealthService.listMcpHealthStatuses(...args)
export const listPluginTools: any = (...args: any[]) => core().services.pluginToolService.listPluginTools(...args)
export const setPluginTools: any = (...args: any[]) => core().services.pluginToolService.setPluginTools(...args)
export const discoverInstalledPlugins: any = (...args: any[]) => core().services.pluginDiscoveryService.discoverInstalledPlugins(...args)
export const getPluginInstallLocations: any = (...args: any[]) => core().services.pluginDiscoveryService.getPluginInstallLocations(...args)
export const installLocalPlugin: any = (...args: any[]) => core().services.pluginDiscoveryService.installLocalPlugin(...args)
export const installPluginPackage: any = (...args: any[]) => core().services.pluginDiscoveryService.installPluginPackage(...args)
export const installRemotePlugin: any = (...args: any[]) => core().services.pluginDiscoveryService.installRemotePlugin(...args)
export const devLinkPlugin: any = (...args: any[]) => core().services.pluginDiscoveryService.devLinkPlugin(...args)
export const uninstallPluginWithCleanup: any = (...args: any[]) => core().services.pluginDiscoveryService.uninstallPluginWithCleanup(...args)
export const forceUninstallPlugin: any = (...args: any[]) => core().services.pluginDiscoveryService.forceUninstallPlugin(...args)
export const checkPluginUpdate: any = (...args: any[]) => core().services.pluginDiscoveryService.checkPluginUpdate(...args)
export const applyPluginUpdate: any = (...args: any[]) => core().services.pluginDiscoveryService.applyPluginUpdate(...args)
export const getDataRootInfo: any = (...args: any[]) => core().services.dataRootService.getDataRootInfo(...args)
export const getAutolaunchStatus: any = (...args: any[]) => core().services.autolaunchService.getAutolaunchStatus(...args)
export const applyAutolaunch: any = (...args: any[]) => core().services.autolaunchService.applyAutolaunch(...args)
export const getUpdateStatus: any = (...args: any[]) => core().services.appUpdateService.getUpdateStatus(...args)
export const runAutoUpdate: any = (...args: any[]) => core().services.appUpdateService.runAutoUpdate(...args)
export const listenUpdateProgress: any = (...args: any[]) => core().services.appUpdateService.listenUpdateProgress(...args)
export const listenUpdateCompleted: any = (...args: any[]) => core().services.appUpdateService.listenUpdateCompleted(...args)
export const listAppReleases: any = (...args: any[]) => core().services.updateService.listAppReleases(...args)
export const getSystemPromptConfigDirect: any = (...args: any[]) => core().services.systemPromptStore.getSystemPromptConfigDirect(...args)
export const useSystemPromptStore: any = forwardStore('useSystemPromptStore')
export const applyWebServer: any = (...args: any[]) => core().services.configService.applyWebServer(...args)
export const getConfig: any = (...args: any[]) => core().services.configService.getConfig(...args)
export const getWebServerStatus: any = (...args: any[]) => core().services.configService.getWebServerStatus(...args)
export const openInBrowser: any = (...args: any[]) => core().services.windowService.openInBrowser(...args)
export const openInDefaultApp: any = (...args: any[]) => core().services.windowService.openInDefaultApp(...args)
export const openExternalLink: any = (...args: any[]) => core().services.linkExternal.openExternalLink(...args)
export const getPluginConfig: any = (...args: any[]) => core().pluginConfig.getPluginConfig(...args)
export const setPluginConfig: any = (...args: any[]) => core().pluginConfig.setPluginConfig(...args)

// ── 宿主通道（main.tsx 白名单桥）──
export function getHostInvoke(): <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> {
  const fn = (window as unknown as { __POLARIS_HOST_INVOKE__?: unknown }).__POLARIS_HOST_INVOKE__
  if (typeof fn !== 'function') {
    throw new Error('宿主通道不可用：请把 Polaris 更新到较新版本后再打开本插件。')
  }
  return fn as <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
}
