/**
 * 入口：时间统计面板（dist/panel.js，宿主按 mod.default 加载）
 */
import TimeTrailPanel from './Panel'

export default function TimeTrailEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <TimeTrailPanel {...props} />
}
