/**
 * 宿主 API 访问层（纸坊面板，与格致 / changqi 同一模式）
 *
 * 统一经宿主 invoke 通道（window.__POLARIS_HOST_INVOKE__，主应用 main.tsx 挂载）：
 *   - 桌面 Tauri：直连后端 IPC
 *   - 手机浏览器 / Web：自动取正确服务地址并携带 token
 * 数据面全部走 cap.kv zhifang.* 键空间；大文件字节走 127.0.0.1 直连自家服务
 * （pocket-drop 验证过的通道：localhost 免混合内容，CORS 由自家服务放行）。
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
