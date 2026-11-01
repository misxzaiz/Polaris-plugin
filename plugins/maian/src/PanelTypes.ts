/** 各 Tab 共享的 props 契约（拆出来避免 Panel ↔ Tab 循环引用） */
import type { MaianData } from './model'

export interface TabProps {
  data: MaianData | null
  reload: () => Promise<MaianData | null>
  showToast: (msg: string, bad?: boolean, wrap?: boolean) => void
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export { type MaianData }
