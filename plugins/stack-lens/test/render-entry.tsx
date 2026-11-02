/**
 * 渲染入口（esbuild 打包 + render-verify.mjs 断言）：react-dom/server 与面板组件
 * 打进同一 bundle（保证单 React 实例），覆盖三 Tab 骨架与空态文案。
 * SSR 下无宿主 invoke：api 调用只在事件/useEffect 里触发，首帧纯静态。
 */
import { renderToString } from 'react-dom/server'
import Panel from '../src/Panel'
import { ResolveTab, MapsTab, AboutTab } from '../src/Panel'

export function renderPanel(): string {
  return renderToString(<Panel />)
}
export function renderResolveTab(): string {
  return renderToString(<ResolveTab />)
}
export function renderMapsTab(): string {
  return renderToString(<MapsTab />)
}
export function renderAboutTab(): string {
  return renderToString(<AboutTab />)
}
