/**
 * Panel.tsx —— history-desk 主面板（PRD §5.3 信息架构）
 *
 * 头部（刷新/关闭）→ 组合筛选 → 搜索框 → 列表（远端条 + 继续工作 + 日期分组）
 * 数据全走 host.ts（cap.history v2 + 会话桥），删除经宿主编排（墓碑），
 * 插件零写入、零旁路。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  capHistory,
  deleteHistorySession,
  forkSessionViaBridge,
  getHostListen,
  getHostWorkspacePath,
  isSessionRunning,
  listRunningSessions,
  markHistory,
  queryTimeline,
  restoreSession,
  searchHistory,
  type HistorySource,
  type PagedHistoryResult,
  type RunningSession,
  type UnifiedHistoryItem,
} from './host';
import { initLang, t } from './i18n';
import { Icon } from './icons';
import { HistoryList } from './HistoryList';
import { PreviewModal } from './PreviewModal';
import { DeleteDialog, ForkDialog } from './Dialogs';
import { RemoteStrip } from './RemoteStrip';
import { SessionTree } from './SessionTree';
import { forkStats, historyEnginesForFilter, needsDeleteConfirm, type PureHistoryItem } from './pure';
import { useHistoryPrefs, usePrefsCommit } from './prefs';

type Scope = 'workspace' | 'global';
type ViewMode = 'list' | 'tree';

interface PanelProps {
  pluginId?: string;
  onClose?: () => void;
}

export default function HistoryDeskPanel({ onClose }: PanelProps) {
  const prefs = useHistoryPrefs();
  const commitPrefs = usePrefsCommit();

  const [allHistory, setAllHistory] = useState<UnifiedHistoryItem[]>([]);
  const [scope, setScope] = useState<Scope>('workspace');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [engines, setEngines] = useState<string[]>(['claude-code', 'simple-ai']);
  const [starredOnly, setStarredOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UnifiedHistoryItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [forkTarget, setForkTarget] = useState<UnifiedHistoryItem | null>(null);
  const [previewTarget, setPreviewTarget] = useState<UnifiedHistoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedHistoryItem | null>(null);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [hostWsPath, setHostWsPath] = useState(getHostWorkspacePath());

  const scrollRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsMenuRef = useRef<HTMLDivElement>(null);

  // 语言初始化（自带 i18n，跟随宿主 document lang）
  useEffect(() => {
    initLang();
  }, []);

  // 引擎清单（cap.registry list；失败静默，仅影响筛选 chips）
  useEffect(() => {
    void capHistory<unknown>('list_sessions', { page: 1, pageSize: 1 })
      .then(() => undefined)
      .catch(() => undefined);
    // 引擎元数据无独立 cap；从 list_sessions 不可得，用保守静态集 + 已知扩展留空
    setEngines((prev) => (prev.length > 0 ? prev : ['claude-code', 'simple-ai']));
  }, []);

  // 宿主工作区路径（__POLARIS_HOST_WORKSPACE__ 保活字符串）
  useEffect(() => {
    const timer = setInterval(() => {
      const p = getHostWorkspacePath();
      setHostWsPath((prev) => (prev === p ? prev : p));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // 运行中会话冷启动（PRD §4.4：list_running 替代 follower 全量扫描）
  const refreshRunning = useCallback(() => {
    void listRunningSessions()
      .then((list: RunningSession[]) => {
        setRunningIds(new Set(list.map((s) => s.conversationId)));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshRunning();
  }, [refreshRunning, refreshTick]);

  // chat-event 生命周期事件：800ms 防抖自动刷新（对齐内置面板语义）+ running 增量
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unlisten: (() => void) | null = null;
    let disposed = false;
    getHostListen()('chat-event', (envelope) => {
      const env = envelope as { payload?: { payload?: { type?: string; sessionId?: string } } };
      const inner = env?.payload?.payload;
      if (!inner || (inner.type !== 'session_start' && inner.type !== 'session_end')) return;
      if (inner.type === 'session_start' && inner.sessionId) {
        setRunningIds((prev) => new Set(prev).add(inner.sessionId!));
      } else if (inner.type === 'session_end' && inner.sessionId) {
        setRunningIds((prev) => {
          const next = new Set(prev);
          next.delete(inner.sessionId!);
          return next;
        });
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRefreshTick((v) => v + 1), 800);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (unlisten) unlisten();
    };
  }, []);

  // 点击外部关闭工作区下拉
  useEffect(() => {
    if (!wsMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (wsMenuRef.current && !wsMenuRef.current.contains(e.target as Node)) setWsMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [wsMenuOpen]);

  const resolveWorkspacePath = useCallback((): string | null => {
    if (scope === 'workspace') return hostWsPath || null;
    return null;
  }, [scope, hostWsPath]);

  const fetchPage = useCallback(
    async (targetPage: number, forceScan = false): Promise<PagedHistoryResult> => {
      return queryTimeline({
        workspacePath: resolveWorkspacePath() ?? undefined,
        strictWorkspace: scope === 'workspace' || undefined,
        page: targetPage,
        pageSize: prefs.listPageSize,
        engines: historyEnginesForFilter(filter, engines),
        starred: starredOnly || undefined,
        archived: showArchived ? true : undefined,
        forceScan,
      });
    },
    [resolveWorkspacePath, scope, filter, engines, starredOnly, showArchived, prefs.listPageSize],
  );

  // 首页加载（筛选/刷新/宿主工作区变化触发）
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setPage(1);
      try {
        const result = await fetchPage(1, refreshTick > 0);
        if (cancelled) return;
        setAllHistory(result.items);
        setTotalCount(result.total);
        setHasMore(result.hasMore);
      } catch {
        if (!cancelled) setAllHistory([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [fetchPage, refreshTick]);

  // 全文搜索（防抖 250ms）
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchHistory(q, resolveWorkspacePath(), scope === 'workspace' || undefined);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, resolveWorkspacePath, scope]);

  const handleLoadMore = useCallback(async () => {
    const nextPage = page + 1;
    setPage(nextPage);
    setLoadingMore(true);
    try {
      const result = await fetchPage(nextPage);
      const existingIds = new Set(allHistory.map((h) => h.id));
      const newItems = result.items.filter((item) => !existingIds.has(item.id));
      setAllHistory((prev) => [...prev, ...newItems]);
      setTotalCount(result.total);
      setHasMore(result.hasMore);
    } catch {
      // 保持现状
    } finally {
      setLoadingMore(false);
    }
  }, [page, fetchPage, allHistory]);

  // 恢复会话（= 继续；走 __POLARIS_SESSION_API__.restore）
  const handleRestore = async (rawItem: UnifiedHistoryItem | PureHistoryItem) => {
    const item = rawItem as UnifiedHistoryItem;
    setRestoring(item.id);
    try {
      const effectiveProjectPath = item.projectPath || (scope === 'workspace' ? hostWsPath || undefined : undefined);
      const newId = await restoreSession({ ...item, projectPath: effectiveProjectPath });
      if (newId) {
        onClose?.();
      }
    } catch {
      // 失败静默（恢复链路内部已有日志与兜底）
    } finally {
      setRestoring(null);
    }
  };

  // 标注（乐观更新 + 失败回滚）
  const applyMarks = async (item: UnifiedHistoryItem, marks: { starred?: boolean; pinned?: boolean; archived?: boolean }) => {
    const apply = (list: UnifiedHistoryItem[]) => list.map((h) => (h.id === item.id ? { ...h, ...marks } : h));
    setAllHistory(apply);
    setSearchResults((prev) => (prev ? apply(prev) : prev));
    try {
      await markHistory(item.id, marks);
      if (marks.archived !== undefined) {
        setAllHistory((prev) => prev.filter((h) => h.id !== item.id));
        setTotalCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      const revert = (list: UnifiedHistoryItem[]) => list.map((h) => (h.id === item.id ? { ...h, ...item } : h));
      setAllHistory(revert);
      setSearchResults((prev) => (prev ? revert(prev) : prev));
    }
  };

  // 删除会话（cap.history delete_session：宿主编排 中断→JSONL→墓碑→索引）
  const handleDelete = async (rawItem: UnifiedHistoryItem | PureHistoryItem) => {
    const item = rawItem as UnifiedHistoryItem;
    setDeleting(item.id);
    try {
      await deleteHistorySession(item.id, item.source as HistorySource, item.engineId);
      setAllHistory((prev) => prev.filter((h) => h.id !== item.id));
      setSearchResults((prev) => (prev ? prev.filter((h) => h.id !== item.id) : prev));
      setTotalCount((prev) => Math.max(0, prev - 1));
    } catch {
      // 失败保持条目（宿主审计链已记录）
    } finally {
      setDeleting(null);
      setDeleteRunning(false);
    }
  };

  // 删除入口（UX-4：>2 条消息先确认；确认前查运行态做提示）
  const requestDelete = (rawItem: UnifiedHistoryItem | PureHistoryItem) => {
    const item = rawItem as UnifiedHistoryItem;
    if (!needsDeleteConfirm(item)) {
      void handleDelete(item);
      return;
    }
    setDeleteTarget(item);
    setDeleteRunning(false);
    void isSessionRunning(item.id).then((running) => {
      setDeleteRunning(running);
    });
  };

  // Fork（走 __POLARIS_SESSION_API__.fork；v1 不再前端拼消息，宿主 forkSession 内部整读）
  const handleFork = async (rawItem: UnifiedHistoryItem | PureHistoryItem, branchName?: string) => {
    const item = rawItem as UnifiedHistoryItem;
    try {
      const newId = await forkSessionViaBridge(item, branchName);
      if (!newId) {
        // 失败保持对话框（可改分支名重试）
        return;
      }
      setForkTarget(null);
    } catch {
      // 失败保持对话框
    }
  };

  const displayItems = useMemo<UnifiedHistoryItem[]>(
    () => searchResults ?? allHistory,
    [searchResults, allHistory],
  );

  const continueItems = useMemo(() => {
    if (searchResults || starredOnly || showArchived || prefs.recentCards === 0) return [];
    const pinned = allHistory.filter((h) => h.pinned);
    const recent = allHistory.filter((h) => !h.pinned).slice(0, prefs.recentCards);
    return [...pinned, ...recent].slice(0, Math.max(prefs.recentCards, pinned.length + 1));
  }, [allHistory, searchResults, starredOnly, showArchived, prefs.recentCards]);

  const stats = useMemo(() => forkStats(allHistory), [allHistory]);
  const showWorkspaceColumn = scope === 'global';

  if (loading) {
    return (
      <div className="hd-root">
        <div className="hd-header">
          <h2 className="hd-title">{t('history.title')}</h2>
          <div className="hd-header-actions">
            <button type="button" className="hd-iconbtn" onClick={onClose}>
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
        <div className="hd-empty" style={{ flex: 1 }}>
          <Icon name="loader" size={28} />
          <p>{t('history.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hd-root">
      {/* 头部 */}
      <div className="hd-header">
        <h2 className="hd-title">{t('history.title')}</h2>
        <div className="hd-header-actions">
          <button
            type="button"
            className="hd-iconbtn"
            onClick={() => setRefreshTick((v) => v + 1)}
            title={t('history.refresh')}
          >
            <Icon name="refresh" size={15} />
          </button>
          <button type="button" className="hd-iconbtn" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>

      {/* 筛选行 */}
      <div className="hd-filters">
        <button
          type="button"
          className={`hd-chip ${scope === 'workspace' ? 'hd-chip-on' : ''}`}
          onClick={() => setScope('workspace')}
        >
          <Icon name="folder" size={11} />
          {t('history.currentProject')}
        </button>
        <button
          type="button"
          className={`hd-chip ${scope === 'global' ? 'hd-chip-on' : ''}`}
          onClick={() => setScope('global')}
        >
          <Icon name="globe" size={11} />
          {t('history.all')}
        </button>

        <span className="hd-filters-sep" />

        <button
          type="button"
          className={`hd-chip ${filter === 'all' ? 'hd-chip-on' : ''}`}
          onClick={() => setFilter('all')}
        >
          {t('history.allEngines')}
        </button>
        {engines.map((e) => (
          <button
            key={e}
            type="button"
            className={`hd-chip ${filter === e ? 'hd-chip-on' : ''}`}
            onClick={() => setFilter(e)}
          >
            {e}
          </button>
        ))}

        <span className="hd-filters-sep" />

        <button
          type="button"
          className={`hd-chip ${starredOnly ? 'hd-chip-star-on' : ''}`}
          onClick={() => setStarredOnly((v) => !v)}
          title={t('history.starredOnly')}
        >
          <Icon name="star" size={11} filled={starredOnly} />
        </button>
        <button
          type="button"
          className={`hd-chip ${showArchived ? 'hd-chip-on' : ''}`}
          onClick={() => setShowArchived((v) => !v)}
          title={t('history.showArchived')}
        >
          <Icon name="archive" size={11} />
        </button>

        <span className="hd-filters-spacer" />

        <button
          type="button"
          className={`hd-chip ${viewMode === 'list' ? 'hd-chip-on' : ''}`}
          onClick={() => setViewMode('list')}
          title={t('history.listView')}
        >
          <Icon name="list" size={12} />
        </button>
        <button
          type="button"
          className={`hd-chip ${viewMode === 'tree' ? 'hd-chip-star-on' : ''}`}
          onClick={() => setViewMode('tree')}
          title={t('history.treeView')}
        >
          <Icon name="git-branch" size={12} />
        </button>
      </div>

      {/* 搜索框 */}
      <div className="hd-searchrow">
        <input
          type="text"
          className="hd-search"
          placeholder={t('history.searchFullText')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searching && (
          <span className="hd-search-spin">
            <Icon name="loader" size={14} />
          </span>
        )}
      </div>

      {/* 列表区 */}
      <div className="hd-body" ref={scrollRef}>
        <RemoteStrip />

        {/* 继续工作区 */}
        {continueItems.length > 0 && viewMode === 'list' && (
          <div className="hd-continue">
            <div className="hd-section-label">{t('history.continueWorking')}</div>
            <div className="hd-continue-cards">
              {continueItems.map((item) => (
                <div key={`cw-${item.id}`} className="hd-cw-card">
                  <div className="hd-cw-title">
                    {item.pinned && <Icon name="pin" size={11} filled />}
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </span>
                  </div>
                  <p className="hd-cw-preview">{item.preview || item.snippet || t('history.noPreview')}</p>
                  <div className="hd-cw-foot">
                    <span className="hd-badge hd-badge-engine">{item.engineId}</span>
                    <span style={{ flex: 1 }} />
                    <button
                      type="button"
                      className="hd-cw-continue"
                      onClick={() => handleRestore(item)}
                      disabled={restoring === item.id}
                    >
                      <Icon name={restoring === item.id ? 'loader' : 'play'} size={10} />
                      {t('history.continue')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {displayItems.length === 0 ? (
          <div className="hd-empty">
            <Icon name="message" size={40} />
            <p>
              {searchResults
                ? t('history.noSearchResults')
                : t('history.noHistory')}
            </p>
          </div>
        ) : viewMode === 'tree' ? (
          <SessionTree
            sessions={displayItems}
            restoringId={restoring}
            onRestore={(item) => handleRestore(item)}
            onSelect={(item) => setPreviewTarget(item as UnifiedHistoryItem)}
          />
        ) : (
          <HistoryList
            items={displayItems}
            searching={!!searchResults}
            restoringId={restoring}
            showWorkspaceColumn={showWorkspaceColumn}
            onToggleStar={(item) => applyMarks(item as UnifiedHistoryItem, { starred: !item.starred })}
            onTogglePin={(item) => applyMarks(item as UnifiedHistoryItem, { pinned: !item.pinned })}
            onToggleArchive={(item) => applyMarks(item as UnifiedHistoryItem, { archived: !item.archived })}
            onPreview={(item) => setPreviewTarget(item as UnifiedHistoryItem)}
            onRestore={(item) => handleRestore(item)}
            onFork={(item) => setForkTarget(item as UnifiedHistoryItem)}
            onDelete={(item) => (deleting === null ? requestDelete(item) : undefined)}
          />
        )}

        {/* 加载更多 */}
        {viewMode === 'list' && !searchResults && hasMore && (
          <div className="hd-more">
            <button type="button" className="hd-more-btn" onClick={handleLoadMore} disabled={loadingMore}>
              <Icon name={loadingMore ? 'loader' : 'chevron-down'} size={14} />
              <span>
                {loadingMore
                  ? t('history.loadingMore')
                  : t('history.loadMore', undefined, { count: Math.max(0, totalCount - allHistory.length) })}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div className="hd-foot">
        <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="database" size={11} />
          {searchResults ? t('history.searchHint') : t('history.unifiedHint')}
        </p>
        {(stats.forkCount > 0 || stats.prCount > 0) && (
          <div className="hd-foot-badges">
            {stats.forkCount > 0 && <span className="hd-foot-badge">{stats.forkCount} Fork</span>}
            {stats.prCount > 0 && <span className="hd-foot-badge" style={{ background: 'rgb(var(--c-status-info) / 0.14)', color: 'rgb(var(--c-status-info))' }}>{stats.prCount} PR</span>}
          </div>
        )}
      </div>

      {/* Fork 对话框 */}
      {forkTarget && (
        <ForkDialog
          item={forkTarget}
          onConfirm={(branchName) => handleFork(forkTarget, branchName)}
          onCancel={() => setForkTarget(null)}
        />
      )}

      {/* 删除确认框 */}
      {deleteTarget && (
        <DeleteDialog
          item={deleteTarget}
          running={deleteRunning}
          onConfirm={() => {
            const item = deleteTarget;
            setDeleteTarget(null);
            void handleDelete(item);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* 只读预览 */}
      {previewTarget && (
        <PreviewModal
          item={previewTarget}
          onRestore={(item) => {
            setPreviewTarget(null);
            void handleRestore(item);
          }}
          onFork={(item) => {
            setPreviewTarget(null);
            setForkTarget(item);
          }}
          onClose={() => setPreviewTarget(null)}
        />
      )}
    </div>
  );
}
