/**
 * 入口：问灶面板（dist/panel.js，宿主按 mod.default 加载）
 */
import AskStovePanel from './Panel'

export default function AskStoveEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <AskStovePanel {...props} />
}
