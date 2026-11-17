/**
 * react-i18next shim —— notification-desk 消费宿主 common 命名空间（词典留宿主），
 * 不合并插件词典。转发宿主 i18n 实例。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function hostI18n(): any {
  return (globalThis as any).__POLARIS_APP_CORE__?.i18n
}

export function useTranslation(...namespaces: any[]): any {
  const inst = hostI18n()
  const ns = Array.isArray(namespaces) && namespaces.length > 0 ? namespaces[0] : undefined
  if (!inst) {
    return { t: (key: string, opts?: any) => key, i18n: undefined }
  }
  return {
    t: (key: string, opts?: any) => inst.t(key, { ns, ...(typeof opts === 'object' && opts ? opts : {}) }),
    i18n: inst,
  }
}

export const initReactI18next = { type: 'shim' }
export default { useTranslation, initReactI18next }
