/**
 * 宿主 API 访问层（RSS 订阅面板专用，与 clip-relay / page-sentinel 同一模式）
 *
 * 面板数据全部走宿主暴露的 invoke 通道（window.__POLARIS_HOST_INVOKE__）：
 *   - 桌面 Tauri：直连后端 IPC（Source::Bootstrap）
 *   - 手机浏览器 / Web：自动取正确服务地址并携带 Bearer token（Source::Remote）
 *
 * 面板自身绝不直接 fetch 任何地址——订阅源与文章抓取由后台服务原生执行
 * （浏览器同源策略管不到服务进程），这是本插件跨域问题的根治点。
 */
export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke
}

function hostWindow(): HostGlobals & typeof globalThis {
  return window as unknown as HostGlobals & typeof globalThis
}

/** 获取宿主 invoke 通道；缺失时抛清晰错误（提示需更新主应用） */
export function getHostInvoke(): HostInvoke {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__
  if (!invoke) {
    throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）')
  }
  return invoke
}
