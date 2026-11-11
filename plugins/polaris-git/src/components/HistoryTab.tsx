/**
 * HistoryTab —— 历史（spec GP-07）：搜索（search_log grep）/ 分页加载 / 提交详情内联。
 * 详情文件列表直接使用 GitCommitDetails.files（自带 old/new content）渲染 diff。
 * 【本轮偏差】泳道 lane graph（get_log_with_lanes.rows）暂不渲染， refs 徽章保留。
 */
import { useEffect, useState } from 'react';
import { repoStore } from '../model/repoStore.ts';
import { useRepoState } from '../hooks.ts';
import type { GitCommitDetails } from '../types.ts';
import { firstLine, relativeTime } from '../model/format.ts';
import { DiffView } from './DiffView.tsx';
import { EmptyBlock, ErrorNote, LoadingSkeleton } from './states.tsx';
import type { RefObject } from 'react';

export function HistoryTab({ searchRef }: { searchRef?: RefObject<HTMLInputElement> }) {
  const state = useRepoState();
  const [input, setInput] = useState(state.logQuery);
  const [detailSha, setDetailSha] = useState<string | null>(null);

  useEffect(() => {
    if (state.phase === 'ready' && state.log.length === 0 && !state.logLoading && !state.logError) {
      void repoStore.loadLog(true);
    }
  }, [state.phase, state.log.length, state.logLoading, state.logError]);

  const runSearch = (): void => {
    repoStore.setSearchQuery(input);
    void repoStore.loadLog(true);
  };

  return (
    <div className="pg-history">
      <div className="pg-searchrow">
        <input
          ref={searchRef}
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
      {state.logError && <ErrorNote message={`历史加载失败：${state.logError}`} onRetry={() => void repoStore.loadLog(true)} />}
      {state.logLoading ? (
        <LoadingSkeleton rows={8} />
      ) : state.log.length === 0 ? (
        <EmptyBlock
          title={state.logQuery ? '无匹配提交' : '暂无提交'}
          hint={state.logQuery ? '调整关键词后重试，或清除筛选。' : state.status?.isEmpty ? '空仓库：提交首个变更后出现在这里。' : undefined}
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
              onToggle={() => setDetailSha((cur) => (cur === c.sha ? null : c.sha))}
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
  onToggle,
}: {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  timestamp?: number;
  refs: Array<{ name: string; kind: string }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="pg-logitem-wrap">
      <button
        type="button"
        className={`pg-logitem${expanded ? ' pg-logitem-on' : ''}`}
        role="listitem"
        aria-expanded={expanded}
        onClick={onToggle}
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
