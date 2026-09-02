/**
 * 侧栏:视图筛选(全部/置顶/最近/各分组/未分组) + 分组管理
 * 拖放:列表行拖到分组项上 → 归类
 */

import { useState } from 'react'
import type { Workspace, WorkspaceMeta, ViewFilter } from './types'

interface WorkspaceSidebarProps {
  filter: ViewFilter
  groups: string[]
  metaMap: Record<string, WorkspaceMeta>
  workspaces: Workspace[]
  onFilterChange: (f: ViewFilter) => void
  onNewGroup: () => void
  onDeleteGroup: (name: string) => void
  onDropToGroup?: (workspaceId: string, group: string) => void
}

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const { filter, groups, metaMap, workspaces, onFilterChange, onNewGroup, onDeleteGroup, onDropToGroup } = props
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null)

  const countBy = (pred: (w: Workspace) => boolean) => workspaces.filter(pred).length
  const ungroupedCount = countBy((w) => !(metaMap[w.id]?.group))
  const pinnedCount = countBy((w) => metaMap[w.id]?.pinned)

  const handleDrop = (e: React.DragEvent, group: string) => {
    e.preventDefault()
    setDragOverGroup(null)
    const id = e.dataTransfer.getData('text/wm-workspace-id')
    if (id && onDropToGroup) onDropToGroup(id, group)
  }

  const dropProps = (group: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setDragOverGroup(group)
    },
    onDragLeave: () => setDragOverGroup(null),
    onDrop: (e: React.DragEvent) => handleDrop(e, group),
  })

  return (
    <div className="wm-sidebar">
      <div className="wm-sb-label">视图</div>
      <button
        className={`wm-sb-item${filter.kind === 'all' ? ' active' : ''}`}
        onClick={() => onFilterChange({ kind: 'all' })}
      >
        <span>▦</span>
        <span className="wm-sb-name">全部</span>
        <span className="wm-sb-count">{workspaces.length}</span>
      </button>
      <button
        className={`wm-sb-item${filter.kind === 'pinned' ? ' active' : ''}`}
        onClick={() => onFilterChange({ kind: 'pinned' })}
      >
        <span>★</span>
        <span className="wm-sb-name">置顶</span>
        <span className="wm-sb-count">{pinnedCount}</span>
      </button>
      <button
        className={`wm-sb-item${filter.kind === 'recent' ? ' active' : ''}`}
        onClick={() => onFilterChange({ kind: 'recent' })}
      >
        <span>🕘</span>
        <span className="wm-sb-name">最近 7 天</span>
        <span className="wm-sb-count">{countBy((w) => Date.now() - new Date(w.lastAccessed).getTime() < 7 * 24 * 3600 * 1000)}</span>
      </button>

      {groups.length > 0 && <div className="wm-sb-label">分组</div>}
      {groups.map((g) => (
        <button
          key={g}
          className={`wm-sb-item${filter.kind === 'group' && filter.group === g ? ' active' : ''}${dragOverGroup === g ? ' wm-drop-target drag-over' : ''}`}
          onClick={() => onFilterChange({ kind: 'group', group: g })}
          {...dropProps(g)}
        >
          <span>●</span>
          <span className="wm-sb-name">{g}</span>
          <span
            className="wm-sb-del"
            title="删除分组(成员回退未分组)"
            onClick={(e) => {
              e.stopPropagation()
              onDeleteGroup(g)
            }}
          >✕</span>
          <span className="wm-sb-count">{countBy((w) => metaMap[w.id]?.group === g)}</span>
        </button>
      ))}

      <div className="wm-sb-label">未分组</div>
      <button
        className={`wm-sb-item${filter.kind === 'ungrouped' ? ' active' : ''}${dragOverGroup === '__none__' ? ' wm-drop-target drag-over' : ''}`}
        onClick={() => onFilterChange({ kind: 'ungrouped' })}
        {...dropProps('__none__')}
      >
        <span>○</span>
        <span className="wm-sb-name">未分组</span>
        <span className="wm-sb-count">{ungroupedCount}</span>
      </button>

      <div style={{ marginTop: 8, borderTop: '1px dashed var(--border, rgba(255,255,255,0.08))', paddingTop: 6 }}>
        <button className="wm-sb-item" onClick={onNewGroup} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          <span>＋</span>
          <span className="wm-sb-name">新建分组</span>
        </button>
      </div>
    </div>
  )
}
