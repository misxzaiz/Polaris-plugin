/**
 * 入口：心图画布面板（dist/panel.js，宿主按 mod.default 加载）
 */
import XintuPanel from './Panel'

export default function XintuEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <XintuPanel {...props} />
}
