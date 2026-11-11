/**
 * 组件层 hooks：store 订阅与列表懒加载。
 *
 * 【宿主 shim 约束】宿主面板 React shim（pluginModuleLoader.ensureReactShim）
 * 只导出 useState/useEffect/useCallback/useMemo/useRef/memo/createElement/
 * Fragment/Component/forwardRef + jsx 运行时 —— 没有 useSyncExternalStore。
 * 故用 useState + 订阅等价实现（cleanup 恒为同步函数，StrictMode 双挂载安全，
 * SSR 由 useState 惰性初始化兜底）。
 */
import { useEffect, useState } from 'react';
import { repoStore } from './model/repoStore.ts';
import type { RepoStoreState, ListKey } from './model/repoStore.ts';

export function useRepoState(): RepoStoreState {
  const [state, setState] = useState<RepoStoreState>(() => repoStore.getSnapshot());
  useEffect(
    () =>
      repoStore.subscribe(() => {
        setState(repoStore.getSnapshot());
      }),
    [],
  );
  return state;
}

/** 进入 Tab 时确保列表已加载（懒加载 + 手动刷新走 force） */
export function useEnsureList(key: ListKey, enabled: boolean): void {
  useEffect(() => {
    if (enabled) void repoStore.loadList(key);
  }, [key, enabled]);
}
