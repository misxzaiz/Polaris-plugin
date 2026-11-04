/**
 * datetime-lens 面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import DateTimeLensPanel from './Panel'

export default function DateTimeLensEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void; initialText?: string }) {
  return <DateTimeLensPanel {...props} />
}
