/**
 * .gitignore 检查器面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import GitignoreLensPanel from './Panel'

export default function GitignoreLensEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <GitignoreLensPanel {...props} />
}
