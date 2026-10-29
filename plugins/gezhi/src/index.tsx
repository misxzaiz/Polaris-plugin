/**
 * 入口：Excel 工坊面板（dist/panel.js，宿主按 mod.default 加载）
 */
import GezhiPanel from './Panel'

export default function GezhiEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <GezhiPanel {...props} />
}
