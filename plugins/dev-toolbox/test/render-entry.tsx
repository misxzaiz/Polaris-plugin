// SSR 渲染入口：把面板渲染成字符串供 render-verify.mjs 断言
import { renderToString } from 'react-dom/server'
import DevToolboxPanel from '../src/Panel'

export function renderPanel(): string {
  return renderToString(<DevToolboxPanel />)
}
