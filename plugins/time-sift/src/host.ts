/**
 * host.ts —— 宿主通道（面板唯一数据入口）
 *
 * 桌面 Tauri 直连后端 IPC；手机/Web 自动取正确服务地址并带 Bearer token（Remote 源）。
 * 面板自身绝不直接 fetch 任何地址——跨域治理第一铁律。
 */
export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

export function getHostInvoke(): HostInvoke {
  const w = window as unknown as { __POLARIS_HOST_INVOKE__?: HostInvoke }
  const invoke = w.__POLARIS_HOST_INVOKE__
  if (typeof invoke !== 'function') {
    throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）')
  }
  return invoke
}
