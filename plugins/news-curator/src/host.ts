/**
 * 宿主 API 访问层（news-curator 面板专用）
 *
 * 数据读写统一走宿主暴露的 invoke 通道（window.__POLARIS_HOST_INVOKE__，
 * 主应用 main.tsx 挂载，即 @/services/transport 的统一 invoke）：
 *   - 桌面 Tauri：直连后端 IPC
 *   - 手机浏览器 / Web：自动取 getServerUrl()（localStorage → window.location.origin）
 *     并携带 token，与主应用聊天等功能同通道
 *
 * 为什么不用面板自建的 tauriInvoke/ipcCall：
 *   - 自建 ipcCall 写死 http://127.0.0.1:3000 且不带 token，
 *     手机浏览器访问时请求落到手机自身、且被后端鉴权拦截 → 拉不到日报。
 *   - 宿主桥已处理地址 + token + 传输模式，面板零维护。
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

/** 探测宿主是否支持本通道（供面板做能力降级提示） */
export function hasHostSupport(): boolean {
  return typeof hostWindow().__POLARIS_HOST_INVOKE__ === 'function'
}
