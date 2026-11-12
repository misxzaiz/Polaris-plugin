/**
 * ChangesTab —— 变更流水线（spec GP-02/GP-03/GP-04 + 第二批右键菜单）：
 * 分组固定：冲突 → 已暂存 → 未暂存 → 未跟踪；选择框只改变选择；行内 diff。
 * 右键菜单（GP-02）：暂存/取消暂存、丢弃（确认）、加入 .gitignore、复制路径。
 * discard 为危险操作：确认框列明文件与「未跟踪删除不可恢复」（GP-10）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GitDiffEntry, GitFileChange } from '../types.ts';
import { repoStore } from '../model/repoStore.ts';
import { useRepoState } from '../hooks.ts';
import { baseName, dirOf, STATUS_LABEL, STATUS_TONE, statusLetterOf } from '../model/format.ts';
import { DiffView } from './DiffView.tsx';
import { CommitBar } from './CommitBar.tsx';
import { PgMenu } from './PgMenu.tsx';
import type { PgMenuItem } from './PgMenu.tsx';
import { PgDialogSlot } from './PgDialog.tsx';
import type { PgConfirmState, PgPromptState } from './PgDialog.tsx';
import { ErrorNote, LoadingSkeleton } from './states.tsx';
import { panelRootRef } from '../panelRoot.ts';
import type { WidthMode } from './width.ts';

type Area = 'conflicted' | 'staged' | 'unstaged' | 'untracked';

interface Row {
  key: string; // `${area}:${path}`
  area: Area;
  path: string;
  oldPath?: string;
  change?: GitFileChange;
}

/** 提交草稿按仓库隔离（模块 Map 只做跨 tab/仓库记忆，受控值走组件 state） */
const drafts = new Map<string, string>();

