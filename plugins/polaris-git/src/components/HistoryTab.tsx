/**
 * HistoryTab —— 历史（spec GP-07 + 第二批右键菜单）：搜索 / 分页 / 提交详情内联。
 * 右键提交：复制 SHA / 复制信息 / 在此提交建标签 / 还原此提交(revert) / 拣选(cherry-pick)。
 * 详情文件列表直接使用 GitCommitDetails.files（自带 old/new content）渲染 diff。
 */
import { useEffect, useState } from 'react';
import { repoStore } from '../model/repoStore.ts';
import { useRepoState } from '../hooks.ts';
import type { GitCommitDetails } from '../types.ts';
import { firstLine, relativeTime } from '../model/format.ts';
import { DiffView } from './DiffView.tsx';
import { PgMenu } from './PgMenu.tsx';
import type { PgMenuItem } from './PgMenu.tsx';
import { PgDialogSlot } from './PgDialog.tsx';
import type { PgConfirmState, PgPromptState } from './PgDialog.tsx';
import { EmptyBlock, ErrorNote, LoadingSkeleton } from './states.tsx';
import { panelRootRef } from '../panelRoot.ts';

export function HistoryTab() {
  const state = useRepoState();
  const [input, setInput] = useState(state.logQuery);
  const [detailSha, setDetailSha] = useState<string | null>(null);
  const busy = state.writeBusy !== null;
  const [menu, setMenu] = useState<{ x: number; y: number; items: PgMenuItem[]; header: string } | null>(null);
  const [confirm, setConfirm] = useState<PgConfirmState | null>(null);
  const [prompt, setPrompt] = useState<PgPromptState | null>(null);

  useEffect(() => {
    if (state.phase === 'ready' && state.log.length === 0 && !state.logLoading && !state.logError) {
      void repoStore.loadLog(true);
    }
  }, [state.phase, state.log.length, state.logLoading, state.logError]);

  const runSearch = (): void => {
    repoStore.setSearchQuery(input);
    void repoStore.loadLog(true);
  };

  const copyText = (text: string): void => {
    void navigator.clipboard?.writeText(text).catch(() => {});
  };

  const commitMenu = (sha: string, message: string): PgMenuItem[] => [
    { key: 'copy-sha', label: '复制完整 SHA', onSelect: () => copyText(sha) },
    { key: 'copy-msg', label: '复制提交信息', onSelect: () => copyText(message) },
    {
      key: 'tag',
      label: '在此提交创建标签…',
      disabled: busy,
      separatorBefore: true,
      onSelect: () =>
        setPrompt({
          title: `在 ${sha.slice(0, 7)} 创建标签`,
          placeholder: '标签名（如 v1.0.0）',
          confirmLabel: '创建',
          message: firstLine(message),
          onSubmit: (v) => {
            const name = v.trim();
            if (!name) return null;
            void repoStore.createTag(name, sha);
          },
        }),
    },
    {
      key: 'revert',
      label: '还原此提交（revert）…',
      danger: true,
      disabled: busy,
      separatorBefore: true,
      onSelect: () =>
        setConfirm({
          title: `还原提交 ${sha.slice(0, 7)}？`,
          message: '生成一个反向提交抵消该提交的改动；若与当前工作区冲突，将在变更页顶部提示。',
          lines: [firstLine(message)],
          confirmLabel: `还原 ${sha.slice(0, 7)}`,
          danger: true,
          onConfirm: () => void repoStore.revertCommit(sha),
        }),
    },
    {
      key: 'cherry-pick',
      label: '拣选到当前分支（cherry-pick）…',
      disabled: busy,
      onSelect: () =>
        setConfirm({
          title: `拣选 ${sha.slice(0, 7)} 到当前分支？`,
          message: '把该提交的改动复制到当前分支并生成新提交；冲突时在变更页处理。',
          confirmLabel: `拣选 ${sha.slice(0, 7)}`,
          onConfirm: () => void repoStore.cherryPick(sha),
        }),
    },
  ];

  return (
    <div className="pg-history">
      <PgDialogSlot confirm={confirm} prompt={prompt} setConfirm={setConfirm} setPrompt={setPrompt} />
      {menu && <PgMenu anchorClientX={menu.x} anchorClientY={menu.y} container={panelRootRef.current} items={menu.items} header={menu.header} onClose={() => setMenu(null)} />}
      <div className="pg-searchrow">
        <input
          className="pg-input pg-input-grow"
          placeholder="搜索提交信息 / SHA（Enter 搜索）"
          value={input}
          aria-label="搜索提交"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runSearch();
            if (e.key === 'Escape') {
              setInput('');
              repoStore.setSearchQuery('');
              void repoStore.loadLog(true);
            }
          }}
        />
        {input && (
          <button
            type="button"
            className="pg-mini"
            aria-label="清除搜索"
            onClick={() => {
              setInput('');
              repoStore.setSearchQuery('');
              void repoStore.loadLog(true);
            }}
          >
            清除
          </button>
        )}
      </div>
      {state.logError && (
        <ErrorNote message={`历史加载失败：${state.logError}`} onRetry={() => void repoStore.loadLog(true)} />
      )}
      {state.logLoading ? (
        <LoadingSkeleton rows={8} />
      ) : state.log.length === 0 ? (
        <EmptyBlock
          title={state.logQuery ? '无匹配提交' : '暂无提交'}
          hint={
            state.logQuery
              ? '调整关键词后重试，或清除筛选。'
              : state.status?.isEmpty
                ? '空仓库：提交首个变更后出现在这里。'
                : undefined
          }
        />
      ) : (
        <div className="pg-loglist" role="list">
          {state.log.map((c) => (
            <LogRow
              key={c.sha}
              sha={c.sha}
              shortSha={c.shortSha}
              message={c.message}
              author={c.author}
              timestamp={c.timestamp}
              refs={c.refs ?? []}
              expanded={detailSha === c.sha}
              busy={busy}
              onToggle={() => setDetailSha((cur) => (cur === c.sha ? null : c.sha))}
              onContextMenu={(x, y) => setMenu({ x, y, items: commitMenu(c.sha, c.message), header: firstLine(c.message) })}
            />
          ))}
          {!state.logEnd && (
            <button
              type="button"
              className="pg-more-btn"
              disabled={state.logLoadingMore}
              onClick={() => void repoStore.loadLog(false)}
            >
              {state.logLoadingMore ? '加载中…' : '加载更多'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LogRow({
  sha,
  shortSha,
  message,
  author,
  timestamp,
  refs,
  expanded,
  busy,
  onToggle,
  onContextMenu,
}: {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  timestamp?: number;
  refs: Array<{ name: string; kind: string }>;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  void busy;
  return (
    <div className="pg-logitem-wrap">
      <button
        type="button"
        className={`pg-logitem${expanded ? ' pg-logitem-on' : ''}`}
        role="listitem"
        aria-expanded={expanded}
        onClick={onToggle}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e.clientX, e.clientY);
        }}
        title={message}
      >
        <span className="pg-logitem-sha">{shortSha}</span>
        <span className="pg-logitem-msg">{firstLine(message)}</span>
        <span className="pg-logitem-meta">
          {refs.slice(0, 2).map((r) => (
            <span key={r.name} className={`pg-ref pg-ref-${r.kind === 'tag' ? 'tag' : 'branch'}`}>
              {r.name}
            </span>
          ))}
          <span className="pg-logitem-author">{author}</span>
          <span className="pg-logitem-time">{relativeTime(timestamp)}</span>
        </span>
      </button>
      {expanded && <CommitDetail sha={sha} />}
    </div>
  );
}

export function CommitDetail({ sha }: { sha: string }) {
  const [data, setData] = useState<GitCommitDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    setOpenFile(null);
    void repoStore
      .commitDetails(sha)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [sha]);

  if (error) return <ErrorNote message={`提交详情加载失败：${error}`} />;
  if (!data) return <LoadingSkeleton rows={4} />;
  return (
    <div className="pg-commitdetail">
      <div className="pg-commitdetail-head">
        <pre className="pg-commitdetail-msg">{data.commit.message}</pre>
        <div className="pg-commitdetail-meta">
          {data.commit.author} &lt;{data.commit.authorEmail}&gt; · {relativeTime(data.commit.timestamp)} ·{' '}
          {data.totalAdditions} 增 / {data.totalDeletions} 删
        </div>
      </div>
      <div className="pg-commitdetail-files">
        {data.files.map((f) => (
          <div key={f.file_path} className="pg-commitdetail-file">
            <button
              type="button"
              className={`pg-fileitem-name pg-fileitem-name-btn${openFile === f.file_path ? ' pg-fileitem-on' : ''}`}
              title={f.file_path}
              aria-expanded={openFile === f.file_path}
              onClick={() => setOpenFile((cur) => (cur === f.file_path ? null : f.file_path))}
            >
              <span className="pg-fileitem-base">{f.file_path}</span>
              <span className="pg-diffcount">
                <span className="pg-addcount">+{f.additions ?? 0}</span>{' '}
                <span className="pg-delcount">-{f.deletions ?? 0}</span>
              </span>
            </button>
            {openFile === f.file_path && <DiffView entry={f} filePath={f.file_path} />}
          </div>
        ))}
      </div>
    </div>
  );
}
