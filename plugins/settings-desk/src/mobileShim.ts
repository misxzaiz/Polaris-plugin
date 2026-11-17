/**
 * 移动端平台 shim（settings-desk）
 *
 * GeneralTab 原依赖宿主 @/mobile/platform（isMobileTauriRuntime 纯函数）与
 * @/mobile/MobileConnectionContext（useMobileConnection）。纯函数本地同源实现；
 * Context 消费在非移动端恒返回 null（GeneralTab 内已按 null 分支降级渲染）。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function isMobileTauriRuntime(): boolean {
  try {
    return typeof navigator !== 'undefined'
      && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      && typeof window !== 'undefined'
      && '__TAURI_INTERNALS__' in window
  } catch {
    return false
  }
}

export function useMobileConnection(): any | null {
  // 宿主在移动端经 MobileConnectionProvider 注入；插件面板运行于宿主窗口时
  // 经桥取宿主 context 值（appCore.mobileConnection），非移动端恒 null。
  return (globalThis as any).__POLARIS_APP_CORE__?.mobileConnection ?? null
}
