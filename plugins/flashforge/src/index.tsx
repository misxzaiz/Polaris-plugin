/**
 * 入口：闪造应用作坊面板（dist/panel.js，宿主按 mod.default 加载）
 */
import FlashForgePanel from './Panel'

export default function FlashForgeEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <FlashForgePanel {...props} />
}
