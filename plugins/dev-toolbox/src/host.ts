// 宿主通道获取（house 范式，对齐 domain-probe/data-query）：缺失 = 宿主太旧，给明确报错
export function getHostInvoke(): <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> {
  const fn = (window as unknown as { __POLARIS_HOST_INVOKE__?: unknown }).__POLARIS_HOST_INVOKE__
  if (typeof fn !== 'function') {
    throw new Error('宿主通道不可用：请把 Polaris 更新到较新版本后再打开本插件。')
  }
  return fn as <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
}

/** 向当前活跃会话发送文本（可选能力：宿主未挂载时按钮不渲染） */
export function sendToChat(text: string): boolean {
  const fn = (window as unknown as { __POLARIS_SEND_TO_CHAT__?: unknown }).__POLARIS_SEND_TO_CHAT__
  if (typeof fn !== 'function') return false
  ;(fn as (msg: string) => void)(text)
  return true
}

export function hasSendToChat(): boolean {
  if (typeof window === 'undefined') return false // SSR/离线测试环境
  const fn = (window as unknown as { __POLARIS_SEND_TO_CHAT__?: unknown }).__POLARIS_SEND_TO_CHAT__
  return typeof fn === 'function'
}
