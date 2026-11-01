/**
 * host.ts —— 面板侧宿主桥与服务 API 封装
 *
 * 纪律（对齐 feed-radar/pocket-drop 先例）：
 * - 宿主桥缺失时给出「需更新 Polaris 主应用」的明确错误，不静默降级；
 * - 面板到本插件后台服务的请求是唯一允许的直连（127.0.0.1 + token，pocket-drop 先例）；
 * - kv 只读（probe.* 的唯一写者是后台服务）。
 */

interface HostInvoke {
  (cmd: string, args?: unknown): Promise<{ ok?: boolean; result?: unknown; error?: string }>;
}

declare global {
  interface Window {
    __POLARIS_HOST_INVOKE__?: HostInvoke;
    __POLARIS_HOST_WORKSPACE__?: { path?: string } | string;
  }
}

export function getHostInvoke(): HostInvoke {
  const fn = typeof window !== 'undefined' ? window.__POLARIS_HOST_INVOKE__ : undefined;
  if (!fn) throw new Error('未检测到 Polaris 宿主桥（__POLARIS_HOST_INVOKE__）——请更新 Polaris 主应用');
  return fn;
}

async function dispatch(target: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await getHostInvoke()('router_dispatch', { req: { target, payload } });
  if (!res || res.ok !== true) throw new Error(res?.error || `${target} 调用失败`);
  return (res.result as Record<string, unknown>) || {};
}

/** 读 cap.kv（只读） */
export async function kvGet(key: string): Promise<unknown> {
  const r = await dispatch('cap.kv', { action: 'get', key });
  return r.value !== undefined ? r.value : null;
}

/** 当前工作区路径（用于 Claude 配置扫描的 project/local scope） */
export function workspacePath(): string {
  const w = typeof window !== 'undefined' ? window.__POLARIS_HOST_WORKSPACE__ : undefined;
  if (!w) return '';
  if (typeof w === 'string') return w;
  return typeof w.path === 'string' ? w.path : '';
}

/* ------------------------------ 后台服务 ------------------------------ */

export interface SvcInfo {
  port: number;
  token: string;
  pid: number;
  version: string;
  startedAt: string;
}

/** 从 probe.meta 读服务地址（服务未启动/未注册时返回 null） */
export async function readServiceInfo(): Promise<SvcInfo | null> {
  try {
    const meta = (await kvGet('probe.meta')) as SvcInfo | null;
    if (meta && typeof meta.port === 'number' && typeof meta.token === 'string' && meta.token) {
      return meta;
    }
  } catch (_) { /* 桥不可用也按未启动处理 */ }
  return null;
}

export class SvcError extends Error {
  offline: boolean;
  constructor(message: string, offline: boolean) {
    super(message);
    this.offline = offline;
  }
}

/** 调用后台服务 REST（127.0.0.1 + Bearer token） */
export async function svcApi<T>(
  info: SvcInfo,
  method: 'GET' | 'POST',
  route: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${info.port}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${info.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new SvcError(`调试台服务不可达（127.0.0.1:${info.port}）：${e instanceof Error ? e.message : String(e)}`, true);
  }
  const text = await res.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch (_) {
    throw new SvcError(`服务返回非 JSON（HTTP ${res.status}）`, res.status === 404);
  }
  if (res.status === 401) throw new SvcError('服务 token 不匹配（服务可能刚重启）——刷新面板重试', true);
  if (res.status !== 200 || parsed.ok !== true) {
    throw new SvcError(String(parsed.error || `HTTP ${res.status}`), false);
  }
  return parsed as T;
}

/** 请宿主重启本插件后台服务（服务异常离线时的自救按钮） */
export async function restartOwnService(): Promise<void> {
  await dispatch('cap.pluginServiceManager', { action: 'restart', pluginId: 'mcp-probe', serviceId: 'probe-service' });
}
