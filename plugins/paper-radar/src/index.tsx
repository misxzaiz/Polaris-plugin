/**
 * 入口：论文雷达面板（dist/panel.js，宿主按 mod.default 加载）
 */
import PaperRadarPanel from './Panel'

export default function PaperRadarEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <PaperRadarPanel {...props} />
}