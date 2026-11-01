/**
 * 日志透视台面板入口（宿主按 mod.default 加载）
 */
import Panel from './Panel'

export default function LogLensEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <Panel pluginId={props.pluginId} onSendToChat={props.onSendToChat} />
}
