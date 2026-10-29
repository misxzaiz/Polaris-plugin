/**
 * 入口：续费管家（订阅与续费管家）面板（dist/panel.js，宿主按 mod.default 加载）
 */
import ShouzhaPanel from './Panel'

export default function ShouzhaEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <ShouzhaPanel {...props} />
}
