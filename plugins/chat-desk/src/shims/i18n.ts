/**
 * react-i18next shim（chat-desk P3）—— 面板 bundle external react-i18next，
 * 经宿主全局拿同一实例（同词典同语言）。i18next 裸包同理转发宿主 core().i18n。
 */
import { coreService } from '../core'

/* eslint-disable @typescript-eslint/no-explicit-any */

function hostUseTranslation(): any {
  return (globalThis as unknown as { __POLARIS_HOST_USE_TRANSLATION__: any }).__POLARIS_HOST_USE_TRANSLATION__
}

export function useTranslation(ns?: string): any {
  const host = hostUseTranslation()
  if (host) return host(ns)
  // 兜底：宿主未挂时走 appCore i18n（组件外调用场景极少）
  const inst = coreService<Record<string, any>>('i18n')
  return { t: (key: string, opts?: any) => inst.t(key, { ns, ...opts }), i18n: inst }
}

export function getI18n(): any {
  const host = hostUseTranslation()
  if (host) {
    const r = host()
    return r.i18n
  }
  return coreService<Record<string, any>>('i18n')
}

// react-i18next 其余导出面（面板用到再补）；缺省 undefined 不崩
export const I18nextProvider: any = undefined
export const initReactI18next: any = undefined
export const useTranslation0 = useTranslation

// i18next 裸包 shim：面板内 `import i18n from 'i18next'` 拿宿主实例
const inst: any = new Proxy({}, {
  get: (_t, prop) => {
    const core = (globalThis as unknown as { __POLARIS_APP_CORE__: any }).__POLARIS_APP_CORE__
    const i = core && (core.i18n as Record<string, any>)
    return i ? i[prop as string] : undefined
  },
})
export default inst
export const t = inst.t
export const language = inst.language
