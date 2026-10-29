/**
 * 入口：数据备份面板（dist/panel.js，宿主按 mod.default 加载）
 */
import ArkPanel from './Panel'

export default function DataArkEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <ArkPanel {...props} />
}
