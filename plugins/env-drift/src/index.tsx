/**
 * .env 漂移检查器面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import EnvDriftPanel from './Panel'

export default function EnvDriftEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <EnvDriftPanel {...props} />
}
