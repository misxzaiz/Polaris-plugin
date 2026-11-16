/* eslint-disable @typescript-eslint/no-explicit-any */
/** 宿主通道获取（缺失 = 宿主太旧，给明确报错） */
export function getHostInvoke(): <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> {
  const fn = (globalThis as any).__POLARIS_HOST_INVOKE__
  if (typeof fn !== 'function') {
    throw new Error('宿主通道不可用：请把 Polaris 更新到较新版本后再打开本插件。')
  }
  return fn as <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
}
