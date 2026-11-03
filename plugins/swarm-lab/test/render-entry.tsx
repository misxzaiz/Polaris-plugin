/**
 * 面板 SSR 渲染入口（render-verify.mjs 用，cdn-audit house 配方同构）：
 * esbuild 把 react-dom/server 与组件打进同一 bundle（单 React 实例），
 * 导出 renderPanel() 供无浏览器环境做首屏结构断言。
 */
import { renderToString } from 'react-dom/server'
import SwarmLabPanel from '../src/Panel'

export function renderPanel(): string {
  return renderToString(<SwarmLabPanel />)
}
