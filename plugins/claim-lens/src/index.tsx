/**
 * 入口：AI 声明核验台面板（dist/panel.js，宿主按 mod.default 加载）
 */
import ClaimLensPanel from './Panel'

export default function ClaimLensEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <ClaimLensPanel {...props} />
}
