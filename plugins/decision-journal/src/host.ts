/**
 * 宿主 API 访问层（谋定面板专用，与 pocket-ledger / page-sentinel 同一模式）
 *
 * 统一经宿主 invoke 通道（window.__POLARIS_HOST_INVOKE__，主应用 main.tsx 挂载）：
 *   - 桌面 Tauri：直连后端 IPC
 *   - 手机浏览器 / Web：自动取正确服务地址并携带 token，跨端看到同一份台账
 * 决策日记完全本地（cap.kv decision.* 键空间），零外网请求、零后台服务、零 CORS 面。
 */
export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke
}

function hostWindow(): HostGlobals & typeof globalThis {
  return window as unknown as HostGlobals & typeof globalThis
}

export function getHostInvoke(): HostInvoke {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__
  if (!invoke) {
    throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）')
  }
  return invoke
}
