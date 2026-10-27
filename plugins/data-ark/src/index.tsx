/**
 * 入口：数据方舟面板（dist/panel.js，宿主按 mod.default 加载）
 */
import ArkPanel from './Panel'

export default function DataArkEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <ArkPanel {...props} />
}
