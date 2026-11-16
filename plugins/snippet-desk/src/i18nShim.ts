/**
 * react-i18next shim —— 面板 bundle 内 import 'react-i18next' 经 esbuild alias
 * 指到本文件；useTranslation 转发宿主同实例（appCore.i18n），词典/语言与宿主一致。
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
