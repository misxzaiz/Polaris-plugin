/**
 * text-triage 面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import TextTriagePanel from './Panel'

export default function TextTriageEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <TextTriagePanel {...props} />
}
