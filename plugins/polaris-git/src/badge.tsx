/**
 * 文件树分支徽章 —— H7 `fileExplorerToolbar` 槽位组件。
 *
 * 宿主 `polaris.core` 的 GitStatusIndicator 随 Git 域出仓一并删除，本组件
 * 承接同一位置（order=10，紧邻文件树工具栏操作区），数据来自插件自带 service
 * （`get_status`），不依赖宿主 gitStore。
 *
 * 刷新策略（禁固定轮询为主）：工作区切换 + file-system-change 事件去抖触发；
 * 30s 兜底一次，覆盖宿主未发事件的场景（如外部 git 命令在监听盲区）。
 * 纯展示、不可点击 —— 与原内置徽章行为一致。
 */

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { capGit, currentWorkspacePath, listenFileSystemChange, onWorkspaceChanged } from './bridge'
import type { GitRepositoryStatus } from './types'

/** file-system-change 事件去抖窗口（宿主 watcher 已攒批，这里只做二次合并） */
const DEBOUNCE_MS = 600
/** 兜底刷新周期（事件缺失时的安全网） */
const FALLBACK_MS = 30_000

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  maxWidth: 150,
  minWidth: 0,
  padding: '0 5px',
  height: 20,
  borderRadius: 4,
  border: '1px solid rgb(var(--c-border) / 0.15)',
  background: 'rgb(var(--c-bg-subtle))',
  color: 'rgb(var(--c-text-secondary))',
  fontSize: 11,
  lineHeight: '18px',
  cursor: 'default',
  userSelect: 'none',
}

const branchStyle: CSSProperties = {
  maxWidth: 100,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const countStyle: CSSProperties = {
  minWidth: 14,
  padding: '0 3px',
  borderRadius: 7,
  background: 'rgb(var(--c-primary) / 0.16)',
  color: 'rgb(var(--c-primary))',
  fontSize: 10,
  textAlign: 'center',
}

const aheadBehindStyle: CSSProperties = {
  fontSize: 10,
  color: 'rgb(var(--c-text-tertiary, var(--c-text-secondary)))',
  whiteSpace: 'nowrap',
}

/** 文件树工具栏分支徽章 */
export function BranchBadge() {
  const [status, setStatus] = useState<GitRepositoryStatus | null>(null)
  const timerRef = useRef<number | null>(null)
  const disposedRef = useRef(false)

  useEffect(() => {
    disposedRef.current = false

    const load = async () => {
      const workspacePath = currentWorkspacePath()
      if (!workspacePath) {
        if (!disposedRef.current) setStatus(null)
        return
      }
      try {
        const next = await capGit<GitRepositoryStatus>('get_status', { workspacePath })
        if (!disposedRef.current) setStatus(next?.exists ? next : null)
      } catch {
        // 服务未就绪 / 非 Git 仓库：静默不显示，不打扰用户
        if (!disposedRef.current) setStatus(null)
      }
    }

    const schedule = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        void load()
      }, DEBOUNCE_MS)
    }

    // 工作区切换立即刷新（onWorkspaceChanged 注册时会先回调一次当前值）
    const offWorkspace = onWorkspaceChanged(() => schedule())
    const offFs = listenFileSystemChange(schedule)
    const interval = window.setInterval(() => void load(), FALLBACK_MS)

    return () => {
      disposedRef.current = true
      offWorkspace()
      offFs()
      window.clearInterval(interval)
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  if (!status) return null

  const changes = status.staged.length + status.unstaged.length + status.untracked.length
  const ahead = status.ahead ?? 0
  const behind = status.behind ?? 0
  const branch = status.branch || 'HEAD'
  const title = [
    `Git: ${branch}`,
    changes > 0 ? `${changes} 个变更` : '工作区干净',
    ahead > 0 ? `领先 ${ahead}` : '',
    behind > 0 ? `落后 ${behind}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <span className="pg-branch-badge" style={badgeStyle} title={title} aria-label={title}>
      <span style={branchStyle}>{branch}</span>
      {(ahead > 0 || behind > 0) && (
        <span style={aheadBehindStyle}>
          {ahead > 0 ? `↑${ahead}` : ''}
          {behind > 0 ? `↓${behind}` : ''}
        </span>
      )}
      {changes > 0 && <span style={countStyle}>{changes}</span>}
    </span>
  )
}
