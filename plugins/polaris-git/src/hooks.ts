/**
 * 组件层 hooks：store 订阅（useSyncExternalStore，SSR 安全）与列表懒加载。
 */
import { useEffect, useSyncExternalStore } from 'react';
import { repoStore } from './model/repoStore.ts';
import type { RepoStoreState, ListKey } from './model/repoStore.ts';

export function useRepoState(): RepoStoreState {
  return useSyncExternalStore(repoStore.subscribe, repoStore.getSnapshot, repoStore.getSnapshot);
}

/** 进入 Tab 时确保列表已加载（懒加载 + 手动刷新走 force） */
export function useEnsureList(key: ListKey, enabled: boolean): void {
  useEffect(() => {
    if (enabled) void repoStore.loadList(key);
  }, [key, enabled]);
}
