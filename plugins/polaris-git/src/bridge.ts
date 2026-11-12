/**
 * polaris-git 宿主桥 —— 唯一允许接触 window 全局的层（spec §7.2 D7）。
 *
 * 数据通道（唯一，禁止第二通道）：
 *   __POLARIS_HOST_INVOKE__('router_dispatch',
 *     { req: { target: 'cap.pluginServiceManager',
 *             payload: { action: 'request', serviceId: 'polaris-git-service',
 *                        path: '/dispatch', body: { action, params } } } })
 * 面板运行在主窗口（label=main）→ Source::Bootstrap，宿主通用转发放行；
 * 引擎在插件自带 service（本机 git CLI），宿主不再保留 Git 后端与 cap.git。
 * 权限 gate 由宿主 policy 层统一裁决，写串行 / undo 快照 / 操作流水在 service 内。
 *
 * 事件：__POLARIS_HOST_LISTEN__（非 chat-event 全透传）→ file-system-change。
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
// Git 引擎（唯一数据入口 → 插件自带 service）
// ---------------------------------------------------------------------------

/** contributes.services[].id —— 宿主按此 id 查运行中实例端口并转发 */
const SERVICE_ID = 'polaris-git-service';
/** 冷启动时 supervisor 拉起服务有延迟：对「未就绪」类错误短重试 */
const SERVICE_RETRY_MS = 400;
const SERVICE_RETRY_MAX = 8;

interface RouterEnvelope<T> {
  msgId?: string;
  ok: boolean;
  result?: T | null;
  error?: unknown;
}

/** 插件服务的统一信封（service/main.js 契约） */
interface ServiceEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** 服务未就绪（进程刚拉起 / 端口未监听）——可重试 */
function isServiceWarmingUp(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /未运行或无端口|插件服务请求失败|ECONNREFUSED|connection refused|socket hang up/i.test(msg);
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

/** 单次转发：宿主 cap.pluginServiceManager.request → 本机插件服务 /dispatch */
async function dispatchOnce<T>(action: string, params: Record<string, unknown>): Promise<T> {
  const invoke = getHostInvoke();
  const res = await invoke<RouterEnvelope<ServiceEnvelope<T>>>('router_dispatch', {
    req: {
      target: 'cap.pluginServiceManager',
      payload: {
        action: 'request',
        serviceId: SERVICE_ID,
        path: '/dispatch',
        body: { action, params },
      },
    },
  });
  if (!res.ok) {
    throw new Error(envelopeErrorMessage(res.error, `Git 引擎 ${action} 调用失败`));
  }
  const env = res.result;
  if (!env || typeof env !== 'object') {
    throw new Error(`Git 引擎 ${action} 返回空响应`);
  }
  if (!env.ok) {
    throw new Error(env.error || `Git 引擎 ${action} 执行失败`);
  }
  return env.data as T;
}

/**
 * Git 引擎调用：action + 参数（camelCase，与 service/engine.js 契约对齐）。
 * 服务冷启动未就绪时短重试，避免面板首次打开即报错。
 */
export async function capGit<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < SERVICE_RETRY_MAX; attempt += 1) {
    try {
      return await dispatchOnce<T>(action, params);
    } catch (err) {
      lastErr = err;
      if (!isServiceWarmingUp(err) || attempt === SERVICE_RETRY_MAX - 1) break;
      await new Promise((resolve) => setTimeout(resolve, SERVICE_RETRY_MS));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** 服务健康探测（诊断用；面板头部可显示「引擎未就绪」） */
export async function probeService(): Promise<boolean> {
  try {
    await dispatchOnce('is_repository', { workspacePath: '.' });
    return true;
  } catch {
    return false;
  }
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
