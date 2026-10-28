/**
 * 入口：守望台插件面板（dist/panel.js，宿主按 mod.default 加载）
 */
import WatchtowerPanel from './Panel'

export default function WatchtowerEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <WatchtowerPanel {...props} />
}