/**
 * 入口：需求库面板（dist/panel.js，宿主按 mod.default 加载）
 */
import NeedsPanel from './Panel'

export default function NeedsEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <NeedsPanel {...props} />
}
