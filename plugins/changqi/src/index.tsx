/**
 * 入口：订阅台账面板（dist/panel.js，宿主按 mod.default 加载）
 */
import ChangqiPanel from './Panel'

export default function ChangqiEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <ChangqiPanel {...props} />
}
