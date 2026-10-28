/**
 * host.ts —— 宿主 API 薄封装：面板零直接 fetch 宿主 IPC，
 * 一律走 window.__POLARIS_HOST_INVOKE__（桌面 Tauri 直连 / Web 自动带 token）。
 */

type HostWindow = Window & {
  __POLARIS_HOST_INVOKE__?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
};

export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function hostWindow(): HostWindow {
  return window as unknown as HostWindow;
}

export function getHostInvoke(): HostInvoke {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke) {
    throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）');
  }
  return invoke;
}

export async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<{ ok: boolean; result?: T; error?: string }>('router_dispatch', { req: { target, payload } });
  if (!res || res.ok === false) throw new Error(String((res && res.error) || target + ' 调用失败'));
  return (res.result ?? {}) as T;
}
