/**
 * 宿主 API 访问层（口袋快传面板）
 *
 * 面板数据走宿主暴露的 invoke 通道（window.__POLARIS_HOST_INVOKE__）：
 *   - 桌面 Tauri：直连后端 IPC
 *   - 手机浏览器 / Web：自动取正确服务地址并携带 Bearer token
 * 与服务、MCP server 共享同一份 cap.kv 的 pdrop.* 键空间。
 *
 * 大文件直传是唯一例外：面板对自家服务 http://127.0.0.1:<port> 发 XHR
 * （localhost 免混合内容、CORS 由自家服务放行）——kv/cap.http 扛不动 GB 级字节。
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
