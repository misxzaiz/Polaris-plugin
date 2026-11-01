/**
 * 入口：表格提取台面板（dist/panel.js，宿主按 mod.default 加载）
 */
import PdfTablesPanel from './Panel'

export default function PdfTablesEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <PdfTablesPanel {...props} />
}
