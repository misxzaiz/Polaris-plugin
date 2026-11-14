/**
 * core.ts —— 宿主 __POLARIS_APP_CORE__ 读取（chat-desk P3 重构）
 *
 * 面板运行于宿主同窗口（main.tsx installAppCoreBridge 已挂）。
 * 所有「宿主共享单例」经此取用；host 树的 shims/*.ts 再按需解构。
 */
export interface AppCore {
  stores: Record<string, unknown>
  services: Record<string, unknown>
  sessionV2: Record<string, unknown>
  aiRuntime: Record<string, unknown>
  i18n: unknown
  pluginSystem: Record<string, unknown>
  components: Record<string, unknown>
  tauri: Record<string, unknown>
}

export function getAppCore(): AppCore {
  const core = (window as unknown as { __POLARIS_APP_CORE__?: AppCore }).__POLARIS_APP_CORE__;
  if (!core) {
    throw new Error('[chat-desk] __POLARIS_APP_CORE__ 不可用：面板必须运行在 Polaris 宿主窗口（main.tsx installAppCoreBridge）');
  }
  return core;
}

/** 取 services 下的成员（运行时解引用，host 树循环依赖安全） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function coreService<T = any>(name: string): T {
  return (getAppCore().services as Record<string, unknown>)[name] as T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function coreStore<T = any>(name: string): T {
  return (getAppCore().stores as Record<string, unknown>)[name] as T
}
