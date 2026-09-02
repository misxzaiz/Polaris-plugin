/**
 * workspace-manager 面板主组件
 *
 * 架构:
 * - 工作区数据:window.__POLARIS_WORKSPACE_API__(主应用 store 委托,响应式订阅)
 * - 元数据(图标/分组/置顶/备注):plugin_get_config / plugin_set_config
 * - 双向同步:主应用 store subscribe → 面板刷新;面板写 → 委托 store → 全 UI 刷新
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { PluginPanelProps } from './types'
import { getWorkspaceApi, hasHostSupport } from './host'
import {
  loadPluginData, getData, getMeta, setMeta, removeMeta,
  getGroups, saveGroup, deleteGroup, setSort, importMeta, exportData,
} from './store'
import type { Workspace, WorkspaceMeta, ViewFilter, SortMode, ModalState } from './types'
import { ensurePanelStyles } from './styles'
import { WorkspaceList } from './WorkspaceList'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import { WorkspaceModals } from './modals'

export default function Panel(props: PluginPanelProps) {
  ensurePanelStyles()

  const [hostError, setHostError] = useState<string | null>(
    hasHostSupport() ? null : '主应用未提供宿主 API(需要更新主应用以支持 __POLARIS_WORKSPACE_API__)'
  )
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [dataVersion, setDataVersion] = useState(0) // 元数据版本(触发重算)
  const [filter, setFilter] = useState<ViewFilter>({ kind: 'all' })
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSortState] = useState<SortMode>('recent')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalStateLocal>(null)

  // 初始化:加载元数据 + 订阅主应用工作区
  useEffect(() => {
    let unsub: (() => void) | undefined
    let mounted = true

    ;(async () => {
      try {
        const data = await loadPluginData()
        if (!mounted) return
        setSortState(data.sort)

        const api = getWorkspaceApi()
        setWorkspaces(api.list())
        setCurrentId(api.currentId())
        unsub = api.subscribe(() => {
          // 主应用 workspaceStore 任何变化 → 面板刷新(主应用改 → 插件更新)
          setWorkspaces(api.list())
          setCurrentId(api.currentId())
        })
      } catch (e) {
        if (mounted) setHostError(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => {
      mounted = false
      unsub?.()
    }
  }, [])

  const bumpData = useCallback(() => setDataVersion((v) => v + 1), [])

  // ===== 派生数据 =====
  const metaMap = useMemo(() => {
    void dataVersion
    const map: Record<string, WorkspaceMeta> = {}
    for (const w of workspaces) map[w.id] = getMeta(w.id)
    return map
  }, [workspaces, dataVersion])

  const groups = useMemo(() => {
    void dataVersion
    return getGroups()
  }, [dataVersion])

  // 过滤 + 搜索 + 排序
  const filtered = useMemo(() => {
    let list = workspaces
    const meta = (id: string) => metaMap[id] ?? {}

    // 视图筛选
    if (filter.kind === 'pinned') list = list.filter((w) => meta(w.id).pinned)
    else if (filter.kind === 'recent') {
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000
      list = list.filter((w) => new Date(w.lastAccessed).getTime() > cutoff)
    } else if (filter.kind === 'group') list = list.filter((w) => meta(w.id).group === filter.group)
    else if (filter.kind === 'ungrouped') list = list.filter((w) => !meta(w.id).group)

    // 搜索(name/path/notes,大小写不敏感 substring)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((w) => {
        const notes = meta(w.id).notes ?? ''
        return w.name.toLowerCase().includes(q) || w.path.toLowerCase().includes(q) || notes.toLowerCase().includes(q)
      })
    }

    // 排序:置顶优先,再按模式
    const sorted = [...list].sort((a, b) => {
      const pa = meta(a.id).pinned ? 1 : 0
      const pb = meta(b.id).pinned ? 1 : 0
      if (pa !== pb) return pb - pa
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh')
      if (sort === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      return new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
    })
    return sorted
  }, [workspaces, metaMap, filter, searchQuery, sort])

  // ===== 操作(全部委托宿主 store → 主应用绑定更新) =====
  const api = hostError ? null : getWorkspaceApi()

  const handleSwitch = useCallback(async (id: string) => {
    if (!api || id === currentId) return
    try {
      await api.switch(id) // 委托:主应用 set_work_dir + 事件 + 全 UI 刷新
    } catch (e) {
      console.error('[workspace-manager] switch failed', e)
    }
  }, [api, currentId])

  const handleRename = useCallback(async (id: string, name: string) => {
    if (!api || !name.trim()) return
    try {
      await api.update(id, { name: name.trim() }) // 委托 updateWorkspace
    } catch (e) {
      console.error('[workspace-manager] rename failed', e)
    }
  }, [api])

  const handleCreate = useCallback(async (name: string, path: string, switchAfter: boolean) => {
    if (!api) throw new Error('宿主 API 不可用')
    await api.create(name, path, switchAfter) // 委托 createWorkspace
  }, [api])

  const handleRemove = useCallback(async (ids: string[]) => {
    if (!api) return
    for (const id of ids) {
      if (id === currentId) continue // 不删当前
      try {
        await api.remove(id)
        await removeMeta(id)
      } catch (e) {
        console.error('[workspace-manager] remove failed', e)
      }
    }
    setSelectedIds(new Set())
    bumpData()
  }, [api, currentId, bumpData])

  const handleUpdateMeta = useCallback(async (id: string, patch: WorkspaceMeta) => {
    await setMeta(id, patch)
    bumpData()
  }, [bumpData])

  const handleTogglePin = useCallback((id: string) => {
    const cur = getMeta(id).pinned
    void handleUpdateMeta(id, { pinned: !cur || undefined })
  }, [handleUpdateMeta])

  /** 列表行拖到侧栏分组(拖到"未分组"= 移出) */
  const handleDropToGroup = useCallback((id: string, group: string) => {
    const target = group === '__none__' ? '' : group
    void handleUpdateMeta(id, { group: target || undefined })
  }, [handleUpdateMeta])

  const handleSortChange = useCallback(async (mode: SortMode) => {
    setSortState(mode)
    await setSort(mode)
  }, [])

  const handleSaveGroup = useCallback(async (name: string) => {
    if (!name.trim()) return
    await saveGroup(name.trim())
    bumpData()
  }, [bumpData])

  const handleDeleteGroup = useCallback(async (name: string) => {
    await deleteGroup(name)
    setFilter((f) => (f.kind === 'group' && f.group === name ? { kind: 'all' } : f))
    bumpData()
  }, [bumpData])

  const handleExport = useCallback(() => {
    const data = exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'workspace-manager-backup.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleImport = useCallback(async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed.meta === 'object') {
        await importMeta(parsed.meta)
        if (Array.isArray(parsed.groups)) {
          for (const g of parsed.groups) await saveGroup(String(g))
        }
        bumpData()
      }
    } catch (e) {
      console.error('[workspace-manager] import failed', e)
    }
  }, [bumpData])

  // ===== 渲染 =====
  if (hostError) {
    return (
      <div className="wm-panel">
        <div className="wm-empty" style={{ paddingTop: 48 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🔌</div>
          <div>{hostError}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="wm-panel" style={{ position: 'relative' }}>
      {/* 头部搜索 */}
      <div className="wm-header">
        <div className="wm-search">
          <span className="wm-search-icon">🔍</span>
          <input
            type="text"
            placeholder="搜索名称 / 路径 / 备注"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <span className="wm-count">
          {filtered.length}/{workspaces.length}
        </span>
      </div>

      {/* 侧栏 + 列表 */}
      <div className="wm-body">
        <WorkspaceSidebar
          filter={filter}
          groups={groups}
          metaMap={metaMap}
          workspaces={workspaces}
          onFilterChange={setFilter}
          onNewGroup={() => setModal({ kind: 'newGroup' })}
          onDeleteGroup={handleDeleteGroup}
          onDropToGroup={handleDropToGroup}
        />
        <div className="wm-list-area">
          <div className="wm-toolbar">
            <button className={`wm-sort-btn${sort === 'recent' ? ' active' : ''}`} onClick={() => handleSortChange('recent')}>最近访问</button>
            <button className={`wm-sort-btn${sort === 'name' ? ' active' : ''}`} onClick={() => handleSortChange('name')}>名称</button>
            <button className={`wm-sort-btn${sort === 'created' ? ' active' : ''}`} onClick={() => handleSortChange('created')}>创建时间</button>
            <span className="wm-toolbar-spacer" />
          </div>
          <WorkspaceList
            workspaces={filtered}
            currentId={currentId ?? undefined}
            metaMap={metaMap}
            searchQuery={searchQuery}
            selectedIds={selectedIds}
            onSelectToggle={(id) => {
              setSelectedIds((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }}
            onSwitch={handleSwitch}
            onRename={(id) => setModal({ kind: 'rename', id })}
            onEditMeta={(id) => setModal({ kind: 'editMeta', id, initialMeta: metaMap[id] })}
            onRemove={(id) => handleRemove([id])}
            onTogglePin={handleTogglePin}
          />
        </div>
      </div>

      {/* 底部:新建 + 批量 + 导入导出 + 同步状态 */}
      <div className="wm-footer">
        <button className="wm-btn wm-btn-primary" onClick={() => setModal({ kind: 'create' })}>
          + 新建
        </button>
        {selectedIds.size > 0 && (
          <>
            <button className="wm-batch-btn danger" onClick={() => handleRemove(Array.from(selectedIds))}>
              删除 ({selectedIds.size})
            </button>
            <button className="wm-batch-btn" onClick={() => setModal({ kind: 'batchGroup' })}>
              移入分组
            </button>
          </>
        )}
        <span className="wm-footer-spacer" />
        <button className="wm-btn" onClick={handleExport} title="导出备份">⬇</button>
        <label className="wm-btn" style={{ display: 'inline-flex', alignItems: 'center' }} title="导入备份">
          ⬆
          <input
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImport(f)
              e.target.value = ''
            }}
          />
        </label>
        <span className="wm-status">
          已同步 <b>{workspaces.length}</b> 个工作区
        </span>
      </div>

      {/* 弹窗集合 */}
      <WorkspaceModals
        modal={modal}
        workspaces={workspaces}
        groups={groups}
        selectedIds={selectedIds}
        api={api}
        onClose={() => setModal(null)}
        onCreate={handleCreate}
        onRename={handleRename}
        onUpdateMeta={(patch, id) => handleUpdateMeta(id, patch)}
        onBatchGroup={async (group) => {
          for (const id of selectedIds) await handleUpdateMeta(id, { group: group || undefined })
          setSelectedIds(new Set())
          setModal(null)
        }}
        onSaveGroup={(name) => {
          handleSaveGroup(name)
          setModal(null)
        }}
      />
    </div>
  )
}

type ModalStateLocal = ModalState
