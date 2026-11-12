/**
 * polaris-git 面板入口 —— 宿主面板挂载点（blob loader 模板占位符纪律：禁内联 import）
 *
 * 同时导出 `registerUi`（H7 UI 槽位）：
 * - `fileExplorerToolbar`：文件树分支徽章（原宿主 GitStatusIndicator 的替代）
 * - `diffRefresh`：宿主 diff tab 恢复时取该文件的最新工作区差异
 * - `editorScmProvider`：编辑器 gutter / blame / 变更导航的数据源（H3）
 * 以上数据均来自插件自带 service，宿主不保留 gitStore / cap.git。
 */
import type { ComponentType } from 'react'
import { Panel } from './components/Panel.tsx'
import { BranchBadge } from './badge.tsx'
import { capGit } from './bridge.ts'
import type { GitDiffEntry } from './types.ts'

export default function PolarisGitEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  void props
  return <Panel />
}

/** 宿主传入的 UI 槽位 API（结构化约定，不 import 宿主模块） */
interface PluginUiHostApi {
  registerFileExplorerToolbar(
    itemId: string,
    component: ComponentType<Record<string, never>>,
    order?: number,
  ): void
  registerDiffRefreshProvider(
    provider: (filePath: string, workspacePath: string) => Promise<unknown | null>,
  ): void
  registerEditorScmProvider(provider: {
    getStatus: (workspacePath: string) => Promise<{
      exists: boolean
      branch?: string
      staged: { path: string }[]
      unstaged: { path: string }[]
      untracked: string[]
    } | null>
    getFileDiff: (
      workspacePath: string,
      filePath: string,
      kind: 'worktree' | 'index',
    ) => Promise<{ old_content?: string | null; new_content?: string | null } | null>
    getBlame: (workspacePath: string, filePath: string) => Promise<unknown | null>
  }): void
}

/**
 * 由宿主在插件注册时调用一次（manifest `contributes.uiSlots` 声明后触发）。
 * 注册必须幂等：多次调用覆盖同 itemId 即可。
 */
export function registerUi(host: PluginUiHostApi, ctx: { pluginId: string }): void {
  void ctx
  host.registerFileExplorerToolbar(
    'branch-badge',
    BranchBadge as unknown as ComponentType<Record<string, never>>,
    10,
  )

  host.registerDiffRefreshProvider(async (filePath, workspacePath) => {
    try {
      const entry = await capGit<GitDiffEntry>('get_worktree_file_diff', {
        workspacePath,
        filePath,
      })
      if (!entry || typeof entry !== 'object') return null
      return entry
    } catch {
      // 未跟踪/已删除/服务未就绪：返回 null，宿主退回旧 diffData
      return null
    }
  })

  // 编辑器 SCM 数据（gutter / blame / 变更导航）—— 宿主只保留 CM6 渲染壳
  host.registerEditorScmProvider({
    async getStatus(workspacePath) {
      const status = await capGit<{
        exists: boolean
        branch?: string
        staged: { path: string }[]
        unstaged: { path: string }[]
        untracked: string[]
      }>('get_status', { workspacePath })
      if (!status || !status.exists) return null
      return {
        exists: true,
        branch: status.branch,
        staged: status.staged ?? [],
        unstaged: status.unstaged ?? [],
        untracked: status.untracked ?? [],
      }
    },
    async getFileDiff(workspacePath, filePath, kind) {
      const action = kind === 'index' ? 'get_index_file_diff' : 'get_worktree_file_diff'
      const entry = await capGit<GitDiffEntry>(action, { workspacePath, filePath })
      if (!entry) return null
      return { old_content: entry.old_content ?? '', new_content: entry.new_content ?? '' }
    },
    async getBlame(workspacePath, filePath) {
      return capGit<unknown>('blame_file', { workspacePath, filePath })
    },
  })
}
