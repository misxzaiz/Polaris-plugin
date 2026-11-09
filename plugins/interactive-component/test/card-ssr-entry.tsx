/**
 * SSR 渲染冒烟入口：card.tsx 全形态 renderToString。
 * 由 card-ssr.test.mjs 经 esbuild 打包后 import 执行。
 */
import { renderToString } from 'react-dom/server'
import InteractivePanelCard from '../src/card'

interface CardProps {
  pluginId: string
  cardId: string
  toolName: string
  mode: string
  status: string
  data: unknown
  sessionId?: string
}

export function renderCard(data: unknown, sessionId?: string): string {
  const props: CardProps = {
    pluginId: 'interactive-component',
    cardId: 'interactive-card',
    toolName: 'render_component',
    mode: 'result',
    status: 'ready',
    data,
    sessionId,
  }
  return renderToString(<InteractivePanelCard {...(props as never)} />)
}
