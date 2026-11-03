/**
 * 入口：蜂群实验台面板（dist/panel.js，宿主按 mod.default 加载）
 */
import SwarmLabPanel from './Panel'

export default function SwarmLabEntry(_props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  // 本面板纯本地仿真，不消费宿主注入的 props；形参保留签名以对齐宿主加载契约
  return <SwarmLabPanel />
}
