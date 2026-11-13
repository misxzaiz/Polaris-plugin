/**
 * HistoryList.tsx —— 分页列表 + 行操作（星/置顶/归档/Fork/继续/删除）
 */
import { Fragment } from 'react';
import { Icon } from './icons';
import { t } from './i18n';
import {
  DATE_GROUP_ORDER,
  formatFileSize,
  groupByDate,
  parseSnippet,
  relativeTimeParts,
  type DateGroup,
  type PureHistoryItem,
} from './pure';

interface HistoryListProps {
  items: PureHistoryItem[];
  searching: boolean;
  restoringId: string | null;
  showWorkspaceColumn: boolean;
  onToggleStar: (item: PureHistoryItem) => void;
  onTogglePin: (item: PureHistoryItem) => void;
  onToggleArchive: (item: PureHistoryItem) => void;
  onPreview: (item: PureHistoryItem) => void;
  onRestore: (item: PureHistoryItem) => void;
  onFork: (item: PureHistoryItem) => void;
  onDelete: (item: PureHistoryItem) => void;
}

const GROUP_LABEL_KEY: Record<DateGroup, string> = {
  today: 'history.today',
  yesterday: 'history.yesterday',
  thisWeek: 'history.thisWeek',
  earlier: 'history.earlier',
};

function SnippetText({ text }: { text: string }) {
  const parts = parseSnippet(text);
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <span key={i} className="hd-hitmark">{p.s}</span>
        ) : (
          <Fragment key={i}>{p.s}</Fragment>
        ),
      )}
    </>
  );
}

function RowMeta({ item, searching }: { item: PureHistoryItem; searching: boolean }) {
  const rt = relativeTimeParts(item.timestamp);
  return (
    <div className="hd-row-meta">
      <span className="hd-meta-item">
        <Icon name="message" size={11} />
        {t('history.messages', undefined, { count: item.messageCount })}
      </span>
      <span className="hd-meta-item">
        <Icon name="clock" size={11} />
        {rt.key ? t(rt.key, undefined, { count: rt.count }) : rt.clock}
      </span>
      {item.fileSize ? <span>{formatFileSize(item.fileSize)}</span> : null}
    </div>
  );
}

export function HistoryList(props: HistoryListProps) {
  const {
    items, searching, restoringId, showWorkspaceColumn,
    onToggleStar, onTogglePin, onToggleArchive,
    onPreview, onRestore, onFork, onDelete,
  } = props;
  const grouped = groupByDate(items);

  return (
    <>
      {DATE_GROUP_ORDER.map((group) => {
        const groupItems = grouped[group];
        if (groupItems.length === 0) return null;
        return (
          <div key={group} style={{ marginBottom: 6 }}>
            <div className="hd-group-head">
              {t(GROUP_LABEL_KEY[group])}
              <span className="hd-group-count">({groupItems.length})</span>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {groupItems.map((item) => {
                const isRestoring = restoringId === item.id;
                const canDelete = item.source === 'self';
                const snippet = searching && item.snippet ? item.snippet : item.preview || item.snippet;
                return (
                  <li key={item.id} className="hd-row">
                    <button
                      type="button"
                      className={`hd-star ${item.starred ? 'hd-star-on' : ''}`}
                      onClick={() => onToggleStar(item)}
                      title={item.starred ? t('history.unstar') : t('history.star')}
                    >
                      <Icon name="star" size={15} filled={!!item.starred} />
                    </button>

                    <div className="hd-row-main" onClick={() => onPreview(item)} title={t('preview.openHint')}>
                      <div className="hd-row-titleline">
                        {item.pinned && <Icon name="pin" size={12} filled />}
                        <h3 className="hd-row-title">{item.title}</h3>
                        <span className="hd-badge hd-badge-engine">{item.engineId}</span>
                        {item.source !== 'self' && (
                          <span className="hd-badge hd-badge-native" title={t('history.nativeSourceHint')}>
                            {t('history.nativeSource')}
                          </span>
                        )}
                      </div>
                      {snippet && (
                        <p className="hd-row-snippet">
                          {searching && item.snippet ? <SnippetText text={item.snippet} /> : snippet}
                        </p>
                      )}
                      <RowMeta item={item} searching={searching} />
                      {showWorkspaceColumn && item.projectPath && (
                        <div className="hd-row-meta" style={{ marginTop: 2 }}>
                          <span className="hd-meta-item" title={item.projectPath}>
                            <Icon name="folder" size={11} />
                            <span className="hd-meta-ws">
                              {item.projectPath.replace(/\\/g, '/').split('/').filter(Boolean).pop()}
                            </span>
                          </span>
                        </div>
                      )}
                      {(item.parentSessionId || (item.childSessionIds?.length ?? 0) > 0 || item.gitBranch || item.linkedPr) && (
                        <div className="hd-row-meta" style={{ marginTop: 3 }}>
                          {item.linkedPr && (
                            <span className="hd-badge hd-badge-pr">PR #{item.linkedPr.number}</span>
                          )}
                          {item.gitBranch && (
                            <span className="hd-badge hd-badge-fork">
                              <Icon name="git-branch" size={9} /> {item.gitBranch}
                            </span>
                          )}
                          {item.parentSessionId && (
                            <span className="hd-badge hd-badge-fork">
                              <Icon name="git-branch" size={9} /> {t('history.forkedFrom')}
                            </span>
                          )}
                          {(item.childSessionIds?.length ?? 0) > 0 && (
                            <span className="hd-badge hd-badge-fork">
                              <Icon name="git-branch" size={9} /> {t('history.childSessions', undefined, { count: item.childSessionIds!.length })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="hd-row-actions">
                      <button
                        type="button"
                        className={`hd-iconbtn ${item.pinned ? 'hd-pin-on' : ''}`}
                        onClick={() => onTogglePin(item)}
                        title={item.pinned ? t('history.unpin') : t('history.pin')}
                      >
                        <Icon name="pin" size={15} filled={!!item.pinned} />
                      </button>
                      <button
                        type="button"
                        className="hd-iconbtn"
                        onClick={() => onFork(item)}
                        title={t('history.createBranch')}
                      >
                        <Icon name="git-branch" size={15} />
                      </button>
                      <button
                        type="button"
                        className="hd-iconbtn"
                        onClick={() => onToggleArchive(item)}
                        title={item.archived ? t('history.unarchive') : t('history.archive')}
                      >
                        <Icon name={item.archived ? 'unarchive' : 'archive'} size={15} />
                      </button>
                      <button
                        type="button"
                        className="hd-iconbtn"
                        onClick={() => onRestore(item)}
                        disabled={isRestoring}
                        title={t('history.restoreSession')}
                      >
                        <Icon name={isRestoring ? 'loader' : 'restore'} size={15} />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          className="hd-iconbtn"
                          style={{ color: 'rgb(var(--c-status-danger))' }}
                          onClick={() => onDelete(item)}
                          title={t('history.deleteSession')}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}
