/**
 * AIEvent 最小类型面（dev-desk 只读调试器消费）。
 * 与宿主 src/types/aiEvent.ts 保持字段兼容；插件侧独立声明避免跨仓类型依赖。
 */
export type AIEvent =
  | { type: 'token'; tokenId: number; content: string; taskId?: string; sessionId?: string; [k: string]: unknown }
  | { type: 'tool_call_start'; toolId: string; name: string; params?: unknown; taskId?: string; sessionId?: string; [k: string]: unknown }
  | { type: 'tool_call_end'; toolId: string; name: string; result?: unknown; isError?: boolean; taskId?: string; sessionId?: string; [k: string]: unknown }
  | { type: 'progress'; message?: string; taskId?: string; sessionId?: string; [k: string]: unknown }
  | { type: 'result'; result?: unknown; isError?: boolean; taskId?: string; sessionId?: string; [k: string]: unknown }
  | { type: 'error'; error?: unknown; taskId?: string; sessionId?: string; [k: string]: unknown }
  | { type: 'session_start'; sessionId: string; taskId?: string; [k: string]: unknown }
  | { type: 'session_end'; sessionId: string; taskId?: string; [k: string]: unknown }
  | { type: 'user_message'; content?: unknown; sessionId?: string; taskId?: string; [k: string]: unknown }
  | { type: 'assistant_message'; content?: unknown; sessionId?: string; taskId?: string; [k: string]: unknown }
  | { type: 'task_metadata'; taskId: string; [k: string]: unknown }
  | { type: 'task_progress'; taskId: string; [k: string]: unknown }
  | { type: 'task_completed'; taskId: string; [k: string]: unknown }
  | { type: 'task_canceled'; taskId: string; [k: string]: unknown }
  | { type: string; [k: string]: unknown }
