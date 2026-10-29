/**
 * 入口：PDF 工坊面板（dist/panel.js，宿主按 mod.default 加载）
 */
import ZhifangPanel from './Panel'

export default function ZhifangEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <ZhifangPanel {...props} />
}
