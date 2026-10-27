/**
 * 入口：琥珀面板（dist/panel.js，宿主按 mod.default 加载）
 */
import AmberPanel from './Panel'

export default function AmberEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <AmberPanel {...props} />
}
