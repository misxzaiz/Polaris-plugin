/**
 * 入口：口袋账本面板（dist/panel.js，宿主按 mod.default 加载）
 */
import LedgerPanel from './Panel'

export default function PocketLedgerEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <LedgerPanel {...props} />
}
