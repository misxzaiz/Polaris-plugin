/**
 * polaris-git 宿主桥 —— 唯一允许接触 window 全局的层（spec §7.2 D7）。
 *
 * 数据通道（唯一，禁止第二通道）：
 *   __POLARIS_HOST_INVOKE__('router_dispatch', { req: { target: 'cap.git', payload } })
 * 面板运行在主窗口（label=main）→ Source::Bootstrap，cap.git 查询/写动作均放行；
 * 权限 gate / 审计流水 / WRITE_GATE 写串行 / Web 桥由宿主总线统一承担。
 *
 * 事件：__POLARIS_HOST_LISTEN__（非 chat-event 全透传）→ git-operation / git-undo-snapshot。
 * 工作区：__POLARIS_WORKSPACE_API__（冷启动有值：subscribe 挂载即回调一次）。
 */

export const PLUGIN_ID = 'polaris-git';

type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
/** 宿主 listen 契约：异步注册、返回 Promise<unlisten>（terminal-desk 2026-11-11 踩坑：
 *  误声明同步会把 Promise 塞进 useEffect cleanup 槽，StrictMode 下挂载即崩） */
type HostListen = (event: string, handler: (payload: unknown) => void) => Promise<() => void>;

interface WorkspaceSnapshot {
  id: string;
  name: string;
  path: string;
}

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke;
  __POLARIS_HOST_LISTEN__?: HostListen;
  __POLARIS_HOST_WORKSPACE__?: string;
  __POLARIS_WORKSPACE_API__?: {
    list: () => WorkspaceSnapshot[];
    currentId: () => string | null;
    subscribe: (listener: () => void) => () => void;
  };
}

function globals(): HostGlobals {
  return (typeof window !== 'undefined' ? window : {}) as unknown as HostGlobals;
}

/** 宿主桥是否可用（SSR / 旧宿主环境探测；不在模块加载期调用） */
export function hasHostBridge(): boolean {
  return typeof globals().__POLARIS_HOST_INVOKE__ === 'function';
}

function getHostInvoke(): HostInvoke {
  const fn = globals().__POLARIS_HOST_INVOKE__;
  if (!fn) {
    throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请升级 Polaris 主应用）');
  }
  return fn;
}

// ---------------------------------------------------------------------------
// cap.git（唯一 Git 数据入口）
// ---------------------------------------------------------------------------

interface RouterEnvelope<T> {
  msgId?: string;
  ok: boolean;
  result?: T | null;
  error?: unknown;
}

/** 把总线 error 字段转成人类可读消息（string 或 {message} 对象都兜住） */
function envelopeErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err === 'object') {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return fallback;
}

/** cap.git 调用：action + 参数（camelCase，与 git_capability.rs action_docs 对齐） */
export async function capGit<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const invoke = getHostInvoke();
  const res = await invoke<RouterEnvelope<T>>('router_dispatch', {
    req: { target: 'cap.git', payload: { action, ...params } },
  });
  if (!res.ok) {
    throw new Error(envelopeErrorMessage(res.error, `cap.git ${action} 调用失败`));
  }
  return res.result as T;
}

// ---------------------------------------------------------------------------
// 事件订阅（统一封装：未决期退订安全，cleanup 恒为同步函数 —— spec §6.6）
// ---------------------------------------------------------------------------

function subscribeHostEvent(event: string, handler: (payload: unknown) => void): () => void {
  const listen = globals().__POLARIS_HOST_LISTEN__;
  if (!listen) return () => {};
  let unlisten: (() => void) | null = null;
  let cancelled = false;
  void listen(event, handler)
    .then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    })
    .catch(() => {
      /* 订阅失败不阻塞面板 */
    });
  return () => {
    cancelled = true;
    try {
      unlisten?.();
    } catch {
      /* 重复退订安全忽略 */
    }
    unlisten = null;
  };
}

export function listenGitOperation(handler: (payload: unknown) => void): () => void {
  return subscribeHostEvent('git-operation', handler);
}

export function listenFileSystemChange(handler: (payload: unknown) => void): () => void {
  return subscribeHostEvent('file-system-change', handler);
}

// ---------------------------------------------------------------------------
// 工作区（冷启动自动绑定；禁手填路径作为主流程）
// ---------------------------------------------------------------------------

export function currentWorkspacePath(): string | null {
  const api = globals().__POLARIS_WORKSPACE_API__;
  if (api) {
    const id = api.currentId();
    if (id) {
      const ws = api.list().find((w) => w.id === id);
      if (ws?.path) return ws.path;
    }
  }
  // 旧宿主兜底：保活字符串全局（冷启动可能为空，仅作降级）
  const direct = globals().__POLARIS_HOST_WORKSPACE__;
  return typeof direct === 'string' && direct ? direct : null;
}

/** 订阅工作区变化；注册时立即以当前值回调一次（冷启动快照） */
export function onWorkspaceChanged(handler: (path: string | null) => void): () => void {
  let last = currentWorkspacePath();
  handler(last);
  const api = globals().__POLARIS_WORKSPACE_API__;
  if (!api) return () => {};
  return api.subscribe(() => {
    const next = currentWorkspacePath();
    if (next !== last) {
      last = next;
      handler(next);
    }
  });
}
