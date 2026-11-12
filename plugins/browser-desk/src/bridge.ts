/**
 * bridge.ts —— browser-desk 面板宿主桥（对齐 terminal-desk 的宿主桥契约）
 *
 * 通道：
 * - 服务调用：__POLARIS_HOST_INVOKE__('router_dispatch') → cap.pluginServiceManager.request
 *   （宿主按 serviceId 转发到本机 127.0.0.1:<port>/dispatch，面板无需知道端口）
 * - 主题：__POLARIS_THEME_API__.subscribe
 */

type HostInvoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke;
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
  if (!fn) throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__');
  return fn;
}

/** service dispatch 响应形状（cap.pluginServiceManager.request → HTTP JSON） */
interface DispatchResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
  tookMs?: number;
}

/** 经宿主转发调用 browser-desk-service 的 /dispatch */
export async function callService<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const invoke = getHostInvoke();
  const res = await invoke<{ ok?: boolean; result?: DispatchResponse<T> | null; error?: string | null }>(
    'router_dispatch',
    {
      req: {
        target: 'cap.pluginServiceManager',
        payload: {
          action: 'request',
          serviceId: 'browser-desk-service',
          path: '/dispatch',
          body: { action, ...params },
        },
      },
    },
  );
  if (!res.ok) throw new Error(res.error || '宿主转发失败');
  const inner = res.result;
  if (!inner) throw new Error('服务无响应');
  if (!inner.ok) throw new Error(inner.error || '服务调用失败');
  return (inner.result ?? ({} as T)) as T;
}

export interface TabInfo {
  tabId: string;
  url: string;
  title: string;
  agentKey: string | null;
  windowId: string | null;
  createdAt: number;
  lastUsedAt: number;
}

export interface EngineStatus {
  engine: 'ready' | 'starting' | 'stopped';
  chromePath: string | null;
  tabs: TabInfo[];
  agentBinds: Array<{ agentKey: string; tabId: string; lastUsedAt: number }>;
  downloads: Array<{ guid: string; filename: string; state: string; receivedBytes: number; totalBytes: number }>;
  version: string;
}

export async function getStatus(): Promise<EngineStatus> {
  return callService<EngineStatus>('status');
}

export interface SearchResult {
  tabId: string;
  url: string;
  query: string;
  engine: string;
  results: Array<{ title: string; url: string; snippet: string }>;
}

export async function search(query: string, engine?: string, limit?: number): Promise<SearchResult> {
  return callService<SearchResult>('search', { query, engine, limit });
}

export async function openUrl(url: string, newWindow?: boolean): Promise<TabInfo> {
  return callService<TabInfo>('acquire', { url, mode: 'create', newWindow: !!newWindow });
}

export async function activateTab(tabId: string): Promise<TabInfo> {
  return callService<TabInfo>('acquire', { tabId, mode: 'reuse' });
}

export async function closeTab(tabId: string): Promise<{ closed: number }> {
  return callService<{ closed: number }>('close', { tabId });
}

/** 主题订阅（可选能力，宿主未注入时静默降级） */
export function subscribeTheme(listener: (id: string) => void): () => void {
  const api = globals().__POLARIS_THEME_API__;
  if (!api) return () => {};
  return api.subscribe(() => listener(api.activeId()));
}

export function activeTheme(): string {
  const api = globals().__POLARIS_THEME_API__;
  return api ? api.activeId() : 'default';
}
