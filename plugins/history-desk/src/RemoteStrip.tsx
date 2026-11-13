/**
 * RemoteStrip.tsx —— 「其他设备进行中」轻量发现（PRD §4.4）
 *
 * 冷启动：cap.history list_running（registry ∪ session_state running 投影）；
 * 增量：__POLARIS_HOST_LISTEN__('chat-event') 透传的 session_start/session_end。
 * 与宿主 remoteSessionFollower 并存一个版本周期（已知债务，PRD §7 登记）。
 */
import { useEffect, useMemo, useState } from 'react';
import { getHostListen, listRunningSessions, type RunningSession } from './host';
import { Icon } from './icons';
import { t } from './i18n';

interface RemoteStripProps {
  /** 点击卡片（查看）回调；v1 只读跟随入口在宿主 QuickSwitch，这里默认滚到顶部即可 */
  onView?: (conversationId: string) => void;
}

function relativeStartedAt(startedAt?: string): string {
  if (!startedAt) return '';
  const ts = Date.parse(startedAt);
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return t('history.justNow');
  if (diff < 3_600_000) return t('history.minutesAgo', undefined, { count: Math.floor(diff / 60_000) });
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 12)}…` : id;
}

export function RemoteStrip({ onView }: RemoteStripProps) {
  const [running, setRunning] = useState<RunningSession[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listRunningSessions()
      .then((list) => {
        if (!cancelled) setRunning(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    getHostListen()('chat-event', (envelope) => {
      const env = envelope as { payload?: { payload?: { type?: string; sessionId?: string } } };
      const inner = env?.payload?.payload;
      if (!inner || (inner.type !== 'session_start' && inner.type !== 'session_end')) return;
      const sessionId = inner.sessionId;
      if (!sessionId) return;
      setRunning((prev) => {
        const next = prev.filter((s) => s.conversationId !== sessionId);
        if (inner.type === 'session_start') {
          next.unshift({ conversationId: sessionId, running: true });
        }
        return next;
      });
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  const list = useMemo(() => running.filter((s) => !!s.conversationId), [running]);
  if (list.length === 0) return null;

  return (
    <div className="hd-remote">
      <div className="hd-remote-label">
        <Icon name="radio" size={12} />
        {t('history.remoteTitle')}（{list.length}）
      </div>
      <div className="hd-remote-cards">
        {list.map((s) => (
          <button
            key={s.conversationId}
            type="button"
            className="hd-remote-card"
            title={s.conversationId}
            onClick={() => onView?.(s.conversationId)}
          >
            <div className="hd-remote-card-title">
              <span className="hd-remote-dot" />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {shortId(s.conversationId)}
              </span>
            </div>
            <p className="hd-remote-card-sub">
              {s.startedByDevice ? `${s.startedByDevice} · ` : ''}
              {t('history.remoteHint', undefined, { time: relativeStartedAt(s.startedAt) || t('history.justNow') })}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
