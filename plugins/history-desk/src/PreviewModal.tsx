/**
 * PreviewModal.tsx —— 只读会话预览（PRD §5.3：围绕完整消息流，向上补读）
 *
 * 数据：cap.history archive_page（宿主侧解析+去重）→ 精简渲染器；
 * JSONL 归档不存在时回退 message_read（后端消息库兜底）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchArchivePage, fetchBackendMessages, type ArchiveMessage, type UnifiedHistoryItem } from './host';
import { MessageView } from './messageRender';
import { Icon } from './icons';
import { t } from './i18n';
import { formatFileSize } from './pure';

const PAGE_SIZE = 100;

interface PreviewModalProps {
  item: UnifiedHistoryItem;
  onRestore: (item: UnifiedHistoryItem) => void;
  onFork: (item: UnifiedHistoryItem) => void;
  onClose: () => void;
}

export function PreviewModal({ item, onRestore, onFork, onClose }: PreviewModalProps) {
  const [messages, setMessages] = useState<ArchiveMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [earliestSeq, setEarliestSeq] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setMessages([]);
    setEarliestSeq(null);
    setHasMore(false);
    (async () => {
      try {
        const page = await fetchArchivePage(item.id, null, PAGE_SIZE);
        if (cancelled) return;
        setMessages(page.messages ?? []);
        setEarliestSeq(page.earliestSeq);
        setHasMore(page.hasMore);
      } catch {
        // JSONL 归档不存在（中断会话）→ 后端消息库兜底
        try {
          const backend = await fetchBackendMessages(item.id);
          if (cancelled) return;
          setMessages(backend);
          if (backend.length === 0) setError(true);
        } catch {
          if (!cancelled) setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  const loadEarlier = async () => {
    if (!hasMore || loadingEarlier || earliestSeq == null) return;
    setLoadingEarlier(true);
    try {
      const page = await fetchArchivePage(item.id, earliestSeq, PAGE_SIZE);
      const existing = new Set(messages.map((m) => String(m.id)));
      const fresh = (page.messages ?? []).filter((m) => !existing.has(String(m.id)));
      setMessages((prev) => [...fresh, ...prev]);
      setEarliestSeq(page.earliestSeq ?? earliestSeq);
      setHasMore(page.hasMore);
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = Math.max(0, fresh.length * 90);
      });
    } catch {
      setHasMore(false);
    } finally {
      setLoadingEarlier(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const engineName = useMemo(() => item.engineId, [item.engineId]);

  return (
    <div className="hd-modal-mask" onClick={onClose}>
      <div className="hd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="hd-modal-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 className="hd-modal-title" title={item.title}>{item.title}</h2>
            <div className="hd-modal-sub">
              <span className="hd-badge hd-badge-engine">{engineName}</span>
              <span className="hd-meta-item">
                <Icon name="message" size={11} />
                {t('history.messages', undefined, { count: item.messageCount })}
              </span>
              {item.fileSize ? <span>{formatFileSize(item.fileSize)}</span> : null}
              {item.projectPath && (
                <span className="hd-meta-item hd-meta-ws" title={item.projectPath}>
                  <Icon name="folder" size={11} />
                  <span className="hd-meta-ws">{item.projectPath.replace(/\\/g, '/').split('/').filter(Boolean).pop()}</span>
                </span>
              )}
            </div>
          </div>
          <button type="button" className="hd-iconbtn" onClick={onClose} title={t('preview.close')}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div
          className="hd-modal-body"
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
          }}
        >
          {loading ? (
            <div className="hd-empty">
              <Icon name="loader" size={26} />
              <p>{t('preview.loading')}</p>
            </div>
          ) : error || messages.length === 0 ? (
            <div className="hd-empty">
              <Icon name="warning" size={30} />
              <p>{t('preview.empty')}</p>
            </div>
          ) : (
            <>
              {hasMore && (
                <div className="hd-msg-more">
                  <button type="button" className="hd-msg-more-btn" onClick={loadEarlier} disabled={loadingEarlier}>
                    {loadingEarlier ? t('preview.loadingEarlier') : t('preview.loadEarlier')}
                  </button>
                </div>
              )}
              {messages.map((m, i) => (
                <MessageView key={String(m.id ?? i)} raw={m as Record<string, unknown>} index={i} />
              ))}
            </>
          )}
        </div>

        <div className="hd-modal-foot">
          <p className="hd-modal-foot-hint">{t('preview.readOnlyHint')}</p>
          <div className="hd-modal-foot-actions">
            <button type="button" className="hd-btn" onClick={() => onFork(item)}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Icon name="git-branch" size={13} />
                {t('preview.fork')}
              </span>
            </button>
            <button
              type="button"
              className="hd-btn hd-btn-primary"
              onClick={() => onRestore(item)}
              disabled={loading || error || messages.length === 0}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Icon name="restore" size={13} />
                {t('preview.continue')}
              </span>
            </button>
          </div>
        </div>

        {!atBottom && !loading && messages.length > 0 && (
          <button
            type="button"
            className="hd-iconbtn"
            style={{ position: 'absolute', right: 18, bottom: 64, background: 'rgb(var(--c-primary))', color: 'rgb(var(--c-on-primary))', borderRadius: '50%', width: 34, height: 34, boxShadow: '0 4px 14px rgb(var(--c-overlay) / 0.4)' }}
            onClick={() => {
              const el = scrollRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            }}
            title={t('preview.scrollToBottom')}
          >
            <Icon name="arrow-down" size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
