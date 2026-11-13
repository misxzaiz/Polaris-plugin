/**
 * Dialogs.tsx —— Fork 对话框与删除确认框（移植内置 ForkSessionDialog / UX-4 ConfirmDialog）
 */
import { useState } from 'react';
import { Icon } from './icons';
import { t } from './i18n';
import { formatFileSize, needsDeleteConfirm, type PureHistoryItem } from './pure';

// ---------------------------------------------------------------------------
// Fork 对话框
// ---------------------------------------------------------------------------

interface ForkDialogProps {
  item: PureHistoryItem;
  onConfirm: (branchName?: string) => void;
  onCancel: () => void;
}

export function ForkDialog({ item, onConfirm, onCancel }: ForkDialogProps) {
  const [branchName, setBranchName] = useState('');
  const time = new Date(item.timestamp);
  const fmt = `${time.getMonth() + 1}月${time.getDate()}日 ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="hd-modal-mask" onClick={onCancel}>
      <div className="hd-modal hd-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="hd-modal-head">
          <div className="hd-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="git-branch" size={16} />
            {t('fork.title')}
          </div>
          <button type="button" className="hd-iconbtn" onClick={onCancel}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="hd-dialog-body">
          <div className="hd-dialog-info">
            <p style={{ fontSize: 11, color: 'var(--c-text-tertiary)', margin: '0 0 6px' }}>{t('fork.sourceSession')}</p>
            <p className="hd-dialog-info-title">{item.title}</p>
            <div className="hd-dialog-info-meta">
              <span className="hd-meta-item">
                <Icon name="message" size={11} />
                {t('fork.messages', undefined, { count: item.messageCount })}
              </span>
              <span className="hd-meta-item">
                <Icon name="clock" size={11} />
                {fmt}
              </span>
              {item.fileSize ? <span>{formatFileSize(item.fileSize)}</span> : null}
            </div>
            {item.gitBranch && (
              <p style={{ marginTop: 5, fontSize: 11, color: 'var(--c-text-tertiary)' }}>
                {t('fork.gitBranch', undefined, { branch: item.gitBranch })}
              </p>
            )}
            {item.linkedPr && (
              <p style={{ marginTop: 3, fontSize: 11, color: 'var(--c-status-info)' }}>
                {t('fork.linkedPr', undefined, { number: item.linkedPr.number })}
              </p>
            )}
          </div>
          <div>
            <p>{t('fork.inheritContext')}</p>
            <ul className="hd-dialog-losses" style={{ listStyle: 'disc' }}>
              <li>{t('fork.historyMessages', undefined, { count: item.messageCount })}</li>
              {item.gitBranch && <li>{t('fork.gitBranch', undefined, { branch: item.gitBranch })}</li>}
              {item.linkedPr && <li>{t('fork.prLink', undefined, { number: item.linkedPr.number })}</li>}
            </ul>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="hd-dialog-label">{t('fork.branchName')}</label>
            <input
              type="text"
              className="hd-dialog-input"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder={t('fork.branchNamePlaceholder')}
            />
          </div>
        </div>
        <div className="hd-modal-foot" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="hd-btn" onClick={onCancel}>
            {t('fork.cancel')}
          </button>
          <button type="button" className="hd-btn hd-btn-fork" onClick={() => onConfirm(branchName || undefined)}>
            {t('fork.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 删除确认框（UX-4：硬删不可逆，先确认；≤2 条消息的近空会话由调用方跳过）
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  item: PureHistoryItem;
  running: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteDialog({ item, running, onConfirm, onCancel }: DeleteDialogProps) {
  return (
    <div className="hd-modal-mask" onClick={onCancel}>
      <div className="hd-modal hd-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="hd-modal-head">
          <div className="hd-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'rgb(var(--c-status-danger))' }}>
            <Icon name="warning" size={16} />
            {t('delete.confirmTitle')}
          </div>
          <button type="button" className="hd-iconbtn" onClick={onCancel}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="hd-dialog-body">
          <p>{t('delete.confirmMessage', undefined, { title: item.title, count: item.messageCount })}</p>
          {running && (
            <p style={{ marginTop: 8, color: 'rgb(var(--c-status-warning))', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="radio" size={12} />
              {t('delete.runningHint')}
            </p>
          )}
          <ul className="hd-dialog-losses" style={{ listStyle: 'disc' }}>
            <li>{t('delete.lossMessages', undefined, { title: item.title })}</li>
            <li>{t('delete.lossStorage')}</li>
          </ul>
        </div>
        <div className="hd-modal-foot" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="hd-btn" onClick={onCancel}>
            {t('history.deleteCancelAction')}
          </button>
          <button type="button" className="hd-btn hd-btn-danger" onClick={onConfirm}>
            {t('history.deleteConfirmAction')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 便捷导出：删除确认门槛判定（pure.needsDeleteConfirm 语义对齐内置） */
export { needsDeleteConfirm };
