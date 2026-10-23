/**
 * MultiChat 面板状态管理（模块级单例，React 实例内共享）
 *
 * - sessionList：跨设备会话清单（config，轮询刷新 + 本端写透）
 * - sessionMessages：本端消息（cap.kv 缓存，打开会话时加载）
 * - 实时流：subscribeSession 订阅 chat-event，按上下文增量拼装
 *
 * 设计约束（对齐 zcode 唯一写者）：
 * - 会话清单：config 只由「发消息成功的端」更新（status/preview/messageCount）
 * - 消息体：append-only；每端读完整列表自行渲染
 */

import type { McMsg, McSessionMeta, McStoreData } from './types'
import { SESSION_PREFIX } from './types'
import {
  kvAppendMessage, kvGetMessages, kvSaveMessages,
  loadStore, saveStore, sendChat, tryLockSession, unlockSession,
} from './cap'
import { makeAssistantMsg, subscribeSession } from './stream'

interface SessionUi {
  messages: McMsg[]
}

const state = {
  sessions: [] as McSessionMeta[],
  engineId: 'claude-code',
  workspaceId: null as string | null,
  modelProfileId: null as string | null,
  loaded: false,
  loadingError: '' as string,
  /** 打开会话 → 本端消息缓存 */
  messages: new Map<string, McMsg[]>(),
  /** 发送中（running）的会话 */
  running: new Set<string>(),
  /** 订阅管理：sessionId → unsub */
  subs: new Map<string, () => void>(),
}

type Listener = () => void
const listeners = new Set<Listener>()
function notify() { listeners.forEach((l) => { try { l() } catch { /* */ } }) }

