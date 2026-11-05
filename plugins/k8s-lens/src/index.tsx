/**
 * K8s 清单体检台面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import K8sLensPanel from './Panel'

export default function K8sLensEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <K8sLensPanel {...props} />
}
