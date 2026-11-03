/**
 * host.ts —— 宿主桥封装（house 范式，对齐 log-lens）
 *
 * 面板绝不直接 fetch 任何地址：全部经 window.__POLARIS_HOST_INVOKE__ →
 * router_dispatch → cap.http（宿主 Rust 侧转发到 127.0.0.1 服务）。
 * 桌面 / Web / 手机同一条路，天然无 CORS，也不给服务开 CORS 头。
 */

export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke;
}

export const SERVICE_PORT = 9875;
export const SERVICE_BASE = `http://127.0.0.1:${SERVICE_PORT}`;

function hostWindow(): HostGlobals & typeof globalThis {
  return window as unknown as HostGlobals & typeof globalThis;
}

export function getHostInvoke(): HostInvoke {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke) {
    throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）');
  }
  return invoke;
}

export interface CapEnvelope<T> { ok: boolean; result?: T; error?: string }

export async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<CapEnvelope<T>>('router_dispatch', { req: { target, payload } });
  if (!res || res.ok !== true) throw new Error((res && res.error) || `${target} 调用失败`);
  return (res.result ?? {}) as T;
}

export interface HttpResult {
  status: number;
  statusText?: string;
  ok: boolean;
  body: string;
  isBase64?: boolean;
  timeMs?: number;
}

/** 调本地服务：经 cap.http；非 2xx 或 ok:false 时抛出服务给的用户可读错误 */
export async function api<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  timeoutMs = 120000,
): Promise<T> {
  const payload: Record<string, unknown> = {
    action: 'request',
    method,
    url: `${SERVICE_BASE}${path}`,
    timeoutMs,
  };
  if (body !== undefined) {
    payload.body = JSON.stringify(body);
    payload.bodyType = 'json';
  }
  const r = await capDispatch<HttpResult>('cap.http', payload);
  let parsed: unknown = null;
  try { parsed = JSON.parse(r.body); } catch (_) { /* 原样抛错 */ }
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  if (r.status >= 400 || obj.ok === false) {
    throw new Error(String(obj.error || `服务 HTTP ${r.status}`));
  }
  if (!parsed) throw new Error(`服务响应不可解析：${String(r.body).slice(0, 200)}`);
  return parsed as T;
}
