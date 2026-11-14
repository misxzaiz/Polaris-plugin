/**
 * chat-desk Panel.tsx —— P2 骨架面板
 *
 * 布局：[工具栏（标题+状态徽章）] [会话列表（可折叠）] [消息流] [输入行]
 * 最小闭环：新建会话 / 切换 / 删除 / 发送（流式渲染）/ 中断。
 * 样式走宿主 --c-* token（contributes.styles global 注入）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chatDeskStore, type ChatDeskStore, type SessionState } from './store';
import type { ChatMessage } from './types';
import { SessionConfigSelector } from './session-config/SessionConfigSelector';
import { useSessionConfig } from './session-config/sessionConfigStore';
// sessionConfigStore 内部 create 来自 zustand（v5 无 .js 后缀问题）
import { setSessionConfigHostDeps, fetchHostConfig } from './session-config/hostDeps';
import { aiChatDispatch } from './bridge';

/** 全局会话配置（persist localStorage 'polaris-session-config'；插件内独立实例） */
const sessionConfigStore = useSessionConfig;

interface PanelProps {
  pluginId?: string;
  onSendToChat?: (message: string) => void | Promise<void>;
  onClose?: () => void;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.type === 'user';
  return (
    <div className={`cd-msg ${isUser ? 'cd-msg-user' : ''}`}>
      <div className={`cd-role ${isUser ? 'cd-role-user' : 'cd-role-ai'}`}>
        {isUser ? '用户' : 'Polaris'}
        {message.timestamp ? ` · ${formatTime(message.timestamp)}` : ''}
      </div>
      {isUser ? (
        <div className="cd-bubble">{message.content}</div>
      ) : (
        <>
          {(message.blocks ?? []).map((b, i) => {
            if (b.type === 'thinking') {
              return (
                <div key={i} className="cd-think">
                  {b.content}
                </div>
              );
            }
            if (b.type === 'tool_call') {
              return (
                <div key={i} className="cd-tool">
                  <span className="cd-tool-name">🔧 {b.name}</span>
                  <span
                    className={
                      b.status === 'success'
                        ? 'cd-tool-status-ok'
                        : b.status === 'error'
                          ? 'cd-tool-status-err'
                          : ''
                    }
                  >
                    {b.status === 'running' ? '运行中…' : b.status === 'success' ? '完成' : '失败'}
                  </span>
                </div>
              );
            }
            return (
              <div key={i} className="cd-bubble">
                {b.content}
              </div>
            );
          })}
          {message.isStreaming && <span className="cd-caret" aria-hidden="true" />}
        </>
      )}
    </div>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: SessionState;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`cd-sessrow ${active ? 'cd-sessrow-on' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
    >
      <span className="cd-sess-title">
        {session.title}
        {session.isStreaming ? ' ⏳' : ''}
      </span>
      <span className="cd-sess-meta">{session.messages.length} 条</span>
      <button
        type="button"
        className="cd-btn"
        title="删除会话"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        ✕
      </button>
    </div>
  );
}

export default function ChatDeskPanel(_props: PanelProps) {
  const [state, setState] = useState(() => chatDeskStore.getState());
  const [input, setInput] = useState('');
  const [showSessions, setShowSessions] = useState(true);
  const [hostConfig, setHostConfig] = useState<{ defaultEngine?: string } | null>(null);
  const hostConfigRef = useRef<{ defaultEngine?: string } | null>(null);
  const msgsRef = useRef<HTMLDivElement>(null);

  // vanilla store 订阅（面板卸载时退订）
  useEffect(() => {
    const unsub = chatDeskStore.subscribe(() => setState({ ...chatDeskStore.getState() }));
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    chatDeskStore.getState().initialize();
    // 默认建一个会话（P2 骨架：无宿主会话迁移，P3 等价阶段收敛）
    if (chatDeskStore.getState().sessions.size === 0) {
      chatDeskStore.getState().createSession({ title: '新对话' });
    }
    // P3.b：会话配置选择器宿主依赖注入
    // - getConfig：宿主 config（cap.config get full；defaultEngine/activeModelProfileId）
    // - getActiveSessionMeta：P3 过渡期从本插件 store 取活跃会话（engineId 等）——
    //   chat-desk 自己的会话自己持有；宿主 conversationStore 会话在 P3.d 收敛前不混读
    // - writeBackSessionOverrides：写回本插件 store 的会话级覆盖（engineId/profile/agent）
    void fetchHostConfig().then((cfg) => {
      setHostConfig(cfg as { defaultEngine?: string } | null);
    });
    setSessionConfigHostDeps({
      getConfig: () => hostConfigRef.current,
      getActiveSessionMeta: () => {
        const st = chatDeskStore.getState();
        const sid = st.activeSessionId;
        if (!sid) return null;
        const s = st.sessions.get(sid);
        if (!s) return null;
        return { sessionId: sid, engineId: s.engineId };
      },
      writeBackSessionOverrides: (sessionId, patch) => {
        const st = chatDeskStore.getState();
        const s = st.sessions.get(sessionId);
        if (!s) return;
        const sessions = new Map(st.sessions);
        sessions.set(sessionId, { ...s, title: patch.agent !== undefined ? s.title : s.title });
        chatDeskStore.setState({ sessions });
      },
    });
    return () => {
      chatDeskStore.getState().dispose();
    };
  }, []);

  const active = state.activeSessionId
    ? state.sessions.get(state.activeSessionId) ?? null
    : null;

  const sessionsList = useMemo(() => Array.from(state.sessions.values()), [state.sessions]);

  // 贴底跟随（流式时）
  useEffect(() => {
    const el = msgsRef.current;
    if (!el || !active?.isStreaming) return;
    el.scrollTop = el.scrollHeight;
  }, [active?.messages.length, active?.currentMessage, active?.isStreaming]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !state.activeSessionId || active?.isStreaming) return;
    setInput('');
    await chatDeskStore.getState().sendMessage(state.activeSessionId, text);
  }, [input, state.activeSessionId, active?.isStreaming]);

  const handleInterrupt = useCallback(async () => {
    if (!state.activeSessionId) return;
    await chatDeskStore.getState().interrupt(state.activeSessionId);
  }, [state.activeSessionId]);

  const handleDelete = useCallback(
    (sessionId: string) => {
      chatDeskStore.getState().deleteSession(sessionId);
    },
    [],
  );

  const handleNewSession = useCallback(() => {
    chatDeskStore.getState().createSession({ title: '新对话' });
  }, []);

  const handleExport = useCallback(async () => {
    // P2：走宿主 confirm/导出通道尚未接；占位（P3 接 saveChatToFile 等价通道）
    void aiChatDispatch;
  }, []);

  return (
    <div className="cd-root">
      <div className="cd-toolbar">
        <button type="button" className="cd-btn" onClick={() => setShowSessions((v) => !v)}>
          ☰
        </button>
        <span className="cd-title">{active ? active.title : 'AI 对话'}</span>
        <span className={`cd-badge ${active?.isStreaming ? '' : 'cd-badge-off'}`}>
          {active?.isStreaming ? (active.isInterrupting ? '中断中…' : '运行中') : '空闲'}
        </span>
        <button type="button" className="cd-btn" onClick={handleNewSession}>
          + 新会话
        </button>
      </div>

      {showSessions && (
        <div className="cd-sessions">
          {sessionsList.map((s) => (
            <SessionRow
              key={s.sessionId}
              session={s}
              active={s.sessionId === state.activeSessionId}
              onSelect={() => chatDeskStore.getState().switchSession(s.sessionId)}
              onDelete={() => handleDelete(s.sessionId)}
            />
          ))}
        </div>
      )}

      <div className="cd-msgs" ref={msgsRef}>
        {!active || (active.messages.length === 0 && !active.currentMessage && !active.error) ? (
          <div className="cd-empty">
            <div>开始新的对话</div>
            <div>输入消息发送给 AI（P2 骨架：文本/思考/工具块渲染）</div>
          </div>
        ) : (
          <>
            {active.error && <div className="cd-err">{active.error}</div>}
            {active.messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {active.currentMessage && <MessageBubble message={active.currentMessage} />}
          </>
        )}
      </div>

      <div className="cd-inputrow">
        <textarea
          className="cd-input"
          rows={1}
          placeholder={active?.isStreaming ? '回复进行中…（ESC 中断）' : '输入消息（Enter 发送，Shift+Enter 换行）'}
          value={input}
          disabled={false}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void handleSend();
              return;
            }
            if (e.key === 'Escape' && active?.isStreaming) {
              e.preventDefault();
              void handleInterrupt();
            }
          }}
        />
        {active?.isStreaming ? (
          <button type="button" className="cd-btn cd-btn-danger" onClick={() => void handleInterrupt()} disabled={active.isInterrupting}>
            {active.isInterrupting ? '中断中…' : '■ 停止'}
          </button>
        ) : (
          <button type="button" className="cd-btn cd-btn-primary" onClick={() => void handleSend()} disabled={!input.trim()}>
            发送
          </button>
        )}
      </div>
    </div>
  );
}

/** 供测试/外部读取（不进渲染树） */
export function getStoreSnapshot(store: ChatDeskStore = chatDeskStore): { activeSessionId: string | null; sessions: SessionState[] } {
  return {
    activeSessionId: store.getState().activeSessionId,
    sessions: Array.from(store.getState().sessions.values()),
  };
}
