/**
 * chat-desk store.ts —— P2 骨架会话状态（插件内 zustand，缓存层）
 *
 * 事件路由（对齐 multichat 已验证的插件会话命名空间方案）：
 * - 本插件会话的 contextId 一律用 `mc-cd-<sessionId>`（mc- 前缀 = 宿主桥
 *   无条件透传的插件会话命名空间，正文流可达；与宿主 `session-` 前缀零冲突）。
 * - chat-event 订阅后按 contextId 前缀过滤，只消费本插件的会话。
 * - 轮次代际过滤（对齐宿主 spec F1）：后端信封 turnId 标识轮次；旧轮迟到的
 *   session_end/error 丢弃，防误杀新一轮流式。
 *
 * P3 等价阶段：本 store 与宿主 conversationStore 的关系（替换/收敛）在 P3 评审定案。
 */
import { createStore } from 'zustand/vanilla'
import type { StoreApi } from 'zustand/vanilla'
import { aiChatDispatch, aiChatDispatchStream, subscribeChatEvent } from './bridge'
import type { ChatMessage, ChatEnvelope, ContentBlock, PendingMessage } from './types'

/** 插件会话 contextId 前缀（mc- = 宿主桥透传命名空间；cd- = chat-desk 子命名空间） */
export const CONTEXT_PREFIX = 'mc-cd-'

export interface SessionState {
  sessionId: string
  /** 后端 conversationId（首轮 start 返回；后续 continue 用） */
  conversationId: string | null
  title: string
  engineId: string
  messages: ChatMessage[]
  currentMessage: ChatMessage | null
  isStreaming: boolean
  isInterrupting: boolean
  error: string | null
  /** 轮次代际：每次发送/续聊 +1；迟到旧轮终态事件据此丢弃（spec F1） */
  turnEpoch: number
  activeTurnId: string | null
  pendingQueue: PendingMessage[]
}

export interface ChatDeskState {
  sessions: Map<string, SessionState>
  activeSessionId: string | null
  initialized: boolean
  eventUnlisten: (() => void) | null
}

export interface ChatDeskActions {
  initialize: () => void
  dispose: () => void
  createSession: (opts?: { engineId?: string; title?: string }) => string
  deleteSession: (sessionId: string) => void
  switchSession: (sessionId: string) => void
  sendMessage: (sessionId: string, text: string) => Promise<boolean>
  continueChat: (sessionId: string, prompt: string) => Promise<void>
  interrupt: (sessionId: string) => Promise<void>
}

export type ChatDeskStore = StoreApi<ChatDeskState & ChatDeskActions>

let seqCounter = 0

