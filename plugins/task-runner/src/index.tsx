/**
 * 入口：定时任务台面板（dist/panel.js，宿主按 mod.default 加载）
 */
import TaskRunnerPanel from './Panel'

export default function TaskRunnerEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <TaskRunnerPanel {...props} />
}
