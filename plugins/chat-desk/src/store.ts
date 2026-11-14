/**
 * chat-desk store.ts —— P2 骨架会话状态（插件内 zustand，缓存层）
 *
 * 设计（对齐 spec §6「原样搬运、最小改动」的精神，但 P2 用精简实现）：
 * - 多会话：sessions Map（sessionId → 会话状态），activeSessionId 单写者=本插件
 * - 事件归约：chat-event（full 授权）→ 按 contextId `session-<id>` 路由 →
 *   token/thinking 追加 currentMessage、tool_call 建块、session_end 收尾
 * - 发送：cap.ai.chat start/continue（流式 ack；正文经 chat-event 回流渲染）
 * - 中断：cap.ai.chat interrupt（8s 超时兜底对齐宿主 createConversationStore）
 * - P3 等价阶段：本 store 与宿主 conversationStore 的关系（替换/共存/收敛）
 *   在 P3 spec 评审时定案；P2 先验证总线链路与渲染。
 */
import { createStore } from "zustand/vanilla"
import type { StoreApi } from 'zustand/vanilla'
import { aiChatDispatch, aiChatDispatchStream, subscribeChatEvent } from './bridge'
import type { ChatMessage, ChatEnvelope, ContentBlock, PendingMessage } from './types'

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
    pendingQueue: [],
  }
}

/** 从 contextId `session-<id>` 提取前端 sessionId */
function extractSessionId(contextId: string | undefined): string | null {
  if (!contextId) return null
  if (contextId.startsWith('session-')) return contextId.slice('session-'.length)
  return null
}

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return newId('id')
}

/** AIEvent 归约（P2 最小集）到指定会话（immutably，返回新 state 片段） */
function reduceEvent(session: SessionState, payload: Record<string, unknown>): SessionState {
  const type = payload['type'] as string | undefined
  const next: SessionState = { ...session }

  switch (type) {
    case 'session_start': {
      // 会话启动：开新流式消息（若当前已有流式则先归档）
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
      // 收尾：currentMessage 归档 + isStreaming=false（对齐宿主 finishMessage 语义）
      const finished = finishCurrent(next)
      return { ...finished, currentMessage: null, isStreaming: false, isInterrupting: false }
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
  if (last && last.type === block.type && block.type !== 'tool_call' && last.type !== 'tool_call') {
    blocks[blocks.length - 1] = {
      ...last,
      content: last.content + (block as { content: string }).content,
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
    // 订阅 chat-event（full 授权；宿主桥按调用方插件上下文裁决）
    let unlisten: (() => void) | null = null
    let disposed = false
    void subscribeChatEvent((raw) => {
      if (disposed) return
      try {
        const env = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ChatEnvelope
        const payload = (env?.payload ?? raw) as Record<string, unknown>
        if (!payload || typeof payload !== 'object') return
        const sid = extractSessionId(env?.contextId)
        if (!sid) return
        const session = get().sessions.get(sid)
        if (!session) return // 非本插件会话（宿主/其他插件）忽略
        const nextSession = reduceEvent(session, payload)
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
    const sessions = new Map(get().sessions)
    const withUser: SessionState = {
      ...session,
      messages: [...session.messages, userMessage],
      isStreaming: true,
      error: null,
    }
    sessions.set(sessionId, withUser)
    set({ sessions })

    const chatOptions = {
      contextId: `session-${sessionId}`,
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
      // 等待 session_end 收尾（有界；超时由 reduceEvent 的 session_end 兜底，
      // 极端卡死时 P2 骨架接受 UI 停留 interrupting（与宿主 5s 强收尾对齐留 P3）
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
