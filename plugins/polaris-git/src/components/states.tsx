/**
 * 标准页面状态（spec §5.3）：加载骨架 / 错误（可重试）/ 空态 / 无工作区 / 非仓库。
 * 错误不只用 toast —— 需要用户处理的错误留在内容区。
 */
import type { ReactNode } from 'react';

export function LoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="pg-skeleton" role="status" aria-label="加载中">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="pg-skeleton-row" style={{ width: `${92 - (i % 4) * 14}%` }} />
      ))}
    </div>
  );
}

export function ErrorNote({
  message,
  onRetry,
  retryLabel = '重试',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="pg-errorbar" role="alert">
      <span className="pg-errorbar-text">{message}</span>
      {onRetry && (
        <button type="button" className="pg-mini" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="pg-empty">
      <div className="pg-empty-title">{title}</div>
      {hint && <div className="pg-empty-hint">{hint}</div>}
      {action && <div className="pg-empty-action">{action}</div>}
    </div>
  );
}

export function NoWorkspaceBlock() {
  return (
    <EmptyBlock
      title="尚未选择工作区"
      hint="在宿主中打开一个工作区后，此处自动绑定并显示仓库状态。"
    />
  );
}

export function NoRepoBlock({ wsPath }: { wsPath: string | null }) {
  return (
    <EmptyBlock
      title="当前工作区不是 Git 仓库"
      hint={wsPath ? `${wsPath} 下未发现嵌套仓库（扫描深度 3）。` : undefined}
    />
  );
}
