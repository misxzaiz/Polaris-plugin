/**
 * messageRender.tsx —— 精简消息渲染器（PRD §3.3 v1 边界）
 *
 * 插件无法 import 宿主 renderChatMessage 链；v1 只渲染
 * 文本 / thinking / 工具调用摘要（参照 time-sift SessionReader 先例）。
 * 完整块渲染保真（表单卡/插件卡/权限卡）列为 P3 迭代项。
 */
import { Icon } from './icons';
import { toRenderMessage, type RenderMessage } from './pure';

interface MessageViewProps {
  raw: Record<string, unknown>;
  index: number;
}

export function MessageView({ raw, index }: MessageViewProps) {
  const msg = toRenderMessage(raw, `msg-${index}`);
  if (!msg) return null;
  return <RenderMessageView msg={msg} />;
}

export function RenderMessageView({ msg }: { msg: RenderMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`hd-msg ${isUser ? 'hd-msg-user' : ''}`}>
      <div className={`hd-msg-role ${isUser ? 'hd-msg-role-user' : 'hd-msg-role-ai'}`}>
        {isUser ? 'USER' : 'AI'}
      </div>
      {msg.thinking && <div className="hd-msg-think">{msg.thinking}</div>}
      {msg.toolCalls.map((t) => (
        <div key={t.id} className="hd-msg-tool">
          <Icon name={t.status === 'running' ? 'loader' : 'check'} size={11} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.name || t.id}
          </span>
          {t.output && (
            <span style={{ color: 'var(--c-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={t.output}>
              {t.output.slice(0, 80)}
            </span>
          )}
        </div>
      ))}
      {msg.text ? (
        <div className="hd-msg-bubble">{msg.text}</div>
      ) : msg.streaming ? (
        <div className="hd-msg-tool">
          <Icon name="loader" size={11} />
          <span>…</span>
        </div>
      ) : null}
    </div>
  );
}
