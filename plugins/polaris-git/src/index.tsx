/**
 * polaris-git 面板入口 —— 宿主面板挂载点（blob loader 模板占位符纪律：禁内联 import）
 */
import { Panel } from './components/Panel.tsx'

export default function PolarisGitEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  void props
  return <Panel />
}
