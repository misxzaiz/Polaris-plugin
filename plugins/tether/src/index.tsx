/**
 * 入口：人情账本面板（dist/panel.js，宿主按 mod.default 加载）
 */
import TetherPanel from './Panel'

export default function TetherEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <TetherPanel {...props} />
}
