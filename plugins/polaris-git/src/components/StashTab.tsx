/**
 * StashTab —— Stash 查询（spec GP-08 只读范围）：列表 + stash_show patch 查看。
 * apply/pop/drop 为写操作，不在本轮裁定范围。
 */
import { useEffect, useState } from 'react';
import { repoStore } from '../model/repoStore.ts';
import { useEnsureList, useRepoState } from '../hooks.ts';
import { relativeTime } from '../model/format.ts';
import { DiffView } from './DiffView.tsx';
import { EmptyBlock, ErrorNote, LoadingSkeleton } from './states.tsx';

export function StashTab() {
  const state = useRepoState();
  useEnsureList('stashes', state.phase === 'ready');
  const list = state.stashes;
  const [showIndex, setShowIndex] = useState<number | null>(null);

  if (list.loading && list.data === null) return <LoadingSkeleton rows={5} />;
  if (list.error) {
    return <ErrorNote message={list.error} onRetry={() => void repoStore.loadList('stashes', true)} />;
  }
  if (list.data === null) return null;
  if (list.data.length === 0) {
    return <EmptyBlock title="没有 stash" hint="保存 stash 为写操作，本轮插件未提供。" />;
  }
  return (
    <div className="pg-listtab">
      <div className="pg-group">
        {list.data.map((s) => (
          <div key={s.index} className="pg-stashitem-wrap">
            <button
              type="button"
              className={`pg-row pg-row-btn${showIndex === s.index ? ' pg-row-current' : ''}`}
              aria-expanded={showIndex === s.index}
              onClick={() => setShowIndex((cur) => (cur === s.index ? null : s.index))}
              title={s.message}
            >
              <span className="pg-row-main">
                <span className="pg-row-sha">#{s.index}</span> {s.message}
              </span>
              <span className="pg-row-meta">
                <span className="pg-row-time">{s.branch}</span>
                <span className="pg-row-time">{relativeTime(s.timestamp)}</span>
              </span>
            </button>
            {showIndex === s.index && <StashPatch index={s.index} />}
          </div>
        ))}
      </div>
      <div className="pg-hint">apply / pop / drop 为写操作，本轮插件未提供（暂存/提交之外的写动作待后续批次）。</div>
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
      <DiffView patchText={patch} error={error} loading={patch === null && error === null} filePath={`stash@{${index}}`} />
    </div>
  );
}
