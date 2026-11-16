/**
 * react-i18next shim —— 面板 bundle 内 import 'react-i18next' 经 esbuild alias
 * 指到本文件；useTranslation 转发宿主同实例（appCore.i18n），并把插件自带词典
 * 合并进宿主 settings 命名空间（宿主词典无 dataStorage.* 节）。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import zhCN from '../locales/zh-CN.json'
import enUS from '../locales/en-US.json'

let merged = false

function hostI18n(): any {
  return (globalThis as any).__POLARIS_APP_CORE__?.i18n
}

function ensureMerged(): any {
  const inst = hostI18n()
  if (inst && !merged && typeof inst.addResourceBundle === 'function') {
    try {
      inst.addResourceBundle('zh-CN', 'settings', zhCN.settings, true, true)
      inst.addResourceBundle('en-US', 'settings', enUS.settings, true, true)
      if (zhCN.common) inst.addResourceBundle('zh-CN', 'common', zhCN.common, true, true)
      if (enUS.common) inst.addResourceBundle('en-US', 'common', enUS.common, true, true)
      merged = true
    } catch {
      /* 合并失败退回宿主词典（裸 key 与宿主原状一致） */
    }
  }
  return inst
}

export function useTranslation(...namespaces: any[]): any {
  const inst = ensureMerged()
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
