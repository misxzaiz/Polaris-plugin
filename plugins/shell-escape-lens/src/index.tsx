/**
 * Shell 转义对照台面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import ShellEscapeLensPanel from './Panel'

export default function ShellEscapeLensEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <ShellEscapeLensPanel {...props} />
}
