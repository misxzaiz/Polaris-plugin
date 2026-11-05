/**
 * Markdown 结构检查器面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import MarkdownLensPanel from './Panel'

export default function MarkdownLensEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <MarkdownLensPanel {...props} />
}
