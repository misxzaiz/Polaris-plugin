/**
 * 通用浮层：右键菜单 / 危险操作确认 / 旧配置导入。
 * 全部使用宿主主题变量，替代原生 window.confirm（样式不跟随主题、阻塞 webview）。
 * 菜单用 fixed 定位，避免被侧栏 overflow 裁剪；点击外部与 Esc 统一关闭。
 */
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './icons';

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: Array<MenuItem | { separator: true }>;
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  // 视口边界收敛，避免菜单溢出窗口
  const left = Math.max(4, Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 196));
  const top = Math.max(4, Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 8 - items.length * 30));

  return (
    <div ref={ref} className="td-menu" style={{ left, top }} role="menu">
      {items.map((item, i) =>
        'separator' in item ? (
          <div key={`sep-${i}`} className="td-menu-sep" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`td-menu-item${item.danger ? ' td-menu-danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.icon && <Icon name={item.icon} size={13} />}
            <span>{item.label}</span>
          </button>
        ),
      )}
    </div>
  );
}

export interface ConfirmDialogProps {
  title: string;
  message: string;
  detail?: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  detail,
  confirmText = '确认',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    <div className="td-modal-mask" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="td-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="td-dialog-title">
          {danger && <Icon name="alert" size={15} />}
          <span>{title}</span>
        </div>
        <div className="td-dialog-body">
          <div>{message}</div>
          {detail && <code className="td-dialog-detail">{detail}</code>}
        </div>
        <div className="td-dialog-actions">
          <button className="td-btn" onClick={onCancel}>
            取消
          </button>
          <button className={`td-btn${danger ? ' td-btn-danger' : ' td-btn-primary'}`} onClick={onConfirm} autoFocus>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ImportDialogProps {
  onImport: (text: string) => void;
  onCancel: () => void;
}

/** 旧内置终端脚本导入：粘贴主仓 config.json（或其中的 terminalScripts 片段） */
export function ImportDialog({ onImport, onCancel }: ImportDialogProps) {
  const [text, setText] = useState('');
  return (
    <div className="td-modal-mask" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="td-dialog td-dialog-wide" role="dialog" aria-modal="true" aria-label="导入旧终端脚本">
        <div className="td-dialog-title">
          <Icon name="download" size={15} />
          <span>导入内置终端脚本</span>
        </div>
        <div className="td-dialog-body">
          <div>
            粘贴主仓 <code>config.json</code> 全文，或其中的 <code>terminalScripts</code> 片段。
            仅导入自定义脚本（<code>source: "user"</code>），项目脚本由工作区自动发现；重复导入不会新增副本。
          </div>
          <textarea
            className="td-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='{ "terminalScripts": { "D:/repo": { "scripts": [ ... ] } } }'
            rows={8}
            autoFocus
          />
        </div>
        <div className="td-dialog-actions">
          <button className="td-btn" onClick={onCancel}>
            取消
          </button>
          <button className="td-btn td-btn-primary" disabled={!text.trim()} onClick={() => onImport(text)}>
            解析并导入
          </button>
        </div>
      </div>
    </div>
  );
}
