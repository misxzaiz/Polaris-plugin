/**
 * 入口：口袋主机面板（dist/panel.js，宿主按 mod.default 加载）
 */
import PocketHostPanel from './Panel'

export default function PocketHostEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <PocketHostPanel {...props} />
}
