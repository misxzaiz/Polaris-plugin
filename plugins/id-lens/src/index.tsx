/**
 * id-lens 面板入口 —— 宿主面板挂载点(blob loader 模板一律占位符化,禁内联 import)
 */
import IdLensPanel from './Panel'

export default function IdLensEntry(props: {
  pluginId?: string
  onSendToChat?: (m: string) => void
  initialText?: string
}) {
  return <IdLensPanel {...props} />
}
