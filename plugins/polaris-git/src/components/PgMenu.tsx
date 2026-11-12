/**
 * PgMenu —— 右键/操作菜单（视觉对齐宿主 DropdownMenu：elevated 底、细边框、
 * 柔和阴影、danger 项红字；spec GP-02 要求悬停动作均可经右键到达）。
 *
 * 【不用 react-dom portal】宿主面板 loader 只 shim react（react/react-jsx-runtime
 * external），react-dom 进 bundle 会以其内部 CJS require 崩溃（"Dynamic require
 * ... is not supported"，2026-11-12 实测）。菜单以绝对定位渲染在面板根内，
 * 坐标由调用方传入的视口坐标换算为容器相对坐标并钳位——同时天然规避宿主
 * 「transform 困 fixed 后代」陷阱（polaris-floating-panel-z-traps）。
 * Esc / 点击遮罩关闭。
 */
import { useEffect, useLayoutEffect, useRef } from 'react';

export interface PgMenuItem {
  key: string;
  label: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export function PgMenu({
  anchorClientX,
  anchorClientY,
  container,
  items,
  header,
  onClose,
}: {
  /** 右键事件的 clientX/clientY（视口坐标），内部换算为面板容器相对坐标 */
  anchorClientX: number;
  anchorClientY: number;
  /** 面板根元素（.pg-root）；菜单以它为定位与钳位边界 */
  container: HTMLElement | null;
  items: PgMenuItem[];
  header?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !container) return;
    const rect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    let left = anchorClientX - cRect.left;
    let top = anchorClientY - cRect.top;
    if (left + rect.width > cRect.width - 4) left = Math.max(4, cRect.width - rect.width - 4);
    if (top + rect.height > cRect.height - 4) top = Math.max(4, cRect.height - rect.height - 4);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }, [anchorClientX, anchorClientY, container]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <>
      <div
        className="pg-menu-mask"
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        onClick={onClose}
      />
      <div ref={ref} className="pg-menu" role="menu" aria-label={header ?? '操作菜单'}>
        {header && (
          <div className="pg-menu-label" title={header}>
            {header}
          </div>
        )}
        {items.map((item) => (
          <div key={item.key}>
            {item.separatorBefore && <div className="pg-menu-sep" role="separator" />}
            <button
              type="button"
              role="menuitem"
              className={`pg-menu-item${item.danger ? ' pg-menu-item-danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onSelect?.();
              }}
            >
              {item.label}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
