/**
 * prefs.ts —— 插件偏好单例（对齐 terminal-desk config.ts 共享快照范式）
 *
 * 承载：listPageSize / restorePageSize / recentCards（宿主 historyPrefsStore
 * 的插件侧对等物；经 plugin_get_config / plugin_set_config 持久化跨端同步）。
 */
import { useCallback, useEffect, useState } from 'react';
import { readPrefs, writePrefs, parsePrefs, type HistoryPrefs } from './host';

type Listener = () => void;

class PrefsStore {
  private state: HistoryPrefs = parsePrefs({});
  private loaded = false;
  private loading: Promise<void> | null = null;
  private listeners = new Set<Listener>();

  snapshot(): HistoryPrefs {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 幂等加载：多组件并发挂载只发一次 IPC */
  load(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (this.loading) return this.loading;
    this.loading = readPrefs()
      .then((prefs) => {
        this.state = prefs;
        this.loaded = true;
        this.emit();
      })
      .catch(() => {
        this.loaded = true;
      });
    return this.loading;
  }

  async commit(patch: Partial<HistoryPrefs>): Promise<void> {
    const next = await writePrefs(patch);
    this.state = next;
    this.emit();
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

export const prefsStore = new PrefsStore();

/** React 订阅钩子（宿主 React shim 下 useSyncExternalStore 可用） */
export function useHistoryPrefs(): HistoryPrefs {
  const [, force] = useState(0);
  useEffect(() => {
    void prefsStore.load();
    return prefsStore.subscribe(() => force((v) => v + 1));
  }, []);
  return prefsStore.snapshot();
}

export function usePrefsCommit(): (patch: Partial<HistoryPrefs>) => Promise<void> {
  return useCallback((patch) => prefsStore.commit(patch), []);
}