export function subscribeStore(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** 面板挂载时初始化：加载会话清单 + 订阅跨端刷新（轮询 config；Phase 1 受限于无后端变更推送） */
export async function initStore(): Promise<void> {
  if (state.loaded) return
  const store = await loadStore()
  state.sessions = store.sessions
  state.engineId = store.defaults.engineId
  state.workspaceId = store.defaults.workspaceId
  state.modelProfileId = store.defaults.modelProfileId
  state.loaded = true
  // 恢复 running 标记（其它端正在跑的会话，本端标记只读）
  for (const s of state.sessions) {
    if (s.status === 'running') state.running.add(s.id)
  }
  notify()
}

// ===== 会话清单操作 =====

export function getSessions(): McSessionMeta[] {
  return state.sessions
}

export function getSession(id: string): McSessionMeta | undefined {
  return state.sessions.find((s) => s.id === id)
}

export function isRunning(id: string): boolean {
  return state.running.has(id)
}

export function getMessages(id: string): McMsg[] {
  return state.messages.get(id) ?? []
}

export function getEngineId(): string {
  return state.engineId
}

/** 新建会话（仅登记元数据，不发消息；用户随后发首条即 start） */
export async function createSession(title: string): Promise<McSessionMeta> {
  const now = Date.now()
  const meta: McSessionMeta = {
    id: `${SESSION_PREFIX}${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) + '-' + Date.now().toString(36) : Date.now().toString(36)}`,
    title: title.trim() || `会话 ${state.sessions.length + 1}`,
    engineId: state.engineId,
    workspaceId: state.workspaceId,
    modelProfileId: state.modelProfileId,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    lastMessagePreview: '',
    engineSessionId: null,
    messageCount: 0,
  }
  await saveStore({ sessions: [...state.sessions, meta], defaults: storeDefaults() })
  state.sessions = [...state.sessions, meta]
  state.messages.set(meta.id, [])
  notify()
  return meta
}

/** 恢复会话元数据（Phase 2 用；Phase 1 直接 createSession + 发消息继续） */

// ===== 消息 =====

async function persistMessages(id: string): Promise<void> {
  const msgs = state.messages.get(id) ?? []
  await kvSaveMessages(id, msgs)
}

/** 打开会话：加载本端 kv 消息（offline view）+ 订阅实时 */
export async function openSession(id: string): Promise<void> {
  // 已订阅则跳过（避免重复）
  if (state.subs.has(id)) return
  const cached = await kvGetMessages(id)
  state.messages.set(id, cached)
  notify()

  const unsub = await subscribeSession(id, {
    onStreamDelta: (sid, text) => {
      const list = state.messages.get(sid)
      if (!list) return
      const last = list[list.length - 1]
      if (last?.streaming) {
        last.text += text
      } else {
        list.push({ role: 'assistant', text, ts: Date.now(), streaming: true })
      }
      notify()
    },
    onThinkingDelta: (_sid, _text) => { /* Phase 1 不展示 thinking */ },
    onSessionEnd: (sid, reason) => {
      const list = state.messages.get(sid)
      if (list) {
        const last = list[list.length - 1]
        if (last?.streaming) {
          last.streaming = false
          last.ts = Date.now()
        }
      }
      state.running.delete(sid)
      void unlockSession(sid, { messageCount: list?.length ?? 0 })
      // 最终消息写入 kv
      void persistMessages(sid)
      notify()
    },
    onError: (sid, error) => {
      const list = state.messages.get(sid)
      if (list) {
        // 追加一条错误 assistant 消息（不标记 streaming）
        list.push({ role: 'assistant', text: `❌ ${error}`, ts: Date.now() })
      }
      state.running.delete(sid)
      void unlockSession(sid, {})
      notify()
    },
  })
  state.subs.set(id, unsub)
}

/** 关闭会话：取消订阅（消息保留在 state/kv） */
export function closeSession(id: string): void {
  state.subs.get(id)?.()
  state.subs.delete(id)
}

/** 发送首条/续聊 */
export async function sendMessage(id: string, text: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const session = getSession(id)
  if (!session) return { ok: false, reason: '会话不存在' }
  if (state.running.has(id)) return { ok: false, reason: '会话正在运行（可能是另一设备正在发），请等待' }
  if (!text.trim()) return { ok: false, reason: '消息为空' }

  // 乐观追加用户消息
  await ensureSessionLoaded(id)
  const list = state.messages.get(id) ?? []
  list.push({ role: 'user', text, ts: Date.now() })
  await kvSaveMessagesApprox(id, list)

  // 单写者锁：标记 running（另一设备若也发，此处会拒绝）
  const lock = await tryLockSession(id, session.engineId)
  if (!lock.ok) {
    // 回滚乐观消息
    list.pop()
    await kvSaveMessagesApprox(id, list)
    notify()
    return lock
  }
  state.running.add(id)
  notify()

  // 发送
  const result = await sendChat({
    pluginSessionId: id,
    text,
    engineId: session.engineId,
    workspaceId: session.workspaceId,
    modelProfileId: session.modelProfileId,
    engineSessionId: session.engineSessionId,
  })

  if (!result.ok) {
    state.running.delete(id)
    list.push({ role: 'assistant', text: `❌ ${result.reason}`, ts: Date.now() })
    await kvSaveMessagesApprox(id, list)
    void unlockSession(id, {})
    notify()
    return result
  }

  // start 时补记引擎会话 id（后续 continue 用它）
  if (result.engineSessionId && session.engineSessionId !== result.engineSessionId) {
    session.engineSessionId = result.engineSessionId
    void persistSessionMeta(id, session)
  }

  // 确保已订阅实时（若用户未手动打开）
  if (!state.subs.has(id)) await openSession(id)
  return { ok: true }
}

async function ensureSessionLoaded(id: string): Promise<void> {
  if (!state.messages.has(id)) {
    const cached = await kvGetMessages(id)
    state.messages.set(id, cached)
  }
}

// 简易写掩码：避免频繁 IPC，网络往返时可能丢并发（Phase 1 单写者容忍）
const kvSaveMessagesApprox = kvSaveMessages

async function persistSessionMeta(id: string, meta: McSessionMeta): Promise<void> {
  const store = await loadStore()
  const list = store.sessions.map((s) => (s.id === id ? meta : s))
  await saveStore({ ...store, sessions: list })
  state.sessions = list
  notify()
}

function storeDefaults(): McStoreData['defaults'] {
  return { engineId: state.engineId, workspaceId: state.workspaceId, modelProfileId: state.modelProfileId }
}

/** 跨端被动刷新（桌面端每次打开面板时拉最新清单） */
export async function refreshSessions(): Promise<void> {
  const store = await loadStore()
  // 合并：保留本端正在运行的标记，其余覆盖
  const runningIds = new Set(state.sessions.filter((s) => s.status === 'running').map((s) => s.id))
  state.sessions = store.sessions
  state.engineId = store.defaults.engineId
  state.workspaceId = store.defaults.workspaceId
  state.modelProfileId = store.defaults.modelProfileId
  for (const s of state.sessions) {
    if (s.status === 'running') state.running.add(s.id)
  }
  notify()
}