/**
 * 入口：图片工坊面板（dist/panel.js，宿主按 mod.default 加载）
 */
import ImgforgePanel from './Panel'

export default function ImgforgeEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <ImgforgePanel {...props} />
}
