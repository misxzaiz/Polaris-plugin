/** 各 Tab 共享的 props 契约（拆出来避免 Panel ↔ Tab 循环引用） */
import type { QingData } from './model'

export interface TabProps {
  data: QingData | null
  reload: () => Promise<QingData | null>
  showToast: (msg: string, bad?: boolean) => void
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export { type QingData }
