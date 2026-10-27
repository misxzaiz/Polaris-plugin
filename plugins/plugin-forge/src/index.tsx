/**
 * 入口：插件工坊面板（dist/panel.js，宿主按 mod.default 加载）
 */
import PluginForgePanel from './Panel'

export default function PluginForgeEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <PluginForgePanel {...props} />
}
