/**
 * 插件元数据存储(config.json plugins['workspace-manager'] 命名空间)
 *
 * 经 plugin_get_config / plugin_set_config 后端命令读写,后端做权限校验
 * (appConfigRead/appConfigWrite)。数据结构:{ meta, groups, sort }。
 * 插件实例内做内存缓存 + 写透,避免频繁 IPC。
 */

import { getHostInvoke } from './host'
import type { PluginStoreData, WorkspaceMeta } from './types'
import { PLUGIN_ID } from './types'

const invoke = () => getHostInvoke()

let cache: PluginStoreData | null = null

const DEFAULT_DATA: PluginStoreData = {
  meta: {},
  groups: [],
  sort: 'recent',
}

/** 从后端加载插件数据(面板挂载时调用一次) */
export async function loadPluginData(): Promise<PluginStoreData> {
  try {
    const raw = await invoke()<Partial<PluginStoreData>>('plugin_get_config', { pluginId: PLUGIN_ID })
    cache = {
      meta: raw?.meta && typeof raw.meta === 'object' ? (raw.meta as PluginStoreData['meta']) : {},
      groups: Array.isArray(raw?.groups) ? raw.groups : [],
      sort: raw?.sort === 'name' || raw?.sort === 'created' || raw?.sort === 'recent' ? raw.sort : 'recent',
    }
  } catch {
    cache = { ...DEFAULT_DATA, meta: {}, groups: [] }
  }
  return cache
}

/** 持久化(写透后端) */
async function persist(): Promise<void> {
  if (!cache) return
  await invoke()<unknown>('plugin_set_config', {
    pluginId: PLUGIN_ID,
    patch: { meta: cache.meta, groups: cache.groups, sort: cache.sort },
  })
}

/** 读缓存(未加载时返回默认) */
export function getData(): PluginStoreData {
  return cache ?? { ...DEFAULT_DATA, meta: {}, groups: [] }
}

/** 单个工作区元数据 */
export function getMeta(id: string): WorkspaceMeta {
  return getData().meta[id] ?? {}
}

/** 更新单个工作区元数据并持久化 */
export async function setMeta(id: string, patch: WorkspaceMeta): Promise<void> {
  if (!cache) cache = await loadPluginData()
  cache.meta[id] = { ...getMeta(id), ...patch }
  await persist()
}

/** 删除工作区时清理元数据 */
export async function removeMeta(id: string): Promise<void> {
  if (!cache) cache = await loadPluginData()
  delete cache.meta[id]
  await persist()
}

/** 分组列表(含元数据中出现但未登记的分组,自动补全) */
export function getGroups(): string[] {
  const data = getData()
  const fromMeta = new Set<string>()
  for (const m of Object.values(data.meta)) {
    if (m.group) fromMeta.add(m.group)
  }
  const merged = Array.from(new Set([...data.groups, ...fromMeta]))
  return merged
}

/** 新建/重命名分组 */
export async function saveGroup(name: string): Promise<void> {
  if (!cache) cache = await loadPluginData()
  if (!cache.groups.includes(name)) {
    cache.groups = [...cache.groups, name]
    await persist()
  }
}

export async function deleteGroup(name: string): Promise<void> {
  if (!cache) cache = await loadPluginData()
  // 删除分组:从登记表移除,成员回退未分组
  cache.groups = cache.groups.filter((g) => g !== name)
  for (const [id, m] of Object.entries(cache.meta)) {
    if (m.group === name) {
      const { group: _drop, ...rest } = m
      cache.meta[id] = rest
    }
  }
  await persist()
}

export async function setSort(sort: PluginStoreData['sort']): Promise<void> {
  if (!cache) cache = await loadPluginData()
  cache.sort = sort
  await persist()
}

/** 批量导入元数据(合并,不覆盖已有键) */
export async function importMeta(meta: Record<string, WorkspaceMeta>): Promise<void> {
  if (!cache) cache = await loadPluginData()
  for (const [id, m] of Object.entries(meta)) {
    cache.meta[id] = { ...getMeta(id), ...m }
  }
  await persist()
}

/** 导出全部插件数据(备份) */
export function exportData(): PluginStoreData {
  return JSON.parse(JSON.stringify(getData()))
}
