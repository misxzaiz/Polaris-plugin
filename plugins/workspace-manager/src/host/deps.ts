/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * workspace-manager host/ 依赖桥
 *
 * 迁入的 Workspace 域组件（QuickSwitch/SearchInput/CreateWorkspaceModal）原依赖
 * 宿主 @/stores、@/components/Common 等；经 __POLARIS_APP_CORE__（appCoreBridge）
 * 取宿主同一实例。React 19 forwardRef 组件（Button 等）是 { $$typeof, render }
 * 对象，Proxy get 透传本体成员即可命中（JSX createElement 只读属性不调用）。
 */

function core(): any {
  const c = (globalThis as any).__POLARIS_APP_CORE__
  if (!c?.stores) throw new Error('宿主 App Core 未挂载：请把 Polaris 更新到较新版本。')
  return c
}

function forwardStore(name: string): any {
  const fn = (...args: any[]) => {
    const hook = core().stores[name]
    if (typeof hook !== 'function') throw new Error(`宿主 ${name} 不可用`)
    return hook(...args)
  }
  return new Proxy(fn, {
    get: (_t, prop) => {
      const hook = core().stores[name]
      const v = (hook as any)[prop]
      return typeof v === 'function' ? v.bind(hook) : v
    },
  })
}

// ── stores ──
export const useWorkspaceStore: any = forwardStore('useWorkspaceStore')
export const useViewStore: any = forwardStore('useViewStore')

// ── components（React 19 forwardRef 组件：get 透传即可被 JSX 命中）──
export const Button: any = new Proxy(function () {}, {
  get: (_t, prop) => (core().components.Button as any)?.[prop],
  apply: (_t, _this, args) => {
    const v = core().components.Button as any
    if (v && typeof v === 'object' && typeof v.render === 'function') return v.render(...args)
    return v(...args)
  },
  construct: (_t, args) => new (core().components.Button as any)(...args),
})

// ── plugin-system ──
export const pluginPanelRegistry: any = new Proxy({}, {
  get: (_t, p) => (core().pluginSystem as any).pluginPanelRegistry?.[p],
})

// ── utils ──
export const cn: any = (...args: any[]) => (core().utils as any).cn(...args)
export function createLogger(tag: string): any {
  return (core().utils as any).createLogger(tag)
}

// ── services ──
export async function fsDispatch<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (core().services.tauri as any).fsDispatch<T>(action, payload)
}
