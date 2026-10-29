/**
 * 宿主 API 访问层（网络哨兵面板专用，与 pocket-host / page-sentinel 同一模式）
 *
 * 面板数据全部走宿主暴露的 invoke 通道（window.__POLARIS_HOST_INVOKE__，
 * 主应用 main.tsx 挂载，即 @/services/transport 的统一 invoke）：
 *   - 桌面 Tauri：直连后端 IPC（Source::Bootstrap）
 *   - 手机浏览器 / Web：自动取正确服务地址并携带 Bearer token（Source::Remote）
 *
 * 面板自身绝不直接 fetch 任何地址（本地或外网）——探测在后台原生服务执行，
 * 面板经宿主 router_dispatch 读写 cap.kv，桌面/手机/Web 三端同源无跨域问题。
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
