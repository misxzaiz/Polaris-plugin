/**
 * 入口：灵犀灵感孵化池面板（dist/panel.js，宿主按 mod.default 加载）
 */
import LingxiPanel from './Panel'

export default function LingxiEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <LingxiPanel {...props} />
}
