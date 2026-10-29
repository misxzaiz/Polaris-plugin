/**
 * 宿主 API 访问层（食材管家面板专用，与数据方舟/网页哨兵同一模式）
 *
 * 数据读写统一走宿主暴露的 invoke 通道（window.__POLARIS_HOST_INVOKE__）：
 *   - 桌面 Tauri：直连后端 IPC（Source::Bootstrap）
 *   - 手机浏览器 / Web：自动取正确服务地址并携带 Bearer token（Source::Remote）
 *
 * 面板自身绝不直接 fetch 外网、也绝不直接碰文件系统——菜谱抓取等网络操作
 * 全部经命令邮箱下发给后台服务执行，这是本插件的跨域根治点与安全边界。
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
