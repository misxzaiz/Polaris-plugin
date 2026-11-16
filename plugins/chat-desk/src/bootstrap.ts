/**
 * chat-desk 会话域自持引导（P6：摘除宿主 useAppInit 的会话域初始化后，
 * manager/eventRouter 的装配与启动由面板模块加载时完成）。
 *
 * 反向桥（D2）：宿主 appCoreBridge 不再挂 conversationStore 实现（P6 删码）；
 * 本模块把插件内的唯一 manager 实例回挂到 __POLARIS_APP_CORE__.stores，
 * 供宿主 sessionDirectory 薄 store 动态读取投影。
 *
 * 时序安全：仅当桥上无该键时回挂——灰度中间态（宿主实现仍在）不覆盖宿主实例，
 * 避免双 manager 状态分裂（P3 教训）。
 */
import { getAppCore } from './core'
import { sessionStoreManager } from './host/conversationStore/sessionStoreManager'
import * as useActiveSession from './host/conversationStore/useActiveSession'
import { ensureEventRouterInitialized } from './host/services/eventRouter'
import * as _sessionRestoreSvc from './host/services/sessionRestore'
import * as _sessionHandoffSvc from './host/services/sessionHandoff'
import * as _aiChatDispatchSvc from './host/services/aiChatDispatch'
import * as _dispatchTaskSvc from './host/services/dispatchTaskService'
import * as _sessionArchiveSvc from './host/services/sessionArchive'
import * as _webReconnectResyncSvc from './host/services/webReconnectResync'
import * as _contextCompactHandoffSvc from './host/services/contextCompactHandoff'
import { remoteSessionFollower } from './shims/services'
// 保证 compactHandoffStore 打进 bundle 并执行全局自挂（shims 惰性代理的数据源）
import '@/host/stores/compactHandoffStore'
import { createLogger } from './logger'

const log = createLogger('chat-desk:bootstrap')

let bootstrapped = false

export function ensureChatDomainBootstrapped(): void {
  if (bootstrapped) return
  bootstrapped = true
  try {
    const core = getAppCore() as {
      stores: Record<string, unknown>
      services: Record<string, unknown>
    }

    // 1) 反向注册（仅宿主已摘除时；桥上有宿主实例则沿用，零分裂）
    if (!core.stores.sessionStoreManager) {
      core.stores.sessionStoreManager = sessionStoreManager
      core.stores.useActiveSession = useActiveSession
    }
    // 2) 服务回挂（无条件）：宿主 sessionHostApi（history-desk 的
    // __POLARIS_SESSION_API__）、QuickSwitch 续接与 sessionBus 经此工作。
    // 顶层静态 import，模块加载即同步回挂——早于任何 chrome 渲染。
    // 对话域服务整体回挂（spread 全量导出）——这些服务已随域迁出宿主，
    // shims/services 的按成员转发经此命名空间工作。
    core.services.sessionRestore = Object.assign({}, _sessionRestoreSvc)
    core.services.sessionHandoff = Object.assign({}, _sessionHandoffSvc)
    core.services.aiChatDispatch = Object.assign({}, _aiChatDispatchSvc)
    core.services.dispatchTaskService = Object.assign({}, _dispatchTaskSvc)
    core.services.sessionArchive = Object.assign({}, _sessionArchiveSvc)
    core.services.webReconnectResync = Object.assign({}, _webReconnectResyncSvc)
    core.services.contextCompactHandoff = Object.assign({}, _contextCompactHandoffSvc)

    // 2) 事件路由 + 会话域初始化（原宿主 useAppInit 子集）
    void ensureEventRouterInitialized()
    void sessionStoreManager.getState().initialize()

    // 3) 跨端会话跟随（原 main.tsx remoteSessionFollower.start()）
    try {
      ;(remoteSessionFollower as { start?: () => void }).start?.()
    } catch (e) {
      log.warn('remoteSessionFollower 启动失败（不阻塞面板）', { error: String(e) })
    }
  } catch (e) {
    // 引导失败不阻塞面板挂载（cap.session 仍可独立工作）；失败要响亮，便于断点
    log.error('chat-desk 会话域引导失败', e instanceof Error ? e : new Error(String(e)))
  }
}