export function ChangesTab({ mode }: { mode: WidthMode }) {
  const state = useRepoState();
  const status = state.status;
  const repoPath = state.repoPath ?? '';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PgConfirmState | null>(null);
  const [prompt, setPrompt] = useState<PgPromptState | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: PgMenuItem[]; header: string } | null>(null);
  const [draft, setDraft] = useState<string>(() => drafts.get(repoPath) ?? '');
  const changeDraft = (v: string): void => {
    setDraft(v);
    drafts.set(repoPath, v);
  };
  useEffect(() => {
    setDraft(drafts.get(repoPath) ?? '');
  }, [repoPath]);

  const anchorRef = useRef<string | null>(null);

  const rows = useMemo<Record<Area, Row[]>>(() => {
    const build = (area: Area) => (path: string, change?: GitFileChange): Row => ({
      key: `${area}:${path}`,
      area,
      path,
      oldPath: change?.old_path,
      change,
    });
    return {
      conflicted: (status?.conflicted ?? []).map((p) => build('conflicted')(p)),
      staged: (status?.staged ?? []).map((c) => build('staged')(c.path, c)),
      unstaged: (status?.unstaged ?? []).map((c) => build('unstaged')(c.path, c)),
      untracked: (status?.untracked ?? []).map((p) => build('untracked')(p)),
    };
  }, [status]);

  // 状态 reconcile 后清掉已不存在的选择项
  useEffect(() => {
    setSelected((prev) => {
      const all = new Set<string>();
      for (const list of Object.values(rows)) for (const r of list) all.add(r.key);
      const next = new Set([...prev].filter((k) => all.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  if (!status) return state.statusLoading ? <LoadingSkeleton rows={8} /> : null;

  const busy = state.writeBusy !== null;
  const toggle = (key: string, shift: boolean, list: Row[]): void => {
    if (busy) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && anchorRef.current !== null && anchorRef.current !== key) {
        const keys = list.map((r) => r.key);
        const a = keys.indexOf(anchorRef.current);
        const b = keys.indexOf(key);
        if (a !== -1 && b !== -1) {
          const [s, e] = a < b ? [a, b] : [b, a];
          for (let i = s; i <= e; i++) next.add(keys[i]);
          return next;
        }
      }
      if (next.has(key)) next.delete(key);
      else next.add(key);
      anchorRef.current = key;
      return next;
    });
  };

  const selectedRows = Object.values(rows).flat().filter((r) => selected.has(r.key));
  const selectedStaged = selectedRows.filter((r) => r.area === 'staged');
  const selectedUnstaged = selectedRows.filter((r) => r.area === 'unstaged' || r.area === 'untracked');

  const copyText = (text: string): void => {
    void navigator.clipboard?.writeText(text).catch(() => {});
  };

  const confirmDiscard = (paths: string[], hasUntracked: boolean): void => {
    setConfirm({
      title: paths.length === 1 ? `丢弃 ${baseName(paths[0])} 的改动？` : `丢弃 ${paths.length} 个文件的改动？`,
      message: '将丢弃这些文件在工作区的全部未提交改动，回到最近一次提交的内容。',
      lines: [...paths, ...(hasUntracked ? ['⚠ 未跟踪文件将被整文件删除，无法从 git 恢复'] : [])],
      confirmLabel: paths.length === 1 ? `丢弃 ${baseName(paths[0])}` : `丢弃 ${paths.length} 个文件`,
      danger: true,
      onConfirm: () => {
        void (paths.length === 1 ? repoStore.discardFile(paths[0]) : repoStore.batchDiscard(paths));
      },
    });
  };

  const rowMenu = (row: Row): PgMenuItem[] => {
    const items: PgMenuItem[] = [];
    if (row.area === 'staged') {
      items.push({ key: 'unstage', label: '取消暂存', onSelect: () => void repoStore.unstageFile(row.path) });
    } else {
      items.push({ key: 'stage', label: '暂存', onSelect: () => void repoStore.stageFile(row.path) });
    }
    if (row.area !== 'conflicted') {
      items.push({
        key: 'discard',
        label: '丢弃改动…',
        danger: true,
        onSelect: () => confirmDiscard([row.path], row.area === 'untracked'),
      });
    }
    items.push({ key: 'sep1', label: '', separatorBefore: true });
    items.push({
      key: 'ignore',
      label: '加入 .gitignore',
      onSelect: () => {
        const rule = row.path.includes('/') ? row.path.replace(/\\/g, '/') : `/${row.path}`;
        void repoStore.addToGitignore([rule]);
      },
    });
    items.push({ key: 'copy-path', label: '复制完整路径', onSelect: () => copyText(row.path) });
    items.push({ key: 'copy-name', label: '复制文件名', onSelect: () => copyText(baseName(row.path)) });
    return items;
  };

  const allGroups: Array<{ area: Area; title: string; list: Row[] }> = [
    { area: 'conflicted', title: '冲突', list: rows.conflicted },
    { area: 'staged', title: '已暂存', list: rows.staged },
    { area: 'unstaged', title: '未暂存', list: rows.unstaged },
    { area: 'untracked', title: '未跟踪', list: rows.untracked },
  ];
  const groups = allGroups.filter((g) => g.list.length > 0);

  return (
    <div className="pg-changes">
      <PgDialogSlot confirm={confirm} prompt={prompt} setConfirm={setConfirm} setPrompt={setPrompt} />
      {menu && <PgMenu anchorClientX={menu.x} anchorClientY={menu.y} container={panelRootRef.current} items={menu.items} header={menu.header} onClose={() => setMenu(null)} />}
      {state.writeError && <ErrorNote message={state.writeError} />}
      {selectedRows.length > 0 && (
        <div className="pg-batchbar" role="toolbar" aria-label="批量操作">
          <span className="pg-batchbar-count">已选 {selectedRows.length} 项</span>
          <button
            type="button"
            className="pg-mini"
            disabled={busy || selectedUnstaged.length === 0}
            title={selectedUnstaged.length === 0 ? '选择集中没有可暂存的未暂存/未跟踪文件' : undefined}
            onClick={() => {
              void repoStore.batchStage(selectedUnstaged.map((r) => r.path)).then(() => setSelected(new Set()));
            }}
          >
            暂存{selectedUnstaged.length > 0 ? ` ${selectedUnstaged.length}` : ''}
          </button>
          <button
            type="button"
            className="pg-mini"
            disabled={busy || selectedStaged.length === 0}
            title={selectedStaged.length === 0 ? '选择集中没有已暂存文件' : undefined}
            onClick={() => {
              void repoStore.batchUnstage(selectedStaged.map((r) => r.path)).then(() => setSelected(new Set()));
            }}
          >
            取消暂存{selectedStaged.length > 0 ? ` ${selectedStaged.length}` : ''}
          </button>
          <button
            type="button"
            className="pg-mini"
            disabled={busy || (selectedUnstaged.length === 0 && selectedStaged.length === 0)}
            onClick={() => {
              const paths = [...selectedUnstaged.map((r) => r.path), ...selectedStaged.map((r) => r.path)];
              confirmDiscard(paths, selectedUnstaged.some((r) => r.area === 'untracked'));
            }}
          >
            丢弃…
          </button>
          <button type="button" className="pg-mini" onClick={() => setSelected(new Set())}>
            清除
          </button>
        </div>
      )}
      <div className="pg-filelist" role="listbox" aria-multiselectable="true" aria-label="变更文件">
        {groups.map((g) => (
          <div key={g.area} className="pg-group">
            <div className="pg-group-title">{g.title} · {g.list.length}</div>
            {g.list.map((row) => (
              <FileRow
                key={row.key}
                row={row}
                mode={mode}
                busy={busy}
                selected={selected.has(row.key)}
                expanded={expanded === row.key}
                statusVersion={state.statusVersion}
                onToggleSelect={(shift) => toggle(row.key, shift, g.list)}
                onExpand={() => setExpanded((cur) => (cur === row.key ? null : row.key))}
                onContextMenu={(x, y) => setMenu({ x, y, items: rowMenu(row), header: row.path })}
              />
            ))}
          </div>
        ))}
        {groups.length === 0 && <div className="pg-clean">没有未提交改动</div>}
      </div>
      <CommitBar
        draft={draft}
        onDraftChange={changeDraft}
        stagedCount={rows.staged.length}
        selectedStagedPaths={selectedStaged.map((r) => r.path)}
        onCommitted={() => setSelected(new Set())}
      />
    </div>
  );
}

function FileRow({
  row,
  mode,
  busy,
  selected,
  expanded,
  statusVersion,
  onToggleSelect,
  onExpand,
  onContextMenu,
}: {
  row: Row;
  mode: WidthMode;
  busy: boolean;
  selected: boolean;
  expanded: boolean;
  statusVersion: number;
  onToggleSelect: (shift: boolean) => void;
  onExpand: () => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  // 无 GitFileChange 的行（untracked/conflicted 字符串清单）按区域给语义，字母恒显
  const letter = row.change ? statusLetterOf(row.change) : 'U';
  const tone = row.change ? STATUS_TONE[row.change.status] : 'danger';
  const label = row.change ? STATUS_LABEL[row.change.status] : row.area === 'conflicted' ? '冲突' : '未跟踪';
  const isStagedArea = row.area === 'staged';
  const dir = mode === 'narrow' ? '' : dirOf(row.path);

  return (
    <div className="pg-fileitem-wrap">
      <div
        className={`pg-fileitem${expanded ? ' pg-fileitem-on' : ''}`}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e.clientX, e.clientY);
        }}
      >
        <input
          type="checkbox"
          className="pg-fileitem-check"
          checked={selected}
          disabled={busy}
          aria-label={`选择 ${row.path}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(e.shiftKey);
          }}
          onChange={() => {}}
        />
        <span className={`pg-badge pg-badge-${tone}`} title={label} aria-label={label}>
          {letter}
        </span>
        <button
          type="button"
          className="pg-fileitem-name"
          title={row.path}
          onClick={onExpand}
          aria-expanded={expanded}
        >
          <span className="pg-fileitem-base">{baseName(row.oldPath ?? row.path)}</span>
          {dir && <span className="pg-fileitem-dir"> {dir}</span>}
          {row.oldPath && <span className="pg-fileitem-dir"> ← {baseName(row.oldPath)}</span>}
        </button>
        {row.area === 'conflicted' && <span className="pg-conflict-hint">解决后暂存</span>}
        {isStagedArea ? (
          <button
            type="button"
            className="pg-ghostbtn"
            disabled={busy}
            aria-label={`取消暂存 ${row.path}`}
            onClick={() => void repoStore.unstageFile(row.path)}
          >
            取消暂存
          </button>
        ) : (
          <button
            type="button"
            className="pg-ghostbtn"
            disabled={busy}
            aria-label={`暂存 ${row.path}`}
            onClick={() => void repoStore.stageFile(row.path)}
          >
            暂存
          </button>
        )}
      </div>
      {expanded && <InlineDiff row={row} statusVersion={statusVersion} />}
    </div>
  );
}

/** 内联 diff 预览：按 (statusVersion, area, path) 缓存取数结果 */
const diffCache = new Map<string, { entry: GitDiffEntry | null; error: string | null }>();

function InlineDiff({ row, statusVersion }: { row: Row; statusVersion: number }) {
  const [data, setData] = useState<{ entry: GitDiffEntry | null; error: string | null } | null>(
    () => diffCache.get(`${statusVersion}:${row.key}`) ?? null,
  );
  useEffect(() => {
    const cacheKey = `${statusVersion}:${row.key}`;
    const hit = diffCache.get(cacheKey);
    if (hit) {
      setData(hit);
      return;
    }
    let alive = true;
    diffCache.clear(); // 新快照到来，旧缓存整体失效
    setData(null);
    const load = async (): Promise<void> => {
      try {
        let entry: GitDiffEntry;
        if (row.area === 'staged') {
          entry = await repoStore.indexFileDiff(row.path);
        } else if (row.area === 'untracked') {
          entry =
            (await repoStore.worktreeFileDiff(row.path).catch(() => null)) ?? {
              file_path: row.path,
              change_type: 'added',
              old_content: '',
              new_content: '',
            };
          if (!entry.new_content && !entry.old_content && entry.change_type === 'added') {
            entry = { ...entry, new_content: undefined };
          }
        } else {
          entry = await repoStore.worktreeFileDiff(row.path);
        }
        const value = { entry, error: null };
        diffCache.set(cacheKey, value);
        if (alive) setData(value);
      } catch (e) {
        const value = { entry: null, error: e instanceof Error ? e.message : String(e) };
        diffCache.set(cacheKey, value);
        if (alive) setData(value);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [statusVersion, row.key, row.area, row.path]);

  return (
    <div className="pg-inline-diff">
      <DiffView entry={data?.entry ?? null} error={data?.error ?? undefined} loading={data === null} filePath={row.path} />
    </div>
  );
}
