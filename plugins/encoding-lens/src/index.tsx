/**
 * 编码透视台面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import EncodingLensPanel from './Panel'

export default function EncodingLensEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <EncodingLensPanel {...props} />
}
