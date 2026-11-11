/**
 * terminal-desk 宿主桥封装
 *
 * 通道（全零服务、零端口，plans/terminal-plugin-spec.md §五）：
 * - 命令：__POLARIS_HOST_INVOKE__('router_dispatch') → cap.terminal（宿主 PTY）
 * - 配置：plugin_get_config / plugin_set_config（config.json plugins[terminal-desk] 命名空间）
 * - 事件：__POLARIS_HOST_LISTEN__('terminal:output' / 'terminal:exit')
 * - 工作区：__POLARIS_HOST_WORKSPACE__（宿主保活字符串）+ __POLARIS_WORKSPACE_API__
 * - 主题：__POLARIS_THEME_API__.subscribe
 *
 * 硬约束：宿主 HOST_INVOKE_ALLOWLIST 只放行 plugin_* / router_dispatch 等命令。
 * 禁止直调已摘除的 terminal_* 命令与 __TAURI_INTERNALS__.invoke。
 */

type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/**
 * 宿主 listen 契约：返回 Promise<unlisten>（web/桌面 transport 统一为异步注册）。
 * 曾误声明为同步 () => void——useEffect 直接 return 该返回值会把 Promise 塞进
 * cleanup 槽，StrictMode 首轮卸载时 React 调 destroy() 抛
 * "TypeError: destroy is not a function"，面板一挂载即崩（2026-11-11 修复）。
 */
type HostListen = (event: string, handler: (payload: unknown) => void) => Promise<() => void>;

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke;
  __POLARIS_HOST_LISTEN__?: HostListen;
  __POLARIS_HOST_WORKSPACE__?: string;
  __POLARIS_WORKSPACE_API__?: {
    list: () => Array<{ id: string; name: string; path: string }>;
    currentId: () => string | null;
    subscribe: (listener: () => void) => () => void;
  };
  __POLARIS_THEME_API__?: {
    activeId: () => string;
    subscribe: (listener: () => void) => () => void;
  };
  /** 宿主未来 H1 落地后可提供的全屏委托；当前版本不存在，插件降级为专注模式 */
  __POLARIS_HOST_FULLSCREEN__?: {
    active: () => boolean;
    toggle: () => void | Promise<void>;
  };
}

function globals(): HostGlobals {
  return window as unknown as HostGlobals;
}

export function getHostInvoke(): HostInvoke {
  const fn = globals().__POLARIS_HOST_INVOKE__;
  if (!fn) throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）');
  return fn;
}

export function getHostListen(): HostListen {
  const fn = globals().__POLARIS_HOST_LISTEN__;
  if (!fn) throw new Error('宿主 listen 不可用：需要主应用提供 __POLARIS_HOST_LISTEN__（请更新 Polaris 主应用）');
  return fn;
}

/** cap.terminal 调用（router_dispatch → 宿主 PTY） */
export async function capTerminal<T = Record<string, unknown>>(
  payload: Record<string, unknown>,
): Promise<T> {
  const invoke = getHostInvoke();
  const res = await invoke<{ msgId?: string; ok: boolean; result?: T | null; error?: string | null }>(
    'router_dispatch',
    { req: { target: 'cap.terminal', payload } },
  );
  if (!res.ok) throw new Error(res.error || 'cap.terminal 调用失败');
  return (res.result ?? ({} as T));
}

/** 宿主已存在的 PTY 会话（面板重挂/多窗口时恢复，避免重复建会话） */
export async function listTerminalSessions<T = unknown>(): Promise<T[]> {
  const res = await capTerminal<{ sessions?: T[] }>({ action: 'list' });
  return Array.isArray(res.sessions) ? res.sessions : [];
}

/** 在系统终端中运行（cap.terminal open_in_external，仅桌面构建可用） */
export async function openInExternalTerminal(
  command: string,
  cwd?: string,
  env?: Record<string, string>,
): Promise<void> {
  await capTerminal({
    action: 'open_in_external',
    command,
    ...(cwd ? { cwd } : {}),
    ...(env ? { env } : {}),
  });
}

/** 宿主全屏委托是否可用（H1 落地前恒为 false → 插件内专注模式） */
export function hasHostFullscreen(): boolean {
  const api = globals().__POLARIS_HOST_FULLSCREEN__;
  return !!api && typeof api.toggle === 'function';
}

