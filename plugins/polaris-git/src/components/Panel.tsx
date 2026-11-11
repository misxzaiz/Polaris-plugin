/**
 * Panel —— L1 侧栏主面板根（spec §2.1/§3）：
 * 纵向结构 = 仓库头(40px) + 7 Tab strip(36px, 横向滚动) + 状态横幅 + 内容滚动区 + 提交区。
 * 数据唯一真相 = cap.git 快照；本组件只持有 activeTab 纯 UI 状态。
 */
import { useState } from 'react';
import { repoStore } from '../model/repoStore.ts';
import { hasHostBridge } from '../bridge.ts';
import { useRepoState } from '../hooks.ts';
import { totalChangeCount } from '../model/format.ts';
import { useContainerWidth } from './width.ts';
import type { WidthMode } from './width.ts';
import { ChangesTab } from './ChangesTab.tsx';
import { HistoryTab } from './HistoryTab.tsx';
import { BranchesTab, GitignoreTab, RemotesTab, TagsTab } from './ListTabs.tsx';
import { StashTab } from './StashTab.tsx';
import { EmptyBlock, ErrorNote, LoadingSkeleton, NoRepoBlock, NoWorkspaceBlock } from './states.tsx';

type TabId = 'changes' | 'history' | 'branch' | 'remote' | 'tags' | 'stash' | 'gitignore';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'changes', label: '变更' },
  { id: 'history', label: '历史' },
  { id: 'branch', label: '分支' },
  { id: 'remote', label: '远程' },
  { id: 'tags', label: '标签' },
  { id: 'stash', label: 'Stash' },
  { id: 'gitignore', label: '忽略' },
];

export function Panel() {
  const state = useRepoState();
  const [tab, setTab] = useState<TabId>('changes');
  const { ref, mode } = useContainerWidth();

  if (!hasHostBridge()) {
    return (
      <div className="pg-root" data-mode="regular">
        <EmptyBlock
          title="宿主桥不可用"
          hint="需要 Polaris 主应用提供 __POLARIS_HOST_INVOKE__（请升级主应用）。"
        />
      </div>
    );
  }

  return (
    <div className="pg-root" ref={ref} data-mode={mode}>
      <RepositoryHeader mode={mode} />
      {state.phase === 'ready' && <TabStrip active={tab} onChange={setTab} mode={mode} changeCount={state.status ? totalChangeCount(state.status) : 0} />}
      {state.phase === 'ready' && state.status?.conflicted.length ? (
        <div className="pg-conflictbar" role="alert">
          有 {state.status.conflicted.length} 个未解决冲突文件（变更页置顶）
        </div>
      ) : null}
      <div className="pg-content">
        {state.phase === 'no-workspace' && <NoWorkspaceBlock />}
        {state.phase === 'probing' && <LoadingSkeleton rows={6} />}
        {state.phase === 'no-repo' && <NoRepoBlock wsPath={state.wsPath} />}
        {state.phase === 'error' && (
          <ErrorNote
            message={state.error ?? '仓库探测失败'}
            onRetry={() => state.wsPath && repoStore.setWorkspace(state.wsPath)}
          />
        )}
        {state.phase === 'ready' && (
          <>
            {state.error && <ErrorNote message={state.error} onRetry={() => void repoStore.refreshStatus(false)} />}
            {state.statusLoading && !state.status && <LoadingSkeleton rows={8} />}
            {state.status && (
              <>
                {tab === 'changes' && <ChangesTab mode={mode} />}
                {tab === 'history' && <HistoryTab />}
                {tab === 'branch' && <BranchesTab />}
                {tab === 'remote' && <RemotesTab />}
                {tab === 'tags' && <TagsTab />}
                {tab === 'stash' && <StashTab />}
                {tab === 'gitignore' && <GitignoreTab />}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RepositoryHeader({ mode }: { mode: WidthMode }) {
  const state = useRepoState();
  const status = state.status;
  const refreshing = state.refreshing || state.statusLoading;
  const repoName = state.repoPath ? state.repoPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() : null;
  return (
    <div className="pg-header" title={state.repoPath ?? state.wsPath ?? undefined}>
      <span className="pg-header-repo" title={state.repoPath ?? undefined}>
        {repoName ?? 'Git'}
      </span>
      {status && !status.isEmpty && (
        <span className="pg-header-branch" title={`分支 ${status.branch} · ${status.shortCommit}`}>
          {status.branch}
          {(status.ahead > 0 || status.behind > 0) && (
            <span className="pg-ab-wrap">
              {status.ahead > 0 && (
                <span className="pg-ab" aria-label={`领先 ${status.ahead} 个提交`}>↑{status.ahead}</span>
              )}
              {status.behind > 0 && (
                <span className="pg-ab" aria-label={`落后 ${status.behind} 个提交`}>↓{status.behind}</span>
              )}
            </span>
          )}
        </span>
      )}
      {state.repos.length > 1 && (
        <select
          className="pg-header-repos"
          value={state.repoPath ?? ''}
          aria-label="选择仓库"
          onChange={(e) => repoStore.selectRepo(e.target.value)}
        >
          {state.repos.map((r) => (
            <option key={r.path} value={r.path}>
              {r.name}
            </option>
          ))}
        </select>
      )}
      <span className="pg-header-actions">
        <button
          type="button"
          className={`pg-iconbtn${refreshing ? ' pg-spinning' : ''}`}
          aria-label="刷新仓库状态"
          title="刷新"
          disabled={refreshing || state.phase !== 'ready'}
          onClick={() => {
            void repoStore.refreshStatus(true);
            for (const key of ['branches', 'remotes', 'tags', 'stashes', 'gitignore'] as const) {
              void repoStore.loadList(key, true);
            }
          }}
        >
          ⟳
        </button>
      </span>
      {mode === 'narrow' ? null : null}
    </div>
  );
}

function TabStrip({
  active,
  onChange,
  mode,
  changeCount,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  mode: WidthMode;
  changeCount: number;
}) {
  return (
    <div className="pg-tabstrip" role="tablist" aria-label="Git 功能页">
      {TABS.map((t) => {
        const count = t.id === 'changes' ? changeCount : undefined;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            aria-label={t.label + (count ? `（${count} 项变更）` : '')}
            className={`pg-tab${active === t.id ? ' pg-tab-on' : ''}`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {count ? <span className="pg-tab-count">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
