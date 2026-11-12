/**
 * ListTabs —— 分支 / 远程 / 标签 / 忽略（第二批升级为可操作）：
 * - 分支：新建/切换/重命名/删除（右键菜单 + 切换风险确认 GP-08）
 * - 远程：fetch / pull / push / push 设上游（网络长任务，busy 由 store.writeBusy 承担）
 * - 标签：创建（HEAD 或指定提交）/ 删除（确认）
 * - 忽略：查看 / 编辑保存 / 模板插入
 * 数据全部来自 cap.git；写动作成功后由 store 强刷关联列表。
 */
import { useEffect, useState } from 'react';
import { repoStore } from '../model/repoStore.ts';
import { useEnsureList, useRepoState } from '../hooks.ts';
import { relativeTime } from '../model/format.ts';
import { PgMenu } from './PgMenu.tsx';
import type { PgMenuItem } from './PgMenu.tsx';
import { PgDialogSlot } from './PgDialog.tsx';
import type { PgConfirmState, PgPromptState } from './PgDialog.tsx';
import { EmptyBlock, ErrorNote, LoadingSkeleton } from './states.tsx';
import { panelRootRef } from '../panelRoot.ts';
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
    return <ErrorNote message={list.error} onRetry={() => void repoStore.loadList(listKey, true)} />;
  }
  if (list.data === null) return null;
  return (
    <div className="pg-listtab">
      <button
        type="button"
        className="pg-ghostbtn pg-refresh-inline"
        aria-label="刷新"
        onClick={() => void repoStore.loadList(listKey, true)}
      >
        刷新
      </button>
      {children(list.data)}
    </div>
  );
}

