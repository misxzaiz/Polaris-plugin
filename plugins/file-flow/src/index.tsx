/**
 * 入口：文件管家面板（dist/panel.js，宿主按 mod.default 加载）
 */
import FileFlowPanel from './Panel'

export default function FileFlowEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <FileFlowPanel {...props} />
}
