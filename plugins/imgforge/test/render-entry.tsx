/**
 * SSR 渲染入口（render-verify.mjs 用 esbuild 打包后 require）
 * 暴露 __imgforgeRender：panel/history/settings/work 四个渲染函数。
 */
import { renderToString } from 'react-dom/server'
import Panel from '../src/Panel'
import HistoryTab from '../src/HistoryTab'
import SettingsTab from '../src/SettingsTab'
import WorkTab from '../src/WorkTab'

const render = (el: React.ReactElement) => renderToString(el)

;(globalThis as unknown as { __imgforgeRender: unknown }).__imgforgeRender = {
  panel: (props: Record<string, unknown>) => render(<Panel {...(props as never)} />),
  history: (ctx: never) => render(<HistoryTab ctx={ctx} />),
  settings: (ctx: never) => render(<SettingsTab ctx={ctx} />),
  work: (props: { ctx: never, onSendToChat?: unknown }) => render(<WorkTab ctx={props.ctx} onSendToChat={props.onSendToChat as never} />),
}
