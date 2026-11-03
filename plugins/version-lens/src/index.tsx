/**
 * version-lens 面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import VersionLensPanel from './Panel'

export default function VersionLensEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void; initialRange?: string }) {
  return <VersionLensPanel {...props} />
}
