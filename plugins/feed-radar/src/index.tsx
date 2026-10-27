/**
 * 入口：订阅雷达面板（dist/panel.js，宿主按 mod.default 加载）
 */
import RadarPanel from './Panel'

export default function FeedRadarEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <RadarPanel {...props} />
}
