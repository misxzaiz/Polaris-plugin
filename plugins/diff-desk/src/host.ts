/**
 * host.ts —— 宿主桥封装（与家规一致：面板绝不直接 fetch 服务端口）。
 * 一切面板↔服务通信走 window.__POLARIS_HOST_INVOKE__ → router_dispatch → cap.http。
 */

type InvokeResult = { ok: boolean; result?: unknown; error?: string };
type InvokeFn = (cmd: string, args?: unknown) => Promise<InvokeResult>;

declare global {
  interface Window {
    __POLARIS_HOST_INVOKE__?: InvokeFn;
  }
}

export function getInvoke(): InvokeFn {
  const fn = typeof window !== 'undefined' ? window.__POLARIS_HOST_INVOKE__ : undefined;
  if (!fn) throw new Error('未检测到宿主桥（__POLARIS_HOST_INVOKE__）——请在 Polaris 宿主内使用本插件');
  return fn;
}

export async function capDispatch<T>(target: string, payload: unknown): Promise<T> {
  const invoke = getInvoke();
  const r = await invoke('router_dispatch', { req: { target, payload } });
  if (!r || r.ok !== true) throw new Error((r && r.error) || `${target} 调用失败`);
  return r.result as T;
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const r = await capDispatch<{ value?: T }>('cap.kv', { action: 'get', key });
    return r && r.value !== undefined ? r.value : null;
  } catch (_) {
    return null; // kv 不可用不算致命（端口回退 manifest 值）
  }
}

/** 经宿主 cap.http 请求本机服务；返回服务 result（{ok:false} 已转异常） */
export async function svcHttp<T>(method: 'GET' | 'POST', url: string, bodyObj?: unknown, timeoutMs = 120000): Promise<T> {
  const payload: Record<string, unknown> = { action: 'request', method, url, timeoutMs };
  if (method === 'POST' && bodyObj !== undefined) {
    payload.body = JSON.stringify(bodyObj);
    payload.bodyType = 'json';
  }
  const r = await capDispatch<{ status: number; body?: string; isBase64?: boolean }>('cap.http', payload);
  if (typeof r.status !== 'number') throw new Error('cap.http 返回异常（无 status）');
  let parsed: { ok?: boolean; result?: T; error?: string };
  try {
    parsed = JSON.parse(r.body || '');
  } catch (_) {
    throw new Error(`服务返回非 JSON（HTTP ${r.status}）`);
  }
  if (parsed.ok !== true) throw new Error(parsed.error || `服务返回错误（HTTP ${r.status}）`);
  return parsed.result as T;
}
