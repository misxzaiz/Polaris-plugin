/**
 * 入口：算盘面板（dist/panel.js，宿主按 mod.default 加载）
 */
import AbacusPanel from './Panel'

export default function AbacusEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <AbacusPanel {...props} />
}
