/**
 * URL 调试台面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import UrlLensPanel from './Panel'

export default function UrlLensEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <UrlLensPanel {...props} />
}
