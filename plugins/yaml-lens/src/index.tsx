/**
 * yaml-lens 面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import YamlLensPanel from './Panel'

export default function YamlLensEntry(props: {
  pluginId?: string
  onSendToChat?: (m: string) => void
  initialText?: string
  initialView?: 'parse' | 'lint' | 'convert'
  initialDir?: 'y2j' | 'j2y'
}) {
  return <YamlLensPanel {...props} />
}
