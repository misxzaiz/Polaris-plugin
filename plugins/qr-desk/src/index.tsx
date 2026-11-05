/**
 * 入口：二维码工作台面板（dist/panel.js，宿主按 mod.default 加载）
 */
import QrDeskPanel from './Panel'

export default function QrDeskEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <QrDeskPanel {...props} />
}
