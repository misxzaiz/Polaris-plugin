/**
 * terminal-desk 面板入口 —— 宿主面板挂载点（blob loader 模板占位符纪律：禁内联 import）
 */
import TerminalDeskPanel from './Panel'

export default function TerminalDeskEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <TerminalDeskPanel {...props} />
}
