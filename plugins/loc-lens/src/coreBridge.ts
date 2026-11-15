/**
 * coreBridge.ts —— 面板侧从 shared/core.js 取纯函数（fmtCount 等）
 *
 * 面板 bundle 由 esbuild 打包，CJS 的 shared/core.js 可直接 require 进来。
 * 单独一层是为了：类型明确 + 未来面板侧不依赖 node 内置时仍可替换实现。
 */
declare function require(id: string): any
const core = require('../shared/core')

export const fmtCount: (n: number) => string = core.fmtCount
export const VERSION: string = core.VERSION
