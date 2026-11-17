/**
 * 平台检测工具 — 统一判断当前运行环境
 *
 * 唯一真实来源：transport 层的 detectTransport()。
 * 所有模块应使用本文件导出的 isTauri() / isWeb()，避免各自重复检测。
 */

/** 当前运行模式：优先宿主桥（appCore.transport.currentMode），测试/裸环境按探针降级 */
function mode(): string {
  const viaCore = (globalThis as any).__POLARIS_APP_CORE__?.services?.transport?.currentMode
  if (typeof viaCore === 'string') return viaCore
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 'tauri' : 'http'
}

/** 当前是否运行在 Tauri 桌面端 */
export const isTauri = (): boolean => mode() === 'tauri';

/** 当前是否运行在 Web 浏览器端 */
export const isWeb = (): boolean => currentMode === 'http';
