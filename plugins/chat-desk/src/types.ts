/**
 * chat-desk types.ts —— P2 骨架最小事件/消息模型
 *
 * 只收 P2 闭环所需事件：session_start/end、token、thinking、tool_call、error、
 * usage（不计）、user_message（回显）。其余事件忽略（P3 等价阶段补齐全量归约）。
 * 字段命名与宿主 ai-runtime/event.ts 对齐（camelCase，sessionId 路由）。
 */

export type BlockStatus = 'running' | 'success' | 'error'

export interface TextBlock { type: 'text'; content: string }
export interface ThinkingBlock { type: 'thinking'; content: string; collapsed?: boolean }
export interface ToolCallBlock {
  type: 'tool_call'
  callId: string
  name: string
  input: Record<string, unknown>
  output?: string
  status: BlockStatus
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolCallBlock

export interface ChatMessage {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: string
  blocks?: ContentBlock[]
  isStreaming?: boolean
}

/** chat-event 信封（后端 EventBroadcaster 注入 seq/contextId/turnId） */
export interface ChatEnvelope {
  seq?: number
  contextId?: string
  turnId?: string
  payload: unknown
}

export interface PendingMessage {
  id: string
  text: string
  createdAt: number
}
