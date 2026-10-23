/**
 * MultiChat 插件类型定义
 *
 * 数据模型三态（Phase 1）：
 * - 会话清单：config.json plugins['multichat'].sessions —— 跨设备共享（各端连同一后端）
 * - 每会话消息：cap.kv multichat.session.<id> —— 本端加载 + 实时流走 chat-event 广播
 * - 全局默认：config.json plugins['multichat'].defaults（engineId 等）
 */

/** 跨设备会话（存 config.json plugins['multichat'].sessions） */
export interface McSessionMeta {
  id: string                 // mc-<uuid>
  title: string
  engineId: string           // 复用引擎 id
  workspaceId: string | null // Phase 2 前恒 null
  modelProfileId: string | null
  status: 'idle' | 'running'
  createdAt: number
  updatedAt: number
  lastMessagePreview: string
  /** 引擎真实会话 id（cap.ai.chat start/continue 返回），续聊用 */
  engineSessionId: string | null
  messageCount: number
}

/** 单条消息（本端 cap.kv 缓存，append-only） */
export interface McMsg {
  role: 'user' | 'assistant'
  text: string
  ts: number
  /** 流式中增量 token 累积（仅内存，不入 kv） */
  streaming?: boolean
}

/** 插件存储根（config.json plugins['multichat']） */
export interface McStoreData {
  sessions: McSessionMeta[]
  defaults: {
    engineId: string
    workspaceId: string | null
    modelProfileId: string | null
  }
}

/** 宿主全局通道（window.__POLARIS_HOST_INVOKE__ / __POLARIS_HOST_LISTEN__） */
interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
  __POLARIS_HOST_LISTEN__?: <T>(event: string, cb: (payload: T) => void) => Promise<() => void>
}

/** 宿主注入的面板 props（与主应用 PluginPanelComponent 对齐） */
export interface PluginPanelProps {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}

/** chat-event 信封（前端 transport 对 WS 消息解出的 payload 即此形状） */
export interface ChatEnvelope {
  contextId?: string
  payload: {
    type: string
    sessionId?: string
    content?: string
    [k: string]: unknown
  }
}

/** cap.ai.chat start/continue 返回 */
export interface CapAiAck {
  ok?: boolean
  sessionId?: string
  msgId?: string
}

/** router_dispatch 响应包裹 */
export interface RouterDispatchResponse {
  msgId: string
  ok: boolean
  result: unknown
  error: string | null
  trace: string
}

export function hostWindow(): HostGlobals & typeof globalThis {
  return window as unknown as HostGlobals & typeof globalThis
}

export const PLUGIN_ID = 'multichat'
export const SESSION_PREFIX = 'mc-'
export const KV_PREFIX = 'multichat.session.'