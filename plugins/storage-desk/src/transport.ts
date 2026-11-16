/** invoke 转发宿主桥（dataRootService 用） */
export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const fn = (globalThis as any).__POLARIS_HOST_INVOKE__
  if (typeof fn !== 'function') throw new Error('宿主通道不可用：请更新 Polaris。')
  return fn(cmd, args) as Promise<T>
}
