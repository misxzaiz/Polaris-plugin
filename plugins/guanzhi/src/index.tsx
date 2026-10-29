/**
 * 入口：书影音账本面板（dist/panel.js，宿主按 mod.default 加载）
 */
import GuanzhiPanel from './Panel'

export default function GuanzhiEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <GuanzhiPanel {...props} />
}
