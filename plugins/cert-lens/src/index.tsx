/**
 * 入口：TLS 证书调试台面板（dist/panel.js，宿主按 mod.default 加载）
 */
import { Panel } from './Panel'

export default function CertLensEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <Panel {...props} />
}
