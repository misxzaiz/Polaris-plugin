/**
 * 入口：文本接力面板（dist/panel.js，宿主按 mod.default 加载）
 */
import ClipRelayPanel from './Panel'

export default function ClipRelayEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <ClipRelayPanel {...props} />
}
