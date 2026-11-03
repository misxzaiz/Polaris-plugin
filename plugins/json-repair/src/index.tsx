/**
 * LLM JSON 修复器面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import JsonRepairPanel from './Panel'

export default function JsonRepairEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <JsonRepairPanel {...props} />
}
