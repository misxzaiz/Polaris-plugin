/**
 * SessionTree.tsx —— Fork 树视图（移植自内置 SessionTree；h 纯逻辑复用 pure.buildTree）
 */
import { useMemo, useState, useCallback } from 'react';
import { Icon } from './icons';
import { t } from './i18n';
import { buildTree, flattenTree, relativeTimeParts, type PureHistoryItem, type TreeNode } from './pure';

interface SessionTreeProps {
  sessions: PureHistoryItem[];
  restoringId?: string | null;
  onRestore: (item: PureHistoryItem) => void;
  onSelect?: (item: PureHistoryItem) => void;
}

function TreeRow({
  node,
  expanded,
  restoring,
  onToggle,
  onSelect,
  onRestore,
}: {
  node: TreeNode;
  expanded: boolean;
  restoring: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onRestore: () => void;
}) {
  const { session, children } = node;
  const hasChildren = children.length > 0;
  const rt = relativeTimeParts(session.timestamp);

  return (
    <div className="hd-tree-node">
      <div className="hd-tree-row" style={{ paddingLeft: `${node.level * 16 + 12}px` }} onClick={onSelect}>
        <div style={{ width: 16, height: 16, flex: 'none', display: 'grid', placeItems: 'center', marginTop: 2 }}>
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="hd-iconbtn"
              style={{ width: 18, height: 18 }}
            >
              <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} />
            </button>
          ) : (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: session.linkedPr ? 'var(--c-status-info)' : hasChildren ? 'var(--c-status-warning)' : 'var(--c-primary)' }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="hd-row-titleline">
            <h3 className="hd-row-title" style={{ flex: '0 1 auto' }}>{session.title}</h3>
            {session.linkedPr && <span className="hd-badge hd-badge-pr">PR #{session.linkedPr.number}</span>}
            {session.gitBranch && (
              <span className="hd-badge hd-badge-fork">
                <Icon name="git-branch" size={9} /> {session.gitBranch}
              </span>
            )}
          </div>
          <div className="hd-row-meta" style={{ marginBottom: session.parentSessionId || (session.childSessionIds?.length ?? 0) > 0 ? 4 : 0 }}>
            <span className="hd-meta-item">
              <Icon name="message" size={11} />
              {t('history.messages', undefined, { count: session.messageCount })}
            </span>
            <span className="hd-meta-item">
              <Icon name="clock" size={11} />
              {rt.key ? t(rt.key, undefined, { count: rt.count }) : rt.clock}
            </span>
          </div>
          {(session.parentSessionId || (session.childSessionIds?.length ?? 0) > 0) && (
            <div className="hd-row-meta">
              {session.parentSessionId && (
                <span className="hd-badge hd-badge-fork">
                  <Icon name="git-branch" size={9} /> {t('history.forkedFrom')}
                </span>
              )}
              {(session.childSessionIds?.length ?? 0) > 0 && (
                <span className="hd-badge hd-badge-fork">
                  <Icon name="git-branch" size={9} /> {t('history.childSessions', undefined, { count: session.childSessionIds!.length })}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="hd-row-actions" style={{ marginTop: 2 }}>
          <button type="button" className="hd-iconbtn" onClick={(e) => { e.stopPropagation(); onRestore(); }} disabled={restoring} title={t('history.restoreSession')}>
            <Icon name={restoring ? 'loader' : 'restore'} size={15} />
          </button>
        </div>
      </div>
      {hasChildren && expanded && (
        <div className="hd-tree-kids">
          <div className="hd-tree-line" style={{ left: `${node.level * 16 + 20}px` }} />
          {children.map((child) => (
            <TreeRow
              key={child.session.id}
              node={child}
              expanded={false}
              restoring={false}
              onToggle={() => undefined}
              onSelect={() => undefined}
              onRestore={() => undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SessionTree({ sessions, restoringId, onRestore, onSelect }: SessionTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildTree(sessions), [sessions]);
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const flattened = useMemo(() => flattenTree(tree, expandedIds), [tree, expandedIds]);

  if (sessions.length === 0) {
    return (
      <div className="hd-empty">
        <Icon name="message" size={36} />
        <p>{t('history.noHistory')}</p>
      </div>
    );
  }

  return (
    <div>
      {flattened.map((node) => (
        <TreeRow
          key={node.session.id}
          node={node}
          expanded={expandedIds.has(node.session.id)}
          restoring={restoringId === node.session.id}
          onToggle={() => toggleExpand(node.session.id)}
          onSelect={() => onSelect?.(node.session)}
          onRestore={() => onRestore(node.session)}
        />
      ))}
    </div>
  );
}