function newId(prefix: string): string {
  seqCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${seqCounter}`
}

function emptySession(sessionId: string, opts?: { engineId?: string; title?: string }): SessionState {
  return {
    sessionId,
    conversationId: null,
    title: opts?.title ?? '新对话',
    engineId: opts?.engineId ?? 'claude-code',
    messages: [],
    currentMessage: null,
    isStreaming: false,
    isInterrupting: false,
    error: null,
    turnEpoch: 0,
    activeTurnId: null,
    pendingQueue: [],
  }
}

/** 从 contextId 提取本插件 sessionId（仅认 mc-cd- 前缀） */
function extractSessionId(contextId: string | undefined): string | null {
  if (!contextId || !contextId.startsWith(CONTEXT_PREFIX)) return null
  return contextId.slice(CONTEXT_PREFIX.length) || null
}

function genId(_prefix?: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return newId('id')
}

/**
 * AIEvent 归约（P2 最小集）到指定会话。
 *
 * turnId 代际规则（对齐宿主 spec F1）：带 turnId 的终态事件（session_end/error）
 * 若落后于 activeTurnId → 丢弃（旧轮迟到，防误杀新轮）。
 */
function reduceEvent(session: SessionState, payload: Record<string, unknown>, turnId?: string): SessionState {
  const type = payload['type'] as string | undefined
  const isTerminal = type === 'session_end' || type === 'error'
  if (isTerminal && turnId && session.activeTurnId && turnId !== session.activeTurnId) {
    // 旧轮次迟到的终态：丢弃（新一轮已在跑）
    return session
  }
  const next: SessionState = { ...session }

  switch (type) {
    case 'session_start': {
      const base = next.currentMessage ? finishCurrent(next) : next
      const msg: ChatMessage = {
        id: genId(),
        type: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        blocks: [],
        isStreaming: true,
      }
      next.currentMessage = msg
      next.isStreaming = true
      next.error = null
      return next
    }
    case 'token': {
      const value = String(payload['value'] ?? '')
      if (!value) return next
      return appendToCurrent(next, { type: 'text', content: value })
    }
    case 'thinking': {
      const content = String(payload['content'] ?? '')
      if (!content) return next
      return appendToCurrent(next, { type: 'thinking', content })
    }
    case 'tool_call_start': {
      const callId = String(payload['callId'] ?? payload['call_id'] ?? genId())
      const name = String(payload['tool'] ?? payload['toolName'] ?? payload['name'] ?? '')
      let input: Record<string, unknown> = {}
      const rawInput = payload['args'] ?? payload['input']
      if (rawInput && typeof rawInput === 'object') input = rawInput as Record<string, unknown>
      const base = next.currentMessage ? next : openCurrent(next)
      const block: ContentBlock = { type: 'tool_call', callId, name, input, status: 'running' }
      const msg = base.currentMessage!
      return { ...base, currentMessage: { ...msg, blocks: [...(msg.blocks ?? []), block] } }
    }
    case 'tool_call_end': {
      const callId = String(payload['callId'] ?? payload['call_id'] ?? '')
      const outputRaw = payload['result'] ?? payload['output']
      const output = typeof outputRaw === 'string' ? outputRaw : outputRaw ? JSON.stringify(outputRaw, null, 2) : undefined
      const success = payload['success'] !== false
      if (!next.currentMessage) return next
      const msg = next.currentMessage
      const blocks = (msg.blocks ?? []).map((b) =>
        b.type === 'tool_call' && b.callId === callId
          ? { ...b, output, status: success ? ('success' as const) : ('error' as const) }
          : b,
      )
      return { ...next, currentMessage: { ...msg, blocks } }
    }
    case 'error': {
      if (next.isInterrupting) return next // 用户主动中断的 fallback error：静默
      return { ...next, error: String(payload['error'] ?? '未知错误'), isStreaming: false }
    }
    case 'session_end': {
      const finished = finishCurrent(next)
      return { ...finished, currentMessage: null, isStreaming: false, isInterrupting: false, activeTurnId: null }
    }
    default:
      // P2 忽略其余事件（usage/progress/result/user_message/...）
      return next
  }
}

/** 确保有 currentMessage（无则开新） */
function openCurrent(session: SessionState): SessionState {
  if (session.currentMessage) return session
  const msg: ChatMessage = {
    id: genId(),
    type: 'assistant',
    content: '',
    timestamp: new Date().toISOString(),
    blocks: [],
    isStreaming: true,
  }
  return { ...session, currentMessage: msg, isStreaming: true }
}

/** 向 currentMessage 追加块（文本/思考合并相邻同型块） */
function appendToCurrent(session: SessionState, block: ContentBlock): SessionState {
  const base = session.currentMessage ? session : openCurrent(session)
  const msg = base.currentMessage!
  const blocks = [...(msg.blocks ?? [])]
  const last = blocks[blocks.length - 1]
  const mergeable =
    last && last.type === block.type && (last.type === 'text' || last.type === 'thinking') &&
    (block.type === 'text' || block.type === 'thinking')
  if (mergeable) {
    blocks[blocks.length - 1] = {
      ...last,
      content: last.content + block.content,
    } as ContentBlock
  } else {
    blocks.push(block)
  }
  return { ...base, currentMessage: { ...msg, blocks } }
}

/** currentMessage 归档到 messages（合并同 id 续接，对齐宿主 finishMessage） */
function finishCurrent(session: SessionState): SessionState {
  const cur = session.currentMessage
  if (!cur) return session
  const completed: ChatMessage = {
    ...cur,
    isStreaming: false,
    timestamp: new Date().toISOString(),
    content: (cur.blocks ?? []).map((b) => (b.type === 'text' ? b.content : '')).join('').trim(),
  }
  const idx = session.messages.findIndex((m) => m.id === completed.id)
  const messages = [...session.messages]
  if (idx >= 0 && messages[idx].type === 'assistant') {
    const prev = messages[idx]
    messages[idx] = {
      ...completed,
      blocks: [...(prev.blocks ?? []), ...(completed.blocks ?? [])],
    }
  } else {
    messages.push(completed)
  }
  return { ...session, messages, currentMessage: null }
}

export const chatDeskStore = createStore<ChatDeskState & ChatDeskActions>()((set, get) => ({
  sessions: new Map(),
  activeSessionId: null,
  initialized: false,
  eventUnlisten: null,

  initialize: () => {
    if (get().initialized) return
    // 订阅 chat-event：宿主桥对 mc- 前缀信封无条件透传（multichat 既有语义），
    // 本插件只消费 mc-cd- 子命名空间（自己的会话）。
    let unlisten: (() => void) | null = null
    let disposed = false
    void subscribeChatEvent((raw) => {
      if (disposed) return
      try {
        const env = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ChatEnvelope
        const contextId = env?.contextId
        if (!contextId || !contextId.startsWith(CONTEXT_PREFIX)) return
        const payload = (env?.payload ?? {}) as Record<string, unknown>
        const sid = extractSessionId(contextId)
        if (!sid) return
        const session = get().sessions.get(sid)
        if (!session) return
        const nextSession = reduceEvent(session, payload, env?.turnId)
        if (nextSession !== session) {
          const sessions = new Map(get().sessions)
          sessions.set(sid, nextSession)
          set({ sessions })
        }
      } catch {
        // 解析失败忽略（心跳/非 JSON 帧）
      }
    }).then((fn) => {
      if (disposed) fn()
      else unlisten = fn
    })
    set({ initialized: true, eventUnlisten: () => { disposed = true; unlisten?.() } })
  },

  dispose: () => {
    get().eventUnlisten?.()
    set({ eventUnlisten: null, initialized: false })
  },

  createSession: (opts) => {
    const sessionId = newId('cds')
    const session = emptySession(sessionId, opts)
    const sessions = new Map(get().sessions)
    sessions.set(sessionId, session)
    set({ sessions, activeSessionId: sessionId })
    return sessionId
  },

  deleteSession: (sessionId) => {
    const sessions = new Map(get().sessions)
    const target = sessions.get(sessionId)
    // best-effort 后端清理（conversationId 存在时删 JSONL/消息库由宿主 cap.history delete 编排，P2 先只删本地）
    sessions.delete(sessionId)
    const remaining = Array.from(sessions.keys())
    const active = get().activeSessionId
    set({
      sessions,
      activeSessionId: active === sessionId ? (remaining[remaining.length - 1] ?? null) : active,
    })
    void target // P3：接 cap.history delete_session（宿主编排含中断+墓碑）
  },

  switchSession: (sessionId) => {
    if (!get().sessions.has(sessionId)) return
    set({ activeSessionId: sessionId })
  },

  sendMessage: async (sessionId, text) => {
    const session = get().sessions.get(sessionId)
    if (!session || session.isStreaming) return false
    const trimmed = text.trim()
    if (!trimmed) return false

    // 用户消息本地先渲染（与宿主一致：本机 addMessage，广播回显按 id 去重）
    const userMessage: ChatMessage = {
      id: genId(),
      type: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    }
    const turnId = genId('turn')
    const sessions = new Map(get().sessions)
    const withUser: SessionState = {
      ...session,
      messages: [...session.messages, userMessage],
      isStreaming: true,
      error: null,
      turnEpoch: session.turnEpoch + 1,
      activeTurnId: turnId,
    }
    sessions.set(sessionId, withUser)
    set({ sessions })

    const chatOptions = {
      contextId: `${CONTEXT_PREFIX}${sessionId}`,
      engineId: session.engineId,
      enableMcpTools: true,
    }
    try {
      if (session.conversationId) {
        await aiChatDispatchStream({
          action: 'continue',
          sessionId: session.conversationId,
          message: trimmed,
          options: chatOptions,
        })
      } else {
        const newConversationId = await aiChatDispatch<string>({
          action: 'start',
          message: trimmed,
          options: chatOptions,
        })
        const s = get().sessions.get(sessionId)
        if (s) {
          const sessions2 = new Map(get().sessions)
          sessions2.set(sessionId, { ...s, conversationId: newConversationId || null })
          set({ sessions: sessions2 })
        }
      }
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const s = get().sessions.get(sessionId)
      if (s) {
        const sessions2 = new Map(get().sessions)
        sessions2.set(sessionId, { ...s, isStreaming: false, error: msg })
        set({ sessions: sessions2 })
      }
      return false
    }
  },

  continueChat: async (sessionId, prompt) => {
    await get().sendMessage(sessionId, prompt)
  },

  interrupt: async (sessionId) => {
    const session = get().sessions.get(sessionId)
    if (!session || !session.conversationId || !session.isStreaming) return
    const sessions = new Map(get().sessions)
    sessions.set(sessionId, { ...session, isInterrupting: true })
    set({ sessions })
    try {
      await Promise.race([
        aiChatDispatch({ action: 'interrupt', sessionId: session.conversationId, engineId: session.engineId }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('interrupt invoke 超时（后端无响应）')), 8000),
        ),
      ])
      // 等待 session_end 收尾（有界；极端卡死时 P2 骨架接受 UI 停留 interrupting，
      // 5s 强制收尾对齐宿主——P3 补齐 turnEpoch 校验后一致）
      await new Promise<void>((resolve) => {
        const started = Date.now()
        const tick = () => {
          const s = get().sessions.get(sessionId)
          if (!s || !s.isStreaming || Date.now() - started > 8000) resolve()
          else setTimeout(tick, 100)
        }
        tick()
      })
    } catch (e) {
      const s = get().sessions.get(sessionId)
      if (s) {
        const sessions2 = new Map(get().sessions)
        // invoke 失败：本地强制收尾（对齐宿主 interrupt catch 分支）
        const finished = finishCurrent({ ...s, isStreaming: false })
        sessions2.set(sessionId, { ...finished, isInterrupting: false, error: e instanceof Error ? e.message : String(e) })
        set({ sessions: sessions2 })
      }
    }
  },
}))
