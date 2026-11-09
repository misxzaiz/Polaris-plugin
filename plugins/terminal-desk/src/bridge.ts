/**
 * terminal-desk 宿主桥封装
 *
 * 通道（全零服务、零端口，plans/terminal-plugin-spec.md §五）：
 * - 命令：__POLARIS_HOST_INVOKE__('router_dispatch') → cap.terminal（宿主 PTY）
 * - 配置：plugin_get_config / plugin_set_config（config.json plugins[terminal-desk] 命名空间）
 * - 事件：__POLARIS_HOST_LISTEN__('terminal:output' / 'terminal:exit')
 * - 工作区：__POLARIS_HOST_WORKSPACE__（宿主保活字符串）+ __POLARIS_WORKSPACE_API__
 * - 主题：__POLARIS_THEME_API__.subscribe
 */

type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type HostListen = (event: string, handler: (payload: unknown) => void) => () => void;

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

// ---------------------------------------------------------------------------
// 插件配置（自定义命令持久化；config.json plugins["terminal-desk"]）
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

export function listenTerminalOutput(handler: (event: TerminalOutputEvent) => void): () => void {
  return getHostListen()('terminal:output', (payload) => {
    const ev = payload as TerminalOutputEvent;
    if (ev && typeof ev.sessionId === 'string' && typeof ev.data === 'string') handler(ev);
  });
}

export function listenTerminalExit(handler: (event: TerminalExitEvent) => void): () => void {
  return getHostListen()('terminal:exit', (payload) => {
    const ev = payload as TerminalExitEvent;
    if (ev && typeof ev.sessionId === 'string') handler(ev);
  });
}

// ---------------------------------------------------------------------------
// 工作区（脚本发现的 cwd 来源）
// ---------------------------------------------------------------------------

export function currentWorkspacePath(): string | null {
  const direct = globals().__POLARIS_HOST_WORKSPACE__;
  if (typeof direct === 'string' && direct) return direct;
  const api = globals().__POLARIS_WORKSPACE_API__;
  if (!api) return null;
  const id = api.currentId();
  if (!id) return null;
  const ws = api.list().find((w) => w.id === id);
  return ws?.path ?? null;
}

/** 订阅工作区变化（路径变化时回调） */
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
  return off ?? (() => {});
}

// ---------------------------------------------------------------------------
// 主题（热跟随）
// ---------------------------------------------------------------------------

export function currentThemeId(): string {
  return globals().__POLARIS_THEME_API__?.activeId() ?? '';
}

export function onThemeChanged(handler: () => void): () => void {
  return globals().__POLARIS_THEME_API__?.subscribe(handler) ?? (() => {});
}

export const PLUGIN_ID = 'terminal-desk';
