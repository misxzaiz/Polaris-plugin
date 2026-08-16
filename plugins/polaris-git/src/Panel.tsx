/**
 * polaris-git 插件面板
 *
 * 自包含 Git 工作台：仓库状态 / 变更文件列表 / 单文件 diff 预览 / 暂存提交。
 * 运行环境：宿主 webview，React 由 pluginModuleLoader shim 注入。
 * Tauri invoke 通过 window.__TAURI_INTERNALS__.invoke 调用（零外部依赖，与 marketplace 插件同模式）。
 *
 * 数据源：主项目后端 git2 的 git_get_status / git_get_worktree_file_diff /
 *   git_get_index_file_diff / git_stage_file / git_commit_changes 等命令。
 */

import { useEffect, useMemo, useState, useCallback } from 'react'

/** 类型（与主项目 src/types/git.ts 对应） */
type GitFileChange = { path: string; status: string; oldPath?: string; additions?: number; deletions?: number }
interface GitRepositoryStatus {
  exists: boolean; branch: string; commit: string; shortCommit: string
  ahead: number; behind: number; isEmpty: boolean
  staged: GitFileChange[]; unstaged: GitFileChange[]; untracked: string[]; conflicted: string[]
}
type GitDiffEntry = {
  file_path: string; change_type: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied'
  old_content?: string; new_content?: string; is_binary: boolean; content_omitted?: boolean
  additions?: number; deletions?: number
}
type CommitResult = { success: boolean; hash?: string; message?: string; error?: string }

/** 调用 Tauri 命令（插件上下文零依赖） */
async function tauriInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: (c: string, a?: Record<string, unknown>) => Promise<T> }
  }).__TAURI_INTERNALS__
  if (!internals?.invoke) {
    throw new Error('需在 Polaris 桌面环境运行')
  }
  return internals.invoke(cmd, args)
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  added: { label: 'A', color: '#3fb950' },
  modified: { label: 'M', color: '#d29922' },
  deleted: { label: 'D', color: '#f85149' },
  renamed: { label: 'R', color: '#58a6ff' },
  untracked: { label: '?', color: '#8b949e' },
}

/** 简易行级 diff 渲染（统一视图） */
function renderUnifiedDiff(oldContent?: string, newContent?: string): React.ReactNode {
  const oldLines = (oldContent ?? '').split('\n')
  const newLines = (newContent ?? '').split('\n')
  const max = Math.max(oldLines.length, newLines.length)
  const rows: React.ReactNode[] = []
  for (let i = 0; i < max; i++) {
    const oldLine = oldLines[i]
    const newLine = newLines[i]
    const changed = oldLine !== newLine
    if (oldLine === undefined) {
      rows.push(<div key={i} className="dline added"><span className="op">+</span>{newLine}</div>)
    } else if (newLine === undefined) {
      rows.push(<div key={i} className="dline removed"><span className="op">-</span>{oldLine}</div>)
    } else if (changed) {
      rows.push(<div key={i} className="dline modified"><span className="op">-</span>{oldLine}</div>)
      rows.push(<div key={i} className="dline modified"><span className="op">+</span>{newLine}</div>)
    } else {
      rows.push(<div key={i} className="dline context"><span className="op"> </span>{oldLine}</div>)
    }
  }
  return <div className="unified-diff">{rows}</div>
}

interface GitPanelProps {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export default function GitPanel({ onSendToChat }: GitPanelProps) {
  const [workspacePath, setWorkspacePath] = useState<string>('')
  const [status, setStatus] = useState<GitRepositoryStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [selectedDiff, setSelectedDiff] = useState<GitDiffEntry | null>(null)
  const [stagedMode, setStagedMode] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [commits, setCommits] = useState<{ hash: string; author: string; date: string; message: string }[]>([])

