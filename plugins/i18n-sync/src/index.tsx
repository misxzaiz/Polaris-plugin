/**
 * 入口：多语言键同步台面板（dist/panel.js，宿主按 mod.default 加载并注入 props）
 */
import I18nSyncPanel from './Panel'

export default function I18nSyncEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <I18nSyncPanel {...props} />
}
