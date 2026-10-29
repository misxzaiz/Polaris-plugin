/**
 * 宿主 API 访问层（书签体检面板；与 page-sentinel / clip-relay 同一模式）
 *
 * 面板数据全部走宿主 invoke 通道；外网链接体检由后台服务原生执行
 * （浏览器同源策略管不到服务进程）——本插件跨域问题的根治点。
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
