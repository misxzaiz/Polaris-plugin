/**
 * 入口：决策日志面板（dist/panel.js，宿主按 mod.default 加载）
 */
import DecisionPanel from './Panel'

export default function DecisionJournalEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <DecisionPanel {...props} />
}
