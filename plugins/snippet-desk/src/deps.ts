/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * snippet-desk 依赖注入 —— 迁入的 PromptSnippetTab 原依赖宿主 @/stores 等，
 * 插件内经 __POLARIS_APP_CORE__（appCoreBridge）取同一实例。
 * snippetStore 为插件本地实现（源码同源拷贝，数据走 cap.prompt_snippet）。
 */

function core(): { stores: Record<string, any>; services: Record<string, any> } {
  const c = (globalThis as any).__POLARIS_APP_CORE__
  if (!c?.stores) throw new Error('宿主 App Core 未挂载：请把 Polaris 更新到较新版本后再打开本插件。')
  return c
}

/** 造一个「调用即转发宿主 hook，属性访问即转发静态成员」的代理函数 */
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

export const useSkillStore: any = forwardStore('useSkillStore')
export const useConfigStore: any = forwardStore('useConfigStore')
export const useToastStore: any = forwardStore('useToastStore')
