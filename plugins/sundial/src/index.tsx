/**
 * 入口：日程提醒面板（dist/panel.js，宿主按 mod.default 加载）
 */
import SundialPanel from './Panel'

export default function SundialEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <SundialPanel {...props} />
}
