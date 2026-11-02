/**
 * 渲染入口（esbuild 打包 + render-verify.mjs 断言）：react-dom/server 与面板组件
 * 打进同一 bundle（保证单 React 实例），覆盖六 Tab 骨架与空态文案。
 * SSR 下无宿主 invoke：api 调用只在事件/useEffect 里触发，首帧纯静态。
 */
import { renderToString } from 'react-dom/server'
import Panel from '../src/Panel'
import { CheckTab, MirrorTab, SriTab, WatchTab, FindingsList } from '../src/views'

const noop = () => {}

export function renderPanel(): string {
  return renderToString(<Panel />)
}
export function renderCheckTab(): string {
  return renderToString(<CheckTab />)
}
export function renderMirrorTab(): string {
  return renderToString(<MirrorTab />)
}
export function renderSriTab(): string {
  return renderToString(<SriTab />)
}
export function renderWatchTab(): string {
  return renderToString(<WatchTab />)
}
export function renderFindingsEmpty(): string {
  return renderToString(<FindingsList findings={undefined as never} />)
}
export const _noop = noop
