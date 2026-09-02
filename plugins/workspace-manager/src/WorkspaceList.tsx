/**
 * 工作区列表(窗口化渲染:只渲染可视区行,支撑 100+ 工作区)
 * 搜索高亮:匹配片段 <mark> 标记
 */

import { useRef, useState, useCallback } from 'react'
import type { Workspace, WorkspaceMeta } from './types'

interface WorkspaceListProps {
  workspaces: Workspace[]
  currentId?: string
  metaMap: Record<string, WorkspaceMeta>
  searchQuery: string
  selectedIds: Set<string>
  onSelectToggle: (id: string) => void
  onSwitch: (id: string) => void
  onRename: (id: string) => void
  onEditMeta: (id: string) => void
  onRemove: (id: string) => void
  onTogglePin: (id: string) => void
}

/** 高亮文本:q 为空时原样返回 */
function highlight(text: string, q: string) {
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

const ROW_HEIGHT = 52 // 估算行高(与 CSS padding/内容对齐)

export function WorkspaceList(props: WorkspaceListProps) {
  const {
    workspaces, currentId, metaMap, searchQuery, selectedIds,
    onSelectToggle, onSwitch, onRename, onEditMeta, onRemove, onTogglePin,
  } = props

  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)
  const listRef = useRef<HTMLDivElement>(null)

  // 视口尺寸与滚动跟踪(ResizeObserver 兜底初始 600)
  const onScroll = useCallback(() => {
    if (listRef.current) setScrollTop(listRef.current.scrollTop)
  }, [])
  const setRef = useCallback((el: HTMLDivElement | null) => {
    listRef.current = el
    if (el) {
      setViewportH(el.clientHeight || 600)
      const ro = new ResizeObserver(() => setViewportH(el.clientHeight || 600))
      ro.observe(el)
    }
  }, [])

  // 窗口化:渲染可视区 + 上下各 3 行缓冲
  const total = workspaces.length
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3)
  const end = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + 3)
  const visible = workspaces.slice(start, end)

  if (total === 0) {
    return <div className="wm-list"><div className="wm-empty">无匹配工作区</div></div>
  }

  return (
    <div
      className="wm-list"
      ref={setRef}
      onScroll={onScroll}
    >
      {/* 占位撑起总高度,绝对定位渲染可见行(窗口化:仅渲染可视区 ± 3 行) */}
      <div style={{ height: total * ROW_HEIGHT, position: 'relative' }}>
        {visible.map((w, i) => {
          const meta = metaMap[w.id] ?? {}
          const isCurrent = w.id === currentId
          const isSelected = selectedIds.has(w.id)
          return (
            <div
              key={w.id}
              className={`wm-row${isCurrent ? ' current' : ''}${isSelected ? ' selected' : ''}`}
              style={{ position: 'absolute', top: (start + i) * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }}
              onClick={() => onSwitch(w.id)}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/wm-workspace-id', w.id)}
            >
              <button
                className={`wm-check${isSelected ? ' checked' : ''}`}
                onClick={(e) => { e.stopPropagation(); onSelectToggle(w.id) }}
                title="选择"
              >✓</button>
              <div className="wm-icon" title={meta.notes}>
                {meta.icon || '📁'}
              </div>
              <div className="wm-main">
                <div className="wm-name">
                  {highlight(w.name, searchQuery)}
                  {meta.pinned && <span className="wm-pin">📌</span>}
                </div>
                <div className="wm-path">{highlight(w.path, searchQuery)}</div>
                {meta.notes && <div className="wm-notes">{meta.notes}</div>}
              </div>
              {meta.group && <span className="wm-group-tag">{meta.group}</span>}
              <div className="wm-actions" onClick={(e) => e.stopPropagation()}>
                <button className="wm-act-btn" title={meta.pinned ? '取消置顶' : '置顶'} onClick={() => onTogglePin(w.id)}>{meta.pinned ? '📍' : '📌'}</button>
                <button className="wm-act-btn" title="重命名" onClick={() => onRename(w.id)}>✎</button>
                <button className="wm-act-btn" title="编辑元数据" onClick={() => onEditMeta(w.id)}>🏷</button>
                <button className="wm-act-btn danger" title={isCurrent ? '当前工作区不可删除' : '删除'} onClick={() => onRemove(w.id)} disabled={isCurrent}>✕</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