  const refresh = useCallback(async (path?: string) => {
    if (!path) return
    setLoading(true)
    setError(null)
    try {
      const s = await tauriInvoke<GitRepositoryStatus>('git_get_status', { workspacePath: path })
      setStatus(s)
      setWorkspacePath(path)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // 自动探测当前工作区（读取首次打开时的窗口上下文——无 API 时让用户手填）
  // 这里通过宿主暴露的 workspace 信息尝试初始化
  useEffect(() => {
    const initWorkspace = async () => {
      const hostWs = (window as unknown as { __POLARIS_HOST_WORKSPACE__?: string }).__POLARIS_HOST_WORKSPACE__
      if (hostWs) { setWorkspacePath(hostWs); void refresh(hostWs); return }
      // 尝试用当前 cwd（在某些环境下可用）
      try {
        const cwd = await tauriInvoke<string>('get_current_dir')
        setWorkspacePath(cwd)
        void refresh(cwd)
      } catch {
        // 无可用工作区，显示手动输入
      }
    }
    void initWorkspace()
  }, [refresh])

  const loadDiff = useCallback(async (filePath: string) => {
    setSelectedFile(filePath)
    try {
      const diff = await tauriInvoke<GitDiffEntry>(
        stagedMode ? 'git_get_index_file_diff' : 'git_get_worktree_file_diff',
        { workspacePath, filePath }
      )
      setSelectedDiff(diff)
    } catch (e) {
      setSelectedDiff(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [workspacePath, stagedMode])

  const loadLog = useCallback(async () => {
    if (!workspacePath) return
    try {
      const result = await tauriInvoke<unknown[]>('git_get_log', { workspacePath })
      setCommits((result as Record<string, unknown>[]).map((c) => ({
        hash: String(c.hash || c.sha || '').slice(0, 7),
        author: String(c.author || ''),
        date: String(c.date || c.timestamp || ''),
        message: String(c.message || c.subject || ''),
      })))
    } catch { /* ignore */ }
  }, [workspacePath])

  const stageFile = useCallback(async (path: string) => {
    await tauriInvoke('git_stage_file', { workspacePath, filePath: path })
    void refresh(workspacePath)
  }, [workspacePath, refresh])

  const commit = useCallback(async () => {
    if (!commitMsg.trim() || !workspacePath) return
    setCommitting(true)
    try {
      const result = await tauriInvoke<CommitResult>('git_commit_changes', {
        workspacePath,
        message: commitMsg.trim(),
        // git_commit_changes 参数：可能要求 stagedOnly / options，尽力适配
        options: {},
      })
      setCommitMsg('')
      setError(result.error ?? null)
      void refresh(workspacePath)
      void loadLog()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCommitting(false)
    }
  }, [commitMsg, workspacePath, refresh, loadLog])

  useEffect(() => { void loadLog() }, [loadLog])

  const allChanges = useMemo(() => {
    if (!status) return []
    return [
      ...status.staged.map((f) => ({ ...f, _staged: true })),
      ...status.unstaged.map((f) => ({ ...f, _staged: false })),
      ...status.untracked.map((p) => ({ path: p, status: 'untracked' as const, _staged: false })),
    ]
  }, [status])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 12 }}>
      {/* 工作区选择 */}
      <div style={{ padding: 8, borderBottom: '1px solid #3F3F46', display: 'flex', gap: 6 }}>
        <input
          value={workspacePath}
          onChange={(e) => setWorkspacePath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && refresh(workspacePath)}
          placeholder="Git 仓库路径（回车加载）"
          style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#1E1E24', color: '#F0F0F0' }}
        />
        <button onClick={() => refresh(workspacePath)} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #3F3F46', background: '#2D2D33', color: '#CCC' }}>加载</button>
      </div>

      {/* 仓库信息条 */}
      {status?.exists && (
        <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #28282E', background: '#1A1A20' }}>
          <span style={{ color: '#3fb950', fontWeight: 600 }}>{status.branch}</span>
          <span style={{ color: '#8B949E', fontSize: 11 }}>{status.shortCommit}</span>
          {status.ahead > 0 && <span style={{ color: '#3fb950', fontSize: 11 }}>↑{status.ahead}</span>}
          {status.behind > 0 && <span style={{ color: '#d29922', fontSize: 11 }}>↓{status.behind}</span>}
          <span style={{ marginLeft: 'auto', color: '#8B949E', fontSize: 11 }}>
            {status.staged.length + status.unstaged.length + status.untracked.length} 变更
          </span>
        </div>
      )}

      {/* diff 源切换 */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #28282E' }}>
        {(['工作区', '暂存区'] as const).map((label, i) => (
          <button
            key={label}
            onClick={() => { setStagedMode(i === 1); setSelectedFile(null); setSelectedDiff(null) }}
            style={{
              padding: '2px 10px', borderRadius: 4, fontSize: 11,
              border: `1px solid ${(i === (stagedMode ? 1 : 0)) ? '#3B82F6' : '#3F3F46'}`,
              background: (i === (stagedMode ? 1 : 0)) ? '#3B82F620' : 'transparent',
              color: (i === (stagedMode ? 1 : 0)) ? '#3B82F6' : '#999',
              cursor: 'pointer'
            }}
          >{label}</button>
        ))}
      </div>

      {error && <div style={{ padding: 8, color: '#f85149' }}>{error}</div>}
      {loading && <div style={{ padding: 8, color: '#8B949E' }}>加载中…</div>}

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* 变更文件列表 */}
        <div style={{ width: '42%', overflowY: 'auto', borderRight: '1px solid #28282E' }}>
          {allChanges.map((f) => {
            const meta = STATUS_META[f.status] ?? STATUS_META.untracked
            const selected = selectedFile === f.path
            return (
              <div
                key={`${f._staged ? 's' : 'u'}-${f.path}`}
                onClick={() => loadDiff(f.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                  cursor: 'pointer', background: selected ? '#1F6FEB22' : 'transparent',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = selected ? '#1F6FEB22' : '#28282E22' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = selected ? '#1F6FEB22' : 'transparent' }}
              >
                <span style={{ width: 16, textAlign: 'center', color: meta.color, fontWeight: 700 }}>{meta.label}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#DDD' }}>
                  {f.path.split('/').pop()}
                </span>
                <span style={{ color: '#8B949E', fontSize: 10, cursor: 'pointer' }} title={f.path}>{f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : ''}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); void stageFile(f.path) }}
                  title={f._staged ? '已暂存' : '暂存'}
                  style={{ background: 'transparent', border: 'none', color: f._staged ? '#3fb950' : '#8B949E', cursor: 'pointer', fontSize: 11 }}
                >{f._staged ? '✓' : '+'}</button>
              </div>
            )
          })}
          {allChanges.length === 0 && !loading && (
            <div style={{ padding: 20, textAlign: 'center', color: '#8B949E' }}>工作区干净 ✨</div>
          )}
        </div>

        {/* diff 内容 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 8, fontFamily: 'monospace', fontSize: 11 }}>
          {selectedDiff ? renderUnifiedDiff(selectedDiff.old_content, selectedDiff.new_content) : (
            <div style={{ color: '#8B949E', textAlign: 'center', paddingTop: 30 }}>
              {selectedFile ? '加载 diff…' : '选择左侧文件查看 diff'}
            </div>
          )}
        </div>
      </div>

      {/* 提交输入 */}
      <div style={{ borderTop: '1px solid #28282E', padding: 8, display: 'flex', gap: 6 }}>
        <input
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && commit()}
          placeholder="提交信息（Conventional Commits）"
          style={{ flex: 1, padding: '5px 8px', borderRadius: 4, border: '1px solid #3F3F46', background: '#1E1E24', color: '#F0F0F0' }}
        />
        <button
          onClick={() => commit()}
          disabled={committing || !commitMsg.trim()}
          style={{
            padding: '5px 14px', borderRadius: 4, border: 'none', cursor: 'pointer',
            background: committing || !commitMsg.trim() ? '#3B82F640' : '#3B82F6', color: '#fff'
          }}
        >提交</button>
        {onSendToChat && (
          <button
            onClick={() => onSendToChat(`请帮我生成一条 Conventional Commits 提交信息。当前工作区：${workspacePath}\n\n当前暂存变更：\n${(status?.staged ?? []).map((f) => `- ${f.status}: ${f.path}`).join('\n')}`)}
            title="让 AI 生成提交信息"
            style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid #3F3F46', background: '#2D2D33', color: '#A78BFA', cursor: 'pointer' }}
          >AI ✨</button>
        )}
      </div>

      {/* 提交历史 */}
      <div style={{ borderTop: '1px solid #28282E', padding: '8px 12px' }}>
        <div style={{ color: '#8B949E', fontSize: 11, marginBottom: 4 }}>提交历史（最近 {commits.length}）</div>
        {commits.map((c) => (
          <div key={c.hash} style={{ display: 'flex', gap: 8, padding: '2px 0', fontSize: 11 }}>
            <span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>{c.hash}</span>
            <span style={{ color: '#DDD', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.message}</span>
            <span style={{ color: '#8B949E' }}>{c.author}</span>
          </div>
        ))}
      </div>
    </div>
  )
}