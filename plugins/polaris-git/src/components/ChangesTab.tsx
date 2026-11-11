/**
 * ChangesTab —— 变更流水线（spec GP-02/GP-03/GP-04）：
 * 分组固定：冲突 → 已暂存 → 未暂存 → 未跟踪（无内容的组不占位）。
 * 选择框只改变选择；文件名点击展开内联 diff；行级主操作 = 暂存/取消暂存。
 * 批量条只展示选择集实际可执行的动作；写操作期间选择集只读（防重复提交）。
 * 本轮写范围 = 暂存/取消暂存/提交（discard 不在裁定范围内，不做）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GitDiffEntry, GitFileChange } from '../types.ts';
import { repoStore } from '../model/repoStore.ts';
import { useRepoState } from '../hooks.ts';
import { baseName, dirOf, STATUS_LABEL, STATUS_TONE, statusLetterOf } from '../model/format.ts';
import { DiffView } from './DiffView.tsx';
import { CommitBar } from './CommitBar.tsx';
import { ErrorNote, LoadingSkeleton } from './states.tsx';
import type { WidthMode } from './width.ts';

type Area = 'conflicted' | 'staged' | 'unstaged' | 'untracked';

interface Row {
  key: string; // `${area}:${path}`
  area: Area;
  path: string;
  oldPath?: string;
  change?: GitFileChange;
}

/** 提交草稿按仓库隔离（宽度/主题/tab 切换不丢草稿；会话级不落盘） */
const drafts = new Map<string, string>();

export function ChangesTab({ mode }: { mode: WidthMode }) {
  const state = useRepoState();
  const status = state.status;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

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

  // 状态 reconcile 后清掉已不存在的选择项（spec GP-03：成功后清空已不存在项）
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

  const selectedRows = Object.values(rows)
    .flat()
    .filter((r) => selected.has(r.key));
  const selectedStaged = selectedRows.filter((r) => r.area === 'staged');
  const selectedUnstaged = selectedRows.filter((r) => r.area === 'unstaged' || r.area === 'untracked');

  const allGroups: Array<{ area: Area; title: string; list: Row[] }> = [
    { area: 'conflicted', title: '冲突', list: rows.conflicted },
    { area: 'staged', title: '已暂存', list: rows.staged },
    { area: 'unstaged', title: '未暂存', list: rows.unstaged },
    { area: 'untracked', title: '未跟踪', list: rows.untracked },
  ];
  const groups = allGroups.filter((g) => g.list.length > 0);

  return (
    <div className="pg-changes">
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
              />
            ))}
          </div>
        ))}
        {groups.length === 0 && <div className="pg-clean">没有未提交改动</div>}
      </div>
      <CommitBar
        draft={drafts.get(state.repoPath ?? '') ?? ''}
        onDraftChange={(v) => drafts.set(state.repoPath ?? '', v)}
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
}: {
  row: Row;
  mode: WidthMode;
  busy: boolean;
  selected: boolean;
  expanded: boolean;
  statusVersion: number;
  onToggleSelect: (shift: boolean) => void;
  onExpand: () => void;
}) {
  const letter = row.change ? statusLetterOf(row.change) : row.area === 'conflicted' ? 'U' : 'A';
  const tone = row.change ? STATUS_TONE[row.change.status] : 'danger';
  const label = row.change ? STATUS_LABEL[row.change.status] : '冲突';
  const isStagedArea = row.area === 'staged';
  const dir = mode === 'narrow' ? '' : dirOf(row.path);

  return (
    <div className="pg-fileitem-wrap">
      <div className={`pg-fileitem${expanded ? ' pg-fileitem-on' : ''}`}>
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
        {row.area === 'staged' ? (
          <button
            type="button"
            className="pg-mini"
            disabled={busy}
            aria-label={`取消暂存 ${row.path}`}
            onClick={() => void repoStore.unstageFile(row.path)}
          >
            取消暂存
          </button>
        ) : (
          <button
            type="button"
            className="pg-mini"
            disabled={busy}
            aria-label={`暂存 ${row.path}`}
            onClick={() => void repoStore.stageFile(row.path)}
          >
            暂存
          </button>
        )}
      </div>
      {expanded && (
        <InlineDiff row={row} statusVersion={statusVersion} />
      )}
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
          entry = (await repoStore.worktreeFileDiff(row.path).catch(() => null)) ?? {
            file_path: row.path,
            change_type: 'added',
            old_content: '',
            new_content: '',
          };
          // 未跟踪文件无内容通道时的占位提示
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
      <DiffView
        entry={data?.entry ?? null}
        error={data?.error ?? undefined}
        loading={data === null}
        filePath={row.path}
      />
    </div>
  );
}
