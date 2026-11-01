/**
 * 宿主 API 访问层（SQLite 检查台面板专用，与 disk-radar / api-bench 同一模式）
 *
 * 面板绝不直接 fetch 任何远程地址——宿主通道（window.__POLARIS_HOST_INVOKE__，
 * 主应用 main.tsx 挂载）用于 cap.kv 数据面；本机服务直连仅 127.0.0.1:<meta.port>
 * （api-bench 同款双平面：kv 拿 meta，字节面直连自家服务）。
 *   - 桌面 Tauri：invoke 直连后端 IPC（Source::Bootstrap）
 *   - 手机浏览器 / Web：invoke 自动取正确服务地址并携带 Bearer token（Source::Remote）
 */
export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke
}

function findInvoke(): HostInvoke | undefined {
  if (typeof window !== 'undefined' && (window as unknown as HostGlobals).__POLARIS_HOST_INVOKE__) {
    return (window as unknown as HostGlobals).__POLARIS_HOST_INVOKE__
  }
  if (typeof globalThis !== 'undefined' && (globalThis as unknown as HostGlobals).__POLARIS_HOST_INVOKE__) {
    return (globalThis as unknown as HostGlobals).__POLARIS_HOST_INVOKE__
  }
  return undefined
}

export function getHostInvoke(): HostInvoke {
  const invoke = findInvoke()
  if (!invoke) {
    throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）')
  }
  return invoke
}
