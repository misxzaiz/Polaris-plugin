/**
 * bridge.ts —— translate 面板宿主桥（对齐 im-bridge 的宿主桥契约）
 *
 * 通道：__POLARIS_HOST_INVOKE__('router_dispatch') → cap.pluginServiceManager.request
 * （宿主按 serviceId 转发到本机 translate-service /translate，面板无需知道端口）
 */

type HostInvoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke;
}

function globals(): HostGlobals {
  return window as unknown as HostGlobals;
}

function getHostInvoke(): HostInvoke {
  const fn = globals().__POLARIS_HOST_INVOKE__;
  if (!fn) throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__');
  return fn;
}

const SERVICE_ID = 'translate-service';

/** 经宿主转发调用 translate-service 的 /translate */
export async function callTranslate(text: string, to: string): Promise<{ success: boolean; result: string | null; error: string | null }> {
  const invoke = getHostInvoke();
  const res = await invoke<{ ok?: boolean; result?: { ok?: boolean; success?: boolean; result?: string | null; error?: string | null } | null; error?: string | null }>(
    'router_dispatch',
    {
      req: {
        target: 'cap.pluginServiceManager',
        payload: {
          action: 'request',
          serviceId: SERVICE_ID,
          path: '/translate',
          body: { text, to },
        },
      },
    },
  );
  if (res && res.ok === false) {
    return { success: false, result: null, error: res.error || '宿主转发失败' };
  }
  const inner = res && res.result;
  if (inner && typeof inner.success === 'boolean') {
    return { success: inner.success, result: inner.result ?? null, error: inner.error ?? null };
  }
  if (inner && inner.ok === false) {
    return { success: false, result: null, error: inner.error || 'service 调用失败' };
  }
  return { success: false, result: null, error: (res && res.error) || 'service 调用失败' };
}
