/**
 * PgDialog —— 确认框 / 输入框（视觉对齐宿主 ConfirmDialog：overlay 遮罩、
 * elevated 卡片、danger 影响清单、具体动词按钮；spec GP-10 四步式）。
 * 确认框：title/message + 可选影响清单 + 确认按钮文案必须具体（如「丢弃 3 个文件」）。
 * 输入框：单行 / 多行文本 + 提交回调；Enter 提交、Esc 取消。
 *
 * 【不用 react-dom portal】同 PgMenu（宿主 loader 只 shim react，react-dom
 * 入 bundle 即崩）；遮罩 absolute inset-0 覆盖面板根（.pg-root relative）。
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

function useDialogKeys(onCancel: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);
}

export interface PgConfirmState {
  title: string;
  message?: string;
  /** 影响清单（逐行展示；危险操作必须列不可恢复项） */
  lines?: string[];
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export function PgConfirm({ state, onClose }: { state: PgConfirmState; onClose: () => void }) {
  useDialogKeys(onClose);
  return (
    <div className="pg-modal-mask" onClick={onClose}>
      <div
        className="pg-modal"
        role="dialog"
        aria-modal="true"
        aria-label={state.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pg-modal-title">{state.title}</div>
        {state.message && <div className="pg-modal-msg">{state.message}</div>}
        {state.lines && state.lines.length > 0 && (
          <div className="pg-modal-list" role="list">
            {state.lines.map((l, i) => (
              <div key={i} className="pg-modal-list-item" role="listitem">
                {l}
              </div>
            ))}
          </div>
        )}
        <div className="pg-modal-actions">
          <button type="button" className="pg-secondary-btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={state.danger ? 'pg-danger-btn' : 'pg-primary-btn'}
            onClick={() => {
              onClose();
              state.onConfirm();
            }}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface PgPromptState {
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  multiline?: boolean;
  confirmLabel: string;
  /** 返回 null/false 表示校验失败（不关闭） */
  onSubmit: (value: string) => void | null | false | Promise<void | null | false>;
}

export function PgPrompt({ state, onClose }: { state: PgPromptState; onClose: () => void }) {
  const [value, setValue] = useState(state.initialValue ?? '');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useDialogKeys(onClose);
  useEffect(() => {
    ref.current?.focus();
    if (ref.current && 'setSelectionRange' in ref.current) {
      const input = ref.current as HTMLInputElement;
      const dot = state.initialValue?.lastIndexOf('.') ?? -1;
      if (state.initialValue && dot > 0) input.setSelectionRange(0, dot);
      else input.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (): void => {
    if (busy) return;
    void (async () => {
      setBusy(true);
      const res = await state.onSubmit(value);
      setBusy(false);
      if (res === null || res === false) return;
      onClose();
    })();
  };

  return (
    <div className="pg-modal-mask" onClick={onClose}>
      <div
        className="pg-modal"
        role="dialog"
        aria-modal="true"
        aria-label={state.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pg-modal-title">{state.title}</div>
        {state.message && <div className="pg-modal-msg">{state.message}</div>}
        {state.multiline ? (
          <textarea
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            className="pg-modal-textarea"
            value={value}
            placeholder={state.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit();
            }}
          />
        ) : (
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            className="pg-modal-input"
            value={value}
            placeholder={state.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        )}
        <div className="pg-modal-actions">
          <button type="button" className="pg-secondary-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="pg-primary-btn" disabled={busy} onClick={submit}>
            {busy ? '执行中…' : state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 面板级对话框管理：调用方持有 confirm/prompt state 并渲染本插槽 */
export interface PgDialogSlotProps {
  confirm: PgConfirmState | null;
  prompt: PgPromptState | null;
  setConfirm: (s: PgConfirmState | null) => void;
  setPrompt: (s: PgPromptState | null) => void;
}

export function PgDialogSlot({ confirm, prompt, setConfirm, setPrompt }: PgDialogSlotProps): ReactNode {
  return (
    <>
      {confirm && <PgConfirm state={confirm} onClose={() => setConfirm(null)} />}
      {prompt && <PgPrompt state={prompt} onClose={() => setPrompt(null)} />}
    </>
  );
}
