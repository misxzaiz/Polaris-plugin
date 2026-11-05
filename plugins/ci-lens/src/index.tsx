/**
 * CI 体检台面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import CiLensPanel from './Panel'

export default function CiLensEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <CiLensPanel {...props} />
}
