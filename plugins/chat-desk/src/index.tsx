/**
 * chat-desk 面板入口（P3 重构）—— 真实 Chat UI（host/Chat 组件树）
 *
 * 与旧版交互/样式完全不变：组件源码同源（host/ 目录从主仓 src/components/Chat
 * 等拷贝），stores/services 经 __POLARIS_APP_CORE__ 共享宿主单例。
 * MultiSessionGrid 需要 onEditMessage —— 由插件内 sessionStoreManager（宿主
 * 同一实例）派生，与旧版 App.tsx 行为一致。
 */
import { useCallback, useMemo, useState } from 'react';
import { MultiSessionGrid } from './host/Chat/session/MultiSessionGrid';
import { ChatInput } from './host/Chat/input/ChatInput';
import { ChatStatusBar } from './host/Chat/common/ChatStatusBar';
import { ErrorBanner } from './host/Chat/common/ErrorBanner';
import { CompactHandoffButton } from './host/Chat/compact-handoff/CompactHandoffButton';
import { CompactHandoffProgress } from './host/Chat/compact-handoff/CompactHandoffProgress';
import { MultiWindowMenu } from './host/Chat/session/MultiWindowMenu';
import { NewSessionButton } from './host/Chat/session/NewSessionButton';
import { sessionStoreManager, useWorkspaceStore } from './shims/stores';
import { useActiveSessionActions, useActiveSessionStreaming, useActiveSessionError } from './host/conversationStore/useActiveSession';
import { useActiveSessionId, useSessionMetadataList } from './host/conversationStore/sessionStoreManager';

interface EntryProps {
  pluginId?: string;
  onSendToChat?: (m: string) => void;
  onClose?: () => void;
}

export default function ChatDeskEntry(_props: EntryProps) {
  // 宿主同一实例的 hooks（shims/stores → appCore）
  const activeSessionId = useActiveSessionId();
  void useSessionMetadataList();
  const { sendMessage, interrupt: interruptChat, editAndResend } = useActiveSessionActions();
  const isStreaming = useActiveSessionStreaming();
  const error = useActiveSessionError();

  // 编辑模式状态（对齐旧版 App.tsx）
  const [editMode, setEditMode] = useState<{ messageId: string; content: string } | null>(null);
  const handleEditMessage = useCallback((messageId: string, content: string) => {
    setEditMode({ messageId, content });
  }, []);
  const handleCancelEdit = useCallback(() => setEditMode(null), []);
  const handleEditSend = useCallback((messageId: string, newContent: string) => {
    editAndResend(messageId, newContent);
    setEditMode(null);
  }, [editAndResend]);

  const currentSession = activeSessionId
    ? sessionStoreManager.getState().sessionMetadata.get(activeSessionId)
    : undefined;
  // 对齐旧版 App.tsx：全局工作区 + 自由会话判定，共同决定输入区 disabled
  const sessionMetadataList = useSessionMetadataList();
  const activeSessionIsFree = useMemo(
    () => sessionMetadataList.some((s) => s.id === activeSessionId && s.type === 'free'),
    [sessionMetadataList, activeSessionId]
  );
  const currentWorkspace = useWorkspaceStore(
    (state: { workspaces: { id: string }[]; currentWorkspaceId: string | null }) =>
      state.workspaces.find((w) => w.id === state.currentWorkspaceId) || null
  );

  return (
    <>
      <MultiSessionGrid onEditMessage={handleEditMessage} />
      <ChatInput
        onSend={sendMessage}
        onInterrupt={interruptChat}
        disabled={!currentWorkspace && !activeSessionIsFree}
        isStreaming={isStreaming}
        editMode={editMode}
        onCancelEdit={handleCancelEdit}
        onEditSend={handleEditSend}
        statusBarSlot={
          <ChatStatusBar embedded>
            <MultiWindowMenu />
            <NewSessionButton />
            <CompactHandoffButton />
          </ChatStatusBar>
        }
      />
      {error && <ErrorBanner error={error} />}
      <CompactHandoffProgress />
    </>
  );
}
