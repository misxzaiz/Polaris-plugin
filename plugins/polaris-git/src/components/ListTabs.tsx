/**
 * ListTabs —— 分支 / 远程 / 标签 / 忽略 四个只读查询 Tab（本轮裁定：写动作不做）。
 * 数据全部来自 cap.git 查询类 action，懒加载 + 手动刷新。
 */
import { repoStore } from '../model/repoStore.ts';
import { useEnsureList, useRepoState } from '../hooks.ts';
import { relativeTime } from '../model/format.ts';
import { EmptyBlock, ErrorNote, LoadingSkeleton } from './states.tsx';
import type { ListKey } from '../model/repoStore.ts';

function ListShell({
  listKey,
  children,
}: {
  listKey: ListKey;
  children: (data: unknown) => React.ReactNode;
}) {
  const state = useRepoState();
  const list = state[listKey];
  useEnsureList(listKey, state.phase === 'ready');
  if (list.loading && list.data === null) return <LoadingSkeleton rows={6} />;
  if (list.error) {
    return <ErrorNote message={`${list.error}`} onRetry={() => void repoStore.loadList(listKey, true)} />;
  }
  if (list.data === null) return null;
  return (
    <div className="pg-listtab">
      <button
        type="button"
        className="pg-mini pg-refresh-inline"
        aria-label="刷新"
        onClick={() => void repoStore.loadList(listKey, true)}
      >
        刷新
      </button>
      {children(list.data)}
    </div>
  );
}

export function BranchesTab() {
  const state = useRepoState();
  return (
    <ListShell listKey="branches">
      {(data) => {
        const branches = data as Array<{ name: string; isCurrent: boolean; isRemote: boolean; commit: string; ahead?: number; behind?: number; lastCommitDate?: number }>;
        const current = state.status?.branch ?? '';
        const local = branches.filter((b) => !b.isRemote);
        const remote = branches.filter((b) => b.isRemote);
        return (
          <>
            <BranchGroup title="本地分支" branches={local} current={current} />
            {remote.length > 0 && <BranchGroup title="远程分支" branches={remote} current={current} />}
          </>
        );
      }}
    </ListShell>
  );
}

function BranchGroup({
  title,
  branches,
  current,
}: {
  title: string;
  branches: Array<{ name: string; isCurrent: boolean; isRemote: boolean; ahead?: number; behind?: number; lastCommitDate?: number }>;
  current: string;
}) {
  // 当前分支置顶（spec GP-08）
  const sorted = [...branches].sort((a, b) => {
    const ac = a.isCurrent || a.name === current ? 0 : 1;
    const bc = b.isCurrent || b.name === current ? 0 : 1;
    return ac - bc;
  });
  return (
    <div className="pg-group">
      <div className="pg-group-title">{title} · {sorted.length}</div>
      {sorted.map((b) => (
        <div key={b.name} className={`pg-row${b.isCurrent || b.name === current ? ' pg-row-current' : ''}`}>
          <span className="pg-row-main" title={b.name}>
            {b.name}
          </span>
          <span className="pg-row-meta">
            {(b.ahead ?? 0) > 0 && (
              <span className="pg-ab" aria-label={`领先 ${b.ahead} 个提交`}>↑{b.ahead}</span>
            )}
            {(b.behind ?? 0) > 0 && (
              <span className="pg-ab" aria-label={`落后 ${b.behind} 个提交`}>↓{b.behind}</span>
            )}
            {b.lastCommitDate ? <span className="pg-row-time">{relativeTime(b.lastCommitDate)}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RemotesTab() {
  return (
    <ListShell listKey="remotes">
      {(data) => {
        const remotes = data as Array<{ name: string; fetch_url?: string; push_url?: string }>;
        if (remotes.length === 0) {
          return <EmptyBlock title="没有配置远程仓库" hint="本轮插件为只读查询，添加远程请在终端或内置工具完成。" />;
        }
        return (
          <div className="pg-group">
            {remotes.map((r) => (
              <div key={r.name} className="pg-row pg-row-stack">
                <span className="pg-row-main">{r.name}</span>
                {r.fetch_url && (
                  <span className="pg-row-sub" title={r.fetch_url}>
                    fetch: {r.fetch_url}
                  </span>
                )}
                {r.push_url && r.push_url !== r.fetch_url && (
                  <span className="pg-row-sub" title={r.push_url}>
                    push: {r.push_url}
                  </span>
                )}
              </div>
            ))}
          </div>
        );
      }}
    </ListShell>
  );
}

export function TagsTab() {
  return (
    <ListShell listKey="tags">
      {(data) => {
        const tags = data as Array<{ name: string; shortSha: string; message?: string; timestamp?: number; isAnnotated: boolean }>;
        if (tags.length === 0) return <EmptyBlock title="没有标签" />;
        return (
          <div className="pg-group">
            {tags.map((t) => (
              <div key={t.name} className="pg-row">
                <span className="pg-row-main" title={t.message ?? t.name}>
                  {t.name}
                  {t.isAnnotated ? <span className="pg-tag-annotated" title="附注标签"> ⊕</span> : null}
                </span>
                <span className="pg-row-meta">
                  <span className="pg-row-sha">{t.shortSha}</span>
                  {t.timestamp ? <span className="pg-row-time">{relativeTime(t.timestamp)}</span> : null}
                </span>
              </div>
            ))}
          </div>
        );
      }}
    </ListShell>
  );
}

export function GitignoreTab() {
  const state = useRepoState();
  return (
    <ListShell listKey="gitignore">
      {(data) => {
        const gi = data as { exists: boolean; content: string; path: string };
        if (!gi.exists) {
          return <EmptyBlock title="仓库没有 .gitignore" hint={`预期路径：${gi.path}`} />;
        }
        return (
          <div className="pg-gitignore">
            <div className="pg-group-title" title={gi.path}>.gitignore（只读）</div>
            <pre className="pg-gitignore-content">{gi.content}</pre>
            <div className="pg-hint">本轮插件为只读查询；编辑 .gitignore 请在编辑器中修改。</div>
          </div>
        );
      }}
    </ListShell>
  );
}
