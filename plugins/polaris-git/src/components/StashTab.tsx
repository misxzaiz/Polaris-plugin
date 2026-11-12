/**
 * StashTab —— Stash 管理（第二批升级）：保存（可填说明/含未跟踪）/ 应用 / 弹出 /
 * 删除（确认）+ 右键菜单 + stash_show patch 查看（GP-08 语义区分 apply/pop）。
 */
import { useEffect, useState } from 'react';
import { repoStore } from '../model/repoStore.ts';
import { useEnsureList, useRepoState } from '../hooks.ts';
import { relativeTime } from '../model/format.ts';
import { DiffView } from './DiffView.tsx';
import { PgMenu } from './PgMenu.tsx';
import type { PgMenuItem } from './PgMenu.tsx';
import { PgDialogSlot } from './PgDialog.tsx';
import type { PgConfirmState, PgPromptState } from './PgDialog.tsx';
import { EmptyBlock, ErrorNote, LoadingSkeleton } from './states.tsx';
import { panelRootRef } from '../panelRoot.ts';

export function StashTab() {
  const state = useRepoState();
  useEnsureList('stashes', state.phase === 'ready');
  const list = state.stashes;
  const busy = state.writeBusy !== null;
  const [showIndex, setShowIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: PgMenuItem[]; header: string } | null>(null);
  const [confirm, setConfirm] = useState<PgConfirmState | null>(null);
  const [prompt, setPrompt] = useState<PgPromptState | null>(null);

  const stashMenu = (index: number): PgMenuItem[] => [
    { key: 'show', label: '查看内容', onSelect: () => setShowIndex((cur) => (cur === index ? null : index)) },
    { key: 'apply', label: '应用（保留 stash）', disabled: busy, onSelect: () => void repoStore.stashApply(index) },
    { key: 'pop', label: '弹出（应用并删除）', disabled: busy, onSelect: () => void repoStore.stashPop(index) },
    {
      key: 'drop',
      label: '删除…',
      danger: true,
      disabled: busy,
      separatorBefore: true,
      onSelect: () =>
        setConfirm({
          title: `删除 stash@{${index}}？`,
          message: '删除后该条 stash 无法恢复。',
          confirmLabel: `删除 stash@{${index}}`,
          danger: true,
          onConfirm: () => void repoStore.stashDrop(index),
        }),
    },
  ];

  return (
    <div className="pg-listtab">
      <PgDialogSlot confirm={confirm} prompt={prompt} setConfirm={setConfirm} setPrompt={setPrompt} />
      {menu && <PgMenu anchorClientX={menu.x} anchorClientY={menu.y} container={panelRootRef.current} items={menu.items} header={menu.header} onClose={() => setMenu(null)} />}
      <div className="pg-actionrow">
        <span className="pg-actionrow-title">右键条目可应用 / 弹出 / 删除</span>
        <button
          type="button"
          className="pg-mini"
          disabled={busy}
          onClick={() =>
            setPrompt({
              title: '保存 stash',
              placeholder: '说明（可选，缺省为最近提交名）',
              confirmLabel: '保存',
              message: '将工作区与暂存区的未提交改动入栈（不含未跟踪文件）。',
              onSubmit: (v) => {
                void repoStore.stashSave(v.trim() || undefined);
              },
            })
          }
        >
          ＋ 保存 stash
        </button>
      </div>
      {list.loading && list.data === null ? (
        <LoadingSkeleton rows={5} />
      ) : list.error ? (
        <ErrorNote message={list.error} onRetry={() => void repoStore.loadList('stashes', true)} />
      ) : list.data === null ? null : list.data.length === 0 ? (
        <EmptyBlock title="没有 stash" hint="有未提交改动时可点击上方「保存 stash」入栈。" />
      ) : (
        <div className="pg-filelist">
          <div className="pg-group">
            {list.data.map((s) => (
              <div key={s.index} className="pg-stashitem-wrap">
                <div
                  className={`pg-row pg-row-btn${showIndex === s.index ? ' pg-row-current' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={showIndex === s.index}
                  onClick={() => setShowIndex((cur) => (cur === s.index ? null : s.index))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setShowIndex((cur) => (cur === s.index ? null : s.index));
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, items: stashMenu(s.index), header: `stash@{${s.index}} ${s.message}` });
                  }}
                  title={s.message}
                >
                  <span className="pg-row-main">
                    <span className="pg-row-sha">#{s.index}</span> {s.message}
                  </span>
                  <span className="pg-row-meta">
                    <span className="pg-row-time">{s.branch}</span>
                    <span className="pg-row-time">{relativeTime(s.timestamp)}</span>
                  </span>
                </div>
                {showIndex === s.index && <StashPatch index={s.index} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StashPatch({ index }: { index: number }) {
  const [patch, setPatch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setPatch(null);
    setError(null);
    void repoStore
      .stashShow(index)
      .then((p) => {
        if (alive) setPatch(p);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [index]);
  return (
    <div className="pg-inline-diff">
      <DiffView
        patchText={patch}
        error={error}
        loading={patch === null && error === null}
        filePath={`stash@{${index}}`}
      />
    </div>
  );
}
