/**
 * 入口：网页监测面板（dist/panel.js，宿主按 mod.default 加载）
 */
import SentinelPanel from './Panel'

export default function PageSentinelEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <SentinelPanel {...props} />
}