/** 分支 Tab（新建/右键菜单：切换/重命名/删除） */
export function BranchesTab() {
  const state = useRepoState();
  const busy = state.writeBusy !== null;
  const [menu, setMenu] = useState<{ x: number; y: number; items: PgMenuItem[]; header: string } | null>(null);
  const [confirm, setConfirm] = useState<PgConfirmState | null>(null);
  const [prompt, setPrompt] = useState<PgPromptState | null>(null);
  const current = state.status?.branch ?? '';

  const branchMenu = (name: string, isCurrent: boolean): PgMenuItem[] => [
    {
      key: 'checkout',
      label: '切换到此分支',
      disabled: isCurrent || busy,
      onSelect: () => {
        if ((state.status?.staged.length ?? 0) + (state.status?.unstaged.length ?? 0) > 0) {
          setConfirm({
            title: `切换到 ${name}？`,
            message: '工作区有未提交改动，切换分支可能产生冲突或把改动带到目标分支。',
            confirmLabel: `切换到 ${name}`,
            onConfirm: () => void repoStore.checkoutBranch(name),
          });
        } else {
          void repoStore.checkoutBranch(name);
        }
      },
    },
    {
      key: 'rename',
      label: '重命名…',
      disabled: isCurrent || busy,
      onSelect: () =>
        setPrompt({
          title: `重命名分支 ${name}`,
          initialValue: name,
          confirmLabel: '重命名',
          onSubmit: (v) => {
            const trimmed = v.trim();
            if (!trimmed || trimmed === name) return null;
            void repoStore.renameBranch(name, trimmed);
          },
        }),
    },
    {
      key: 'delete',
      label: '删除分支…',
      danger: true,
      disabled: isCurrent || busy,
      separatorBefore: true,
      onSelect: () =>
        setConfirm({
          title: `删除分支 ${name}？`,
          message: '删除后该分支的未合并提交将不可通过此分支访问（后端自动留撤销快照）。',
          confirmLabel: `删除 ${name}`,
          danger: true,
          onConfirm: () => void repoStore.deleteBranch(name, false),
        }),
    },
  ];

  return (
    <ListShell listKey="branches">
      {(data) => {
        const branches = data as Array<{
          name: string;
          isCurrent: boolean;
          isRemote: boolean;
          ahead?: number;
          behind?: number;
          lastCommitDate?: number;
        }>;
        const local = branches.filter((b) => !b.isRemote);
        const remote = branches.filter((b) => b.isRemote);
        return (
          <>
            <PgDialogSlot confirm={confirm} prompt={prompt} setConfirm={setConfirm} setPrompt={setPrompt} />
            {menu && <PgMenu anchorClientX={menu.x} anchorClientY={menu.y} container={panelRootRef.current} items={menu.items} header={menu.header} onClose={() => setMenu(null)} />}
            <div className="pg-actionrow">
              <span className="pg-actionrow-title">右键分支可切换 / 重命名 / 删除</span>
              <button
                type="button"
                className="pg-mini"
                disabled={busy}
                onClick={() =>
                  setPrompt({
                    title: '新建分支',
                    placeholder: '分支名（如 feat/my-feature）',
                    confirmLabel: '创建',
                    message: '创建后是否立即切换可在创建后于分支右键中选择。',
                    onSubmit: (v) => {
                      const name = v.trim();
                      if (!name) return null;
                      void repoStore.createBranch(name, false);
                    },
                  })
                }
              >
                ＋ 新建分支
              </button>
            </div>
            <BranchGroup
              title="本地分支"
              branches={local}
              current={current}
              onContextMenu={(x, y, name, isCur) => setMenu({ x, y, items: branchMenu(name, isCur), header: name })}
            />
            {remote.length > 0 && <BranchGroup title="远程分支" branches={remote} current={current} onContextMenu={undefined} />}
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
  onContextMenu,
}: {
  title: string;
  branches: Array<{ name: string; isCurrent: boolean; isRemote: boolean; ahead?: number; behind?: number; lastCommitDate?: number }>;
  current: string;
  onContextMenu?: (x: number, y: number, name: string, isCurrent: boolean) => void;
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
      {sorted.map((b) => {
        const isCur = b.isCurrent || b.name === current;
        return (
          <div
            key={b.name}
            className={`pg-row${isCur ? ' pg-row-current' : ''}${onContextMenu ? ' pg-row-btn' : ''}`}
            onContextMenu={
              onContextMenu
                ? (e) => {
                    e.preventDefault();
                    onContextMenu(e.clientX, e.clientY, b.name, isCur);
                  }
                : undefined
            }
          >
            <span className="pg-row-main" title={b.name}>
              {b.name}
              {isCur && <span className="pg-tag-annotated">（当前）</span>}
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
        );
      })}
    </div>
  );
}

/** 远程 Tab：fetch/pull/push/push 设上游（GP-08 长任务可见） */
export function RemotesTab() {
  const state = useRepoState();
  const busy = state.writeBusy !== null;
  const currentBranch = state.status?.branch ?? '';
  const noRemote = (data: unknown): boolean => (data as Array<unknown>).length === 0;
  return (
    <ListShell listKey="remotes">
      {(data) => (
        <>
          <div className="pg-actionrow">
            <span className="pg-actionrow-title">{busy ? state.writeBusy : '网络操作经 WRITE_GATE 串行执行'}</span>
            <button type="button" className="pg-mini" disabled={busy} onClick={() => void repoStore.fetchRemote()}>
              Fetch（全部）
            </button>
            <button
              type="button"
              className="pg-mini"
              disabled={busy || !currentBranch}
              onClick={() => void repoStore.pullBranch()}
              title={`拉取并合并 ${currentBranch || '（无当前分支）'} 的上游`}
            >
              Pull
            </button>
            <button
              type="button"
              className="pg-mini"
              disabled={busy || !currentBranch}
              onClick={() => void repoStore.pushBranch(currentBranch)}
              title={`推送 ${currentBranch || '（无当前分支）'} 到 origin（非强推）`}
            >
              Push
            </button>
          </div>
          {noRemote(data) ? (
            <EmptyBlock
              title="没有配置远程仓库"
              hint="添加远程：git remote add origin <url> 后点击上方刷新。"
            />
          ) : (
            <div className="pg-group">
              {(data as Array<{ name: string; fetch_url?: string; push_url?: string }>).map((r) => (
                <div key={r.name} className="pg-row pg-row-stack">
                  <span className="pg-row-main">
                    {r.name}
                    <button
                      type="button"
                      className="pg-ghostbtn"
                      style={{ marginLeft: 8 }}
                      disabled={busy}
                      onClick={() => void repoStore.fetchRemote(r.name)}
                    >
                      fetch
                    </button>
                  </span>
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
          )}
          {currentBranch && (state.status?.ahead ?? 0) > 0 && (
            <div className="pg-hint">
              当前分支领先 {(state.status?.ahead ?? 0)} 个提交：可点击上方 Push 推送；无上游时提示失败后可改用
              「设置上游」流程（后续批次入口化）。
            </div>
          )}
        </>
      )}
    </ListShell>
  );
}

/** 标签 Tab：创建（HEAD）/ 右键删除 */
export function TagsTab() {
  const state = useRepoState();
  const busy = state.writeBusy !== null;
  const [menu, setMenu] = useState<{ x: number; y: number; items: PgMenuItem[]; header: string } | null>(null);
  const [confirm, setConfirm] = useState<PgConfirmState | null>(null);
  const [prompt, setPrompt] = useState<PgPromptState | null>(null);

  const tagMenu = (name: string): PgMenuItem[] => [
    {
      key: 'delete',
      label: '删除标签…',
      danger: true,
      disabled: busy,
      onSelect: () =>
        setConfirm({
          title: `删除标签 ${name}？`,
          message: '仅删除本地标签（不推送删除到远程）。',
          confirmLabel: `删除 ${name}`,
          danger: true,
          onConfirm: () => void repoStore.deleteTag(name),
        }),
    },
  ];

  return (
    <ListShell listKey="tags">
      {(data) => {
        const tags = data as Array<{ name: string; shortSha: string; message?: string; timestamp?: number; isAnnotated: boolean }>;
        return (
          <>
            <PgDialogSlot confirm={confirm} prompt={prompt} setConfirm={setConfirm} setPrompt={setPrompt} />
            {menu && <PgMenu anchorClientX={menu.x} anchorClientY={menu.y} container={panelRootRef.current} items={menu.items} header={menu.header} onClose={() => setMenu(null)} />}
            <div className="pg-actionrow">
              <span className="pg-actionrow-title">右键标签可删除</span>
              <button
                type="button"
                className="pg-mini"
                disabled={busy}
                onClick={() =>
                  setPrompt({
                    title: '新建标签（指向 HEAD）',
                    placeholder: '标签名（如 v1.0.0）',
                    confirmLabel: '创建',
                    onSubmit: (v) => {
                      const name = v.trim();
                      if (!name) return null;
                      void repoStore.createTag(name);
                    },
                  })
                }
              >
                ＋ 新建标签
              </button>
            </div>
            {tags.length === 0 ? (
              <EmptyBlock title="没有标签" hint="可在历史页右键任意提交创建标签。" />
            ) : (
              <div className="pg-group">
                {tags.map((t) => (
                  <div
                    key={t.name}
                    className="pg-row pg-row-btn"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, items: tagMenu(t.name), header: t.name });
                    }}
                  >
                    <span className="pg-row-main" title={t.message ?? t.name}>
                      {t.name}
                      {t.isAnnotated ? <span className="pg-tag-annotated">⊕ 附注</span> : null}
                    </span>
                    <span className="pg-row-meta">
                      <span className="pg-row-sha">{t.shortSha}</span>
                      {t.timestamp ? <span className="pg-row-time">{relativeTime(t.timestamp)}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        );
      }}
    </ListShell>
  );
}

/** 忽略 Tab：查看 / 编辑保存 / 模板插入 */
export function GitignoreTab() {
  const state = useRepoState();
  const busy = state.writeBusy !== null;
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  return (
    <ListShell listKey="gitignore">
      {(data) => {
        const gi = data as { exists: boolean; content: string; path: string };
        const shown = content ?? gi.content;
        if (!editing) {
          return (
            <>
              <div className="pg-actionrow">
                <span className="pg-actionrow-title" title={gi.path}>.gitignore</span>
                <button
                  type="button"
                  className="pg-mini"
                  disabled={busy}
                  onClick={() => {
                    setContent(gi.content);
                    setEditing(true);
                  }}
                >
                  编辑
                </button>
              </div>
              {gi.exists ? (
                <pre className="pg-gitignore-content">{gi.content || '（空文件）'}</pre>
              ) : (
                <EmptyBlock title="仓库没有 .gitignore" hint={`点击「编辑」创建：${gi.path}`} />
              )}
            </>
          );
        }
        return (
          <div className="pg-listtab">
            <div className="pg-actionrow">
              <span className="pg-actionrow-title">编辑 .gitignore（保存时整份写入）</span>
              <button
                type="button"
                className="pg-mini"
                disabled={busy}
                onClick={() => setContent((shown) + '\n# Node\nnode_modules/\n# 构建产物\ndist/\n')}
              >
                插入常用模板
              </button>
              <button type="button" className="pg-mini" onClick={() => setEditing(false)}>
                取消
              </button>
              <button
                type="button"
                className="pg-primary-btn"
                disabled={busy}
                onClick={() => {
                  void repoStore.saveGitignore(shown).then((ok) => {
                    if (ok) {
                      setEditing(false);
                      setContent(null);
                    }
                  });
                }}
              >
                保存
              </button>
            </div>
            <textarea
              className="pg-gitignore-editor"
              value={shown}
              spellCheck={false}
              onChange={(e) => setContent(e.target.value)}
              aria-label="编辑 .gitignore 内容"
            />
          </div>
        );
      }}
    </ListShell>
  );
}
