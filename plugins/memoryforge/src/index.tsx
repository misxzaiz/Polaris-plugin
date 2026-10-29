/**
 * 入口：记忆卡片面板（dist/panel.js，宿主按 mod.default 加载）
 */
import ForgePanel from './Panel'

export default function MemoryForgeEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <ForgePanel {...props} />
}
