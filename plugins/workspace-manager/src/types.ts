/**
 * workspace-manager 插件类型定义
 */

/** 主应用 WorkspaceEntry(与主应用 types/config.ts 对齐) */
export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: string
  lastAccessed: string
}

/** 插件侧元数据(存 config.json plugins['workspace-manager'].meta[id],不污染核心 workspaces 数组) */
export interface WorkspaceMeta {
  icon?: string
  group?: string
  pinned?: boolean
  notes?: string
}

/** 插件持久化数据结构 */
export interface PluginStoreData {
  meta: Record<string, WorkspaceMeta>
  groups: string[]
  sort: SortMode
}

export type SortMode = 'recent' | 'name' | 'created'

/** 视图筛选 */
export type ViewFilter =
  | { kind: 'all' }
  | { kind: 'pinned' }
  | { kind: 'recent' }
  | { kind: 'group'; group: string }
  | { kind: 'ungrouped' }

/** 宿主工作区 API(window.__POLARIS_WORKSPACE_API__,主应用 main.tsx 挂载) */
export interface HostWorkspaceApi {
  list(): Workspace[]
  currentId(): string | null
  subscribe(listener: () => void): () => void
  switch(id: string): Promise<void>
  create(name: string, path: string, switchAfter?: boolean): Promise<Workspace>
  update(id: string, updates: { name?: string; path?: string }): Promise<void>
  remove(id: string): Promise<void>
  validatePath(path: string): Promise<boolean>
}

/** 宿主 invoke(window.__POLARIS_HOST_INVOKE__) */
export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

/** 宿主注入的面板 props(与主应用 PluginPanelComponent 对齐) */
export interface PluginPanelProps {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}

/** 弹窗状态 */
export type ModalState =
  | null
  | { kind: 'create' }
  | { kind: 'rename'; id: string }
  | { kind: 'editMeta'; id: string; initialMeta?: WorkspaceMeta }
  | { kind: 'newGroup' }
  | { kind: 'batchGroup' }

export const PLUGIN_ID = 'workspace-manager'
