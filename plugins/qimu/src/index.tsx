/**
 * 入口：启幕（AI PPT 工厂）面板（dist/panel.js，宿主按 mod.default 加载）
 */
import QimuPanel from './Panel'

export default function QimuEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <QimuPanel {...props} />
}
