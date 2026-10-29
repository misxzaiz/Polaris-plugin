/**
 * 入口：日常记账面板（dist/panel.js，宿主按 mod.default 加载）
 */
import LedgerPanel from './Panel'

export default function PocketLedgerEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <LedgerPanel {...props} />
}
