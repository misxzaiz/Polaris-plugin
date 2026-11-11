// 搬迁改造（2026-11 Scheduler 域插件化迁移）：替代主仓 useToastStore 的极简内联 toast。
// 同名 API：toast.success / toast.error / toast.info / toast.warning(msg, detail?)；面板根部挂 <ToastHost />。
import { useEffect, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  detail?: string;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
const listeners = new Set<Listener>();
let seq = 0;
const timers = new Map<number, number>();

function emit() {
  for (const fn of listeners) fn(items);
}

function push(kind: ToastKind, text: string, detail?: string) {
  const id = ++seq;
  const item: ToastItem = { id, kind, text, detail };
  // 最多同时 4 条，旧的先走
  items = [...items.slice(-3), item];
  emit();
  const ttl = kind === 'error' ? 6000 : 3200;
  timers.set(
    id,
    window.setTimeout(() => dismiss(id), ttl),
  );
}

function dismiss(id: number) {
  if (timers.has(id)) {
    window.clearTimeout(timers.get(id));
    timers.delete(id);
  }
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (text: string, detail?: string) => push('success', text, detail),
  error: (text: string, detail?: string) => push('error', text, detail),
  info: (text: string, detail?: string) => push('info', text, detail),
  warning: (text: string, detail?: string) => push('warning', text, detail),
};

const KIND_CLASS: Record<ToastKind, string> = {
  success: 'sc-toast ok',
  error: 'sc-toast err',
  warning: 'sc-toast warn',
  info: 'sc-toast info',
};

/** 面板根部挂载的 toast 渲染层（绝对定位于面板容器） */
export function ToastHost() {
  const [list, setList] = useState<ToastItem[]>(items);

  useEffect(() => {
    const fn: Listener = (next) => setList(next);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  if (list.length === 0) return null;

  return (
    <div className="sc-toasts">
      {list.map((t) => (
        <div
          key={t.id}
          className={KIND_CLASS[t.kind]}
          onClick={() => dismiss(t.id)}
          role="status"
        >
          <b>{t.text}</b>
          {t.detail ? <small className="sc-toast-detail">{t.detail}</small> : null}
        </div>
      ))}
    </div>
  );
}
