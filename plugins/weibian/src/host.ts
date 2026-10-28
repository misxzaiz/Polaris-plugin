/**
 * 宿主 API 访问层（韦编面板，与纸坊/口袋快传同一模式）
 *
 * 统一经宿主 invoke 通道（window.__POLARIS_HOST_INVOKE__，主应用 main.tsx 挂载）：
 *   - 桌面 Tauri：直连后端 IPC
 *   - 手机浏览器 / Web：自动取正确服务地址并携带 token
 * 设置/元数据/统计走 cap.kv weibian.*；搜索/预览/进度走自家服务 HTTP
 * （桌面 127.0.0.1；手机经局域网地址直连 PC——localhost/内网均免混合内容，
 *  CORS 由自家服务放行，业务端点一律 token 鉴权，与 pocket-drop 同一安全姿态）。
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
