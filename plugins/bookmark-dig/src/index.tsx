/**
 * 入口：书签体检面板（dist/panel.js，宿主按 mod.default 加载）
 */
import BookmarkDigPanel from './Panel'

export default function BookmarkDigEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <BookmarkDigPanel {...props} />
}
