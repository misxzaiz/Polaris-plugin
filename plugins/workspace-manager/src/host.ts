/**
 * 宿主 API 访问层
 *
 * 双通道:
 * 1. window.__POLARIS_WORKSPACE_API__ — 工作区委托通道(主应用 main.tsx 挂载)。
 *    所有写操作经此委托主应用 workspaceStore:持久化、事件派发、全 UI 响应式
 *    刷新由 store 自带 → 主应用工作区绑定天然更新。
 * 2. window.__POLARIS_HOST_INVOKE__ — invoke 通道,用于插件元数据读写
 *    (plugin_get_config / plugin_set_config,存 config.json plugins 命名空间)。
 */

import type { HostWorkspaceApi, HostInvoke, Workspace } from './types'

interface HostGlobals {
  __POLARIS_WORKSPACE_API__?: HostWorkspaceApi
  __POLARIS_HOST_INVOKE__?: HostInvoke
}

function hostWindow(): HostGlobals & typeof globalThis {
  return window as unknown as HostGlobals & typeof globalThis
}

export function getWorkspaceApi(): HostWorkspaceApi {
  const api = hostWindow().__POLARIS_WORKSPACE_API__
  if (!api) {
    throw new Error('宿主工作区 API 不可用:需要主应用提供 __POLARIS_WORKSPACE_API__')
  }
  return api
}

export function getHostInvoke(): HostInvoke {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__
  if (!invoke) {
    throw new Error('宿主 invoke 不可用:需要主应用提供 __POLARIS_HOST_INVOKE__')
  }
  return invoke
}

export function hasHostSupport(): boolean {
  const w = hostWindow()
  return !!w.__POLARIS_WORKSPACE_API__ && !!w.__POLARIS_HOST_INVOKE__
}

export type { Workspace }
