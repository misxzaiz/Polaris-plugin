/**
 * 入口：SQLite 检查台面板（dist/panel.js，宿主按 mod.default 加载）
 */
import SqliteLensPanel from './Panel'

export default function SqliteLensEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <SqliteLensPanel {...props} />
}
