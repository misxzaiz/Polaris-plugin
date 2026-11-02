/**
 * 邮件调试台面板入口(宿主按 mod.default 加载)
 */
import Panel from './Panel'

export default function MailDeskEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <Panel />
}
