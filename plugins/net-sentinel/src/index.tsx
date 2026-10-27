/**
 * 入口：网哨面板（dist/panel.js，宿主按 mod.default 加载）
 */
import NetSentinelPanel from './Panel'

export default function NetSentinelEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <NetSentinelPanel {...props} />
}
