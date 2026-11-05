/**
 * 入口：jq 查询台面板（dist/panel.js，宿主按 mod.default 加载）
 */
import JqQueryPanel from './Panel'

export default function JqQueryEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <JqQueryPanel {...props} />
}
