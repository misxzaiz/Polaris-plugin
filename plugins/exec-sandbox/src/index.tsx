/**
 * 执行沙箱面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import ExecSandboxPanel from './Panel'

export default function ExecSandboxEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <ExecSandboxPanel {...props} />
}
