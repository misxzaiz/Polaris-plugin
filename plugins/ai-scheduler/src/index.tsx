// 搬迁改造自主仓 src/components/Scheduler（2026-11 Scheduler 域插件化迁移）
/**
 * ai-scheduler 面板入口：宿主按 mod.default 加载 dist/panel.js。
 * props 与 task-runner 同约定：{ pluginId, onSendToChat }。
 */
import { Panel } from './Panel'

export default function AiSchedulerPanel() {
  return <Panel />
}

export { Panel }
