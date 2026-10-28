/**
 * 入口：韦编面板（dist/panel.js，宿主按 mod.default 加载）
 */
import WeibianPanel from './Panel'

export default function WeibianEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <WeibianPanel {...props} />
}
