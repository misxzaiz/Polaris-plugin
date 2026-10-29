/**
 * 入口：磁盘分析面板（dist/panel.js，宿主按 mod.default 加载）
 */
import DiskRadarPanel from './Panel'

export default function DiskRadarEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <DiskRadarPanel {...props} />
}
