import type { ZxData } from './model'

/** 各 Tab 共享 props */
export interface TabProps {
  data: ZxData | null
  reload: () => Promise<ZxData | null>
  showToast: (msg: string, bad?: boolean, wrap?: boolean) => void
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}
