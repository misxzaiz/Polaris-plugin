/**
 * workspace-manager 面板入口（W3 扩展）
 *
 * 默认导出保持 workspace-manager 管理面板（panelRegistry 'workspaceManager' 席位）。
 * W3：宿主 Workspace 域（QuickSwitch/搜索/创建弹窗）随本插件出仓——
 * - 宿主 TopMenuBar / App.tsx 经 slot 壳动态取本模块具名导出；
 * - chat-desk 等经 appCoreBridge components 桥消费的 Workspace 组件，
 *   由 registerUi 注入宿主桥（host uiContributions 在插件注册时调用一次）。
 */
import { WorkspaceQuickSwitch } from './host/WorkspaceQuickSwitch'
import { CreateWorkspaceModal } from './host/CreateWorkspaceModal'
import { WorkspaceSearchInput, useWorkspaceFilter } from './host/WorkspaceSearchInput'

export { default } from './Panel'
export { WorkspaceQuickSwitch, CreateWorkspaceModal, WorkspaceSearchInput, useWorkspaceFilter }

export function registerUi(host: unknown): void {
  const components = (globalThis as any).__POLARIS_APP_CORE__?.components as
    | Record<string, unknown>
    | undefined
  if (components) {
    components.WorkspaceSearchInput = WorkspaceSearchInput
    components.useWorkspaceFilter = useWorkspaceFilter
    components.CreateWorkspaceModal = CreateWorkspaceModal
  }
  void host
}
