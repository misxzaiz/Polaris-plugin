/**
 * MultiChat 实时流式订阅（核心）
 *
 * 订阅原始 chat-event，不依赖现有 eventRouter / conversationStore。
 * 路由依据：cap.ai.chat start/continue 的 options.context_id 由插件设为
 * `mc-<pluginSessionId>`，后端原样带回事件信封 { contextId: 'mc-<id>', payload }。
 * 插件只消费 contextId 前缀为 'mc-' 的事件 → 与现有 session- 路由零冲突。
 *
 * 单实例：所有会话共用一个 chat-event 订阅，内部按 contextId 分发到各会话。
 *
 * 竞态修复（Phase 2）：
 * - ensureGlobalListener 的 globalInitPromise 若被 reject（如宿主桥暂未就绪），
 *   先前实现会把 rejected promise 永久缓存 → 后续订阅全部卡死，AI 回复收不到。
 *   现在失败即清缓存，允许下次订阅重试。
 */

import { listenHost } from './host'
import type { ChatEnvelope, McMsg } from './types'

export interface StreamSink {
  /** 增量 token / assistant_message 文本 */
  onStreamDelta: (sessionId: string, text: string) => void
  /** 思考增量 */
  onThinkingDelta?: (sessionId: string, text: string) => void
  /** 本轮结束（session_end） */
  onSessionEnd: (sessionId: string, reason?: string) => void
  /** 错误 */
  onError: (sessionId: string, error: string) => void
}

type SessionHandler = (env: ChatEnvelope) => void

let sharedListeners: Map<string, Set<SessionHandler>> | null = null
let unlistenGlobal: (() => void) | null = null
let globalInitPromise: Promise<void> | null = null

/** 确保全局 chat-event 订阅只建立一次（宿主 listen 通道） */
function ensureGlobalListener(): Promise<void> {
  if (unlistenGlobal) return Promise.resolve()
  if (globalInitPromise) return globalInitPromise

  globalInitPromise = listenHost<ChatEnvelope>('chat-event', (env) => {
    try {
      // 只处理 mc- 前缀（其余丢给 eventRouter，天然忽略）
      const contextIdStr = env?.contextId as string | undefined
      if (!contextIdStr || !contextIdStr.startsWith('mc-')) return
      const pluginSessionId = contextIdStr.substring('mc-'.length)
      const handlers = sharedListeners?.get(pluginSessionId)
      if (!handlers || handlers.size === 0) return
      handlers.forEach((h) => {
        try { h(env) } catch { /* 单 handler 错误不阻断 */ }
      })
    } catch { /* 信封解析失败忽略 */ }
  }).then((unsub) => {
    unlistenGlobal = unsub
    return
  }).catch((err) => {
    // 关键修复：失败不缓存 rejected promise，允许下次订阅重试
    globalInitPromise = null
    throw err
  })

  return globalInitPromise
}

/**
 * 订阅某插会话的流式事件。
 * @param sessionId mc-<id>
 * @param sink 事件回调
 * @returns 取消订阅函数
 */
export async function subscribeSession(sessionId: string, sink: StreamSink): Promise<() => void> {
  await ensureGlobalListener()

  if (!sharedListeners) sharedListeners = new Map()
  let set = sharedListeners.get(sessionId)
  if (!set) {
    set = new Set()
    sharedListeners.set(sessionId, set)
  }

  const handler: SessionHandler = (env) => {
    const payload = env?.payload
    if (!payload || typeof payload !== 'object') return
    const type = payload.type as string | undefined
    const eventSessionId = (payload.sessionId as string | undefined) ?? sessionId

    switch (type) {
      case 'token': {
        const value = payload.value as string | undefined
        if (value) sink.onStreamDelta(sessionId, value)
        break
      }
      case 'thinking': {
        const content = payload.content as string | undefined
        if (content && sink.onThinkingDelta) sink.onThinkingDelta(sessionId, content)
        break
      }
      case 'assistant_message': {
        const content = payload.content as string | undefined
        // 增量（isDelta）才作为文本追加；整块补发跳过避免重复
        if (content && payload.isDelta) sink.onStreamDelta(sessionId, content)
        break
      }
      case 'session_end': {
        sink.onSessionEnd(sessionId, (payload.reason as string | undefined) ?? 'completed')
        break
      }
      case 'error': {
        const msg = (payload.content as string) || (payload.error as string) || '未知错误'
        sink.onError(sessionId, msg)
        break
      }
      default:
        // 其他事件（session_start / tool_call / usage 等）Phase 1 不消费
        break
    }
  }

  set.add(handler)
  return () => {
    const s = sharedListeners?.get(sessionId)
    if (s) {
      s.delete(handler)
      if (s.size === 0) sharedListeners?.delete(sessionId)
    }
  }
}

/** 组装一条消息（流式累积用） */
export function makeAssistantMsg(): McMsg {
  return { role: 'assistant', text: '', ts: Date.now(), streaming: true }
}
