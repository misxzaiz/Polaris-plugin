/**
 * 宿主 API 访问层（磁盘分析面板专用，与 page-sentinel 同一模式）
 *
 * 面板自身绝不直接 fetch 任何地址——数据读写统一走宿主暴露的 invoke 通道
 * （window.__POLARIS_HOST_INVOKE__，主应用 main.tsx 挂载）：
 *   - 桌面 Tauri：直连后端 IPC（Source::Bootstrap）
 *   - 手机浏览器 / Web：自动取正确服务地址并携带 Bearer token（Source::Remote）
 * 本插件零外网请求，无跨域面；跨端一致由 cap.kv 单事实库保证。
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