export async function toggleHostFullscreen(): Promise<boolean> {
  const api = globals().__POLARIS_HOST_FULLSCREEN__;
  if (!api || typeof api.toggle !== 'function') return false;
  await api.toggle();
  return true;
}

// ---------------------------------------------------------------------------
// 插件配置（自定义命令 / 隐藏项 / 自动运行 / 重命名 / UI 偏好持久化）
// ---------------------------------------------------------------------------

export async function readPluginConfig(): Promise<Record<string, unknown>> {
  const invoke = getHostInvoke();
  try {
    const value = await invoke<Record<string, unknown>>('plugin_get_config', { pluginId: PLUGIN_ID });
    return value && typeof value === 'object' ? value : {};
  } catch {
    // 权限未就绪（安装瞬窗）等场景：空配置兜底，不阻塞面板
    return {};
  }
}

export async function writePluginConfig(patch: Record<string, unknown>): Promise<void> {
  const invoke = getHostInvoke();
  await invoke('plugin_set_config', { pluginId: PLUGIN_ID, patch });
}

// ---------------------------------------------------------------------------
// 事件订阅（输出/退出；负载与内置终端一致：{ sessionId, data?/exitCode? }）
// ---------------------------------------------------------------------------

export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number | null;
}

/**
 * 事件订阅统一封装：宿主 listen 异步注册，返回值必须是同步清理函数。
 * - 未决期退订：Promise resolve 时发现已取消，立即退订（防 StrictMode 双挂载泄漏）
 * - 失败静默：订阅失败（宿主未升级等）不阻塞面板
 */
function subscribeHostEvent(event: string, handler: (payload: unknown) => void): () => void {
  let unlisten: (() => void) | null = null;
  let cancelled = false;
  void getHostListen()(event, handler)
    .then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    })
    .catch(() => {});
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

export function listenTerminalOutput(handler: (event: TerminalOutputEvent) => void): () => void {
  return subscribeHostEvent('terminal:output', (payload) => {
    const ev = payload as TerminalOutputEvent;
    if (ev && typeof ev.sessionId === 'string' && typeof ev.data === 'string') handler(ev);
  });
}

export function listenTerminalExit(handler: (event: TerminalExitEvent) => void): () => void {
  return subscribeHostEvent('terminal:exit', (payload) => {
    const ev = payload as TerminalExitEvent;
    if (ev && typeof ev.sessionId === 'string') handler(ev);
  });
}

// ---------------------------------------------------------------------------
// 工作区（脚本发现的 cwd 来源）
// ---------------------------------------------------------------------------

export function currentWorkspacePath(): string | null {
  // 结构化 API 优先：__POLARIS_HOST_WORKSPACE__ 初始为空，且只在 eventBus
  // workspace-changed 触发后才有值，冷启动会漏。
  const api = globals().__POLARIS_WORKSPACE_API__;
  if (api) {
    try {
      const id = api.currentId();
      if (id) {
        const ws = api.list().find((w) => w.id === id);
        if (ws?.path) return ws.path;
      }
    } catch {
      /* 宿主 API 未就绪，回落保活字符串 */
    }
  }
  const direct = globals().__POLARIS_HOST_WORKSPACE__;
  if (typeof direct === 'string' && direct) return direct;
  return null;
}

/** 订阅工作区变化：结构化 API 挂载即回调，冷启动也能拿到值 */
export function onWorkspaceChanged(handler: (path: string | null) => void): () => void {
  let last = currentWorkspacePath();
  const api = globals().__POLARIS_WORKSPACE_API__;
  const off = api?.subscribe(() => {
    const next = currentWorkspacePath();
    if (next !== last) {
      last = next;
      handler(next);
    }
  });
  // 挂载即同步一次（API 的 subscribe 本身保证首帧回调，这里兼容未实现的旧宿主）
  if (typeof last === 'string') handler(last);
  return off ?? (() => {});
}

// ---------------------------------------------------------------------------
// 主题（热跟随）
// ---------------------------------------------------------------------------

export function currentThemeId(): string {
  return globals().__POLARIS_THEME_API__?.activeId() ?? '';
}

export function onThemeChanged(handler: () => void): () => void {
  const off = globals().__POLARIS_THEME_API__?.subscribe(handler);
  if (typeof off === 'function') return off;
  return () => {};
}

export const PLUGIN_ID = 'terminal-desk';
