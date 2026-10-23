/**
 * MultiChat 插件类型定义
 *
 * 数据模型三态（Phase 2）：
 * - 会话清单：config.json plugins['multichat'].sessions —— 跨设备共享（各端连同一后端）
 * - 每会话消息：cap.kv multichat.session.<id> —— 本端加载 + 实时流走 chat-event 广播
 * - 全局默认：config.json plugins['multichat'].defaults（engineId / modelProfileId / model）
 *
 * 引擎/供应商/模型选择（Phase 2 新增）：
 * - 引擎列表：主应用 `get_engine_metadata_list` 命令（返回已注册引擎，含 available 标志）
 * - 供应商(Profile)列表：主应用 `cap.config get` → config.modelProfiles[]（含 model_options）
 * - 模型列表：选中 Profile 的 model_options；引擎为 opencode 时附加 get_opencode_models
 */

/** 跨设备会话（存 config.json plugins['multichat'].sessions） */
export interface McSessionMeta {
  id: string                 // mc-<uuid>
  title: string
  engineId: string           // 复用引擎 id（claude-code / simple-ai / open-code / custom）
  workspaceId: string | null // Phase 2 前恒 null
  modelProfileId: string | null
  /** 目标模型（透传给 cap.ai.chat options.model） */
  model: string | null
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
    model: string | null
  }
}

/** 引擎元数据（主应用 get_engine_metadata_list 返回项） */
export interface EngineMeta {
  id: string
  name: string
  description?: string
  distribution?: string
  /** 引擎是否可用（未装 CLI 等场景为 false） */
  available?: boolean
  [k: string]: unknown
}

/** 模型 Profile（cap.config get → modelProfiles[] 脱敏后形状） */
export interface ProfileInfo {
  id: string
  name: string
  /** 该供应商可选模型列表；为空时回退到 model */
  model_options?: string[] | null
  /** 目标模型名称 */
  model?: string
  /** 适用的引擎列表：空/undefined = 所有引擎；否则仅匹配所列引擎 */
  target_engines?: string[] | null
  /** 是否为激活 Profile */
  active?: boolean
  [k: string]: unknown
}

/** opencode 模型（get_opencode_models 返回项） */
export interface OpencodeModel {
  id: string
  name: string
  free: boolean
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
